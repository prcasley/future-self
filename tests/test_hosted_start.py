"""The hosted entrypoint (scripts/start-hosted.sh) wires Renée into the app inside one container.

A stand-in `uvicorn` on PATH records how each server is launched, so these tests run the real
script without Kokoro or a network.
"""

import os
import stat
import subprocess
import time
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "start-hosted.sh"

FAKE_UVICORN = """#!/bin/sh
echo "$PWD|$*|url=${RENEE_TTS_URL:-}|key=${RENEE_TTS_KEY:-}" >> "$LAUNCH_LOG"
"""


def run(tmp_path: Path, **env: str) -> list[str]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    fake = bin_dir / "uvicorn"
    fake.write_text(FAKE_UVICORN)
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    renee = tmp_path / "renee"
    renee.mkdir()
    (renee / "app.py").write_text("# stand-in\n")
    log = tmp_path / "launch.log"
    base = {k: v for k, v in os.environ.items() if not k.startswith("RENEE_")}
    full = {**base, "PATH": f"{bin_dir}:{base['PATH']}", "LAUNCH_LOG": str(log),
            "RENEE_DIR": str(renee), "RENEE_MAX_RESTARTS": "1", "PORT": "9123", **env}
    subprocess.run(["sh", str(SCRIPT)], env=full, check=True, timeout=30)
    expected = 1 if env.get("RENEE_BUNDLED") == "0" or "RENEE_TTS_URL" in env else 2
    deadline = time.time() + 10
    while time.time() < deadline:
        lines = log.read_text().splitlines() if log.exists() else []
        if len(lines) >= expected:
            break
        time.sleep(0.05)
    time.sleep(0.2)
    return log.read_text().splitlines()


def test_bundles_renee_on_loopback_with_a_fresh_key(tmp_path):
    lines = run(tmp_path)
    renee = [line for line in lines if "app:app" in line]
    main = [line for line in lines if "apps.api.serve:create_app" in line]
    assert len(renee) == 1 and len(main) == 1
    assert renee[0].startswith(str(tmp_path / "renee"))
    assert "--host 127.0.0.1 --port 8001" in renee[0]
    assert "--host 0.0.0.0 --port 9123" in main[0]
    assert "url=http://127.0.0.1:8001" in main[0]
    key = main[0].split("key=")[1]
    assert len(key) >= 32 and f"key={key}" in renee[0]


def test_keeps_a_configured_key(tmp_path):
    lines = run(tmp_path, RENEE_TTS_KEY="configured-key")
    assert all(line.endswith("key=configured-key") for line in lines)


def test_external_voice_service_is_used_as_is(tmp_path):
    lines = run(tmp_path, RENEE_TTS_URL="https://renee.example", RENEE_TTS_KEY="k")
    assert len(lines) == 1 and "apps.api.serve:create_app" in lines[0]
    assert "url=https://renee.example" in lines[0]


def test_unbundled_image_starts_without_renee(tmp_path):
    lines = run(tmp_path, RENEE_BUNDLED="0")
    assert len(lines) == 1 and "url=|key=" in lines[0]
