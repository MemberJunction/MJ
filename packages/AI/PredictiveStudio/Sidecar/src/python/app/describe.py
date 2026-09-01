"""The ``/describe`` statistics pre-pass — read-only measurement of the training partition.

Nothing here fits, stores, or learns. It measures, so the Model Development Agent stops
choosing an architecture blind: what fraction of the label is the minority class, which
candidate feature is an identifier, which one already contains the answer, how many rows
there are per feature.

Two deliberate constraints:

* **Only the training partition is ever described.** The caller carves the locked holdout
  first and sends only what is left. A statistic measured on the holdout would leak into
  every downstream decision and the "honest number" would stop being honest.
* **Measurements only, no verdicts.** Thresholds and hint wording live in TypeScript
  (``Core/src/statistics-spec.ts``), so they are testable without Python and cannot drift
  between the two halves. This module returns numbers.

Dependency-free beyond what ``/train`` already needs (numpy + scikit-learn).
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from .schemas import (
    DescribeFeature,
    DescribeNumericSummary,
    DescribeRequest,
    DescribeResponse,
    DescribeTarget,
    DescribeTargetValue,
)

#: Default cap on enumerated categories per column, so one high-cardinality column
#: cannot blow up the response.
DEFAULT_TOP_VALUES_LIMIT = 20

#: Above this many numeric features the pairwise correlation matrix is skipped even when
#: requested — it is O(n²) in both time and payload, and the collinearity hint is an
#: advisory, never a gate.
MAX_CORRELATION_FEATURES = 60


def describe(req: DescribeRequest) -> DescribeResponse:
    """Measure the training partition and return per-feature + target statistics."""
    started = time.time()
    warnings: List[str] = []

    columns = list(req.data.columns)
    rows = req.data.rows
    if req.target not in columns:
        raise ValueError(f"target column '{req.target}' is not present in data.columns")

    target_idx = columns.index(req.target)
    raw_target = [r[target_idx] if target_idx < len(r) else None for r in rows]

    feature_names = _feature_names(req, columns)
    kinds = {fs.Name: fs.Kind for fs in (req.feature_schema or [])}

    target_summary, y_numeric, y_labels = _describe_target(req, raw_target, warnings)

    features: List[DescribeFeature] = []
    numeric_columns: Dict[str, np.ndarray] = {}
    for name in feature_names:
        if name not in columns:
            warnings.append(f"feature '{name}' is in feature_schema but not in data.columns; skipped")
            continue
        col = [r[columns.index(name)] if columns.index(name) < len(r) else None for r in rows]
        described, numeric_values = _describe_feature(
            name, kinds.get(name, "numeric"), col, req, y_numeric, y_labels, warnings
        )
        features.append(described)
        if numeric_values is not None:
            numeric_columns[name] = numeric_values

    correlations = _correlations(numeric_columns, req.include_correlations, warnings)

    return DescribeResponse(
        row_count=len(rows),
        feature_count=len(features),
        target=target_summary,
        features=features,
        correlations=correlations,
        duration_sec=round(time.time() - started, 4),
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# target
# ---------------------------------------------------------------------------


def _describe_target(
    req: DescribeRequest,
    raw: Sequence[Any],
    warnings: List[str],
) -> Tuple[DescribeTarget, Optional[np.ndarray], Optional[np.ndarray]]:
    """Summarize the label and return the arrays the per-feature association needs.

    Returns ``(summary, y_numeric, y_labels)`` — ``y_numeric`` for regression association,
    ``y_labels`` for classification. Both are aligned to the FULL row order with ``None``
    entries preserved as NaN / empty, so a per-feature mask can drop unusable rows.
    """
    labeled = [v for v in raw if v is not None and v != ""]
    if not labeled:
        warnings.append("no rows carry a usable label; no association measures were computed")
        return (
            DescribeTarget(name=req.target, labeled_row_count=0),
            None,
            None,
        )

    if req.problem_type == "regression":
        y = _to_float_array(raw)
        finite = y[np.isfinite(y)]
        if finite.size == 0:
            warnings.append("regression target has no finite values; numeric summary omitted")
            return DescribeTarget(name=req.target, labeled_row_count=len(labeled)), None, None
        return (
            DescribeTarget(
                name=req.target,
                labeled_row_count=int(finite.size),
                numeric=_numeric_summary(finite),
            ),
            y,
            None,
        )

    labels = np.array([("" if v is None else str(v)) for v in raw], dtype=object)
    values, counts = np.unique(labels[labels != ""], return_counts=True)
    order = np.argsort(-counts)
    classes = [
        DescribeTargetValue(value=str(values[i]), count=int(counts[i])) for i in order
    ]
    return (
        DescribeTarget(
            name=req.target,
            labeled_row_count=int(counts.sum()),
            classes=classes,
        ),
        None,
        labels,
    )


# ---------------------------------------------------------------------------
# features
# ---------------------------------------------------------------------------


def _describe_feature(
    name: str,
    kind: str,
    raw: Sequence[Any],
    req: DescribeRequest,
    y_numeric: Optional[np.ndarray],
    y_labels: Optional[np.ndarray],
    warnings: List[str],
) -> Tuple[DescribeFeature, Optional[np.ndarray]]:
    """Measure one column. Returns the description plus its numeric values (or ``None``)."""
    total = len(raw)
    present_mask = np.array([v is not None and v != "" for v in raw], dtype=bool)
    missing_fraction = float(1.0 - (present_mask.sum() / total)) if total else 0.0

    present_values = [v for v, ok in zip(raw, present_mask) if ok]
    distinct = len({_hashable(v) for v in present_values})

    numeric_values = _to_float_array(raw) if kind in ("numeric", "embedding", "presence") else None
    numeric_summary: Optional[DescribeNumericSummary] = None
    if numeric_values is not None:
        finite = numeric_values[np.isfinite(numeric_values)]
        if finite.size > 0:
            numeric_summary = _numeric_summary(finite)
        else:
            # A column declared numeric that holds nothing parseable is worth saying out loud —
            # it is otherwise indistinguishable from a genuinely all-null column.
            warnings.append(f"feature '{name}' is declared {kind} but has no finite numeric values")
            numeric_values = None

    top_values = None
    if kind in ("categorical", "llm-derived") and present_values:
        limit = req.top_values_limit or DEFAULT_TOP_VALUES_LIMIT
        top_values = _top_values(present_values, limit)

    association = _target_association(
        req.problem_type, numeric_values, present_values, present_mask, y_numeric, y_labels
    )
    mutual_info = _mutual_information(
        req.problem_type, numeric_values, present_mask, y_numeric, y_labels
    )

    return (
        DescribeFeature(
            name=name,
            kind=kind,
            missing_fraction=round(missing_fraction, 6),
            distinct_count=distinct,
            numeric=numeric_summary,
            target_association=association,
            mutual_information=mutual_info,
            top_values=top_values,
        ),
        numeric_values,
    )


def _target_association(
    problem_type: str,
    x: Optional[np.ndarray],
    present_values: Sequence[Any],
    present_mask: np.ndarray,
    y_numeric: Optional[np.ndarray],
    y_labels: Optional[np.ndarray],
) -> Optional[float]:
    """Association with the target, on ONE comparable scale per problem type.

    Classification → single-feature AUC folded to ``[0.5, 1]`` (a perfectly inverted
    feature is exactly as informative as a perfectly aligned one). Regression → ``|r|``.
    ``None`` whenever it cannot be computed — a missing measure must never read as zero.
    """
    if x is None:
        return None

    if problem_type == "regression":
        if y_numeric is None:
            return None
        mask = np.isfinite(x) & np.isfinite(y_numeric)
        if mask.sum() < 2:
            return None
        xs, ys = x[mask], y_numeric[mask]
        if np.std(xs) == 0 or np.std(ys) == 0:
            return None
        return float(round(abs(np.corrcoef(xs, ys)[0, 1]), 6))

    if y_labels is None:
        return None
    mask = np.isfinite(x) & (y_labels != "")
    if mask.sum() < 2:
        return None
    xs, ys = x[mask], y_labels[mask]
    classes = np.unique(ys)
    if classes.size != 2 or np.std(xs) == 0:
        # Multiclass has no single scalar AUC that is comparable across features; mutual
        # information carries that case instead.
        return None
    from sklearn.metrics import roc_auc_score

    try:
        auc = float(roc_auc_score((ys == classes[-1]).astype(int), xs))
    except ValueError:
        return None
    # Fold: a feature that predicts perfectly in reverse is just as strong a signal.
    return float(round(max(auc, 1.0 - auc), 6))


def _mutual_information(
    problem_type: str,
    x: Optional[np.ndarray],
    present_mask: np.ndarray,
    y_numeric: Optional[np.ndarray],
    y_labels: Optional[np.ndarray],
) -> Optional[float]:
    """Mutual information with the target — catches non-monotone signal that ``|r|``/AUC misses."""
    if x is None:
        return None
    try:
        from sklearn.feature_selection import mutual_info_classif, mutual_info_regression
    except ImportError:  # pragma: no cover - sklearn is a hard dep of /train
        return None

    if problem_type == "regression":
        if y_numeric is None:
            return None
        mask = np.isfinite(x) & np.isfinite(y_numeric)
        if mask.sum() < 3:
            return None
        mi = mutual_info_regression(x[mask].reshape(-1, 1), y_numeric[mask], random_state=42)
    else:
        if y_labels is None:
            return None
        mask = np.isfinite(x) & (y_labels != "")
        if mask.sum() < 3 or np.unique(y_labels[mask]).size < 2:
            return None
        mi = mutual_info_classif(x[mask].reshape(-1, 1), y_labels[mask], random_state=42)
    return float(round(float(mi[0]), 6))


# ---------------------------------------------------------------------------
# correlations
# ---------------------------------------------------------------------------


def _correlations(
    numeric_columns: Dict[str, np.ndarray],
    requested: Optional[bool],
    warnings: List[str],
) -> Optional[Dict[str, float]]:
    """Pairwise ``|r|`` over numeric features, keyed ``"a|b"``. Skipped unless requested."""
    if not requested:
        return None
    names = list(numeric_columns.keys())
    if len(names) > MAX_CORRELATION_FEATURES:
        warnings.append(
            f"correlations skipped: {len(names)} numeric features exceeds the "
            f"{MAX_CORRELATION_FEATURES}-feature cap (the pairwise matrix is O(n^2))"
        )
        return None

    out: Dict[str, float] = {}
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            xa, xb = numeric_columns[a], numeric_columns[b]
            mask = np.isfinite(xa) & np.isfinite(xb)
            if mask.sum() < 2 or np.std(xa[mask]) == 0 or np.std(xb[mask]) == 0:
                continue
            out[f"{a}|{b}"] = float(round(abs(np.corrcoef(xa[mask], xb[mask])[0, 1]), 6))
    return out


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------


def _feature_names(req: DescribeRequest, columns: Sequence[str]) -> List[str]:
    """Ordered feature names: the schema when supplied, else every column but the target."""
    if req.feature_schema:
        return [fs.Name for fs in req.feature_schema]
    return [c for c in columns if c != req.target]


def _numeric_summary(finite: np.ndarray) -> DescribeNumericSummary:
    """Moments + quartiles + Fisher skewness over the finite values of a column."""
    std = float(np.std(finite))
    q = np.percentile(finite, [25, 50, 75])
    skew: Optional[float] = None
    if std > 0:
        centered = (finite - float(np.mean(finite))) / std
        skew = float(round(float(np.mean(centered**3)), 6))
    return DescribeNumericSummary(
        mean=float(round(float(np.mean(finite)), 6)),
        std=float(round(std, 6)),
        min=float(np.min(finite)),
        max=float(np.max(finite)),
        quartiles=[float(q[0]), float(q[1]), float(q[2])],
        skewness=skew,
    )


def _top_values(values: Sequence[Any], limit: int) -> List[DescribeTargetValue]:
    """The ``limit`` most frequent values, descending by count."""
    labels = np.array([str(v) for v in values], dtype=object)
    uniq, counts = np.unique(labels, return_counts=True)
    order = np.argsort(-counts)[:limit]
    return [DescribeTargetValue(value=str(uniq[i]), count=int(counts[i])) for i in order]


def _to_float_array(raw: Sequence[Any]) -> np.ndarray:
    """Coerce a mixed column to float, mapping anything unparseable (and null) to NaN."""
    out = np.empty(len(raw), dtype=float)
    for i, v in enumerate(raw):
        if v is None or v == "":
            out[i] = np.nan
            continue
        if isinstance(v, bool):
            out[i] = 1.0 if v else 0.0
            continue
        try:
            out[i] = float(v)
        except (TypeError, ValueError):
            out[i] = np.nan
    return out


def _hashable(v: Any) -> Any:
    """A stable key for distinct-counting a mixed column."""
    return v if isinstance(v, (str, int, float, bool)) else str(v)
