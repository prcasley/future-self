# FUTURE//SELF: contest readiness

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

Public MIT repository and draft PR; local voice-only stage; successful Super/Nano calls; streamed conversation/tools; SQLite goals and explicit memories; confirmation and undo; 9 backend tests and 2 stream-client tests. Desktop/400px layout inspected. This is a foundation, not a contest-ready product.

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
