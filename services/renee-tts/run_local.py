"""Run from anywhere using this service's venv; secrets stay in the repo's ignored .env."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
os.environ.setdefault("HF_HOME", str(ROOT / "work" / "renee" / "huggingface"))

if os.name == "nt":
    import espeakng_loader
    from phonemizer.backend.espeak.wrapper import EspeakWrapper

    EspeakWrapper.set_library(espeakng_loader.get_library_path())
    os.environ["ESPEAK_DATA_PATH"] = str(espeakng_loader.get_data_path())

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8000)
