"""Future projection for the golden-ratio face scan: the marketing flourish at the end of the scan.

The browser measures the face on-device and sends ratio numbers only. The photo never reaches the
server. With a Nebius key, NVIDIA Nemotron on Token Factory writes the projection; without one, or
if the call fails, a deterministic local projection stands in. Every card is labeled illustrative.
"""

import hashlib
import json
import math
import re

PHI = 1.618
KEYS = ("faceRectangle", "thirdsUpper", "thirdsLower", "lips", "mouthNose", "jawMouth", "widthIpd")
TARGETS = {key: PHI for key in KEYS} | {"widthIpd": round(2 * PHI - 1, 3)}
SIDES = ("dream", "good", "neutral", "bad")
WEEKS = 52
MAX_CHANGE = 0.08  # a projected value stays within 8% of the measured one
DISCLAIMER = (
    "Illustrative projection, for fun. Not a measurement of worth, beauty or health, and not a prediction."
)

# How far each side drifts toward (or away from) the golden ratio, and its headline chance.
DRIFT = {"dream": 0.34, "good": 0.2, "neutral": 0.06, "bad": -0.08, None: 0.14}
CHANCE = {"dream": 78, "good": 64, "neutral": 45, "bad": 31, None: 55}
NOTES = {
    "dream": [
        "Φ alignment locking in",
        "harmony trending up",
        "symmetry sharpening",
        "proportions settling into balance",
        "momentum written on your face",
    ],
    "good": [
        "steady drift toward Φ",
        "balance holding strong",
        "alignment improving slowly",
        "consistency shows up here",
        "harmony on track",
    ],
    "neutral": [
        "holding the line",
        "little movement either way",
        "balance unchanged",
        "waiting on your next move",
        "steady, for now",
    ],
    "bad": [
        "drifting off Φ",
        "alignment slipping",
        "balance under strain",
        "harmony needs attention",
        "the curve can still bend",
    ],
}
NOTES[None] = NOTES["good"]

SYSTEM = """You write the "future projection" card for a golden-ratio face scan in The Other Side, a voice-first personal AI.
It is a playful marketing flourish, clearly illustrative, never a prediction.
You receive the user's measured facial ratios, each with its golden-ratio target, and the future side they are viewing, 52 weeks out.
Answer with JSON only: {"rows": [{"key": "<ratio key>", "future": <number>, "chance": <integer 5-97>, "note": "<at most 7 words>"}]}.
Keep every future value within 8% of its measured value. The dream and good sides drift gently toward the target; neutral barely moves; the hard road drifts slightly away.
Notes are upbeat or neutral and speak about harmony, alignment, symmetry, balance or momentum.
Never mention attractiveness, weight, age, skin, disease, surgery, diet or health, and never shame anyone."""


def validate(ratios) -> dict[str, float]:
    """Only known ratio keys with finite, plausible values. Raises ValueError otherwise."""
    if not isinstance(ratios, dict) or not ratios:
        raise ValueError("Send at least one measured ratio.")
    if len(ratios) > len(KEYS):
        raise ValueError("Too many ratios.")
    out = {}
    for key, value in ratios.items():
        if key not in KEYS:
            raise ValueError(f"Unknown ratio: {key}.")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{key} must be a number.")
        if not math.isfinite(value) or not 0.2 <= value <= 5:
            raise ValueError(f"{key} is out of range.")
        out[key] = round(float(value), 3)
    return out


def side_of(side) -> str | None:
    return side if side in SIDES else None


def clamp(now: float, future: float) -> float:
    """Keep a projected value within MAX_CHANGE of the measured one, on the 3-decimal grid."""
    low = math.ceil(now * (1 - MAX_CHANGE) * 1000) / 1000
    high = math.floor(now * (1 + MAX_CHANGE) * 1000) / 1000
    return min(high, max(low, round(future, 3)))


def _ordered(ratios: dict[str, float]):
    return sorted(ratios.items(), key=lambda item: KEYS.index(item[0]))


def local(ratios: dict[str, float], side: str | None) -> list[dict]:
    """Deterministic projection: the same ratios and side always give the same card."""
    seed = int(hashlib.sha256(json.dumps([_ordered(ratios), side]).encode()).hexdigest()[:12], 16)
    rows = []
    for i, (key, now) in enumerate(_ordered(ratios)):
        jitter = ((seed >> (i * 4)) % 7 - 3) / 100
        pull = max(-0.2, min(0.6, DRIFT[side] + jitter))
        future = clamp(now, now + (TARGETS[key] - now) * pull)
        chance = max(12, min(96, CHANCE[side] + (seed >> (i * 5)) % 21 - 10))
        notes = NOTES[side]
        rows.append(
            {"key": key, "now": now, "future": future, "chance": chance, "note": notes[i % len(notes)]}
        )
    return rows


def messages(ratios: dict[str, float], side: str | None) -> list[dict]:
    payload = {
        "side": side or "current path",
        "weeks": WEEKS,
        "ratios": [
            {"key": key, "measured": value, "target": TARGETS[key]} for key, value in _ordered(ratios)
        ],
    }
    return [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": json.dumps(payload)},
    ]


BANNED = re.compile(
    r"\b(attractive\w*|attraction|beaut\w*|ugly|pretty|handsome|weight|fat|thin|age[ds]?|aging|ageing"
    r"|old|wrinkle\w*|skin|disease\w*|surgery|surgical|diet\w*|health\w*|flaw\w*)\b",
    re.IGNORECASE,
)


def parse(content: str, ratios: dict[str, float], side: str | None) -> list[dict] | None:
    """Validate the model's JSON. Clamp numbers, drop bad notes, fill gaps locally. None if unusable."""
    try:
        data = json.loads(content[content.index("{") : content.rindex("}") + 1])
        items = data["rows"]
    except (ValueError, KeyError, TypeError):
        return None
    if not isinstance(items, list):
        return None
    fallback = {row["key"]: row for row in local(ratios, side)}
    found = {}
    for item in items:
        if not isinstance(item, dict) or item.get("key") not in ratios or item["key"] in found:
            continue
        key = item["key"]
        future, chance = item.get("future"), item.get("chance")
        if isinstance(future, bool) or not isinstance(future, (int, float)) or not math.isfinite(future):
            continue
        if isinstance(chance, bool) or not isinstance(chance, (int, float)) or not math.isfinite(chance):
            chance = fallback[key]["chance"]
        note = item.get("note")
        if not isinstance(note, str) or not note.strip() or len(note) > 60 or BANNED.search(note):
            note = fallback[key]["note"]
        found[key] = {
            "key": key,
            "now": ratios[key],
            "future": clamp(ratios[key], float(future)),
            "chance": int(max(5, min(97, round(chance)))),
            "note": note.strip(),
        }
    if not found:
        return None
    return [found.get(key, fallback[key]) for key, _ in _ordered(ratios)]
