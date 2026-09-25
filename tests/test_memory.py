import json
from uuid import uuid4

from fastapi.testclient import TestClient

from apps.api import main
from apps.api.store import Store, act


def test_corrected_memory_survives_restart_without_stale_recall(tmp_path):
    path = str(tmp_path / "memory.db")
    store = Store(path)
    state = store.load("a")
    act(state, "remember", {"fact": "I prefer mornings"})
    state["history"] = [{"role": "user", "content": "I prefer mornings"}]
    state["futures"] = {"dream": {"narrative": "I prefer mornings"}}
    act(state, "correct_memory", {"fact": "I prefer mornings", "replacement": "I prefer evenings"})
    assert state["facts"] == ["I prefer mornings"]
    store.save("a", state)
    state = Store(path).load("a")
    assert act(state, "confirm", {"yes": True}).startswith("Corrected")
    store.save("a", state)
    restored = Store(path).load("a")
    assert restored["facts"] == ["I prefer evenings"]
    assert "mornings" not in json.dumps(restored)
    assert "evenings" in act(restored, "recap", {})
    assert act(restored, "undo", {}) == "There is nothing to undo."
    assert Store(path).load("b")["facts"] == []


def test_memory_correction_can_be_cancelled_and_rejects_missing_fact(tmp_path):
    state = Store(str(tmp_path / "memory.db")).load("a")
    act(state, "remember", {"fact": "morning"})
    act(state, "correct_memory", {"fact": "morning", "replacement": "evening"})
    act(state, "confirm", {"yes": False})
    assert state["facts"] == ["morning"]
    assert "Nothing changed" in act(state, "correct_memory", {"fact": "missing", "replacement": "new"})


def test_forgetting_clears_scenario_recall_after_restart(tmp_path):
    path = str(tmp_path / "memory.db")
    store = Store(path)
    state = store.load("a")
    act(state, "remember", {"fact": "private detail"})
    state["futures"] = {"dream": {"narrative": "private detail"}}
    state["side"] = "dream"
    act(state, "forget", {"fact": "private detail"})
    act(state, "confirm", {"yes": True})
    store.save("a", state)
    restored = Store(path).load("a")
    assert "private detail" not in json.dumps(restored)
    assert restored["side"] is None


def test_spoken_recap_works_offline_and_correction_does_not_reintroduce_old_fact(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "memory.db")))
    session = str(uuid4())
    state = main.store.load(session)
    act(state, "remember", {"fact": "morning"})
    act(state, "correct_memory", {"fact": "morning", "replacement": "evening"})
    main.store.save(session, state)

    async def unavailable(*args, **kwargs):
        raise AssertionError("Local memory operations must not call the model")

    monkeypatch.setattr(main, "model_turn", unavailable)
    with TestClient(main.app) as client:
        response = client.post("/voice/text_turn", json={"session_id": session, "text": "yes"})
        assert "Corrected" in response.text
        assert "morning" not in json.dumps(main.store.load(session))
        response = client.post(
            "/voice/text_turn", json={"session_id": session, "text": "What do you remember about me?"}
        )
        assert "evening" in response.text
        assert "event: error" not in response.text
