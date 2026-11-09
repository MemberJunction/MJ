"""Proper scores, secondary metrics, metric direction, intervals, DeLong and calibration fit. The expected numbers are
the truth suite's reference pipeline (`truthsuite.refpipe.scoring`: bootstrap intervals, AUC, R2, the statsmodels
calibration GLM) and an independent fast-DeLong implementation, run on the same inputs. `truthsuite` is not installed
in the sidecar's venv, so its values are pinned here; the reference pipeline has no accuracy/precision/recall/F1, so
those are checked against scikit-learn's implementations."""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import get_args

import numpy as np
import pytest
from sklearn.metrics import accuracy_score, f1_score, mean_tweedie_deviance, precision_score, recall_score

from app import calibration as CAL, intervals as I, scores, trainer_schemas as TS

CORE_PROTOCOL = Path(__file__).resolve().parents[4] / "Core" / "src" / "evaluation-protocol.ts"


def _probs(seed: int = 5, n: int = 500) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    p = 1 / (1 + np.exp(-rng.normal(-1, 1, n)))
    y = (rng.random(n) < p).astype(float)
    q = np.clip(p + rng.normal(0, 0.05, n), 0.01, 0.99)
    return y, p, q


def _multiclass() -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(7)
    logits = rng.normal(0, 1, (300, 3))
    P = np.exp(logits) / np.exp(logits).sum(1, keepdims=True)
    y = np.array([rng.choice(3, p=r) for r in P]).astype(float)
    return y, P


def _ll(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(scores.row_log_loss(a, b)))


def test_log_loss_bootstrap_and_paired_match_refpipe() -> None:
    y, p, q = _probs()
    assert _ll(y, p) == pytest.approx(0.5524495826573416, abs=1e-12)
    ci = I.bootstrap_ci(y, p, _ll, 200, 0)
    assert (ci.lower, ci.upper) == pytest.approx((0.5114649924790724, 0.5956827236586346), abs=1e-12)
    assert ci.draws == 200
    groups = [str(i // 5) for i in range(len(y))]
    gci = I.bootstrap_ci(y, p, _ll, 200, 0, groups)
    assert (gci.lower, gci.upper) == pytest.approx((0.5132003573873427, 0.5944145096035567), abs=1e-12)
    pb = I.paired_bootstrap(y, q, p, _ll, 200, 0)
    assert (pb.value, pb.lower, pb.upper) == pytest.approx(
        (0.006280250319113501, -0.004683969755631774, 0.01641800033310035), abs=1e-12)
    assert pb.draws == 200


def test_bootstrap_counts_only_defined_draws_and_all_nan_is_nan() -> None:
    y, p, q = _probs()
    never = I.paired_bootstrap(y, q, p, lambda a, b: float("nan"), 50, 0)
    assert math.isnan(never.value) and math.isnan(never.lower) and math.isnan(never.upper) and never.draws == 0
    ci = I.bootstrap_ci(y, p, lambda a, b: float("nan"), 50, 0)
    assert math.isnan(ci.lower) and math.isnan(ci.upper) and ci.draws == 0
    # AUC is undefined on a resample holding one class: with 2 positives in 20 rows some draws drop out.
    y2 = np.zeros(20)
    y2[:2] = 1.0
    part = I.bootstrap_ci(y2, np.linspace(0.1, 0.9, 20), scores.auc, 200, 0)
    assert 0 < part.draws < 200


def test_calibration_slope_matches_refpipe_glm() -> None:
    y, _, q = _probs()
    fit = CAL.calibration_fit(y, q)
    assert fit.slope == pytest.approx(0.854206641562335, abs=1e-8)
    assert fit.intercept == pytest.approx(-0.06250763662631259, abs=1e-8)
    assert fit.citl == pytest.approx(0.04322880784862868, abs=1e-8)


def test_calibration_fit_is_nan_when_undefined() -> None:
    y, p, _ = _probs()
    one_class = CAL.calibration_fit(np.zeros(len(p)), p)
    assert math.isnan(one_class.slope) and math.isnan(one_class.intercept) and math.isnan(one_class.citl)
    separable = CAL.calibration_fit((p > 0.5).astype(float), p)   # the GLM slope diverges: no maximum-likelihood fit
    assert math.isnan(separable.slope) and math.isnan(separable.intercept)
    constant = CAL.calibration_fit(y, np.full(len(y), 0.3))
    assert math.isnan(constant.slope) and math.isnan(constant.intercept) and math.isfinite(constant.citl)


def test_delong_paired_matches_review_implementation() -> None:
    y, p, q = _probs()
    d = I.delong_paired(y, p, q)
    assert d.auc_a == pytest.approx(0.7165697674418605, abs=1e-12)
    assert d.diff == pytest.approx(0.009913536076326834, abs=1e-12)
    assert d.se == pytest.approx(0.007042335401648591, abs=1e-12)


def test_delong_with_zero_variance_has_no_test_statistic() -> None:
    y, p, _ = _probs()
    same = I.delong_paired(y, p, p)
    assert same.diff == 0.0 and same.se == 0.0
    assert math.isnan(same.z) and math.isnan(same.p_two_sided) and math.isnan(same.p_a_greater)


def test_hanley_mcneil_se_refuses_an_empty_class() -> None:
    assert I.hanley_mcneil_se(0.7, 100, 200) > 0
    with pytest.raises(ValueError):
        I.hanley_mcneil_se(0.7, 0, 200)
    with pytest.raises(ValueError):
        I.hanley_mcneil_se(0.7, 100, 0)


def test_auc_and_r2_match_refpipe() -> None:
    y, p, q = _probs()
    assert scores.auc(y, p) == pytest.approx(0.7165697674418605, abs=1e-12)
    assert scores.auc(y, q) == pytest.approx(0.7066562313655337, abs=1e-12)
    yk, P = _multiclass()
    assert scores.auc(yk, P) == pytest.approx(0.739804958752284, abs=1e-12)
    assert scores.auc_by_class(yk, P) == pytest.approx([0.7298322165082334, 0.7595348128586664, 0.7300478468899522], abs=1e-12)
    yc = np.linspace(-2, 2, 50)
    assert scores.r2(yc, yc + np.sin(np.arange(50))) == pytest.approx(0.6390305019809597, abs=1e-12)


def test_accuracy_precision_recall_f1_match_sklearn() -> None:
    y, p, _ = _probs()
    yhat = (p >= 0.5).astype(float)
    assert scores.accuracy(y, p) == pytest.approx(accuracy_score(y, yhat), abs=1e-12)
    assert scores.secondary_fn("precision")(y, p) == pytest.approx(precision_score(y, yhat), abs=1e-12)
    assert scores.secondary_fn("recall")(y, p) == pytest.approx(recall_score(y, yhat), abs=1e-12)
    assert scores.secondary_fn("f1")(y, p) == pytest.approx(f1_score(y, yhat), abs=1e-12)
    yk, P = _multiclass()
    assert scores.accuracy(yk, P) == pytest.approx(accuracy_score(yk, np.argmax(P, axis=1)), abs=1e-12)


def test_secondary_fn_maps_every_secondary_metric() -> None:
    y, p, q = _probs()
    assert set(get_args(TS.SecondaryMetric)) == {"auc", "accuracy", "f1", "precision", "recall", "r2", "calibration-slope"}
    assert scores.secondary_fn("auc")(y, p) == scores.auc(y, p)
    assert scores.secondary_fn("accuracy")(y, p) == scores.accuracy(y, p)
    assert scores.secondary_fn("r2")(y, p) == scores.r2(y, p)
    assert scores.secondary_fn("calibration-slope")(y, q) == pytest.approx(0.854206641562335, abs=1e-8)
    for m in get_args(TS.SecondaryMetric):
        assert math.isfinite(scores.secondary_fn(m)(y, p))


def test_undefined_secondary_metrics_are_nan() -> None:
    p = np.linspace(0.1, 0.9, 10)
    assert math.isnan(scores.auc(np.ones(10), p))                      # one class
    assert math.isnan(scores.r2(np.full(10, 3.0), p))                  # constant target
    low = np.full(10, 0.2)                                             # nothing predicted positive
    y = np.array([0, 1] * 5, dtype=float)
    assert math.isnan(scores.secondary_fn("precision")(y, low))
    assert scores.secondary_fn("recall")(y, low) == 0.0
    assert math.isnan(scores.secondary_fn("f1")(y, low))
    assert math.isnan(scores.secondary_fn("recall")(np.zeros(10), p))  # no actual positives
    assert math.isnan(scores.secondary_fn("f1")(np.zeros(10), p))
    assert math.isnan(scores.secondary_fn("calibration-slope")(y, np.full(10, 0.4)))  # constant predictions


def test_threshold_metrics_refuse_multiclass_probabilities() -> None:
    yk, P = _multiclass()
    for m in ("precision", "recall", "f1", "calibration-slope"):
        with pytest.raises(ValueError):
            scores.secondary_fn(m)(yk, P)


def test_proper_scores_per_family() -> None:
    y = np.array([0.0, 1.0, 3.0])
    mu = np.array([0.5, 1.0, 2.0])
    assert float(np.mean(scores.row_poisson_deviance(y, mu))) == pytest.approx(
        np.mean([2 * (0 - (0 - 0.5)), 0.0, 2 * (3 * np.log(1.5) - 1)]))
    tw = scores.primary_score("tweedie-deviance", 1.5)
    assert tw.aggregate(y, mu) == pytest.approx(mean_tweedie_deviance(y, mu, power=1.5))
    with pytest.raises(ValueError):
        scores.primary_score("tweedie-deviance", None)


def test_metric_direction_equals_core_table() -> None:
    text = CORE_PROTOCOL.read_text(encoding="utf-8")
    block = text[text.index("export const METRIC_DIRECTION"):]
    block = block[block.index("= {") + 3:block.index("};")]
    core = {k.strip("'"): v for k, v in re.findall(r"('[a-z0-9-]+'|[a-z0-9]+): '([a-z-]+)'", block)}
    assert len(core) == 15
    assert dict(scores.METRIC_DIRECTION) == core
    assert set(scores.METRIC_DIRECTION) == set(get_args(TS.MetricKey))


def test_family_table_matches_the_protocol_schema() -> None:
    union = get_args(get_args(TS.ProperScore)[0])
    from_schema: dict[str, set[str]] = {}
    for model in union:
        (family,) = get_args(model.model_fields["family"].annotation)
        for metric in get_args(model.model_fields["metric"].annotation):
            from_schema.setdefault(metric, set()).add(family)
    assert {m: set(f) for m, f in scores.FAMILY_OF_METRIC.items()} == from_schema
    task_kinds = {get_args(t.model_fields["kind"].annotation)[0] for t in get_args(get_args(TS.TaskType)[0])}
    assert set(get_args(scores.ScoreFamily)) == task_kinds


def test_ranking_a_tweedie_task_by_rmse_is_refused() -> None:
    with pytest.raises(scores.CrossFamilyRankingRefused) as e:   # typed: the structured fields, never the message
        scores.refuse_cross_family("non-negative", "continuous", "rmse")
    assert (e.value.task_kind, e.value.family, e.value.metric) == ("non-negative", "continuous", "rmse")


def test_a_task_ranked_by_its_own_proper_score_is_accepted() -> None:
    assert scores.refuse_cross_family("forecast", "forecast", "rmse") is None
    assert scores.refuse_cross_family("continuous", "continuous", "rmse") is None
    assert scores.refuse_cross_family("non-negative", "non-negative", "tweedie-deviance") is None
    with pytest.raises(scores.CrossFamilyRankingRefused):
        scores.refuse_cross_family("forecast", "forecast", "mae")
