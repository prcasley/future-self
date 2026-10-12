# ECHO Live: PersonaPlex in 4 bits on an 8 GB GPU

ECHO's experimental full-duplex voice. It uses NVIDIA PersonaPlex-7B (listens and speaks at the
same time), quantized by us to 4 bits so it can fit an 8 GB RTX 4060. This is a **local demo mode**.
The hosted Railway build does not use it and does not change: Railway has no GPUs, and Reneė stays on
Kokoro there.

The full plan, with both strategies, costs and decision gates, is in
[docs/voice/PERSONAPLEX-PLAN.md](../../docs/voice/PERSONAPLEX-PLAN.md).

**Status:** written and unit-tested on CPU in the cloud workspace. **Not yet run on a real GPU.**
The speed on a 4060 is unknown until `bench_realtime.py` runs on it.

## Files

| File | What it does |
|---|---|
| `q4.py` | The 4-bit format: quantize, pack for PyTorch's int4 kernel, load, and patch moshi's three linear call sites. |
| `quantize_q4.py` | Runs once. It reads the 16.7 GB checkpoint one tensor at a time and writes `personaplex-7b-v1-q4.pt` (about 5 GB). |
| `bench_realtime.py` | Is it fast enough? It times every 80 ms frame and reports PASS, BORDERLINE or FAIL, plus peak VRAM. |
| `serve_q4.py` | NVIDIA's server (web UI plus `wss://…:8998/api/chat`) running on the 4-bit file. Add `--offline` for the WAV-in/WAV-out script. |
| `make_voice.py` | Puts Reneė's WAV, plus NVIDIA's preset voices, in a folder the server can use. `--embed` precomputes `renee.pt`. |

## Run it (Windows PC with an RTX 4060, through WSL2 Ubuntu)

The server is Linux-first (it needs `libopus`), so use WSL2. Install a current NVIDIA Windows driver;
WSL2 then sees the GPU without a separate CUDA install.

```bash
# 0. WSL2 Ubuntu, from the repo root (e.g. /mnt/c/Users/<you>/future-self)
sudo apt update && sudo apt install -y libopus-dev build-essential pkg-config python3.12-venv
python3.12 -m venv work/echo-live/.venv && source work/echo-live/.venv/bin/activate
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cu124
pip install -r services/echo-live/requirements.txt
nvidia-smi                                   # should list the 4060 with 8188 MiB

# 1. License + token: accept at huggingface.co/nvidia/personaplex-7b-v1, then
export HF_TOKEN=hf_...                       # never commit it; .env is already ignored

# 2. Quantize once (downloads ~17 GB the first time; ~10-20 min)
python services/echo-live/quantize_q4.py --out work/echo-live/personaplex-7b-v1-q4.pt

# 3. Is it real-time? Close Chrome/OBS/games first: they use VRAM too.
python services/echo-live/bench_realtime.py --out docs/voice/personaplex-q4-benchmark.json

# 4. Reneė's voice
python services/echo-live/make_voice.py

# 5. Talk to it
python services/echo-live/serve_q4.py --voice-prompt-dir work/echo-live/voices --ssl "$(mktemp -d)"
# open https://localhost:8998, accept the certificate warning, pick voice renee.wav
```

`work/` is git-ignored. Never commit the 4-bit file or your token.

### Memory budget at `--context 1500` (estimate, not yet measured)

| Part | Size |
|---|---|
| 4-bit weights: 7.91B of the 8.37B values (main transformer plus depformer), at 0.53 bytes each | about 4.2 GB |
| bf16 embeddings and text head (0.46B values) | about 0.9 GB |
| Attention memory, 1,500 frames (2 minutes) | about 0.8 GB |
| Mimi codec, two copies | about 0.4–0.8 GB |
| CUDA context and graphs | about 0.5 GB |
| **Total** | **about 6.8–7.2 GB of 8 GB** |

`--context 3000` is NVIDIA's default: 4 minutes of memory, about 0.8 GB more. That is probably
too much for an 8 GB card that is also driving a display.

### If something goes wrong

| What you see | What to do |
|---|---|
| `CUDA out of memory` | Use `--context 1000`, close other GPU apps, and unplug the second monitor from the dGPU. |
| `FAIL` (p95 above 80 ms) | It's too slow for live. Use the rented-GPU path in the plan (about $1.55/hr on Nebius). |
| `was packed for … torch …` warning | You upgraded PyTorch. Re-run `quantize_q4.py`. |
| Choppy audio but `PASS` in the bench | Wi-Fi or the browser. Use a wired network and Chrome, and keep the PC on mains power. |
| The voice drifts toward an American accent | Expected risk. Try a longer or more British sample with `make_voice.py --wav`. |
| `int4 kernel mismatch` while quantizing | The GPU and PyTorch combination packs differently. Report it and stop: don't ship that file. |

## What the 4-bit build changes, and what it doesn't

- **Quantized to 4 bits:** every attention and feed-forward matrix in the main transformer and the
  depformer, plus the depformer's input and output projections. They use groups of 128 values with
  bf16 scales and zeros, and run on PyTorch's built-in tinygemm kernel. Quantizing checks the packed
  kernel against the plain math on real weights and stops if they disagree.
- **Left at full precision:** the text/audio embeddings, the text output head, norms, and the
  Mimi audio codec.
- **Not touched:** NVIDIA's code. We patch three call sites at runtime (`q4.patch_moshi`), so the
  pinned `moshi` package stays stock.
- **Quality:** 4 bits loses some fidelity. Compare by ear with `serve_q4.py --offline` on
  NVIDIA's test WAVs before demoing.

## Licenses

PersonaPlex code is MIT, and the weights use NVIDIA's Open Model License. Our 4-bit file is a
modified version of NVIDIA's model. Keep their license and notice with it, credit "NVIDIA
PersonaPlex-7B", and don't present it as an NVIDIA release. Read the license on the model card
before sharing the file. Reneė's sample is Kokoro-82M (Apache-2.0).
