# ECHO: September 28 readiness review and remaining work

Fresh checks on September 28: 103 backend tests, 38 frontend tests, Ruff and production build pass. These are code checks, not evidence of microphone quality, likeness, real deployment or research efficacy. Existing Python deprecation warnings and a large Three.js/living-portrait bundle warning remain. User-owned untracked Claude outputs were not modified.

Official deadline: October 30, 2026 at 10 AM Pacific / 1 PM Eastern, verified from https://nebiusglobalaihackathon.devpost.com/rules. September 28 to October 30 is 32 days, or 33 dates counting today. Internal submission target: October 28.

## Phone delivery gate

The app needs a reachable HTTPS origin. Desktop localhost and a plain HTTP LAN URL are not a phone microphone solution. The existing one-origin hosted server includes a password gate, durable-volume deployment instructions and model-call budgets. Deployment is not verified. Prior user restrictions on pushing and secrets remain in force pending clarification; no public exposure or credentials changed during this review.

Added touch-accessible interruption and an HTTPS check before microphone startup. These are manual interruption controls, not automatic voice barge-in. Browser speech recognition has limited availability: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition . Secure media context requirements: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia . Test the actual phone browser; do not infer support from desktop tests.

Acceptance: secure URL loads on cellular; authorized access works; microphone permission works; user hears opening recap; 20 spoken utterances including corrections and pauses; tap-to-interrupt; screen rotation; background/return; denied-permission recovery; local photo, scan and living portrait visible. Capture latency and failures. Do not promise lock-screen or background conversation.

## Nebius and NVIDIA integration inventory

- Implemented: Nebius Token Factory chat-completions client with configured NVIDIA Nemotron model IDs, streaming tools, error handling, model-call budgets and metadata ledger. Earlier live calls were recorded; this review made no new paid calls and does not verify current credit/key validity.
- Implemented: Nemotron-backed scenario narration, Lab shadow recommendations, and ratio projection, with labeled local fallbacks. Verify provider calls and provenance on the deployed build after authorization.
- Missing: actual Token Factory Sandbox/ConTree scenario execution and saved run/image IDs. Current scenario engine runs locally. A project ID alone does not implement the runner.
- Unverified/missing: NVIDIA audio-input and TTS endpoints. Current ASR and TTS are browser services. Do not label them NVIDIA-powered.
- Future image: code supports a local brief, Token Factory concept art, or a separate identity-preserving HTTPS endpoint with per-request consent. Default is local. Likeness generation requires a configured provider and a real successful result; no such result was verified here.
- Tavily mission research remains outstanding. Decide whether to implement it within scope or omit bonus claims.

These are model/API/runtime integrations, not one universal Nebius/NVIDIA protocol. Complete and demonstrate each selected path separately.

## AI research workstream

1. Freeze a written evaluation protocol before collecting user outcomes. Version code, prompts, model IDs and settings for every run.
2. Agent understanding benchmark: start with 20 real utterances and expand to at least 50 across goal creation, ambiguous wording, correction, confirmation, undo, forgetting, scheduling and interruptions. Separate transcript accuracy from correct intent/tool/state changes. Report denominators, failure cases, and median/p90 end-to-end latency. Hold out paraphrases from prompt tuning.
3. Model comparison: run the same consented or synthetic text tasks through selected Nemotron models and a deterministic shortcut baseline. Record correctness, latency and cost. No personal photos or raw voice recordings sent to model providers without explicit scope and consent.
4. Lab pilot: recruit 5–10 willing users after basic usability works. Participation and check-ins are optional. Record completion, perceived fit and self-reported strain, missing days and overrides. Start with the transparent rule; keep model/bandit recommendations in shadow unless a separately specified study authorizes applying them.
5. Do not claim shadow logging proves that an unapplied policy would improve completion. Only the applied action has an observed outcome. Simulator comparisons measure behavior of the simulator, not real-world benefit. Small convenience samples support feasibility findings, not causal or clinical claims.
6. Visual study: ask whether participants recognize themselves, understand that futures are fictional, and find animation distracting. Golden-ratio targets and generated chance percentages are not research evidence, biological forecasts or attractiveness measures. Keep this separate from the agent/decision research.
7. Produce a short research report: question, methods, consent/data handling, model versions, sample/task counts, results, failure taxonomy, limitations and reproducibility instructions. Publish only aggregate/de-identified results with participant permission.

## Dated execution plan

| Dates | Deliverable and exit evidence |
|---|---|
| Sep 28–Oct 2 | Phone access approval/deployment, actual mic and selfie tests, verified current model calls, evaluation protocol and first 20 voice cases |
| Oct 3–9 | Fix understanding/latency/interrupt failures; first successful consented future portrait; 50-case benchmark; recruit pilot users |
| Oct 10–16 | Daily-use pilot; model comparisons; implement and verify sandbox/Tavily paths only if retained in scope |
| Oct 17–22 | Evaluate results, fix highest-impact failures, mobile/performance/privacy/deployment checks; two complete demo rehearsals |
| Oct 23–27 | Feature freeze; research write-up, screenshots, model/architecture table, reproducible setup, under-three-minute real demo video |
| Oct 28 | Submit; verify judge access and all required materials |
| Oct 29–30 | Submission/access buffer, no major feature additions |

Current next step is user-visible phone testing, not more optional avatar features. Do not mark phone delivery complete until Prat can open the HTTPS URL and speak to ECHO.
