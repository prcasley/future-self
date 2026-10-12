"""ECHO Live's 4-bit PersonaPlex build. Runs only where torch and NVIDIA's moshi are installed
(services/echo-live/requirements.txt); the API test environment skips it. CPU-only: these prove the
math, the moshi patching and the save/load round trip, not GPU speed or audio quality."""

import sys
from pathlib import Path

import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("moshi.models.lm")
pytest.importorskip("safetensors")

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "echo-live"))
import q4  # noqa: E402
from moshi.models.lm import LMModel  # noqa: E402


def _cpu_int4_kernel() -> bool:
    try:
        codes, scales, zeros = q4.quantize_groups(torch.randn(16, 128))
        packed, sz = q4.pack(codes, scales, zeros, "cpu")
        q4.Q4Weight(packed, sz, 16, 128).linear(torch.randn(1, 128, dtype=torch.bfloat16))
        return True
    except (RuntimeError, NotImplementedError):
        return False


needs_kernel = pytest.mark.skipif(not _cpu_int4_kernel(), reason="this torch build has no CPU int4 kernel")

TINY = dict(
    dim=128, text_card=96, existing_text_padding_id=3, n_q=4, dep_q=4, card=64, num_heads=4,
    num_layers=2, hidden_scale=3.0, causal=True, layer_scale=None, context=32, max_period=10000,
    gating="silu", norm="rms_norm_f32", positional_embedding="rope", depformer_dim=128,
    depformer_dim_feedforward=384, depformer_num_heads=4, depformer_num_layers=1,
    depformer_causal=True, depformer_layer_scale=None, depformer_multi_linear=True, depformer_context=4,
    depformer_max_period=10000, depformer_gating="silu", depformer_pos_emb="none",
    depformer_weights_per_step=True, delays=[0, 0, 1, 1, 1],
)


def test_group_quantization_error_is_small_and_codes_are_4_bit():
    torch.manual_seed(0)
    w = torch.randn(64, 256)
    codes, scales, zeros = q4.quantize_groups(w)
    assert codes.min() >= 0 and codes.max() <= 15
    assert scales.shape == zeros.shape == (64, 2)
    rel = (q4.dequantize_groups(codes, scales, zeros) - w).norm() / w.norm()
    assert rel < 0.12


def test_rejects_shapes_the_int4_kernel_cannot_tile():
    assert q4.quantizable(4096, 4096) and q4.quantizable(2048, 1024)
    assert not q4.quantizable(4096, 100) and not q4.quantizable(30, 4096)
    with pytest.raises(ValueError):
        q4.quantize_groups(torch.randn(8, 100))


def test_personaplex_plan_quantizes_every_big_matrix_and_fits_8gb():
    with torch.device("meta"):
        model = LMModel(device="meta", dtype=torch.bfloat16, **q4.lm_kwargs())
    targets = q4.plan_targets(model)
    keys = {t.key for t in targets}
    # 32 main layers x (attention in/out + gating in/out), 6 depformer layers x (attention in/out
    # + 16 per-step gatings x in/out), 16 output linears, 16 depformer input projections.
    assert len(targets) == 32 * 4 + 6 * 2 + 6 * 16 * 2 + 16 + 16
    assert "transformer.layers.0.self_attn.in_proj_weight" in keys
    assert "text_linear.weight" not in keys and not any(k.startswith("emb.") for k in keys)

    shapes = {k: v.numel() for k, v in model.state_dict(keep_vars=True).items()}
    quantized = sum(shapes[k] for k in keys)
    rest = sum(n for k, n in shapes.items() if k not in keys)
    weights_gb = (quantized * (0.5 + 4 / q4.GROUP_SIZE) + rest * 2) / 1e9
    assert quantized > 7.5e9  # nearly all of the ~8.3B values
    assert weights_gb < 5.5, f"4-bit weights estimate {weights_gb:.2f} GB"


@needs_kernel
def test_packed_kernel_matches_the_dequantized_math():
    torch.manual_seed(1)
    w = torch.randn(256, 512)
    codes, scales, zeros = q4.quantize_groups(w)
    packed, sz = q4.pack(codes, scales, zeros, "cpu")
    x = torch.randn(3, 5, 512, dtype=torch.bfloat16)
    got = q4.Q4Weight(packed, sz, 256, 512).linear(x).float()
    ref = x.float() @ q4.dequantize_groups(codes, scales, zeros).T
    assert got.shape == (3, 5, 256)
    assert (got - ref).norm() / ref.norm() < 0.02


@needs_kernel
def test_tiny_personaplex_round_trip_through_file_matches_bf16(tmp_path, monkeypatch):
    from safetensors.torch import save_file

    torch.manual_seed(2)
    monkeypatch.setattr(q4, "lm_kwargs", lambda dep_q=4, context=None: dict(TINY, **({"context": context}
                                                                                    if context else {})))
    reference = LMModel(device="cpu", dtype=torch.bfloat16, **TINY).eval()
    with torch.no_grad():
        for p in reference.parameters():
            p.normal_(0, 0.05)
    source = tmp_path / "model.safetensors"
    save_file({k: v.contiguous() for k, v in reference.state_dict().items()}, str(source))

    out = tmp_path / "tiny-q4.pt"
    meta = q4.quantize_checkpoint(source, out, device="cpu", dep_q=4, log=lambda *_: None)
    assert meta["max_weight_error"] < 0.12
    model = q4.load_q4_lm(out, "cpu")

    attn = model.transformer.layers[0].self_attn
    assert isinstance(attn.in_proj_weight, q4.Q4Weight) and "in_proj_weight" not in attn._parameters
    assert isinstance(model.depformer.layers[0].self_attn.in_proj_weight, q4.Q4Steps)
    assert isinstance(model.linears[0], q4.Q4Linear)

    codes = torch.randint(0, 64, (1, TINY["n_q"] + 1, 6))
    codes[:, 0] = torch.randint(0, 96, (1, 6))
    # Stock PersonaPlex mixes an fp32 RMSNorm with bf16 linears; it runs under bf16 autocast.
    with torch.no_grad(), torch.autocast("cpu", dtype=torch.bfloat16):
        want = reference.forward_train(codes)
        got = model.forward_train(codes)
    for a, b in ((want.logits, got.logits), (want.text_logits, got.text_logits)):
        a, b = a.float().flatten(), b.float().flatten()
        valid = a.isfinite()  # delayed codebook positions are NaN by design (forward_train's mask)
        assert torch.equal(valid, b.isfinite()) and valid.any()
        assert torch.nn.functional.cosine_similarity(a[valid], b[valid], dim=0) > 0.98


def test_q4_file_from_another_device_is_refused(tmp_path):
    path = tmp_path / "x.pt"
    torch.save({"meta": {"format": q4.FORMAT, "device_type": "cuda", "torch": str(torch.__version__),
                         "group_size": 128, "dep_q": 16}, "quantized": {}, "rest": {}}, path)
    with pytest.raises(ValueError, match="packed for cuda"):
        q4.load_q4_lm(path, "cpu")
