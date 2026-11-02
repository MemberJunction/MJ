"""Preprocessing — the frozen transforms a legacy (v1) model applies at ``/predict``.

Models trained before Prediction Units carry their stateful transforms (impute fill values, standardize mean/std,
one-hot vocabulary, bin edges) as learned parameters in the envelope's ``fitted_preprocessing``. At ``/predict`` time
those frozen parameters are **only applied** — never re-fit — so the scoring vector is positionally identical to the
vector the model trained on.

The output is an ordered list of ``(feature_name, value)`` columns; the matrix builder downstream relies on that
stable ordering.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from .missing_values import is_missing

# A fitted-preprocessing payload is a JSON-serializable dict:
# {
#   "ops": [ { "op": "...", ...learned params... }, ... ],
#   "output_columns": ["age", "city=NY", "city=SF", ...]   # final column order
# }
FittedPreprocessing = Dict[str, Any]


def _to_float(value: Any) -> Optional[float]:
    """Coerce a value to float, returning ``None`` for missing or non-numeric input."""
    if is_missing(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class NonNumericFeatureError(ValueError):
    """A non-numeric value reached a numeric matrix column.

    The value is never coerced to 0.0: the column must be bound with a
    categorical or date encoding instead.
    """

    def __init__(self, column: str, value: Any) -> None:
        super().__init__(
            f"Column '{column}' is numeric but holds the non-numeric value {value!r}; "
            "bind it with a categorical or date encoding"
        )
        self.column = column
        self.value = value


def _present_float(value: Any, column: str) -> Optional[float]:
    """Float for a present numeric value, ``None`` when missing.

    Raises:
        NonNumericFeatureError: When the value is present but not a number.
    """
    f = _to_float(value)
    if f is None and not is_missing(value):
        raise NonNumericFeatureError(column, value)
    return f


# ---------------------------------------------------------------------------
# APPLY helpers
# Each mutates `row` (a dict) and/or appends to the ordered `out` column list.
# ---------------------------------------------------------------------------

def _apply_impute(params: Dict[str, Any], row: Dict[str, Any], out: List[Tuple[str, Any]]) -> None:
    """Apply a fitted impute op: fill the column with the frozen value if missing.

    When the op carries the indicator flag, a ``<col>__missing`` column (1.0 when the
    value was missing, else 0.0) is appended to ``out`` before the fill, so a
    missing value stays distinguishable from a genuine zero.
    """
    col = params["col"]
    if params.get("indicator"):
        out.append((f"{col}__missing", 1.0 if is_missing(row.get(col)) else 0.0))
    if is_missing(row.get(col)):
        row[col] = params.get("fill")


def _apply_standardize(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    """Apply fitted standardization: z-score each column; missing values become 0."""
    for col, st in params["stats"].items():
        val = _present_float(row.get(col), col)
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
    current = None if is_missing(raw) else str(raw)
    for category in params["vocabulary"]:
        out.append((f"{col}={category}", 1.0 if current == category else 0.0))


def _apply_bin(params: Dict[str, Any], row: Dict[str, Any]) -> None:
    """Apply fitted binning: replace the column with its 0-based bin index.

    The index is the bucket ``val`` falls into per the frozen edges, clamped to
    ``[0, n_bins-1]``. Missing values map to bin 0.
    """
    col = params["col"]
    edges = params["edges"]
    val = _present_float(row.get(col), col)
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

def _transform_one(
    ops: List[Dict[str, Any]], row: Dict[str, Any]
) -> Tuple[List[Tuple[str, Any]], List[str]]:
    """Apply the fitted ops to a single row dict, returning ``(emitted columns, one-hot-consumed columns)``.

    Non-onehot ops mutate the row in place (impute/standardize/bin); an impute op
    with the indicator flag also emits its ``<col>__missing`` column into ``out``.
    Onehot ops emit indicator columns immediately at their position and consume the
    raw column. The caller reads the remaining row values as pass-through numeric columns.
    """
    out: List[Tuple[str, Any]] = []
    onehot_consumed: List[str] = []
    for params in ops:
        op = params["op"]
        if op == "impute":
            _apply_impute(params, row, out)
        elif op == "standardize":
            _apply_standardize(params, row)
        elif op == "bin":
            _apply_bin(params, row)
        elif op == "onehot":
            # Emit indicator columns at the op's position and consume the raw
            # categorical column. Global column order is the fitted output_columns.
            _apply_onehot(params, row, out)
            onehot_consumed.append(params["col"])
        else:
            raise ValueError(f"Unknown preprocessing op '{op}'")
    return out, onehot_consumed


def _coerce_numeric(value: Any, column: str) -> float:
    """A numeric matrix cell: numbers pass, a missing value (None, NaN, blank) is 0.0, text refuses.

    A missing value becomes 0.0 only on a legacy passthrough column that no imputer
    covers; a genuinely non-numeric value is never coerced.

    Raises:
        NonNumericFeatureError: When the value is present but not a number.
    """
    if is_missing(value):
        return 0.0
    f = _to_float(value)
    if f is None:
        raise NonNumericFeatureError(column, value)
    return f


def transform(
    rows: Sequence[Dict[str, Any]],
    fitted: FittedPreprocessing,
    feature_columns: Sequence[str],
) -> np.ndarray:
    """Apply frozen fitted params to rows — APPLY ONLY, never re-fit.

    ``rows`` are feature-name -> value dicts (the /predict shape). Output column
    order is taken verbatim from ``fitted['output_columns']`` so the vector is
    positionally identical to training. Every row is projected onto that exact
    column set, filling absent columns with 0.0.
    """
    fitted_ops = fitted.get("ops", [])
    output_columns = list(fitted["output_columns"])
    onehot_cols = {op["col"] for op in fitted_ops if op["op"] == "onehot"}
    # pass-through feature columns = declared features minus those consumed by onehot
    passthrough = [c for c in feature_columns if c not in onehot_cols]

    transformed_records: List[Dict[str, float]] = []
    for rec in rows:
        row = {c: rec.get(c) for c in feature_columns}
        emitted, _ = _transform_one(fitted_ops, row)
        rec_map: Dict[str, float] = {name: float(val) for name, val in emitted}
        for c in passthrough:
            rec_map[c] = _coerce_numeric(row.get(c), c)
        transformed_records.append(rec_map)

    matrix = np.array(
        [[rec.get(col, 0.0) for col in output_columns] for rec in transformed_records],
        dtype=float,
    )
    if matrix.ndim == 1:
        matrix = matrix.reshape(len(transformed_records), -1)
    return matrix
