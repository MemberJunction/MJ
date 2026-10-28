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
    """Declared levels beyond the cap share one `<col>_other` column; a value outside the declared levels is all
    zeros."""
    levels = tuple(f"PC{i}" for i in range(400))
    cols = [E.ColumnSpec("pc", "pc", E.CategoricalEncoding(20, "onehot"), levels=levels)]
    X = pd.DataFrame({"pc": [f"PC{i % 400}" for i in range(4000)]})
    pre = E.build_preprocessor(cols, "binary", 0).fit(X, np.zeros(4000))
    names = list(pre.get_feature_names_out())
    assert len(names) == 20
    assert names[-1] == "pc_other"
    kept = sorted(levels)[0]
    beyond = sorted(levels)[-1]
    out = pre.transform(pd.DataFrame({"pc": [kept, beyond, "never-declared"]}))
    assert out[0][names.index(f"pc_{kept}")] == 1.0
    assert out[1][names.index("pc_other")] == 1.0
    assert out[2].sum() == 0.0


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


def test_a_fold_whose_training_rows_are_all_missing_keeps_the_column_width() -> None:
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric")), E.ColumnSpec("z", "z", E.NumericEncoding("numeric"))]
    train = E.normalize(cols, pd.DataFrame({"x": [np.nan, None, np.nan, np.nan], "z": [1.0, 2.0, 3.0, 4.0]}))
    pre = E.build_preprocessor(cols, "binary", 0).fit(train, np.array([0, 1, 0, 1]))
    out = pre.transform(E.normalize(cols, pd.DataFrame({"x": [5.0, None], "z": [1.0, 2.0]})))
    assert list(pre.get_feature_names_out()) == ["x", "x__missing", "z", "z__missing"]
    assert out.shape == (2, 4)
    assert [row[1] for row in out] == [0.0, 1.0]


def test_folds_with_disjoint_training_levels_produce_the_same_columns() -> None:
    levels = ("a", "b", "c", "d", E.MISSING_TOKEN)
    cols = [E.ColumnSpec("c", "c", E.CategoricalEncoding(10, "onehot"), levels=levels)]
    first = E.build_preprocessor(cols, "binary", 0).fit(pd.DataFrame({"c": ["a", "b", "a"]}), np.array([0, 1, 0]))
    second = E.build_preprocessor(cols, "binary", 0).fit(pd.DataFrame({"c": ["c", "d", None]}), np.array([0, 1, 0]))
    assert list(first.get_feature_names_out()) == list(second.get_feature_names_out())
    # The declared levels in sorted order: the missing token's leading underscore sorts before lowercase letters.
    assert list(first.get_feature_names_out()) == [f"c_{E.MISSING_TOKEN}", "c_a", "c_b", "c_c", "c_d"]


def test_a_categorical_one_hot_column_without_declared_levels_is_refused() -> None:
    cols = [E.ColumnSpec("c", "c", E.CategoricalEncoding(10, "onehot"))]
    with pytest.raises(ValueError, match="declared levels"):
        E.build_preprocessor(cols, "binary", 0)


def test_a_declared_mean_impute_fills_with_the_fold_mean() -> None:
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric"), E.MissingPolicy("mean", None, False))]
    train = pd.DataFrame({"x": [1.0, 2.0, 9.0, np.nan]})
    pre = E.build_preprocessor(cols, "binary", 0).fit(train, np.array([0, 1, 0, 1]))
    imputer = pre.named_transformers_["num:x"].named_steps["impute"]
    assert imputer.statistics_[0] == pytest.approx(4.0)
    assert list(pre.get_feature_names_out()) == ["x"]


def test_a_declared_mode_impute_fills_with_the_fold_mode() -> None:
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric"), E.MissingPolicy("mode", None, True))]
    train = pd.DataFrame({"x": [3.0, 3.0, 1.0, np.nan]})
    pre = E.build_preprocessor(cols, "binary", 0).fit(train, np.array([0, 1, 0, 1]))
    imputer = pre.named_transformers_["num:x"].named_steps["impute"]
    assert imputer.statistics_[0] == pytest.approx(3.0)


def test_hashed_output_width_is_the_bucket_count() -> None:
    cols = [E.ColumnSpec("h", "h", E.CategoricalEncoding(8, "hashed"))]
    X = pd.DataFrame({"h": [f"H{i}" for i in range(50)]})
    out = E.build_preprocessor(cols, "binary", 0).fit_transform(X, np.zeros(50))
    assert out.shape == (50, 8)
    assert (out.sum(axis=1) == 1.0).all()


def test_target_in_fold_produces_one_column_for_a_binary_target() -> None:
    cols = [E.ColumnSpec("t", "t", E.CategoricalEncoding(4, "target-in-fold"))]
    X = pd.DataFrame({"t": [f"T{i % 4}" for i in range(40)]})
    out = E.build_preprocessor(cols, "binary", 0).fit_transform(X, np.array([i % 2 for i in range(40)]))
    assert out.shape == (40, 1)


def test_source_map_groups_feature_columns_by_source_and_skips_identifiers() -> None:
    cols = [E.ColumnSpec("id", "id", E.IdentifierEncoding("exclude")),
            E.ColumnSpec("Amount_sum_90d", "Amount", E.NumericEncoding("numeric")),
            E.ColumnSpec("Amount_max_90d", "Amount", E.NumericEncoding("numeric")),
            E.ColumnSpec("city", "city", E.CategoricalEncoding(4, "hashed"))]
    assert E.source_map(cols) == {"Amount": ["Amount_sum_90d", "Amount_max_90d"], "city": ["city"]}


def test_normalize_refuses_non_numeric_text_in_a_numeric_column() -> None:
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric"))]
    with pytest.raises(E.NonNumericValueError, match="'x'"):
        E.normalize(cols, pd.DataFrame({"x": [1.0, "abc"]}))


@pytest.mark.parametrize("text", ["inf", "nan", "1e400"])
def test_normalize_refuses_non_finite_text_in_a_numeric_column(text: str) -> None:
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric"))]
    with pytest.raises(E.NonNumericValueError, match="'x'"):
        E.normalize(cols, pd.DataFrame({"x": [1.0, text]}))


def test_the_cap_one_hot_encodes_every_level_the_assembler_kept_plus_its_other_level() -> None:
    """A product snapshot declares at most cap kept levels plus `__other`; none of them is folded a second time."""
    cols = [E.ColumnSpec("c", "c", E.CategoricalEncoding(3, "onehot"), levels=("a", "b", "c", "__other"))]
    X = pd.DataFrame({"c": ["a", "b", "c", "__other"]})
    pre = E.build_preprocessor(cols, "binary", 0).fit(X, np.array([0, 1, 0, 1]))
    assert list(pre.get_feature_names_out()) == ["c___other", "c_a", "c_b", "c_c"]


def test_declared_levels_beyond_cap_plus_one_share_the_overflow_column() -> None:
    """Only fixture data declares more than cap + 1 levels: the first cap - 1 sorted levels keep their columns."""
    cols = [E.ColumnSpec("c", "c", E.CategoricalEncoding(3, "onehot"), levels=("f", "e", "d", "c", "b", "a"))]
    X = pd.DataFrame({"c": ["a", "b", "c", "d", "e", "f"]})
    pre = E.build_preprocessor(cols, "binary", 0).fit(X, np.zeros(6))
    assert list(pre.get_feature_names_out()) == ["c_a", "c_b", "c_other"]
    assert pre.transform(pd.DataFrame({"c": ["f"]}))[0].tolist() == [0.0, 0.0, 1.0]


def test_the_missing_token_never_counts_toward_the_cap() -> None:
    """The assembler caps non-missing levels only, so a missing token beside cap kept levels and `__other` folds
    nothing."""
    levels = ("a", "b", "c", "__other", E.MISSING_TOKEN)
    cols = [E.ColumnSpec("c", "c", E.CategoricalEncoding(3, "onehot"), levels=levels)]
    pre = E.build_preprocessor(cols, "binary", 0).fit(pd.DataFrame({"c": ["a", None]}), np.array([0, 1]))
    assert list(pre.get_feature_names_out()) == ["c___missing__", "c___other", "c_a", "c_b", "c_c"]
