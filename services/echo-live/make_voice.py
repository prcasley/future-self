"""Give PersonaPlex Reneė's voice: put her sample into a voice-prompt folder the server can use.

    python services/echo-live/make_voice.py                      # copies docs/voice/renee-sample.wav
    python services/echo-live/make_voice.py --embed --q4 work/echo-live/personaplex-7b-v1-q4.pt

PersonaPlex accepts any WAV as `voice_prompt` (moshi/models/lm.py load_voice_prompt). The server
reads voices from one folder, so this copies NVIDIA's 18 presets and `renee.wav` into
work/echo-live/voices. `--embed` also precomputes `renee.pt` with the 4-bit model, so each
session starts a few seconds faster; it must be rebuilt whenever the 4-bit file changes.

Reneė's sample is Kokoro-82M `bf_emma` (Apache-2.0). The model learned mostly from American
conversations, so listen for accent drift before relying on it.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("NO_TORCH_COMPILE", "1")

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--wav", default=str(ROOT / "docs/voice/renee-sample.wav"))
    parser.add_argument("--name", default="renee")
    parser.add_argument("--voices", default="work/echo-live/voices")
    parser.add_argument("--hf-repo", default="nvidia/personaplex-7b-v1")
    parser.add_argument("--embed", action="store_true", help="precompute <name>.pt with the 4-bit model (GPU)")
    parser.add_argument("--q4", default="work/echo-live/personaplex-7b-v1-q4.pt")
    parser.add_argument("--context", type=int, default=1500)
    args = parser.parse_args()

    voices = Path(args.voices)
    voices.mkdir(parents=True, exist_ok=True)
    try:
        import tarfile

        from huggingface_hub import hf_hub_download

        with tarfile.open(hf_hub_download(args.hf_repo, "voices.tgz"), "r:gz") as tar:
            for member in tar.getmembers():
                name = Path(member.name).name
                if member.isfile() and name.endswith(".pt") and not (voices / name).exists():
                    (voices / name).write_bytes(tar.extractfile(member).read())
    except Exception as exc:  # presets are a convenience; Reneė's file is the point
        print(f"warning: could not copy NVIDIA's preset voices ({exc}); only {args.name}.wav will be available")

    wav = voices / f"{args.name}.wav"
    shutil.copyfile(args.wav, wav)
    print(f"voice prompt ready: {wav}")

    if args.embed:
        import q4
        import torch

        mimi, _, lm_gen = q4.load_runtime(args.q4, "cuda", args.context, args.hf_repo,
                                          save_voice_prompt_embeddings=True)
        with torch.no_grad():
            mimi.reset_streaming()
            lm_gen.reset_streaming()
            lm_gen.load_voice_prompt(str(wav))
            lm_gen._step_voice_prompt(mimi)  # writes <name>.pt next to the wav
        print(f"embeddings ready: {wav.with_suffix('.pt')}")

    print("\nStart the server with:")
    print(f"  python services/echo-live/serve_q4.py --voice-prompt-dir {voices} --ssl \"$(mktemp -d)\"")
    print(f"and connect with voice_prompt={args.name}.{'pt' if args.embed else 'wav'}")


if __name__ == "__main__":
    main()
