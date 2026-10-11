"""Contract tests use mocked model calls; they are not live-demo evidence."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import main
from apps.api.store import Store


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "echo.db")))
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    monkeypatch.setattr(main.settings, "model_daily_cap", 0)
    monkeypatch.setattr(main.settings, "session_daily_cap", 0)
    return TestClient(main.app), str(uuid4())


def test_connect_requires_successful_nemotron_greeting_and_persists_mission(setup, monkeypatch):
    client, session = setup
    saved = main.store.load(session)
    saved["goals"] = {"learning": "Learn Python"}
    main.store.save(session, saved)
    calls = []

    async def model(state, text, **kwargs):
        calls.append((state, kwargs))
        assert state["daily"]["mission"]["goal"] == "Learn Python"
        assert kwargs["tools"] == []
        return {"content": "Let's work on one small Python exercise."}

    monkeypatch.setattr(main, "model_turn", model)
    response = client.post("/voice/connect", json={"session_id": session, "timezone": "America/New_York"})
    assert response.status_code == 200
    result = response.json()
    assert len(calls) == 1
    assert result["provider"] == "Nebius Token Factory"
    assert result["model"].lower().startswith("nvidia/")
    assert result["verified_at"] and result["greeting"]
    assert response.headers["cache-control"] == "no-store"
    assert main.store.load(session)["daily"]["mission"]["goal"] == "Learn Python"
    assert main.store.load(str(uuid4()))["goals"] == {}


@pytest.mark.parametrize("failure", ["exception", "empty"])
def test_connect_failure_never_claims_live_or_saves_a_fake_greeting(setup, monkeypatch, failure):
    client, session = setup
    before = main.store.load(session)

    async def model(*args, **kwargs):
        if failure == "exception":
            raise RuntimeError("sensitive upstream detail")
        return {"content": ""}

    monkeypatch.setattr(main, "model_turn", model)
    response = client.post("/voice/connect", json={"session_id": session})
    assert response.status_code == 503 and response.json()["limited"] == "offline"
    assert "verified_at" not in response.text and "sensitive" not in response.text
    after = main.store.load(session)
    assert after["goals"] == before["goals"] and after["history"] == before["history"]


def test_connect_missing_key_budget_and_busy_are_explicit(setup, monkeypatch):
    client, session = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "")
    assert client.post("/voice/connect", json={"session_id": session}).status_code == 503
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    monkeypatch.setattr(main, "allow_model", lambda session: False)
    assert client.post("/voice/connect", json={"session_id": session}).status_code == 429


def test_over_budget_session_still_opens_without_the_model(setup, monkeypatch):
    client, session = setup
    saved = main.store.load(session)
    saved["goals"] = {"learning": "Learn Python"}
    main.store.save(session, saved)
    calls = []

    async def model(*args, **kwargs):
        calls.append(1)
        return {"content": "should not be called"}

    monkeypatch.setattr(main, "model_turn", model)
    monkeypatch.setattr(main, "allow_model", lambda session: False)
    response = client.post("/voice/connect", json={"session_id": session})
    assert response.status_code == 429
    body = response.json()
    assert calls == []
    assert body["limited"] == "budget" and body["greeting"] == main.BUDGET_GREETING
    assert "verified_at" not in body and "model" not in body
    assert body["state"]["goals"] == {"learning": "Learn Python"}
    # The local planner still prepared today's mission, and built-in commands answer.
    assert main.store.load(session)["daily"]["mission"]["goal"] == "Learn Python"
    turn = client.post("/voice/text_turn", json={"session_id": session, "text": "recap"})
    assert "Learn Python" in turn.text


def test_refused_key_or_credit_opens_a_limited_session_with_its_own_message(setup, monkeypatch):
    client, session = setup

    async def refused(*args, **kwargs):
        raise RuntimeError("provider_rejected")

    monkeypatch.setattr(main, "model_turn", refused)
    response = client.post("/voice/connect", json={"session_id": session})
    assert response.status_code == 503
    body = response.json()
    assert body["limited"] == "credit" and body["greeting"] == main.CREDIT_MESSAGE
    assert "verified_at" not in body
    turn = client.post("/voice/text_turn", json={"session_id": session, "text": "talk to me about anything"})
    assert "Nebius refused the request" in turn.text  # its own message, not the generic error
    assert "could not finish that request" not in turn.text


def test_no_model_still_opens_a_limited_session_with_built_in_commands(setup, monkeypatch):
    client, session = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "")
    opened = client.post("/voice/connect", json={"session_id": session})
    assert opened.status_code == 503
    assert opened.json()["limited"] == "offline" and opened.json()["greeting"] == main.OFFLINE_MESSAGE
    reply = client.post("/voice/text_turn", json={"session_id": session, "text": "My goal is to learn Python"})
    assert reply.status_code == 200 and main.store.load(session)["goals"]


def test_a_limited_recheck_keeps_a_pending_confirmation(setup, monkeypatch):
    client, session = setup
    monkeypatch.setattr(main, "allow_model", lambda session: False)
    client.post("/voice/text_turn", json={"session_id": session, "text": "My goal is to learn Python"})
    client.post("/voice/text_turn", json={"session_id": session, "text": "Delete all my data"})
    assert main.store.load(session)["pending"]
    # The limited client re-checks the model before the next turn; "yes" must still delete.
    assert client.post("/voice/connect", json={"session_id": session}).json()["limited"] == "budget"
    assert main.store.load(session)["pending"]
    client.post("/voice/text_turn", json={"session_id": session, "text": "yes"})
    assert main.store.load(session)["goals"] == {}
