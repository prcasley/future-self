# The Other Side — September 25 direction

ECHO becomes a photorealistic possible future you, with a restrained futuristic “sentient being” feel. Each side (dream, good, drift, hard road) has its own generated style. The intended live portrait follows the user's head and blinks, and moves its lips with ECHO's voice, like a Memoji interaction. Voice stays primary; an optional typing fallback is available.

Windows and a virtual-environment showcase come first. Keep React/Three.js/FastAPI and Nemotron on Nebius Token Factory, with NVIDIA technology. No Unity or Unreal product port. The hackathon target remains October 30; completion and judging success are goals, not guarantees.

Later target: Meta display glasses. Claude's handoff reports a web-app developer preview with camera/audio/video access; verify the actual device APIs and permissions before claiming compatibility. Browser support alone does not establish a working glasses experience.

## Rendering and consent

Photoreal source images come from a pluggable image model. Nemotron selects a structured look brief limited to wardrobe, grooming, lighting, posture and setting. Never infer or transform health, body shape or attractiveness from a future branch.

- local: brief only, deterministic when Nemotron is not configured.
- tokenfactory: text-to-image concept art; no identity claim and no reference photo accepted.
- endpoint: a configured identity-editing GPU endpoint on Nebius AI Cloud; requires explicit consent and a reference image on every request. Images are held in request memory only, never persisted by this API. Endpoint operators must separately disable retention and request-body logging.

Generated source images are not themselves live animation. Claude's browser renderer supplies that step. “Instant” is a latency goal to measure, not an implementation claim.

## Ownership

- Claude: browser live portrait in apps/web/src/living/*, webcam head/blink tracking, voice-driven mouth, no hologram shader.
- Antigravity/Gemini: look-development concept portraits, virtual environment and Blender assets.
- Codex: this vision and decisions, POST /future/portrait with budgets/consent/mocked tests, and optional Type instead posting through /voice/text_turn. Do not edit avatar/*, scan/* or living/*.

Unreal + MetaHuman and the NVIDIA Audio2Face-3D UE plugin are an optional cinematic showcase after the core works. The handoff reports UE 5.5+ for that plugin; the installed engine is 5.4.2, so this is not a ready integration.

## First acceptance target

One consented portrait generation, visibly labeled as illustrative styling, handed to the live renderer; reliable voice and typed fallback share memory and tools; each side differs in style without changing the person's anatomy. Measure generation latency, animation quality, likeness and webcam/voice behavior on the actual Windows demo device before widening the target.
