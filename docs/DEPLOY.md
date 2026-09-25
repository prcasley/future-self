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
| `DEMO_PASSWORD` | a long random password for the judges |
| `DEMO_USER` | optional; defaults to `judge` |
| `MODEL_DAILY_CAP` | model calls per UTC day across everyone; the image defaults to 1500 |
| `SESSION_DAILY_CAP` | model-backed turns per session per day; the image defaults to 150 |
| `NEBIUS_PROJECT_ID` | only once the sandbox runner exists |

5. Settings → Networking → Generate Domain. Open `https://<domain>/api/health`; `"scope": "hosted-demo"` means the password gate is on.
6. Sign in and run the checklist below. Put the URL, `judge`, and the password in the Devpost testing instructions.

The same image runs anywhere Docker runs:

```bash
docker build -t the-other-side .
docker run -p 8080:8080 -e NEBIUS_API_KEY=... -e DEMO_PASSWORD=... -v the-other-side-data:/data the-other-side
```

## Budgets

Every model call is written to the ledger. Once the ledger shows `MODEL_DAILY_CAP` calls for the day, the model is not called again until midnight UTC. Separately, each session gets `SESSION_DAILY_CAP` model-backed turns per day, counted in memory, so a restart resets that count. Over budget, ECHO says so plainly. The built-in commands keep working without the model: a first goal, missions, recap, reminders, outfits and auras, the scan with its local projection, and export and delete. Free conversation, crossing to a side, and Lab check-ins need the model and wait for the next day. If a budget runs out in the middle of a turn, the Crossing narration and the scan projection fall back to their local versions. Local runs have no caps.

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

## Not covered

- Accounts: every judge shares one password. Sessions are separated by random IDs kept in each browser, which is fine for a demo and not an authentication system.
- Backups: the volume is the only copy.
- Model budgets depend on credits. Keep the Nebius balance funded through December 15.
