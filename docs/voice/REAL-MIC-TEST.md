# Real mic and speakers: ready for Prat

Status: **not run**. Zero real turns measured. No prerecorded voice, fake mic,
browser event stub, or TTS-generated input can qualify for these results.
Allow about 25–40 minutes. Model calls during this test need Prat's go-ahead;
the current preparation does not spend credits or open the microphone.

## Before starting

- [ ] Run the current main app and CPU Reneė service, or the verified local Docker image.
- [ ] Use Chrome or Edge on this PC, with the actual microphone and speakers, no headphones.
- [ ] Use a fresh browser profile/session so test goals do not mix with personal data.
- [ ] Choose **Use the demo face**. Leave head-follow off to isolate voice behavior.
- [ ] Record browser version, commit, CPU, microphone/speaker names, speaker volume,
  distance, quiet/noisy room, local/hosted URL, and cold/warm status in the test notes.
- [ ] Confirm the page says a live Nebius session and the voice label says **Kokoro**.
  A limited session or browser fallback is a failed live test, not a latency sample.
- [ ] Close **Type instead**. It intentionally pauses recognition and the quiet timer.
- [ ] Place a phone beside the PC to record Prat and the speakers in **one acoustic
  recording**. This captures actual audible timing without adding another mic stream
  to the tested browser. Do not upload the recording. Keep it under ignored
  `work/voice-acceptance/`, not docs or Git.
- [ ] Copy `docs/voice/turns-template.csv` to `work/voice-acceptance/turns.csv`.

## Thirty answer-bearing turns

The CSV provides 30 prompts: 20 normal and 10 barge-in turns. Speak each naturally.
Do not read private facts into the recording. For normal turns, wait until ECHO is
listening. For barge-in, begin the prompt while Reneė is speaking; do not use the
Interrupt button. If she finishes too soon, ask for more detail as an unmeasured
setup turn, then interrupt the longer answer with the numbered prompt.

For each row:

- [ ] Record whether the full utterance was understood on the first attempt.
- [ ] Check the voice is actual Kokoro and the session is live on Nebius.
- [ ] In the acoustic recording, note `speech_end_s`: last audible user phoneme.
- [ ] Note `first_sound_s`: first audible sound of the **new** reply (exclude the
  tail of the interrupted reply). Both timestamps use the same recording clock.
- [ ] Enter `outcome=pass` only when there is a real response; otherwise enter `fail`
  and a reason in notes. Log missed prefixes, repeated sentences, false interrupts,
  browser voice fallbacks and timeouts. Do not silently replace failed turns.
- [ ] For barge-in also record interruption onset and the last audible old-reply
  sound in notes. This is a separate stop-delay measure, not response latency.

Use the normal app status and physical sound as evidence. An HTTP response,
`audio.play()` event or browser `speechend` timestamp alone is **not** an acoustic
end-to-end measurement. Keep the first cold turn; do not discard slow outliers.

Then run from the repo root:

```powershell
.venv/Scripts/python.exe scripts/summarize_voice_latency.py work/voice-acceptance/turns.csv --output docs/voice/latency.json
```

The report calculates median (“typical”) and maximum (“worst”) milliseconds and
lists every measured turn. It stays incomplete until all 30 pass; failures remain
visible. Do not publish a completed benchmark without the original recording and
operator notes supporting the annotations.

## Barge-in and off-switch acceptance (separate from the 30 latency turns)

- [ ] Leave the speakers playing while Prat is silent: Reneė must not interrupt
  herself. Repeat at ordinary and louder speaker volume. Record every false trigger.
- [ ] Interrupt early, mid-sentence and near the end. The first words must survive;
  count missed utterances separately from interruption latency.
- [ ] Start a session and say **stop listening**. Repeat in new sessions with
  **goodbye ECHO** and **that's all**, both while listening and while she is speaking.
- [ ] For each stop, confirm no further speech, the browser mic indicator turns off,
  and the page remains stopped for 10 seconds. Speak again: it must not resume until
  **Start session** is clicked.
- [ ] Click **Stop listening** during listening, thinking, playback and a pending
  microphone-permission request. Confirm all capture tracks end.
- [ ] Leave a session quiet after the last reply. Record pause time; the implementation
  checks every five seconds, so expect roughly 60–65 seconds, not an exact 60.
- [ ] Repeat in `/ghost`, including after **Project** hides the controls. Check a
  visible stop control and listening state remain accessible without guessing.
- [ ] Exercise mic permission denial and recognition network failure. Verify the
  separate barge-in mic stream is released too.

Checks against `911d655` (physical verification pending): (1) confirm the dim Listening chip and Stop listening remain visible while projecting in /ghost; (2) confirm recognition errors and start failures release the barge-in mic through endSession; (3) confirm calibration runs once per reply and clipped stop commands ("listening", "all for now") stop the session only immediately after barge-in.
