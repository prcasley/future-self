"""Small live checks; output contains no credentials. Run from repository root."""

import argparse
import json
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
parser = argparse.ArgumentParser()
parser.add_argument(
    "--ping", action="store_true", help="Spend a small number of tokens testing Super and Nano"
)
args = parser.parse_args()
key = os.environ.get("NEBIUS_API_KEY")
if not key:
    raise SystemExit("FAIL: NEBIUS_API_KEY is missing")
base = os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1")
with httpx.Client(base_url=base, headers={"Authorization": f"Bearer {key}"}, timeout=20) as client:
    try:
        response = client.get("/models")
        print("Catalog HTTP", response.status_code)
        response.raise_for_status()
        models = response.json().get("data", [])
        ids = [m["id"] for m in models]
        relevant = [
            x
            for x in ids
            if any(word in x.lower() for word in ["nemotron", "flux", "tts", "speech", "whisper", "magpie"])
        ]
        print(json.dumps({"catalog_matches": relevant}, indent=2))
        for label, model in [
            ("Super", os.getenv("NEBIUS_SUPER_MODEL", "nvidia/nemotron-3-super-120b-a12b")),
            ("Nano", os.getenv("NEBIUS_NANO_MODEL", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B")),
        ]:
            if model not in ids:
                print(label, "NOT LISTED", model)
                continue
            if args.ping:
                start = time.monotonic()
                result = client.post(
                    "/chat/completions",
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Reply with only: ready"}],
                        "max_tokens": 64,
                        "temperature": 0,
                    },
                )
                print(
                    label, "HTTP", result.status_code, "latency_ms", round((time.monotonic() - start) * 1000)
                )
                if result.is_success:
                    data = result.json()
                    print(
                        "content:", data["choices"][0]["message"].get("content"), "usage:", data.get("usage")
                    )
        print("Omni audio: NOT TESTED (no real audio fixture provided).")
        print("TTS: catalog evidence only; absence of a named model is not an API capability test.")
        print("Sandbox fork: NOT TESTED (project ID not configured).")
    except httpx.HTTPError as error:
        print("FAIL:", type(error).__name__, "(credentials and response body withheld)")
        raise SystemExit(1) from None
