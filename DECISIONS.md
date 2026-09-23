# Implementation decisions — September 22, 2026

## September 23 update: Antigravity collaboration

At the user's explicit request, Antigravity implemented the procedural bust, shaders and hologram CSS in the frontend workspace. Codex wired lifecycle modes, reviewed the rendered result, corrected glow/geometry/framing, fixed reversed GLSL smoothstep bounds, and completed reduced-motion handling. Desktop and 400px views were inspected; production build passed and no browser console errors were observed. This replaces the earlier 24,000-point placeholder decision below. Physical audio and performance benchmarks remain outstanding.

- Read the full Claude war-room artifact: architecture, voice spec, all six sprint tabs, demo script and handoffs. Preserve voice and memory before futures.
- Use browser recognition because Omni was not in the account's live catalog. No GPU endpoint was started.
- Start with a small local SQLite state store. Normalized SQLModel/FTS5 entities remain future work. Public hosting needs authentication, ownership checks, quotas and a deliberate storage design.
- Stream text and assemble fragmented tool calls. Apply one tool per turn and commit before reporting success. Speech currently waits for the completed short answer; no sentence-chunk latency claim.
- Server owns confirmation. The model cannot confirm its own proposed mutation. A new topic clears pending confirmation even if the provider fails.
- Eight-second model attempt timeout, one retry before partial output. Avoid retrying after partial output to prevent duplicate responses.
- Forgetting clears conversation and undo snapshots to prevent resurrection of a forgotten fact. It is not secure erasure and cannot itself be undone.
- The abstract hologram uses 24,000 points. Portrait morphing and audio-amplitude response remain planned; this placeholder is not a representation of the user's appearance or measured progress.
- Included a small integration stage alongside the backend. No Antigravity agent or overnight job was launched.
- Use ports 5186 and 8016 to avoid other local apps.

## Findings

Super and Nano passed live checks. Correct Nano ID: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. Omni/flux were absent from the account's catalog; separate endpoints remain untested. No real voice fixture was supplied. Sandbox project ID is missing; no successful fork is claimed.

The first live correction test exposed a model asking for confirmation without staging the tool. Tightened tool instructions; the rerun correctly staged, confirmed and undid the replacement. Broader recorded-voice regression testing is still needed.

## The Other Side — September 23, 2026 (Claude, on top of PR #1)

- Product renamed to **The Other Side**. ECHO stays the character. FUTURE//SELF remains in the Devpost history as the working title.
- The Crossing is a deterministic local simulation first (`otherside.py`), seeded by (side, goals, policy) so a side replays identically and can be audited. Sandboxes are a runner behind the same script, not a dependency: no fork is claimed until a project ID exists and a fork succeeds.
- ECHO narrates a side with a second Super call constrained to the simulated numbers; on any failure the deterministic template postcard is spoken instead. The side persona is a system message; the server, not the model, owns `side`.
- Goal changes invalidate every simulated side. Crossing is undoable; simulations are cheap and re-run on demand.
- The Lab requires spoken consent (server-staged confirmation), stores only numbers and decisions, exports without free text, and wipes with confirmation. Rule policy is the applied default; the bandit and the model run in shadow so the logs support offline comparison.
- The model policy is best-effort and runs after the check-in answer is computed; it never blocks or changes what the user hears.
- Tool arguments may now be numbers or booleans; the server coerces them to strings and still validates against the advertised schema.
- **Integration (Sep 23, Claude, following Codex's priority #1):** the Crossing/Lab commit was re-applied on top of Codex's `feat/voice-foundation` head, which carries the Antigravity procedural bust. Codex's hologram is the base; nothing in its geometry, modes, materialization or reduced-motion handling was replaced. The crossing now lives in the shader as four uniforms — `uTint`, `uTintMix`, `uGain`, `uCross` — set per frame from the `side` prop (1.6 s scatter-and-reform, side light applied last so the emitter ring shifts too; no scatter under reduced motion). The stage passes `mode` (Codex's lifecycle wiring, with the `talking` state added so speaking re-renders) and `side` together. Footer keeps Codex's "original digital persona" label and adds "scenario, not prediction" on a side.
- The Lab remains a research prototype. No claim that it improves decisions until real longitudinal data exists (Codex's note, adopted).
