# ECHO Live Phase 1: checklist for the PC

One sitting, about an hour plus a 17 GB download. Optional for the October 28 submission: the
hosted demo doesn't use ECHO Live, and Live mode stays out of the demo unless Prat says otherwise
(the no-new-features rule in `docs/REMAINING-WORK.md`). It only answers one question: can the
RTX 4060 hold a live conversation on the 4-bit build?

## Before you sit down (5 minutes, any device)

- [ ] Sign in at https://huggingface.co/nvidia/personaplex-7b-v1 and accept the license.
- [ ] Make a **read** token at https://huggingface.co/settings/tokens. Keep it private; never
      paste it into the repo, a commit, a chat or a screenshot.

## On the PC

- [ ] **WSL2 Ubuntu 24.04**, if it isn't installed yet. In PowerShell as administrator:
      `wsl --install -d Ubuntu-24.04`, reboot, then open Ubuntu and pick a username and password.
      (24.04 ships Python 3.12; 22.04 doesn't.)
- [ ] **NVIDIA driver:** update the normal Windows Game Ready or Studio driver. Don't install a
      CUDA driver inside Ubuntu; WSL2 uses the Windows one.
- [ ] **Get the repo inside Ubuntu.** Either use the Windows checkout
      (`cd /mnt/c/Users/Prat/<path>/future-self && git pull`) or clone fresh
      (`git clone https://github.com/prcasley/future-self && cd future-self`).
- [ ] **Run it:**

      export HF_TOKEN=hf_...
      bash scripts/echo-live-phase1.sh

      It stops with a plain message if something is missing (driver, disk space, token, license)
      and is safe to re-run: finished steps are skipped. Close Chrome, OBS and games before the
      benchmark step, because they use VRAM.
- [ ] **Talk to it** for about 2 minutes, using the command the script prints at the end. Note
      whether the audio stutters and whether Reneė's British accent holds.

## Done means

- [ ] `docs/voice/personaplex-q4-benchmark.json` exists with PASS, BORDERLINE or FAIL, p95 frame
      time and peak VRAM, and it's committed and pushed (the script prints the exact command).
- [ ] A one-line note on how the 2-minute conversation sounded, sent to Claude in the project.

Claude then updates sections 0 and 7 of `PERSONAPLEX-PLAN.md` with the result. If the result is
PASS and you want Live mode in the demo, say so explicitly; otherwise it stays out.

## If it stops

| Message | Fix |
|---|---|
| `nvidia-smi not found` / `cannot see the GPU` | Update the Windows NVIDIA driver, run `wsl --shutdown` in PowerShell, reopen Ubuntu. |
| `only N GB free` | Free space on C: (WSL lives there) or move the WSL disk, then re-run. |
| `HF_TOKEN was rejected` | Make a new read token and `export` it again. |
| `License not accepted yet` | Accept on the model page with the same Hugging Face account as the token. |
| `CUDA out of memory` | Close other GPU apps; re-run the bench with `--context 1000` (see `services/echo-live/README.md`). |
| `int4 kernel mismatch` | Stop and tell Claude; don't use that file. |

The full troubleshooting table is in `services/echo-live/README.md`.
