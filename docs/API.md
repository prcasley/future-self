# Voice API v0.1

Local base: `http://127.0.0.1:8016`. Vite proxies `/api`. OpenAPI: `/openapi.json`; interactive docs: `/docs`.

`POST /voice/text_turn`: JSON `{session_id: UUID, text: string}` with 1–1500 characters. The text comes from browser speech recognition. UTF-8 SSE frames end with a blank line.

| Event | Payload |
| --- | --- |
| transcript | `{text, source: "browser_asr"}` |
| status / token | `{text}`; token text is not proof of a committed action |
| tool_call | `{name, args}` |
| tool_result | `{name, text}` |
| state | `{goals, facts, panel, pending, revision}` canonical state |
| sentence | `{text}` completed reply; currently one per turn |
| error | `{text}` safe error message |
| done | `{}` terminal event on normal/error completion |

Cancellation may end without `done`. Refresh `/state/{session_id}` after interruption because an already committed action remains committed and may be undone. Overlapping turns may receive HTTP 409.

`POST /voice/turn` accepts multipart `audio` and `session_id`, closes the upload, then emits `fallback` with `{fallback:"browser_asr", reason}` and `done`. No unverified Omni audio call occurs.

`GET /tts` returns 204 for browser synthesis. `GET /health` reports local process status and key configuration, not an upstream ping. `GET /ledger` returns the latest 30 backend call metadata rows. `GET /state/{session_id}` returns state.

These routes are for local development and have no public authentication.

## The Other Side and the Lab — v0.2

New tools the model may call: `cross(side)`, `return_home()`, `log_checkin(sleep_hours, energy, stress, effort_minutes, completed)`, `rate_intensity(rating)`, `set_lab_consent(yes)`, `wipe_lab()`. `show` accepts `otherside` and `lab`. Spoken shortcuts handled without the model: “come back”, “too much” / “just right” / “too little”.

The `state` event now carries `side`, `futures` (per-side summary: final, bands, stats, 13-point curves, narrative) and `lab` (consent, active policy, counts, last decision). Week-by-week detail is never in the state event.

| Route | Purpose |
| --- | --- |
| `GET /otherside/{session}` | Full 52-week detail for every simulated side, with disclaimer |
| `GET /lab/{session}` | Per-policy scorecard, bandit posteriors, last decision |
| `GET /lab/{session}/experiment?side=good` | Same side, three intensity policies in the simulator |
| `GET /lab/{session}/export` | Anonymized JSONL (check-ins, features, decisions, rewards) |

After a `cross` tool result the stream emits `status` “Crossing…” and the spoken `sentence` is ECHO speaking from that side.

## Portrait projection — v0.3

New tool: `set_appearance(outfit?, aura?)`. `outfit` is `casual` or `monarch`; `aura` is `cyan`, `violet`, or `gold`. At least one is required. It is undoable, and a repeat of the current look answers “That's already the look.” Spoken shortcuts handled without the model: “put on the monarch armor”, “suit up”, “take off the armor”, “go back to casual”, and any phrase with “aura” plus a colour (gold/golden/yellow, violet/purple, cyan/blue/teal). A look change expires a pending confirmation, like any new topic.

The `state` event now carries `appearance: {outfit, aura}`. The user's photo is **not** part of the API: the browser keeps it in IndexedDB, and the browser answers “forget my photo” / “use my face” itself without sending a turn.

## Golden ratio face scan — v0.4

`POST /scan/projection`: JSON `{session_id: UUID, ratios: {key: number}, side?: string}`. Extra fields are refused with 422, so an image, pixels or landmarks cannot be sent. `ratios` takes 1 to 7 of `faceRectangle`, `thirdsUpper`, `thirdsLower`, `lips`, `mouthNose`, `jawMouth`, `widthIpd`, each a finite number from 0.2 to 5; anything else is a 400. `side` is `dream`, `good`, `neutral` or `bad`; when it is absent or invalid, the session's current side is used, and if there is none, “your current path”.

Response:

```json
{
  "side": "good",
  "weeks": 52,
  "rows": [{"key": "faceRectangle", "now": 1.52, "future": 1.539, "chance": 70, "note": "steady drift toward Φ"}],
  "runner": "nemotron",
  "model": "nvidia/nemotron-3-super-120b-a12b",
  "disclaimer": "Illustrative projection, for fun. Not a measurement of worth, beauty or health, and not a prediction."
}
```

With a key set, one Super call writes the rows and is logged in the ledger. The server keeps every `future` within 8% of `now`, clamps `chance` to 5–97, replaces notes that are too long or mention appearance, health or age, and fills missing rows locally. Without a key, or if the call fails or streams bad JSON, `runner` is `local` and the rows come from a deterministic projection with the same shape. Nothing is stored.

## Your data — v0.5

`GET /export/{session_id}` returns everything the server keeps for the session as a JSON attachment (`the-other-side-export.json`): `{app, format: 1, exported_at, session, note, data}`, where `data` is the stored state (goals, facts, conversation context, undo snapshots, Lab, missions, schedule and messages, simulated sides, appearance, timezone). The photo is never on the server, so it is never in the export.

New tools: `export_data()` and `wipe_all_data()`. Spoken shortcuts handled without the model: “export my data”, “download my data”, “give me a copy of my data”; “delete all my data”, “delete everything”, “forget everything about me”, “delete my account”. Narrower requests (“wipe the lab”, “delete all my goals”, “forget my photo”) keep their own paths.

`export_data` changes nothing; the browser starts the download when it sees the `tool_call`. `wipe_all_data` always stages a spoken confirmation, whether the shortcut or the model asked for it. On “yes”, the server deletes the session's row (the model-call ledger holds no session data), and the turn's `state` event carries `wiped: true` once, so the browser deletes the photo from IndexedDB. A new topic expires the pending wipe.

## Hosted demo — v0.5

In the hosted build (`apps/api/serve.py`), every route above lives under `/api` on the same origin as the page, the same shape the Vite proxy gives in development. Everything except `GET /api/health` needs the demo password (HTTP Basic). `GET /health` now also reports `scope` (`hosted-demo` when a password is set) and `budget: {model_daily_cap, session_daily_cap, used_today}`. When a budget is used up, a turn that would need the model answers with a fixed message instead of calling it; deterministic shortcuts are unaffected. See `docs/DEPLOY.md`.
