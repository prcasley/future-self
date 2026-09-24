# Face scan integration — September 24, 2026

Applied Claude's patch cleanly to a clean working tree at f7dd2cd; resulting commit 7483f80. Installed the pinned MediaPipe dependencies. Nothing pushed; no secrets edited.

Verification: 49 backend tests, 24 frontend tests, Ruff and production build passed. Both model directories exist in dist/mediapipe and both JavaScript entrypoints return HTTP 200 from the local Vite server. The updated home page loads with the scan voice hint. Personal-photo scan and live provider projection were intentionally left for Prat; this check does not establish their runtime quality. The illustrative-projection disclaimer remains unchanged.

The first pytest invocation could not access the Windows temp directory. Redirecting TEMP/TMP into the writable work directory resolved all 22 setup errors. The initial sandboxed npm installation was interrupted after stalling; installation with registry access succeeded, with zero reported vulnerabilities. Remaining warnings: two Python dependency deprecations and Vite's approximately 789 kB bundle warning.

Continued with the third item in docs/CONTEST-READINESS.md, restart-safe personal memory: added confirmed corrections, deterministic spoken recap, and invalidation of stale scenario narratives when correcting or forgetting. Four new regressions cover restart, cancellation, session isolation, stale recall and the offline voice endpoint. Backend total is now 53 passing tests; Ruff passes.

This advances memory reliability, but automatic opening recap and full memory export/wipe are still pending. Real-microphone testing remains user-operated.
