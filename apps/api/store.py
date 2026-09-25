"""Local single-user prototype storage. No remote deployment without authentication."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import avatar, daily, otherside
from . import lab as labmod

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
        for key, value in fresh_state().items():
            state.setdefault(key, value)
        for key, value in labmod.new_lab().items():
            state["lab"].setdefault(key, value)
        for key, value in avatar.DEFAULT.items():
            state["appearance"].setdefault(key, value)
        return state

    def save(self, session, state):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO state VALUES (?,?)", (session, json.dumps(state)))

    def delete(self, session):
        """Remove everything stored for a session. The model-call ledger holds no session data."""
        with self.connect() as db:
            db.execute("DELETE FROM state WHERE id=?", (session,))

    def log(self, model, size, latency, status):
        with self.connect() as db:
            db.execute(
                "INSERT INTO ledger(model,bytes_out,latency_ms,status) VALUES (?,?,?,?)",
                (model, size, latency, status),
            )

    def calls_today(self):
        """Model calls logged since midnight UTC, for the hosted demo's daily budget."""
        with self.connect() as db:
            return db.execute("SELECT count(*) FROM ledger WHERE ts >= date('now')").fetchone()[0]

    def ledger(self):
        with self.connect() as db:
            return [dict(x) for x in db.execute("SELECT * FROM ledger ORDER BY id DESC LIMIT 30")]


def fresh_state():
    """What a brand-new session holds. Also what a session holds after "delete all my data"."""
    return {
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
        "appearance": dict(avatar.DEFAULT),
        "timezone": "UTC",
        "daily": {"mission": None, "schedule": None, "messages": []},
    }


def export_payload(state, session):
    """Everything the server stores for one session, as the user's own copy."""
    return {
        "app": "The Other Side",
        "format": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session": session,
        "note": (
            "Everything this app's server keeps for your session: goals, memories, conversation "
            "context, Lab check-ins and decisions, missions, reminders and messages, simulated sides, "
            "and your outfit and aura. Your photo is not included: it never leaves your browser."
        ),
        "data": json.loads(json.dumps(state)),
    }


def public(state):
    """Compact state for the client and the model context. Never the week-by-week detail."""
    out = {key: state[key] for key in ("goals", "facts", "panel", "pending", "revision", "side")}
    out["appearance"] = dict(state["appearance"])
    out["daily"] = state["daily"]
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
    return {key: json.loads(json.dumps(state[key])) for key in ("goals", "facts", "side", "appearance")}


def act(state, name, args, confirmed=False):
    if name == "export_data":
        # The browser downloads the file when it sees this action; nothing changes here.
        state["pending"] = None
        return (
            "Downloading everything I keep about you as a file: goals, memories, Lab data, missions "
            "and messages. Your photo isn't in it; it stays in this browser."
        )
    if name == "wipe_all_data":
        if not confirmed:
            state["pending"] = {"name": name, "args": {}}
            return (
                "Delete everything I keep about you: goals, memories, Lab data, missions, messages, "
                "and your photo in this browser? This cannot be undone. Say yes or no."
            )
        state.clear()
        state.update(fresh_state())
        # Transient flag: the voice turn deletes the stored row instead of saving, and tells the browser.
        state["wiped"] = True
        return (
            "Done. Everything I kept about you is deleted, and your photo is being removed from this "
            "browser. We can start fresh whenever you like."
        )
    if name in ("open_day", "get_mission"):
        state["pending"] = None
        state["panel"] = "goals"
        item = daily.mission(state, args.get("domain"))
        if args.get("domain") and not item:
            return "That goal isn't saved yet. Which saved goal should we work on?"
        state["revision"] += 1
        intro = "Welcome back. " if name == "open_day" and state["goals"] else ""
        return intro + daily.describe(item)
    if name == "complete_mission":
        item = daily.mission(state)
        if not item:
            return daily.describe(None)
        item["done"] = True
        state["revision"] += 1
        return (
            "Marked your mission complete from your report. What helped, and what should we change next time?"
        )
    if name == "schedule_checkin":
        answer = daily.schedule(state, args.get("time", ""))
        state["revision"] += 1
        return answer
    if name == "stop_reminders":
        if state["daily"]["schedule"]:
            state["daily"]["schedule"]["enabled"] = False
        state["revision"] += 1
        return "Daily reminders are off."
    if name == "read_messages":
        messages = state["daily"]["messages"]
        return (
            messages[-1]["text"]
            if messages
            else "No scheduled messages yet. Say remind me daily at 9 AM to choose a time."
        )
    if name == "recap":
        state["panel"] = "memory"
        goals = [f"Your {domain} goal is {goal}." for domain, goal in state["goals"].items()]
        facts = [f"You asked me to remember: {fact}." for fact in state["facts"]]
        return " ".join(goals + facts) or "Nothing saved yet. What is one goal you'd like to work toward?"
    if name == "correct_memory":
        old, new = args.get("fact"), args.get("replacement")
        if not isinstance(old, str) or not isinstance(new, str) or not new.strip():
            return "A correction needs the existing fact and its replacement."
        new = new.strip()
        if old not in state["facts"]:
            return "I could not find that exact memory. Nothing changed."
        if old == new:
            return "That memory is already up to date."
        if not confirmed:
            state["pending"] = {"name": name, "args": {"fact": old, "replacement": new}}
            return f"Replace the saved memory '{old}' with '{new}'? Say yes or no."
        state["facts"] = list(dict.fromkeys(new if fact == old else fact for fact in state["facts"]))
        state["pending"] = None
        # Stale statements must not come back through conversation, undo or generated narratives.
        state["history"] = []
        state["undo"] = []
        state["futures"] = {}
        state["side"] = None
        state["revision"] += 1
        return "Corrected that memory and cleared the old conversation context."
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
        state["daily"]["mission"] = None
        daily.mission(state)
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
    if name == "set_appearance":
        look, error = avatar.normalize(args)
        if error:
            return error
        before = dict(state["appearance"])
        after = {**before, **look}
        if after == before:
            return "That's already the look."
        state["undo"].append(snapshot(state))
        state["undo"] = state["undo"][-30:]
        state["appearance"] = after
        state["revision"] += 1
        return avatar.describe(before, after)
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
        result += " " + daily.describe(daily.mission(state, args["domain"]))
    elif name == "remember":
        if args["fact"] not in state["facts"]:
            state["facts"].append(args["fact"])
        result = "Saved that memory."
    else:
        state["facts"].remove(args["fact"])
        # Forget must also remove the fact from future model context and undo frames.
        state["history"] = []
        state["undo"] = []
        state["futures"] = {}
        state["side"] = None
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
    daily.mission(state)
    state["panel"] = "lab"
    state["revision"] += 1
    return (
        f"Logged. Tomorrow: {decision['applied']}, {decision['target_minutes']} minutes on your goal. "
        f"Why: {decision['why']}. This is a planning suggestion, not a proven capacity measure. "
        "Your mission now uses this latest target. Say what is my mission, or rate this too much, just right, or too little."
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
