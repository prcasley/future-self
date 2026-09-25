"""Hosted demo: one HTTPS origin serves the built web app and the API under /api, behind a password.

Local development is unchanged (Vite on 5186 proxies /api to apps.api.main on 8016). In production:

    uvicorn apps.api.serve:create_app --factory --host 0.0.0.0 --port $PORT

The page, the on-device face engine's model files (/mediapipe/...) and the API share one origin, so
the browser's microphone and speech permissions apply to one site. Every path except the health
check needs the demo password (HTTP Basic: DEMO_USER / DEMO_PASSWORD), and the daily model budgets
in main.Settings protect the Nebius credits.
"""

import base64
import binascii
import hmac
import mimetypes
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .main import app as api
from .main import settings

# The face engine's runtime files; the platform's MIME table may not know them.
mimetypes.add_type("application/wasm", ".wasm")
for extension in (".data", ".binarypb", ".tflite"):
    mimetypes.add_type("application/octet-stream", extension)

OPEN_PATHS = ("/api/health",)
SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
]


class PasswordGate:
    """HTTP Basic auth in front of everything but the health check, plus a few safe headers."""

    def __init__(self, app, user: str, password: str):
        self.app = app
        self.user = user.encode()
        self.password = password.encode()

    def allowed(self, header: bytes) -> bool:
        scheme, _, value = header.decode("latin-1").partition(" ")
        if scheme.lower() != "basic":
            return False
        try:
            decoded = base64.b64decode(value.strip(), validate=True)
        except (binascii.Error, ValueError):
            return False
        user, _, password = decoded.partition(b":")
        # Compare both halves every time, in constant time.
        return hmac.compare_digest(user, self.user) & hmac.compare_digest(password, self.password)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def with_headers(message):
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), *SECURITY_HEADERS]
            await send(message)

        header = dict(scope.get("headers", [])).get(b"authorization", b"")
        if scope["path"] in OPEN_PATHS or self.allowed(header):
            await self.app(scope, receive, with_headers)
            return
        await with_headers(
            {
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    (b"www-authenticate", b'Basic realm="The Other Side demo", charset="UTF-8"'),
                    (b"content-type", b"text/plain; charset=utf-8"),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": b"The Other Side demo: sign in with the username and password from the submission.",
            }
        )


def create_app():
    dist = Path(settings.web_dist)
    if not (dist / "index.html").exists():
        raise RuntimeError(f"No web build at {dist}. Run: cd apps/web && npm ci && npm run build")
    if not settings.demo_password and not settings.demo_open:
        raise RuntimeError("Set DEMO_PASSWORD for the hosted demo (or DEMO_OPEN=1 to serve without one).")
    root = FastAPI(title="The Other Side", docs_url=None, redoc_url=None, openapi_url=None)
    root.mount("/api", api)
    root.mount("/", StaticFiles(directory=dist, html=True), name="web")
    if settings.demo_password:
        return PasswordGate(root, settings.demo_user, settings.demo_password)
    return root
