# Integration review — September 24, 2026

Claude's latest two-commit patch is integrated on `feat/voice-foundation`:

- Crossing, scenario panels and Lab integration: `fe7f124`.
- Local portrait projection and voice-driven wardrobe: `20d4461`.

## Avatar choice

Keep Claude's integrated Three.js renderer. Antigravity's standalone renderer was preserved outside the repository and compared locally using the same browser-stored selfie, in casual and monarch outfits.

The Antigravity version shows a larger face but retains the room background, and its monarch collar covers the mouth. Claude's armor fits below the face and participates in the app's existing appearance and scenario state. Neither is a reconstructed 3D human. Both still need proper foreground isolation. The current close-up selfie produces a small, partially rectangular portrait with insufficient shoulders in Claude's renderer. This is a visible limitation, not a completed realism milestone.

The private comparison page is excluded from git and the production build. Personal photos were not added to source control.

## Integration corrections

- Clear the speaking animation when muting or starting another turn.
- Update the scenario voice reference immediately when streamed state arrives, before the next spoken sentence.
- Report failed photo persistence as page-only storage.
- Never claim successful photo deletion when IndexedDB deletion failed. Hide the portrait for the current visit and explain how to clear saved site data.
- Prevent a stale saved photo from overriding a newer page-only photo.

## Verification

- Backend: 35 tests passed; Ruff passed after patch integration.
- Frontend: 10 tests passed, including three storage failure/deletion regressions.
- Production TypeScript/Vite build passed. Existing bundle-size warning remains (approximately 759 kB uncompressed JavaScript).
- Actual selfie loaded through the app's local file picker and restored from browser storage.
- Both renderers inspected visually; casual and monarch outfit comparison completed.
- Real microphone recognition, audible reply quality, and interruption timing still require a live user speech test. Unit tests do not establish those outcomes.

## Next acceptance checks

In Chrome or Edge, open the local app and start a voice session. Test:

1. “I want to build my first app.”
2. “Show me my dream life.” Then “Come back.”
3. “Put on the monarch armor.”
4. “Make my aura gold.”
5. “Undo that.”
6. Mute during a spoken reply: speech and speaking animation should stop.
7. Hold Space during a reply, then speak a correction.

Check that captions, remembered state, appearance, and spoken responses agree. Record latency and failures before claiming the voice loop is ready for a demo.

For the next visual pass, use a clean head-and-shoulders foreground with enough space around hair and shoulders. Preserve recognizable facial proportions, then align outfit pieces to that shared frame. More particles will not fix foreground isolation or proportions.
