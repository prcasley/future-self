# Remaining work — checked October 13, 2026

**Update October 17:** the ordered list of what is left for Prat is now `docs/FINAL-STRETCH.md`.

## Completed preparation

- [x] Checked local and remote main: both 034cc88; clean tree before this pass.
- [x] Confirmed Claude committed the Railway/mic test plans (75613c8) and merged Docker evidence (034cc88).
- [x] Verified current main: 66 web tests, production build, 151 backend tests in Linux.
- [x] Rebuilt current CPU image; seven password-gate checks and real speech synthesis passed.
- [x] Updated Docker evidence and removed obsolete unbuilt-image claims from DEPLOY.md.
- [x] Railway variables, daily caps, persistent volume and $25 alert preparation are documented in RAILWAY-CHECKLIST.md.
- [x] Thirty-turn protocol, blank recording sheet and latency summarizer are committed; no fabricated measurements.

## Requires Prat

- [ ] Physical mic/speaker acceptance: allow 25–40 minutes and authorize live model calls. Follow voice/REAL-MIC-TEST.md, including 911d655 stop-control, stream-release and clipped-command checks. Save actual measurements; median/worst remain unknown until then.
- [ ] Token Factory: Prat checks credit balance and redeems his existing promo privately. No key rotation or auto top-up requested.
- [ ] Railway account/billing: Prat signs in, approves hosting cost, sets $25 alert and private credentials. Follow RAILWAY-CHECKLIST.md; no deployment performed.
- [ ] Once hosted, run the live judge checklist: authentication, live Nemotron voice, CPU Reneė, memory/missions, Ghost, export, and explicitly authorized disposable-session deletion. Record URL and deployed commit; never record credentials.
- [ ] Keep live-model access funded through judging; a limited session is not evidence of successful live inference.
- [ ] Supply a Tavily key privately if pursuing that bonus, then verify actual successful search and mission sources. No-key/error fallback already exists; successful runtime search is not verified here.

## Submission work after live acceptance

- [ ] Try the physical reflector and capture the actual effect; do not label software-only footage a tested physical display.
- [ ] Record the public demonstration under three minutes using docs/DEMO-VIDEO.md; show real behavior and measured limitations.
- [ ] Claude/Prat finalize docs/SUBMISSION.md and README against the shipped version, upload the video, add hosted URL/private judge access, and submit by the internal October 28 target.
- [ ] Prat/Claude push reviewed local commits; Codex has not pushed.

No new features are proposed. The remaining release blockers are human acceptance,
account/budget setup, hosted verification and final demonstration/submission.
Next: Prat supplies participation/account access; qa-engineer and release-engineer
complete the corresponding checks with him. Claude owns the submission narrative.
