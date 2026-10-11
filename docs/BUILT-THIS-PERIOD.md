# Built during the submission period

The whole project was built during the submission period. The hackathon's submission
period opened on August 26, 2026; this repository's first commit is September 22, 2026
(`ce89772`), and all of the project's own code, assets and documents came after it
(third-party models and libraries keep their own licenses). Git history is the complete
record; this file is a dated log of the larger steps, newest additions at the end.

## 2026-10-11 — Reneė on a real local CPU

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

## 2026-10-11 — Mouth follows Reneė's real audio

- Decode the returned WAV into 10 ms energy windows and sample them at the audio
  element's actual playback position. Smooth attack/release follows syllable volume
  and silence; this is amplitude sync, not phoneme/viseme synthesis.
- Share the same level ref with the main stage, `/ghost`, and all pyramid copies.
  Camera head tracking and blinking remain independent. No microphone analysis,
  photo upload, or per-frame React state updates are involved.
- Close the mouth while fetching, on completion, and immediately on interruption.
  Release interrupted audio URLs and avoid claiming service playback if play fails.
  Browser voice and unsupported audio decoding keep the existing rhythm fallback.
- Real Chrome verification: live Nemotron greeting, successful service WAV decode and
  completed playback; a second actual service sentence produced 33 sampled level
  frames, peak 0.988, ending at 0. Screenshot: `docs/voice/renee-speaking.png`.
- Validation: 57 web tests, 123 backend tests and production build passed. New tests
  cover real-sample energy math, silence, stereo phase, smoothing, head/blink preservation,
  rejected playback and interruption followed immediately by another sentence.

## 2026-10-11 — Optional Tavily links on mission cards

- Added `TAVILY_API_KEY` configuration and an explicit **Find sources** action.
  Only the displayed mission goal (at most 400 characters) goes to Tavily; the card
  explains this before searching. Nothing is sent automatically and memories,
  conversations, photos and camera frames are never part of this request.
- Use the real Tavily Search HTTP endpoint when configured. Show at most three
  deduplicated web links as related reading, not invented citations or a claim that
  Tavily generated the local mission. Successful/empty searches are cached with the
  mission; source metadata participates in the existing data export and deletion.
- Missing key, timeouts, upstream failures, malformed responses and empty results
  have explicit fallback messages. Missions and voice continue. Search does not hold
  the conversation lock while waiting; late results cannot overwrite a changed or
  deleted mission or undo its completion.
- Validation: 137 backend tests, 59 web tests, production build and lint passed.
  Contract tests use an explicitly fake HTTP transport and are not live-search proof.
  Real Chrome and API checks confirmed `not_configured`, no links, and a working
  mission. Screenshot: `docs/voice/mission-sources-fallback.png`.
- Still deferred for Claude: add the real Tavily key as a deployment secret, restart
  the API, refresh the page and run **Find sources**. No live Tavily request has been
  made; do not claim Tavily bonus eligibility until that runtime check succeeds.

## Local review state

Voice service: localhost:8000 (CPU). Verification API: localhost:8018 with isolated
`work/renee/live.db`. Verification web app: http://127.0.0.1:5189/ghost.
These are local development processes, not an installed auto-start service.
For the normal app, follow `services/renee-tts/README.md` and restart its API so it
reads the configured ignored `.env`. No changes were pushed.

## 2026-10-11 — A Jarvis-style conversation, with a real off switch

- Reneė now speaks each sentence as soon as it streams in from Nemotron instead of waiting for the
  whole reply, and the end of the reply never repeats what she already said.
- Barge-in: while she speaks, the microphone (browser echo cancellation on) is watched; sustained
  speech above the learned room level cuts her off and ECHO listens. Space and Interrupt ECHO still work.
- The mic is never permanently on: **Stop listening**, the spoken commands "stop listening",
  "goodbye ECHO", "that's all" and similar end listening and release the microphone, and ECHO
  pauses by itself after a quiet minute.
- Verified in headless Chromium against a test-only streaming stub: a three-sentence reply was spoken
  as three chunks while streaming, "stop listening" ended the session, and a quiet minute paused it.
  Barge-in itself needs a real microphone and speakers; ChatGPT on the PC tests it next.

## 2026-10-11 — Off switch always in reach, mic always released

Fixes from ChatGPT's source review of the conversation loop on the PC:
- `/ghost`: while projecting, a dim corner chip shows that ECHO is listening and keeps **Stop listening** one tap away
  (it used to sit inside the hidden controls). The session button there now says Stop listening too.
- A speech-recognition error or a failed start now ends the session properly, which also releases the separate
  barge-in microphone stream; before, that stream could stay open.
- Barge-in learns the room once per reply instead of again for every queued sentence, so talking over Reneė between
  sentences isn't missed. If barge-in clips the first word of a stop command ("…listening", "…all for now"), it
  still stops, but only right after a barge-in.
- Validation: 66 web tests and the production build pass. A real microphone and speakers are still needed to
  measure barge-in; that test is prepared on the PC.
