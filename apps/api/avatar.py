"""Wardrobe slots for the portrait projection, changed by voice like a character creator.

Only the slot values live on the server. The user's photo stays in their browser and never
reaches this API.
"""

import re

OUTFITS = ("casual", "monarch")
AURAS = ("cyan", "violet", "gold")
DEFAULT = {"outfit": "casual", "aura": "cyan"}

COLOURS = {
    "gold": "gold",
    "golden": "gold",
    "yellow": "gold",
    "violet": "violet",
    "purple": "violet",
    "cyan": "cyan",
    "blue": "cyan",
    "teal": "cyan",
}
ARMOR = r"armou?r"


def parse(text: str) -> dict | None:
    """Deterministic shortcut for common look changes. None when the words are not a look change."""
    t = " " + text.lower().strip(" .!?") + " "
    look = {}
    if re.search(r"\baura\b", t):
        for word, aura in COLOURS.items():
            if re.search(rf"\b{word}\b", t):
                look["aura"] = aura
                break
    if re.search(rf"\b(take off|remove|drop|lose|no more|without)\b.*\b{ARMOR}\b", t) or re.search(
        r"\b(go|back to|switch to|change to|wear|put on|dress)\b.*\bcasual\b", t
    ):
        look["outfit"] = "casual"
    elif (
        re.search(rf"\bmonarch\b.*\b({ARMOR}|outfit|look|gear|set)\b", t)
        or re.search(rf"\b(put on|wear|equip|switch to|change to|give me)\b.*\b(monarch|{ARMOR})\b", t)
        or re.search(r"\bsuit up\b", t)
    ):
        look["outfit"] = "monarch"
    if t.strip() in ("casual", "casual look", "casual outfit"):
        look["outfit"] = "casual"
    return look or None


def normalize(args: dict) -> tuple[dict, str | None]:
    """Validate tool arguments. Returns (look, error)."""
    outfit = str(args.get("outfit") or "").strip().lower()
    aura = str(args.get("aura") or "").strip().lower()
    aura = COLOURS.get(aura, aura)
    if outfit and outfit not in OUTFITS:
        return {}, "I have two outfits right now: casual and monarch armor."
    if aura and aura not in AURAS:
        return {}, "Auras come in cyan, violet, or gold."
    look = {k: v for k, v in (("outfit", outfit), ("aura", aura)) if v}
    if not look:
        return {}, "Tell me the outfit or the aura colour you want."
    return look, None


def describe(before: dict, after: dict) -> str:
    parts = []
    if after["outfit"] != before["outfit"]:
        parts.append("Monarch armor on" if after["outfit"] == "monarch" else "Armor off, just you")
    if after["aura"] != before["aura"]:
        parts.append(f"{'with a' if parts else 'Your aura is'} {after['aura']}{' aura' if parts else ' now'}")
    return (" ".join(parts) if len(parts) == 2 else parts[0]) + "."
