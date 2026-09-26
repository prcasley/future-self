import base64
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from apps.api import main, portrait
from apps.api.store import Store

IMAGE = base64.b64encode(bytes.fromhex("89504e470d0a1a0a") + b"private-test-pixels").decode()


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "portrait.db")))
    monkeypatch.setattr(main, "session_turns", type(main.session_turns)(main.session_turns.default_factory))
    for key, value in {
        "nebius_api_key": "",
        "future_image_backend": "local",
        "future_image_model": "test-image-model",
        "future_image_endpoint": "https://gpu.example.test/portrait",
        "future_image_endpoint_key": "endpoint-test-key",
        "model_daily_cap": 0,
        "session_daily_cap": 0,
    }.items():
        monkeypatch.setattr(main.settings, key, value)
    calls = []

    async def fake(url, payload, key=""):
        calls.append((url, payload, key))
        if url.endswith("/chat/completions"):
            return {"choices": [{"message": {"content": json.dumps(portrait.local_brief("dream"))}}]}
        if url.endswith("/images/generations"):
            return {"data": [{"b64_json": IMAGE}]}
        return {"image_b64": IMAGE}

    monkeypatch.setattr(portrait, "post_json", fake)
    return TestClient(main.app), calls


def request(client, **overrides):
    return client.post(
        "/future/portrait", json={"session_id": str(uuid4()), "side": "dream", "consent": False, **overrides}
    )


def test_offline_brief_never_calls_or_stores(setup):
    client, calls = setup
    response = request(client, side="drift")
    assert response.status_code == 200
    assert response.json()["side"] == "neutral"
    assert response.json()["image_b64"] is None
    assert response.json()["brief_source"] == "local"
    assert response.headers["cache-control"] == "no-store"
    assert calls == [] and main.store.ledger() == []


@pytest.mark.parametrize("backend", ["local", "tokenfactory", "endpoint"])
def test_browser_config_exposes_capabilities_without_secrets(setup, monkeypatch, backend):
    client, calls = setup
    monkeypatch.setattr(main.settings, "future_image_backend", backend)
    response = client.get("/future/portrait/config")
    assert response.json() == {
        "backend": backend,
        "accepts_photo": backend == "endpoint",
        "ready": backend == "local",
    }
    assert response.headers["cache-control"] == "no-store"
    assert calls == []
    monkeypatch.setattr(main.settings, "nebius_api_key", "private-key")
    assert client.get("/future/portrait/config").json()["ready"] is True


@pytest.mark.parametrize("backend", ["local", "tokenfactory"])
def test_non_identity_backends_refuse_photos_even_with_consent(setup, monkeypatch, backend):
    client, calls = setup
    monkeypatch.setattr(main.settings, "future_image_backend", backend)
    assert request(client, consent=True, image_b64=IMAGE).status_code == 400
    assert calls == []


@pytest.mark.parametrize(
    "body",
    [
        {"consent": False, "image_b64": IMAGE},
        {"consent": True},
        {"consent": True, "image_b64": "not base64"},
        {"consent": True, "image_b64": base64.b64encode(b"not an image").decode()},
    ],
)
def test_endpoint_requires_valid_image_and_fresh_consent(setup, monkeypatch, body):
    client, calls = setup
    monkeypatch.setattr(main.settings, "future_image_backend", "endpoint")
    assert request(client, **body).status_code == 400
    assert calls == []


@pytest.mark.parametrize(
    "body",
    [
        {"side": "unknown", "image_b64": IMAGE},
        {"consent": "true", "image_b64": IMAGE},
        {"unexpected": IMAGE},
        {"image_b64": "x" * (portrait.MAX_IMAGE + 1)},
    ],
)
def test_validation_does_not_echo_input(setup, body):
    client, calls = setup
    response = request(client, **body)
    assert response.status_code == 422 and response.json() == {"detail": "Invalid portrait request"}
    assert response.headers["cache-control"] == "no-store"
    assert IMAGE not in response.text and calls == []


@pytest.mark.parametrize("backend", ["local", "tokenfactory", "endpoint"])
def test_provider_contract_and_no_persistence(setup, monkeypatch, backend):
    client, calls = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "nemotron-test-key")
    monkeypatch.setattr(main.settings, "future_image_backend", backend)
    session = str(uuid4())
    body = {"session_id": session}
    if backend == "endpoint":
        body.update(consent=True, image_b64=IMAGE)
    response = request(client, **body)
    assert response.status_code == 200
    result = response.json()
    assert result["brief_source"] == "nemotron"
    assert len(calls) == (1 if backend == "local" else 2)
    assert IMAGE not in json.dumps(calls[0])
    assert calls[0][2] == "nemotron-test-key"
    if backend == "endpoint":
        assert calls[1][1]["image_b64"] == IMAGE
        assert set(calls[1][1]) == {"prompt", "image_b64"}
        assert calls[1][2] == "endpoint-test-key"
        assert result["identity_requested"] is True
        assert request(client, session_id=session, image_b64=IMAGE).status_code == 400
    elif backend == "tokenfactory":
        assert "image_b64" not in calls[1][1]
        assert result["identity_requested"] is False
    assert IMAGE not in json.dumps(main.store.load(session))
    assert IMAGE not in json.dumps(main.store.ledger())
    assert main.store.calls_today() == len(calls)
    assert all(row["status"] == "ok" for row in main.store.ledger())


def test_budget_reserves_both_calls_before_any_network(setup, monkeypatch):
    client, calls = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "test")
    monkeypatch.setattr(main.settings, "future_image_backend", "tokenfactory")
    monkeypatch.setattr(main.settings, "model_daily_cap", 1)
    assert request(client).status_code == 429 and calls == []
    monkeypatch.setattr(main.settings, "model_daily_cap", 2)
    assert request(client).status_code == 200
    assert request(client).status_code == 429 and len(calls) == 2


def test_session_budget_includes_portraits(setup, monkeypatch):
    client, calls = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "test")
    monkeypatch.setattr(main.settings, "session_daily_cap", 1)
    session = str(uuid4())
    assert request(client, session_id=session).status_code == 200
    assert request(client, session_id=session).status_code == 429
    assert len(calls) == 1


@pytest.mark.parametrize("bad", ['{"wardrobe":"a thinner body"}', "not JSON", "[]"])
def test_invalid_model_brief_never_reaches_renderer(setup, monkeypatch, bad):
    client, calls = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "test")
    monkeypatch.setattr(main.settings, "future_image_backend", "tokenfactory")

    async def invalid(url, payload, key=""):
        calls.append(url)
        return {"choices": [{"message": {"content": bad}}]}

    monkeypatch.setattr(portrait, "post_json", invalid)
    assert request(client).status_code == 502
    assert len(calls) == 1
    assert {x["status"] for x in main.store.ledger()} == {"error", "not_sent"}


def test_endpoint_error_redacts_photo_and_never_retries(setup, monkeypatch):
    client, calls = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "test")
    monkeypatch.setattr(main.settings, "future_image_backend", "endpoint")
    original = portrait.post_json

    async def fail(url, payload, key=""):
        if url.endswith("/portrait"):
            calls.append((url, payload, key))
            raise httpx.ReadTimeout(IMAGE)
        return await original(url, payload, key)

    monkeypatch.setattr(portrait, "post_json", fail)
    response = request(client, consent=True, image_b64=IMAGE)
    assert response.status_code == 502 and IMAGE not in response.text
    assert len(calls) == 2
    assert main.store.calls_today() == 2


def test_url_only_provider_result_is_not_followed(setup, monkeypatch):
    client, calls = setup
    monkeypatch.setattr(main.settings, "nebius_api_key", "test")
    monkeypatch.setattr(main.settings, "future_image_backend", "tokenfactory")
    original = portrait.post_json

    async def url_result(url, payload, key=""):
        if url.endswith("/images/generations"):
            return {"data": [{"url": "https://unknown.example/photo"}]}
        return await original(url, payload, key)

    monkeypatch.setattr(portrait, "post_json", url_result)
    assert request(client).status_code == 502


def test_http_adapter_uses_single_post_and_no_redirects(monkeypatch):
    import asyncio

    requests = []
    real_client = httpx.AsyncClient

    def handler(req):
        requests.append(req)
        return httpx.Response(302, headers={"location": "https://another.example"})

    monkeypatch.setattr(
        portrait.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)
    )
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(portrait.post_json("https://endpoint.example", {"image_b64": IMAGE}, "test"))
    assert len(requests) == 1
