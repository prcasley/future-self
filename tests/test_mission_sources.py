"""Tavily contract and failure tests use a fake transport; these are not live-search evidence."""
import asyncio
import json
from collections import defaultdict
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from apps.api import daily, main, mission_sources
from apps.api.store import Store, act, export_payload


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "sources.db")))
    monkeypatch.setattr(main, "locks", defaultdict(asyncio.Lock))
    monkeypatch.setattr(main, "source_locks", defaultdict(asyncio.Lock))
    monkeypatch.setattr(main.settings, "tavily_api_key", "test-key")
    session = str(uuid4())
    state = main.store.load(session)
    state["goals"] = {"learning": "Learn Python"}
    state["facts"] = ["Private memory that must not be sent"]
    daily.mission(state)
    main.store.save(session, state)
    return TestClient(main.app), session, state["daily"]["mission"]["key"]


def transport(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(mission_sources.httpx, "AsyncClient",
                        lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))


def test_missing_key_never_calls_search_and_preserves_mission(setup, monkeypatch):
    client, session, key = setup
    monkeypatch.setattr(main.settings, "tavily_api_key", "")
    transport(monkeypatch, lambda _: pytest.fail("No network call without a key"))
    before = main.store.load(session)["daily"]["mission"]
    response = client.post(f"/daily/{session}/sources", json={"mission_key": key})
    assert response.status_code == 200
    assert response.json()["research"]["status"] == "not_configured"
    assert response.json()["research"]["sources"] == []
    after = main.store.load(session)["daily"]["mission"]
    assert {k: v for k, v in after.items() if k != "research"} == before
    assert not client.get("/health").json()["sources"]["configured"]


def test_actual_request_contract_safe_links_cache_export_and_delete(setup, monkeypatch):
    client, session, key = setup
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"results": [
            {"title": "Python tutorial", "url": "https://docs.python.org/3/tutorial/"},
            {"title": "Duplicate", "url": "https://docs.python.org/3/tutorial/"},
            {"title": "Bad", "url": "javascript:alert(1)"},
            {"title": "Credentials", "url": "https://secret@evil.example"},
            {"title": "Malformed", "url": "https://[bad"},
            {"title": "No URL"}, None,
        ]})

    transport(monkeypatch, handler)
    response = client.post(f"/daily/{session}/sources", json={"mission_key": key})
    research = response.json()["research"]
    assert research["status"] == "ready"
    assert research["sources"] == [{"title": "Python tutorial", "url": "https://docs.python.org/3/tutorial/"}]
    assert str(seen[0].url) == "https://api.tavily.com/search"
    assert seen[0].headers["authorization"] == "Bearer test-key"
    body = json.loads(seen[0].content)
    assert body["query"] == "Learn Python"
    assert body["search_depth"] == "basic" and body["max_results"] == 3
    assert not body["include_answer"] and not body["include_raw_content"]
    assert "Private memory" not in seen[0].content.decode()
    assert response.headers["cache-control"] == "no-store"
    assert client.post(f"/daily/{session}/sources", json={"mission_key": key}).json()["research"] == research
    assert len(seen) == 1
    state = main.store.load(session)
    assert export_payload(state, session)["data"]["daily"]["mission"]["research"] == research
    act(state, "wipe_all_data", {})
    act(state, "confirm", {"yes": True})
    assert state["daily"]["mission"] is None


@pytest.mark.parametrize("failure", ["timeout", "401", "429", "500", "json", "schema"])
def test_search_failures_return_honest_empty_fallback(setup, monkeypatch, failure):
    client, session, key = setup

    def handler(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("private upstream detail", request=request)
        if failure == "json":
            return httpx.Response(200, text="not JSON: secret upstream detail")
        if failure == "schema":
            return httpx.Response(200, json={"unexpected": []})
        return httpx.Response(int(failure), text="secret upstream detail")

    transport(monkeypatch, handler)
    response = client.post(f"/daily/{session}/sources", json={"mission_key": key})
    assert response.status_code == 200
    assert response.json()["research"]["status"] == "unavailable"
    assert response.json()["research"]["sources"] == []
    assert "upstream detail" not in response.text
    assert main.store.load(session)["daily"]["mission"]["goal"] == "Learn Python"


def test_empty_results_are_explicit(setup, monkeypatch):
    client, session, key = setup
    transport(monkeypatch, lambda _: httpx.Response(200, json={"results": []}))
    assert client.post(f"/daily/{session}/sources", json={"mission_key": key}).json()["research"]["status"] == "empty"


def test_stale_card_is_rejected_before_network(setup, monkeypatch):
    client, session, key = setup
    transport(monkeypatch, lambda _: pytest.fail("Stale mission must not search"))
    key[2] = "Old goal"
    assert client.post(f"/daily/{session}/sources", json={"mission_key": key}).status_code == 409


@pytest.mark.parametrize("change", ["goal", "wipe", "complete"])
def test_search_does_not_overwrite_voice_changes_or_resurrect_deleted_data(setup, monkeypatch, change):
    client, session, key = setup

    async def search(*_):
        assert not main.locks[session].locked(), "Voice must remain usable during search"
        state = main.store.load(session)
        if change == "goal":
            state["goals"]["learning"] = "Learn French"
            daily.mission(state)
        elif change == "wipe":
            act(state, "wipe_all_data", {})
            act(state, "confirm", {"yes": True})
        else:
            state["daily"]["mission"]["done"] = True
        main.store.save(session, state)
        return mission_sources.result("ready", [{"title": "Test", "url": "https://example.org"}])

    monkeypatch.setattr(mission_sources, "search", search)
    response = client.post(f"/daily/{session}/sources", json={"mission_key": key})
    state = main.store.load(session)
    if change == "complete":
        assert response.status_code == 200
        assert state["daily"]["mission"]["done"]
    else:
        assert response.status_code == 409
        assert "research" not in (state["daily"]["mission"] or {})


def test_failed_search_can_retry_after_key_is_added(setup, monkeypatch):
    client, session, key = setup
    monkeypatch.setattr(main.settings, "tavily_api_key", "")
    assert client.post(f"/daily/{session}/sources", json={"mission_key": key}).json()["research"]["status"] == "not_configured"
    monkeypatch.setattr(main.settings, "tavily_api_key", "test-key")
    transport(monkeypatch, lambda _: httpx.Response(200, json={"results": [{"title": "Python", "url": "https://python.org"}]}))
    assert client.post(f"/daily/{session}/sources", json={"mission_key": key}).json()["research"]["status"] == "ready"
