FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng libsndfile1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt \
    && python -m spacy download en_core_web_sm
COPY app.py .
# Download the model and Reneė's voice at build time so cold starts don't fetch them.
RUN python -c "from kokoro import KPipeline; KPipeline(lang_code='b', device='cpu').load_voice('bf_emma')"
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
