# Prat's Railway checklist — prepared, not executed

No deployment, account change, payment, promo redemption or paid model call was made
by this verification pass. Prat handles sign-in, billing and secrets. Claude pushes
the reviewed branch; Codex does not push. Keep the current Nebius key as Prat directed.

## Before deploying

- [ ] Review the local container verification and the issues in `voice/REAL-MIC-TEST.md`.
  Complete the real microphone/speaker acceptance test before recording demo claims.
- [ ] Have Claude push the reviewed main commit. Note the exact commit to deploy.
- [ ] Sign in to Railway yourself and select the intended personal/workspace account.
  Review the plan and billing before approving any paid service.
- [ ] On that workspace's **Usage → Set Usage Limits**, set **Compute Usage →
  Custom email alert = $25**. Verify the saved value and billing email.
  An alert sends an email and does not stop spending. A hard limit takes workloads
  offline; choose one only deliberately, considering judge availability. This alert
  is workspace-wide and is separate from Nebius and Tavily usage.
  [Railway's current cost-control documentation](https://docs.railway.com/pricing/cost-control)
- [ ] Leave Token Factory sign-in and the $25 promo-code redemption to Prat.
  Do not add a payment card, enable auto top-up or rotate the current key for this task.

## Create and configure the service

- [ ] New Project → Deploy from GitHub → `prcasley/future-self` → `main`.
- [ ] Confirm Railway detects the root `Dockerfile`, Python 3.12 and `railway.toml`.
  Keep `RENEE_BUNDLED=1`; do not use the unbundled build option.
- [ ] Add a persistent volume mounted at `/data`; keep `DATABASE=/data/echo.db`.
  Start with one replica so the SQLite database and in-memory caps have one owner.
- [ ] Set the following service variables. Use Railway's secret fields, not chat,
  screenshots, command-line arguments or a committed file.

| Variable | Value / action |
| --- | --- |
| `NEBIUS_API_KEY` | Existing Token Factory key, entered privately by Prat |
| `NEBIUS_BASE_URL` | `https://api.tokenfactory.nebius.com/v1` |
| `NEBIUS_SUPER_MODEL` | `nvidia/nemotron-3-super-120b-a12b` |
| `DEMO_USER` | `judge` |
| `DEMO_PASSWORD` | Generate a random 32-character password in a password manager; minimum accepted length is 16. Save it privately and enter it directly in Railway. Never put it in chat or Git. |
| `DEMO_OPEN` | Leave unset; do not bypass the password gate |
| `DATABASE` | `/data/echo.db` |
| `MODEL_DAILY_CAP` | `200` model calls per UTC day |
| `SESSION_DAILY_CAP` | `40` model-backed turns per session per UTC day |
| `TTS_DAILY_CAP` | `3000` voice requests per UTC day |
| `TAVILY_DAILY_CAP` | `200` searches per UTC day |
| `RATE_LIMIT_PER_MINUTE` | `120` API requests per client IP |
| `RENEE_CPU_THREADS` | `2`, matching the verified image default |
| `RENEE_BUNDLED` | `1` (image default) |
| `HF_HUB_OFFLINE` | `1` (image default; model is bundled) |
| `RENEE_TTS_URL`, `RENEE_TTS_KEY` | Leave **unset**. The entrypoint creates the internal loopback URL and a fresh random key. Do not copy the Windows localhost settings. |
| `TAVILY_API_KEY` | Leave unset until Prat supplies it; the explicit fallback remains usable |
| `PORT` | Let Railway supply it; entrypoint honors it |

- [ ] Review CPU/RAM allocation. Local desktop timing is not a hosted latency promise.
  Watch startup memory and logs; do not select GPU hosting for this CPU image.
- [ ] Deploy only when Prat approves the account/billing steps. Confirm the image build
  succeeds and the bundled voice initializes, not merely that `/api/health` responds.
- [ ] Settings → Networking → Generate Domain. Use HTTPS. Do not expose the internal
  voice port (`8001`) or add a separate public endpoint for it.

## Judge check — run on the live URL after deployment

- [ ] In a fresh browser, unauthenticated `/api/health` returns `200` and
  `scope=hosted-demo`; `/`, `/ghost`, `/api/state/<test-session>` require sign-in.
- [ ] Sign in as `judge` using the private password. A wrong password must not work.
- [ ] **Use the demo face → Start session**, grant mic access, verify the runtime names
  Nemotron on Nebius and the voice label says **Reneė · British · Kokoro**.
- [ ] Speak “My goal is to learn Python,” “What is my mission?”, “Show me my dream
  life,” and “Come back.” Check real persisted state and streamed speech.
- [ ] Test barge-in and all stop paths using `voice/REAL-MIC-TEST.md`; do not substitute
  typed turns for the physical-microphone checks.
- [ ] Open Ghost, mirror, pyramid and fullscreen. Verify portrait, sound and mic status.
- [ ] Export a disposable test session and inspect the downloaded JSON.
- [ ] Only with Prat present and authorizing that disposable test, request deletion,
  confirm it, then verify server state and browser photo are gone. This preparation
  does **not** execute deletion.
- [ ] Check no-key Tavily fallback, or a real successful search once a key is supplied.
- [ ] Restart/redeploy only when appropriate and check volume persistence beforehand.
- [ ] Record URL, deployed commit, test results, CPU/RAM and measured latency. Report
  the URL in chat; enter credentials privately in Devpost's judge instructions.

## Through judging

- [ ] Keep the demo available through December 15, 2026, 12:00 PM Pacific. Confirm
  the current contest rules and access instructions before submission on October 28.
- [ ] Monitor Railway's $25 alert, Nebius balance and app caps independently. An alert
  is not a budget reservation. Limited sessions are useful fallbacks, but do not
  establish unrestricted live-model access for judges; budget/availability still need
  Prat's review before submission.
- [ ] No automatic shutdown or deletion is scheduled by this checklist. Retention and
  eventual cleanup remain Prat's decision after judging.
