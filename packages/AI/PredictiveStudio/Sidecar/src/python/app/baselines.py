"""Fixed baselines, fitted on the development rows of every run.

  dummy                base rate (binary), class prior (multiclass), training mean (regression families)
  one-feature          the source column whose single-column GLM has the lowest pooled out-of-fold primary score on
                       the SAME repeat-0 inner folds the candidates used, refitted on all development rows
  glm                  the family's GLM on every kept column: L2 logistic / multinomial, ridge, Poisson, Tweedie
  incumbent-heuristic  the unit's declared heuristic (member `heuristic:<name>`), read from the snapshot's
                       incumbent-score column (the snapshot builder evaluates the unit's score expression per row)

Roles: the dummy is the "no signal" yardstick; one-feature, GLM and the incumbent heuristic form the simple set the
publishing gate may ship instead of the model. The dummy and the incumbent heuristic are never shipped as artifacts
(the heuristic reads a column `/predict` never receives); one-feature and GLM are ordinary trainer predictors.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Sequence, Tuple, Union

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator

from . import encoding, scores
from .algorithms import TabularFamily
from .array_types import FArr
from .folds import Fold
from .trainer import EncodedLabel, TrainedPredictor, fit_predictor
from .trainer_schemas import CandidateSpec, EvaluationProtocol

# The GLM each task family's GLM baseline fits. `poisson_glm` and `tweedie_glm` are baseline-only drivers: a request
# candidate never names them.
GLM_DRIVER: Dict[TabularFamily, str] = {"binary": "logistic_regression", "multiclass": "logistic_regression",
                                        "continuous": "ridge", "count": "poisson_glm", "non-negative": "tweedie_glm"}
# The drivers only the GLM baseline fits (no catalog row): a request candidate naming one is refused.
BASELINE_ONLY_DRIVERS = frozenset({GLM_DRIVER["count"], GLM_DRIVER["non-negative"]})
NIL_UUID = "00000000-0000-0000-0000-000000000000"
# Gate member names: reserved, so a candidate may neither use one nor start with HEURISTIC_PREFIX.
DUMMY_MEMBER = "dummy"
MEMBER_NAMES = frozenset({DUMMY_MEMBER, "oneFeature", "glm", "naive", "seasonalNaive"})
HEURISTIC_PREFIX = "heuristic:"


class ConstantPredictor(BaseEstimator):  # type: ignore[misc]  # sklearn has no stubs: BaseEstimator is Any
    """The dummy: one constant prediction per row (a probability or mean as a 0-d value, or a class-prior row)."""

    def __init__(self, value: FArr) -> None:
        self.value = value

    def predict(self, X: pd.DataFrame) -> FArr:
        if self.value.ndim == 0 or self.value.size == 1:
            return np.full(len(X), float(self.value.reshape(-1)[0]), dtype=np.float64)
        return np.asarray(np.tile(self.value, (len(X), 1)), dtype=np.float64)


class ColumnScorePredictor(BaseEstimator):  # type: ignore[misc]  # sklearn has no stubs: BaseEstimator is Any
    """The incumbent heuristic: its prediction is the snapshot's incumbent-score column, read as is."""

    def __init__(self, column: str) -> None:
        self.column = column

    def predict(self, X: pd.DataFrame) -> FArr:
        return np.asarray(X[self.column], dtype=np.float64)


BaselinePredictor = Union[TrainedPredictor, ConstantPredictor, ColumnScorePredictor]


@dataclass(frozen=True)
class FittedBaseline:
    """One fitted baseline: its gate member name, its role, its index into `protocol.baselines`, its predictor, and
    for one-feature the pooled out-of-fold primary score of every source column plus the one selected."""

    name: str                       # "dummy", "oneFeature", "glm", or "heuristic:<declared name>"
    role: Literal["dummy", "simple"]
    spec_index: int
    predictor: BaselinePredictor
    detail: Dict[str, float] = field(default_factory=dict)
    selected_source: Optional[str] = None


def glm_spec(family: TabularFamily) -> CandidateSpec:
    """The GLM baseline's internal spec for `family` (default hyperparameters)."""
    return CandidateSpec(name="glm", algorithmId=NIL_UUID, driverKey=GLM_DRIVER[family], hyperparameters={})


def dummy(enc: EncodedLabel) -> ConstantPredictor:
    """The class prior (multiclass) or the label mean (binary base rate, regression mean) of the fitted rows."""
    if enc.family == "multiclass" and enc.class_order is not None:
        yi = np.asarray(enc.y, dtype=np.int64)
        return ConstantPredictor(np.bincount(yi, minlength=len(enc.class_order)).astype(np.float64) / len(yi))
    return ConstantPredictor(np.array(float(np.mean(np.asarray(enc.y, dtype=np.float64)))))


def one_feature(protocol: EvaluationProtocol, columns: Sequence[encoding.ColumnSpec], X: pd.DataFrame,
                enc: EncodedLabel, folds: Sequence[Fold], threads: int) -> Tuple[str, TrainedPredictor, Dict[str, float]]:
    """The best single source column: each source column's GLM (over every feature column derived from it) is fitted
    on the training side of every repeat-0 inner fold and scored with the primary score over the pooled out-of-fold
    predictions; the lowest wins (ties go to the first name in sorted order) and is refitted on every row of `X`.

    Raises:
        ValueError: When no fold is in repeat 0, no source column is usable, or a fit fails.
    """
    primary = scores.primary_score(protocol.primaryScore.metric, enc.tweedie_power)
    spec = glm_spec(enc.family)
    first_repeat = [f for f in folds if f.repeat == 0]
    if not first_repeat:
        raise ValueError("the one-feature baseline needs the inner folds of repeat 0, and none were given")
    sources = sorted(encoding.source_map(columns))
    if not sources:
        raise ValueError("the one-feature baseline has no usable source column")
    y = np.asarray(enc.y)
    valid = np.concatenate([f.valid for f in first_repeat])
    score: Dict[str, float] = {}
    for src in sources:
        cols = [c for c in columns if c.source_column == src]
        preds = [fit_predictor(spec, cols, X, enc, f.train, protocol, threads).predict(X.iloc[f.valid])
                 for f in first_repeat]
        score[src] = primary.aggregate(np.asarray(y[valid], dtype=np.float64), np.concatenate(preds))
    best = min(sources, key=lambda s: score[s])
    cols = [c for c in columns if c.source_column == best]
    model = fit_predictor(spec, cols, X, enc, np.arange(len(X), dtype=np.int64), protocol, threads)
    return best, model, score


def fit_all(protocol: EvaluationProtocol, columns: Sequence[encoding.ColumnSpec], X: pd.DataFrame,
            enc: EncodedLabel, folds: Sequence[Fold], threads: int,
            incumbent_column: Optional[str]) -> List[FittedBaseline]:
    """Every tabular baseline the protocol declares, fitted on the development rows `X` (labels `enc`), in declared
    order. Forecast baselines (`naive`, `seasonal-naive`) belong to the forecast path and are not fitted here.

    Raises:
        ValueError: When an incumbent heuristic is declared but the snapshot has no incumbent-score column, no dummy
            is declared, or a fit fails.
    """
    out: List[FittedBaseline] = []
    all_rows = np.arange(len(X), dtype=np.int64)
    for i, b in enumerate(protocol.baselines):
        if b.kind == "dummy":
            out.append(FittedBaseline(DUMMY_MEMBER, "dummy", i, dummy(enc)))
        elif b.kind == "one-feature":
            src, model, score = one_feature(protocol, columns, X, enc, folds, threads)
            out.append(FittedBaseline("oneFeature", "simple", i, model, score, src))
        elif b.kind == "glm":
            glm = fit_predictor(glm_spec(enc.family), columns, X, enc, all_rows, protocol, threads)
            out.append(FittedBaseline("glm", "simple", i, glm))
        elif b.kind == "incumbent-heuristic":
            if incumbent_column is None:
                raise ValueError("the protocol declares an incumbent heuristic but the snapshot has no incumbent-score column")
            out.append(FittedBaseline(f"{HEURISTIC_PREFIX}{b.name}", "simple", i, ColumnScorePredictor(incumbent_column)))
    if not any(f.role == "dummy" for f in out):
        raise ValueError("the protocol declares no dummy baseline; the gate needs its no-signal yardstick")
    return out
