"""QA regressions for the hosted judge path when no model is usable. Mocked model calls; not live evidence.

The browser re-calls /voice/connect before every turn while the session is limited (main.tsx keeps
runtimeRef false so a budget reset is noticed). These tests replay that exact request sequence.
Regression tests for two launch-review blockers, both fixed on Oct 11.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import main
from apps.api.store import Store


@pytest.fixture
def limited(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "echo.db")))
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    monkeypatch.setattr(main, "allow_model", lambda session: False)  # today's budget is used

    async def never(*args, **kwargs):
        raise AssertionError("over budget: the model must not be called")

    monkeypatch.setattr(main, "model_turn", never)
    client, session = TestClient(main.app), str(uuid4())

    def turn(text):
        # What the browser sends for each typed or spoken turn in a limited session.
        assert client.post("/voice/connect", json={"session_id": session}).json()["limited"] == "budget"
        return client.post("/voice/text_turn", json={"session_id": session, "text": text}).text

    return turn, session


def test_delete_all_my_data_confirms_in_a_limited_session(limited):
    turn, session = limited
    assert "15-minute mission" in turn("My goal is to learn Python")
    assert "Say yes or no" in turn("Delete all my data")
    assert "Everything I kept about you is deleted" in turn("yes")
    assert main.store.load(session)["goals"] == {}


def test_delete_all_my_data_confirms_without_the_extra_reconnect(limited, monkeypatch):
    """Control: the same turns without the per-turn reconnect (a live session) do delete."""
    turn, session = limited
    turn("My goal is to learn Python")
    client = TestClient(main.app)
    def say(text):
        return client.post("/voice/text_turn", json={"session_id": session, "text": text}).text

    assert "Say yes or no" in say("Delete all my data")
    assert "Everything I kept about you is deleted" in say("yes")
    assert main.store.load(session)["goals"] == {}


def test_provider_outage_still_opens_a_limited_session(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "echo.db")))
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    monkeypatch.setattr(main.settings, "model_daily_cap", 0)
    monkeypatch.setattr(main.settings, "session_daily_cap", 0)

    async def outage(*args, **kwargs):
        raise RuntimeError("provider_unavailable")

    monkeypatch.setattr(main, "model_turn", outage)
    body = TestClient(main.app).post("/voice/connect", json={"session_id": str(uuid4())}).json()
    assert body.get("limited") and body.get("state") is not None


def test_an_outage_answers_offline_and_skips_the_model_for_a_while(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "outage.db")))
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    calls = []

    async def down(*args, **kwargs):
        calls.append(1)
        main.provider_down[0] = main.time.monotonic() + main.OUTAGE_PAUSE_SECONDS
        raise RuntimeError("provider_unavailable")

    monkeypatch.setattr(main, "model_turn", down)
    client = TestClient(main.app)
    session = str(uuid4())

    def say(text):
        return client.post("/voice/text_turn", json={"session_id": session, "text": text}).text

    offline = main.json.dumps(main.OFFLINE_MESSAGE)[1:-1]  # as it appears in the SSE frame
    assert offline in say("I want to build my first app")
    assert offline in say("Tell me about my future")
    assert len(calls) == 1
