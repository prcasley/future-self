import base64
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import main, serve
from apps.api.store import Store


def auth(user="judge", password="open-sesame"):
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def events(response):
    return [
        (part.splitlines()[0][7:], json.loads(part.splitlines()[1][6:]))
        for part in response.text.strip().split("\n\n")
    ]


@pytest.fixture
def site(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "mediapipe" / "face_mesh").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>The Other Side</title>")
    (dist / "mediapipe" / "face_mesh" / "engine.wasm").write_bytes(b"\0asm")
    (dist / "mediapipe" / "face_mesh" / "model.binarypb").write_bytes(b"pb")
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "hosted.db")))
    monkeypatch.setattr(main.settings, "web_dist", str(dist))
    monkeypatch.setattr(main.settings, "demo_password", "open-sesame")
    monkeypatch.setattr(main.settings, "demo_open", False)
    return TestClient(serve.create_app())


def test_everything_but_the_health_check_needs_the_demo_password(site):
    for path in ("/", "/index.html", f"/api/state/{uuid4()}", "/mediapipe/face_mesh/engine.wasm"):
        response = site.get(path)
        assert response.status_code == 401, path
        assert response.headers["www-authenticate"].startswith("Basic")
    assert site.get("/", headers=auth(password="wrong")).status_code == 401
    assert site.get("/", headers=auth(user="someone")).status_code == 401
    assert site.get("/", headers={"Authorization": "Basic !!!"}).status_code == 401
    health = site.get("/api/health")
    assert health.status_code == 200 and health.json()["scope"] == "hosted-demo"


def test_one_origin_serves_the_page_the_engine_files_and_the_api(site):
    page = site.get("/", headers=auth())
    assert page.status_code == 200 and "The Other Side" in page.text
    assert page.headers["x-content-type-options"] == "nosniff"
    wasm = site.get("/mediapipe/face_mesh/engine.wasm", headers=auth())
    assert wasm.headers["content-type"] == "application/wasm"
    model = site.get("/mediapipe/face_mesh/model.binarypb", headers=auth())
    assert model.headers["content-type"] == "application/octet-stream"
    state = site.get(f"/api/state/{uuid4()}", headers=auth())
    assert state.status_code == 200 and state.json()["goals"] == {}


def test_voice_turns_stream_through_the_gate(site):
    session = str(uuid4())
    response = site.post(
        "/api/voice/text_turn",
        json={"session_id": session, "text": "My goal is to learn Python"},
        headers=auth(),
    )
    names = [name for name, _ in events(response)]
    assert names[0] == "transcript" and names[-1] == "done"
    assert main.store.load(session)["goals"]


def test_the_server_refuses_to_start_without_a_password_or_a_build(tmp_path, monkeypatch):
    monkeypatch.setattr(main.settings, "web_dist", str(tmp_path / "missing"))
    monkeypatch.setattr(main.settings, "demo_password", "x")
    with pytest.raises(RuntimeError, match="No web build"):
        serve.create_app()
    (tmp_path / "missing").mkdir()
    (tmp_path / "missing" / "index.html").write_text("ok")
    monkeypatch.setattr(main.settings, "demo_password", "")
    monkeypatch.setattr(main.settings, "demo_open", False)
    with pytest.raises(RuntimeError, match="DEMO_PASSWORD"):
        serve.create_app()
    monkeypatch.setattr(main.settings, "demo_open", True)
    assert TestClient(serve.create_app()).get("/").status_code == 200


@pytest.fixture
def budget(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "budget.db")))
    monkeypatch.setattr(main, "session_turns", type(main.session_turns)(main.session_turns.default_factory))
    calls = []

    async def model(state, text, *args, **kwargs):
        calls.append(text)
        return {"content": "Tell me more.", "tool_calls": []}

    monkeypatch.setattr(main, "model_turn", model)
    return TestClient(main.app), calls


def say(client, session, text):
    return dict(events(client.post("/voice/text_turn", json={"session_id": session, "text": text})))


def test_each_session_gets_a_daily_number_of_model_turns(budget, monkeypatch):
    client, calls = budget
    monkeypatch.setattr(main.settings, "session_daily_cap", 2)
    session, other = str(uuid4()), str(uuid4())
    assert say(client, session, "I feel stuck")["sentence"]["text"] == "Tell me more."
    assert say(client, session, "Help me think")["sentence"]["text"] == "Tell me more."
    assert say(client, session, "One more thought")["sentence"]["text"] == main.BUDGET_MESSAGE
    assert len(calls) == 2
    # Built-in commands still work, and another session has its own allowance.
    assert "Nothing saved yet" in say(client, session, "recap")["sentence"]["text"]
    assert say(client, other, "Hello")["sentence"]["text"] == "Tell me more."


def test_the_global_budget_stops_model_calls_everywhere(budget, monkeypatch):
    client, calls = budget
    monkeypatch.setattr(main.settings, "model_daily_cap", 3)
    for _ in range(3):
        main.store.log("nvidia/nemotron-3-super-120b-a12b", 100, 900, "ok")
    assert say(client, str(uuid4()), "Talk to me")["sentence"]["text"] == main.BUDGET_MESSAGE
    assert calls == []
    monkeypatch.setattr(main.settings, "nebius_api_key", "test-key")
    projection = client.post(
        "/scan/projection", json={"session_id": str(uuid4()), "ratios": {"lips": 1.5}}
    ).json()
    assert projection["runner"] == "local"


def test_local_runs_have_no_caps(budget):
    client, calls = budget
    assert main.settings.model_daily_cap == 0 and main.settings.session_daily_cap == 0
    session = str(uuid4())
    for _ in range(5):
        say(client, session, "Keep going")
    assert len(calls) == 5


def test_api_rate_limit_per_client_ip(site, monkeypatch):
    monkeypatch.setattr(main.settings, "rate_limit_per_minute", 3)
    limited = TestClient(serve.create_app())
    a = {**auth(), "X-Forwarded-For": "6.6.6.6, 1.1.1.1"}
    b = {**auth(), "X-Forwarded-For": "6.6.6.6, 2.2.2.2"}
    codes = [limited.get(f"/api/state/{uuid4()}", headers=a).status_code for _ in range(4)]
    assert all(code != 429 for code in codes[:3]) and codes[3] == 429
    blocked = limited.get(f"/api/state/{uuid4()}", headers=a)
    assert blocked.headers["retry-after"] == "60"
    # A forged left-hand entry doesn't share a bucket; the proxy-appended address decides.
    assert limited.get(f"/api/state/{uuid4()}", headers=b).status_code != 429
    # The page, static files and the health check are never counted.
    assert limited.get("/", headers=a).status_code == 200
    assert limited.get("/api/health", headers=a).status_code == 200


def test_rate_limit_is_off_unless_configured(site, monkeypatch):
    monkeypatch.setattr(main.settings, "rate_limit_per_minute", 0)
    assert not isinstance(serve.create_app(), serve.RateLimit)
