# Hosted demo

The hackathon needs a public URL that judges can use through December 15. This setup gives them one HTTPS origin with a password. The built web app, the on-device face engine's model files, and the API all come from that origin, and daily budgets protect the Nebius credits.

Local development is unchanged: Vite on 5186 proxies `/api` to the API on 8016.

## What runs

`apps/api/serve.py` wraps the API:

| Path | Serves | Password |
| --- | --- | --- |
| `/api/health` | health, scope, and today's model budget | no (the platform probes it) |
| `/api/...` | every API route in `docs/API.md` | yes |
| `/`, `/assets/...`, `/mediapipe/...` | the built web app and the face engine files | yes |

The password is HTTP Basic, so the browser shows its own sign-in box once and then sends the credentials with every request, including the voice stream. Responses carry `nosniff`, `no-referrer` and `DENY` framing headers. The server refuses to start without a web build or a password; `DEMO_OPEN=1` is the explicit way to run it open.

## Deploy on Railway

1. Push the branch to GitHub first. Rotate the Nebius key before anything goes public.
2. In Railway: New Project → Deploy from GitHub repo → pick `prcasley/future-self` and the branch. `railway.toml` makes Railway build the `Dockerfile` and probe `/api/health`.
3. Add a volume mounted at `/data`, so goals, memories and the Lab survive redeploys. The image runs as root, because Railway mounts volumes root-owned.
4. Set these variables:

| Variable | Value |
| --- | --- |
| `NEBIUS_API_KEY` | the rotated Token Factory key |
| `DEMO_PASSWORD` | a random password of at least 16 characters for the judges; the server refuses to start with a shorter one. After 20 wrong passwords in 10 minutes an IP gets 429 for the rest of the window |
| `DEMO_USER` | optional; defaults to `judge` |
| `MODEL_DAILY_CAP` | model calls per UTC day across everyone; the image defaults to 1500, and `0` turns the cap off |
| `SESSION_DAILY_CAP` | model-backed turns per session per day; the image defaults to 150, and `0` turns the cap off |
| `TTS_DAILY_CAP` | Renée voice requests per UTC day across everyone; the image defaults to 3000, and `0` turns the cap off. Over it, the browser's British voice is used |
| `RATE_LIMIT_PER_MINUTE` | API requests per client IP per minute (the right-most `X-Forwarded-For` address); the image defaults to 120, and `0` turns it off. The page, static files and `/api/health` are not counted |
| `TAVILY_API_KEY` | optional; turns on **Find sources** on mission cards |
| `TAVILY_DAILY_CAP` | Tavily searches per UTC day across everyone; the image defaults to 200, and `0` turns the cap off. Over it, the card says sources are unavailable and nothing is cached |
| `NEBIUS_PROJECT_ID` | only once the sandbox runner exists |
| `RENEE_TTS_URL` / `RENEE_TTS_KEY` | leave unset: Renée runs inside the container (below). Set them only to use an external voice service instead |

5. Settings → Networking → Generate Domain. Open `https://<domain>/api/health`; `"scope": "hosted-demo"` means the password gate is on.
6. Sign in and run the checklist below. Put the URL, `judge`, and the password in the Devpost testing instructions.

The same image runs anywhere Docker runs:

```bash
docker build -t the-other-side .
docker run -p 8080:8080 -e NEBIUS_API_KEY=... -e DEMO_PASSWORD=... -v the-other-side-data:/data the-other-side
```

## Renée's voice in the same container

The image bundles Renée (Kokoro-82M, voice `bf_emma`, Apache-2.0 weights) on CPU. `scripts/start-hosted.sh` starts her on `127.0.0.1:8001` with a random key minted at each boot, then starts the app on `$PORT` pointed at her. She is never reachable from outside the container, and the model and voice are downloaded at build time, so a cold start fetches nothing (`HF_HUB_OFFLINE=1`).

- Speed: on an 8-core desktop CPU a warm sentence takes about 0.74 s (`docs/voice/cpu-benchmark.json`). The image uses `RENEE_CPU_THREADS=2`; raise it if the Railway plan gives the service more vCPUs.
- Memory: plan for roughly 1–1.5 GB extra for torch and the model.
- If she fails to load or crashes more than `RENEE_MAX_RESTARTS` (5) times, the app keeps running and ECHO speaks with the browser's British voice, labelled on screen.
- `docker build --build-arg RENEE_BUNDLED=0 .` makes the old, smaller image without her.

The image uses Python 3.12 because Kokoro supports Python 3.10–3.12.

## Budgets

Every model call is written to the ledger. Once the ledger shows `MODEL_DAILY_CAP` calls for the day, the model is not called again until midnight UTC. Separately, each session gets `SESSION_DAILY_CAP` model-backed turns per day, counted in memory, so a restart resets that count. Over budget, ECHO says so plainly: Start session still opens, without the model and without claiming a live Nebius session, and the status line reads “Today's AI budget is used”. The built-in commands keep working without the model: a first goal, missions, recap, reminders, outfits and auras, the scan with its local projection, and export and delete. Free conversation, crossing to a side, and Lab check-ins need the model and wait for the next day. If a budget runs out in the middle of a turn, the Crossing narration and the scan projection fall back to their local versions. If Nebius refuses the key or credit (HTTP 401, 402 or 403), the session opens the same limited way and ECHO says the AI credit or key needs attention; that is not retried. Local runs have no caps.

The rules ask that judges can use the project without restriction until judging ends on December 15 at 12:00 PM PT. For December 1–15, raise `MODEL_DAILY_CAP` as far as the balance allows, and check the ledger count in `/api/health` once a day.

## Judge checklist (Chrome or Edge)

1. Open the URL and sign in. Click Start session, then allow the microphone.
2. Say “My goal is to learn Python”, then “What is my mission?”, then “Show me my dream life” and “Come back”.
3. Tap Photo and choose a front-facing photo. The golden-ratio scan runs, and the photo stays in the browser.
4. Say “Put on the monarch armor”, then “Export my data”. A JSON file downloads.
5. Say “Delete all my data”, then “yes”. Everything is gone, photo included.

Speech recognition uses the browser's engine (Chrome or Edge); Firefox and Safari have partial support. The microphone needs HTTPS, which Railway provides.

## Verified here

The Docker Hub pull is blocked in this build environment, so the image itself was not built here. Each stage was reproduced in a clean directory instead: `npm ci` and `npm run build` from the lockfile, a fresh Python 3.13 environment from `requirements.txt`, and the image's exact start command. Against that server:

- A browser without credentials got 401.
- With credentials, the page loaded, the face engine files (11) came from the same origin as `application/wasm` and `application/octet-stream`, and a voice turn streamed through the gate.
- A photo ran the scan, “Export my data” downloaded the JSON, and “Delete all my data” plus “yes” emptied the server state and removed the photo from IndexedDB.
- The only third-party request was the existing Google Fonts stylesheet.

The first real deploy should repeat the checklist above.

Oct 11: with Renée bundled, the backend suite passes on Python 3.12, Renée's dependencies resolve on 3.12, and `tests/test_hosted_start.py` runs the real entrypoint to check she starts on loopback with a fresh key and the app is pointed at her. The full image (CPU torch from download.pytorch.org) still needs one real `docker build` on a machine with Docker running.

## Not covered

- Accounts: every judge shares one password. Sessions are separated by random IDs kept in each browser, which is fine for a demo and not an authentication system.
- Backups: the volume is the only copy.
- Retention: after judging closes (December 15, 2026, 12:00 PM PT), delete the Railway volume so judges' goals, memories and check-ins don't outlive the contest. The README promises this.
- Model budgets depend on credits. Keep the Nebius balance funded through December 15.
