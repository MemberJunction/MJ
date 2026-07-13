"""H3 — the validation metric must NOT leak the validation fold into the fitted
preprocessing.

Before the fix, ``/train`` fit preprocessing (standardize mean/std, etc.) on ALL
of the dev data and then split the already-transformed matrix for the validation
metric, so the validation fold contributed to the very statistics it was then
scored against — making ``metrics`` optimistically biased. The fix fits
preprocessing on the TRAIN fold only and APPLIES it to the validation fold.

These tests pin the corrected behavior at the function seam
(``_anti_skew_val_metrics``) so they are fast and deterministic — no FastAPI, no
real training of a heavy model.
"""

from __future__ import annotations

from unittest.mock import patch

import numpy as np

from app import main, preprocessing


def _build_dummy_estimator_factory(captured):
    """A `build()` factory whose estimator records the matrix it was fit on so the
    test can assert which rows' statistics drove the standardization."""

    class _Recorder:
        def fit(self, X, y):
            captured["X_fit"] = np.asarray(X, dtype=float)
            captured["y_fit"] = np.asarray(y)
            return self

        def predict(self, X):
            # constant prediction is fine — the test inspects the fitted matrix,
            # not the score value.
            return np.zeros(np.asarray(X).shape[0])

    return lambda: _Recorder()


def test_validation_preprocessing_fit_on_train_fold_only():
    """The validation fold's standardized values must use the TRAIN fold's
    mean/std — not the full-dev statistics — proving no val-fold leakage."""
    # A single standardized feature with a deliberate distribution difference
    # between the train and validation folds.
    columns = ["x", "label"]
    feature_cols = ["x"]
    ops_spec = [{"op": "standardize", "cols": ["x"]}]

    # 8 rows; we control the split by index below.
    dev_rows = [[float(v), 0] for v in [0, 0, 0, 0, 0, 0, 100, 100]]
    y_dev = np.array([0, 0, 0, 0, 0, 0, 1, 1])

    tr_idx = np.array([0, 1, 2, 3])  # all x == 0 → train mean 0, std degenerate→1
    te_idx = np.array([6, 7])        # x == 100 in the validation fold

    captured: dict = {}
    build = _build_dummy_estimator_factory(captured)

    # Build a minimal TrainRequest-like object with the fields _anti_skew_val_metrics reads.
    class _Req:
        problem_type = "classification"

    main._anti_skew_val_metrics(
        _Req(),
        dev_rows,
        columns,
        feature_cols,
        ops_spec,
        target_idx=1,
        tr_idx=tr_idx,
        te_idx=te_idx,
        y_dev=y_dev,
        is_classification=True,
        encoder=None,
        build=build,
    )

    # Train fold is all-zero x → mean 0, std degenerate → treated as 1.0. So the
    # validation row x==100 standardizes to (100 - 0) / 1 == 100. If preprocessing
    # had (wrongly) been fit on the full dev data, mean/std would shift and this
    # would NOT be ~100.
    val_fit_done = captured.get("X_fit")  # captured on the LAST fit = train fold fit
    # The estimator is fit on the TRAIN fold; assert it saw the train rows (x==0).
    assert val_fit_done is not None
    np.testing.assert_array_almost_equal(val_fit_done.ravel(), np.zeros(4), decimal=9)


def test_run_training_metrics_use_no_leakage_path():
    """End-to-end through _run_training: with a held-out validation split, the
    reported `metrics` come from the anti-skew helper (fit on the train fold)."""
    columns = ["x0", "x1", "label"]
    rows = [[float(i), float(i % 3), i % 2] for i in range(40)]

    class _Validation:
        strategy = "train_test_split"
        test_size = 0.25
        holdout_size = 0.0
        random_state = 42

    class _Req:
        problem_type = "classification"
        algorithm = "logistic_regression"
        hyperparameters: dict = {}
        target = "label"
        preprocessing: list = []
        feature_schema: list = []
        validation = _Validation()
        holdout = None

        class _Data:
            def __init__(self, columns, rows):
                self.columns = columns
                self.rows = rows

        data = _Data(columns, rows)

    called = {"anti_skew": 0}
    real = main._anti_skew_val_metrics

    def _spy(*args, **kwargs):
        called["anti_skew"] += 1
        return real(*args, **kwargs)

    with patch.object(main, "_anti_skew_val_metrics", _spy):
        result = main._run_training(_Req())

    assert called["anti_skew"] == 1
    assert isinstance(result["metrics"], dict)
    # The shipped estimator was re-fit on all dev data and is usable.
    assert result["estimator"] is not None
