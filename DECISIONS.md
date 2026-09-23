# Implementation decisions — September 22, 2026

- Read the full Claude war-room artifact: architecture, voice spec, all six sprint tabs, demo script and handoffs. Preserve voice and memory before futures.
- Use browser recognition because Omni was not in the account's live catalog. No GPU endpoint was started.
- Start with a small local SQLite state store. Normalized SQLModel/FTS5 entities remain future work. Public hosting needs authentication, ownership checks, quotas and a deliberate storage design.
- Stream text and assemble fragmented tool calls. Apply one tool per turn and commit before reporting success. Speech currently waits for the completed short answer; no sentence-chunk latency claim.
- Server owns confirmation. The model cannot confirm its own proposed mutation. A new topic clears pending confirmation even if the provider fails.
- Eight-second model attempt timeout, one retry before partial output. Avoid retrying after partial output to prevent duplicate responses.
- Forgetting clears conversation and undo snapshots to prevent resurrection of a forgotten fact. It is not secure erasure and cannot itself be undone.
- The abstract hologram uses 24,000 points. Portrait morphing and audio-amplitude response remain planned; this placeholder is not a representation of the user's appearance or measured progress.
- Included a small integration stage alongside the backend. No Antigravity agent or overnight job was launched.
- Use ports 5186 and 8016 to avoid other local apps.

## Findings

Super and Nano passed live checks. Correct Nano ID: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. Omni/flux were absent from the account's catalog; separate endpoints remain untested. No real voice fixture was supplied. Sandbox project ID is missing; no successful fork is claimed.

The first live correction test exposed a model asking for confirmation without staging the tool. Tightened tool instructions; the rerun correctly staged, confirmed and undid the replacement. Broader recorded-voice regression testing is still needed.
