"""ECHO Live: our own 4-bit build of NVIDIA PersonaPlex-7B, sized for an 8 GB RTX 4060.

PersonaPlex in bf16 needs ~16.7 GB. Here every large projection in the main transformer
(32 layers) and the depformer (6 layers x 16 per-step copies) is stored as 4-bit weights with
one bf16 scale and zero per group of 128 inputs, and multiplied with PyTorch's built-in
tinygemm kernel (`aten._weight_int4pack_mm`). Weights stay packed on the GPU; nothing is
expanded back to bf16 at load, which is what keeps the community NF4 build at ~9.6 GB.
Embeddings, the text head, norms and the Mimi codec stay in bf16/fp32.

NVIDIA's code is not forked. `patch_moshi()` reroutes three linear call sites in the installed
`moshi` package (PersonaPlex's) to the packed weights:
  - `nn.functional.linear(query, self.in_proj_weight)` in attention,
  - `multi_linear(...)`, the per-step weights of the depformer,
  - `gating_forward_kernel(...)`, the SiLU-gated feed-forward.
Everything else (`out_proj`, `linears`, `depformer_in`) is a module and is swapped for `Q4Linear`.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from pathlib import Path

import torch
from torch import nn

FORMAT = "echo-q4/1"
GROUP_SIZE = 128
INNER_K_TILES = 8
BF16 = torch.bfloat16


# --- Quantization math (tinygemm convention, as in gpt-fast / torchao) -------------------------


def quantize_groups(w: torch.Tensor, group_size: int = GROUP_SIZE):
    """Asymmetric 4-bit per group. Returns int32 codes 0..15 [n, k], scales and zeros [n, k/g]."""
    n, k = w.shape
    if k % group_size:
        raise ValueError(f"in_features {k} is not a multiple of group size {group_size}")
    groups = w.float().reshape(-1, group_size)
    lo = groups.amin(dim=1, keepdim=True)
    hi = groups.amax(dim=1, keepdim=True)
    scales = ((hi - lo).clamp(min=1e-6) / 15).to(BF16).float()
    zeros = (lo + scales * 8).to(BF16).float()
    base = zeros - scales * 8
    codes = groups.sub(base).div(scales).round().clamp_(0, 15).to(torch.int32).reshape(n, k)
    return codes, scales.reshape(n, -1).to(BF16), zeros.reshape(n, -1).to(BF16)


def dequantize_groups(codes: torch.Tensor, scales: torch.Tensor, zeros: torch.Tensor,
                      group_size: int = GROUP_SIZE) -> torch.Tensor:
    n, k = codes.shape
    c = codes.float().reshape(-1, group_size)
    s = scales.float().reshape(-1, 1)
    z = zeros.float().reshape(-1, 1)
    return ((c - 8) * s + z).reshape(n, k)


def quantizable(out_features: int, in_features: int, group_size: int = GROUP_SIZE) -> bool:
    return in_features % group_size == 0 and in_features % (INNER_K_TILES * 16) == 0 and out_features % 8 == 0


def _torch_at_least(major: int, minor: int) -> bool:
    parts = torch.__version__.split("+")[0].split(".")
    return (int(parts[0]), int(parts[1])) >= (major, minor)


def pack(codes: torch.Tensor, scales: torch.Tensor, zeros: torch.Tensor, device):
    """Pack codes for tinygemm on `device`. The packed layout is device-specific (CUDA vs CPU)."""
    codes = codes.to(device)
    if _torch_at_least(2, 5):  # PyTorch 2.5 changed the input to two 4-bit codes per uint8.
        codes = (codes[:, ::2] << 4 | codes[:, 1::2]).to(torch.uint8)
    packed = torch.ops.aten._convert_weight_to_int4pack(codes.contiguous(), INNER_K_TILES)
    scales_and_zeros = torch.cat([scales.unsqueeze(-1), zeros.unsqueeze(-1)], 2).transpose(0, 1)
    return packed, scales_and_zeros.contiguous().to(device=device, dtype=BF16)


# --- Packed weights at runtime -----------------------------------------------------------------


class Q4Weight:
    """A packed 4-bit [out, in] matrix. Exposes .device/.dtype/.shape like the bf16 weight it replaces,
    so moshi's KV-cache setup (which reads `in_proj_weight.dtype`) keeps working."""

    dtype = BF16

    def __init__(self, packed, scales_and_zeros, out_features: int, in_features: int,
                 group_size: int = GROUP_SIZE):
        self.packed = packed
        self.scales_and_zeros = scales_and_zeros
        self.out_features = out_features
        self.in_features = in_features
        self.group_size = group_size

    @property
    def device(self):
        return self.packed.device

    @property
    def shape(self):
        return torch.Size((self.out_features, self.in_features))

    def linear(self, x: torch.Tensor) -> torch.Tensor:
        lead = x.shape[:-1]
        x2 = x.reshape(-1, self.in_features)
        if x2.dtype != BF16:
            x2 = x2.to(BF16)
        y = torch.ops.aten._weight_int4pack_mm(x2.contiguous(), self.packed, self.group_size,
                                               self.scales_and_zeros)
        return y.reshape(*lead, self.out_features).to(x.dtype)


class Q4Steps:
    """Per-step weights of the depformer (`weights_per_step`): one Q4Weight per codebook step."""

    dtype = BF16

    def __init__(self, steps: list[Q4Weight]):
        self.steps = steps

    @property
    def device(self):
        return self.steps[0].device

    @property
    def shape(self):
        first = self.steps[0]
        return torch.Size((first.out_features * len(self.steps), first.in_features))


class Q4Linear(nn.Module):
    """Drop-in for nn.Linear whose `.weight` is a Q4Weight (or Q4Steps, read by multi_linear)."""

    def __init__(self, weight, bias: torch.Tensor | None = None):
        super().__init__()
        self.weight = weight  # plain attribute: not a Parameter, so .to()/state_dict ignore it
        self.bias = nn.Parameter(bias, requires_grad=False) if bias is not None else None

    def forward(self, x):
        y = self.weight.linear(x)
        return y if self.bias is None else y + self.bias


def _linear(x, weight, bias=None):
    if isinstance(weight, Q4Weight):
        y = weight.linear(x)
        return y if bias is None else y + bias
    return torch.nn.functional.linear(x, weight, bias)


class _FunctionalShim:
    """torch.nn.functional, except `linear` understands Q4Weight."""

    linear = staticmethod(_linear)

    def __getattr__(self, name):
        return getattr(torch.nn.functional, name)


class _NNShim:
    """torch.nn for moshi's transformer module: same classes, Q4-aware `functional.linear`."""

    functional = _FunctionalShim()

    def __getattr__(self, name):
        return getattr(torch.nn, name)


_original_multi_linear = None


def _multi_linear(num_linear, weight, x, offset):
    if isinstance(weight, Q4Steps):
        _, steps, _ = x.shape
        return torch.stack([weight.steps[t + offset].linear(x[:, t]) for t in range(steps)], 1)
    return _original_multi_linear(num_linear, weight, x, offset)


def _gating_kernel(weight_in, weight_out, activation, x):
    x = _linear(x, weight_in)
    b, t, _ = x.shape
    x = x.view(b, t, 2, -1)
    x = activation(x[..., 0, :]) * x[..., 1, :]
    return _linear(x, weight_out)


def patch_moshi() -> None:
    """Route moshi's three direct linear call sites through Q4-aware versions. Idempotent."""
    global _original_multi_linear
    from moshi.modules import gating, transformer

    if _original_multi_linear is None:
        _original_multi_linear = transformer.multi_linear
    transformer.nn = _NNShim()
    transformer.F = _NNShim.functional
    transformer.multi_linear = _multi_linear
    gating.F = _NNShim.functional
    gating.gating_forward_kernel = _gating_kernel


# --- Which weights get quantized ---------------------------------------------------------------


@dataclass
class Target:
    """One weight to quantize. `key` is its name in the PersonaPlex state dict."""

    key: str
    owner: str  # module path that holds it
    attr: str  # "in_proj_weight" or a child module name
    steps: int  # >0 for depformer per-step weights


def plan_targets(model: nn.Module, group_size: int = GROUP_SIZE) -> list[Target]:
    from moshi.modules.gating import ActivationGating
    from moshi.modules.transformer import StreamingMultiheadAttention

    targets: list[Target] = []
    for name, module in model.named_modules():
        prefix = f"{name}." if name else ""
        if isinstance(module, StreamingMultiheadAttention):
            steps = module.weights_per_step or 0
            targets.append(Target(f"{prefix}in_proj_weight", name, "in_proj_weight", steps))
            targets.append(Target(f"{prefix}out_proj.weight", name, "out_proj", steps))
        elif isinstance(module, ActivationGating):
            targets.append(Target(f"{prefix}linear_in.weight", name, "linear_in", 0))
            targets.append(Target(f"{prefix}linear_out.weight", name, "linear_out", 0))
    for group in ("linears", "depformer_in"):
        modules = getattr(model, group, None)
        if modules is None:
            continue
        for i, module in enumerate(modules):
            if isinstance(module, nn.Linear):
                targets.append(Target(f"{group}.{i}.weight", group, str(i), 0))

    shapes = {k: tuple(v.shape) for k, v in model.state_dict(keep_vars=True).items()}
    kept = []
    for t in targets:
        out_features, in_features = shapes[t.key]
        if t.steps:
            out_features //= t.steps
        if quantizable(out_features, in_features, group_size):
            kept.append(t)
        else:
            warnings.warn(f"keeping {t.key} in bf16: shape {shapes[t.key]} does not fit int4 tiles")
    return kept


def lm_kwargs(dep_q: int = 16, context: int | None = None) -> dict:
    """The exact LMModel config `loaders.get_moshi_lm` builds for PersonaPlex."""
    from moshi.models import loaders

    kwargs = dict(loaders._lm_kwargs)
    kwargs["dep_q"] = dep_q
    if context is not None:
        kwargs["context"] = context
    return kwargs


def _install(model: nn.Module, target: Target, weight, bias: torch.Tensor | None = None) -> None:
    owner = model.get_submodule(target.owner) if target.owner else model
    if target.attr == "in_proj_weight":
        del owner._parameters["in_proj_weight"]
        setattr(owner, "in_proj_weight", weight)  # now a plain attribute read by the patched linear
    else:
        old = getattr(owner, target.attr) if not target.attr.isdigit() else owner[int(target.attr)]
        bias = bias if bias is not None else getattr(old, "bias", None)
        new = Q4Linear(weight, None if bias is None or bias.is_meta else bias)
        if target.attr.isdigit():
            owner[int(target.attr)] = new
        else:
            setattr(owner, target.attr, new)


# --- Checkpoint resolution (mirrors loaders.get_moshi_lm patches) ------------------------------


class CheckpointReader:
    """Reads PersonaPlex's model.safetensors tensor by tensor (low RAM) and applies the same two
    patches as `loaders.get_moshi_lm`: depformer self-attention weights stored for 8 steps are
    doubled to 16, and missing per-step modules 8..15 are copied from 0..7."""

    REPLACE = ("gating", "linears", "depformer_in", "depformer_emb")

    def __init__(self, path: str | Path, expected: dict[str, tuple]):
        from safetensors import safe_open

        self._file = safe_open(str(path), framework="pt", device="cpu")
        self.keys = set(self._file.keys())
        self.expected = expected

    def get(self, name: str) -> torch.Tensor:
        if name in self.keys:
            tensor = self._file.get_tensor(name)
            want = self.expected[name]
            if tuple(tensor.shape) != want and "depformer" in name and "self_attn" in name:
                tensor = torch.cat([tensor, tensor], dim=0)
            if tuple(tensor.shape) != want:
                raise ValueError(f"{name}: checkpoint shape {tuple(tensor.shape)} != model {want}")
            return tensor.to(BF16)
        for old, new in zip(range(8), range(8, 16)):
            for rep in self.REPLACE:
                needle = f"{rep}.{new}."
                if needle in name:
                    source = name.replace(needle, f"{rep}.{old}.")
                    if source in self.keys:
                        return self._file.get_tensor(source).to(BF16)
                    break
        raise KeyError(f"{name} is not in the checkpoint and has no 0..7 source to copy from")


# --- Quantize once, save, load -----------------------------------------------------------------


def quantize_checkpoint(source: str | Path, out: str | Path, device: str = "cuda",
                        group_size: int = GROUP_SIZE, dep_q: int = 16, log=print) -> dict:
    """Read the bf16 checkpoint, quantize the planned weights on `device`, save one file."""
    from moshi.models.lm import LMModel

    with torch.device("meta"):
        model = LMModel(device="meta", dtype=BF16, **lm_kwargs(dep_q))
    targets = {t.key: t for t in plan_targets(model, group_size)}
    expected = {k: tuple(v.shape) for k, v in model.state_dict(keep_vars=True).items()}
    reader = CheckpointReader(source, expected)

    quantized: dict[str, dict] = {}
    rest: dict[str, torch.Tensor] = {}
    errors = []
    checked = 0
    for i, key in enumerate(sorted(expected)):
        tensor = reader.get(key)
        target = targets.get(key)
        if target is None:
            rest[key] = tensor
            continue
        chunks = tensor.view(target.steps, -1, tensor.shape[1]) if target.steps else [tensor]
        packed, sz = [], []
        for chunk in chunks:
            w = chunk.to(device)
            codes, scales, zeros = quantize_groups(w, group_size)
            p, s = pack(codes, scales, zeros, device)
            if checked < 4:  # prove the packed kernel matches the math on real weights
                x = torch.randn(2, w.shape[1], device=device, dtype=BF16)
                ref = x.float() @ dequantize_groups(codes, scales, zeros, group_size).T
                got = Q4Weight(p, s, w.shape[0], w.shape[1], group_size).linear(x).float()
                rel = ((got - ref).norm() / ref.norm()).item()
                if rel > 0.02:
                    raise RuntimeError(f"int4 kernel mismatch on {key}: relative error {rel:.4f}")
                checked += 1
            deq = dequantize_groups(codes, scales, zeros, group_size)
            errors.append(((deq - w.float()).norm() / w.float().norm()).item())
            packed.append(p.cpu())
            sz.append(s.cpu())
        out_features = chunks[0].shape[0]
        quantized[key] = {"steps": target.steps, "out": out_features, "in": tensor.shape[1],
                          "packed": packed, "sz": sz}
        if i % 25 == 0:
            log(f"[{i}/{len(expected)}] {key} -> 4-bit")

    meta = {"format": FORMAT, "torch": str(torch.__version__), "device_type": torch.device(device).type,
            "group_size": group_size, "inner_k_tiles": INNER_K_TILES, "dep_q": dep_q,
            "source": str(source), "mean_weight_error": sum(errors) / max(1, len(errors)),
            "max_weight_error": max(errors, default=0.0)}
    torch.save({"meta": meta, "quantized": quantized, "rest": rest}, str(out))
    q_bytes = sum(t.numel() * t.element_size() for q in quantized.values() for t in q["packed"] + q["sz"])
    r_bytes = sum(t.numel() * t.element_size() for t in rest.values())
    meta.update(quantized_gb=q_bytes / 1e9, bf16_gb=r_bytes / 1e9)
    return meta


def load_q4_lm(path: str | Path, device="cuda", context: int | None = None):
    """Build PersonaPlex's LMModel on `device` from a file written by quantize_checkpoint."""
    from moshi.models.lm import LMModel

    patch_moshi()
    device = torch.device(device)
    ckpt = torch.load(str(path), map_location="cpu", mmap=True, weights_only=True)
    meta = ckpt["meta"]
    if meta.get("format") != FORMAT:
        raise ValueError(f"{path} is not an {FORMAT} file")
    if meta["device_type"] != device.type:
        raise ValueError(f"{path} was packed for {meta['device_type']}, not {device.type}; re-run quantize")
    if meta["torch"].split("+")[0].rsplit(".", 1)[0] != torch.__version__.split("+")[0].rsplit(".", 1)[0]:
        warnings.warn(f"packed with torch {meta['torch']}, running {torch.__version__}; re-quantize if output "
                      "sounds wrong")

    with torch.device("meta"):
        model = LMModel(device="meta", dtype=BF16, **lm_kwargs(meta["dep_q"], context))
    targets = {t.key: t for t in plan_targets(model, meta["group_size"])}
    missing = set(targets) ^ set(ckpt["quantized"])
    if missing:
        raise ValueError(f"quantized weights do not match this moshi version: {sorted(missing)[:5]}")
    for key, q in ckpt["quantized"].items():
        weights = [Q4Weight(p.to(device), s.to(device), q["out"], q["in"], meta["group_size"])
                   for p, s in zip(q["packed"], q["sz"])]
        _install(model, targets[key], Q4Steps(weights) if q["steps"] else weights[0])

    rest = {k: v.to(device=device, dtype=BF16) for k, v in ckpt["rest"].items()}
    result = model.load_state_dict(rest, strict=False, assign=True)
    if result.unexpected_keys:
        raise RuntimeError(f"weights with nowhere to go: {result.unexpected_keys[:5]}")
    leftovers = [n for n, t in list(model.named_parameters()) + list(model.named_buffers()) if t.is_meta]
    if leftovers:
        raise RuntimeError(f"weights missing after load: {leftovers[:5]}")
    model.eval()
    return model


def load_runtime(path: str | Path, device="cuda", context: int | None = None,
                 hf_repo: str = "nvidia/personaplex-7b-v1", save_voice_prompt_embeddings: bool = False):
    """Mimi x2 + 4-bit LM + LMGen, wired exactly like moshi.server's ServerState."""
    from huggingface_hub import hf_hub_download
    from moshi.models import LMGen, loaders

    device = torch.device(device)
    mimi_weight = hf_hub_download(hf_repo, loaders.MIMI_NAME)
    mimi = loaders.get_mimi(mimi_weight, device)
    other_mimi = loaders.get_mimi(mimi_weight, device)
    lm = load_q4_lm(path, device, context)
    lm_gen = LMGen(lm, audio_silence_frame_cnt=int(0.5 * mimi.frame_rate), sample_rate=mimi.sample_rate,
                   device=device, frame_rate=mimi.frame_rate,
                   save_voice_prompt_embeddings=save_voice_prompt_embeddings)
    mimi.streaming_forever(1)
    other_mimi.streaming_forever(1)
    lm_gen.streaming_forever(1)
    return mimi, other_mimi, lm_gen


def use_q4_loader(path: str | Path, context: int | None = None) -> None:
    """Make moshi's server/offline scripts load the 4-bit file instead of the 16.7 GB checkpoint."""
    from moshi.models import loaders

    def get_moshi_lm(filename=None, copy_missing_weights=True, device="cpu", dtype=BF16, delays=None,
                     cpu_offload=False):
        if cpu_offload:
            warnings.warn("--cpu-offload is ignored: the 4-bit build is meant to fit on the GPU")
        if delays is not None:
            warnings.warn("custom delays are ignored by the 4-bit loader")
        return load_q4_lm(path, device, context)

    loaders.get_moshi_lm = get_moshi_lm
