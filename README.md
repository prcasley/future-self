# FUTURE//SELF

[MIT licensed](LICENSE) · Voice-only personal AI · NVIDIA Nemotron on Nebius Token Factory

## Planned experience

Speak with ECHO, a personalized future-self hologram. Set goals, create daily missions, report progress, and correct mistakes by voice. Persistent memory and explainable planning adapt missions to your available time and recent progress.

## Status

The first local prototype is runnable: browser speech input and output, streamed Nebius replies, persistent goals and explicit memories, spoken confirmation, undo, and a Three.js abstract presence. It is not yet the complete hackathon application.

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

Open **http://127.0.0.1:5186**, click Start session and allow your microphone. Try “My career goal is to build my first app. Save that goal,” then “Change my career goal to learning Python,” “Yes,” and “Undo that.” Also try “Remember I work best in the morning” and “Show my memory.”

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

This is a **single-user loopback-only development service**. Session IDs are not authentication. SQLite is stored in ignored `local-data/echo.db`; localStorage retains a browser session ID. Prompts and selected context go to Nebius. Browser recognition may process audio remotely; that traffic is outside the backend ledger. No analytics or remote font requests are included.

Forgetting removes an explicit fact from active recall and clears recent context and undo snapshots after confirmation. It is not secure disk erasure or deletion of provider records. Account-wide wipe/export, multi-device identity and authenticated deployment remain planned.

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

Nine offline backend tests and the frontend production build pass. The live synthetic goal/correction/confirmation/undo sequence passes. The page was inspected on desktop and at 400px. Physical microphone capture, speech audibility, recognition accuracy and end-to-end latency have not been verified.

## Next milestones

Real voice fixtures; Silero VAD and automatic barge-in; sentence-chunk playback; normalized SQLModel/FTS5 memory and Nano summaries; adaptive missions and capacity evidence; verified sandbox futures; portrait generation; inbox; privacy export/wipe; authenticated deployment and guided demo.

See [DECISIONS.md](DECISIONS.md), [Claude plan handoff](docs/PLAN.md), and [API contract](docs/API.md).

## License

[MIT](LICENSE). Third-party models and assets retain their own licenses.
