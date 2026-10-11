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
    assert response.status_code == 503
    assert "verified_at" not in response.text and "sensitive" not in response.text
    assert main.store.load(session) == before


def test_connect_missing_key_budget_and_busy_are_explicit(setup, monkeypatch):
    client, session = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "")
    assert client.post("/voice/connect", json={"session_id": session}).status_code == 503
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    monkeypatch.setattr(main, "allow_model", lambda session: False)
    assert client.post("/voice/connect", json={"session_id": session}).status_code == 429
