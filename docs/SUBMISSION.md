# Devpost submission draft

Every field the Nebius × NVIDIA Global AI Hackathon form asks for, ready to paste. Submit by our
internal date, **Wednesday October 28**; the hard deadline is **Friday October 30, 2026, 10:00 AM PT
(1:00 PM ET)**. Items in `[brackets]` are filled in at submission time.

## Project name

The Other Side

## Tagline (one line)

Talk to your future self: a floating, photoreal you from one year out, speaking in a real voice, powered by NVIDIA Nemotron on Nebius Token Factory.

## Track

Personal AI

## Links

- Demo: `[Railway URL]` (username `judge`, password in the testing instructions)
- Code: https://github.com/prcasley/future-self (MIT)
- Video: `[YouTube URL]` (under 3 minutes)

## Inspiration

Most goal apps are checklists. What actually changes behaviour is a conversation with someone who knows you, remembers what you said last week, and can tell when to push and when to back off. The most convincing version of that person is you, a year from now. I wanted to make that person visible and audible: a face floating in the dark like a Pepper's ghost, that talks back.

## What it does

- **You talk, ECHO listens.** Speak your goals; ECHO keeps them and your stated facts, confirms changes out loud, and can undo. Each day it sizes one mission to your capacity.
- **Your future self, floating.** ECHO is a photoreal living portrait that blinks, breathes and follows your head. Ghost mode puts it on pure black, mirrored for a glass or acrylic reflector or split four ways for a pyramid, so the face appears to hang in mid-air.
- **Renée's voice.** ECHO speaks in a British woman's voice (Kokoro-82M on CPU), and the face's mouth moves with the loudness of her real audio.
- **The Crossing.** "Show me my dream life", "what if I drift", "show me the hard road": ECHO simulates 52 weeks of your goals on that path and speaks to you as that future self, using only the simulated numbers, never invented events.
- **The Lab.** An honest research instrument: from daily voice check-ins (sleep, energy, stress, minutes), a transparent rule, a learning bandit and Nemotron each recommend push, maintain or reduce; one is applied, all are logged and scored the next day.
- **Your data, your call.** Photos never leave the browser. "Export my data" downloads everything; "delete all my data" plus a spoken yes erases it.

## How we built it

- **Reasoning:** `nvidia/nemotron-3-super-120b-a12b` on **Nebius Token Factory** through its OpenAI-compatible API, streamed, with 14 server-validated tools (goals, memory corrections, missions, check-ins, crossings, export, delete). Thinking is disabled for voice latency.
- **Where Nemotron is used:** conversation and tool calls, the session greeting, Crossing narration grounded in a deterministic simulator, the Lab's model policy (shadow), and a bounded projection of face proportions.
- **Voice:** browser speech recognition in; Kokoro-82M (`bf_emma`, Apache-2.0) out, bundled on CPU in the same container: a warm sentence takes about 0.74 s on an 8-core desktop CPU, so no GPU is needed to host it.
- **Face:** React and Three.js, with MediaPipe Face Mesh and Selfie Segmentation running on-device; the mouth is driven by an RMS envelope of Renée's decoded audio.
- **Backend:** FastAPI and SQLite; one Docker container on Railway serves the page, the API and the voice behind a password, with daily model, voice and search budgets and a per-IP rate limit.
- **Optional:** Tavily Search for related reading on a mission card, only on an explicit click.

## Challenges

- **Making a face feel alive without faking it.** We moved from a procedural wireframe hologram to a photoreal portrait, then to a Pepper's ghost; every step had to stay honest (the mouth follows audio loudness, not phonemes, and the app says so).
- **Voice latency.** A 120B model plus speech synthesis can feel slow; streaming, disabling thinking, sentence-by-sentence speech and a CPU voice that synthesizes faster than real time keep it conversational.
- **Keeping a public demo safe and inside budget** for seven weeks of judging: password gate with lockout, daily caps for model, voice and search, and a limited session instead of an error when credit runs out.

## Accomplishments

- A complete voice loop: speak, Nemotron reasons and calls tools, state commits, Renée answers, the ghost's lips move.
- The Crossing's futures are reproducible simulations, labelled as scenarios, never predictions.
- 145 backend tests, 59 web tests and the production build pass; every live claim in the README is backed by a real run.

## What we learned

`[Prat: one or two sentences in your own words; for example, what talking to your future self felt like the first time]`

## What's next

A physical display (the long-term goal is a standalone object that projects ECHO, like a crystal or acrylic prism), automatic barge-in, Nemotron Nano for fast summaries, sandbox-backed futures, and a longitudinal study for the Lab.

## Built with

nvidia-nemotron, nebius-token-factory, python, fastapi, sqlite, react, typescript, three.js, mediapipe, kokoro, docker, railway, tavily

## Testing instructions (for judges)

1. Open `[Railway URL]` in Chrome or Edge on a computer with a microphone. Sign in with username `judge` and password `[password]`.
2. Click **Start session** and allow the microphone. ECHO greets you (a live Nemotron call) in Renée's voice.
3. Say "My goal is to learn Python", then "What is my mission?", then "Show me my dream life" and "Come back".
4. Click **Ghost mode** to see the Pepper's ghost stage; **Project** hides the controls, **Esc** brings them back.
5. Optional: tap **Photo** to use your own face (it never leaves the browser), then say "scan my face".
6. Say "Export my data", then "Delete all my data" and "yes".

If today's shared AI budget is used up, ECHO opens a limited session and says so; built-in commands still work, and the budget resets at midnight UTC. Speech recognition uses the browser's engine, so Chrome or Edge is required.

## Feedback on Nebius Token Factory and NVIDIA models

- **What worked:** one key and one OpenAI-compatible endpoint gave a solo builder a 120B open NVIDIA model with streaming and reliable tool calling. `chat_template_kwargs.enable_thinking=false` was essential for voice: first-call latency was about 4.5 s for Super before tuning and about 1.5 s for a tool turn after.
- **What would help:** the account's model catalog didn't list Nemotron Omni or an image model, so audio and image features had to use other open models; clearer per-model availability by region and account would save time. A documented streaming example with tool calls for Nemotron 3 Super would shorten setup. Clear HTTP status codes for exhausted credit (we handle 401, 402 and 403 the same way) would let apps explain the problem precisely.
- **NVIDIA models:** Super's tool calling stayed inside the schema we gave it; Nano (0.5 s single call) is a strong fit for summaries and is next on our list.

## Built during the submission period

The project was created during the submission period: the repository's first commit is September 22, 2026, after the period opened on August 26, 2026. See `docs/BUILT-THIS-PERIOD.md` and the Git history.

## Before submitting (checklist)

- [ ] Demo URL live, password works, judge path above passes on a fresh browser
- [ ] YouTube video public, under 3 minutes, no copyrighted music
- [ ] Repo About shows the MIT license; README explains Nemotron and Token Factory use
- [ ] "What we learned" written by Prat
- [ ] Budgets set for Oct 28 – Dec 15 and Nebius credit funded
