"""Quantize PersonaPlex-7B to ECHO's 4-bit file, once, on the GPU that will run it.

    python services/echo-live/quantize_q4.py --out work/echo-live/personaplex-7b-v1-q4.pt

Needs HF_TOKEN (after accepting the license at huggingface.co/nvidia/personaplex-7b-v1),
about 17 GB free disk for the download, about 8 GB free RAM, and any CUDA GPU (one weight
matrix is on the GPU at a time). The packed layout is specific to CUDA and this torch version.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import q4  # noqa: E402
import torch  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="work/echo-live/personaplex-7b-v1-q4.pt")
    parser.add_argument("--moshi-weight", help="local model.safetensors (default: download from Hugging Face)")
    parser.add_argument("--hf-repo", default="nvidia/personaplex-7b-v1")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--group-size", type=int, default=q4.GROUP_SIZE)
    args = parser.parse_args()

    if args.device.startswith("cuda") and not torch.cuda.is_available():
        sys.exit("No CUDA GPU visible to PyTorch. Check `nvidia-smi` and that torch is a CUDA build.")
    source = args.moshi_weight
    if source is None:
        from huggingface_hub import hf_hub_download
        from moshi.models import loaders

        if not os.environ.get("HF_TOKEN"):
            print("warning: HF_TOKEN is not set; the gated download will fail unless you are logged in")
        source = hf_hub_download(args.hf_repo, loaders.MOSHI_NAME)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    meta = q4.quantize_checkpoint(source, out, device=args.device, group_size=args.group_size)
    meta["seconds"] = round(time.time() - started, 1)
    meta["file_gb"] = round(out.stat().st_size / 1e9, 2)
    print(json.dumps(meta, indent=2))
    print(f"\nWrote {out}. Next: python services/echo-live/bench_realtime.py --q4 {out}")


if __name__ == "__main__":
    main()
