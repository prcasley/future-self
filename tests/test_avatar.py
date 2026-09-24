import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import avatar, main
from apps.api.store import Store, act, public


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "test.db")))
    return TestClient(main.app)


def events(response):
    return [
        (part.splitlines()[0][7:], json.loads(part.splitlines()[1][6:]))
        for part in response.text.strip().split("\n\n")
    ]


@pytest.mark.parametrize(
    ("text", "look"),
    [
        ("Put on the monarch armor", {"outfit": "monarch"}),
        ("suit up", {"outfit": "monarch"}),
        ("give me the monarch look", {"outfit": "monarch"}),
        ("take off the armour", {"outfit": "casual"}),
        ("go back to casual", {"outfit": "casual"}),
        ("make my aura gold", {"aura": "gold"}),
        ("purple aura", {"aura": "violet"}),
        ("wear the monarch armor with a golden aura", {"outfit": "monarch", "aura": "gold"}),
    ],
)
def test_parse_look_changes(text, look):
    assert avatar.parse(text) == look


@pytest.mark.parametrize(
    "text",
    [
        "I want to be the monarch of my own business",
        "my goal is to learn Python",
        "show me my dream life",
        "remember that I like gold",
    ],
)
def test_parse_ignores_other_talk(text):
    assert avatar.parse(text) is None


def test_set_appearance_validates_undoes_and_is_public(tmp_path):
    state = Store(str(tmp_path / "db")).load("a")
    assert state["appearance"] == {"outfit": "casual", "aura": "cyan"}
    assert act(state, "set_appearance", {"outfit": "wizard"}).startswith("I have two outfits")
    assert act(state, "set_appearance", {"aura": "green"}).startswith("Auras come in")
    assert act(state, "set_appearance", {}).startswith("Tell me")
    spoken = act(state, "set_appearance", {"outfit": "monarch", "aura": "purple"})
    assert spoken == "Monarch armor on with a violet aura."
    assert public(state)["appearance"] == {"outfit": "monarch", "aura": "violet"}
    assert act(state, "set_appearance", {"outfit": "monarch"}) == "That's already the look."
    assert act(state, "set_appearance", {"aura": "gold"}) == "Your aura is gold now."
    act(state, "undo", {})
    assert state["appearance"] == {"outfit": "monarch", "aura": "violet"}
    act(state, "undo", {})
    assert state["appearance"] == {"outfit": "casual", "aura": "cyan"}


def test_voice_shortcut_needs_no_model_and_expires_pending(client, monkeypatch):
    async def never(*args, **kwargs):
        raise AssertionError("the model must not be called for a look change")

    monkeypatch.setattr(main, "model_turn", never)
    session = str(uuid4())
    state = main.store.load(session)
    act(state, "set_goal", {"domain": "career", "goal": "ship an app"})
    act(state, "set_goal", {"domain": "career", "goal": "ship two apps"})
    assert state["pending"]
    main.store.save(session, state)
    response = client.post(
        "/voice/text_turn", json={"session_id": session, "text": "Put on the monarch armor."}
    )
    result = events(response)
    names = [name for name, _ in result]
    assert names[-1] == "done" and "error" not in names
    call = next(data for name, data in result if name == "tool_call")
    assert call == {"name": "set_appearance", "args": {"outfit": "monarch"}}
    final = next(data for name, data in result if name == "state")
    assert final["appearance"]["outfit"] == "monarch" and final["pending"] is None
    assert main.store.load(session)["goals"]["career"] == "ship an app"


def test_model_tool_path_accepts_set_appearance(client, monkeypatch):
    async def fake(state, text, tokens=None, **kwargs):
        return {
            "content": "",
            "tool_calls": [
                {"function": {"name": "set_appearance", "arguments": json.dumps({"aura": "gold"})}}
            ],
        }

    monkeypatch.setattr(main, "model_turn", fake)
    response = client.post(
        "/voice/text_turn",
        json={"session_id": str(uuid4()), "text": "could you make me glow like the sun"},
    )
    result = events(response)
    final = next(data for name, data in result if name == "state")
    assert final["appearance"] == {"outfit": "casual", "aura": "gold"}
    spoken = next(data for name, data in result if name == "sentence")
    assert spoken["text"] == "Your aura is gold now."
