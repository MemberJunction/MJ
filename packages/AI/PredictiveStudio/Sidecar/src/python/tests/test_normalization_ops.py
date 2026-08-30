"""Golden tests for the Sonar-ported normalization ops (fit-once/apply-everywhere)."""

from __future__ import annotations

import pytest

from app import preprocessing


def _roundtrip(op: dict, columns, rows, feature_cols, predict_rows):
    """fit_transform on training rows, then transform predict rows with the frozen params."""
    matrix, out_cols, fitted = preprocessing.fit_transform(columns, rows, [op], feature_cols)
    applied = preprocessing.transform(predict_rows, fitted, feature_cols)
    return matrix, out_cols, fitted, applied


def test_minmax_rescales_and_freezes_training_range() -> None:
    op = {"op": "minmax", "col": "v"}
    matrix, _, fitted, applied = _roundtrip(op, ["v"], [[10.0], [20.0], [30.0]], ["v"], [{"v": 25.0}, {"v": 999.0}])
    assert matrix[:, 0] == pytest.approx([0.0, 0.5, 1.0])
    assert applied[0, 0] == pytest.approx(0.75)
    assert applied[1, 0] == pytest.approx(1.0)  # clamped to the FROZEN training range


def test_minmax_higher_is_worse_inverts() -> None:
    op = {"op": "minmax", "col": "days_since", "higherIsBetter": False}
    matrix, _, _, _ = _roundtrip(op, ["days_since"], [[0.0], [100.0]], ["days_since"], [{"days_since": 0.0}])
    assert matrix[:, 0] == pytest.approx([1.0, 0.0])  # long silence = bad


def test_minmax_output_range_scales() -> None:
    op = {"op": "minmax", "col": "v", "outputMin": 10.0, "outputMax": 20.0}
    matrix, _, _, _ = _roundtrip(op, ["v"], [[0.0], [1.0]], ["v"], [{"v": 0.0}])
    assert matrix[:, 0] == pytest.approx([10.0, 20.0])


def test_percentile_uses_midpoint_rank_for_ties() -> None:
    op = {"op": "percentile", "col": "v"}
    rows = [[1.0], [2.0], [2.0], [3.0]]
    matrix, _, _, applied = _roundtrip(op, ["v"], rows, ["v"], [{"v": 2.0}])
    # value 2.0: 1 below, 2 equal → (1 + 2/2)/4 = 0.5 — Sonar's midpoint tie handling
    assert applied[0, 0] == pytest.approx(0.5)
    assert matrix[0, 0] == pytest.approx(0.125)  # (0 + 1/2)/4


def test_zscore_clamps_at_three_sigma() -> None:
    op = {"op": "zscore", "col": "v"}
    rows = [[float(v)] for v in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]]
    _, _, _, applied = _roundtrip(op, ["v"], rows, ["v"], [{"v": 1000.0}, {"v": -1000.0}])
    assert applied[0, 0] == pytest.approx(1.0)  # clamped +3σ → top of [0,1]
    assert applied[1, 0] == pytest.approx(0.0)


def test_logistic_curve_is_stateless_and_parameterized() -> None:
    op = {"op": "logistic", "col": "v", "params": {"midpoint": 5.0, "steepness": 2.0}}
    _, _, fitted, applied = _roundtrip(op, ["v"], [[0.0]], ["v"], [{"v": 5.0}, {"v": 100.0}])
    assert applied[0, 0] == pytest.approx(0.5)
    assert applied[1, 0] == pytest.approx(1.0, abs=1e-6)
    assert fitted["ops"][0]["params"] == {"midpoint": 5.0, "steepness": 2.0}  # nothing was fit


def test_banded_maps_ranges_to_fractions() -> None:
    op = {"op": "banded", "col": "v", "params": {"bands": [
        {"min": 0, "max": 10, "value": 0.2}, {"min": 10, "max": 100, "value": 0.9}], "fallback": 0.0}}
    _, _, _, applied = _roundtrip(op, ["v"], [[1.0]], ["v"], [{"v": 5.0}, {"v": 50.0}, {"v": -3.0}])
    assert applied[:, 0].tolist() == pytest.approx([0.2, 0.9, 0.0])


def test_lookup_exact_match_with_fallback() -> None:
    op = {"op": "lookup", "col": "tier", "params": {"table": {"gold": 1.0, "silver": 0.6}, "fallback": 0.1}}
    _, _, _, applied = _roundtrip(op, ["tier"], [["gold"]], ["tier"], [{"tier": "silver"}, {"tier": "unknown"}])
    assert applied[:, 0].tolist() == pytest.approx([0.6, 0.1])


def test_fit_then_apply_equals_apply_on_the_same_row() -> None:
    """The anti-skew invariant: train-time transform == predict-time transform, per op."""
    for op in (
        {"op": "minmax", "col": "v"},
        {"op": "percentile", "col": "v"},
        {"op": "zscore", "col": "v"},
        {"op": "logistic", "col": "v", "params": {"midpoint": 2.0, "steepness": 1.0}},
        {"op": "banded", "col": "v", "params": {"bands": [{"min": 0, "max": 10, "value": 0.5}], "fallback": 0.0}},
    ):
        rows = [[1.0], [2.0], [3.0], [4.0]]
        matrix, _, fitted, applied = _roundtrip(op, ["v"], rows, ["v"], [{"v": 2.0}])
        assert applied[0, 0] == pytest.approx(matrix[1, 0]), op["op"]
