# Ghost mode

Ghost mode runs the existing living portrait on #000 for a 45-degree Pepper's ghost sheet or a four-sided phone pyramid. No personal photo is included in this folder.

## Try it

Repository: `prcasley/future-self`, branch `main`.

1. In one PowerShell terminal at the repository root, start the existing API for conversation:
   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8016
   ```
2. In a second terminal:
   ```powershell
   cd future-self/apps/web
   npm run dev
   ```
3. Open `http://127.0.0.1:5186/ghost`. The browser's saved base photo is restored if available. Otherwise choose `docs/ghost/stand-in.jpg` or a local portrait. Photos selected inside Ghost are page-only and are not uploaded or saved.
4. Alternatively, click **Ghost mode** on the main portrait or `/living.html`. Entering from a living portrait carries its current face and head-follow choice into Ghost. Exit Ghost to select another scenario face.
5. Leave **Mirror reflection** on for a single acrylic reflection. Switch it off for an unmirrored view. Choose **Four-sided pyramid** for four outward-facing, synchronized copies. Adjust **Size** and **Vertical**.
6. Use **Start session** for the existing voice conversation; enable **Follow my head** if wanted. Camera tracking and reflection mirroring are independent switches.
7. Press **Project** to hide all controls, or **Fullscreen** to fill the screen and hide them. Tap anywhere or press **Esc** to restore controls. Esc may also leave browser fullscreen. **Exit Ghost** returns to the app without resetting the voice session.
8. Lay the screen flat beneath the acrylic at 45 degrees, darken the room, and adjust alignment. Keep the screen bright. Large size/position settings can intentionally crop the portrait at the display edge.

The portrait itself needs no API. Conversation uses the existing API configuration and speech permissions. A phone needs the existing HTTPS deployment for camera/microphone access; a desktop localhost address is not a phone link. `/ghost` and `/ghost/` are included in the production static build.

## Implementation

- `apps/web/src/ghost/GhostMode.tsx`: route state, projection controls, local photo choice, one animated source and synchronized canvas copies, fullscreen, wake lock/reacquisition/cleanup, stage handoff.
- `apps/web/src/ghost/GhostMode.css`: pure black viewport, brighter/higher-contrast face, soft silhouette rim, feathered fade to black, mobile controls.
- `apps/web/src/ghost/layout.ts`: pure mirror/rotation/cross-layout functions.
- `apps/web/src/living/LivingPortrait.tsx`: post-render frame callback, current face/camera handoff, require a person mask in Ghost (no rectangular fallback). Existing blink, mouth, camera and pose machinery remains shared.
- `apps/web/src/living/demo.tsx`, `apps/web/src/main.tsx`: Ghost toggles; main app voice/session state remains mounted while projecting.
- `apps/web/ghost/index.html`, `apps/web/vite.config.ts`: production route entry.
- `apps/web/tests/ghost.test.mjs`: four mirror/pyramid geometry regressions.
- `scripts/ghost-smoke.cjs`: repeatable isolated-browser checks and screenshots. Requires Playwright resolvable through `NODE_PATH` or `PLAYWRIGHT_MODULE`; optional `GHOST_BROWSER` selects an installed Chromium executable and `GHOST_URL` selects the dev-server origin (default port 5187).

## Verification — October 11, 2026

- All 42 web tests pass (38 existing + 4 Ghost tests): `node --experimental-strip-types --test tests/*.test.mjs` from `apps/web`.
- An index-only snapshot also passed all 42 tests and the production build, confirming the commit does not depend on pending uncommitted edits.
- `npm run build` passes: TypeScript and Vite production compilation. Existing large-bundle warning remains (~735 kB shared chunk before gzip).
- Chromium browser checks pass: route, mirror default, live animation, four identical live source frames, black background, hidden controls, Esc/tap, both sliders, fullscreen/exit, camera-denial fallback, 390-pixel phone layout, exit/back navigation, living-preview toggle, and current living-stage photo handoff. No uncaught page errors. API requests blocked for these visual checks.
- Production StaticFiles checks return HTTP 200 for both `/ghost` and `/ghost/` (the former follows the standard directory redirect). Existing Starlette/httpx deprecation warning remains.
- Screenshots: `normal.png` (mirror off), `mirrored.png` (default mirror on), `pyramid.png` (mirror on), plus `phone-pyramid.png`.
- No real microphone, audible speech, live-person camera tracking, physical screen-sleep duration, acrylic sheet, or phone pyramid was available for verification. Existing speech/motion tests pass; browser camera failure and fullscreen paths were exercised. Wake lock is best effort and its status is shown in controls. No paid provider calls were made. Backend suite was not rerun because backend code was not changed.
- A missing face/mask leaves the projection black and reports the problem in controls. It never substitutes a bright rectangular photograph.
- Staged diff reviewed and scanned for common credential formats and secret assignments. No matches; `.env` remains ignored and untracked.
- Pre-existing uncommitted changes were preserved and excluded from the Ghost commit, including the pending EchoStage/gallery integration. The optional current-stage handoff browser check runs when that integration is present.

## Stand-in provenance

`stand-in.jpg` is a synthetic, AI-generated portrait of a person who does not exist, made for testing. It replaced an earlier public-domain photo of a real person on Oct 11, 2026; `normal.png`, `mirrored.png`, `pyramid.png` and `phone-pyramid.png` were retaken with it, and the three main-stage screenshots taken with the old photo were removed.

All screenshots use this stand-in in a fresh browser context. Private portrait requests were blocked (or fulfilled with this same stand-in for the handoff test). The user's selfie was not used.
