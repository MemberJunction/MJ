"""Forecast sidecar tests.

The refusal + mapping logic is the part that must be right without a GPU, a download, or a
network, so it is tested directly. The one test that needs real weights is marked and skipped
when they are not present, rather than silently passing.
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import forecaster  # noqa: E402
from app.forecaster import QUANTILE_LEVELS, _refusal, _to_quantile_grid  # noqa: E402


def seasonal(n: int = 120) -> list:
    return [10 + 5 * math.sin(i / 6.0) + 0.03 * i for i in range(n)]


class TestRefusal:
    """A foundation model answers anything; deciding what NOT to ask it is this service's job."""

    def test_accepts_a_long_varying_series(self):
        assert _refusal(seasonal(), 32) is None

    def test_refuses_below_the_input_patch(self):
        reason = _refusal([1.0] * 31, 32)
        assert reason is not None and "31 points" in reason

    def test_boundary_is_inclusive(self):
        # Exactly the minimum is fine; the gate is "below", not "at or below".
        varied = [float(i) for i in range(32)]
        assert _refusal(varied, 32) is None

    def test_refuses_a_constant_series(self):
        # A constant series yields a tight band around the constant — confident and meaningless.
        assert "constant" in (_refusal([7.0] * 60, 32) or "")

    def test_refuses_non_finite_values(self):
        bad = seasonal()
        bad[10] = float("nan")
        assert "non-finite" in (_refusal(bad, 32) or "")


class TestQuantileMapping:
    """2.5 returns ten columns with the MEAN at index 0; 3.0 returns nine quantiles."""

    def test_strips_the_leading_mean_column_from_the_ten_column_shape(self):
        # Column 0 is the mean. Taking the block verbatim would label it p10 and shift every
        # level by one — a silent, plausible-looking corruption of the whole band.
        block = np.tile(np.arange(10, dtype=float), (3, 1))
        grid = _to_quantile_grid(block)
        assert len(grid[0]) == len(QUANTILE_LEVELS)
        assert grid[0][0] == 1.0  # p10 is column 1, not the mean at column 0

    def test_passes_the_nine_column_shape_through(self):
        block = np.tile(np.arange(9, dtype=float), (3, 1))
        assert _to_quantile_grid(block)[0][0] == 0.0

    def test_rejects_an_unexpected_width(self):
        with pytest.raises(forecaster.ForecastUnavailable):
            _to_quantile_grid(np.zeros((3, 5)))


class TestLicensing:
    """The 3.0 weights are non-commercial; that fact must travel with the forecast."""

    def test_default_checkpoint_is_the_production_licensed_one(self):
        assert forecaster.CHECKPOINTS[forecaster.DEFAULT_CHECKPOINT]["production_licensed"] is True

    def test_three_zero_is_marked_non_production(self):
        assert forecaster.CHECKPOINTS["timesfm-3.0-200m"]["production_licensed"] is False


class TestBatchShape:
    """Refused series keep their slot, so results align with inputs by position AND by key."""

    def test_refused_series_are_still_returned_in_order(self):
        results, _ = forecaster.forecast_batch([("a", [1.0, 2.0]), ("b", [3.0] * 40)], horizon=4)
        assert [r["Key"] for r in results] == ["a", "b"]
        assert all(r["Refused"] for r in results)  # too short, then constant
        assert all(r["Median"] is None for r in results)

    def test_rejects_a_nonsense_horizon(self):
        with pytest.raises(forecaster.ForecastUnavailable):
            forecaster.forecast_batch([("a", seasonal())], horizon=0)


@pytest.mark.skipif(not forecaster.model_available(), reason="timesfm not installed")
class TestLiveModel:
    """Needs real weights. Asserts the forecast is USABLE, not merely well-shaped."""

    def test_forecasts_a_seasonal_series_close_to_its_true_continuation(self):
        n = 120
        horizon = 6
        results, licensed = forecaster.forecast_batch([("s", seasonal(n))], horizon=horizon)
        assert licensed is True
        r = results[0]
        assert r["Refused"] is None
        assert len(r["Median"]) == horizon
        assert len(r["Quantiles"]) == horizon
        assert len(r["Quantiles"][0]) == len(QUANTILE_LEVELS)
        # Quantiles must not cross — fix_quantile_crossing is enabled precisely for this.
        for step in r["Quantiles"]:
            assert step == sorted(step)
        # The generating function is known, so the forecast can be checked against truth rather
        # than merely against itself.
        truth = [10 + 5 * math.sin(i / 6.0) + 0.03 * i for i in range(n, n + horizon)]
        assert abs(r["Median"][0] - truth[0]) < 1.5
