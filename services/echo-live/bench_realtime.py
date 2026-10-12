"""Can this GPU hold a live conversation on the 4-bit build? PersonaPlex makes one 80 ms audio frame
per step, so every step (encode your audio, run the model, decode its voice) must finish in < 80 ms.

    python services/echo-live/bench_realtime.py --q4 work/echo-live/personaplex-7b-v1-q4.pt

Prints p50/p95/max per frame and peak GPU memory, then PASS (p95 < 70 ms, leaves room for the
network and Opus), BORDERLINE (70-80 ms) or FAIL. `--out` saves the numbers as JSON for the docs.
"""

import argparse
import json
import os
import platform
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("NO_TORCH_COMPILE", "1")

import q4  # noqa: E402
import torch  # noqa: E402

BUDGET_MS = 80.0
PASS_MS = 70.0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--q4", default="work/echo-live/personaplex-7b-v1-q4.pt")
    parser.add_argument("--context", type=int, default=1500)
    parser.add_argument("--frames", type=int, default=250, help="frames to time (250 = 20 s of audio)")
    parser.add_argument("--out", help="write results JSON here")
    args = parser.parse_args()
    if not torch.cuda.is_available():
        sys.exit("No CUDA GPU visible to PyTorch.")

    device = torch.device("cuda")
    torch.cuda.reset_peak_memory_stats()
    t0 = time.time()
    mimi, other_mimi, lm_gen = q4.load_runtime(args.q4, device, args.context)
    load_s = time.time() - t0
    frame_size = int(mimi.sample_rate / mimi.frame_rate)

    def one_frame():
        chunk = torch.randn(1, 1, frame_size, device=device) * 0.05  # noise, like a live mic
        codes = mimi.encode(chunk)
        other_mimi.encode(chunk)
        for c in range(codes.shape[-1]):
            tokens = lm_gen.step(codes[:, :, c: c + 1])
            if tokens is None:
                continue
            mimi.decode(tokens[:, 1:9])
            other_mimi.decode(tokens[:, 1:9])

    with torch.no_grad():
        for _ in range(8):  # warmup builds the CUDA graphs, as the server does
            one_frame()
        torch.cuda.synchronize()
        times = []
        for _ in range(args.frames):
            start = time.perf_counter()
            one_frame()
            torch.cuda.synchronize()
            times.append((time.perf_counter() - start) * 1000)

    times.sort()
    p50 = statistics.median(times)
    p95 = times[int(0.95 * (len(times) - 1))]
    free, total = torch.cuda.mem_get_info()
    verdict = "PASS" if p95 < PASS_MS else "BORDERLINE" if p95 < BUDGET_MS else "FAIL"
    result = {
        "gpu": torch.cuda.get_device_name(0),
        "vram_total_gb": round(total / 1e9, 2),
        "peak_allocated_gb": round(torch.cuda.max_memory_allocated() / 1e9, 2),
        "peak_reserved_gb": round(torch.cuda.max_memory_reserved() / 1e9, 2),
        "context_frames": args.context,
        "frames_timed": args.frames,
        "ms_per_frame": {"p50": round(p50, 1), "p95": round(p95, 1), "max": round(times[-1], 1)},
        "budget_ms": BUDGET_MS,
        "real_time_factor_p50": round(p50 / BUDGET_MS, 2),
        "load_seconds": round(load_s, 1),
        "verdict": verdict,
        "torch": torch.__version__,
        "platform": platform.platform(),
    }
    print(json.dumps(result, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2) + "\n")
    print({"PASS": "\nLive on this GPU looks viable. Next: serve_q4.py and talk to it.",
           "BORDERLINE": "\nClose. Try --context 1000, close other GPU apps, then re-run.",
           "FAIL": "\nToo slow for live. Use a rented GPU for demo hours (docs/voice/PERSONAPLEX-PLAN.md)."}[verdict])


if __name__ == "__main__":
    main()
