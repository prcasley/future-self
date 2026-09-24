# Voice API v0.1

Local base: `http://127.0.0.1:8016`. Vite proxies `/api`. OpenAPI: `/openapi.json`; interactive docs: `/docs`.

`POST /voice/text_turn`: JSON `{session_id: UUID, text: string}` with 1–4000 characters. The text comes from browser speech recognition. UTF-8 SSE frames end with a blank line.

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
