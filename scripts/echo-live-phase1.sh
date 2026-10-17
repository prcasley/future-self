#!/usr/bin/env bash
# ECHO Live Phase 1 in one command: prove 4-bit PersonaPlex on the RTX 4060.
# Run inside WSL2 Ubuntu 24.04 from the repo root:
#
#     export HF_TOKEN=hf_...          # read token, after accepting the license (see below)
#     bash scripts/echo-live-phase1.sh
#
# Safe to re-run: every step that already finished is skipped. It installs, checks your token
# and GPU, quantizes once (~17 GB download), benchmarks, builds Reneė's voice, then prints the
# command to talk to it. Checklist: docs/voice/PHASE1-CHECKLIST.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
WORK=work/echo-live
VENV=$WORK/.venv
Q4=$WORK/personaplex-7b-v1-q4.pt
BENCH=docs/voice/personaplex-q4-benchmark.json
LOG=$WORK/phase1.log
HF_REPO=nvidia/personaplex-7b-v1
mkdir -p "$WORK"
exec > >(tee -a "$LOG") 2>&1

step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nSTOP: %s\n' "$*"; exit 1; }

step "1/7 Checking the machine"
grep -qi microsoft /proc/version || echo "warning: this does not look like WSL2; continuing anyway"
command -v nvidia-smi >/dev/null || die "nvidia-smi not found. Install the current NVIDIA Windows driver, then reopen WSL."
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader \
  || die "nvidia-smi cannot see the GPU. Update the Windows NVIDIA driver and run 'wsl --shutdown'."
free_gb() { df -BG --output=avail "$1" | tail -1 | tr -dc 0-9; }
HF_CACHE="${HF_HOME:-$HOME/.cache/huggingface}"
mkdir -p "$HF_CACHE"
if [ "$(df --output=target "$HF_CACHE" | tail -1)" = "$(df --output=target "$WORK" | tail -1)" ]; then
  [ "$(free_gb "$WORK")" -ge 30 ] || die "only $(free_gb "$WORK") GB free; need about 30 GB (17 GB download, 5 GB output, venv)."
else
  [ "$(free_gb "$HF_CACHE")" -ge 20 ] || die "only $(free_gb "$HF_CACHE") GB free for the Hugging Face cache ($HF_CACHE); need about 20 GB."
  [ "$(free_gb "$WORK")" -ge 12 ] || die "only $(free_gb "$WORK") GB free under $WORK; need about 12 GB (5 GB output, venv)."
fi
[ -n "${HF_TOKEN:-}" ] || die "HF_TOKEN is not set. Run: export HF_TOKEN=hf_... (a read token from huggingface.co/settings/tokens)."

step "2/7 System packages (asks for your WSL password once)"
pkgs=(libopus-dev build-essential pkg-config python3.12-venv git)
missing=()
for p in "${pkgs[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
if [ ${#missing[@]} -gt 0 ]; then
  sudo apt-get update && sudo apt-get install -y "${missing[@]}"
else
  echo "already installed"
fi

step "3/7 Python environment"
if [ ! -x "$VENV/bin/python" ]; then
  python3.12 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"
if ! python -c "import torch, moshi; assert torch.__version__.startswith('2.4.1')" 2>/dev/null; then
  pip install --upgrade pip
  pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cu124
  pip install -r services/echo-live/requirements.txt
else
  echo "already installed"
fi
python -c "import torch; assert torch.cuda.is_available(), 'PyTorch cannot see CUDA'; print('PyTorch', torch.__version__, 'on', torch.cuda.get_device_name(0))" \
  || die "PyTorch cannot see the GPU. Run 'wsl --shutdown' in Windows, reopen Ubuntu, and try again."

step "4/7 Hugging Face access to $HF_REPO"
python - "$HF_REPO" <<'PY' || die "token or license problem (see the message above)."
import sys
from huggingface_hub import get_hf_file_metadata, hf_hub_url, whoami
from huggingface_hub.utils import GatedRepoError, HfHubHTTPError
repo = sys.argv[1]
try:
    print("signed in as", whoami()["name"])
except Exception as e:
    sys.exit(f"HF_TOKEN was rejected ({e}). Make a new read token at huggingface.co/settings/tokens.")
try:
    get_hf_file_metadata(hf_hub_url(repo, "voices.tgz"))
except GatedRepoError:
    sys.exit(f"License not accepted yet. Open https://huggingface.co/{repo}, accept, then re-run.")
except HfHubHTTPError as e:
    sys.exit(f"Could not reach {repo}: {e}")
print("license accepted, download allowed")
PY

step "5/7 Quantize to 4 bits (first run downloads ~17 GB; 10-20 min)"
if [ -s "$Q4" ]; then
  echo "already done: $Q4 ($(du -h "$Q4" | cut -f1))"
else
  # Write to a temp name and rename on success, so an interrupted run never leaves a "done" file.
  rm -f "$Q4.partial"
  python services/echo-live/quantize_q4.py --out "$Q4.partial"
  mv "$Q4.partial" "$Q4"
fi

step "6/7 Real-time benchmark. Close Chrome, OBS and games now: they use VRAM."
python services/echo-live/bench_realtime.py --q4 "$Q4" --out "$BENCH"

step "7/7 Reneė's voice"
python services/echo-live/make_voice.py --q4 "$Q4"

cat <<EOF

Phase 1 automated steps are done. Results: $BENCH (log: $LOG)

Last step, by ear (about 2 minutes):
  source $VENV/bin/activate
  python services/echo-live/serve_q4.py --voice-prompt-dir $WORK/voices --ssl "\$(mktemp -d)"
  then open https://localhost:8998 in Chrome, accept the certificate warning, pick renee.wav, and talk.

Then commit only the benchmark JSON:
  git add $BENCH && git commit -m "ECHO Live: Phase 1 benchmark on RTX 4060" && git push
EOF
