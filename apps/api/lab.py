"""The Lab — a research instrument inside the app.

Question under study: can an agent infer when to PUSH, MAINTAIN or REDUCE goal intensity
from longitudinal behavioral signals, better than a constant policy, without raising strain?

Design: every spoken check-in yields a decision for tomorrow. In "shadow" mode all policies
decide, one is applied (the active one), all are logged. The next check-in scores the
applied decision (reward) and the user can rate it by voice. Everything stays local,
requires explicit consent, and exports without free text.
"""

import random
import time

INTENSITIES = ("push", "maintain", "reduce")
POLICIES = ("rule", "bandit", "llm")
RATINGS = {"too_much": "too_much", "just_right": "just_right", "too_little": "too_little"}
BUCKETS = ("low", "mid", "high")


def new_lab():
    return {
        "consent": False,
        "active": "rule",
        "checkins": [],
        "decisions": [],
        "ratings": [],
        "bandit": {b: {a: [1.0, 1.0] for a in INTENSITIES} for b in BUCKETS},
        "baseline_minutes": 45,
    }


def clamp(value, low, high):
    return max(low, min(high, value))


def parse_checkin(args):
    """Tolerant parsing of spoken numbers. Raises ValueError with a speakable message."""
    try:
        sleep = float(args.get("sleep_hours"))
        energy = int(float(args.get("energy")))
        stress = int(float(args.get("stress")))
        effort = int(float(args.get("effort_minutes", 0)))
    except (TypeError, ValueError):
        raise ValueError("I need sleep hours, energy one to five, stress one to five, and minutes worked.")
    completed = args.get("completed")
    if isinstance(completed, str):
        completed = completed.strip().lower() in ("true", "yes", "done", "1", "y")
    if not (0 <= sleep <= 16 and 1 <= energy <= 5 and 1 <= stress <= 5 and 0 <= effort <= 900):
        raise ValueError("Those numbers are out of range: sleep 0-16, energy and stress 1-5, minutes 0-900.")
    return {
        "ts": time.time(),
        "sleep_hours": round(sleep, 1),
        "energy": energy,
        "stress": stress,
        "effort_minutes": effort,
        "completed": bool(completed),
    }


def features(checkins):
    """Longitudinal features from the last 7 check-ins. All values in [0,1] or small ints."""
    recent = checkins[-7:]
    if not recent:
        return None
    last = recent[-1]
    sleep = last["sleep_hours"]
    capacity = clamp(
        0.15 * clamp((sleep - 4) / 4, 0, 1) * 2
        + 0.25 * (last["energy"] - 1) / 4
        + 0.25 * (5 - last["stress"]) / 4
        + 0.20 * (1 - clamp(last["effort_minutes"] / 240, 0, 1)),
        0,
        1,
    )
    streak = 0
    for c in reversed(recent):
        if c["completed"]:
            streak += 1
        else:
            break
    misses = sum(1 for c in recent[-3:] if not c["completed"])
    stress_trend = (recent[-1]["stress"] - recent[0]["stress"]) if len(recent) > 1 else 0
    sleep_debt = sum(max(0.0, 7 - c["sleep_hours"]) for c in recent[-3:])
    return {
        "capacity": round(capacity, 3),
        "streak": streak,
        "misses_3d": misses,
        "stress_trend": stress_trend,
        "sleep_debt_3d": round(sleep_debt, 1),
        "n": len(recent),
    }


def bucket(feats):
    c = feats["capacity"]
    return "low" if c < 0.4 else "high" if c >= 0.66 else "mid"


def rule_policy(feats):
    """Transparent capacity rule. Every branch is a sentence ECHO can say."""
    if feats["capacity"] < 0.4 or feats["sleep_debt_3d"] >= 4 or feats["stress_trend"] >= 2:
        return "reduce", "capacity is low: short sleep or rising stress"
    if feats["capacity"] >= 0.66 and feats["streak"] >= 2 and feats["misses_3d"] == 0:
        return "push", "capacity is high and you have a streak"
    if feats["misses_3d"] >= 2:
        return "reduce", "two misses in three days: make the next step smaller, not harder"
    return "maintain", "steady: keep the same size step"


def bandit_policy(lab, feats, rng=None):
    """Thompson sampling over context bucket x arm with Beta posteriors. Pure Python."""
    rng = rng or random.Random()
    posts = lab["bandit"][bucket(feats)]
    draws = {arm: rng.betavariate(a, b) for arm, (a, b) in posts.items()}
    arm = max(draws, key=draws.get)
    return arm, f"bandit sampled {arm} for the {bucket(feats)}-capacity context"


def reward_for(decision_intensity, next_checkin, prev_checkin, rating=None):
    """Healthy progress reward in [0,1]: did they complete tomorrow without stress climbing."""
    if rating == "just_right":
        return 1.0
    if rating in ("too_much", "too_little"):
        return 0.0
    stress_up = next_checkin["stress"] - prev_checkin["stress"] >= 2
    if next_checkin["completed"] and not stress_up:
        return 1.0
    if next_checkin["completed"] and stress_up:
        return 0.5 if decision_intensity != "push" else 0.25
    return 0.0


def update_bandit(lab, decision, reward):
    ctx = decision["bucket"]
    arm = decision["applied"]
    a, b = lab["bandit"][ctx][arm]
    lab["bandit"][ctx][arm] = [a + reward, b + (1 - reward)]


def target_minutes(lab, intensity):
    base = lab.get("baseline_minutes", 45)
    return int(round(base * {"push": 1.25, "maintain": 1.0, "reduce": 0.6}[intensity] / 5) * 5)


def record_checkin(lab, checkin, rng=None):
    """Append a check-in, score the previous decision, and decide tomorrow. Returns the decision."""
    lab["checkins"].append(checkin)
    lab["checkins"] = lab["checkins"][-365:]
    # Score the previous decision with today's outcome.
    if lab["decisions"] and len(lab["checkins"]) >= 2 and lab["decisions"][-1].get("reward") is None:
        prev = lab["decisions"][-1]
        rating = prev.get("rating")
        prev["reward"] = reward_for(prev["applied"], checkin, lab["checkins"][-2], rating)
        update_bandit(lab, prev, prev["reward"])
    feats = features(lab["checkins"])
    rule, rule_why = rule_policy(feats)
    arm, arm_why = bandit_policy(lab, feats, rng)
    active = lab.get("active", "rule")
    applied, why = (rule, rule_why) if active != "bandit" else (arm, arm_why)
    decision = {
        "id": len(lab["decisions"]) + 1,
        "ts": checkin["ts"],
        "features": feats,
        "bucket": bucket(feats),
        "recommendations": {"rule": rule, "bandit": arm, "llm": None},
        "reasons": {"rule": rule_why, "bandit": arm_why, "llm": None},
        "active": active,
        "applied": applied,
        "why": why,
        "target_minutes": target_minutes(lab, applied),
        "rating": None,
        "reward": None,
    }
    lab["decisions"].append(decision)
    lab["decisions"] = lab["decisions"][-365:]
    return decision


def rate_last(lab, rating):
    if rating not in RATINGS:
        raise ValueError("Say too much, just right, or too little.")
    if not lab["decisions"]:
        raise ValueError("There is no decision to rate yet. Check in first.")
    last = lab["decisions"][-1]
    last["rating"] = rating
    lab["ratings"].append({"decision_id": last["id"], "rating": rating, "ts": time.time()})
    if last.get("reward") is None:
        last["reward"] = reward_for(
            last["applied"], {"completed": rating == "just_right", "stress": 0}, {"stress": 0}, rating
        )
        update_bandit(lab, last, last["reward"])
    return last


def summary(lab):
    """Per-policy scorecard. Agreement = how often each policy matched what the user rated just right."""
    decisions = lab["decisions"]
    out = {
        "consent": lab["consent"],
        "active": lab.get("active", "rule"),
        "checkins": len(lab["checkins"]),
        "decisions": len(decisions),
        "policies": {},
    }
    for policy in POLICIES:
        recs = [d for d in decisions if d["recommendations"].get(policy)]
        rated = [d for d in recs if d.get("rating")]
        agree = sum(
            1 for d in rated if d["rating"] == "just_right" and d["recommendations"][policy] == d["applied"]
        )
        scored = [
            d for d in recs if d.get("reward") is not None and d["applied"] == d["recommendations"][policy]
        ]
        out["policies"][policy] = {
            "decisions": len(recs),
            "distribution": {
                i: sum(1 for d in recs if d["recommendations"][policy] == i) for i in INTENSITIES
            },
            "just_right_rate": round(agree / len(rated), 2) if rated else None,
            "mean_reward_when_applied": round(sum(d["reward"] for d in scored) / len(scored), 2)
            if scored
            else None,
        }
    out["bandit"] = {
        b: {a: [round(v[0], 1), round(v[1], 1)] for a, v in arms.items()} for b, arms in lab["bandit"].items()
    }
    out["last"] = decisions[-1] if decisions else None
    return out


def export_rows(lab):
    """Anonymized JSONL rows: signals, features, decisions, rewards. No goals, facts, or notes."""
    rows = []
    for c in lab["checkins"]:
        rows.append(
            {
                "type": "checkin",
                **{k: c[k] for k in ("ts", "sleep_hours", "energy", "stress", "effort_minutes", "completed")},
            }
        )
    for d in lab["decisions"]:
        rows.append(
            {
                "type": "decision",
                **{
                    k: d[k]
                    for k in (
                        "id",
                        "ts",
                        "features",
                        "bucket",
                        "recommendations",
                        "active",
                        "applied",
                        "target_minutes",
                        "rating",
                        "reward",
                    )
                },
            }
        )
    return rows
