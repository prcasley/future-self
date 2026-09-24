# Hologram collaboration brief

The user asked Codex to collaborate with Antigravity on a substantially better hologram for FUTURE//SELF. The current geometric head and torso are a temporary placeholder.

Antigravity owns `src/Hologram.tsx`, new hologram-specific helpers/styles, and this task's visual notes. Codex owns `src/main.tsx`, global layout, API integration, validation and contest planning. Do not edit backend, secrets, local-data, git history, or unrelated projects. Do not commit or push; Codex will integrate the changes.

Build an original, recognizable sculpted human bust: connected head, neck and shoulders; visible brow, nose, cheekbones, lips, jaw and ears; good silhouette. A procedural mesh or point-sampled original geometry is preferable to an unlicensed external model. This is an abstract persona, not the user's likeness. Keep its appearance elegant rather than a medical model or uncanny photorealistic face.

Use Three.js ShaderMaterial for soft luminous round particles, restrained cyan/white highlights, depth falloff, fine scanlines, a 2-second materialization, subtle breathing and small head motion. Add tasteful orbital/projection details if useful. Keep dark navy and white design, legible captions, no giant bloom or full-screen flashing. Stop nonessential motion for reduced-motion users. Dispose GPU resources; resize safely; handle WebGL failure; cap DPR at 1.5. Target 60k particles desktop and lower mobile; measure rather than promise FPS.

Maintain named export Hologram and backward-compatible `active: boolean`. Add optional `mode: 'idle' | 'listening' | 'thinking' | 'speaking'` prop with distinct tasteful states. Speaking animation is state-driven, not a claim to measured speech amplitude. Codex will wire actual browser lifecycle events to mode.

Do not add typed input or extra user controls. Run the existing production build. Write a short `HOLOGRAM-RESULT.md` with files changed, asset provenance, limitations and verification. The preview runs at http://127.0.0.1:5186. Only edit this frontend workspace.
