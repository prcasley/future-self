import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import main, scan
from apps.api.store import Store

RATIOS = {"faceRectangle": 1.41, "thirdsUpper": 1.12, "lips": 1.55, "jawMouth": 1.9}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "test.db")))
    return TestClient(main.app)


@pytest.mark.parametrize(
    "ratios",
    [
        {},
        {"photo": 1.2},
        {"lips": float("inf")},
        {"lips": 9.0},
        {"lips": True},
        {"lips": "1.5"},
        dict.fromkeys([*scan.KEYS, "extra"], 1.5),
    ],
)
def test_validate_refuses_anything_but_known_ratio_numbers(ratios):
    with pytest.raises(ValueError):
        scan.validate(ratios)


def test_local_projection_is_deterministic_bounded_and_side_shaped():
    ratios = scan.validate(RATIOS)
    first = scan.local(ratios, "dream")
    assert first == scan.local(ratios, "dream")
    assert [row["key"] for row in first] == ["faceRectangle", "thirdsUpper", "lips", "jawMouth"]
    for side in (*scan.SIDES, None):
        for row in scan.local(ratios, side):
            assert abs(row["future"] - row["now"]) <= row["now"] * scan.MAX_CHANGE + 1e-9
            assert 12 <= row["chance"] <= 96 and row["note"]
            assert not scan.BANNED.search(row["note"])

    def toward_phi(side):
        return sum(
            abs(row["now"] - scan.TARGETS[row["key"]]) - abs(row["future"] - scan.TARGETS[row["key"]])
            for row in scan.local(ratios, side)
        )

    assert toward_phi("dream") > toward_phi("neutral") > toward_phi("bad")
    assert sum(r["chance"] for r in scan.local(ratios, "dream")) > sum(
        r["chance"] for r in scan.local(ratios, "bad")
    )


def test_parse_clamps_model_numbers_and_rejects_bad_notes():
    ratios = scan.validate(RATIOS)
    content = "Here you go: " + json.dumps(
        {
            "rows": [
                {"key": "lips", "future": 3.2, "chance": 140, "note": "Harmony rising"},
                {"key": "jawMouth", "future": 1.7, "chance": 50, "note": "less weight, more beauty"},
                {"key": "unknown", "future": 1.6, "chance": 50, "note": "x"},
            ]
        }
    )
    rows = {row["key"]: row for row in scan.parse(content, ratios, "good")}
    assert set(rows) == set(ratios)
    assert rows["lips"]["future"] == 1.674 and rows["lips"]["chance"] == 97
    assert rows["lips"]["note"] == "Harmony rising"
    assert rows["jawMouth"]["future"] == 1.748
    assert not scan.BANNED.search(rows["jawMouth"]["note"])
    assert scan.parse("no json at all", ratios, "good") is None
    assert scan.parse('{"rows": [{"key": "nope"}]}', ratios, "good") is None


def test_projection_endpoint_without_key_is_local_and_never_calls_a_model(client, monkeypatch):
    async def never(*args, **kwargs):
        raise AssertionError("no model call without a key")

    monkeypatch.setattr(main.settings, "nebius_api_key", "")
    monkeypatch.setattr(main, "model_turn", never)
    response = client.post(
        "/scan/projection", json={"session_id": str(uuid4()), "ratios": RATIOS, "side": "dream"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["runner"] == "local" and body["model"] is None and body["side"] == "dream"
    assert body["weeks"] == 52 and len(body["rows"]) == 4 and "Illustrative" in body["disclaimer"]
    assert main.store.ledger() == []


def test_projection_endpoint_uses_nemotron_when_configured(client, monkeypatch):
    seen = {}

    async def fake(state, text, tokens=None, messages=None, **kwargs):
        seen["payload"] = messages[-1]["content"]
        return {
            "content": json.dumps(
                {"rows": [{"key": "lips", "future": 1.6, "chance": 71, "note": "Φ alignment rising"}]}
            ),
            "tool_calls": [],
        }

    monkeypatch.setattr(main.settings, "nebius_api_key", "test-key")
    monkeypatch.setattr(main, "model_turn", fake)
    session = str(uuid4())
    state = main.store.load(session)
    state["side"] = "good"
    main.store.save(session, state)
    body = client.post("/scan/projection", json={"session_id": session, "ratios": RATIOS}).json()
    assert body["runner"] == "nemotron" and body["model"] == main.settings.nebius_super_model
    assert body["side"] == "good"
    lips = next(row for row in body["rows"] if row["key"] == "lips")
    assert lips["future"] == 1.6 and lips["chance"] == 71
    sent = json.loads(seen["payload"])
    assert sent["side"] == "good" and {r["key"] for r in sent["ratios"]} == set(RATIOS)
    assert set(sent) == {"side", "weeks", "ratios"}


def test_projection_endpoint_refuses_images_and_bad_input(client):
    session = str(uuid4())
    response = client.post(
        "/scan/projection",
        json={"session_id": session, "ratios": RATIOS, "photo": "data:image/png;base64,AAAA"},
    )
    assert response.status_code == 422
    response = client.post("/scan/projection", json={"session_id": session, "ratios": {"nope": 1.2}})
    assert response.status_code == 400


@pytest.mark.parametrize("error", [RuntimeError("provider_unavailable"), ValueError("bad stream json")])
def test_projection_endpoint_falls_back_when_the_model_fails(client, monkeypatch, error):
    async def broken(*args, **kwargs):
        raise error

    monkeypatch.setattr(main.settings, "nebius_api_key", "test-key")
    monkeypatch.setattr(main, "model_turn", broken)
    body = client.post(
        "/scan/projection", json={"session_id": str(uuid4()), "ratios": RATIOS, "side": "bad"}
    ).json()
    assert body["runner"] == "local" and len(body["rows"]) == 4
