"""Typed, in-fold column encoding for the trainer.

`build_preprocessor` turns the snapshot's per-column encodings into one unfitted sklearn ColumnTransformer. It is
always placed INSIDE an sklearn Pipeline with the estimator, so every fit — each inner fold, the calibration fold,
the finalist refit, each baseline — fits imputers, scalers, vocabularies and target encodings on that fit's training
rows only; no statistic is learned from rows the fit is later judged on. Nothing here maps a non-numeric value to 0:
`normalize` refuses a non-numeric or non-finite value in a numeric column, missing values are imputed beside a
`<col>__missing` indicator column, and an identifier column is excluded.

Every column's output width is a pure function of its spec, never of which rows a fold happened to train on, so every
fold of one run produces the same column list.

Missing numeric values follow the column's declared impute policy (`ColumnSpec.missing`, read from the snapshot
header's impute ops): `mean`, `median`, `mode` or `constant` (filled with the declared value), with the indicator when
the policy asks for one. A column no policy names is imputed with its training median, with the indicator. A fold
whose training rows hold no value at all for a column keeps that column: `mean`, `median` and `mode` have nothing to
learn from and fill 0 there, and the indicator (all 1 on that fold) is what states that every value was missing.

High-cardinality categoricals are bounded. `onehot` encodes the column's declared levels (`ColumnSpec.levels`: its
distinct values over the whole snapshot, label-free, computed once when the snapshot is loaded), never the levels a
fold's training rows happen to hold. A value outside the declared levels encodes as all zeros.

The engine's assembler has already capped every categorical: it keeps at most `cardinality_cap` non-missing levels and
folds the rest into one `__other` level (a global, label-free fold), so a product snapshot declares at most
`cardinality_cap + 1` non-missing levels, plus the missing token. Every one of those levels gets its own column here:
folding again would merge `__other` with a level the assembler deliberately kept. Only when the declared non-missing
levels exceed `cardinality_cap + 1`, which only frames that bypass the assembler (test fixtures) can produce, does the
in-fold cap bind: the first `cardinality_cap - 1` non-missing levels in sorted order keep their own column and every
other non-missing level shares one `<col>_other` column. The missing token never counts toward the cap and, when declared
(the column's levels include it because some value is missing), keeps its own column; when it is not declared, a missing
value encodes as all zeros like any other undeclared value.

`hashed` folds values into `cardinality_cap` stable buckets, and `target-in-fold` uses sklearn's cross-fitted
TargetEncoder (its own inner 5-fold cross-fit on each fit's training rows). Only `onehot` is reachable from a product
snapshot today: the engine's assembler emits one-hot categoricals only.

The trainer path's encoder is deliberately separate from the legacy `preprocessing` module's fit-once JSON ops; it
shares that module's notion of a missing value (None, NaN, blank text), not its code.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Dict, FrozenSet, List, Literal, Optional, Sequence, Tuple, Union

import numpy as np
import numpy.typing as npt
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler, TargetEncoder

MISSING_TOKEN = "__missing__"
MISSING_INDICATOR_SUFFIX = "__missing"
# The one-hot column the declared levels beyond the cap share is named `<col>_other`. Internally those levels are
# first mapped to this sentinel, which no snapshot value can equal (it starts with a NUL character).
_OVERFLOW_SENTINEL = "\x00overflow"
OVERFLOW_LEVEL_NAME = "other"
TargetType = Literal["binary", "multiclass", "continuous"]
ImputeStrategy = Literal["mean", "median", "mode", "constant"]

# The sklearn imputer strategy for each declared impute strategy (`mode` is sklearn's `most_frequent`).
_SKLEARN_STRATEGY: Dict[ImputeStrategy, str] = {
    "mean": "mean",
    "median": "median",
    "mode": "most_frequent",
    "constant": "constant",
}


@dataclass(frozen=True)
class NumericEncoding:
    kind: Literal["numeric", "date-parts", "boolean"]


@dataclass(frozen=True)
class CategoricalEncoding:
    cardinality_cap: int
    method: Literal["onehot", "hashed", "target-in-fold"]

    def __post_init__(self) -> None:
        if self.cardinality_cap < 1:
            raise ValueError(f"a categorical cardinality cap must be at least 1, got {self.cardinality_cap}")


@dataclass(frozen=True)
class IdentifierEncoding:
    policy: Literal["exclude"]


Encoding = Union[NumericEncoding, CategoricalEncoding, IdentifierEncoding]


@dataclass(frozen=True)
class MissingPolicy:
    """A numeric column's declared impute policy: the fill strategy, the fill value of a `constant` strategy, and
    whether a `<col>__missing` indicator column is emitted beside the filled column."""

    strategy: ImputeStrategy
    fill_value: Optional[float]
    indicator: bool

    def __post_init__(self) -> None:
        if self.strategy == "constant" and self.fill_value is None:
            raise ValueError("a constant impute policy needs a fill value")


# The policy of a numeric column no declared policy names.
DEFAULT_MISSING_POLICY = MissingPolicy("median", None, True)


@dataclass(frozen=True)
class ColumnSpec:
    """One feature column: its name, the source column it was derived from, its encoding, for a numeric column its
    declared impute policy (None: the training median, with the indicator) and, for a categorical column, its declared
    levels (its distinct values over the whole snapshot, including the missing token when a value is missing; required
    for `onehot`)."""

    name: str
    source_column: str
    encoding: Encoding
    missing: Optional[MissingPolicy] = None
    levels: Optional[Tuple[str, ...]] = None


class NonNumericValueError(ValueError):
    """A present, non-numeric value reached a numeric column; it is never coerced to a number."""

    def __init__(self, column: str, value: object) -> None:
        super().__init__(f"Column '{column}' is numeric but holds the non-numeric value {value!r}")
        self.column = column
        self.value = value


# sklearn ships no type stubs, so its base classes are `Any` to mypy and subclassing them is reported.
class HashBucketEncoder(BaseEstimator, TransformerMixin):  # type: ignore[misc]
    """Maps each value to one of `n_buckets` stable buckets (blake2b of the UTF-8 text), one indicator column per
    bucket. Stateless apart from the bucket count, so it is safe to fit anywhere."""

    def __init__(self, n_buckets: int = 64) -> None:
        self.n_buckets = n_buckets

    def fit(self, X: pd.DataFrame, y: Optional[npt.NDArray[np.generic]] = None) -> "HashBucketEncoder":
        self.n_features_in_ = X.shape[1]
        return self

    def _bucket(self, value: object) -> int:
        digest = hashlib.blake2b(str(value).encode("utf-8"), digest_size=8).digest()
        return int.from_bytes(digest, "big") % self.n_buckets

    def transform(self, X: pd.DataFrame) -> npt.NDArray[np.float64]:
        arr = np.asarray(X, dtype=object)
        out = np.zeros((arr.shape[0], arr.shape[1] * self.n_buckets), dtype=np.float64)
        for j in range(arr.shape[1]):
            for i in range(arr.shape[0]):
                out[i, j * self.n_buckets + self._bucket(arr[i, j])] = 1.0
        return out

    def get_feature_names_out(self, input_features: Optional[Sequence[str]] = None) -> npt.NDArray[np.str_]:
        names = list(input_features) if input_features is not None else [f"x{j}" for j in range(self.n_features_in_)]
        return np.asarray([f"{c}#b{b}" for c in names for b in range(self.n_buckets)], dtype=np.str_)


def _is_missing(value: object) -> bool:
    """True for null-equivalents: None, pandas NA, NaN floats (numpy ones too) and blank or whitespace text."""
    if value is None or value is pd.NA:
        return True
    if isinstance(value, (float, np.floating)) and math.isnan(float(value)):
        return True
    return isinstance(value, str) and value.strip() == ""


def _numeric_value(column: str, value: object) -> float:
    """The float of a present numeric value, NaN for a missing one.

    Raises:
        NonNumericValueError: When the value is present but not a finite number.
    """
    if _is_missing(value):
        return math.nan
    if isinstance(value, (bool, int, float, np.number, np.bool_)):
        if not math.isfinite(float(value)):
            raise NonNumericValueError(column, value)
        return float(value)
    if isinstance(value, str):
        try:
            number = float(value)
        except ValueError:
            raise NonNumericValueError(column, value) from None
        # Text such as 'inf', 'nan' or '1e400' parses but is not a finite number; missing is None, NaN or blank only.
        if not math.isfinite(number):
            raise NonNumericValueError(column, value)
        return number
    raise NonNumericValueError(column, value)


def _missing_flags(X: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    """1.0 where the (normalized) numeric value is missing, else 0.0. Module-level so a fitted pipeline pickles."""
    return np.isnan(np.asarray(X, dtype=np.float64)).astype(np.float64)


def _missing_flag_names(transformer: FunctionTransformer, input_features: Sequence[str]) -> List[str]:
    return [f"{c}{MISSING_INDICATOR_SUFFIX}" for c in input_features]


def _numeric_pipe(policy: MissingPolicy) -> Pipeline:
    # keep_empty_features: a fold with no value in the column keeps it (filled 0, stated by the indicator) instead of
    # dropping it, which would change the width and leave the scaler with no feature to fit.
    imputer = SimpleImputer(strategy=_SKLEARN_STRATEGY[policy.strategy], fill_value=policy.fill_value,
                            keep_empty_features=True)
    return Pipeline([("impute", imputer), ("scale", StandardScaler())])


def _numeric_parts(column: ColumnSpec) -> List[Tuple[str, Union[Pipeline, FunctionTransformer], List[str]]]:
    """The filled-and-scaled column and, when its policy asks, its `<col>__missing` indicator (always emitted, so the
    matrix width never depends on whether a fold's training rows happened to hold a missing value)."""
    policy = column.missing if column.missing is not None else DEFAULT_MISSING_POLICY
    parts: List[Tuple[str, Union[Pipeline, FunctionTransformer], List[str]]] = [
        (f"num:{column.name}", _numeric_pipe(policy), [column.name])
    ]
    if policy.indicator:
        flags = FunctionTransformer(_missing_flags, feature_names_out=_missing_flag_names)
        parts.append((f"missing:{column.name}", flags, [column.name]))
    return parts


def _fold_overflow(X: npt.NDArray[np.object_], overflow: FrozenSet[str]) -> npt.NDArray[np.object_]:
    """Maps the declared levels beyond the cap to the overflow sentinel. Module-level so a fitted pipeline pickles."""
    arr = np.asarray(X, dtype=object).copy()
    arr[np.isin(arr, list(overflow))] = _OVERFLOW_SENTINEL
    return arr


def _onehot_name(input_feature: str, category: object) -> str:
    """`<col>_<level>`, and `<col>_other` for the shared overflow column."""
    if category == _OVERFLOW_SENTINEL:
        return f"{input_feature}_{OVERFLOW_LEVEL_NAME}"
    return f"{input_feature}_{category}"


_Step = Tuple[str, Union[FunctionTransformer, OneHotEncoder]]


def _onehot_steps(column: ColumnSpec, enc: CategoricalEncoding) -> List[_Step]:
    """One-hot over the declared levels: every one of them when the non-missing levels number at most
    `cardinality_cap + 1` (what the assembler's own cap leaves), otherwise capped as the module doc states.

    Raises:
        ValueError: When the column declares no levels, or a kept level is `other`, whose `<col>_other` column name
            would be the overflow column's.
    """
    if column.levels is None:
        raise ValueError(f"categorical column '{column.name}' is one-hot encoded but has no declared levels")
    ordered = sorted(set(column.levels))
    present = [level for level in ordered if level != MISSING_TOKEN]
    steps: List[_Step] = []
    if len(present) > enc.cardinality_cap + 1:
        kept = present[: enc.cardinality_cap - 1]
        if OVERFLOW_LEVEL_NAME in kept:
            raise ValueError(f"categorical column '{column.name}' keeps the level '{OVERFLOW_LEVEL_NAME}', whose "
                             f"column name '{column.name}_{OVERFLOW_LEVEL_NAME}' is the overflow column's")
        overflow = frozenset(present[enc.cardinality_cap - 1:])
        steps.append(("overflow", FunctionTransformer(_fold_overflow, kw_args={"overflow": overflow},
                                                      feature_names_out="one-to-one")))
        ordered = [*sorted(set(ordered) - overflow), _OVERFLOW_SENTINEL]
    steps.append(("encode", OneHotEncoder(categories=[ordered], handle_unknown="ignore", sparse_output=False,
                                          feature_name_combiner=_onehot_name)))
    return steps


def _categorical_pipe(column: ColumnSpec, enc: CategoricalEncoding, target_type: TargetType, seed: int) -> Pipeline:
    fill = SimpleImputer(strategy="constant", fill_value=MISSING_TOKEN, missing_values=None)
    if enc.method == "onehot":
        return Pipeline([("fill", fill), *_onehot_steps(column, enc)])
    step: Union[HashBucketEncoder, TargetEncoder]
    if enc.method == "hashed":
        step = HashBucketEncoder(n_buckets=enc.cardinality_cap)
    else:
        step = TargetEncoder(target_type=target_type, random_state=seed)
    return Pipeline([("fill", fill), ("encode", step)])


def build_preprocessor(columns: Sequence[ColumnSpec], target_type: TargetType, seed: int) -> ColumnTransformer:
    """An unfitted ColumnTransformer over the non-identifier columns, to be the first step of a Pipeline fitted on one
    fit's training rows. Feed it frames from `normalize`.

    A one-hot column encodes every declared level when its non-missing levels number at most `cardinality_cap + 1`
    (the assembler's kept levels plus its `__other` level are never folded again). Beyond that, which only fixture
    data reaches, the first `cardinality_cap - 1` sorted non-missing levels keep their columns and the rest share
    `<col>_other`; the missing token, when declared, keeps its own column.

    Raises:
        ValueError: When no column is left (every column is an excluded identifier), or a one-hot column declares no
            levels.
    """
    parts: List[Tuple[str, Union[Pipeline, FunctionTransformer], List[str]]] = []
    for c in columns:
        if isinstance(c.encoding, NumericEncoding):
            parts.extend(_numeric_parts(c))
        elif isinstance(c.encoding, CategoricalEncoding):
            parts.append((f"cat:{c.name}", _categorical_pipe(c, c.encoding, target_type, seed), [c.name]))
    if not parts:
        raise ValueError("no usable feature columns: every column is an excluded identifier")
    return ColumnTransformer(parts, remainder="drop", verbose_feature_names_out=False)


def used_columns(columns: Sequence[ColumnSpec]) -> List[str]:
    """The columns that reach the matrix: every column but the excluded identifiers."""
    return [c.name for c in columns if not isinstance(c.encoding, IdentifierEncoding)]


def source_map(columns: Sequence[ColumnSpec]) -> Dict[str, List[str]]:
    """Source column -> the feature columns (before encoding) derived from it, identifiers left out. The encoded matrix
    columns of each feature column are named by the fitted transformer's `get_feature_names_out`."""
    out: Dict[str, List[str]] = {}
    for c in columns:
        if not isinstance(c.encoding, IdentifierEncoding):
            out.setdefault(c.source_column, []).append(c.name)
    return out


def normalize(columns: Sequence[ColumnSpec], X: pd.DataFrame) -> pd.DataFrame:
    """The one typed view of raw rows used by every fit and every predict: numeric columns as float64 (missing ->
    NaN), categorical columns as str or None. Training frames from the snapshot already have this shape; scoring
    frames (pandas NaN, numpy scalars, blank strings) are brought to it so train and serve see identical input.

    Raises:
        NonNumericValueError: When a numeric column holds a present, non-numeric value.
    """
    out: Dict[str, Union[npt.NDArray[np.float64], List[Optional[str]]]] = {}
    for c in columns:
        if isinstance(c.encoding, IdentifierEncoding):
            continue
        values = X[c.name].tolist()
        if isinstance(c.encoding, NumericEncoding):
            out[c.name] = np.asarray([_numeric_value(c.name, v) for v in values], dtype=np.float64)
        else:
            out[c.name] = [None if _is_missing(v) else str(v) for v in values]
    return pd.DataFrame(out, index=X.index)
