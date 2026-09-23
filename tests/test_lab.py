import random
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import lab, main
from apps.api.store import Store, act


def checkin(sleep=7, energy=4, stress=2, minutes=45, done=True):
    return lab.parse_checkin(
        {
            "sleep_hours": str(sleep),
            "energy": str(energy),
            "stress": str(stress),
            "effort_minutes": str(minutes),
            "completed": "yes" if done else "no",
        }
    )


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "test.db")))
    return TestClient(main.app)


def test_parse_rejects_out_of_range_and_garbage():
    with pytest.raises(ValueError):
        lab.parse_checkin(
            {"sleep_hours": "lots", "energy": "3", "stress": "3", "effort_minutes": "10", "completed": "yes"}
        )
    with pytest.raises(ValueError):
        checkin(stress=9)
    assert checkin(sleep="6.5")["sleep_hours"] == 6.5


def test_rule_policy_reduces_on_short_sleep_and_pushes_on_streak():
    study = lab.new_lab()
    for _ in range(3):
        study["checkins"].append(checkin(sleep=5, stress=4))
    assert lab.rule_policy(lab.features(study["checkins"]))[0] == "reduce"
    study = lab.new_lab()
    for _ in range(3):
        study["checkins"].append(checkin(sleep=8, energy=5, stress=1, minutes=40))
    assert lab.rule_policy(lab.features(study["checkins"]))[0] == "push"
    study = lab.new_lab()
    study["checkins"] += [
        checkin(done=False),
        checkin(done=False),
        checkin(done=True, sleep=7, energy=3, stress=3),
    ]
    assert lab.rule_policy(lab.features(study["checkins"]))[0] == "reduce"


def test_decision_reward_and_bandit_update():
    study = lab.new_lab()
    rng = random.Random(1)
    first = lab.record_checkin(study, checkin(sleep=8, energy=5, stress=1), rng)
    assert first["applied"] in lab.INTENSITIES and first["target_minutes"] > 0
    assert first["reward"] is None
    lab.record_checkin(study, checkin(sleep=8, energy=5, stress=1, done=True), rng)
    assert study["decisions"][0]["reward"] == 1.0
    a, b = study["bandit"][study["decisions"][0]["bucket"]][study["decisions"][0]["applied"]]
    assert a == 2.0 and b == 1.0
    last = lab.rate_last(study, "too_much")
    assert last["rating"] == "too_much" and last["reward"] == 0.0
    summary = lab.summary(study)
    assert summary["decisions"] == 2 and summary["policies"]["rule"]["decisions"] == 2
    rows = lab.export_rows(study)
    assert all("note" not in r and "goal" not in r for r in rows)
    assert {r["type"] for r in rows} == {"checkin", "decision"}


def test_consent_gates_logging_and_is_confirmed(tmp_path):
    state = Store(str(tmp_path / "db")).load("a")
    args = {"sleep_hours": "6", "energy": "3", "stress": "3", "effort_minutes": "30", "completed": "yes"}
    assert act(state, "log_checkin", args).startswith("The Lab is off")
    assert act(state, "set_lab_consent", {"yes": "yes"}).startswith("Turn on the Lab?")
    assert state["pending"]["name"] == "set_lab_consent"
    act(state, "confirm", {"yes": True})
    assert state["lab"]["consent"] is True
    spoken = act(state, "log_checkin", args)
    assert spoken.startswith("Logged. Tomorrow:") and state["panel"] == "lab"
    assert act(state, "rate_intensity", {"rating": "just right"}).startswith("Noted")
    assert act(state, "wipe_lab", {}).startswith("Wipe every Lab")
    act(state, "confirm", {"yes": True})
    assert state["lab"]["checkins"] == [] and state["lab"]["consent"] is True


def test_lab_endpoints(client):
    session = str(uuid4())
    state = main.store.load(session)
    act(state, "set_goal", {"domain": "career", "goal": "learn Python"})
    state["lab"]["consent"] = True
    act(
        state,
        "log_checkin",
        {"sleep_hours": "7", "energy": "4", "stress": "2", "effort_minutes": "45", "completed": "yes"},
    )
    main.store.save(session, state)
    assert client.get(f"/lab/{session}").json()["decisions"] == 1
    table = client.get(f"/lab/{session}/experiment").json()
    assert [r["policy"] for r in table["rows"]] == ["always push", "constant", "adaptive (rule)"]
    export = client.get(f"/lab/{session}/export")
    assert (
        export.status_code == 200
        and "learn Python" not in export.text
        and '"type": "decision"' in export.text
    )
