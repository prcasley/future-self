import json
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from apps.api import main
from apps.api.store import Store, act


def events(response):
    return [
        (part.splitlines()[0][7:], json.loads(part.splitlines()[1][6:]))
        for part in response.text.strip().split("\n\n")
    ]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "privacy.db")))

    async def no_model(*args, **kwargs):
        raise AssertionError("Whole-account export and wipe must not call the model")

    monkeypatch.setattr(main, "model_turn", no_model)
    return TestClient(main.app)


def seeded(session, fact="I train at 6 AM"):
    state = main.store.load(session)
    act(state, "set_goal", {"domain": "career", "goal": "ship The Other Side"})
    act(state, "remember", {"fact": fact})
    act(state, "set_appearance", {"aura": "gold"})
    state["history"] = [{"role": "user", "content": fact}]
    main.store.save(session, state)
    return state


def say(client, session, text):
    return events(client.post("/voice/text_turn", json={"session_id": session, "text": text}))


def rows(session):
    with sqlite3.connect(main.store.path) as db:
        return db.execute("SELECT count(*) FROM state WHERE id=?", (session,)).fetchone()[0]


def test_export_is_the_whole_session_as_a_download_and_nothing_else(client):
    mine, other = str(uuid4()), str(uuid4())
    seeded(mine)
    seeded(other, fact="someone else's secret")
    response = client.get(f"/export/{mine}")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert "attachment" in response.headers["content-disposition"]
    body = response.json()
    assert body["session"] == mine and body["format"] == 1
    assert "photo is not included" in body["note"]
    assert body["data"]["goals"] == {"career": "ship The Other Side"}
    assert body["data"]["facts"] == ["I train at 6 AM"]
    assert body["data"]["appearance"]["aura"] == "gold"
    assert "someone else's secret" not in response.text


@pytest.mark.parametrize("text", ["Export my data.", "download all of my data", "Give me a copy of my data"])
def test_saying_export_triggers_the_download_without_the_model(client, text):
    session = str(uuid4())
    seeded(session)
    result = say(client, session, text)
    assert ("tool_call", {"name": "export_data", "args": {}}) in result
    assert "photo isn't in it" in dict(result)["sentence"]["text"]
    assert main.store.load(session)["facts"] == ["I train at 6 AM"]


def test_delete_everything_waits_for_yes_and_no_cancels(client):
    session = str(uuid4())
    seeded(session)
    first = dict(say(client, session, "Delete all my data"))
    assert "Say yes or no" in first["sentence"]["text"]
    assert first["state"]["pending"]["name"] == "wipe_all_data"
    assert main.store.load(session)["goals"]
    cancelled = dict(say(client, session, "no"))
    assert cancelled["sentence"]["text"] == "Cancelled. Nothing changed."
    assert main.store.load(session)["facts"] == ["I train at 6 AM"]


def test_confirmed_wipe_deletes_the_row_and_tells_the_browser(client):
    session, other = str(uuid4()), str(uuid4())
    seeded(session)
    seeded(other)
    say(client, session, "forget everything about me")
    result = dict(say(client, session, "yes"))
    assert result["state"]["wiped"] is True
    assert result["state"]["goals"] == {} and result["state"]["facts"] == []
    assert "Everything I kept about you is deleted" in result["sentence"]["text"]
    assert rows(session) == 0
    assert main.store.load(session)["history"] == []
    # Another session is untouched, and the next turn starts clean without the flag.
    assert main.store.load(other)["facts"] == ["I train at 6 AM"]
    after = dict(say(client, session, "what do you remember about me"))
    assert "wiped" not in after["state"]
    assert "Nothing saved yet" in after["sentence"]["text"]


def test_a_new_topic_expires_a_pending_wipe(client, monkeypatch):
    session = str(uuid4())
    seeded(session)
    say(client, session, "wipe everything")
    say(client, session, "show me the good path")
    result = dict(say(client, session, "yes"))
    assert result["sentence"]["text"] == "There is nothing waiting for confirmation."
    assert main.store.load(session)["goals"]


@pytest.mark.parametrize(
    "text", ["wipe the lab", "clear all lab data", "delete all my goals", "forget my photo"]
)
def test_narrower_requests_are_not_a_whole_account_wipe(text):
    assert not main.WIPE_ALL.search(text.lower())


def test_the_model_can_ask_for_a_wipe_but_only_the_user_confirms(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(str(tmp_path / "model.db")))
    session = str(uuid4())
    seeded(session)

    async def model(*args, **kwargs):
        return {"content": "", "tool_calls": [{"function": {"name": "wipe_all_data", "arguments": "{}"}}]}

    monkeypatch.setattr(main, "model_turn", model)
    with TestClient(main.app) as client:
        staged = dict(say(client, session, "I want a clean slate, get rid of it all"))
        assert staged["state"]["pending"]["name"] == "wipe_all_data"
        assert main.store.load(session)["goals"]
        done = dict(say(client, session, "yes"))
        assert done["state"]["wiped"] is True
        assert rows(session) == 0
