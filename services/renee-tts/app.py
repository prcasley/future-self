"""Reneė: ECHO's British voice.

A tiny TTS service around Kokoro-82M (open weights, Apache-2.0) with the British English
female voice bf_emma. Deploy it as a Nebius Serverless Endpoint (see README.md); the main
API forwards one sentence at a time to POST /synthesize.
"""

import hmac
import io
import os
from threading import Lock

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from kokoro import KPipeline
from pydantic import BaseModel, ConfigDict, Field

VOICES = {"bf_emma", "bf_isabella", "bf_alice", "bf_lily"}  # British English women
DEFAULT_VOICE = os.environ.get("RENEE_VOICE", "bf_emma")
API_KEY = os.environ.get("RENEE_TTS_KEY", "")
SAMPLE_RATE = 24000
if not API_KEY and os.environ.get("RENEE_TTS_OPEN") != "1":
    raise RuntimeError("Set RENEE_TTS_KEY (or RENEE_TTS_OPEN=1 for a local, unexposed test).")

app = FastAPI(title="Reneė TTS")
# CPU is deliberate: deployment must not silently depend on a local GPU.
torch.set_num_threads(int(os.environ.get("RENEE_CPU_THREADS", "4")))
pipeline = KPipeline(lang_code="b", repo_id="hexgrad/Kokoro-82M", device="cpu")
pipeline.load_voice(DEFAULT_VOICE)
synthesis_lock = Lock()


class Speech(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=600)
    voice: str = DEFAULT_VOICE
    speed: float = Field(default=1.0, ge=0.7, le=1.3)


@app.get("/health")
def health():
    return {"ok": True, "model": "hexgrad/Kokoro-82M", "voice": DEFAULT_VOICE, "name": "Reneė",
            "device": str(next(pipeline.model.parameters()).device), "threads": torch.get_num_threads()}


@app.post("/synthesize")
def synthesize(body: Speech, authorization: str = Header(default="")):
    if API_KEY and not hmac.compare_digest(authorization.encode(), f"Bearer {API_KEY}".encode()):
        raise HTTPException(401, "Missing or wrong key.")
    if body.voice not in VOICES:
        raise HTTPException(400, f"Reneė only speaks with a British voice: {sorted(VOICES)}")
    # One shared model: bound CPU contention when several clients request speech.
    with synthesis_lock:
        chunks = [audio for _, _, audio in pipeline(body.text, voice=body.voice, speed=body.speed)]
    if not chunks:
        raise HTTPException(422, "Nothing to say.")
    wav = io.BytesIO()
    sf.write(wav, np.concatenate([np.asarray(c, dtype=np.float32) for c in chunks]), SAMPLE_RATE,
             format="WAV", subtype="PCM_16")
    return Response(wav.getvalue(), media_type="audio/wav", headers={"Cache-Control": "no-store"})
