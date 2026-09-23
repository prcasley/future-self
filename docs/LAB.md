# The Lab — research design

**Question.** Can an agent infer when to *push*, *maintain*, or *reduce* a person's goal intensity from longitudinal behavioral signals, and does doing so improve adherence without raising strain, compared with a constant policy?

**Fields it touches.** AI agents (tool-using decision loop), reinforcement learning (contextual bandit with delayed reward), human–computer interaction (voice-only elicitation, explanations, override), cognitive science (capacity, recovery, momentum, future self-continuity), personalized AI (per-person posteriors, local-first data).

## Hypotheses (pre-registered in this file before data collection)

- **H1** — An adaptive policy (rule or bandit) achieves next-day completion at least as high as a constant *maintain* policy while producing a lower mean strain proxy (stress rise after effort).
- **H2** — The bandit's "just right" rate, as rated by the user, exceeds the rule's after 14 or more scored decisions for the same person.
- **H3** — In the simulator, always-push loses more weeks to burnout than the adaptive rule at equal or better final progress on the *good* side.
- **H0** (null for each) — no difference, or the constant policy is better.

## Signals (per spoken check-in)

| Signal | Range | Source |
| --- | --- | --- |
| sleep_hours | 0–16 | spoken |
| energy | 1–5 | spoken |
| stress | 1–5 | spoken |
| effort_minutes | 0–900 | spoken |
| completed | yes / no | spoken |

Derived features over the last 7 check-ins: `capacity` (weighted sleep, energy, inverse stress, inverse effort), `streak`, `misses_3d`, `stress_trend`, `sleep_debt_3d`. Passive app signals (session count, time of day, correction rate) are logged in the ledger and are candidates for a later feature set; they are not used by any policy yet.

## Decision and reward

Each check-in yields one decision for tomorrow: `push` (1.25× baseline minutes), `maintain` (1.0×), `reduce` (0.6×). Baseline is 45 minutes until the user states otherwise.

Reward for the decision applied on day *t* is computed at the check-in on day *t+1*: `1.0` if completed and stress did not rise by 2 or more; `0.5` if completed but stress rose (0.25 when the decision was push); `0.0` otherwise. A spoken rating overrides: *just right* → 1.0, *too much* / *too little* → 0.0.

## Policies

- **rule** — transparent capacity rule (`lab.rule_policy`). Every branch is a sentence ECHO says aloud.
- **bandit** — Thompson sampling with Beta posteriors per (capacity bucket × arm). Buckets: low < 0.40 ≤ mid < 0.66 ≤ high. Updated by the reward above. Pure Python, inspectable in `GET /lab/{session}`.
- **llm** — NVIDIA Nemotron 3 Super on Nebius Token Factory, JSON-only answer from the last seven check-ins and the features. Shadow only in v0.2; never applied.

Assignment: the `active` policy is applied; all three are logged for every decision (shadow logging), so offline comparison uses the same episodes.

## Protocol

1. Consent by voice, staged and confirmed by the server, before any Lab row is stored.
2. Daily check-in by voice, one decision per day, one optional rating.
3. N-of-1 for the hackathon window (the builder), then opt-in participants during judging via the deployed demo. Minimum 14 scored decisions per person before H1/H2 are read.
4. Analysis: per-policy mean reward when applied, just-right rate, completion after each intensity, strain-rise rate; bandit posterior means over time. The experiment panel reports H3 from the simulator for the user's own goals.
5. Export: `GET /lab/{session}/export` → JSONL with numbers only. No goal text, facts, notes, or audio.

## Limitations

Self-reported signals; single-person samples; a 52-week simulator that encodes our own assumptions (progress with diminishing returns, strain with recovery, dropout after repeated burnout) and is therefore a *test bed*, not evidence about people; no blinding; delayed reward of one day only. ECHO never diagnoses and the reduce arm is a coaching adjustment, not medical advice.

## What would count as a result

A per-person table where the adaptive policy's mean reward and just-right rate exceed the constant policy's over at least 14 scored days, with strain-rise rate no higher, plus the simulator table showing the burnout trade-off. Either outcome is reportable.
