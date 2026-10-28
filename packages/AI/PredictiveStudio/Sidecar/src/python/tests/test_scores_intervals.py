"""Proper scores, metric direction, intervals, DeLong and calibration fit. The expected numbers are the truth suite's
reference pipeline (bootstrap intervals, the statsmodels calibration GLM) and an independent fast-DeLong
implementation, run on the same inputs."""

from __future__ import annotations

import numpy as np
import pytest
from sklearn.metrics import mean_tweedie_deviance

from app import calibration as CAL, intervals as I, scores


def _probs(seed: int = 5, n: int = 500) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    p = 1 / (1 + np.exp(-rng.normal(-1, 1, n)))
    y = (rng.random(n) < p).astype(float)
    q = np.clip(p + rng.normal(0, 0.05, n), 0.01, 0.99)
    return y, p, q


def _ll(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(scores.row_log_loss(a, b)))


def test_log_loss_bootstrap_and_paired_match_refpipe() -> None:
    y, p, q = _probs()
    assert _ll(y, p) == pytest.approx(0.5524495826573416, abs=1e-12)
    assert I.bootstrap_ci(y, p, _ll, 200, 0) == pytest.approx((0.5114649924790724, 0.5956827236586346), abs=1e-12)
    groups = [str(i // 5) for i in range(len(y))]
    assert I.bootstrap_ci(y, p, _ll, 200, 0, groups) == pytest.approx((0.5132003573873427, 0.5944145096035567), abs=1e-12)
    assert I.paired_bootstrap(y, q, p, _ll, 200, 0) == pytest.approx(
        (0.006280250319113501, -0.004683969755631774, 0.01641800033310035), abs=1e-12)


def test_calibration_slope_matches_refpipe_glm() -> None:
    y, _, q = _probs()
    fit = CAL.calibration_fit(y, q)
    assert fit.slope == pytest.approx(0.854206641562335, abs=1e-8)
    assert fit.intercept == pytest.approx(-0.06250763662631259, abs=1e-8)
    assert fit.citl == pytest.approx(0.04322880784862868, abs=1e-8)


def test_delong_paired_matches_review_implementation() -> None:
    y, p, q = _probs()
    d = I.delong_paired(y, p, q)
    assert d.auc_a == pytest.approx(0.7165697674418605, abs=1e-12)
    assert d.diff == pytest.approx(0.009913536076326834, abs=1e-12)
    assert d.se == pytest.approx(0.007042335401648591, abs=1e-12)
    assert I.delong_paired(y, p, p).p_two_sided == pytest.approx(1.0)


def test_proper_scores_per_family() -> None:
    y = np.array([0.0, 1.0, 3.0])
    mu = np.array([0.5, 1.0, 2.0])
    assert float(np.mean(scores.row_poisson_deviance(y, mu))) == pytest.approx(
        np.mean([2 * (0 - (0 - 0.5)), 0.0, 2 * (3 * np.log(1.5) - 1)]))
    tw = scores.primary_score("tweedie-deviance", 1.5)
    assert tw.aggregate(y, mu) == pytest.approx(mean_tweedie_deviance(y, mu, power=1.5))
    with pytest.raises(ValueError):
        scores.primary_score("tweedie-deviance", None)


def test_metric_direction_covers_every_key() -> None:
    assert scores.METRIC_DIRECTION["brier"] == "lower-is-better"
    assert scores.METRIC_DIRECTION["mase"] == "lower-is-better"
    assert scores.METRIC_DIRECTION["calibration-slope"] == "closer-to-one"
    assert len(scores.METRIC_DIRECTION) == 15


def test_ranking_a_tweedie_task_by_rmse_is_refused() -> None:
    with pytest.raises(scores.CrossFamilyRankingRefused) as e:   # typed: the structured fields, never the message
        scores.refuse_cross_family("non-negative", "continuous", "rmse")
    assert (e.value.task_kind, e.value.family, e.value.metric) == ("non-negative", "continuous", "rmse")
