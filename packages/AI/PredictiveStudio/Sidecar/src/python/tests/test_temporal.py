"""Rolling-origin design, per-origin baselines and MASE, Diebold-Mariano, ACF / Ljung-Box and the series models.

The pinned statistics are the truth suite's reference pipeline (`truthsuite.refpipe.scoring.hac_se`, `.panel_acf`,
`.diebold_mariano`, `.ljung_box`, `.acf`) run once on the same inputs; `truthsuite` is not installed in the sidecar's
venv, so the values are pinned here.
"""

from __future__ import annotations

import math
from typing import List, Tuple

import numpy as np
import pytest

from app import temporal as T
from app.array_types import FArr, IntArr


# ------------------------------------------------------------------ design ------------------------------------------

def test_rolling_origins_design() -> None:
    d = T.rolling_origins(240, 12, 12, 0, 13, "expanding")
    assert len(d) == 12 and [o.k for o in d] == list(range(1, 13))
    assert d[0].test[0] == 96 and d[-1].test[-1] == 239
    assert all(o.last_train == o.test[0] - 1 and o.first_train == 0 for o in d)
    assert all(len(o.test) == 12 for o in d)
    g = T.rolling_origins(240, 5, 12, 2, 13, "sliding")
    assert all(o.last_train == o.test[0] - 3 and o.last_train - o.first_train + 1 == 13 for o in g)
    with pytest.raises(ValueError, match="at least 5 origins"):
        T.rolling_origins(240, 4, 12, 0, 13, "expanding")


def test_rolling_origins_refuses_a_first_window_below_min_train() -> None:
    with pytest.raises(ValueError, match="origin 1 has 12 training periods, below minTrainPeriods 13"):
        T.rolling_origins(72, 5, 12, 0, 13, "expanding")
    with pytest.raises(ValueError, match="horizon"):
        T.rolling_origins(240, 5, 0, 0, 13, "expanding")
    with pytest.raises(ValueError, match="gap"):
        T.rolling_origins(240, 5, 12, -1, 13, "expanding")


# ------------------------------------------------------------------ baselines and scale -----------------------------

def test_seasonal_naive_and_scale_use_the_origin_window_only() -> None:
    y = np.arange(48, dtype=float) % 12 + np.repeat(np.arange(4), 12) * 10.0
    fc = T.seasonal_naive(y[:36], 12, 12)
    assert np.array_equal(fc, y[24:36])
    assert np.array_equal(T.seasonal_naive(y[:36], 15, 12)[12:], y[24:27])
    assert T.mase_scale(y[:36], 12) == pytest.approx(10.0)
    assert np.array_equal(T.naive_last(y[:36], 3), np.full(3, y[35]))
    assert np.array_equal(T.series_mean(y[:36], 2), np.full(2, float(np.mean(y[:36]))))


def test_baselines_and_scale_refuse_windows_they_cannot_use() -> None:
    with pytest.raises(ValueError, match="shorter than the seasonal period"):
        T.mase_scale(np.arange(12, dtype=float), 12)
    with pytest.raises(ValueError, match="seasonal-naive MAE is 0"):
        T.mase_scale(np.tile(np.arange(12, dtype=float), 3), 12)
    with pytest.raises(ValueError, match="shorter than the seasonal period"):
        T.seasonal_naive(np.arange(5, dtype=float), 3, 12)
    with pytest.raises(ValueError, match="empty"):
        T.naive_last(np.zeros(0), 3)
    with pytest.raises(ValueError, match="empty"):
        T.series_mean(np.zeros(0), 3)


def test_series_baseline_forecasts_through_the_window_functions() -> None:
    y = np.arange(30, dtype=float) ** 1.5
    t = np.arange(30, dtype=np.int64)
    future = np.arange(30, 37, dtype=np.int64)
    assert np.array_equal(T.SeriesBaseline("naive", 12).fit(y, t).forecast(future), T.naive_last(y, 7))
    assert np.array_equal(T.SeriesBaseline("seasonal-naive", 12).fit(y, t).forecast(future), T.seasonal_naive(y, 7, 12))
    assert np.array_equal(T.SeriesBaseline("mean", 12).fit(y, t).forecast(future), T.series_mean(y, 7))
    with pytest.raises(ValueError, match="not fitted"):
        T.SeriesBaseline("naive", 12).forecast(future)


# ------------------------------------------------------------------ autocorrelation ---------------------------------

def _hac_input() -> FArr:
    rng = np.random.default_rng(11)
    return np.asarray(np.convolve(rng.normal(size=62), [1.0, 0.6, 0.3], "valid"), dtype=np.float64)


def test_ljung_box_flags_ar1_not_white_noise() -> None:
    rng = np.random.default_rng(0)
    e = rng.normal(size=300)
    ar = np.empty(300)
    ar[0] = e[0]
    for i in range(1, 300):
        ar[i] = 0.7 * ar[i - 1] + e[i]
    assert T.ljung_box(ar, 10)[1] < 0.001
    assert T.ljung_box(e, 10)[1] > 0.05
    assert T.acf(ar, 1)[0] == pytest.approx(0.7, abs=0.1)


def test_ljung_box_sums_every_lag_not_only_the_first() -> None:
    """A series correlated at lag 2 only (lag 1 is about 0) must still be flagged."""
    rng = np.random.default_rng(4)
    u = rng.normal(size=402)
    x = u[2:] + 0.8 * u[:-2]
    assert abs(T.acf(x, 1)[0]) < 0.1
    assert T.ljung_box(x, 10)[1] < 0.001


def test_acf_and_ljung_box_match_refpipe() -> None:
    d = _hac_input()
    assert T.acf(d, 3).tolist() == pytest.approx([0.5399124740667781, 0.31463322385199405, 0.21205534414674748],
                                                 abs=1e-12)
    assert T.ljung_box(d, 5) == pytest.approx((29.708197091015045, 1.6832871681154365e-05), abs=1e-12)


def test_acf_and_ljung_box_refuse_inputs_they_cannot_compute() -> None:
    with pytest.raises(ValueError, match="constant"):
        T.acf(np.ones(20), 2)
    with pytest.raises(ValueError, match="at least 1 lag"):
        T.acf(np.arange(20, dtype=float), 0)
    with pytest.raises(ValueError, match="5 residuals for 5 lags"):
        T.ljung_box(np.arange(5, dtype=float), 5)


def _panel_input() -> Tuple[FArr, List[str], IntArr]:
    rng = np.random.default_rng(12)
    ent = ["a"] * 8 + ["b"] * 6 + ["c"] * 5
    order = np.concatenate([np.arange(8), np.arange(6), np.arange(5)]).astype(np.int64)
    e = rng.normal(size=19)
    for i in range(1, 19):
        if ent[i] == ent[i - 1]:
            e[i] += 0.5 * e[i - 1]
    perm = rng.permutation(19)
    return np.asarray(e[perm], dtype=np.float64), [ent[i] for i in perm], np.asarray(order[perm], dtype=np.int64)


def test_panel_acf_pools_within_entity_pairs_like_refpipe() -> None:
    e, g, o = _panel_input()
    rhos, pairs = T.panel_acf(e, g, o, 2)
    assert rhos == pytest.approx([0.40219819991686473, 0.01432200685720681], abs=1e-12)
    assert pairs == [16, 13]
    with pytest.raises(ValueError, match="no entity has more than 8 periods"):
        T.panel_acf(e, g, o, 8)
    with pytest.raises(ValueError, match="same length"):
        T.panel_acf(e, g[:-1], o, 2)


def test_hac_se_matches_refpipe() -> None:
    d = _hac_input()
    assert T.hac_se(d, 3) == pytest.approx(0.20362898686899128, abs=1e-12)
    assert T.hac_se(d, 0) == pytest.approx(0.13634386606488552, abs=1e-12)
    assert T.hac_se(d, 0) == pytest.approx(float(np.std(d) / math.sqrt(len(d))), abs=1e-12)
    with pytest.raises(ValueError, match="empty"):
        T.hac_se(np.zeros(0), 1)


# ------------------------------------------------------------------ Diebold-Mariano ---------------------------------

def test_diebold_mariano_sign_and_equal_losses() -> None:
    rng = np.random.default_rng(1)
    a = np.abs(rng.normal(size=120))
    assert T.diebold_mariano(a * 0.5, a, 1).statistic < 0
    assert np.isnan(T.diebold_mariano(a, a, 1).statistic)


def test_diebold_mariano_matches_refpipe() -> None:
    rng = np.random.default_rng(13)
    a = np.abs(rng.normal(size=48))
    b = np.abs(rng.normal(size=48)) + 0.3
    r = T.diebold_mariano(a, b, 3)
    assert (r.statistic, r.p_value, r.mean_diff) == pytest.approx(
        (-1.8266687920038616, 0.07410427267588796, -0.23803799958430216), abs=1e-12)
    assert r.n == 48
    with pytest.raises(ValueError, match="same length"):
        T.diebold_mariano(a, b[:-1], 3)
    with pytest.raises(ValueError, match="3 loss differentials for horizon 3"):
        T.diebold_mariano(a[:3], b[:3], 3)


# ------------------------------------------------------------------ series models -----------------------------------

def test_series_models_forecast_recursively_without_test_targets() -> None:
    t = np.arange(120, dtype=np.int64)
    y = 50 + 0.5 * t + 10 * np.sin(2 * np.pi * (t % 12) / 12)
    m = T.SeriesModel("trend_season_ols", 12, 0).fit(y[:108], t[:108])
    assert np.allclose(m.forecast(t[108:]), y[108:], atol=1e-6)
    lo, hi = m.interval(t[108:], 0.9)
    assert np.all(lo <= hi)


def _ar_series(n: int, seed: int) -> Tuple[FArr, IntArr]:
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.int64)
    y = np.empty(n)
    y[0] = 40.0
    for i in range(1, n):
        y[i] = 8.0 + 0.6 * y[i - 1] + 0.1 * t[i] + 3.0 * (t[i] % 12 == 5) + rng.normal()
    return np.asarray(y, dtype=np.float64), t


def _season_rows(t: IntArr, season: int, phase: int) -> FArr:
    month = (t + phase) % season
    cols = [np.ones(len(t)), t.astype(np.float64)] + [(month == m).astype(np.float64) for m in range(1, season)]
    return np.asarray(np.column_stack(cols), dtype=np.float64)


def test_ar_models_forecast_the_closed_form_recursion() -> None:
    """h steps ahead of the window's last value y_T: AR(1)+constant gives c * sum_{j<h} phi^j + phi^h * y_T, and
    trend+season+AR(1) gives sum_{j<h} phi^j * x_{T+h-j} b + phi^h * y_T, so every step past the first reads the
    model's own earlier forecasts, never a target. A gap before the first requested period is recursed through."""
    y, t = _ar_series(96, 2)
    last = 83
    future = np.arange(last + 1, last + 13, dtype=np.int64)
    ar = T.SeriesModel("ar1_const", 12, 0).fit(y[: last + 1], t[: last + 1])
    c, phi = float(ar.beta[0]), float(ar.beta[1])
    steps = np.arange(1, 13)
    closed = np.array([c * sum(phi ** j for j in range(h)) + phi ** h * y[last] for h in steps])
    assert np.allclose(ar.forecast(future), closed, rtol=0, atol=1e-9)
    assert np.allclose(ar.forecast(future[3:]), closed[3:], rtol=0, atol=1e-9)

    ts = T.SeriesModel("trend_season_ar1", 12, 3).fit(y[: last + 1], t[: last + 1])
    b, phi2 = ts.beta[:-1], float(ts.beta[-1])
    xb = _season_rows(future, 12, 3) @ b
    closed2 = np.array([sum(phi2 ** j * xb[h - 1 - j] for j in range(h)) + phi2 ** h * y[last] for h in steps])
    assert np.allclose(ts.forecast(future), closed2, rtol=0, atol=1e-9)
    assert np.allclose(ts.forecast(future[5:]), closed2[5:], rtol=0, atol=1e-9)


def test_ar_interval_widens_with_the_h_step_variance() -> None:
    y, t = _ar_series(96, 3)
    m = T.SeriesModel("ar1_const", 12, 0).fit(y[:84], t[:84])
    future = np.arange(84, 90, dtype=np.int64)
    lo, hi = m.interval(future, 0.9)
    phi = float(m.beta[1])
    z = 1.6448536269514722
    var = m.sigma2 * np.cumsum(phi ** (2 * np.arange(6)))
    assert np.allclose((hi - lo) / 2, z * np.sqrt(var), rtol=0, atol=1e-9)
    assert np.allclose((hi + lo) / 2, m.forecast(future), rtol=0, atol=1e-9)
    lo3, hi3 = m.interval(future[3:], 0.9)
    assert np.allclose(hi3 - lo3, (hi - lo)[3:], rtol=0, atol=1e-9)


def test_series_models_refuse_what_they_cannot_fit_or_forecast() -> None:
    y, t = _ar_series(40, 5)
    with pytest.raises(ValueError, match="trend_season_ols needs more than 13 periods, got 13"):
        T.SeriesModel("trend_season_ols", 12, 0).fit(y[:13], t[:13])
    with pytest.raises(ValueError, match="same length"):
        T.SeriesModel("ar1_const", 12, 0).fit(y[:20], t[:19])
    with pytest.raises(ValueError, match="not fitted"):
        T.SeriesModel("ar1_const", 12, 0).forecast(t[20:])
    m = T.SeriesModel("ar1_const", 12, 0).fit(y[:20], t[:20])
    with pytest.raises(ValueError, match="after the training window"):
        m.forecast(t[15:25])


def test_series_algo_narrows_a_driver_key() -> None:
    assert [T.series_algo(a) for a in T.SERIES_ALGOS] == list(T.SERIES_ALGOS)
    assert T.series_algo("lightgbm") is None


# ------------------------------------------------------------------ backtest ----------------------------------------

def test_backtest_scores_each_origin_against_its_own_window() -> None:
    y, _ = _ar_series(120, 6)
    design = T.rolling_origins(120, 5, 12, 1, 24, "sliding")
    seen: List[Tuple[int, int]] = []

    def forecaster(o: T.Origin) -> FArr:
        seen.append((o.first_train, o.last_train))
        return np.full(len(o.test), float(y[o.last_train]) + 1.0)

    scores = T.backtest(y, design, 12, forecaster)
    assert [s.k for s in scores] == [1, 2, 3, 4, 5]
    assert seen == [(o.first_train, o.last_train) for o in design]
    for s, o in zip(scores, design):
        window = y[o.first_train: o.last_train + 1]
        assert s.scale == pytest.approx(T.mase_scale(window, 12), abs=1e-12)
        assert np.array_equal(s.actual, y[list(o.test)])
        assert set(s.forecasts) == {"model", "mean", "naive", "seasonalNaive"}
        assert np.array_equal(s.forecasts["seasonalNaive"], T.seasonal_naive(window, 12, 12))
        assert np.array_equal(s.forecasts["mean"], T.series_mean(window, 12))
        for name, fc in s.forecasts.items():
            assert np.allclose(s.raw_errors[name], s.actual - fc, rtol=0, atol=0)
            assert np.allclose(s.scaled_errors[name], np.abs(s.actual - fc) / s.scale, rtol=0, atol=0)
            assert s.mase(name) == pytest.approx(float(np.mean(np.abs(s.actual - fc))) / s.scale, abs=1e-12)


def test_backtest_names_the_origin_it_cannot_score() -> None:
    y = np.concatenate([np.tile(np.arange(12, dtype=float), 8), np.arange(24, dtype=float)])
    design = T.rolling_origins(120, 5, 12, 0, 13, "sliding")
    with pytest.raises(ValueError, match="origin 1: .*seasonal-naive MAE is 0"):
        T.backtest(y, design, 12, lambda o: np.zeros(len(o.test)))
    y2, _ = _ar_series(120, 7)
    with pytest.raises(ValueError, match="origin 1: the forecaster returned 3 values for 12 test periods"):
        T.backtest(y2, design, 12, lambda o: np.zeros(3))
