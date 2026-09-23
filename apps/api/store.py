"""Local single-user prototype storage. No remote deployment without authentication."""

import json
import sqlite3
from pathlib import Path


class Store:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, model TEXT,
                    bytes_out INTEGER, latency_ms INTEGER, status TEXT,
                    ts TEXT DEFAULT CURRENT_TIMESTAMP);
            """)

    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        return db

    def load(self, session):
        with self.connect() as db:
            row = db.execute("SELECT data FROM state WHERE id=?", (session,)).fetchone()
        return (
            json.loads(row[0])
            if row
            else {
                "goals": {},
                "facts": [],
                "history": [],
                "undo": [],
                "pending": None,
                "panel": "goals",
                "revision": 0,
            }
        )

    def save(self, session, state):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO state VALUES (?,?)", (session, json.dumps(state)))

    def log(self, model, size, latency, status):
        with self.connect() as db:
            db.execute(
                "INSERT INTO ledger(model,bytes_out,latency_ms,status) VALUES (?,?,?,?)",
                (model, size, latency, status),
            )

    def ledger(self):
        with self.connect() as db:
            return [dict(x) for x in db.execute("SELECT * FROM ledger ORDER BY id DESC LIMIT 30")]


def public(state):
    return {key: state[key] for key in ("goals", "facts", "panel", "pending", "revision")}


def act(state, name, args, confirmed=False):
    if name == "show":
        if args.get("panel") not in ("goals", "memory", "privacy"):
            return "That panel is not available yet."
        state["panel"] = args["panel"]
        return f"Showing {state['panel']}."
    if name == "undo":
        state["pending"] = None
        if not state["undo"]:
            return "There is nothing to undo."
        before = state["undo"].pop()
        state.update(before)
        state["revision"] += 1
        return "Undid the last change."
    if name == "confirm":
        pending, state["pending"] = state["pending"], None
        if not pending:
            return "There is nothing waiting for confirmation."
        if not args.get("yes"):
            return "Cancelled. Nothing changed."
        return act(state, pending["name"], pending["args"], confirmed=True)
    if name not in ("set_goal", "remember", "forget"):
        return "That action is not available yet."
    if name == "set_goal" and (not args.get("domain") or not args.get("goal")):
        return "A goal needs a domain and a description."
    if name in ("remember", "forget") and not args.get("fact"):
        return "Tell me the exact fact first."
    if name == "forget" and args["fact"] not in state["facts"]:
        return "I could not find that exact memory. Nothing changed."
    destructive = name == "forget" or (name == "set_goal" and args["domain"] in state["goals"])
    if destructive and not confirmed:
        state["pending"] = {"name": name, "args": args}
        label = (
            f"replace your {args['domain']} goal with {args['goal']}"
            if name == "set_goal"
            else f"forget: {args['fact']}"
        )
        return f"Should I {label}? Say yes or no."
    state["pending"] = None
    state["undo"].append({key: json.loads(json.dumps(state[key])) for key in ("goals", "facts")})
    state["undo"] = state["undo"][-30:]
    if name == "set_goal":
        state["goals"][args["domain"]] = args["goal"]
        result = f"Set your {args['domain']} goal: {args['goal']}."
    elif name == "remember":
        if args["fact"] not in state["facts"]:
            state["facts"].append(args["fact"])
        result = "Saved that memory."
    else:
        state["facts"].remove(args["fact"])
        # Forget must also remove the fact from future model context and undo frames.
        state["history"] = []
        state["undo"] = []
        result = "Forgot that memory and cleared the conversation context."
    state["revision"] += 1
    return result
