"""Preprocessing — the anti-skew correctness core.

Stateful transforms (impute fill values, standardize mean/std, one-hot
vocabulary, bin edges) are **fit once** on training data during ``/train`` and
their learned parameters are returned in ``fitted_preprocessing``. At
``/predict`` time those frozen parameters are **only applied** — never re-fit.
This fit-once / apply-everywhere split is what prevents train/serve skew
(plan §6.2).

Both ``fit_transform`` (train) and ``transform`` (predict) ultimately funnel
through the same per-op ``_apply_*`` helpers so an identical raw row produces an
identical transformed vector in both contexts — the property the golden test
locks down.

The output of both paths is an ordered list of ``(feature_name, value)`` columns.
The matrix builder downstream relies on this stable ordering.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

# A fitted-preprocessing payload is a JSON-serializable dict:
# {
#   "ops": [ { "op": "...", ...learned params... }, ... ],
#   "output_columns": ["age", "city=NY", "city=SF", ...]   # final column order
# }
FittedPreprocessing = Dict[str, Any]


def _is_missing(value: Any) -> bool:
    """True for null-equivalents: ``None``, NaN floats, and blank/whitespace strings."""
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _to_float(value: Any) -> Optional[float]:
    """Coerce a value to float, returning ``None`` for missing or non-numeric input."""
    if _is_missing(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# FIT helpers — each returns the learned params for one op (train only)
# ---------------------------------------------------------------------------

def _fit_impute(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit the imputation fill value for one column from the training frame.

    Learns the mean/median (numeric), the mode (categorical), or carries the
    declared constant. Returns the frozen ``{op, col, strategy, fill}`` params
    applied at /predict.

    Raises:
        ValueError: For an unknown ``strategy``.
    """
    col = op["col"]
    strategy = op.get("strategy", "mean")
    series = df[col]
    if strategy == "mean":
        fill = float(pd.to_numeric(series, errors="coerce").mean())
    elif strategy == "median":
        fill = float(pd.to_numeric(series, errors="coerce").median())
    elif strategy == "mode":
        non_null = series.dropna()
        non_null = non_null[non_null.astype(str).str.strip() != ""]
        fill = non_null.mode().iloc[0] if not non_null.mode().empty else None
        fill = None if fill is None else _json_safe_scalar(fill)
    elif strategy == "constant":
        fill = op.get("fillValue")
    else:
        raise ValueError(f"Unknown impute strategy '{strategy}'")
    return {"op": "impute", "col": col, "strategy": strategy, "fill": fill}


def _fit_standardize(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit per-column mean/std for z-score standardization (population std, ddof=0).

    A degenerate (zero/non-finite std) column gets std=1.0 so apply-time division
    can't blow up — the column stays centered. Returns ``{op, cols, stats}``.
    """
    cols = op.get("cols") or ([op["col"]] if op.get("col") else [])
    stats: Dict[str, Dict[str, float]] = {}
    for col in cols:
        numeric = pd.to_numeric(df[col], errors="coerce")
        mean = float(numeric.mean())
        std = float(numeric.std(ddof=0))
        if not np.isfinite(std) or std == 0.0:
            std = 1.0  # degenerate column -> avoid divide-by-zero, keep centered
        stats[col] = {"mean": mean, "std": std}
    return {"op": "standardize", "cols": list(cols), "stats": stats}


def _fit_onehot(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit the sorted categorical vocabulary for one-hot encoding one column.

    The sorted vocabulary fixes the indicator-column order so train and serve
    produce positionally identical features. Returns ``{op, col, vocabulary}``.
    """
    col = op["col"]
    values = df[col].apply(lambda v: None if _is_missing(v) else str(v))
    vocab = sorted({v for v in values if v is not None})
    return {"op": "onehot", "col": col, "vocabulary": vocab}


def _fit_bin(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit quantile bin edges for discretizing one numeric column.

    Edges are the (deduplicated) quantiles of the non-null values; degenerate
    cases (empty / all-identical) fall back to a trivial two-edge range so the
    apply path always has a valid bucket boundary. Returns ``{op, col, edges}``.
    """
    col = op["col"]
    n_bins = int(op.get("bins") or 4)
    numeric = pd.to_numeric(df[col], errors="coerce").dropna()
    if numeric.empty:
        edges = [0.0, 1.0]
    else:
        quantiles = np.linspace(0.0, 1.0, n_bins + 1)
        edges = sorted(set(float(x) for x in np.quantile(numeric, quantiles)))
        if len(edges) < 2:  # all identical values
            base = edges[0] if edges else 0.0
            edges = [base, base + 1.0]
    return {"op": "bin", "col": col, "edges": edges}


def _norm_meta(op: Dict[str, Any]) -> Dict[str, Any]:
    """The direction + output-range envelope shared by every normalization op.

    ``higherIsBetter=False`` inverts the normalized fraction before scaling, so "days
    since last activity" can mean engagement without the model seeing a flipped sign
    convention. Defaults: higher is better, output range [0, 1].
    """
    return {
        "higherIsBetter": bool(op.get("higherIsBetter", True)),
        "outputMin": float(op.get("outputMin", 0.0)),
        "outputMax": float(op.get("outputMax", 1.0)),
    }


def _fit_minmax(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit training min/max for [0,1] rescaling (Sonar MinMax). Degenerate range -> width 1."""
    col = op["col"]
    numeric = pd.to_numeric(df[col], errors="coerce").dropna()
    lo = float(numeric.min()) if not numeric.empty else 0.0
    hi = float(numeric.max()) if not numeric.empty else 1.0
    if not np.isfinite(hi - lo) or hi == lo:
        hi = lo + 1.0
    return {"op": "minmax", "col": col, "min": lo, "max": hi, **_norm_meta(op)}


def _fit_percentile(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit the sorted training values for rank/percentile normalization (Sonar Percentile).

    Stores at most 1001 evenly-spaced quantile knots so the frozen payload stays small on
    large populations; apply computes the midpoint rank (count_less + count_equal/2) / n,
    which reproduces Sonar's tie handling.
    """
    col = op["col"]
    numeric = pd.to_numeric(df[col], errors="coerce").dropna().to_numpy(dtype=float)
    numeric.sort()
    if numeric.size == 0:
        knots = [0.0, 1.0]
    elif numeric.size <= 1001:
        knots = [float(v) for v in numeric]
    else:
        knots = [float(v) for v in np.quantile(numeric, np.linspace(0.0, 1.0, 1001))]
    return {"op": "percentile", "col": col, "sorted": knots, **_norm_meta(op)}


def _fit_zscore(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit mean/std for clamped z-score normalization (Sonar ZScore: clamp ±3σ, map to [0,1])."""
    col = op["col"]
    numeric = pd.to_numeric(df[col], errors="coerce")
    mean = float(numeric.mean()) if numeric.notna().any() else 0.0
    std = float(numeric.std(ddof=0)) if numeric.notna().any() else 1.0
    if not np.isfinite(std) or std == 0.0:
        std = 1.0
    return {"op": "zscore", "col": col, "mean": mean, "std": std, **_norm_meta(op)}


def _fit_stateless_curve(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Carry a stateless curve op (logistic/banded/lookup) through unchanged.

    Nothing is fit — the operator's params ARE the transform (Sonar's Curve Mapping
    family: parameterized judgment, identical at train and score by construction).
    """
    del df  # stateless by design
    return {"op": op["op"], "col": op["col"], "params": dict(op.get("params") or {}), **_norm_meta(op)}


def _fit_present(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Carry a `present` op through unchanged — absence is observed, never learned.

    Nothing is fit: whether a record had a value is a property of that record, so the mask means
    the same thing at train and at score by construction. Fitting anything here (a base rate, say)
    would make the mask depend on the training population, which is exactly what it must not do.
    """
    del df  # stateless by design
    return {
        "op": "present",
        "col": op["col"],
        "emit_mask": True if op.get("emitMask") is None else bool(op.get("emitMask")),
        "preserve_missing": bool(op.get("preserveMissing")),
    }


_FIT_DISPATCH = {
    "minmax": _fit_minmax,
    "percentile": _fit_percentile,
    "zscore": _fit_zscore,
    "logistic": _fit_stateless_curve,
    "banded": _fit_stateless_curve,
    "lookup": _fit_stateless_curve,
    "impute": _fit_impute,
    "standardize": _fit_standardize,
    "onehot": _fit_onehot,
    "bin": _fit_bin,
    "present": _fit_present,
}


# ---------------------------------------------------------------------------
# APPLY helpers — shared by fit_transform (train) and transform (predict)
# Each mutates `row` (a dict) and/or appends to the ordered `out` column list.
# ---------------------------------------------------------------------------

def _apply_impute(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    """Apply a fitted impute op: fill the column with the frozen value if missing."""
    col = params["col"]
    if _is_missing(row.get(col)):
        row[col] = params.get("fill")


def _apply_standardize(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    """Apply fitted standardization: z-score each column; missing values become 0."""
    for col, st in params["stats"].items():
        val = _to_float(row.get(col))
        if val is None:
            row[col] = 0.0  # centered missing -> 0 after standardization
        else:
            row[col] = (val - st["mean"]) / st["std"]


def _apply_onehot(params: Dict[str, Any], row: Dict[str, Any], out: List[Tuple[str, Any]]) -> None:
    """Apply fitted one-hot: emit a ``col=category`` indicator per vocabulary entry.

    Consumes the raw categorical from ``row`` and appends the indicator columns to
    ``out`` in fitted-vocabulary order. An out-of-vocabulary value yields all-zero
    indicators (no column for it), keeping train/serve columns identical.
    """
    col = params["col"]
    raw = row.pop(col, None)  # consume the raw categorical; replaced by indicators
    current = None if _is_missing(raw) else str(raw)
    for category in params["vocabulary"]:
        out.append((f"{col}={category}", 1.0 if current == category else 0.0))


def _apply_bin(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    """Apply fitted binning: replace the column with its 0-based bin index.

    The index is the bucket ``val`` falls into per the frozen edges, clamped to
    ``[0, n_bins-1]``. Missing values map to bin 0.
    """
    col = params["col"]
    edges = params["edges"]
    val = _to_float(row.get(col))
    if val is None:
        row[col] = 0
        return
    # bins: index of the right edge that val falls under; clamp to [0, n_bins-1]
    idx = int(np.digitize([val], edges[1:-1], right=False)[0]) if len(edges) > 2 else 0
    idx = max(0, min(idx, len(edges) - 2))
    row[col] = idx


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _scale_to_output(frac: float, params: Dict[str, Any]) -> float:
    """Clamp a normalized fraction to [0,1], apply direction, scale into the output range."""
    frac = min(1.0, max(0.0, frac))
    if not params.get("higherIsBetter", True):
        frac = 1.0 - frac
    lo = float(params.get("outputMin", 0.0))
    hi = float(params.get("outputMax", 1.0))
    return lo + frac * (hi - lo)


def _apply_minmax(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    col = params["col"]
    value = _to_float(row.get(col))
    if value is None:
        return  # leave missing for the model/rubric's missing-data policy
    width = params["max"] - params["min"]
    frac = (value - params["min"]) / width if width else 0.0
    row[col] = _scale_to_output(frac, params)


def _apply_percentile(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    col = params["col"]
    value = _to_float(row.get(col))
    if value is None:
        return
    knots = params["sorted"]
    n = len(knots)
    if n == 0:
        row[col] = _scale_to_output(0.5, params)
        return
    left = int(np.searchsorted(knots, value, side="left"))
    right = int(np.searchsorted(knots, value, side="right"))
    frac = (left + (right - left) / 2.0) / n  # midpoint rank — Sonar's tie handling
    row[col] = _scale_to_output(frac, params)


def _apply_zscore(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    col = params["col"]
    value = _to_float(row.get(col))
    if value is None:
        return
    z = (value - params["mean"]) / params["std"]
    z = min(3.0, max(-3.0, z))  # Sonar clamp: outliers stop mattering past ±3σ
    row[col] = _scale_to_output((z + 3.0) / 6.0, params)


def _apply_logistic(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    col = params["col"]
    value = _to_float(row.get(col))
    if value is None:
        return
    curve = params.get("params") or {}
    midpoint = float(curve.get("midpoint", 0.0))
    steepness = float(curve.get("steepness", 1.0))
    frac = 1.0 / (1.0 + float(np.exp(-steepness * (value - midpoint))))
    row[col] = _scale_to_output(frac, params)


def _apply_banded(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    col = params["col"]
    value = _to_float(row.get(col))
    curve = params.get("params") or {}
    frac = float(curve.get("fallback", 0.0))
    if value is not None:
        for band in curve.get("bands") or []:
            lo, hi = float(band.get("min", float("-inf"))), float(band.get("max", float("inf")))
            if lo <= value < hi:
                frac = float(band.get("value", 0.0))
                break
    row[col] = _scale_to_output(frac, params)


def _apply_lookup(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    col = params["col"]
    raw = row.get(col)
    curve = params.get("params") or {}
    table = curve.get("table") or {}
    key = "" if raw is None else str(raw)
    frac = float(table.get(key, curve.get("fallback", 0.0)))
    row[col] = _scale_to_output(frac, params)


_NORMALIZE_APPLY = {
    "minmax": _apply_minmax,
    "percentile": _apply_percentile,
    "zscore": _apply_zscore,
    "logistic": _apply_logistic,
    "banded": _apply_banded,
    "lookup": _apply_lookup,
}


def _apply_present(params: Dict[str, Any], row: Dict[str, Any], out: List[Tuple[str, Any]]) -> None:
    """Record whether the column had a value, before anything fills it in.

    Order matters and is the caller's responsibility: a `present` op placed AFTER an `impute` on
    the same column reports 1 for every row, because by then nothing is missing. The mask has to
    be taken while absence is still visible.
    """
    col = params["col"]
    if params.get("emit_mask", True):
        out.append((f"{col}__present", 0.0 if _is_missing(row.get(col)) else 1.0))


def _row_dict(columns: Sequence[str], values: Sequence[Any]) -> Dict[str, Any]:
    """Zip a positional row (column names + aligned values) into a name->value dict."""
    return {c: values[i] for i, c in enumerate(columns)}


def _transform_one(
    ops: List[Dict[str, Any]], row: Dict[str, Any]
) -> List[Tuple[str, Any]]:
    """Apply the fitted ops to a single row dict, returning ordered columns.

    Non-onehot ops mutate the row in place (impute/standardize/bin). Onehot ops
    emit indicator columns immediately at their position and consume the raw
    column. After all ops run, any remaining row keys are emitted as pass-through
    numeric columns in insertion order.
    """
    out: List[Tuple[str, Any]] = []
    onehot_consumed: List[str] = []
    for params in ops:
        op = params["op"]
        if op == "impute":
            _apply_impute(params, row)
        elif op == "standardize":
            _apply_standardize(params, row)
        elif op == "bin":
            _apply_bin(params, row)
        elif op == "present":
            # Emits its mask alongside the onehot indicators; the source column is NOT consumed,
            # because "how much" and "was there any" are two different signals.
            _apply_present(params, row, out)
        elif op == "onehot":
            # Emit indicator columns at the op's position and consume the raw
            # categorical column. Global column order is finalized in _build_matrix.
            _apply_onehot(params, row, out)
            onehot_consumed.append(params["col"])
        elif op in _NORMALIZE_APPLY:
            _NORMALIZE_APPLY[op](params, row)
        else:
            raise ValueError(f"Unknown preprocessing op '{op}'")
    return out, onehot_consumed


def _coerce_numeric(value: Any) -> float:
    f = _to_float(value)
    if f is None:
        # final guard: non-numeric pass-through becomes 0.0 (model needs floats)
        return 0.0
    return f


def fit_transform(
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
    ops_spec: List[Dict[str, Any]],
    feature_columns: Sequence[str],
) -> Tuple[np.ndarray, List[str], FittedPreprocessing]:
    """Fit stateful transforms on the data, then transform it.

    ``feature_columns`` is the ordered list of input feature names (the target
    column is excluded by the caller). Returns ``(matrix, output_columns,
    fitted_preprocessing)``.
    """
    df = pd.DataFrame([list(r) for r in rows], columns=list(columns))

    fitted_ops: List[Dict[str, Any]] = []
    for op in ops_spec:
        fitter = _FIT_DISPATCH.get(op["op"])
        if fitter is None:
            raise ValueError(f"Unknown preprocessing op '{op['op']}'")
        fitted_ops.append(fitter(df, op))

    matrix, output_columns = _build_matrix(
        df.to_dict("records"), fitted_ops, feature_columns
    )
    fitted: FittedPreprocessing = {"ops": fitted_ops, "output_columns": output_columns}
    return matrix, output_columns, fitted


def transform(
    rows: Sequence[Dict[str, Any]],
    fitted: FittedPreprocessing,
    feature_columns: Sequence[str],
) -> np.ndarray:
    """Apply frozen fitted params to rows — APPLY ONLY, never re-fit.

    ``rows`` are feature-name -> value dicts (the /predict shape). Output column
    order is taken verbatim from ``fitted['output_columns']`` so the vector is
    positionally identical to training.
    """
    fitted_ops = fitted.get("ops", [])
    output_columns = fitted["output_columns"]
    matrix, _ = _build_matrix(
        [dict(r) for r in rows], fitted_ops, feature_columns, force_columns=output_columns
    )
    return matrix


def _build_matrix(
    records: List[Dict[str, Any]],
    fitted_ops: List[Dict[str, Any]],
    feature_columns: Sequence[str],
    force_columns: Optional[List[str]] = None,
) -> Tuple[np.ndarray, List[str]]:
    """Transform every record and assemble a dense float matrix.

    Determines the global output column order from the first record (or uses
    ``force_columns`` when supplied, e.g. at predict time), then projects every
    row onto that exact column set — filling absent columns with 0.0.
    """
    onehot_cols = {op["col"] for op in fitted_ops if op["op"] == "onehot"}
    # pass-through feature columns = declared features minus those consumed by onehot
    passthrough = [c for c in feature_columns if c not in onehot_cols]
    # Columns whose ABSENCE is meaningful: they reach the estimator as NaN rather than a real 0,
    # so a rubric can tell "scored zero" from "no data". Opt-in per column via the `present` op —
    # every other column keeps the 0.0 coercion every existing pipeline depends on.
    preserve_missing = {
        op["col"] for op in fitted_ops if op["op"] == "present" and op.get("preserve_missing")
    }

    transformed_records: List[Dict[str, float]] = []
    for rec in records:
        row = {c: rec.get(c) for c in feature_columns}
        emitted, _ = _transform_one(fitted_ops, row)
        rec_map: Dict[str, float] = {name: float(val) for name, val in emitted}
        for c in passthrough:
            raw = row.get(c)
            if c in preserve_missing and _is_missing(raw):
                rec_map[c] = float("nan")
            else:
                rec_map[c] = _coerce_numeric(raw)
        transformed_records.append(rec_map)

    if force_columns is not None:
        output_columns = list(force_columns)
    else:
        # deterministic order: op-emitted columns (onehot indicators, presence masks) in op order,
        # then the pass-through features
        ordered: List[str] = []
        for op in fitted_ops:
            if op["op"] == "onehot":
                ordered.extend(f"{op['col']}={cat}" for cat in op["vocabulary"])
            elif op["op"] == "present" and op.get("emit_mask", True):
                ordered.append(f"{op['col']}__present")
        ordered.extend(passthrough)
        output_columns = ordered

    matrix = np.array(
        [[rec.get(col, 0.0) for col in output_columns] for rec in transformed_records],
        dtype=float,
    )
    if matrix.ndim == 1:
        matrix = matrix.reshape(len(transformed_records), -1)
    return matrix, output_columns


def _json_safe_scalar(value: Any) -> Any:
    """Coerce numpy scalars to plain Python so the fitted payload is JSON-safe."""
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value
