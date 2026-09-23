import asyncio
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from apps.api import main
from apps.api.store import Store, act


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "test.db")))
    return TestClient(main.app)


def events(response):
    return [
        (part.splitlines()[0][7:], json.loads(part.splitlines()[1][6:]))
        for part in response.text.strip().split("\n\n")
    ]


def test_confirmation_and_undo_persist(tmp_path):
    store = Store(str(tmp_path / "db"))
    state = store.load("a")
    act(state, "set_goal", {"domain": "body", "goal": "endurance"})
    act(state, "set_goal", {"domain": "body", "goal": "strength"})
    assert state["goals"]["body"] == "endurance"
    assert state["pending"]
    act(state, "confirm", {"yes": True})
    assert state["goals"]["body"] == "strength"
    store.save("a", state)
    restored = Store(str(tmp_path / "db")).load("a")
    act(restored, "undo", {})
    assert restored["goals"]["body"] == "endurance"
    assert store.load("b")["goals"] == {}


def test_forget_removes_recall_and_undo(tmp_path):
    state = Store(str(tmp_path / "db")).load("a")
    act(state, "remember", {"fact": "private detail"})
    state["history"] = [{"role": "user", "content": "private detail"}]
    act(state, "forget", {"fact": "private detail"})
    act(state, "confirm", {"yes": True})
    assert state["facts"] == state["history"] == state["undo"] == []


def test_failure_always_finishes_without_mutation(client, monkeypatch):
    async def fail(*args):
        raise RuntimeError("private upstream details")

    monkeypatch.setattr(main, "model_turn", fail)
    response = client.post("/voice/text_turn", json={"session_id": str(uuid4()), "text": "hello"})
    result = events(response)
    assert result[-1][0] == "done"
    assert any(name == "error" for name, _ in result)
    assert "private upstream" not in response.text


def test_tool_and_spoken_confirmation(client, monkeypatch):
    async def goal(*args):
        return {
            "tool_calls": [
                {
                    "function": {
                        "name": "set_goal",
                        "arguments": json.dumps({"domain": "career", "goal": "Build an app"}),
                    }
                }
            ]
        }

    monkeypatch.setattr(main, "model_turn", goal)
    session = str(uuid4())
    response = client.post("/voice/text_turn", json={"session_id": session, "text": "Build an app"})
    assert any(name == "tool_result" for name, _ in events(response))
    assert client.get("/state/" + session).json()["goals"]["career"] == "Build an app"
    client.post("/voice/text_turn", json={"session_id": session, "text": "Build something"})
    assert client.get("/state/" + session).json()["pending"]
    client.post("/voice/text_turn", json={"session_id": session, "text": "no"})
    assert client.get("/state/" + session).json()["pending"] is None


def test_model_cannot_confirm(client, monkeypatch):
    async def injected(*args):
        return {"tool_calls": [{"function": {"name": "confirm", "arguments": '{"yes":true}'}}]}

    monkeypatch.setattr(main, "model_turn", injected)
    result = events(client.post("/voice/text_turn", json={"session_id": str(uuid4()), "text": "do whatever"}))
    assert any(name == "error" for name, _ in result)


def test_audio_fallback_and_validation(client):
    result = events(
        client.post(
            "/voice/turn",
            data={"session_id": str(uuid4())},
            files={"audio": ("clip.wav", b"fake", "audio/wav")},
        )
    )
    assert result[0][1]["fallback"] == "browser_asr"
    assert result[-1][0] == "done"
    assert client.post("/voice/text_turn", json={"session_id": "bad", "text": "hello"}).status_code == 422


def test_new_topic_cancels_pending_even_on_provider_failure(client, monkeypatch):
    session = str(uuid4())
    state = main.store.load(session)
    act(state, "set_goal", {"domain": "career", "goal": "old"})
    act(state, "set_goal", {"domain": "career", "goal": "new"})
    main.store.save(session, state)

    async def fail(*args):
        raise RuntimeError("offline")

    monkeypatch.setattr(main, "model_turn", fail)
    client.post("/voice/text_turn", json={"session_id": session, "text": "different topic"})
    client.post("/voice/text_turn", json={"session_id": session, "text": "yes"})
    assert main.store.load(session)["goals"]["career"] == "old"


def test_upstream_stream_parses_split_tool_arguments(client, monkeypatch):
    chunks = [
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {"index": 0, "function": {"name": "set_goal", "arguments": '{"domain":'}}
                        ]
                    }
                }
            ]
        },
        {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [{"index": 0, "function": {"arguments": '"career","goal":"build"}'}}]
                    },
                    "finish_reason": "tool_calls",
                }
            ]
        },
    ]
    body = "".join("data: " + json.dumps(x) + "\n\n" for x in chunks) + "data: [DONE]\n\n"
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text=body))
    original = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: original(transport=transport, **kwargs))
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    result = asyncio.run(main.model_turn(main.store.load("test"), "hello"))
    assert json.loads(result["tool_calls"][0]["function"]["arguments"]) == {
        "domain": "career",
        "goal": "build",
    }


def test_upstream_retries_once_and_logs_attempts(client, monkeypatch):
    attempts = []

    def handler(request):
        attempts.append(1)
        return httpx.Response(503)

    original = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kwargs: original(transport=transport, **kwargs))
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-only")
    with pytest.raises(RuntimeError, match="provider_unavailable"):
        asyncio.run(main.model_turn(main.store.load("test"), "hello"))
    assert len(attempts) == 2
    assert len(main.store.ledger()) == 2
