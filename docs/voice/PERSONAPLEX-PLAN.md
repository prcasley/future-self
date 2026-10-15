# ECHO Live: the PersonaPlex plan

Written 2026-10-12, status updated 2026-10-15. It covers whether ECHO can get a real-time,
full-duplex voice (one that listens and speaks at once, with no walkie-talkie turns) from NVIDIA
PersonaPlex-7B, and how to do it without risking the contest submission.

**Dates that bound this plan** (from `docs/SPRINT-TO-SUBMISSION.md` and `docs/CONTEST-READINESS.md`):
the submission is due **October 30, 2026** (internal target **October 28**). Judges use the hosted
build until judging closes on **December 15**. The first version of this plan treated December 15
as the deadline; it is not. Anything Live mode adds to the demo video has to work by October 28.

**Decision owner:** Prat. Section 7 lists the options to choose from.

## 0. Status on 2026-10-15

### Done

- **The 4-bit toolkit exists** in `services/echo-live/` (commit `e367d44`): `q4.py` (int4 format,
  packing for PyTorch's tinygemm kernel, runtime patch of moshi's three linear call sites),
  `quantize_q4.py`, `bench_realtime.py`, `serve_q4.py` and `make_voice.py`, plus a README with the
  WSL2 run steps and a memory budget.
- **The CPU tests pass for real.** `tests/test_echo_live_q4.py` ran on 2026-10-15 with torch 2.4.1
  and the pinned `moshi-personaplex` on Python 3.12: 6 passed, none skipped, so the CPU int4 kernel
  path and the tiny end-to-end round trip were exercised. The whole backend suite on this branch is
  157 passed. In environments without torch (the normal API test run) these 6 tests skip.
- **Pieces Phase 2 can reuse are already on main:** `/voice/text_turn` (Strategy B's Nemotron path),
  `/state/{session_id}` (the data the Live prompt builder needs), and loudness-driven animation
  (`apps/web/src/voice/envelope.ts`, and the Ghost rim glow that follows Reneė's loudness, `0e8dcd2`).

### Not done

- **Nothing has run on a GPU.** No quantized file, no `docs/voice/personaplex-q4-benchmark.json`,
  no measured VRAM or frame time. Every 4060 number in sections 3 and 4 is still an estimate.
- **The toolkit was not on main.** It lived only on the `echo-live-personaplex-q4` branch with no
  pull request; this PR brings it in. It is isolated (its own folder, tests that skip without
  torch), so the hosted build and the Railway image do not change.
- **No Live mode code:** no `GET /voice/live/prompt/{session}`, no `apps/web/src/voice/live.ts`, no
  `PERSONAPLEX_URL` setting.
- **No accent check:** nobody has heard PersonaPlex speak with `renee.wav` yet.
- **Not decided:** `docs/REMAINING-WORK.md` (October 13) says no new features before submission.
  Live mode is a new feature, so it needs Prat's go-ahead to be in the October 28 demo.

### Next milestone: Phase 1 on the 4060

One sitting on the PC, about an hour plus a 17 GB download. Done means all four of these are true:

1. `quantize_q4.py` finishes without an `int4 kernel mismatch`, and the file is about 5 GB.
2. `bench_realtime.py --out docs/voice/personaplex-q4-benchmark.json` is committed, with a verdict
   (PASS, BORDERLINE or FAIL), p95 frame time and peak VRAM.
3. A 2-minute conversation in NVIDIA's web UI with `renee.wav`, with a note on stutter and accent.
4. This file's sections 0 and 7 are updated with the result and the A1, A2 or stop choice.

Prerequisites only Prat can do: accept the license at huggingface.co/nvidia/personaplex-7b-v1,
create an `HF_TOKEN`, and have WSL2 Ubuntu with a current NVIDIA driver on the PC.

## 1. What PersonaPlex is (verified)

- **What it does:** NVIDIA released it in January 2026, built on Kyutai's Moshi. It is a single
  7B model that takes speech in and gives speech out. You set its role with a text prompt and its
  voice with an audio prompt, which can be any WAV (`load_voice_prompt` in `moshi/models/lm.py`).
- **Licenses and sizes:** the code is MIT and the weights use the NVIDIA Open Model License
  (gated on Hugging Face, reported to allow commercial use). The weights are about 16.7 GB in bf16.
- **Interface:** `python -m moshi.server` serves a web UI and `wss://host:8998/api/chat?text_prompt=…&voice_prompt=…`.
  The first byte of each binary message says what it is: `0x00` handshake, `0x01` Opus audio,
  `0x02` text of what it is saying.
- **Limits:**
  - It handles **one conversation at a time**: a server lock serializes sessions.
  - It has **no tool calling**.
  - Its 18 preset voices are all American-sounding.
  - Its memory window is 3,000 frames (4 minutes). After that, the persona prompt scrolls out
    of its attention.

## 2. Why it doesn't replace ECHO's brain

Nemotron 120B on Nebius Token Factory does ECHO's reasoning *and* its tools: goals, memories,
missions, the Crossing and the Lab. PersonaPlex can't call tools, and the submission is built on
Nemotron. So PersonaPlex can only be an **extra conversational voice layer**. Nemotron stays in charge.

## 3. Hardware facts

| | |
|---|---|
| RTX 4060 (desktop or laptop) | **8 GB** GDDR6. Windows and the display take 0.3–1 GB of it. |
| PersonaPlex bf16 | ~16.7 GB. It does not fit. |
| `--cpu-offload` | Fits, but very unlikely to hold 80 ms per frame over PCIe. |
| Community NF4 build | ~9.6 GB, because it unpacks the weights at load. It does not fit. |
| **Our 4-bit build (`services/echo-live`)** | **Estimated 6.8–7.2 GB at a 2-minute context.** Speed on a 4060 is not yet measured. |
| Railway | **No GPUs** (a forum report says the CEO said "not now"). PersonaPlex can never run there. |
| Nebius L40S, 48 GB | About $1.55/GPU-hour on demand according to third-party trackers (Oct 2026). Check the console. |

## 4. Our own 4-bit build

The code is in `services/echo-live/`; how to run it is in its README.

1. **Quantize once** on the PC. The script reads `model.safetensors` one tensor at a time (low
   RAM), applies the same weight patches as NVIDIA's loader, and stores every large matrix as
   4 bits per value, with a bf16 scale and zero per group of 128 values. That covers the main
   transformer (32 layers) and the depformer (6 layers × 16 per-step copies).
2. **Keep the weights packed on the GPU.** It uses PyTorch's built-in `_weight_int4pack_mm` kernel,
   which works with the CUDA graphs NVIDIA's code already uses. This is the step the community
   build skips, which is why it lands at 9.6 GB.
3. **No fork.** It patches three call sites in NVIDIA's code at runtime. Everything else, including
   the server, the web UI and voice prompts, is stock.
4. **Self-checks.** While quantizing, the script checks the packed kernel against the plain math on
   real weights and stops on a mismatch. Unit tests cover the math, the patching, and a tiny
   end-to-end model round trip.

Reneė's voice: `make_voice.py` gives PersonaPlex `docs/voice/renee-sample.wav` (Kokoro `bf_emma`)
as its voice prompt. No training is needed. **Risk:** the model learned mostly from American
speech, so the accent may drift.

What's out of scope: training a voice model from scratch (it needs millions of hours of audio),
and fine-tuning on British speech (it needs a 24–48 GB GPU, a dataset and weeks of work).

## 5. Strategies

### Strategy A: Live mode for the local demo, Railway unchanged

- The **hosted** build stays exactly as it is: Nemotron plus Reneė on Kokoro on CPU, in the
  single Railway container, so it uses no extra credits.
- The **demo PC** gets a "Live · PersonaPlex" toggle. It hides itself unless `PERSONAPLEX_URL`
  is set.
- **A1, the 4060 with our 4-bit build:** $0. Only if `bench_realtime.py` says PASS.
- **A2, a rented GPU only for demo hours:** a Nebius L40S running NVIDIA's `docker compose` (bf16,
  no quantizing needed), reached through an SSH tunnel (`ssh -L 8998:localhost:8998`). That's about
  $5 for a rehearsal plus the demo. **Stop the VM afterwards.** It fits the Nebius × NVIDIA story.
- **While Live mode is on, tools are unavailable.** Phrases like "save that as a goal" or "show me
  my dream life" drop back to the normal Nemotron loop. The browser's speech recognition keeps
  listening for them.

### Strategy B: hybrid (after judging)

PersonaPlex talks, and Nemotron listens to the same transcript and runs the tools in parallel:

```
Mic ──► PersonaPlex (GPU) ──► voice + captions                    (fast, full duplex)
  └──► browser speech recognition ──► /voice/text_turn ──► Nemotron + tools
                                          └─► state changed ──► reconnect PersonaPlex with a new text_prompt
```

- Tool confirmations show on screen, or play as a chime plus a caption, so two voices never
  overlap.
- After a tool runs, the app reconnects to PersonaPlex with a new `text_prompt`. That costs
  about 1–2 s, so it only happens then. The reconnect also restores the persona when the memory
  window rolls over.
- One GPU serves one conversation at a time, so public hosting needs a queue ("ECHO is with
  someone, you're next") and Kokoro-Reneė as the automatic fallback.

## 6. Build phases and decision gates

| Phase | Work | Gate |
|---|---|---|
| **0. Done** | 4-bit toolkit, this plan, and CPU unit tests (`services/echo-live`, `tests/test_echo_live_q4.py`). Tests verified passing 2026-10-15. | — |
| **1. Prove it on the 4060** (about 1 hour). **Next; not started.** | Run `quantize_q4.py`, then `bench_realtime.py`, then `make_voice.py`, then talk to it in NVIDIA's web UI. Commit `docs/voice/personaplex-q4-benchmark.json`. | **PASS:** Strategy A1. **FAIL:** Strategy A2, or stop. |
| **2. Live toggle** (1–2 days). Not started; must finish by about Oct 24 to make the Oct 28 video. | API: `GET /voice/live/prompt/{session}` builds the `text_prompt` from ECHO's identity, goals, memories and today's mission (under about 1,000 characters). Web: `apps/web/src/voice/live.ts` covers the WebSocket, Opus mic/playback, captions, the mouth driven by loudness, and the explicit "Live · PersonaPlex" label (the voice never switches silently). `.env`: `PERSONAPLEX_URL`, `PERSONAPLEX_VOICE=renee.wav`. Tests for the prompt builder and the message bytes. | A live 5-minute conversation on the demo PC with no stutter. |
| **3. Demo hardening** (half a day). Not started; by Oct 27. | A rehearsal script, a fallback to Kokoro if the socket drops, and an A2 VM snapshot ready as a backup. | Two clean rehearsals. |
| **4. Hybrid (Strategy B)** (4–6 days, after judging closes Dec 15) | Intent routing, re-prompting after tools, a queue, GPU start/stop scripts. | Product decision. |

## 7. Your decision

| | A1: the 4060 | A2: rented GPU | B: hybrid |
|---|---|---|---|
| Cost | $0 | about $5 per demo | about $1.55/hr while on |
| Fits 8 GB | Bench decides | n/a | n/a |
| Railway hosted | Unchanged | Unchanged | Railway plus a Nebius GPU |
| Reneė's accent | At risk in Live mode | At risk in Live mode | At risk; Kokoro is the fallback |
| Risk to the Oct 28 submission | Low (toggle) | Low (toggle) | High before judging ends |

**Recommendation (updated 2026-10-15):** run Phase 1 now, since it changes nothing in the hosted
build and settles the biggest unknown. If it passes and you want Live mode in the October 28 demo,
build Phase 2 as A1 and treat it as an exception to the no-new-features rule in
`docs/REMAINING-WORK.md`. If it fails, either build Phase 2 against A2 or keep Live mode out of the
submission and show it only after judging. Keep B for after December 15.

## Sources

- https://github.com/NVIDIA/personaplex (`server.py`, `models/lm.py`, `models/loaders.py`, `modules/transformer.py`, read at commit `3428dfd`)
- https://huggingface.co/nvidia/personaplex-7b-v1/discussions/33 (no official 8 GB build; FP8 for 16 GB planned)
- https://huggingface.co/brianmatzelle/personaplex-7b-v1-bnb-4bit (community NF4, ~9.6 GB)
- https://willitrunai.com/gpus/rtx-4060-8gb (RTX 4060 8 GB)
- https://station.railway.com/community/gpu-support-vllm-b92b5375 (Railway GPU status)
- https://computeprices.com/providers/nebius/gpus/l40s (Nebius L40S pricing)
