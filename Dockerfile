# The Other Side, hosted demo: one container serves the built web app and the API on $PORT.
# Build: docker build -t the-other-side .
# Run:   docker run -p 8080:8080 -e NEBIUS_API_KEY=... -e DEMO_PASSWORD=... the-other-side

FROM node:22-slim AS web
WORKDIR /src/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE=/data/echo.db \
    MODEL_DAILY_CAP=1500 \
    SESSION_DAILY_CAP=150
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/__init__.py ./apps/
COPY apps/api ./apps/api
COPY --from=web /src/apps/web/dist ./apps/web/dist
# Runs as root so a Railway volume (mounted root-owned) at /data is writable.
RUN mkdir -p /data
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn apps.api.serve:create_app --factory --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
