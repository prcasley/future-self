"""Synthetic live smoke test against a running local API. Uses a separate session."""

import json
import time
from uuid import uuid4

import httpx

session = str(uuid4())
with httpx.Client(base_url="http://127.0.0.1:8016", timeout=25) as client:
    for text in [
        "My career goal is to build my first app. Please save that goal.",
        "No, change my career goal to learning Python.",
        "yes",
        "undo that",
    ]:
        start = time.monotonic()
        response = client.post("/voice/text_turn", json={"session_id": session, "text": text})
        response.raise_for_status()
        parsed = []
        for frame in response.text.strip().split("\n\n"):
            lines = frame.splitlines()
            name, data = lines[0][7:], json.loads(lines[1][6:])
            if name not in ("token", "transcript"):
                parsed.append((name, data))
        print(
            json.dumps(
                {"input": text, "elapsed_ms": round((time.monotonic() - start) * 1000), "events": parsed}
            )
        )
        assert parsed[-1][0] == "done"
        assert not any(name == "error" for name, _ in parsed)
    state = client.get("/state/" + session).json()
    assert state["goals"], "No goal saved"
    assert state["pending"] is None
    print("PASS: live goal/correction/confirmation/undo conversation")
