"""Glass-box rubric estimator — the canonical NON-TRAINABLE model component.

Ported from Sonar's ScoringEngine: ``score = scale_min + (Σ wᵢ·xᵢ / Σ wᵢ) · (scale_max − scale_min)``
over the weighted inputs, which are expected to arrive normalized (the Scaling/Curve-Mapping
preprocessing components produce [0,1] by default).

Two modes:
  - ``given``  — the weights are operator-authored and ``fit`` merely validates + freezes them.
                 No training data informs the model; this is expertise written down, and it flows
                 through the SAME holdout/metrics machinery as any trained model so its honesty
                 is measured, not assumed.
  - ``search`` — ``fit`` proposes non-negative weights via a constrained linear fit
                 (LinearRegression(positive=True) on the target; a linear probability model for
                 classification), then normalizes them to fractions of Σw.

Explainability is exact and free: the estimator exposes a 1-D ``coef_``/``intercept_`` in
scaled-score units, so the sidecar's linear per-record contribution path (P1-5) and
``_extract_importance`` work unchanged.

Feature names: sklearn's ``fit(X, y)`` receives a bare matrix, but rubric weights are keyed by
column NAME. The sidecar injects the post-preprocessing output columns via
``mj_set_feature_names`` before fitting (see ``_fit_and_score``); ``fit`` fails loud when a
weight names a column that does not exist — a renamed column must never silently drop a signal.

Missing data (per-column policy, ported from Sonar's ModelFactor.MissingDataPolicy): applied to
NaN cells at predict time — ``Zero`` counts the input as 0 and keeps its weight in the
denominator (absence weighs against), ``NeutralMidpoint`` fills 0.5 so it neither helps nor
hurts, ``Exclude`` drops the input from that row's numerator AND denominator. Imputed pipelines
never present NaN, so the policy only bites when imputation is deliberately omitted.

Week-1 scope: weight_modes other than Additive raise (fail loud beats silently-wrong);
contribution caps/floors are accepted and stored but not yet enforced per-row.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
from sklearn.base import BaseEstimator


class RubricConfigError(ValueError):
    """A rubric Spec that cannot be executed as written."""


class RubricEstimator(BaseEstimator):
    """Sklearn-compatible glass-box rubric (see module docstring)."""

    def __init__(
        self,
        mode: str = "given",
        weights: Optional[Dict[str, float]] = None,
        weight_modes: Optional[Dict[str, str]] = None,
        contribution_cap: Optional[Dict[str, float]] = None,
        contribution_floor: Optional[Dict[str, float]] = None,
        missing_data_policy: Optional[Dict[str, str]] = None,
        scale_min: float = 0.0,
        scale_max: float = 100.0,
        class_threshold: Optional[float] = None,
        problem_type: str = "regression",
    ) -> None:
        # sklearn convention: store constructor args verbatim; validate in fit().
        self.mode = mode
        self.weights = weights
        self.weight_modes = weight_modes
        self.contribution_cap = contribution_cap
        self.contribution_floor = contribution_floor
        self.missing_data_policy = missing_data_policy
        self.scale_min = scale_min
        self.scale_max = scale_max
        self.class_threshold = class_threshold
        self.problem_type = problem_type

    # ------------------------------------------------------------------ names
    def mj_set_feature_names(self, names: List[str]) -> None:
        """Sidecar hook: the post-preprocessing output columns, in matrix order."""
        self.mj_feature_names_ = list(names)

    # -------------------------------------------------------------------- fit
    def fit(self, X: Any, y: Any = None) -> "RubricEstimator":
        X = np.asarray(X, dtype=float)
        names = getattr(self, "mj_feature_names_", None)
        if not names or len(names) != X.shape[1]:
            raise RubricConfigError(
                "RubricEstimator needs the feature-name injection (mj_set_feature_names) matching the "
                f"matrix width — got {names and len(names)} names for {X.shape[1]} columns."
            )
        for mode_name in (self.weight_modes or {}).values():
            if mode_name != "Additive":
                raise RubricConfigError(f"weight_mode '{mode_name}' is not implemented yet — only Additive.")

        if self.mode == "given":
            weight_map = dict(self.weights or {})
            if not weight_map:
                raise RubricConfigError("given-mode rubric requires a non-empty 'weights' map.")
            unknown = sorted(set(weight_map) - set(names))
            if unknown:
                raise RubricConfigError(
                    f"Rubric weights name columns not in the matrix: {unknown}. Known columns: {sorted(names)}"
                )
            if any(w < 0 for w in weight_map.values()) or sum(weight_map.values()) <= 0:
                raise RubricConfigError("Rubric weights must be non-negative with a positive sum.")
        elif self.mode == "search":
            weight_map = self._search_weights(X, y, names)
        else:
            raise RubricConfigError(f"Unknown rubric mode '{self.mode}'.")

        self.weight_map_ = weight_map
        self.weight_vector_ = np.array([float(weight_map.get(n, 0.0)) for n in names], dtype=float)
        self.weight_sum_ = float(self.weight_vector_.sum())
        scale_range = float(self.scale_max) - float(self.scale_min)
        # Linear form: score = intercept_ + coef_ · x  (exact when no row has missing cells).
        self.coef_ = self.weight_vector_ / self.weight_sum_ * scale_range
        self.intercept_ = float(self.scale_min)
        self.n_features_in_ = X.shape[1]
        return self

    def _search_weights(self, X: np.ndarray, y: Any, names: List[str]) -> Dict[str, float]:
        """Propose non-negative weights from data (constrained linear fit, normalized to Σ=1)."""
        from sklearn.linear_model import LinearRegression

        if y is None:
            raise RubricConfigError("search-mode rubric requires a target.")
        target = np.asarray(y, dtype=float)
        clean = np.nan_to_num(X, nan=0.5)  # search treats absence as neutral
        fitted = LinearRegression(positive=True).fit(clean, target)
        raw = np.maximum(np.asarray(fitted.coef_, dtype=float), 0.0)
        if raw.sum() <= 0:
            raise RubricConfigError("search-mode found no positively-contributing inputs to weight.")
        normalized = raw / raw.sum()
        return {name: float(w) for name, w in zip(names, normalized) if w > 1e-9}

    # ---------------------------------------------------------------- scoring
    def _scores(self, X: Any) -> np.ndarray:
        X = np.asarray(X, dtype=float)
        check = getattr(self, "weight_vector_", None)
        if check is None:
            raise RubricConfigError("RubricEstimator is not fitted.")
        policies = self.missing_data_policy or {}
        names = self.mj_feature_names_
        scale_range = float(self.scale_max) - float(self.scale_min)
        scores = np.empty(X.shape[0], dtype=float)
        nan_rows = np.isnan(X).any(axis=1)
        # Fast path: fully-present rows are the plain linear form.
        present = ~nan_rows
        scores[present] = self.intercept_ + X[present] @ self.coef_
        for i in np.flatnonzero(nan_rows):
            numerator = 0.0
            denominator = 0.0
            for j, name in enumerate(names):
                weight = self.weight_vector_[j]
                if weight == 0.0:
                    continue
                value = X[i, j]
                if np.isnan(value):
                    policy = policies.get(name, "Zero")
                    if policy == "Exclude":
                        continue  # drops from numerator AND denominator
                    value = 0.5 if policy == "NeutralMidpoint" else 0.0
                numerator += weight * value
                denominator += weight
            scores[i] = (
                float(self.scale_min) + (numerator / denominator) * scale_range
                if denominator > 0
                else float("nan")  # no countable inputs → unscored, like Sonar
            )
        return scores

    def predict(self, X: Any) -> np.ndarray:
        scores = self._scores(X)
        if self.problem_type == "classification":
            threshold = (
                float(self.class_threshold)
                if self.class_threshold is not None
                else (float(self.scale_min) + float(self.scale_max)) / 2.0
            )
            return (scores >= threshold).astype(int)
        return scores

    def predict_proba(self, X: Any) -> np.ndarray:
        """P(class 1) = the score's position in the scale — monotone, so AUC is well-defined."""
        scores = self._scores(X)
        scale_range = float(self.scale_max) - float(self.scale_min)
        p1 = np.clip((scores - float(self.scale_min)) / scale_range, 0.0, 1.0)
        return np.column_stack([1.0 - p1, p1])
