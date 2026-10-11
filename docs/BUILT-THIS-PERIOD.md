# Built during the submission period

This is an incremental record of work on the existing repository, not a claim that
the entire project was created during the hackathon. Earlier work is preserved in
Git history; submission-period eligibility and dates should be checked against the rules.

## 2026-10-11 — Renée on a real local CPU

- Ran the existing Kokoro `bf_emma` service for the first real audio test. Added a
  Windows venv launcher, bundled eSpeak support, explicit CPU execution and bounded
  synthesis concurrency so deployment does not depend on a GPU.
- Configured only ignored `.env` for the local service. No secrets committed.
- Saved the exact requested script to `docs/voice/renee-sample.wav` and measured
  local HTTP synthesis in `docs/voice/cpu-benchmark.json`: 1.866 s for the first
  4.875 s clip after model load; warm 2.425 s sentence median 0.738 s.
- Verified `/ghost` with a fresh Chrome context and the approved stand-in: real
  `/voice/connect` returned 200 from Nemotron on Nebius; real `/voice/tts` returned
  200; the audio element played and completed 11.05 s of generated greeting audio.
  Screenshot: `docs/voice/renee-live.png`. No model or speech responses were mocked.
  Browser playback was verified; a human listening test through the PC speakers
  remains useful for voice quality.
- Corrected the service label to “Kokoro”; a local service must not claim Nebius hosting.
- Validation: 123 backend tests, 51 web tests, production build passed. Existing
  Starlette deprecation and Vite large-chunk warnings remain. Docker build and hosted
  CPU deployment were not tested; this machine used the Windows venv.
- Verified the existing Weekly hackathon shortlist is active Mondays 09:00
  America/New_York, including DST, and checks Devpost, Nebius and NVIDIA for strong fits.

## Handoff to Claude

Tavily has no configured key. Do not claim a real Tavily search or bonus qualification
until a runtime call succeeds with a key. The user wants this deferred dependency
clearly called out; no key should be pasted into chat or committed.
