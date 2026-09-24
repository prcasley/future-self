# Golden ratio face scan — result

Built by Claude on September 24, 2026, from Prat's brief to Codex: an engine that turns any photo into the blue hologram-scan look of his first reference picture, then an animated overlay that maps the golden ratio (Φ) on the user's face with labeled callouts like his second reference, and shows how the face's proportions could change in the future. Prat set the framing: the future part is a **marketing gimmick**, and it must run on the Nebius agent.

## What the user sees

Tap **Photo** (or say "scan my face" once a photo is set). The overlay pops up:

1. **Sweep:** a scan line passes down the photo and turns it into the hologram (the person cut out, in the aura colour, with scanlines) over a dark stage with a floor grid and a projector pedestal.
2. **Mesh:** the 478-point face mesh draws in from top to bottom, then the key landmarks light up.
3. **Guides:** the midline, the five horizontal level lines (hairline, nose bridge, nose base, lips, chin), the face's Φ rectangle, and a golden spiral fitted inside it.
4. **Title and callouts:** "GOLDEN RATIO (Φ) FACIAL MAPPING", then twelve labeled boxes pop in one after another (six on a phone). Each box has a leader line to its landmark, a real measurement in centimetres, or a ratio shown as `calculated / Φ target`.
5. **Future:** a banner reads "FUTURE PROJECTION · +52 WEEKS · <side>", every ratio box gains a line like `→ 1.21 · 59% chance`, and a **gold outline of the face morphs** between the face now and the projected shape.

A banner line names the source: "PROJECTED BY NVIDIA NEMOTRON · NEBIUS TOKEN FACTORY", or "LOCAL PROJECTION · NEBIUS NOT CONNECTED" when no key is set. The fine print always shows: "Illustrative projection, for fun. Not a measurement of worth, beauty or health, and not a prediction."

Voice: "scan my face", "golden ratio", "map my face" open it; "close", "done", or Escape closes it. On desktop the stage is landscape with callouts beside the face. On a phone it is 4:5 with numbered badges on the face and the readings listed underneath in plain white text.

## The engine

`faceEngine.ts` runs two official MediaPipe solutions in the browser (Apache-2.0, pinned versions, served by this app from `/mediapipe/`: no CDN, and the photo never leaves the device):

- **Face Mesh** `@mediapipe/face_mesh@0.4.1633559619`, with refined landmarks, gives 478 points, including both irises.
- **Selfie Segmentation** `@mediapipe/selfie_segmentation@0.1.1675465747`, general model, gives a soft person mask.

`analyze.ts` runs each photo once and shares the result with the portrait projection, so the portrait also gets landmark framing and a clean cutout from the mask. If the engine cannot load (no WebGL, missing files, or more than 25 s), both features fall back to the earlier heuristic face finder and matte. If only the mask fails, the landmarks are kept.

A Vite plugin serves the two packages from `node_modules` in development and copies them into `dist/mediapipe/` on build. After pulling, run `npm install` in `apps/web` once to fetch them.

## The measurements

`goldenRatio.ts` is pure and unit-tested. The visible iris is about 11.7 mm across in most adults, so the average iris diameter in pixels is the ruler that turns distances into centimetres. It measures 14 distances and seven ratios:

| Ratio                  | Formula                            | Target         |
| ---------------------- | ---------------------------------- | -------------- |
| Full face Φ rectangle  | face height / face width           | 1.618          |
| d2 / d3                | hairline→bridge / bridge→nose base | 1.618          |
| d4 / d3                | nose base→chin / bridge→nose base  | 1.618          |
| Lip Φ ratio            | lower lip / upper lip              | 1.618          |
| Mouth to nose width    | mouth width / nose width           | 1.618          |
| Mandibular contour & Φ | jaw width / mouth width            | 1.618          |
| Facial width & Φ       | face width / pupil distance        | 2.236 (2Φ − 1) |

These are the ratios popular "golden ratio face" charts use. The app shows them as numbers against a target. It never shows a beauty score, a percentage "match", or a ranking.

## The future (the gimmick), on the Nebius agent

`POST /api/scan/projection` receives **only the seven ratio numbers**, plus the side. The request model forbids extra fields, so an image or pixel field is refused with 422. With a key set, NVIDIA Nemotron on Nebius Token Factory writes one row per ratio: a future value, a chance, and a short note. The side of the Crossing steers the drift: the dream side drifts toward Φ with high chances, and the hard road drifts slightly away. The server then enforces the rules:

- every future value stays within 8% of today's value;
- a chance is an integer from 5 to 97;
- a note longer than 60 characters, or one that mentions beauty, attractiveness, age, weight, skin, health, diet, surgery or flaws, is replaced;
- a missing or invalid row is filled from a deterministic local projection;
- if the model fails or its stream is malformed, the whole answer is local and says `runner: "local"`.

The call is logged in the ledger like every model call.

`future.ts` turns the rows into the gold outline. It reshapes the landmarks in the face's own frame, so a tilted head works. It uses piecewise vertical knots for the thirds, the height and the lower lip, cheek width outside the pupils, mouth width near the mouth, and jaw width fading in below it. Each edit is solved so that re-measuring the reshaped face gives the projected ratios; tests check this within 1.5%, upright and tilted 14°. The outline is honest to the numbers, so it moves a few percent at most.

## Files

- `faceEngine.ts`: MediaPipe loaders, a serial queue (the two legacy solutions share global loader names), `readFace`, `segmentPerson`, mesh edges and contours.
- `analyze.ts`: one cached analysis per photo, timeouts, fallback.
- `goldenRatio.ts`: landmark indices, distances, ratios, the numbers-only projection input.
- `hud.ts`: callout content, two-column layout without overlaps, phone badges, timeline, and the golden spiral.
- `future.ts`: the projected face and the blend between now and then.
- `FaceScan.tsx` / `.css`: the overlay, including the hologram and backdrop canvases, the mesh animation, the SVG HUD, the phone list, focus handling, and reduced motion.
- `apps/api/scan.py`: validation, the Nemotron prompt, parsing and clamping, and the local projection.

## Verified (offline)

- 49 backend tests (14 new: validation, local determinism and bounds, clamping, the banned-words filter, the endpoint with and without a key, an image field refused, fallback when the model fails or streams bad JSON). 21 web tests (14 new: iris scaling, the seven ratios, no-ruler, closeness bounds, numbers-only input, landmark framing, callout content, layout inside the view and clear of the face, phone badges, the spiral's Φ steps, the future face upright and tilted, blend, caps). Ruff, Prettier, `tsc`, and the production build (with `dist/mediapipe/`) pass.
- Headless Chromium (SwiftShader) with the public-domain NASA stand-in portrait, through the real Photo button:
  - every phase captured on desktop (1100×820), including the sweep caught mid-pass;
  - the phone layout at 400 px, scrolled to the end of the list;
  - reduced motion, with everything shown at once, the outline included;
  - the outline morphing, with different pixels at three phases;
  - "scan my face" and "close" by voice;
  - Escape;
  - the portrait projection now cut out by the mask with the mesh overlay.

  The only request leaving the machine was the existing Google Fonts stylesheet.

## Limitations

- The mesh and mask are MediaPipe's legacy solutions. They are official and stable, but no longer updated. Moving to MediaPipe Tasks Vision later is a drop-in change inside `faceEngine.ts`.
- Centimetres are estimates from the iris ruler, so they are rougher on small or angled faces.
- The "future" is a marketing visual driven by a language model and bounded by code. It predicts nothing about a real face, and the UI says so every time.
- It has not been tried on Prat's own photo yet, because that photo stays on his computer.
