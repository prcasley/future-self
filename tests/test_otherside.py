import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import main, otherside
from apps.api.store import Store, act, public

GOALS = {"career": "learn Python", "body": "run a 10k"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "test.db")))
    return TestClient(main.app)


def events(response):
    return [
        (part.splitlines()[0][7:], json.loads(part.splitlines()[1][6:]))
        for part in response.text.strip().split("\n\n")
    ]


def test_simulation_is_deterministic_and_ordered():
    a = otherside.simulate("s", "dream", GOALS)
    b = otherside.simulate("s", "dream", GOALS)
    assert a == b
    assert len(a["weeks"]) == 52 and set(a["final"]) == set(GOALS)
    finals = {side: otherside.simulate("s", side, GOALS)["stats"]["avg_progress"] for side in otherside.SIDES}
    assert finals["dream"] >= finals["good"] > finals["neutral"] > finals["bad"]
    assert 0 <= finals["dream"] <= 100
    assert a["disclaimer"].startswith("Scenario")


def test_adaptive_policy_burns_out_less_than_always_push():
    table = otherside.compare_policies("s", GOALS, side="good")
    rows = {r["policy"]: r for r in table["rows"]}
    assert rows["always push"]["burnout_weeks"] >= rows["adaptive (rule)"]["burnout_weeks"]
    assert rows["adaptive (rule)"]["avg_progress"] > 0


def test_template_narrative_is_grounded():
    result = otherside.simulate("s", "bad", GOALS)
    text = otherside.template_narrative(result, GOALS)
    assert "learn Python" in text and "percent" in text and "not a prediction" in text
    assert "road back" in text


def test_cross_requires_goal_then_sets_side_and_is_undoable(tmp_path):
    state = Store(str(tmp_path / "db")).load("a")
    assert act(state, "cross", {"side": "dream"}).startswith("Give me at least one goal")
    act(state, "set_goal", {"domain": "career", "goal": "learn Python"})
    spoken = act(state, "cross", {"side": "dream"})
    assert state["side"] == "dream" and state["panel"] == "otherside"
    assert "dream" in state["futures"] and "percent" in spoken
    assert "weeks" not in public(state)["futures"]["dream"]
    act(state, "undo", {})
    assert state["side"] is None
    assert act(state, "cross", {"side": "sideways"}).startswith("Which side")


def test_goal_change_invalidates_futures(tmp_path):
    state = Store(str(tmp_path / "db")).load("a")
    act(state, "set_goal", {"domain": "career", "goal": "learn Python"})
    act(state, "cross", {"side": "good"})
    act(state, "set_goal", {"domain": "mind", "goal": "read weekly"})
    assert state["futures"] == {}


def test_cross_turn_streams_narrative_and_return_home(client, monkeypatch):
    async def cross(*args, **kwargs):
        return {"tool_calls": [{"function": {"name": "cross", "arguments": json.dumps({"side": "good"})}}]}

    async def narrate(state, side):
        state["futures"][side]["narrative"] = (
            "Spoken from the good path, grounded in the numbers, for at least forty characters."
        )
        return state["futures"][side]["narrative"]

    monkeypatch.setattr(main, "model_turn", cross)
    monkeypatch.setattr(main, "narrate", narrate)
    session = str(uuid4())
    state = main.store.load(session)
    act(state, "set_goal", {"domain": "career", "goal": "learn Python"})
    main.store.save(session, state)
    result = events(
        client.post("/voice/text_turn", json={"session_id": session, "text": "show me the good path"})
    )
    spoken = [d["text"] for n, d in result if n == "sentence"][0]
    assert spoken.startswith("Spoken from the good path")
    assert client.get("/state/" + session).json()["side"] == "good"
    detail = client.get("/otherside/" + session).json()
    assert len(detail["futures"]["good"]["weeks"]) == 52
    result = events(client.post("/voice/text_turn", json={"session_id": session, "text": "come back"}))
    assert client.get("/state/" + session).json()["side"] is None
    assert result[-1][0] == "done"
