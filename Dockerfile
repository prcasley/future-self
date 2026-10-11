# The Other Side, hosted demo: one container serves the built web app, the API on $PORT, and
# Renée's voice (Kokoro-82M on CPU) on loopback.
# Build: docker build -t the-other-side .
#        docker build --build-arg RENEE_BUNDLED=0 -t the-other-side .   # without Renée (smaller)
# Run:   docker run -p 8080:8080 -e NEBIUS_API_KEY=... -e DEMO_PASSWORD=... the-other-side

FROM node:22-slim AS web
WORKDIR /src/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

# Python 3.12: Kokoro supports Python 3.10 to 3.12.
FROM python:3.12-slim
ARG RENEE_BUNDLED=1
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE=/data/echo.db \
    MODEL_DAILY_CAP=200 \
    SESSION_DAILY_CAP=40 \
    TTS_DAILY_CAP=3000 \
    TAVILY_DAILY_CAP=200 \
    RATE_LIMIT_PER_MINUTE=120 \
    RENEE_BUNDLED=${RENEE_BUNDLED} \
    RENEE_CPU_THREADS=2 \
    HF_HUB_OFFLINE=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Renée: CPU-only torch, Kokoro, and the model + bf_emma voice fetched at build time so a cold
# start never downloads anything (HF_HUB_OFFLINE=1 at runtime).
COPY services/renee-tts/requirements.txt services/renee-tts/app.py ./services/renee-tts/
RUN if [ "$RENEE_BUNDLED" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends espeak-ng libsndfile1 \
      && rm -rf /var/lib/apt/lists/* \
      && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
      && pip install --no-cache-dir -r services/renee-tts/requirements.txt \
      && python -m spacy download en_core_web_sm \
      && HF_HUB_OFFLINE=0 python -c "from kokoro import KPipeline; KPipeline(lang_code='b', repo_id='hexgrad/Kokoro-82M', device='cpu').load_voice('bf_emma')"; \
    else rm -rf services/renee-tts; fi

COPY apps/__init__.py ./apps/
COPY apps/api ./apps/api
COPY --from=web /src/apps/web/dist ./apps/web/dist
COPY scripts/start-hosted.sh ./scripts/start-hosted.sh
# Runs as root so a Railway volume (mounted root-owned) at /data is writable.
RUN mkdir -p /data && chmod +x scripts/start-hosted.sh
EXPOSE 8080
CMD ["./scripts/start-hosted.sh"]
