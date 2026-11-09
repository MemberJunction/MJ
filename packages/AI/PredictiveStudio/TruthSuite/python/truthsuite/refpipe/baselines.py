# truthsuite/refpipe/baselines.py — the reference pipeline's comparators, fit on the training carve only (S4.5, S-T.3).
#   base_rate      base rate / class prior / training mean
#   one_feature    the best single feature by inner CV, as a GLM on that one column
#   glm            the strong simple baseline: L2 logistic (multinomial), ridge, Poisson or Tweedie GLM per family
#   naive_last, seasonal_naive(period=12), series_mean for series (per origin, from that origin's window only)
from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np
import numpy.typing as npt
import pandas as pd

from truthsuite.refpipe.models import ConstantModel, TabularModel

FArr = npt.NDArray[np.float64]
IntArr = npt.NDArray[np.int64]
RowLoss = Callable[[npt.NDArray[np.generic], FArr], FArr]


def base_rate(problem: str, y_train: npt.NDArray[np.generic], n_classes: int = 2) -> ConstantModel:
    if problem == "multiclass":
        yi = np.asarray(y_train, dtype=np.int64)
        return ConstantModel(np.bincount(yi, minlength=n_classes).astype(np.float64) / len(yi))
    return ConstantModel(np.array(float(np.mean(np.asarray(y_train, dtype=np.float64)))))


def glm(problem: str, num: list[str], cat: list[str], n_classes: int, seed: int) -> TabularModel:
    return TabularModel(problem, "glm", list(num), list(cat), n_classes, seed)


def one_feature(problem: str, X: pd.DataFrame, y: npt.NDArray[np.generic], num: list[str], cat: list[str],
                folds: Sequence[tuple[IntArr, IntArr]], row_loss: RowLoss, n_classes: int, seed: int
                ) -> tuple[str, TabularModel, dict[str, float]]:
    """Pick the single feature whose one-column GLM has the lowest pooled out-of-fold loss; refit it on all rows."""
    scores: dict[str, float] = {}
    for col in sorted(num + cat):
        losses = []
        for tr, va in folds:
            m = TabularModel(problem, "glm", [col] if col in num else [], [col] if col in cat else [], n_classes, seed)
            m.fit(X.iloc[tr], np.asarray(y)[tr])
            losses.append(row_loss(np.asarray(y)[va], m.predict(X.iloc[va])))
        scores[col] = float(np.mean(np.concatenate(losses)))
    best = min(sorted(scores), key=lambda c: scores[c])
    m = TabularModel(problem, "glm", [best] if best in num else [], [best] if best in cat else [], n_classes, seed)
    return best, m.fit(X, y), scores


def naive_last(y_train: FArr, h: int) -> FArr:
    return np.full(h, float(y_train[-1]), dtype=np.float64)


def seasonal_naive(y_train: FArr, h: int, period: int = 12) -> FArr:
    last = y_train[-period:]
    return np.array([float(last[i % period]) for i in range(h)], dtype=np.float64)


def series_mean(y_train: FArr, h: int) -> FArr:
    return np.full(h, float(np.mean(y_train)), dtype=np.float64)
