"""Typed column encoding: every statistic a fit learns comes from that fit's training rows, high-cardinality
categoricals stay bounded, identifiers never reach the matrix and a column's declared impute policy is honoured."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app import encoding as E


def test_preprocessing_is_fit_on_the_training_fold_only() -> None:
    """A fold's scaler and imputer statistics come from that fold's training rows alone."""
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric"))]
    X = pd.DataFrame({"x": [0.0, 0.0, 0.0, 0.0, 100.0, 100.0]})
    pre = E.build_preprocessor(cols, "binary", 0).fit(X.iloc[:4], np.array([0, 1, 0, 1]))
    scaled = pre.transform(X.iloc[4:])
    assert scaled[0][0] == pytest.approx(100.0)  # train mean 0, degenerate std -> 1


def test_cardinality_cap_bounds_onehot_width() -> None:
    cols = [E.ColumnSpec("pc", "pc", E.CategoricalEncoding(20, "onehot"))]
    X = pd.DataFrame({"pc": [f"PC{i % 400}" for i in range(4000)]})
    out = E.build_preprocessor(cols, "binary", 0).fit_transform(X, np.zeros(4000))
    assert out.shape[1] <= 20


def test_identifier_columns_are_excluded() -> None:
    cols = [E.ColumnSpec("id", "id", E.IdentifierEncoding("exclude")),
            E.ColumnSpec("x", "x", E.NumericEncoding("numeric"))]
    assert E.used_columns(cols) == ["x"]


def test_a_declared_constant_impute_fills_with_its_value_and_flags_the_row() -> None:
    """A column declared `constant` with fill value 7 is filled with 7 on the fold, not the fold's median, and its
    `<col>__missing` indicator marks the filled row."""
    policy = E.MissingPolicy("constant", 7.0, True)
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric"), policy)]
    train = E.normalize(cols, pd.DataFrame({"x": [1.0, 2.0, np.nan, 3.0]}))
    pre = E.build_preprocessor(cols, "binary", 0).fit(train, np.array([0, 1, 0, 1]))
    # The fold's statistics include the filled 7: mean 3.25 over [1, 2, 7, 3].
    filled = np.array([1.0, 2.0, 7.0, 3.0])
    scored = pre.transform(E.normalize(cols, pd.DataFrame({"x": [None, 4.0]})))
    assert list(pre.get_feature_names_out()) == ["x", "x__missing"]
    assert scored[0][0] == pytest.approx((7.0 - filled.mean()) / filled.std())
    assert [row[1] for row in scored] == [1.0, 0.0]
