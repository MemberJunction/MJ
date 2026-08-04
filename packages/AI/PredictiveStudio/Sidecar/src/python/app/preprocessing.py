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


_FIT_DISPATCH = {
    "impute": _fit_impute,
    "standardize": _fit_standardize,
    "onehot": _fit_onehot,
    "bin": _fit_bin,
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
        elif op == "onehot":
            # Emit indicator columns at the op's position and consume the raw
            # categorical column. Global column order is finalized in _build_matrix.
            _apply_onehot(params, row, out)
            onehot_consumed.append(params["col"])
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

    transformed_records: List[Dict[str, float]] = []
    for rec in records:
        row = {c: rec.get(c) for c in feature_columns}
        emitted, _ = _transform_one(fitted_ops, row)
        rec_map: Dict[str, float] = {name: float(val) for name, val in emitted}
        for c in passthrough:
            rec_map[c] = _coerce_numeric(row.get(c))
        transformed_records.append(rec_map)

    if force_columns is not None:
        output_columns = list(force_columns)
    else:
        # deterministic order: onehot indicators (in op order) then passthrough
        ordered: List[str] = []
        for op in fitted_ops:
            if op["op"] == "onehot":
                ordered.extend(f"{op['col']}={cat}" for cat in op["vocabulary"])
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
