"""Golden anti-skew tests: an identical raw row must produce an identical
transformed vector at TRAIN time (fit_transform) and PREDICT time (transform).

This is the correctness backbone (plan §6.2): preprocessing is fit once on
training data and ONLY applied at inference. If fit and apply ever diverge,
these tests fail.
"""

from __future__ import annotations

import numpy as np

from app import preprocessing


def _training_frame():
    # columns include numeric (age, income), categorical (city), and target
    columns = ["age", "income", "city", "score", "label"]
    rows = [
        [25, 50000, "NY", 1.0, 1],
        [40, 80000, "SF", 2.0, 0],
        [None, 60000, "NY", 3.0, 1],   # missing age -> imputed
        [55, None, "LA", 4.0, 0],      # missing income -> imputed
        [33, 72000, "SF", 5.0, 1],
        [29, 51000, "LA", 6.0, 0],
    ]
    feature_cols = ["age", "income", "city", "score"]
    return columns, rows, feature_cols


def _ops():
    return [
        {"op": "impute", "col": "age", "strategy": "mean"},
        {"op": "impute", "col": "income", "strategy": "median"},
        {"op": "standardize", "cols": ["age", "income"]},
        {"op": "onehot", "col": "city"},
        {"op": "bin", "col": "score", "bins": 3},
    ]


def test_golden_train_predict_identity():
    """The transformed vector for a raw row is identical at train and predict."""
    columns, rows, feature_cols = _training_frame()
    ops = _ops()

    train_matrix, output_columns, fitted = preprocessing.fit_transform(
        columns, rows, ops, feature_cols
    )

    # Re-apply the FROZEN fitted params to the same raw rows via the predict path.
    predict_rows = [
        {"age": r[0], "income": r[1], "city": r[2], "score": r[3]} for r in rows
    ]
    predict_matrix = preprocessing.transform(predict_rows, fitted, feature_cols)

    assert train_matrix.shape == predict_matrix.shape
    # bit-for-bit identical: fit-once / apply-everywhere must not drift
    np.testing.assert_array_almost_equal(train_matrix, predict_matrix, decimal=12)


def test_predict_never_refits_with_new_data():
    """Predict on UNSEEN rows must use the frozen training params, not re-fit.

    If transform secretly re-fit standardization on the predict batch, a single
    constant-valued predict row would standardize to 0; instead it must use the
    TRAINING mean/std, yielding a non-zero standardized value.
    """
    columns, rows, feature_cols = _training_frame()
    fitted = preprocessing.fit_transform(columns, rows, _ops(), feature_cols)[2]

    # one unseen row whose age differs from the training mean
    unseen = [{"age": 100, "income": 90000, "city": "NY", "score": 2.5}]
    vec = preprocessing.transform(unseen, fitted, feature_cols)

    age_idx = fitted["output_columns"].index("age")
    age_stats = next(o for o in fitted["ops"] if o["op"] == "standardize")["stats"]["age"]
    expected = (100 - age_stats["mean"]) / age_stats["std"]
    assert abs(vec[0][age_idx] - expected) < 1e-9
    assert abs(vec[0][age_idx]) > 0.1  # would be ~0 if it had (wrongly) re-fit


def test_onehot_vocabulary_frozen():
    """An unseen category at predict time maps to all-zero indicators (no new column)."""
    columns, rows, feature_cols = _training_frame()
    fitted = preprocessing.fit_transform(columns, rows, _ops(), feature_cols)[2]

    vocab = next(o for o in fitted["ops"] if o["op"] == "onehot")["vocabulary"]
    assert vocab == ["LA", "NY", "SF"]

    unseen = [{"age": 30, "income": 60000, "city": "CHICAGO", "score": 3.0}]
    vec = preprocessing.transform(unseen, fitted, feature_cols)

    # all city indicators must be 0 for the unseen category — and no extra column
    city_cols = [c for c in fitted["output_columns"] if c.startswith("city=")]
    assert set(city_cols) == {"city=LA", "city=NY", "city=SF"}
    for c in city_cols:
        assert vec[0][fitted["output_columns"].index(c)] == 0.0


def test_impute_fill_values_frozen():
    """Imputation fill values are learned at train and reused verbatim at predict."""
    columns, rows, feature_cols = _training_frame()
    fitted = preprocessing.fit_transform(columns, rows, _ops(), feature_cols)[2]

    age_fill = next(
        o for o in fitted["ops"] if o["op"] == "impute" and o["col"] == "age"
    )["fill"]
    # training mean of [25,40,55,33,29] = 36.4
    assert abs(age_fill - 36.4) < 1e-6

    # a missing-age predict row should standardize using the SAME fill + stats
    missing = [{"age": None, "income": 60000, "city": "NY", "score": 3.0}]
    present = [{"age": age_fill, "income": 60000, "city": "NY", "score": 3.0}]
    v_missing = preprocessing.transform(missing, fitted, feature_cols)
    v_present = preprocessing.transform(present, fitted, feature_cols)
    np.testing.assert_array_almost_equal(v_missing, v_present, decimal=12)


def _bin_edges(fitted, col):
    """Pull the fitted bin edges for a column out of the fitted-ops payload."""
    for op in fitted["ops"]:
        if op.get("op") == "bin" and op.get("col") == col:
            return op["edges"]
    raise AssertionError(f"no fitted bin op for column {col!r}")


def test_bin_count_honors_configured_bins():
    """C1 — the configured ``bins`` count must drive the number of bin edges, NOT
    the hard-coded default of 4. A quantile binning into N bins produces N+1 edges
    (on distinct data). With score = 1..6 and bins=3 we expect 4 edges."""
    columns = ["score", "label"]
    rows = [[1.0, 1], [2.0, 0], [3.0, 1], [4.0, 0], [5.0, 1], [6.0, 0]]
    feature_cols = ["score"]

    _, _, fitted3 = preprocessing.fit_transform(
        columns, rows, [{"op": "bin", "col": "score", "bins": 3}], feature_cols
    )
    assert len(_bin_edges(fitted3, "score")) == 4  # 3 bins -> 4 edges

    # A different configured count must change the edge count (proves it isn't fixed at 4).
    _, _, fitted2 = preprocessing.fit_transform(
        columns, rows, [{"op": "bin", "col": "score", "bins": 2}], feature_cols
    )
    assert len(_bin_edges(fitted2, "score")) == 3  # 2 bins -> 3 edges

    # Omitting bins falls back to the documented default of 4 bins -> 5 edges.
    _, _, fitted_default = preprocessing.fit_transform(
        columns, rows, [{"op": "bin", "col": "score"}], feature_cols
    )
    assert len(_bin_edges(fitted_default, "score")) == 5  # default 4 bins -> 5 edges


def test_output_column_order_stable():
    """Output column order is deterministic: onehot indicators then passthrough."""
    columns, rows, feature_cols = _training_frame()
    _, output_columns, fitted = preprocessing.fit_transform(
        columns, rows, _ops(), feature_cols
    )
    assert output_columns == fitted["output_columns"]
    # onehot city indicators come first (in op order), then numeric passthrough
    assert output_columns[:3] == ["city=LA", "city=NY", "city=SF"]
    assert set(output_columns[3:]) == {"age", "income", "score"}
