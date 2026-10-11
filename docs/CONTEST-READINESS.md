# The Other Side (formerly FUTURE//SELF): contest readiness

Updated September 22, 2026. A competitive plan, not a promise of winning.

## Official requirements (checked against Devpost)

Submit by **October 30, 2026, 10:00 a.m. Pacific / 1:00 p.m. Eastern**. Keep our internal October 28 submission date. Judges evaluate technology, design, impact and idea quality equally; technology is the first tie-breaker.

- Working application using Nebius at runtime and at least one NVIDIA open model, fitting the chosen track.
- Working demo/test-build access, free to judges through December 15, with credentials if needed.
- Public licensed repository containing source, assets and run instructions; explain the NVIDIA/Nebius usage.
- Public YouTube demonstration under three minutes showing actual functionality, using permitted assets/music.
- Description, selected track, platform feedback, English materials or translations; explain pre-existing work if applicable.
- Tavily bonus eligibility requires a functional runtime Tavily call. City-award eligibility requires attendance at a participating event, not just registration.

Source: [Official rules](https://nebiusglobalaihackathon.devpost.com/rules). Eligibility, asset rights and submitted claims must also comply with those rules. Registration is user-reported complete; submission is not complete.

## What is already evidenced

Updated October 11: public MIT repository; streamed Nemotron 3 Super conversation with 14 server-validated tools; a live `/voice/connect` greeting verified on the PC; the living portrait and Ghost mode; Renée's real audio played in the app (warm sentence 0.74 s on CPU) with the mouth driven by her audio; the Crossing, the Lab, daily missions, export and delete; a hosted container with password lockout, daily model, voice and search budgets, and limited sessions when the model is out of budget, refused or unreachable. 151 backend tests, 59 web tests and the production build pass. Agent Factory launch reviews (privacy and security, cost, QA) ran on Oct 11 and their blockers are fixed. Not yet done: the Railway deploy, a real microphone and speaker test of the hosted build, a physical reflector, the video, and any test with real users.

## Remaining work, in priority order

| Priority | Deliverable | Evidence that it is ready |
| --- | --- | --- |
| P0 | Real voice loop | Record 20 real utterances first, then 50; replay transcripts/intents and manually test actual microphone, sound, accents, silence and corrections |
| P0 | Interruption and speed | Natural voice barge-in, cancel stale turns, queued sentence TTS, visible fallback; measure p50/p90 on real devices rather than promise latency |
| P0 | Restart-safe personal memory | Opening recap, explicit preference capture, corrected facts supersede old ones, forget never reappears, export/wipe tests |
| P0 | Speech-only onboarding | Judge can set a goal and receive one useful next action without forms or developer help |
| P0 | Personal AI action | Spoken progress changes a daily mission; one chosen schedule produces a useful in-app check-in, with user control |
| P0 | Explainable capacity decision | A spoken low-capacity report changes the plan, displays inputs/reasons and allows correction; no diagnosis or arbitrary claims |
| P0 | Judging deployment | HTTPS, per-user isolation/auth or isolated demo persona, quotas, timeout handling, durable storage, uptime and funded credits through judging |
| P0 | Honest demo | One reproducible end-to-end path; no mock tool results disguised as live integrations |
| P1 | Better hologram | Recognizable connected bust, expressive states, smooth materialization, mobile performance, reduced motion, original/licensed geometry |
| P1 | Futures differentiation | Three scenario branches with stated assumptions, real sandbox IDs/logs, deterministic seeded metrics; explain uncertainty |
| P1 | Useful research | Tavily powers a real mission step with accessible source links and a failure path |
| P1 | User evidence | 5–10 target users try the core flow; record where they get stuck, goal completion and repeat usage; distinguish feedback from proven outcomes |
| P1 | Submission pack | Clear audience/problem, screenshots, architecture/model table, measured latency, clean install verification, feedback report and video |
| P2 | Personalized portrait | Consented user photo or style choices; licensed assets; graceful no-photo path |
| P2 | Premium voice/extra models | Adopt only if measured benefit outweighs hosting complexity; no prize advantage assumed from model count alone |

## The strongest demonstration to aim for

The user describes a goal. ECHO remembers it, proposes a realistic mission, accepts a correction, and adapts when the user reports a difficult day. It explains that decision using the user's own inputs. The user compares three explicitly hypothetical futures, returns for a correct recap, and can remove a memory. The hologram reinforces this experience; every important behavior remains understandable through speech and captions.

## Product acceptance targets

- Two complete clean demo runs on the deployed URL without developer intervention.
- 50 utterance fixtures with expected intents, tool outcomes and confirmation behavior; no silent destructive changes.
- Published measured latency, recognizing that browser ASR and TTS vary by device.
- Mobile layout at 400px, visible keyboard focus, permission recovery and reduced motion.
- External service failure preserves saved data and yields a clear answer.
- Clean-machine setup works, secrets are excluded, model usage/cost is visible.
- Asset provenance documented; real tests separate from scripted demonstration data.

## Schedule and cuts

Aim to finish the voice/memory core by Oct 4, missions/judgment by Oct 11, futures by Oct 18, and freeze features Oct 23. Record and edit Oct 24–27; submit Oct 28; Oct 29 is buffer. If behind, simplify futures to three fixed templates and cut premium TTS, photo transformation and extra model integrations before cutting reliability or memory.

## User inputs still needed

Real voice recordings; a few honest daily reports; consented appearance reference if personalization is wanted; final preferences for check-in time; judging-account/deployment setup; feedback from target users. Credit applications are separate from credited balances, so confirm the actual balance before deployment.

## Integration update — September 23 (Claude)

Codex's priority #1 is done on branch `feat/the-other-side-integrated`: the Crossing and the Lab now run on top of the procedural bust, with the crossing ported into the shader rather than the old point cloud. Offline evidence only: 20 backend tests, 2 stream-client tests, ruff, type check and production build pass; a headless Chromium run with a scripted speech-recognition stub loaded a session on the dream side, heard "come back", returned home through the real API, and the crossing was captured at 0/25/50/75/100% under a paused clock. The only console error was Google Fonts being blocked by the test sandbox. Nothing here is evidence of real-microphone behavior, latency, or that the Lab improves decisions; priority #2 (real speech with the user's microphone) is next and belongs to the user. The table above is unchanged and remains the guide.

## Portrait update — September 23 (Claude)

Codex's likeness handoff to Antigravity is built on the same branch: tap **Photo**, and ECHO becomes a portrait projection of the user, with a voice-driven wardrobe (casual/monarch armor, cyan/violet/gold aura). The photo stays on-device. This moves P2 *Personalized portrait* (consented photo, original assets, graceful no-photo path) and part of P1 *Better hologram* forward. Offline evidence only: 35 backend tests, 7 web tests, build, and headless captures with a public-domain stand-in photo. It is not tuned on Prat's photo yet, which never left his computer. The table above is unchanged and remains the guide.

## Face scan update — September 24 (Claude)

Prat's golden-ratio face scan is built on the same branch. An on-device MediaPipe engine turns any photo into the hologram scan, maps Φ proportions with labeled callouts, and ends with a future projection written by Nemotron on Token Factory, which is the Nebius tie-in; Prat framed it as a marketing gimmick. The same engine gives the portrait a clean cutout. Offline evidence only: 49 backend tests, 21 web tests, build, and headless captures with the public-domain stand-in photo. Not yet tried on Prat's own photo.

## Update — September 25 (Claude)

Codex's priority #3 is in: spoken onboarding, missions sized by the Lab, recap, and in-app scheduled check-ins. Claude added export and delete of everything by voice, and a deployable hosted build: one container, a password gate, and daily model budgets (`docs/DEPLOY.md`). From the P0 list, the judging deployment now needs only the key rotation, a Railway project and a volume. The real-microphone test and one honest end-to-end demo run are still open. Evidence is offline only: 78 backend tests, 24 web tests, build, and the hosted build driven in a browser with a stand-in photo.
