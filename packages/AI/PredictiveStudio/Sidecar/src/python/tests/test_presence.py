"""The `present` op — making "no data" a signal instead of a silent zero.

Two separable things, both opt-in:

* the **mask** `<col>__present`, so a model can learn from absence itself;
* **preserved missingness**, so the value reaching the estimator is missing rather than `0.0`.

The second is the load-bearing one. Without it every absent value arrives as a real zero, and a
rubric's `Exclude`/`NeutralMidpoint` policy can never fire — the estimator has no way to tell
"scored zero" from "we never knew". These tests pin that end to end.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List

import numpy as np
import pytest

from app import preprocessing
from app.estimators.rubric import RubricEstimator

COLUMNS = ["engagement", "tenure"]
ROWS: List[List[Any]] = [
    [1.0, 10.0],
    [None, 20.0],   # engagement genuinely unknown
    [0.0, 30.0],    # engagement genuinely zero
    [0.5, 40.0],
]


def _fit(ops: List[Dict[str, Any]]):
    return preprocessing.fit_transform(COLUMNS, ROWS, ops, COLUMNS)


def test_mask_marks_absence_and_keeps_the_source_column() -> None:
    matrix, columns, _fitted = _fit([{"op": "present", "col": "engagement"}])

    assert columns == ["engagement__present", "engagement", "tenure"]
    assert list(matrix[:, columns.index("engagement__present")]) == [1.0, 0.0, 1.0, 1.0]
    # "Was there any" is a different signal from "how much" — the source survives.
    assert matrix[0, columns.index("engagement")] == 1.0


def test_a_real_zero_and_a_missing_value_are_distinguishable() -> None:
    """The regression this whole op exists for.

    Row 1 has no engagement; row 2 has an engagement of exactly zero. Before `present` both
    reached the estimator as `0.0` and nothing downstream could separate them.
    """
    matrix, columns, _ = _fit([{"op": "present", "col": "engagement", "preserveMissing": True}])
    col = columns.index("engagement")

    assert math.isnan(matrix[1, col])   # unknown
    assert matrix[2, col] == 0.0        # known, and zero
    mask = columns.index("engagement__present")
    assert matrix[1, mask] == 0.0 and matrix[2, mask] == 1.0


def test_missing_is_still_coerced_to_zero_without_the_op() -> None:
    # Every pipeline that does not ask for preservation is byte-identical to before.
    matrix, columns, _ = _fit([])
    assert columns == ["engagement", "tenure"]
    assert matrix[1, 0] == 0.0
    assert not np.isnan(matrix).any()


def test_preserve_missing_can_be_used_without_the_mask() -> None:
    matrix, columns, _ = _fit(
        [{"op": "present", "col": "engagement", "emitMask": False, "preserveMissing": True}]
    )
    assert columns == ["engagement", "tenure"]
    assert math.isnan(matrix[1, 0])


def test_predict_time_columns_match_training_exactly() -> None:
    ops = [{"op": "present", "col": "engagement", "preserveMissing": True}]
    train_matrix, columns, fitted = _fit(ops)

    scored = preprocessing.transform(
        [{"engagement": None, "tenure": 20.0}, {"engagement": 0.0, "tenure": 30.0}],
        fitted,
        COLUMNS,
    )
    assert scored.shape[1] == train_matrix.shape[1]
    assert math.isnan(scored[0, columns.index("engagement")])
    assert scored[1, columns.index("engagement")] == 0.0
    assert list(scored[:, columns.index("engagement__present")]) == [0.0, 1.0]


def test_impute_after_present_still_fills_the_source() -> None:
    """The two ops compose: absence is recorded, then filled for estimators that need a number."""
    matrix, columns, _ = _fit(
        [
            {"op": "present", "col": "engagement"},
            {"op": "impute", "col": "engagement", "strategy": "mean"},
        ]
    )
    col = columns.index("engagement")
    assert not math.isnan(matrix[1, col])
    assert matrix[1, col] == pytest.approx(0.5)  # mean of 1.0, 0.0, 0.5
    assert matrix[1, columns.index("engagement__present")] == 0.0


# ---------------------------------------------------------------------------
# End to end: the rubric's MissingDataPolicy finally bites
# ---------------------------------------------------------------------------

WEIGHTS = {"engagement": 0.5, "tenure_norm": 0.5}


def _rubric(policy: str) -> RubricEstimator:
    est = RubricEstimator(
        weights=WEIGHTS,
        problem_type="regression",
        scale_min=0.0,
        scale_max=100.0,
        missing_data_policy={"engagement": policy},
    )
    est.mj_set_feature_names(["engagement", "tenure_norm"])
    return est


@pytest.mark.parametrize(
    "policy,expected",
    [
        # Zero: absence counts as 0 and keeps its weight → (0*.5 + 1*.5)/1 = 0.5 → 50
        ("Zero", 50.0),
        # NeutralMidpoint: absence scores .5 → (.5*.5 + 1*.5)/1 = .75 → 75
        ("NeutralMidpoint", 75.0),
        # Exclude: absence leaves numerator AND denominator → (1*.5)/.5 = 1.0 → 100
        ("Exclude", 100.0),
    ],
)
def test_missing_data_policy_changes_the_score(policy: str, expected: float) -> None:
    est = _rubric(policy)
    est.fit(np.array([[1.0, 1.0], [0.0, 0.0]]), np.array([100.0, 0.0]))
    scored = est.predict(np.array([[float("nan"), 1.0]]))
    assert scored[0] == pytest.approx(expected)


def test_the_policy_is_dead_without_preserved_missingness() -> None:
    """Why `preserveMissing` had to exist.

    Run the SAME row through preprocessing without it: absence becomes a real 0.0, every policy
    collapses onto `Zero`, and the operator's declared intent is silently discarded.
    """
    ops: List[Dict[str, Any]] = []
    matrix, columns, _ = preprocessing.fit_transform(
        ["engagement", "tenure_norm"], [[None, 1.0], [1.0, 1.0]], ops, ["engagement", "tenure_norm"]
    )
    est = _rubric("Exclude")
    est.fit(np.array([[1.0, 1.0], [0.0, 0.0]]), np.array([100.0, 0.0]))
    assert est.predict(matrix[:1])[0] == pytest.approx(50.0)  # == the Zero answer, not Exclude's 100

    preserved, columns2, _ = preprocessing.fit_transform(
        ["engagement", "tenure_norm"],
        [[None, 1.0], [1.0, 1.0]],
        [{"op": "present", "col": "engagement", "emitMask": False, "preserveMissing": True}],
        ["engagement", "tenure_norm"],
    )
    est2 = _rubric("Exclude")
    est2.mj_set_feature_names(columns2)
    est2.fit(np.array([[1.0, 1.0], [0.0, 0.0]]), np.array([100.0, 0.0]))
    assert est2.predict(preserved[:1])[0] == pytest.approx(100.0)


def test_a_row_with_no_countable_inputs_is_unscored_not_zero() -> None:
    est = _rubric("Exclude")
    est.missing_data_policy = {"engagement": "Exclude", "tenure_norm": "Exclude"}
    est.fit(np.array([[1.0, 1.0], [0.0, 0.0]]), np.array([100.0, 0.0]))
    scored = est.predict(np.array([[float("nan"), float("nan")]]))
    # Reporting 0 here would read as "scored lowest" when the truth is "cannot be scored".
    assert math.isnan(scored[0])


# ---------------------------------------------------------------------------
# The explainability half: a missing feature is REPORTED, not silently dropped
# ---------------------------------------------------------------------------

def test_missing_features_are_reported_per_row() -> None:
    from app import main as M

    X = np.array([[1.0, 2.0], [float("nan"), 2.0]])
    assert M._missing_features(X, ["engagement", "tenure"]) == [None, ["engagement"]]


def test_missing_features_is_none_when_nothing_is_missing() -> None:
    from app import main as M

    # None, not [] — "nothing was missing" and "this pipeline cannot tell" are different claims,
    # and every pipeline that coerces absence to 0 falls in the second category.
    assert M._missing_features(np.array([[1.0, 2.0]]), ["a", "b"]) == [None]


def test_contributions_skip_a_missing_cell_and_flag_the_rest() -> None:
    """`coef * nan` is nan; ranking it would be meaningless, so it must not appear as a driver."""
    from app import main as M
    from sklearn.linear_model import LinearRegression

    est = LinearRegression().fit(np.array([[0.0, 0.0], [1.0, 1.0]]), np.array([0.0, 2.0]))
    est.mj_feature_names_ = ["a", "b"]
    rows = M._row_contributions(est, np.array([[float("nan"), 1.0]]), ["a", "b"])

    features = [c["feature"] for c in (rows[0] or [])]
    assert "a" not in features
    assert all(c["hadData"] is True for c in (rows[0] or []))


def test_a_missing_feature_survives_the_whole_predict_path() -> None:
    """End to end: preserved missingness → /predict → the row says what it did not know."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    columns = ["engagement", "tenure", "renewed"]
    rows = [[float(i % 3), float(i), "yes" if i % 2 else "no"] for i in range(40)]
    ops = [{"op": "present", "col": "engagement", "preserveMissing": True}]
    trained = client.post("/train", json={
        # lightgbm learns a default branch for a missing value; a NaN-rejecting estimator is
        # refused up front (see the next test).
        "algorithm": "lightgbm",
        "problem_type": "classification",
        "hyperparameters": {},
        "validation": {"strategy": "none"},
        "feature_schema": [{"Name": "engagement", "Kind": "numeric"}, {"Name": "tenure", "Kind": "numeric"}],
        "preprocessing": ops,
        "target": "renewed",
        "data": {"columns": columns, "rows": rows},
    })
    assert trained.status_code == 200, trained.text
    body = trained.json()

    scored = client.post("/predict", json={
        "artifact_b64": body["artifact_b64"],
        "fitted_preprocessing": body["fitted_preprocessing"],
        "feature_schema": [{"Name": "engagement", "Kind": "numeric"}, {"Name": "tenure", "Kind": "numeric"}],
        "rows": [{"engagement": None, "tenure": 5.0}, {"engagement": 1.0, "tenure": 5.0}],
    })
    assert scored.status_code == 200, scored.text
    predictions = scored.json()["predictions"]
    assert predictions[0]["missingFeatures"] == ["engagement"]
    assert predictions[1]["missingFeatures"] is None


def test_preserving_missingness_for_an_intolerant_estimator_is_refused_up_front() -> None:
    """Say it at train time, in the operator's terms — not as a raw sklearn NaN error later.

    Left unguarded, the failure surfaces deep inside the fit, and only once some row actually
    happens to be missing something — potentially long after the model was promoted.
    """
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    columns = ["engagement", "tenure", "renewed"]
    rows = [[float(i % 3), float(i), "yes" if i % 2 else "no"] for i in range(20)]
    resp = client.post("/train", json={
        "algorithm": "logistic_regression",
        "problem_type": "classification",
        "hyperparameters": {},
        "validation": {"strategy": "none"},
        "feature_schema": [{"Name": "engagement", "Kind": "numeric"}, {"Name": "tenure", "Kind": "numeric"}],
        "preprocessing": [{"op": "present", "col": "engagement", "preserveMissing": True}],
        "target": "renewed",
        "data": {"columns": columns, "rows": rows},
    })
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "logistic_regression" in detail and "engagement" in detail
    assert "rubric" in detail  # names what WOULD work


def test_the_mask_alone_is_fine_for_any_estimator() -> None:
    """Emitting the mask without preserving missingness keeps every algorithm available."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    columns = ["engagement", "tenure", "renewed"]
    rows = [[float(i % 3), float(i), "yes" if i % 2 else "no"] for i in range(20)]
    resp = client.post("/train", json={
        "algorithm": "logistic_regression",
        "problem_type": "classification",
        "hyperparameters": {},
        "validation": {"strategy": "none"},
        "feature_schema": [{"Name": "engagement", "Kind": "numeric"}, {"Name": "tenure", "Kind": "numeric"}],
        "preprocessing": [{"op": "present", "col": "engagement"}],
        "target": "renewed",
        "data": {"columns": columns, "rows": rows},
    })
    assert resp.status_code == 200, resp.text
    assert "engagement__present" in resp.json()["fitted_preprocessing"]["output_columns"]
