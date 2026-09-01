"""Glass-box rubric estimator — unit + end-to-end /train + /predict tests.

The rubric is the canonical NON-TRAINABLE model component: given-mode weights are frozen
verbatim and must reproduce Sonar's formula exactly; search mode recovers planted weights;
contributions come from ``coef_`` for free; missing-data policies change per-row arithmetic.
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.estimators.rubric import RubricConfigError, RubricEstimator
from app.main import app

client = TestClient(app)


def _fitted(weights, **kw) -> RubricEstimator:
    names = kw.pop("names", list(weights))
    est = RubricEstimator(mode="given", weights=weights, **kw)
    est.mj_set_feature_names(names)
    est.fit(np.zeros((1, len(names))), None)
    return est


# ---------------------------------------------------------------------------
# Unit: the Sonar formula, verbatim
# ---------------------------------------------------------------------------

def test_given_mode_reproduces_the_sonar_formula() -> None:
    # score = scale_min + (Σ w·x / Σ w) * range
    est = _fitted({"recency": 3.0, "activity": 1.0}, scale_min=0.0, scale_max=100.0)
    scores = est.predict(np.array([[1.0, 0.0], [0.0, 1.0], [0.5, 0.5], [1.0, 1.0]]))
    assert scores == pytest.approx([75.0, 25.0, 50.0, 100.0])


def test_scale_offsets_apply() -> None:
    est = _fitted({"a": 1.0}, scale_min=200.0, scale_max=800.0)
    assert est.predict(np.array([[0.5]]))[0] == pytest.approx(500.0)


def test_contributions_are_exact_via_coef() -> None:
    est = _fitted({"a": 2.0, "b": 1.0}, scale_min=0.0, scale_max=100.0)
    # coef in scaled units: a → 2/3*100, b → 1/3*100; intercept = 0
    assert est.coef_ == pytest.approx([200.0 / 3.0, 100.0 / 3.0])
    x = np.array([[0.9, 0.3]])
    assert est.predict(x)[0] == pytest.approx(est.intercept_ + x[0] @ est.coef_)


def test_unweighted_columns_do_not_contribute() -> None:
    est = _fitted({"a": 1.0}, names=["a", "noise"])
    assert est.predict(np.array([[0.4, 0.99]]))[0] == pytest.approx(40.0)
    assert est.coef_[1] == 0.0


# ---------------------------------------------------------------------------
# Unit: missing-data policies (per-row arithmetic, ported from Sonar)
# ---------------------------------------------------------------------------

def test_missing_data_zero_keeps_the_weight_against_the_row() -> None:
    est = _fitted({"a": 2.0, "b": 1.0})
    assert est.predict(np.array([[np.nan, 1.0]]))[0] == pytest.approx(100.0 / 3.0)


def test_missing_data_neutral_midpoint_neither_helps_nor_hurts() -> None:
    est = _fitted({"a": 2.0, "b": 1.0}, missing_data_policy={"a": "NeutralMidpoint"})
    assert est.predict(np.array([[np.nan, 1.0]]))[0] == pytest.approx((2 * 0.5 + 1 * 1.0) / 3.0 * 100.0)


def test_missing_data_exclude_drops_numerator_and_denominator() -> None:
    est = _fitted({"a": 2.0, "b": 1.0}, missing_data_policy={"a": "Exclude"})
    assert est.predict(np.array([[np.nan, 0.8]]))[0] == pytest.approx(80.0)


def test_row_with_no_countable_inputs_is_unscored() -> None:
    est = _fitted({"a": 1.0}, names=["a", "b"], missing_data_policy={"a": "Exclude"})
    assert np.isnan(est.predict(np.array([[np.nan, 0.7]]))[0])


# ---------------------------------------------------------------------------
# Unit: fail-loud configuration guards
# ---------------------------------------------------------------------------

def test_unknown_weight_column_fails_loud() -> None:
    est = RubricEstimator(mode="given", weights={"ghost": 1.0})
    est.mj_set_feature_names(["a"])
    with pytest.raises(RubricConfigError, match="ghost"):
        est.fit(np.zeros((1, 1)), None)


def test_missing_name_injection_fails_loud() -> None:
    with pytest.raises(RubricConfigError, match="mj_set_feature_names"):
        RubricEstimator(mode="given", weights={"a": 1.0}).fit(np.zeros((1, 1)), None)


def test_non_additive_weight_mode_fails_loud() -> None:
    est = RubricEstimator(mode="given", weights={"a": 1.0}, weight_modes={"a": "Gate"})
    est.mj_set_feature_names(["a"])
    with pytest.raises(RubricConfigError, match="Additive"):
        est.fit(np.zeros((1, 1)), None)


# ---------------------------------------------------------------------------
# Unit: search mode recovers planted structure
# ---------------------------------------------------------------------------

def test_search_mode_recovers_planted_weights() -> None:
    rng = np.random.default_rng(3)
    X = rng.uniform(0, 1, size=(400, 3))
    y = 0.7 * X[:, 0] + 0.3 * X[:, 1]  # feature 2 is noise
    est = RubricEstimator(mode="search", problem_type="regression")
    est.mj_set_feature_names(["a", "b", "noise"])
    est.fit(X, y)
    assert est.weight_map_["a"] == pytest.approx(0.7, abs=0.05)
    assert est.weight_map_["b"] == pytest.approx(0.3, abs=0.05)
    assert est.weight_map_.get("noise", 0.0) < 0.05


# ---------------------------------------------------------------------------
# End-to-end: /train + /predict through the FastAPI app
# ---------------------------------------------------------------------------

def _rubric_train_request(mode: str) -> dict:
    rng = np.random.default_rng(17)
    n = 240
    engagement = rng.uniform(0, 1, n)
    tenure = rng.uniform(0, 1, n)
    score = 0.75 * engagement + 0.25 * tenure
    label = (score >= 0.5).astype(int)
    columns = ["engagement", "tenure", "label"]
    rows = [[float(engagement[i]), float(tenure[i]), int(label[i])] for i in range(n)]
    hyper = {"mode": mode, "scale_min": 0, "scale_max": 100}
    if mode == "given":
        hyper["weights"] = {"engagement": 3.0, "tenure": 1.0}
    return {
        "algorithm": "rubric",
        "problem_type": "classification",
        "hyperparameters": hyper,
        "validation": {"strategy": "train_test_split", "test_size": 0.25, "holdout_size": 0.2},
        "feature_schema": [{"Name": "engagement", "Kind": "numeric"}, {"Name": "tenure", "Kind": "numeric"}],
        "preprocessing": [],
        "target": "label",
        "data": {"columns": columns, "rows": rows},
    }


@pytest.mark.parametrize("mode", ["given", "search"])
def test_rubric_trains_and_predicts_end_to_end(mode: str) -> None:
    resp = client.post("/train", json=_rubric_train_request(mode))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Honest metrics machinery applies to the untrainable rubric like any model.
    assert body["metrics"]["auc"] > 0.85
    assert body["holdout_metrics"]["auc"] > 0.8
    # coef_-based importance is free.
    assert set(body["feature_importance"]) == {"engagement", "tenure"}
    assert body["feature_importance"]["engagement"] > body["feature_importance"]["tenure"]

    pred = client.post(
        "/predict",
        json={
            "artifact_b64": body["artifact_b64"],
            "fitted_preprocessing": body["fitted_preprocessing"],
            "feature_schema": [{"Name": "engagement", "Kind": "numeric"}, {"Name": "tenure", "Kind": "numeric"}],
            "rows": [
                {"engagement": 0.95, "tenure": 0.9},
                {"engagement": 0.05, "tenure": 0.1},
            ],
        },
    )
    assert pred.status_code == 200, pred.text
    predictions = pred.json()["predictions"]
    assert predictions[0]["class"] == "1" and predictions[1]["class"] == "0"
    assert predictions[0]["score"] > predictions[1]["score"]
    # P1-5 exact per-record contributions flow from coef_ with zero rubric-specific code.
    assert predictions[0]["contributions"], "linear contributions expected for the rubric"
    top = predictions[0]["contributions"][0]["feature"]
    assert top == "engagement"
