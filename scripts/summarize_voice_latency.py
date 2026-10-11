"""Summarize manually annotated REAL mic/speaker turns; never generate or simulate measurements.

python scripts/summarize_voice_latency.py work/voice-acceptance/turns.csv --output docs/voice/latency.json
Times are seconds on one acoustic recording containing both Prat and the PC speakers.
"""
import argparse
import csv
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path


def summarize(rows):
    if len(rows) != 30 or {r["turn"] for r in rows} != {str(i) for i in range(1, 31)}:
        raise ValueError("Exactly 30 unique rows, numbered 1 through 30, are required.")
    measured = []
    pending = 0
    failures = 0
    for row in rows:
        outcome = row["outcome"].strip()
        if outcome not in ("", "pass", "fail"):
            raise ValueError(f"Turn {row['turn']}: outcome must be blank, pass or fail.")
        if not outcome:
            pending += 1
            continue
        if outcome == "fail":
            failures += 1
            continue
        if row["engine"] != "kokoro" or row["live_nebius"] != "yes":
            raise ValueError(f"Turn {row['turn']}: pass requires actual Kokoro audio and a live Nebius session.")
        end, first = float(row["speech_end_s"]), float(row["first_sound_s"])
        if not all(math.isfinite(x) and x >= 0 for x in (end, first)) or first < end:
            raise ValueError(f"Turn {row['turn']}: invalid acoustic timestamps.")
        measured.append({"turn": int(row["turn"]), "kind": row["kind"],
                         "speech_end_s": end, "first_sound_s": first,
                         "latency_ms": round((first - end) * 1000, 1)})
    values = [r["latency_ms"] for r in measured]
    return {
        "status": "complete" if len(measured) == 30 else "incomplete" if pending < 30 else "awaiting_prat",
        "method": "Last audible user phoneme to first audible Reneė sound on the same acoustic recording.",
        "target_turns": 30, "measured_turns": len(measured), "failed_turns": failures,
        "pending_turns": pending,
        "typical_median_ms": statistics.median(values) if values else None,
        "worst_ms": max(values) if values else None,
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "turns": measured,
        "note": "Partial statistics are not a completed 30-turn benchmark. Failures are counted, never hidden.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    with args.csv.open(newline="", encoding="utf-8-sig") as source:
        report = summarize(list(csv.DictReader(source)))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{report['measured_turns']}/30 measured; {report['failed_turns']} failed; "
          f"median={report['typical_median_ms']} ms; worst={report['worst_ms']} ms")


if __name__ == "__main__":
    main()
