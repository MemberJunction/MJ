"""TimesFM wrapper — the only module that knows the vendor API.

Everything the rest of the service sees is the MJ contract (a context and a horizon in, a median
and nine quantiles out). Two reasons that indirection earns its keep:

* **The two vendor APIs disagree.** 2.5 is ``timesfm.TimesFM_2p5_200M_torch`` returning ten
  columns with the MEAN at index 0; 3.0 is ``timesfm3.TimesFM3Forecaster`` returning nine
  quantiles. A caller should never have to know which one answered.
* **The licences differ.** The source is Apache-2.0 and so are the 2.5 weights, but the 3.0
  weights ship under a non-commercial licence. That is a property of the checkpoint, so it is
  tracked here, next to the thing it constrains.

Import is guarded exactly like the tabular sidecar guards xgboost/lightgbm/hmmlearn: a build
without ``timesfm`` still starts and reports the model unavailable, rather than failing to boot.
"""
from __future__ import annotations

import math
import os
import threading
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

# The MJ-facing quantile grid. Mirrors FORECAST_QUANTILE_LEVELS in the TypeScript contract; the
# test suite asserts the two stay aligned.
QUANTILE_LEVELS: Tuple[float, ...] = (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)

#: Shortest context worth forecasting. The model's input patch is 32 steps, so anything shorter is
#: below its own resolution — it still returns a confident-looking band, and that band is noise.
MIN_CONTEXT = 32

DEFAULT_CHECKPOINT = "timesfm-2.5-200m"

#: Checkpoint → (HuggingFace repo, production-licensed?).
#: 3.0's weights are timesfm-non-commercial-license-v1.0. Production code must not reach them, so
#: the flag travels with the forecast and the caller decides what to do about it.
CHECKPOINTS: Dict[str, Dict[str, Any]] = {
    "timesfm-2.5-200m": {"repo": "google/timesfm-2.5-200m-pytorch", "production_licensed": True},
    "timesfm-3.0-200m": {"repo": "google/timesfm-3.0-pytorch", "production_licensed": False},
}

try:  # pragma: no cover - import guard
    import timesfm as _timesfm  # noqa: F401

    _IMPORT_ERROR: Optional[str] = None
except Exception as exc:  # pragma: no cover - import guard
    _timesfm = None
    _IMPORT_ERROR = f"the 'timesfm' package is not installed ({exc})"


class ForecastUnavailable(RuntimeError):
    """Raised when a forecast was asked for but the model cannot be loaded."""


# Loaded models are cached per checkpoint: the 2.5 weights are ~800MB on disk and ~1.5GB resident,
# so reloading per request would dominate the response time and thrash memory.
_MODELS: Dict[str, Any] = {}
_LOAD_LOCK = threading.Lock()


def _weights_dir(checkpoint: str) -> Optional[str]:
    """A pre-staged local checkpoint directory, when one is configured.

    Both vendor classes go through ``hf_hub_download`` unless handed a local path, so a host with
    no route to huggingface.co cannot load weights at all. Production installs stage the checkpoint
    and point at it; this is the hook that makes that possible.
    """
    specific = os.environ.get(f"MJ_TIMESFM_PATH__{checkpoint.replace('-', '_').replace('.', '_')}")
    return specific or os.environ.get("MJ_TIMESFM_PATH") or None


def model_available() -> bool:
    return _timesfm is not None


def unavailable_reason() -> Optional[str]:
    return _IMPORT_ERROR


def _load(checkpoint: str) -> Any:
    """Load (and cache) a checkpoint. Thread-safe: uvicorn serves requests concurrently."""
    if _timesfm is None:
        raise ForecastUnavailable(_IMPORT_ERROR or "timesfm is not installed")
    if checkpoint not in CHECKPOINTS:
        raise ForecastUnavailable(f"unknown checkpoint '{checkpoint}'")
    cached = _MODELS.get(checkpoint)
    if cached is not None:
        return cached
    with _LOAD_LOCK:
        cached = _MODELS.get(checkpoint)
        if cached is not None:
            return cached
        source = _weights_dir(checkpoint) or CHECKPOINTS[checkpoint]["repo"]
        model = _timesfm.TimesFM_2p5_200M_torch.from_pretrained(source)
        # The docs recommend these explicitly and they all default OFF, so a caller who trusts the
        # defaults gets worse forecasts and unordered quantiles. `infer_is_positive` stays off:
        # MJ series include cash positions and deltas that legitimately go negative, and forcing
        # positivity there would silently distort the band.
        model.compile(
            _timesfm.ForecastConfig(
                max_context=1024,
                max_horizon=256,
                normalize_inputs=True,
                use_continuous_quantile_head=True,
                force_flip_invariance=True,
                infer_is_positive=False,
                fix_quantile_crossing=True,
            )
        )
        _MODELS[checkpoint] = model
        return model


def available_checkpoints() -> List[str]:
    """Checkpoints already loaded, plus any with pre-staged local weights."""
    if _timesfm is None:
        return []
    out = list(_MODELS.keys())
    for name in CHECKPOINTS:
        if name not in out and _weights_dir(name):
            out.append(name)
    return out


def _refusal(context: Sequence[float], min_context: int) -> Optional[str]:
    """Why this series must not be forecast, or None when it is fit to forecast.

    Refusing is the point. A foundation model will answer anything, so the caller has no way to
    tell a real signal from a confident band drawn around 8 points of noise; that judgment has to
    live here, where the series is.
    """
    n = len(context)
    if n < min_context:
        return (
            f"series has {n} points, below the {min_context}-point minimum "
            f"(the model's input patch is {MIN_CONTEXT} steps, so a shorter context is below its resolution)"
        )
    values = np.asarray(context, dtype=float)
    if not np.all(np.isfinite(values)):
        return "series contains non-finite values (NaN or infinity), which the model cannot consume"
    if float(np.max(values) - np.min(values)) == 0.0:
        return "series is constant, so a forecast would restate the constant with false confidence"
    return None


def _to_quantile_grid(raw: np.ndarray) -> List[List[float]]:
    """Map a vendor quantile block onto {@link QUANTILE_LEVELS}.

    2.5 returns ten columns with the MEAN at index 0 and p10..p90 after it; taking the block
    verbatim would silently label the mean as p10 and shift every level by one.
    """
    block = np.asarray(raw, dtype=float)
    if block.ndim != 2:
        raise ForecastUnavailable(f"unexpected quantile shape {block.shape}")
    if block.shape[1] == len(QUANTILE_LEVELS) + 1:
        block = block[:, 1:]
    elif block.shape[1] != len(QUANTILE_LEVELS):
        raise ForecastUnavailable(
            f"checkpoint returned {block.shape[1]} quantile columns; expected "
            f"{len(QUANTILE_LEVELS)} or {len(QUANTILE_LEVELS) + 1}"
        )
    return [[float(v) for v in row] for row in block]


def forecast_batch(
    series: Sequence[Tuple[str, Sequence[float]]],
    horizon: int,
    checkpoint: str = DEFAULT_CHECKPOINT,
    min_context: int = MIN_CONTEXT,
) -> Tuple[List[Dict[str, Any]], bool]:
    """Forecast a batch of series. Returns (results, production_licensed).

    Refused series never reach the model, but they DO keep their slot in the result list, so a
    caller can always match results to inputs by position as well as by key.
    """
    if horizon < 1:
        raise ForecastUnavailable("horizon must be at least 1")
    results: List[Dict[str, Any]] = []
    forecastable: List[Tuple[int, Sequence[float]]] = []
    for index, (key, context) in enumerate(series):
        reason = _refusal(context, min_context)
        results.append({"Key": key, "Median": None, "Quantiles": None, "Refused": reason})
        if reason is None:
            forecastable.append((index, context))

    licensed = bool(CHECKPOINTS.get(checkpoint, {}).get("production_licensed", False))
    if not forecastable:
        return results, licensed

    model = _load(checkpoint)
    contexts = [np.asarray(c, dtype=float) for _, c in forecastable]
    point, quantiles = model.forecast(horizon=horizon, inputs=contexts)
    for slot, (index, _) in enumerate(forecastable):
        grid = _to_quantile_grid(np.asarray(quantiles)[slot])
        results[index]["Median"] = [float(v) for v in np.asarray(point)[slot][:horizon]]
        results[index]["Quantiles"] = grid[:horizon]
    return results, licensed
