"""Run NVIDIA's PersonaPlex server (WebSocket /api/chat, web UI on :8998) on ECHO's 4-bit build.

    python services/echo-live/serve_q4.py --q4 work/echo-live/personaplex-7b-v1-q4.pt \
        --context 1500 --ssl "$(mktemp -d)"

Every other flag goes to `python -m moshi.server` unchanged (--host, --port, --ssl,
--voice-prompt-dir, ...). `offline` instead of the server: add --offline and the offline flags.
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("NO_TORCH_COMPILE", "1")  # NVIDIA's own docker-compose sets this too

import q4  # noqa: E402


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--q4", default="work/echo-live/personaplex-7b-v1-q4.pt")
    parser.add_argument("--context", type=int, default=1500,
                        help="frames of memory (12.5 per second). 3000 is NVIDIA's default; 1500 saves ~0.8 GB")
    parser.add_argument("--offline", action="store_true", help="run moshi.offline instead of the server")
    ours, rest = parser.parse_known_args()
    if not Path(ours.q4).exists():
        sys.exit(f"{ours.q4} not found. Run services/echo-live/quantize_q4.py first.")

    q4.use_q4_loader(ours.q4, ours.context)
    # Point moshi at the 4-bit file so it never downloads the 16.7 GB checkpoint.
    sys.argv = [sys.argv[0], *rest, "--moshi-weight", ours.q4]
    if ours.offline:
        from moshi import offline

        offline.main()
    else:
        from moshi import server

        server.main()


if __name__ == "__main__":
    main()
