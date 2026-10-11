"""Renée's voice endpoint. The TTS service is mocked; these are contract tests, not audio evidence."""

import httpx
import pytest
from fastapi.testclient import TestClient

from apps.api import main


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main.settings, "renee_tts_url", "")
    monkeypatch.setattr(main.settings, "renee_tts_key", "")
    return TestClient(main.app)


def test_not_deployed_is_explicit_and_health_says_browser(client):
    response = client.post("/voice/tts", json={"text": "Good evening."})
    assert response.status_code == 503
    assert "browser" in response.json()["detail"]
    voice = client.get("/health").json()["voice"]
    assert voice == {"name": "Renée", "accent": "British English", "engine": "browser"}


def test_forwards_to_kokoro_with_bf_emma_and_returns_audio(client, monkeypatch):
    monkeypatch.setattr(main.settings, "renee_tts_url", "https://renee.example/")
    monkeypatch.setattr(main.settings, "renee_tts_key", "secret")
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = request.read()
        return httpx.Response(200, content=b"RIFFfake", headers={"content-type": "audio/wav"})

    real = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    response = client.post("/voice/tts", json={"text": "Good evening.", "speed": 0.9})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFFfake"
    assert seen["url"] == "https://renee.example/synthesize"
    assert seen["auth"] == "Bearer secret"
    assert b'"voice":"bf_emma"' in seen["body"].replace(b" ", b"")
    assert client.get("/health").json()["voice"]["engine"] == "kokoro"


@pytest.mark.parametrize("status,ctype", [(500, "audio/wav"), (200, "application/json")])
def test_bad_upstream_falls_back_cleanly(client, monkeypatch, status, ctype):
    monkeypatch.setattr(main.settings, "renee_tts_url", "https://renee.example")
    real = httpx.AsyncClient
    transport = httpx.MockTransport(lambda r: httpx.Response(status, content=b"{}", headers={"content-type": ctype}))
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kw: real(transport=transport, **kw))
    assert client.post("/voice/tts", json={"text": "Hello."}).status_code == 503


def test_limits(client):
    assert client.post("/voice/tts", json={"text": ""}).status_code in (400, 422)
    assert client.post("/voice/tts", json={"text": "x" * 601}).status_code in (400, 422)
    assert client.post("/voice/tts", json={"text": "Hi", "speed": 3}).status_code in (400, 422)


def test_daily_voice_budget_falls_back_to_the_browser(client, monkeypatch):
    monkeypatch.setattr(main.settings, "renee_tts_url", "https://renee.example")
    monkeypatch.setattr(main.settings, "tts_daily_cap", 2)
    monkeypatch.setattr(main, "tts_today", ["", 0])
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(200, content=b"RIFFfake", headers={"content-type": "audio/wav"})

    real = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    assert [client.post("/voice/tts", json={"text": "Hi."}).status_code for _ in range(3)] == [200, 200, 429]
    assert len(calls) == 2
    assert "browser" in client.post("/voice/tts", json={"text": "Hi."}).json()["detail"]


def test_renee_service_refuses_to_start_without_a_key():
    import pathlib
    source = (pathlib.Path(__file__).parents[1] / "services" / "renee-tts" / "app.py").read_text()
    assert 'raise RuntimeError("Set RENEE_TTS_KEY' in source
    assert "hmac.compare_digest" in source
