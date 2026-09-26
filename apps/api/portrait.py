"""Request-scoped future portraits. No image, brief, or provider body is persisted."""

import base64
import binascii
import json
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field, StrictBool

MAX_IMAGE = 8_000_000
OPTIONS = {
    "wardrobe": [
        "tailored futuristic jacket",
        "smart casual layers",
        "everyday knitwear",
        "practical workwear",
    ],
    "grooming": ["neatly styled hair", "natural everyday hair", "simple tidy grooming"],
    "lighting": ["soft studio light", "warm window light", "cool ambient light", "gentle evening light"],
    "posture": ["relaxed upright pose", "attentive seated pose", "thoughtful three-quarter pose"],
    "setting": ["quiet future studio", "welcoming workspace", "simple everyday room", "calm virtual atrium"],
}
STYLE_RULES = (
    "Photorealistic head-and-shoulders portrait, subtle futuristic sentient-being presence, "
    "natural skin texture, no hologram, no text. Change style only. Preserve facial identity, "
    "age, body shape and skin tone when a reference is provided. No health or body transformation, "
    "no beauty ranking, no shaming. This is an imagined scenario, not a forecast."
)


class PortraitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: UUID
    side: Literal["dream", "good", "neutral", "bad", "drift", "hard road"]
    consent: StrictBool
    image_b64: str | None = Field(default=None, max_length=MAX_IMAGE, repr=False)


def canonical_side(side):
    return {"drift": "neutral", "hard road": "bad"}.get(side, side)


def local_brief(side):
    index = ("dream", "good", "neutral", "bad").index(canonical_side(side))
    return {key: values[index % len(values)] for key, values in OPTIONS.items()}


def validate_brief(value):
    if not isinstance(value, dict) or set(value) != set(OPTIONS):
        raise ValueError("Invalid look brief")
    if any(value[key] not in options for key, options in OPTIONS.items()):
        raise ValueError("Look brief contains unsupported style")
    return value


def image_type(value):
    if not isinstance(value, str) or not value or len(value) > MAX_IMAGE:
        raise ValueError("Invalid image")
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("Invalid image") from None
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return "image/webp"
    raise ValueError("Expected base64 PNG, JPEG, or WebP")


def check_backend(settings, body):
    backend = settings.future_image_backend
    if body.image_b64 is not None:
        if not body.consent:
            raise ValueError("Explicit consent is required for this photo request")
        if backend != "endpoint":
            raise ValueError("Photos are accepted only by the identity endpoint")
        image_type(body.image_b64)
    if backend == "endpoint":
        if not body.consent or not body.image_b64:
            raise ValueError("The identity endpoint requires a photo and consent for this request")
        url = urlsplit(settings.future_image_endpoint)
        if url.scheme != "https" or not url.netloc or url.username or url.password or url.fragment:
            raise ValueError("Configure an HTTPS FUTURE_IMAGE_ENDPOINT")
    if backend == "tokenfactory" and not settings.future_image_model:
        raise ValueError("Configure FUTURE_IMAGE_MODEL for concept art")


async def post_json(url, payload, key=""):
    headers = {"Authorization": "Bearer " + key} if key else {}
    # No retry and no redirects: consent authorizes one request to the configured endpoint.
    async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as response:
            response.raise_for_status()
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > MAX_IMAGE + 65_536:
                    raise ValueError("Provider response too large")
    return json.loads(data)


async def generate_brief(settings, side):
    result = await post_json(
        settings.nebius_base_url.rstrip("/") + "/chat/completions",
        {
            "model": settings.nebius_super_model,
            "messages": [
                {
                    "role": "system",
                    "content": STYLE_RULES + " Return only a JSON object choosing exactly "
                    "one allowed value for each key: " + json.dumps(OPTIONS),
                },
                {"role": "user", "content": json.dumps({"side": canonical_side(side)})},
            ],
            "max_tokens": 400,
            "temperature": 0.5,
            "chat_template_kwargs": {"enable_thinking": False},
        },
        settings.nebius_api_key,
    )
    return validate_brief(json.loads(result["choices"][0]["message"]["content"]))


async def render(settings, brief, body):
    prompt = STYLE_RULES + " " + "; ".join(f"{key}: {value}" for key, value in brief.items())
    if settings.future_image_backend == "tokenfactory":
        payload = {
            "model": settings.future_image_model,
            "prompt": prompt,
            "response_format": "b64_json",
            "n": 1,
        }
        result = await post_json(
            settings.nebius_base_url.rstrip("/") + "/images/generations", payload, settings.nebius_api_key
        )
        value = result["data"][0]["b64_json"]
    else:
        # Deliberately exclude session, memories and goals. The endpoint must implement this contract.
        result = await post_json(
            settings.future_image_endpoint,
            {"prompt": prompt, "image_b64": body.image_b64},
            settings.future_image_endpoint_key,
        )
        value = result["image_b64"]
    return {"image_b64": value, "mime_type": image_type(value)}
