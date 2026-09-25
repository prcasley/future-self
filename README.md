# The Other Side

[MIT licensed](LICENSE) · Voice-only personal AI · NVIDIA Nemotron on Nebius Token Factory

Talk to the you on the other side of your choices. ECHO listens, remembers, simulates four possible years from your own goals, speaks to you from each one, and runs a live research study on when to push, maintain, or reduce. Formerly FUTURE//SELF.

## Planned experience

Speak with ECHO, a personalized future-self hologram. Set goals, create daily missions, report progress, and correct mistakes by voice. Persistent memory and explainable planning adapt missions to your available time and recent progress.

## Status

The local prototype is runnable: browser speech input and output, streamed Nebius replies, persistent goals and explicit memories, spoken confirmation, undo, a procedural Three.js human hologram, **the Crossing** (four simulated sides you can talk to) and **the Lab** (the push / maintain / reduce research instrument). The hologram is an original stylized persona with idle/listening/thinking/speaking states, per-side light during a crossing, reduced-motion support and responsive framing. Tap **Photo** and ECHO becomes a **portrait projection of you**, with a wardrobe you change by voice, and a **golden-ratio face scan** maps your proportions and projects them 52 weeks forward. Neither is a 3D reconstruction or phoneme lip-sync. The Lab is a research prototype: it needs real longitudinal data before anyone can claim it improves decisions. It is not yet the complete hackathon application.

## The Crossing

Say “show me my dream life”, “show me the good path”, “what if I drift”, or “show me the hard road”. ECHO runs a deterministic 52-week simulation of your goals on that side (`apps/api/otherside.py`), the hologram crosses over (the bust scatters and re-forms in that side's light, via shader uniforms on the procedural bust), and ECHO speaks to you **as that future self**, grounded only in the simulated numbers. Say “come back” to return. Every side is labeled a scenario from your own goals and stated assumptions, never a prediction, and the narration prompt forbids invented events, health outcomes, or shame.

| Side | Weekly hours | Consistency | Recovery discipline | Outside shocks |
| --- | --- | --- | --- | --- |
| Dream life | 12 | 90% | 85% | 5% |
| Good path | 7 | 75% | 70% | 8% |
| Neutral drift | 3.5 | 55% | 50% | 10% |
| Hard road | 1.5 | 35% | 30% | 15% |

Dynamics: progress has diminishing returns and momentum; strain rises with hours (pushing past the plan costs 1.8× more), falls with recovery; strain over 0.8 loses the week; three burnouts in eight weeks break the plan and lower consistency for good. With Lab consent, your real check-ins set the starting strain and momentum. The same engine powers the Lab's policy experiment. Sandboxes: when `NEBIUS_PROJECT_ID` is set the plan is to fork one Token Factory Sandbox per side and run the identical script there (runner `contree`); today the runner is `local` and says so in the state.

## The Lab

A research instrument inside the app. **Question:** can an agent infer when to push, maintain, or reduce goal intensity from longitudinal behavioral signals, better than a constant policy, without raising strain? Say “turn on the lab” (spoken consent required), then check in daily by voice: “slept six, energy three, stress four, forty minutes, done.” ECHO answers with tomorrow's call and its reasons. Three policies decide every day — a transparent capacity **rule**, a contextual **bandit** (Thompson sampling over capacity buckets), and the **model** (Nemotron, shadow only) — one is applied, all are logged. The next check-in scores yesterday's call; you can also say “too much”, “just right”, or “too little”. The Lab panel shows the decision, its evidence, a per-policy scorecard, and the same three policies run in the simulator. `GET /lab/{session}/export` returns anonymized JSONL with no goal text or facts. Design, hypotheses and limitations: [docs/LAB.md](docs/LAB.md).

## Your likeness: the portrait projection

Tap **Photo** and choose a picture of yourself. An on-device face engine (MediaPipe Face Mesh and Selfie Segmentation, served by this app, no CDN) finds your face, frames it on its landmarks, cuts you out with a person mask, and ECHO appears as a lit 2.5D hologram of you, with parallax, rim light, a reveal, and the same slice dissolve when you cross sides. Change the look like a character creator, by voice only: “put on the monarch armor”, “suit up”, “take off the armor”, “make my aura gold” (cyan, violet, or gold). Every armor piece, halo, and beam is drawn procedurally; there are no downloaded or game assets. **The photo never leaves your browser.** It is kept in IndexedDB, it is never sent to the API or the model, and “forget my photo” deletes it. Details, props, and limitations: [apps/web/src/avatar/AVATAR-RESULT.md](apps/web/src/avatar/AVATAR-RESULT.md).

## The golden ratio face scan

Right after you choose a photo, or when you say “scan my face”, a scan overlay pops up. A scan line turns your photo into a hologram, the 478-point face mesh draws in, and a golden spiral and the face's Φ rectangle appear. Then “GOLDEN RATIO (Φ) FACIAL MAPPING” lays out twelve labeled callouts, with real measurements in centimetres (the iris is the ruler) and seven proportions against Φ. Finally the **future projection** arrives: NVIDIA Nemotron on Nebius Token Factory projects each proportion 52 weeks out on your current side of the Crossing, with a chance for each, and a gold outline of your face morphs toward the projected shape. It is a marketing flourish and says so on screen. Only the seven ratio numbers go to the API, which refuses images, bounds every change to 8%, filters the notes, and falls back to a local projection offline. Say “close” to dismiss it. Details: [apps/web/src/scan/FACE-SCAN.md](apps/web/src/scan/FACE-SCAN.md).

## Planned stack

- React and Three.js for the voice stage and particle portrait.
- FastAPI for conversation and tool orchestration.
- NVIDIA Nemotron on Nebius Token Factory for reasoning.
- Speech recognition and synthesis providers to be selected after live capability and latency tests.
- Persistent goals, missions, preferences, and a reversible action history.

## Development

Requirements: Python 3.13, Node.js 22+, Chrome or Edge for voice recognition. From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env # first setup only; do not overwrite an existing key
```

Set `NEBIUS_API_KEY` in the ignored `.env` file. Start the API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8016
```

In a second terminal:

```powershell
cd apps/web
npm ci
npm run dev
```

Open **http://127.0.0.1:5186**, click Start session and allow your microphone. Try “My career goal is to build my first app. Save that goal,” then “Change my career goal to learning Python,” “Yes,” and “Undo that.” Also try “Remember I work best in the morning” and “Show my memory.” Then “Show me my dream life,” “Come back,” “Turn on the lab,” “Yes,” and “Check in: slept six, energy three, stress four, forty minutes, done.” Tap **Photo**, then say “Scan my face,” “Close,” and “Put on the monarch armor.”

Press Space with the page focused to interrupt ECHO. Mute silences output; End session stops recognition. Recognition pauses during playback to avoid transcribing ECHO's own speech. Automatic barge-in is still planned.

Never commit API keys, private photos, recordings, or personal account data.

## Verified models — September 22, 2026

| Role | Exact ID | Evidence |
| --- | --- | --- |
| Conversation and tools | `nvidia/nemotron-3-super-120b-a12b` | Catalog, reply and tool conversation passed |
| Planned summaries | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Catalog and reply passed; app integration pending |
| Planned Omni audio/vision | Not configured | No Omni entry returned by this account's model catalog |
| Planned images | Not configured | No flux entry in the same catalog; image endpoint untested |
| Speech output | Browser `speechSynthesis` | Client path implemented; physical audio test pending |
| Planned futures | ConTree SDK | Installed during setup; hosted fork test needs project ID |

API base: `https://api.tokenfactory.nebius.com/v1`. Catalog absence does not establish that a separate endpoint is unavailable.

Initial single-call observations: Super 4,531ms and Nano 486ms. With thinking disabled, a later goal save completed in 1,595ms and correction in 1,457ms; local yes/undo took about 6ms. These are individual API observations, not voice latency or p90 benchmarks. Plan targets remain 2.5s stop-to-transcript, 1.5s transcript-to-first-token, 3.5s stop-to-audible and 0.2s interruption.

## Architecture and privacy

Browser recognition → transcript → FastAPI → SQLite context → Nebius Super stream → validated tool → committed state → captions and browser speech.

This is a **single-user loopback-only development service**. Session IDs are not authentication. SQLite is stored in ignored `local-data/echo.db`; localStorage retains a browser session ID. Prompts and selected context go to Nebius. Browser recognition may process audio remotely; that traffic is outside the backend ledger. No analytics are included. The one remote request is the Google Fonts stylesheet. A photo chosen with **Photo** is processed and stored only in the browser (IndexedDB) and never reaches the backend; the face engine's model files are served by this app. The server keeps only the outfit and aura names, and the face scan sends it only seven ratio numbers (which the model sees, with the side).

Forgetting removes an explicit fact from active recall and clears recent context and undo snapshots after confirmation. Say “export my data” and the browser downloads everything the server keeps for your session as JSON. Say “delete all my data” and, after a spoken yes, the server deletes the session's stored row and the browser deletes your photo. None of this is secure disk erasure or deletion of provider records. Multi-device identity remains planned.

## Validation

```powershell
python -m pytest -q
python -m ruff check apps/api tests scripts
python scripts/verify_models.py          # catalog only
python scripts/verify_models.py --ping   # two small paid inference calls
python scripts/smoke_voice.py            # requires running API; synthetic live conversation
cd apps/web
npm run build
```

Forty-nine offline backend tests (voice foundation, the Crossing, the Lab, the wardrobe, the face-scan projection), twenty-one web unit tests (`node --experimental-strip-types --test tests/*.test.mjs`: stream client, portrait framing/matte, golden-ratio measurement, scan layout, the projected face) and the frontend production build pass. The live synthetic goal/correction/confirmation/undo sequence passes. The page was inspected on desktop and at 400px. Physical microphone capture, speech audibility, recognition accuracy and end-to-end latency have not been verified.

## Next milestones

Real voice fixtures; Silero VAD and automatic barge-in; sentence-chunk playback; normalized SQLModel/FTS5 memory and Nano summaries; missions generated from goals and adapted by Lab decisions; sandbox-backed sides with real image IDs; landmark-driven head turns and jaw motion for the portrait; inbox; privacy export/wipe; authenticated deployment and guided demo.

See [DECISIONS.md](DECISIONS.md), [Claude plan handoff](docs/PLAN.md), [API contract](docs/API.md), [Lab research design](docs/LAB.md), and [prioritized contest checklist](docs/CONTEST-READINESS.md).

## License

[MIT](LICENSE). Third-party models and assets retain their own licenses.
