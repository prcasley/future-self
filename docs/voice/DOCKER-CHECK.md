# Local hosted Docker check — 2026-10-11

## Summary

Built and started the actual hosted image at application commit `0f52d35` using `scripts/start-hosted.sh`, Python 3.12 and bundled CPU Kokoro. Image: `the-other-side:local-0f52d35`; Docker-reported size: **837,721,829 bytes**. Container `echo-hosted-local` serves `http://127.0.0.1:8090` behind the password gate. No provider credentials or paid model calls were used.

Seven real HTTP gate checks passed. Authenticated `/api/voice/tts` returned **200**, producing **234,044 bytes**, **24,000 Hz**, **4.875 seconds** of speech in **2.681 seconds** on **2 CPU threads**. The sentence is: "Good evening. I'm you, one year from now. Let's talk about what got us here."

Raw safe results: `container-verification.json`; actual audio: `renee-container-sample.wav`. This verifies synthesis, not physical speaker playback or conversation latency. Total build wall time was not instrumented; BuildKit's image export stage took **91.4 seconds**. Build log: ignored `work/renee/docker-build.log`.

## Test Plan — executed

- `docker build --progress=plain -t the-other-side:local-0f52d35 .` — exit 0.
- `docker image inspect the-other-side:local-0f52d35 --format '{{.Id}} {{.Size}}'` — size above.
- The ignored `work/renee/check-container.py` made actual authenticated and unauthenticated HTTP requests — **7/7 gate checks passed**, plus successful CPU voice synthesis.
- Backend suite in this Linux image, network disabled, with daily caps set to local-test defaults for the test process: **151 passed in 5.56 seconds**. Hosted runtime retains caps. An initial run with image-default caps had **150 passed, 1 failed**, because a test expects uncapped local defaults.
- Native Windows backend: **147 passed, 4 failed**; all four entrypoint tests require `sh`, absent from Windows PATH. They passed in Linux above.
- `npm test -- --run` in `apps/web`: **65 passed**. `npm run build`: passed, **71 modules**, Vite build **4.77 seconds**; existing large-chunk warning remains.

## Loop findings handed to Claude

Source inspection of `0f52d35` found: (1) the ghost Stop control was hidden while projecting; (2) recognition error/start-failure paths did not close the separate barge-in microphone; (3) restarting recognition after level detection could clip short stop commands, and calibration restarted for queued sentences. These were inspection findings, not claimed physical-test failures. No loop code was rewritten in this verification pass.

During documentation, the checkout advanced to Claude's `911d655`, whose build-period entry records fixes for these concerns. **This image and the numbers above still cover 0f52d35; 911d655 has not been verified in this pass.**

The prepared real mic/speaker protocol remains pending Prat's presence: **0/30 measured turns**, no typical or worst latency claimed. No push, deployment, deletion, sign-in or spending was performed in this Docker check. Token Factory login and promo redemption remain Prat's.

Next: qa-engineer should verify Claude's updated commit and run the physical acceptance protocol with Prat when authorized.
