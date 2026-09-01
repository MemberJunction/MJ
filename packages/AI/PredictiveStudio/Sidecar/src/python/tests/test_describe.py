"""The ``/describe`` statistics pre-pass — measurement correctness + the honest-holdout rule.

These tests pin what the agent's architecture decision will rest on. The recurring theme is
that an ABSENT measurement must never read as a measured zero: a constant column has no
association, a multiclass target has no single scalar AUC, an all-null numeric column has no
mean — each returns ``None``, and the caller can tell "we didn't measure" from "we measured 0".
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _matrix(columns, rows):
    return {"columns": columns, "rows": rows}


def _post(payload, expect=200):
    r = client.post("/describe", json=payload)
    assert r.status_code == expect, r.text
    return r.json()


def _feature(body, name):
    found = [f for f in body["features"] if f["name"] == name]
    assert found, f"no feature '{name}' in {[f['name'] for f in body['features']]}"
    return found[0]


# ---------------------------------------------------------------------------
# Classification: the shape a churn/renewal plan actually has
# ---------------------------------------------------------------------------


def _imbalanced_classification(n=200, minority=0.05, seed=7):
    """`signal` separates the classes cleanly; `noise` doesn't; `row_id` is an identifier."""
    rng = np.random.default_rng(seed)
    n_pos = int(n * minority)
    labels = ["yes"] * n_pos + ["no"] * (n - n_pos)
    signal = list(rng.normal(3.0, 0.5, n_pos)) + list(rng.normal(0.0, 0.5, n - n_pos))
    noise = list(rng.normal(0.0, 1.0, n))
    rows = [[signal[i], noise[i], f"id-{i}", labels[i]] for i in range(n)]
    return _matrix(["signal", "noise", "row_id", "Renewed"], rows)


CLASSIFICATION_SCHEMA = [
    {"Name": "signal", "Kind": "numeric"},
    {"Name": "noise", "Kind": "numeric"},
    {"Name": "row_id", "Kind": "categorical"},
]


def test_reports_class_balance_so_accuracy_cannot_mislead():
    body = _post(
        {
            "problem_type": "classification",
            "feature_schema": CLASSIFICATION_SCHEMA,
            "target": "Renewed",
            "data": _imbalanced_classification(minority=0.05),
        }
    )
    classes = body["target"]["classes"]
    assert [c["value"] for c in classes] == ["no", "yes"], "classes must be ordered by count, descending"
    counts = {c["value"]: c["count"] for c in classes}
    assert counts["yes"] == 10 and counts["no"] == 190
    assert body["target"]["labeled_row_count"] == 200
    assert body["row_count"] == 200 and body["feature_count"] == 3


def test_association_separates_a_real_signal_from_noise():
    body = _post(
        {
            "problem_type": "classification",
            "feature_schema": CLASSIFICATION_SCHEMA,
            "target": "Renewed",
            "data": _imbalanced_classification(),
        }
    )
    signal = _feature(body, "signal")["target_association"]
    noise = _feature(body, "noise")["target_association"]
    assert signal > 0.95, f"a cleanly separating feature should have near-perfect AUC, got {signal}"
    assert noise < 0.7, f"pure noise should sit near 0.5, got {noise}"
    # AUC is FOLDED — a perfectly inverted feature is exactly as informative.
    assert 0.5 <= noise <= 1.0 and 0.5 <= signal <= 1.0


def test_an_inverted_feature_is_as_informative_as_an_aligned_one():
    base = _imbalanced_classification(seed=11)
    flipped = _matrix(base["columns"], [[-r[0], r[1], r[2], r[3]] for r in base["rows"]])
    a = _post({"problem_type": "classification", "feature_schema": CLASSIFICATION_SCHEMA, "target": "Renewed", "data": base})
    b = _post({"problem_type": "classification", "feature_schema": CLASSIFICATION_SCHEMA, "target": "Renewed", "data": flipped})
    assert _feature(a, "signal")["target_association"] == pytest.approx(
        _feature(b, "signal")["target_association"], abs=1e-6
    )


def test_identifier_columns_are_measurable_as_such():
    body = _post(
        {
            "problem_type": "classification",
            "feature_schema": CLASSIFICATION_SCHEMA,
            "target": "Renewed",
            "data": _imbalanced_classification(n=50),
        }
    )
    row_id = _feature(body, "row_id")
    # 50 rows, 50 distinct values — the ratio the `id-like` hint reads.
    assert row_id["distinct_count"] == 50
    assert row_id["missing_fraction"] == 0.0
    assert row_id["top_values"] is not None and len(row_id["top_values"]) <= 20


def test_multiclass_returns_no_scalar_auc_rather_than_a_wrong_one():
    rows = [[float(i % 3), f"class-{i % 3}"] for i in range(60)]
    body = _post(
        {
            "problem_type": "classification",
            "feature_schema": [{"Name": "x", "Kind": "numeric"}],
            "target": "Cls",
            "data": _matrix(["x", "Cls"], rows),
        }
    )
    x = _feature(body, "x")
    assert x["target_association"] is None, "a 3-class target has no single comparable AUC"
    # …but mutual information still carries the (very strong) signal.
    assert x["mutual_information"] is not None and x["mutual_information"] > 0.5


# ---------------------------------------------------------------------------
# Regression
# ---------------------------------------------------------------------------


def test_regression_reports_absolute_correlation_and_target_moments():
    rows = [[float(i), float(-i) * 2.0, float(i) + 1.0] for i in range(100)]
    body = _post(
        {
            "problem_type": "regression",
            "feature_schema": [{"Name": "up", "Kind": "numeric"}, {"Name": "down", "Kind": "numeric"}],
            "target": "y",
            "data": _matrix(["up", "down", "y"], rows),
        }
    )
    assert _feature(body, "up")["target_association"] == pytest.approx(1.0, abs=1e-6)
    # Perfect NEGATIVE correlation is equally strong — the measure is |r|.
    assert _feature(body, "down")["target_association"] == pytest.approx(1.0, abs=1e-6)
    numeric = body["target"]["numeric"]
    assert numeric["min"] == 1.0 and numeric["max"] == 100.0
    assert numeric["quartiles"][1] == pytest.approx(50.5)


def test_numeric_summary_includes_skewness_for_a_skewed_column():
    rows = [[float(v), float(v)] for v in ([1.0] * 90 + [100.0] * 10)]
    body = _post(
        {
            "problem_type": "regression",
            "feature_schema": [{"Name": "skewed", "Kind": "numeric"}],
            "target": "y",
            "data": _matrix(["skewed", "y"], rows),
        }
    )
    assert _feature(body, "skewed")["numeric"]["skewness"] > 1.0


# ---------------------------------------------------------------------------
# Degenerate columns: absent ≠ zero
# ---------------------------------------------------------------------------


def test_a_constant_column_has_no_association_rather_than_zero():
    rows = [[1.0, float(i)] for i in range(40)]
    body = _post(
        {
            "problem_type": "regression",
            "feature_schema": [{"Name": "flat", "Kind": "numeric"}],
            "target": "y",
            "data": _matrix(["flat", "y"], rows),
        }
    )
    flat = _feature(body, "flat")
    assert flat["distinct_count"] == 1
    assert flat["target_association"] is None, "a constant column has no correlation, not a correlation of 0"
    assert flat["numeric"]["std"] == 0.0


def test_missing_fraction_and_a_fully_null_numeric_column_warn():
    rows = [[None, None, float(i)] for i in range(20)]
    for i in range(10):
        rows[i][0] = float(i)
    body = _post(
        {
            "problem_type": "regression",
            "feature_schema": [{"Name": "half", "Kind": "numeric"}, {"Name": "empty", "Kind": "numeric"}],
            "target": "y",
            "data": _matrix(["half", "empty", "y"], rows),
        }
    )
    assert _feature(body, "half")["missing_fraction"] == pytest.approx(0.5)
    empty = _feature(body, "empty")
    assert empty["missing_fraction"] == 1.0
    assert empty["numeric"] is None and empty["target_association"] is None
    assert any("empty" in w for w in body["warnings"]), body["warnings"]


def test_a_schema_column_absent_from_the_data_warns_instead_of_failing():
    rows = [[1.0, 2.0] for _ in range(10)]
    body = _post(
        {
            "problem_type": "regression",
            "feature_schema": [{"Name": "x", "Kind": "numeric"}, {"Name": "ghost", "Kind": "numeric"}],
            "target": "y",
            "data": _matrix(["x", "y"], rows),
        }
    )
    assert body["feature_count"] == 1
    assert any("ghost" in w for w in body["warnings"]), body["warnings"]


# ---------------------------------------------------------------------------
# Correlations (opt-in)
# ---------------------------------------------------------------------------


def test_correlations_are_opt_in_and_key_pairs_in_schema_order():
    rows = [[float(i), float(i) * 2.0 + 1.0, float(i % 7)] for i in range(50)]
    payload = {
        "problem_type": "regression",
        "feature_schema": [
            {"Name": "a", "Kind": "numeric"},
            {"Name": "b", "Kind": "numeric"},
        ],
        "target": "y",
        "data": _matrix(["a", "b", "y"], rows),
    }
    assert _post(payload)["correlations"] is None, "correlations must be opt-in (they are O(n^2))"

    payload["include_correlations"] = True
    corr = _post(payload)["correlations"]
    assert corr == {"a|b": pytest.approx(1.0, abs=1e-6)}


# ---------------------------------------------------------------------------
# Caller errors surface as 400, not as an opaque numeric failure
# ---------------------------------------------------------------------------


def test_missing_target_column_is_a_400():
    body = _post(
        {
            "problem_type": "regression",
            "feature_schema": [{"Name": "x", "Kind": "numeric"}],
            "target": "not_here",
            "data": _matrix(["x", "y"], [[1.0, 2.0]]),
        },
        expect=400,
    )
    assert "not_here" in body["detail"]


def test_empty_matrix_is_a_400():
    _post(
        {
            "problem_type": "regression",
            "feature_schema": [],
            "target": "y",
            "data": _matrix(["y"], []),
        },
        expect=400,
    )


def test_describe_fits_nothing_and_returns_no_artifact():
    body = _post(
        {
            "problem_type": "classification",
            "feature_schema": CLASSIFICATION_SCHEMA,
            "target": "Renewed",
            "data": _imbalanced_classification(n=40),
        }
    )
    # The pre-pass is read-only by contract: no artifact, no fitted state, nothing cached.
    assert "artifact_b64" not in body and "fitted_preprocessing" not in body
    assert body["duration_sec"] >= 0
