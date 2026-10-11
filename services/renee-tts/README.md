# Renée TTS

ECHO's voice: **Renée**, a British woman. This service wraps
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (open weights, Apache-2.0) with the
British English voice `bf_emma`. NVIDIA's Magpie TTS models list no British English voice,
so Renée uses Kokoro; Nemotron on Nebius Token Factory still does all of ECHO's thinking.

## API

- `GET /health` → `{"ok": true, "model": "hexgrad/Kokoro-82M", "voice": "bf_emma", "name": "Renée"}`
- `POST /synthesize` with `{"text": "Good evening.", "voice": "bf_emma", "speed": 1.0}` → `audio/wav` (24 kHz, 16-bit).
  Only British voices are accepted: `bf_emma` (default), `bf_isabella`, `bf_alice`, `bf_lily`.
  If `RENEE_TTS_KEY` is set, send `Authorization: Bearer <key>`.

## Run locally

```bash
docker build -t renee-tts services/renee-tts
docker run -p 8000:8000 -e RENEE_TTS_KEY=dev renee-tts
```

Then set `RENEE_TTS_URL=http://127.0.0.1:8000` and `RENEE_TTS_KEY=dev` in the repo's `.env`.

## Deploy on Nebius (Serverless Endpoint)

1. Push the image to a registry Nebius can pull from (for example Nebius Container Registry).
2. Create a Serverless Endpoint from that image, port 8000. Kokoro is small: a CPU preset works,
   a small GPU preset is faster. Set `RENEE_TTS_KEY` as a secret.
3. Put the endpoint's HTTPS URL in `RENEE_TTS_URL` (and the key in `RENEE_TTS_KEY`) for the main API.
   `GET /api/health` then reports `"engine": "kokoro-nebius"` and the app labels the voice
   "Renée · British · Kokoro on Nebius".

If the service is down or not set, the app uses the browser's British female voice and the label
says which one. It never switches to an American or male voice without saying so.

Status: written and contract-tested with a mock; the real Kokoro audio has not been generated yet,
because the build machine could not download the model.
