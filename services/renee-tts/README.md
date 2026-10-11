# Renée TTS

ECHO's voice: **Renée**, a British woman. This service wraps
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (open weights, Apache-2.0) with the
British English voice `bf_emma`. NVIDIA's Magpie TTS models list no British English voice,
so Renée uses Kokoro; Nemotron on Nebius Token Factory still does all of ECHO's thinking.

## API

- `GET /health` → `{"ok": true, "model": "hexgrad/Kokoro-82M", "voice": "bf_emma", "name": "Renée"}`
- `POST /synthesize` with `{"text": "Good evening.", "voice": "bf_emma", "speed": 1.0}` → `audio/wav` (24 kHz, 16-bit).
  Only British voices are accepted: `bf_emma` (default), `bf_isabella`, `bf_alice`, `bf_lily`.
  Send `Authorization: Bearer <RENEE_TTS_KEY>`. The service refuses to start without `RENEE_TTS_KEY`
  unless `RENEE_TTS_OPEN=1` is set, which is only for a local test that nothing else can reach.

## Run locally on Windows (verified)

From the repository root, one-time setup with uv:

```powershell
uv venv --python 3.12 services/renee-tts/.venv
uv pip install --python services/renee-tts/.venv/Scripts/python.exe torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python services/renee-tts/.venv/Scripts/python.exe -r services/renee-tts/requirements.txt
uv pip install --python services/renee-tts/.venv/Scripts/python.exe https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
```

Set `RENEE_TTS_URL=http://127.0.0.1:8000` and a long random `RENEE_TTS_KEY` in the
repo's ignored `.env`. The local launcher reads that file. Never commit the key.
Then start the voice service:

```powershell
services/renee-tts/.venv/Scripts/python.exe services/renee-tts/run_local.py
```

The launcher binds only to localhost, bundles the Windows eSpeak library through
`espeakng-loader`, and caches the public model in ignored `work/renee/huggingface`.
The first launch downloads weights; subsequent launches reuse them. The service
explicitly uses CPU with four PyTorch threads (`RENEE_CPU_THREADS` overrides this).
Voice loading is not an inference warmup. Requests share one model and serialize synthesis.

In two additional terminals, start the normal API and web app:

```powershell
.venv/Scripts/python.exe -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8016
npm --prefix apps/web run dev
```

Open http://127.0.0.1:5186/ghost, choose a portrait, and start a session or use
**Type instead**. The voice label says **Renée · British · Kokoro** only for the
service. A browser fallback names the browser voice. Restart the API after changing `.env`.

## Container / eventual hosting

```bash
docker build -t renee-tts services/renee-tts
docker run --env-file .env -p 127.0.0.1:8000:8000 renee-tts
```

The image installs CPU-only PyTorch. For hosting, provide `RENEE_TTS_KEY` as a secret,
set the API's `RENEE_TTS_URL` to the hosted HTTPS endpoint and use the same key.
No hosting deployment or container build was performed in this verification.
The app does not claim the voice service is on Nebius just because it is configured;
Nemotron's runtime still uses Nebius Token Factory separately.

## Real audio verification — 2026-10-11

`docs/voice/renee-sample.wav` contains the requested three sentences, produced by
Kokoro `bf_emma`, not browser speech or a recording. See `docs/voice/cpu-benchmark.json`.
AMD Ryzen 7 7700, 8 cores / 16 logical processors, 4 PyTorch threads, CPU-only:

- First synthesis after model loading: 1.866 s for 4.875 s of audio.
- Warm sentence, “I'm you, one year from now.”: median 0.738 s for 2.425 s of audio
  across the final three requests (real-time factor about 0.30).
- Timings include local HTTP and WAV encoding, exclude model startup/download, and
  do not predict latency on a smaller hosted CPU or under concurrent traffic.

The model and English language data downloaded successfully on this PC. Package
versions at verification: Kokoro 0.9.4, CPU PyTorch 2.14.1, Python 3.12.11.
