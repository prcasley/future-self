"""Local daily plans and in-app check-ins. No background push or claims of efficacy."""

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def today(state, now=None):
    return (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(state.get("timezone", "UTC")))


def mission(state, domain=None, now=None):
    if not state["goals"]:
        return None
    previous = state["daily"].get("mission")
    preferred = previous["domain"] if previous and previous["domain"] in state["goals"] else None
    domain = domain or preferred or next(iter(state["goals"]))
    if domain not in state["goals"]:
        return None
    goal = state["goals"][domain]
    decisions = state["lab"]["decisions"] if state["lab"]["consent"] else []
    last = decisions[-1] if decisions else None
    minutes = int(last["target_minutes"]) if last else 15
    date = today(state, now).date().isoformat()
    key = [date, domain, goal, minutes, last["id"] if last else None]
    if previous and previous["key"] == key:
        return previous
    setup = min(3, max(1, minutes // 5))
    finish = min(2, max(1, minutes // 5))
    work = minutes - setup - finish
    text = goal.lower()
    action = "Work on one small, concrete step"
    if any(word in text for word in ("app", "code", "python", "website", "software")):
        action = "Build or debug one small feature; save what works"
    elif any(word in text for word in ("learn", "study", "language", "read")):
        action = "Practice one concept, then explain it in your own words"
    elif any(word in text for word in ("write", "book", "essay")):
        action = "Draft one small section without polishing it"
    result = {
        "key": key, "date": date, "domain": domain, "goal": goal,
        "minutes": minutes, "done": False,
        "steps": [
            {"minutes": setup, "text": f"Choose one small outcome for: {goal}"},
            {"minutes": work, "text": action},
            {"minutes": finish, "text": "Save your progress and name the next step"},
        ],
        "basis": f"Latest Lab target. {last['why']}" if last else "Starter plan: 15 minutes; no Lab check-in yet.",
        "disclaimer": "A planning suggestion from your inputs, not a proven measure of capacity.",
    }
    state["daily"]["mission"] = result
    return result


def describe(item):
    if not item:
        return "What is one goal you want to work toward? Say: my goal is, followed by your goal."
    if item["done"]:
        return f"You marked your {item['minutes']}-minute mission for {item['goal']} complete."
    steps = " ".join(f"{step['minutes']} minutes: {step['text']}." for step in item["steps"])
    return f"Your mission for {item['goal']} is {item['minutes']} minutes. {steps} This is a suggestion; you can stop or adjust. Say mission complete when you're done."


def schedule(state, clock, now=None):
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", clock):
        return "Tell me a daily time, such as 9 AM or 18:30."
    local = today(state, now)
    state["daily"]["schedule"] = {
        "time": clock, "timezone": state.get("timezone", "UTC"), "enabled": True,
        # Scheduling after today's time starts tomorrow; do not create an immediate surprise.
        "last_date": local.date().isoformat() if local.strftime("%H:%M") >= clock else None,
    }
    return f"Daily check-in set for {clock} in {state.get('timezone', 'UTC')}. It appears in this app while open, or when you next open it. Say stop reminders to cancel."


def deliver(state, now=None):
    plan = state["daily"].get("schedule")
    if not plan or not plan["enabled"]:
        return False
    local = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo(plan["timezone"]))
    date = local.date().isoformat()
    if plan["last_date"] == date or local.strftime("%H:%M") < plan["time"]:
        return False
    item = mission(state, now=now)
    state["daily"]["messages"].append({
        "id": f"{date}-{plan['time']}", "date": date,
        "text": "Your daily check-in. " + describe(item),
    })
    state["daily"]["messages"] = state["daily"]["messages"][-14:]
    plan["last_date"] = date
    return True


def valid_timezone(name):
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return False


def shortcut(text):
    normalized = text.strip(" .!?")
    low = normalized.lower()
    commands = {"start my day": "open_day", "what is my mission": "get_mission",
                "give me a mission": "get_mission", "mission complete": "complete_mission",
                "stop reminders": "stop_reminders", "read my messages": "read_messages"}
    if low in commands:
        return commands[low], {}
    match = re.fullmatch(r"my goal is (.+)", normalized, re.I)
    if match:
        return "set_goal", {"domain": "personal", "goal": match[1]}
    match = re.fullmatch(r"(?:remind me|check in)(?: every day| daily)? at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?", low)
    if match:
        hour, minute, meridiem = int(match[1]), int(match[2] or 0), match[3]
        if not meridiem and match[2] is None:
            return "schedule_checkin", {"time": "invalid"}
        if meridiem and not 1 <= hour <= 12:
            return "schedule_checkin", {"time": "invalid"}
        if meridiem:
            hour = hour % 12 + (12 if meridiem == "pm" else 0)
        return "schedule_checkin", {"time": f"{hour:02}:{minute:02}"}
    return None
