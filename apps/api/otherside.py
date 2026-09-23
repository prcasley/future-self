"""The Other Side — a seeded 52-week scenario simulation over the user's goals.

This is scenario reasoning from the user's own goals and assumptions, not a prediction.
Every number here is deterministic for (session, side, goals) so a side can be replayed,
compared, and audited. The same weekly dynamics power the Lab's policy experiments.
"""

import hashlib
import json
import random

SIDES = ("dream", "good", "neutral", "bad")
LABELS = {
    "dream": "Dream life",
    "good": "Good path",
    "neutral": "Neutral drift",
    "bad": "Hard road",
}
# Weekly assumptions per side. hours = goal effort per week across all domains,
# consistency = chance a week is actually worked, recovery = discipline to recover when strained,
# shock = chance an outside event takes the week.
PROFILES = {
    "dream": {"hours": 12.0, "consistency": 0.90, "recovery": 0.85, "shock": 0.05},
    "good": {"hours": 7.0, "consistency": 0.75, "recovery": 0.70, "shock": 0.08},
    "neutral": {"hours": 3.5, "consistency": 0.55, "recovery": 0.50, "shock": 0.10},
    "bad": {"hours": 1.5, "consistency": 0.35, "recovery": 0.30, "shock": 0.15},
}
GAIN = 0.9  # progress per effort-hour, before momentum and diminishing returns
STRAIN_PER_HOUR = 0.0064  # weekly strain added per total goal-hour; recovery decays it
PUSH_STRAIN = 1.8  # pushing past the plan costs disproportionately more strain
BURNOUT = 0.80  # strain at which the week is lost
WEEKS = 52
BANDS = (
    (90, "arrived"),
    (70, "most of the way"),
    (45, "real momentum"),
    (20, "early progress"),
    (0, "barely moved"),
)


def seed_for(session, side, goals, salt=""):
    raw = json.dumps([session, side, sorted(goals.items()), salt], sort_keys=True)
    return int(hashlib.sha256(raw.encode()).hexdigest()[:12], 16)


def band(progress):
    for floor, name in BANDS:
        if progress >= floor:
            return name
    return "barely moved"


def baseline_from_checkins(checkins):
    """Turn recent Lab check-ins into starting conditions. Defaults when there is no data."""
    recent = checkins[-14:]
    if not recent:
        return {"strain": 0.35, "momentum": 0.0, "source": "defaults"}
    sleep = sum(c["sleep_hours"] for c in recent) / len(recent)
    stress = sum(c["stress"] for c in recent) / len(recent)
    completion = sum(1 for c in recent if c["completed"]) / len(recent)
    strain = min(1.0, max(0.0, 0.2 + (stress - 3) * 0.15 + (7 - sleep) * 0.08))
    momentum = min(1.0, max(-1.0, (completion - 0.5) * 2))
    return {"strain": round(strain, 3), "momentum": round(momentum, 3), "source": f"{len(recent)} check-ins"}


def intensity_multiplier(decision):
    return {"push": 1.25, "maintain": 1.0, "reduce": 0.6}[decision]


def simulate(session, side, goals, checkins=(), policy="fixed", seed=None):
    """Run one side. `policy` decides weekly intensity: fixed (the side's profile as-is),
    push (always push), rule (Lab rule policy on simulated signals)."""
    if side not in SIDES:
        raise ValueError("unknown side")
    domains = list(goals.keys()) or ["direction"]
    profile = PROFILES[side]
    rng = random.Random(seed if seed is not None else seed_for(session, side, goals, policy))
    start = baseline_from_checkins(list(checkins))
    progress = {d: 0.0 for d in domains}
    strain, momentum = start["strain"], start["momentum"]
    weeks, events, burnout_weeks, active_weeks = [], [], 0, 0
    milestones = {d: {} for d in domains}
    consistency = profile["consistency"]
    recent_burnouts, breaks = [], 0
    for week in range(1, WEEKS + 1):
        decision = "maintain"
        if policy == "push":
            decision = "push"
        elif policy == "rule":
            # Same rule the Lab uses, fed with the simulated strain instead of check-ins.
            decision = "reduce" if strain > 0.65 else "push" if strain < 0.35 and momentum > 0 else "maintain"
        multiplier = intensity_multiplier(decision)
        shocked = rng.random() < profile["shock"]
        worked = (not shocked) and rng.random() < consistency
        burnout = strain >= BURNOUT
        recent_burnouts = [w for w in recent_burnouts if week - w < 8]
        if burnout:
            burnout_weeks += 1
            worked = False
            recent_burnouts.append(week)
            if len(events) < 40:
                events.append(
                    {"week": week, "kind": "burnout", "text": "Ran out of road and stopped for the week."}
                )
            # Three burnouts in eight weeks breaks the plan: consistency drops for good (dropout dynamics).
            if len(recent_burnouts) >= 3 and breaks < 2:
                breaks += 1
                consistency *= 0.7
                recent_burnouts = []
                if len(events) < 40:
                    events.append(
                        {"week": week, "kind": "break", "text": "The plan broke. Showing up got harder."}
                    )
        total_effort = profile["hours"] * multiplier * (rng.uniform(0.6, 1.2) if worked else 0.1)
        effort = total_effort / len(domains)
        if worked:
            active_weeks += 1
        # Strain rises with total hours, falls with recovery discipline. Burnout forces a hard reset.
        decay = 0.80 if burnout else (0.86 if rng.random() < profile["recovery"] else 0.95)
        strain = min(
            1.0,
            strain * decay + total_effort * STRAIN_PER_HOUR * (PUSH_STRAIN if decision == "push" else 1.0),
        )
        momentum = max(-1.0, min(1.0, momentum * 0.9 + (0.12 if worked else -0.12)))
        for d in domains:
            gain = effort * GAIN * (1 + 0.35 * momentum) * (1 - progress[d] / 130)
            progress[d] = min(100.0, progress[d] + max(0.0, gain))
            for mark in (25, 50, 75, 100):
                if progress[d] >= mark and str(mark) not in milestones[d]:
                    milestones[d][str(mark)] = week
                    if len(events) < 40:
                        events.append({"week": week, "kind": "milestone", "text": f"{d}: crossed {mark}%."})
        if shocked and len(events) < 40:
            events.append({"week": week, "kind": "shock", "text": "Life took the week."})
        weeks.append(
            {
                "week": week,
                "progress": {d: round(progress[d], 1) for d in domains},
                "strain": round(strain, 3),
                "momentum": round(momentum, 3),
                "decision": decision,
            }
        )
    final = {d: round(progress[d], 1) for d in domains}
    return {
        "side": side,
        "label": LABELS[side],
        "policy": policy,
        "assumptions": profile,
        "baseline": start,
        "weeks": weeks,
        "final": final,
        "bands": {d: band(final[d]) for d in domains},
        "milestones": milestones,
        "events": events,
        "stats": {
            "burnout_weeks": burnout_weeks,
            "breaks": breaks,
            "active_weeks": active_weeks,
            "avg_strain": round(sum(w["strain"] for w in weeks) / WEEKS, 3),
            "avg_progress": round(sum(final.values()) / len(final), 1),
        },
        "disclaimer": "Scenario from your own goals and stated assumptions. Not a prediction.",
    }


def summary(result):
    """Compact form for state payloads and prompts (no week-by-week detail)."""
    return {
        "side": result["side"],
        "label": result["label"],
        "policy": result["policy"],
        "final": result["final"],
        "bands": result["bands"],
        "stats": result["stats"],
        "milestones": result["milestones"],
        "events": result["events"][:8],
        "baseline": result["baseline"],
        "assumptions": result["assumptions"],
        "avg_curve": [
            round(sum(w["progress"].values()) / len(w["progress"]), 1) for w in result["weeks"][::4]
        ],
        "strain_curve": [w["strain"] for w in result["weeks"][::4]],
    }


def compare_policies(session, goals, checkins=(), side="good"):
    """The research demo: same side, three intensity policies. Burnout vs progress."""
    rows = []
    for policy in ("push", "fixed", "rule"):
        r = simulate(session, side, goals, checkins, policy=policy)
        rows.append(
            {
                "policy": {"push": "always push", "fixed": "constant", "rule": "adaptive (rule)"}[policy],
                "avg_progress": r["stats"]["avg_progress"],
                "burnout_weeks": r["stats"]["burnout_weeks"],
                "active_weeks": r["stats"]["active_weeks"],
                "avg_strain": r["stats"]["avg_strain"],
            }
        )
    return {"side": side, "rows": rows, "weeks": WEEKS}


def template_narrative(result, goals):
    """Deterministic postcard used when the model is unavailable. Grounded in the numbers only."""
    side = result["side"]
    parts = [f"This is you on the {result['label'].lower()}, fifty-two weeks out."]
    for d, value in result["final"].items():
        goal = goals.get(d, d)
        parts.append(f"{d.capitalize()} — {goal}: {value:.0f} percent, {result['bands'][d]}.")
    stats = result["stats"]
    parts.append(
        f"I worked {stats['active_weeks']} of 52 weeks and burned out {stats['burnout_weeks']} of them."
    )
    if side in ("neutral", "bad"):
        parts.append("The road back is open. One honest week changes this curve.")
    else:
        parts.append("It was built one ordinary week at a time.")
    parts.append("A scenario from your own assumptions, not a prediction.")
    return " ".join(parts)


NARRATOR = """You are the user's future self, speaking from "{label}" fifty-two weeks from now, inside a simulation built from the user's own goals and assumptions. It is not a prediction; never call it one.
Speak in first person, plain and specific, 4 to 6 short sentences, no markdown, no lists.
Ground every claim ONLY in the numbers provided. Do not invent events, people, health outcomes, money figures, or diagnoses. No shame, no threats, no medical or mental-health claims.
Say one thing that went right, one thing that cost you, and end with the single most useful thing today-you can do this week. If the side is neutral or bad, make the road back concrete and open.
Numbers: {numbers}"""


def narrator_messages(result, goals):
    numbers = json.dumps(
        {
            "goals": goals,
            "final": result["final"],
            "bands": result["bands"],
            "stats": result["stats"],
            "milestones": result["milestones"],
            "events": result["events"][:8],
        }
    )
    return [
        {"role": "system", "content": NARRATOR.format(label=result["label"], numbers=numbers)},
        {"role": "user", "content": "Speak to me from the other side."},
    ]
