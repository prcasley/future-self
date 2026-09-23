"""Local single-user prototype storage. No remote deployment without authentication."""

import json
import sqlite3
from pathlib import Path

from . import lab as labmod
from . import otherside

PANELS = ("goals", "memory", "privacy", "otherside", "lab")


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
        state = json.loads(row[0]) if row else {}
        defaults = {
            "goals": {},
            "facts": [],
            "history": [],
            "undo": [],
            "pending": None,
            "panel": "goals",
            "revision": 0,
            "side": None,
            "futures": {},
            "lab": labmod.new_lab(),
        }
        for key, value in defaults.items():
            state.setdefault(key, value)
        for key, value in labmod.new_lab().items():
            state["lab"].setdefault(key, value)
        return state

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
    """Compact state for the client and the model context. Never the week-by-week detail."""
    out = {key: state[key] for key in ("goals", "facts", "panel", "pending", "revision", "side")}
    out["futures"] = {
        side: {
            "label": f["label"],
            "final": f["final"],
            "bands": f["bands"],
            "stats": f["stats"],
            "avg_curve": f["avg_curve"],
            "strain_curve": f["strain_curve"],
            "narrative": f.get("narrative"),
            "runner": f.get("runner", "local"),
        }
        for side, f in state["futures"].items()
    }
    lab = state["lab"]
    last = lab["decisions"][-1] if lab["decisions"] else None
    out["lab"] = {
        "consent": lab["consent"],
        "active": lab.get("active", "rule"),
        "checkins": len(lab["checkins"]),
        "decisions": len(lab["decisions"]),
        "last": last,
    }
    return out


def snapshot(state):
    return {key: json.loads(json.dumps(state[key])) for key in ("goals", "facts", "side")}


def act(state, name, args, confirmed=False):
    if name == "show":
        if args.get("panel") not in PANELS:
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
    if name == "cross":
        return cross(state, args)
    if name == "return_home":
        if state["side"] is None:
            return "You are already on this side."
        state["side"] = None
        state["revision"] += 1
        return "Back on this side. Today is where the curve bends."
    if name == "log_checkin":
        return log_checkin(state, args)
    if name == "rate_intensity":
        try:
            last = labmod.rate_last(
                state["lab"], (args.get("rating") or "").strip().lower().replace(" ", "_")
            )
        except ValueError as error:
            return str(error)
        state["revision"] += 1
        return f"Noted: {last['applied']} was {last['rating'].replace('_', ' ')}. The Lab learns from that."
    if name == "set_lab_consent":
        yes = str(args.get("yes", "")).strip().lower() in ("true", "yes", "1", "on")
        if yes and not state["lab"]["consent"] and not confirmed:
            state["pending"] = {"name": name, "args": {"yes": "true"}}
            return (
                "Turn on the Lab? It records your daily check-in numbers and my push, maintain or reduce "
                "decisions on this computer, for research you can export or wipe. Say yes or no."
            )
        state["pending"] = None
        state["lab"]["consent"] = yes
        state["revision"] += 1
        return (
            "The Lab is on. Check in each day and rate my calls."
            if yes
            else "The Lab is off. Nothing new will be recorded."
        )
    if name == "wipe_lab":
        if not confirmed:
            state["pending"] = {"name": name, "args": {}}
            return "Wipe every Lab check-in and decision? This cannot be undone. Say yes or no."
        state["pending"] = None
        consent = state["lab"]["consent"]
        state["lab"] = labmod.new_lab()
        state["lab"]["consent"] = consent
        state["revision"] += 1
        return "The Lab is empty."
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
    state["undo"].append(snapshot(state))
    state["undo"] = state["undo"][-30:]
    if name == "set_goal":
        state["goals"][args["domain"]] = args["goal"]
        # Goals changed: every simulated side is stale.
        state["futures"] = {}
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


def log_checkin(state, args):
    lab = state["lab"]
    if not lab["consent"]:
        return "The Lab is off. Say 'turn on the lab' first, then check in."
    try:
        checkin = labmod.parse_checkin(args)
    except ValueError as error:
        return str(error)
    decision = labmod.record_checkin(lab, checkin)
    state["panel"] = "lab"
    state["revision"] += 1
    return (
        f"Logged. Tomorrow: {decision['applied']}, {decision['target_minutes']} minutes on your goal. "
        f"Why: {decision['why']}. Say too much, just right, or too little."
    )


def cross(state, args, session="local"):
    side = (args.get("side") or "").strip().lower()
    aliases = {
        "dream": "dream",
        "good": "good",
        "neutral": "neutral",
        "bad": "bad",
        "hard": "bad",
        "drift": "neutral",
    }
    side = aliases.get(side)
    if not side:
        return "Which side? Dream, good, neutral, or bad."
    if not state["goals"]:
        return "Give me at least one goal first, then I can show you the other side."
    checkins = state["lab"]["checkins"] if state["lab"]["consent"] else []
    result = otherside.simulate(session, side, state["goals"], checkins)
    entry = otherside.summary(result)
    entry["narrative"] = None
    entry["runner"] = "local"
    entry["weeks"] = result["weeks"]
    state["futures"][side] = entry
    state["undo"].append(snapshot(state))
    state["undo"] = state["undo"][-30:]
    state["side"] = side
    state["panel"] = "otherside"
    state["revision"] += 1
    return otherside.template_narrative(result, state["goals"])
