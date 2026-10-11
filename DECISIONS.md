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

## September 29, 2026 — ECHO is a living photoreal portrait by default (Claude, now owning the face)

- Prat's verdict on the wireframe bust and the teal projection: ugly. From now on the main stage renders `living/LivingPortrait` (photoreal, blinks, breathes, talks, follows the viewer's head) in a lit virtual room with the side's light. The teal projection ("Hologram") and the procedural bust stay one button away; nothing was deleted.
- The future gallery: one face per side. Sources, in order: faces the user sets in this browser (IndexedDB, same store as the photo; "Set dream face" on the stage, or "Use as my dream face" under a generated preview), the developer's private gallery (`private/media/portraits/{home,dream,good,neutral,bad}.jpg`, gitignored, served by a dev-only Vite middleware, never built into the hosted demo), then the user's own photo. Crossing dissolves one face into the next. "forget my photo" and "delete all my data" clear the gallery too.
- Prat's four portraits were generated in Gemini (Nano Banana, his consumer quota) from his own headshot with style-only prompts: identity, age, glasses, skin tone and body kept; wardrobe, grooming, lighting, posture and setting per side. They live only in `private/`.
- Crossing requests ("show me my dream life", "what if I drift", "show me the hard road", "what happens if I quit") are now deterministic shortcuts in the API. Nemotron had narrated a dream life inline without calling `cross`, so the stage never changed; the tool call is no longer left to the model.
- New voice commands, all local: "follow my head" / "stop following", "hologram mode" / "real mode".
- Owner: Claude owns ECHO's face end to end (stage, gallery, portraits). ChatGPT is off this workstream.

## September 25, 2026 — photoreal future portraits

- Adopt docs/VISION.md: photoreal generated source portraits, voice first with optional typing, Windows web product first, glasses later after device validation.
- Keep React/Three.js/FastAPI and Nebius/Nemotron. Blender assets and a virtual environment are Antigravity/Gemini's work; live portrait tracking/animation in living/* belongs to Claude. Unreal is an optional later showcase.
- Codex adds a style-only JSON brief and pluggable local/tokenfactory/endpoint portrait API. Server defaults to local; reference images require per-request consent and only go to the configured identity endpoint. No portrait persistence or paid verification calls.
- Reserve model/image slots in daily budgets before generation; log metadata only. See docs/FUTURE-PORTRAIT.md for the adapter contract and operational limits.

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

## Portrait projection — September 23, 2026 (Claude, finishing Codex's handoff to Antigravity)

- Prat asked for a hologram that looks like a real person, with his face as the example and RuneScape-style swappable parts. Codex wrote the spec and handed it to Antigravity, then hit its usage limit; Antigravity stopped at a permission prompt to read the photo. Claude built the spec in `apps/web/src/avatar/` so it could ship through the integrated branch.
- Likeness first: the face is the photo's own pixels on a displaced plane (a dome-and-nose depth prior), so it is recognizable immediately and honestly labeled "portrait projection", not 3D reconstruction or lip-sync.
- Local only: framing, matting and storage happen in the browser; the photo never reaches the API, the model, or the ledger. The server stores only the slot names. Photo voice commands are answered client-side for the same reason.
- No ML dependency for v1. Face finding is a skin-chroma heuristic with a hair check; the matte keys the photo's own background only in the head's outer ring and the body's rim, so the face core is never keyed out. A bundled segmentation model is the next step if the heuristic misses on real photos.
- Parts are procedural canvas drawings (original shapes, the chosen violet/gold palette, no provider logos, no game assets), one plane per part at its own depth so parallax separates them. Outfit and aura are separate slots so more pieces can be added the same way.
- Codex's point bust stays the default whenever no photo is set, and it takes the aura colour too.

## Golden ratio face scan — September 24, 2026 (Claude, from Prat's brief to Codex)

- Prat asked for an engine that turns any photo into the blue hologram-scan look of his reference picture, and an animated pop-up that maps the golden ratio on the user's face with labeled callouts, ending with how their features could change in the future. He set the framing: the future part is **a marketing gimmick**, and it must run on the Nebius agent. It is built exactly that way, and the screen labels it illustrative every time.
- On-device engine: MediaPipe Face Mesh (478 landmarks with irises) and Selfie Segmentation, the official Apache-2.0 packages, pinned, served by this app from `/mediapipe/` (a Vite plugin in dev, copied into `dist/` on build). There is no CDN, so the photo and the page never talk to a third party. The heuristic face finder and matte stay as the fallback.
- One analysis per photo, shared: the portrait projection now frames on landmarks and cuts out with the person mask. This fixes the background artifacts Codex found in review, and draws the mesh on the hologram.
- Measurements are real: centimetres use the iris (about 11.7 mm) as the ruler, and ratios are shown as `calculated / Φ target`. There are no beauty scores, match percentages or rankings.
- The future goes through Nemotron on Token Factory, but the server owns the numbers. Only seven ratios are sent (the request model forbids extra fields). Changes are clamped to 8%, notes are filtered, and a deterministic local projection fills gaps and runs offline. The side of the Crossing steers the drift, so the scan belongs to the same story as the four futures.
- The gold outline morph is solved from the projected ratios (re-measuring it returns them), so the picture never disagrees with the numbers.
- Layout: landscape with callouts beside the face on desktop; on phones, numbered badges plus a readable list, because side callouts cannot fit legibly in 360 px. Text is white on dark, per Prat's readability preference.

## Export, wipe, and the hosted demo — September 25, 2026 (Claude, while Codex was out of credits)

- Codex finished its priority #3 on September 24: spoken onboarding, daily missions sized by the Lab, recap, memory corrections, and in-app scheduled check-ins. Claude reviewed both commits, re-ran every check (58 backend, 24 web, build), and formatted them with Ruff and Prettier. The formatting-only change is a separate commit.
- Whole-account privacy by voice: “export my data” downloads the full stored state as JSON; “delete all my data” deletes the session row after a spoken yes, and the browser deletes the photo. The model may propose a wipe, but only the user's spoken yes executes it, the same rule as every destructive tool. Lab-only wipes keep their own path.
- Hosted demo as one container: the API is mounted under `/api` beside the built page and the face engine's files, so the site has one origin, one HTTPS certificate, and one microphone permission. HTTP Basic is the gate. It needs no front-end work, browsers send it with the voice stream, and it leaves the health check open for the platform. The server refuses to start without a password unless `DEMO_OPEN=1`.
- Credits are protected by two daily budgets, a global one counted from the ledger and a per-session one counted in memory. Local runs have none. Over budget, ECHO says so and the deterministic commands keep working.
- The image runs as root, because Railway mounts volumes root-owned. SQLite on a `/data` volume is enough for a single-instance demo.
- Docker Hub is blocked in Claude's build environment, so the image was verified by reproducing each stage in a clean directory and driving the running server in a browser. The first real deploy should repeat the judge checklist.
