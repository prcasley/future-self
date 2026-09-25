from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from apps.api import daily, main
from apps.api.store import Store, act


def instant(value):
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)


def test_onboarding_without_provider_and_mission_persists(tmp_path, monkeypatch):
    path = str(tmp_path / "daily.db")
    monkeypatch.setattr(main, "store", Store(path))

    async def unavailable(*args, **kwargs):
        raise AssertionError("No model needed for onboarding shortcuts")

    monkeypatch.setattr(main, "model_turn", unavailable)
    session = str(uuid4())
    with TestClient(main.app) as client:

        def say(text):
            return client.post(
                "/voice/text_turn", json={"session_id": session, "text": text, "timezone": "America/New_York"}
            ).text

        assert "one goal" in say("start my day")
        assert "15 minutes" in say("My goal is to learn Python")
        assert "Marked your mission complete" in say("mission complete")
        assert "marked your" in say("start my day")
    saved = Store(path).load(session)
    assert saved["daily"]["mission"]["done"]
    assert saved["timezone"] == "America/New_York"
    assert not saved["lab"]["consent"]
    assert saved["lab"]["checkins"] == []


def test_mission_uses_lab_target_and_selected_goal(tmp_path):
    state = Store(str(tmp_path / "db")).load("a")
    state["goals"] = {"career": "Build an app", "learning": "Learn French"}
    act(state, "get_mission", {"domain": "learning"})
    state["lab"]["consent"] = True
    act(
        state,
        "log_checkin",
        {"sleep_hours": 4, "energy": 1, "stress": 5, "effort_minutes": 10, "completed": False},
    )
    item = state["daily"]["mission"]
    assert item["domain"] == "learning"
    assert item["minutes"] == state["lab"]["decisions"][-1]["target_minutes"]
    assert sum(step["minutes"] for step in item["steps"]) == item["minutes"]
    act(state, "complete_mission", {})
    assert state["daily"]["mission"]["done"]
    assert len(state["lab"]["checkins"]) == 1
    state["lab"]["consent"] = False
    assert daily.mission(state)["minutes"] == 15


def test_schedule_restart_dedup_cancel_and_no_backlog(tmp_path):
    path = str(tmp_path / "db")
    store = Store(path)
    state = store.load("a")
    state["timezone"] = "America/New_York"
    state["goals"] = {"personal": "Learn Python"}
    daily.schedule(state, "09:00", instant("2026-09-24T12:00:00"))
    assert not daily.deliver(state, instant("2026-09-24T12:59:00"))
    assert daily.deliver(state, instant("2026-09-24T13:00:00"))
    store.save("a", state)
    state = Store(path).load("a")
    assert not daily.deliver(state, instant("2026-09-24T17:00:00"))
    assert daily.deliver(state, instant("2026-09-28T17:00:00"))
    assert len(state["daily"]["messages"]) == 2
    act(state, "stop_reminders", {})
    assert not daily.deliver(state, instant("2026-09-29T17:00:00"))


def test_schedule_uses_daylight_saving_and_rejects_invalid_time(tmp_path):
    state = Store(str(tmp_path / "db")).load("a")
    state["timezone"] = "America/New_York"
    daily.schedule(state, "09:00", instant("2026-10-31T12:00:00"))
    assert daily.deliver(state, instant("2026-10-31T13:00:00"))
    assert not daily.deliver(state, instant("2026-11-01T13:00:00"))
    assert daily.deliver(state, instant("2026-11-01T14:00:00"))
    before = dict(state["daily"]["schedule"])
    daily.schedule(state, "25:00")
    assert state["daily"]["schedule"] == before
    assert daily.shortcut("remind me daily at 9") == ("schedule_checkin", {"time": "invalid"})
    assert daily.shortcut("remind me daily at 9 PM")[1]["time"] == "21:00"


def test_poll_is_session_scoped_and_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "db")))
    session = str(uuid4())
    state = main.store.load(session)
    state["daily"]["schedule"] = {"time": "00:00", "timezone": "UTC", "enabled": True, "last_date": None}
    main.store.save(session, state)
    with TestClient(main.app) as client:
        first = client.post(f"/daily/{session}/poll").json()
        second = client.post(f"/daily/{session}/poll").json()
        assert len(first["daily"]["messages"]) == 1
        assert first == second
        assert client.post(f"/daily/{uuid4()}/poll").json()["daily"]["messages"] == []


def test_spoken_goal_drops_the_leading_to_and_reads_naturally():
    assert daily.shortcut("My goal is to learn Python.") == (
        "set_goal",
        {"domain": "personal", "goal": "learn Python"},
    )
    assert daily.shortcut("my goal is run a 10k") == ("set_goal", {"domain": "personal", "goal": "run a 10k"})
    item = {"goal": "learn Python", "minutes": 15, "done": False, "steps": [{"minutes": 15, "text": "Code"}]}
    assert daily.describe(item).startswith("Here's a 15-minute mission for your goal, learn Python.")
