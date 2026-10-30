"""Temporal evaluation gates on planted truth: a forecast task is graded by a rolling-origin backtest whose every origin
trains only on periods before it, is scaled by that origin's own in-sample seasonal-naive error, and reproduces the
reference pipeline's series selection, MASE, interval and Diebold-Mariano statistic (T1p); a flexible learner on lag
columns is not shipped above the naive forecasts without evidence (T4)."""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import pytest

from app.trainer_schemas import TrainerCompleted, TrainerFailed
from tests.gates.conftest import completed, post
from tests.tools.trainer_fixture import (NUMERIC, FileServer, JsonObject, JsonValue, as_int, as_object, candidates,
                                         protocol, request, scenario, scenario_manifest, snapshot_files)

SERIES: List[Tuple[str, str, JsonObject]] = [("ar1_const", "ar1_const", {}),
                                             ("trend_season_ols", "trend_season_ols", {}),
                                             ("trend_season_ar1", "trend_season_ar1", {})]
# The reference pipeline's T1p result (`truthsuite.refpipe.run.run_series`, measured in-process): the selected series
# model's MASE with its origin-block bootstrap interval and the Diebold-Mariano statistic against seasonal naive.
T1P_MASE = 0.4401059204
T1P_MASE_CI = (0.3645724719, 0.5401424002)
T1P_DM = -4.884688476
# The reference pipeline writes these with 10 significant digits.
REFERENCE_DIGITS = 1e-9
# The reference pipeline's T4 interval for its selected model's MASE (its AR(1) is statsmodels' ARIMA, the sidecar's
# is conditional least squares, so the point values differ in the third decimal: 0.6242 vs 0.6229).
T4_REFERENCE_CI = (0.4854, 0.7821)


def _rolling(sid: str) -> Dict[str, int]:
    ro = as_object(as_object(scenario_manifest(sid)["planted"], "planted")["rollingOrigin"], "rollingOrigin")
    return {k: as_int(ro[k], f"rollingOrigin.{k}") for k in ("K", "H", "firstTestPeriod")}


def _series_request(server: FileServer, sid: str, extra: Optional[List[Tuple[str, str, JsonObject]]] = None,
                    lag_cols: int = 0, holdout_shift: int = 0) -> Tuple[JsonObject, pd.DataFrame]:
    """The forecast request for one planted series; `holdout_shift` moves the manifest's locked-holdout rows off the
    protocol's design (a manifest the trainer must refuse). Lag columns start at the horizon, so no column reads a
    target inside the forecast window."""
    ro = _rolling(sid)
    df = scenario(sid).sort_values("T").reset_index(drop=True)
    df["Period"] = df["T"]
    feats: Dict[str, JsonObject] = {}
    for k in range(ro["H"], ro["H"] + lag_cols):
        df[f"lag{k}"] = df["Target"].shift(k)
        feats[f"lag{k}"] = NUMERIC
    hold = [str(i) for i in df["ID"].iloc[ro["firstTestPeriod"] + holdout_shift:]]
    m, n = snapshot_files(df, feats, hold, period_col="Period",
                          decision={"action": "plan", "actorRole": "ops", "capacityPerPeriod": None, "period": "month"})
    holdout: JsonObject = {"kind": "rolling-origin", "origins": ro["K"], "horizonPeriods": ro["H"], "gapPeriods": 0,
                           "minTrainPeriods": 13, "window": "expanding"}
    proto = protocol("forecast", holdout=holdout,
                     innerValidation={"kind": "blocked-time", "folds": 3, "gapPeriods": ro["H"], "groupKey": None},
                     residualDiagnostics={"acfLags": 24, "ljungBoxAlpha": 0.05}, secondaryMetrics=["r2"])
    task: JsonObject = {"kind": "forecast", "valueKind": "continuous"}
    cands: List[JsonValue] = candidates("continuous", SERIES + (extra or []))
    return request(server, m, n, task, proto, cands, tag=f"{sid}-{lag_cols}-{holdout_shift}"), df


def _series(server: FileServer, sid: str, extra: Optional[List[Tuple[str, str, JsonObject]]] = None,
            lag_cols: int = 0) -> Tuple[TrainerCompleted, pd.DataFrame]:
    req, df = _series_request(server, sid, extra, lag_cols)
    return completed(req), df


def _first_ordinal(df: pd.DataFrame) -> int:
    t = pd.to_datetime(df["T"].iloc[0])
    return int(t.year) * 12 + int(t.month) - 1


@pytest.mark.covers("T1p -> S-T.2")
def test_T1p_S_T_2_manifest_disagreeing_with_the_design_is_refused(server: FileServer) -> None:
    """Locked-holdout rows that are not the rolling-origin design's test periods end `failed` at load-snapshot."""
    req, _ = _series_request(server, "T1p", holdout_shift=1)
    status, body = post("/trainer", req)
    assert status == 200, body
    r = TrainerFailed.model_validate(body)
    assert r.stage == "load-snapshot" and "rolling-origin design" in r.message


@pytest.mark.gate("T1p -> S-T.2")
def test_T1p_S_T_2_rolling_origin_mase(server: FileServer) -> None:
    r, _ = _series(server, "T1p")
    ro = _rolling("T1p")
    assert r.forecast is not None and len(r.forecast.origins) == ro["K"] >= 5
    assert all(len(o.testPeriods) == ro["H"] for o in r.forecast.origins)
    assert r.finalist == "trend_season_ar1" and r.gate.outcome == "model"
    p = r.holdout.primary
    assert p.metric == "mase" and abs(p.value - T1P_MASE) <= REFERENCE_DIGITS
    assert abs(p.interval.lower - T1P_MASE_CI[0]) <= REFERENCE_DIGITS
    assert abs(p.interval.upper - T1P_MASE_CI[1]) <= REFERENCE_DIGITS
    assert r.comparisons["modelVs:seasonalNaive"].ci[0] > 0
    assert abs(r.forecast.dieboldMarianoVsSeasonalNaive.statistic - T1P_DM) <= REFERENCE_DIGITS
    assert r.residualDiagnostics is not None and not r.residualDiagnostics.autocorrelationFlagged
    assert {a.candidate for a in r.artifacts} == {"trend_season_ar1", "naive", "seasonalNaive"}


@pytest.mark.gate("T1p -> S-T.3")
def test_T1p_S_T_3_seasonal_naive_per_origin_is_exact(server: FileServer) -> None:
    """Every origin's seasonal-naive MASE equals an independent computation from that origin's training window."""
    r, df = _series(server, "T1p")
    assert r.forecast is not None
    y = df["Target"].to_numpy(float)
    first = _first_ordinal(df)
    for o in r.forecast.origins:
        tr = y[: o.testPeriods[0] - first]
        scale = float(np.mean(np.abs(tr[12:] - tr[:-12])))
        fc = np.array([tr[-12:][i % 12] for i in range(len(o.testPeriods))])
        idx = [p - first for p in o.testPeriods]
        expected = float(np.mean(np.abs(y[idx] - fc)) / scale)
        assert abs(o.scale - scale) <= 1e-9
        assert abs(o.mase["seasonalNaive"] - expected) <= 1e-9


@pytest.mark.gate("T4 -> S-T.3")
def test_T4_S_T_3_lightgbm_not_above_naive_without_evidence(server: FileServer) -> None:
    r, _ = _series(server, "T4", extra=[("lightgbm", "lightgbm", {"n_estimators": 200})], lag_cols=12)
    if r.gate.outcome == "model" and r.finalist == "lightgbm":
        assert r.comparisons["modelVs:naive"].ci[0] > 0
    if r.gate.outcome == "model":
        shipped = r.holdout.primary.value
    else:
        kind = "seasonal-naive" if r.gate.shipped == "seasonalNaive" else r.gate.shipped
        shipped = next(b.holdout.value for b in r.baselines if b.baseline.kind == kind)
    assert T4_REFERENCE_CI[0] <= shipped <= T4_REFERENCE_CI[1]
