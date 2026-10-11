#!/bin/sh
# Hosted demo entrypoint: Renée (Kokoro on CPU) on loopback, then the app on $PORT.
#
# Renée runs inside the same container unless RENEE_TTS_URL points at an external service or
# RENEE_BUNDLED=0. She only listens on 127.0.0.1, and a fresh random key is minted per boot when
# RENEE_TTS_KEY isn't set. If she fails to load, the app still starts and ECHO falls back to the
# browser's British voice, which the UI labels.
set -eu

RENEE_DIR="${RENEE_DIR:-/app/services/renee-tts}"
RENEE_PORT="${RENEE_PORT:-8001}"

if [ -z "${RENEE_TTS_URL:-}" ] && [ "${RENEE_BUNDLED:-1}" = "1" ] && [ -f "$RENEE_DIR/app.py" ]; then
  RENEE_TTS_KEY="${RENEE_TTS_KEY:-$(python -c 'import secrets; print(secrets.token_urlsafe(32))')}"
  RENEE_TTS_URL="http://127.0.0.1:$RENEE_PORT"
  export RENEE_TTS_KEY RENEE_TTS_URL
  (
    cd "$RENEE_DIR"
    tries=0
    # A crash restarts her a few times; after that the browser voice carries the demo.
    while [ "$tries" -lt "${RENEE_MAX_RESTARTS:-5}" ]; do
      uvicorn app:app --host 127.0.0.1 --port "$RENEE_PORT" --log-level warning || true
      tries=$((tries + 1))
      echo "renee: exited, restart $tries" >&2
      sleep 5
    done
  ) &
fi

exec uvicorn apps.api.serve:create_app --factory --host 0.0.0.0 --port "${PORT:-8080}" \
  --proxy-headers --forwarded-allow-ips='*'
