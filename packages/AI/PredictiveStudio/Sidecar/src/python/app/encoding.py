"""Typed, in-fold column encoding for the trainer.

`build_preprocessor` turns the snapshot's per-column encodings into one unfitted sklearn ColumnTransformer. It is
always placed INSIDE an sklearn Pipeline with the estimator, so every fit — each inner fold, the calibration fold,
the finalist refit, each baseline — fits imputers, scalers, vocabularies and target encodings on that fit's training
rows only; no statistic is learned from rows the fit is later judged on. Nothing here maps a non-numeric value to 0:
`normalize` refuses a non-numeric value in a numeric column, missing values are imputed beside a `<col>__missing`
indicator column, and an identifier column is excluded.

Missing numeric values follow the column's declared impute policy (`ColumnSpec.missing`, read from the snapshot
header's impute ops): `mean`, `median`, `mode` or `constant` (filled with the declared value), with the indicator when
the policy asks for one. A column no policy names is imputed with its training median, with the indicator.

High-cardinality categoricals are bounded: `onehot` keeps at most `cardinality_cap` columns (the least frequent
levels share one "infrequent" column), `hashed` folds values into `cardinality_cap` stable buckets, and
`target-in-fold` uses sklearn's cross-fitted TargetEncoder (its own inner 5-fold cross-fit on each fit's training
rows). Only `onehot` is reachable from a product snapshot today: the engine's assembler emits one-hot categoricals
only, and it has already folded the levels beyond the cap into one `__other` level (a global, label-free fold), so the
one-hot cap here is a no-op on those columns and binds only on frames that bypass the assembler.

The trainer path's encoder is deliberately separate from the legacy `preprocessing` module's fit-once JSON ops; it
shares that module's notion of a missing value (None, NaN, blank text), not its code.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Sequence, Tuple, Union

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
    """One matrix feature column: its name, the source column it was derived from, its encoding and, for a numeric
    column, its declared impute policy (None: the training median, with the indicator)."""

    name: str
    source_column: str
    encoding: Encoding
    missing: Optional[MissingPolicy] = None


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
        NonNumericValueError: When the value is present but not a number.
    """
    if _is_missing(value):
        return math.nan
    if isinstance(value, (bool, int, float, np.number, np.bool_)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            raise NonNumericValueError(column, value) from None
    raise NonNumericValueError(column, value)


def _missing_flags(X: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    """1.0 where the (normalized) numeric value is missing, else 0.0. Module-level so a fitted pipeline pickles."""
    return np.isnan(np.asarray(X, dtype=np.float64)).astype(np.float64)


def _missing_flag_names(transformer: FunctionTransformer, input_features: Sequence[str]) -> List[str]:
    return [f"{c}{MISSING_INDICATOR_SUFFIX}" for c in input_features]


def _numeric_pipe(policy: MissingPolicy) -> Pipeline:
    imputer = SimpleImputer(strategy=_SKLEARN_STRATEGY[policy.strategy], fill_value=policy.fill_value)
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


def _categorical_pipe(enc: CategoricalEncoding, target_type: TargetType, seed: int) -> Pipeline:
    fill = SimpleImputer(strategy="constant", fill_value=MISSING_TOKEN, missing_values=None)
    if enc.method == "onehot":
        step: Union[OneHotEncoder, HashBucketEncoder, TargetEncoder] = OneHotEncoder(
            handle_unknown="infrequent_if_exist", max_categories=enc.cardinality_cap, sparse_output=False
        )
    elif enc.method == "hashed":
        step = HashBucketEncoder(n_buckets=enc.cardinality_cap)
    else:
        step = TargetEncoder(target_type=target_type, random_state=seed)
    return Pipeline([("fill", fill), ("encode", step)])


def build_preprocessor(columns: Sequence[ColumnSpec], target_type: TargetType, seed: int) -> ColumnTransformer:
    """An unfitted ColumnTransformer over the non-identifier columns, to be the first step of a Pipeline fitted on one
    fit's training rows. Feed it frames from `normalize`.

    Raises:
        ValueError: When no column is left (every column is an excluded identifier).
    """
    parts: List[Tuple[str, Union[Pipeline, FunctionTransformer], List[str]]] = []
    for c in columns:
        if isinstance(c.encoding, NumericEncoding):
            parts.extend(_numeric_parts(c))
        elif isinstance(c.encoding, CategoricalEncoding):
            parts.append((f"cat:{c.name}", _categorical_pipe(c.encoding, target_type, seed), [c.name]))
    if not parts:
        raise ValueError("no usable feature columns: every column is an excluded identifier")
    return ColumnTransformer(parts, remainder="drop", verbose_feature_names_out=False)


def used_columns(columns: Sequence[ColumnSpec]) -> List[str]:
    """The columns that reach the matrix: every column but the excluded identifiers."""
    return [c.name for c in columns if not isinstance(c.encoding, IdentifierEncoding)]


def source_map(columns: Sequence[ColumnSpec]) -> Dict[str, List[str]]:
    """Source column -> the matrix columns derived from it, so importance can be reported per source column."""
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
