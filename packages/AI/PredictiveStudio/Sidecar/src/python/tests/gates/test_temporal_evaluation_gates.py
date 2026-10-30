"""Temporal evaluation gates on planted truth: a forecast task is graded by a rolling-origin backtest whose every origin
trains only on periods before it, is scaled by that origin's own in-sample seasonal-naive error, and reproduces the
reference pipeline's series selection, MASE, interval and Diebold-Mariano statistic (T1p); a flexible learner on lag
columns is not shipped above the naive forecasts without evidence (T4). On an entity panel with a date-carved holdout
(T2p) the inner folds are blocked in time with a gap and grouped by entity, the random-row score on the same
validation rows is reported beside the blocked one, and the finalist's residual autocorrelation pooled within entities
is tested and flagged."""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import pytest

from app import folds as FO, snapshot as SN, trainer as TR
from app.trainer_schemas import ContinuousTask, EvaluationProtocol, TrainerCompleted, TrainerFailed
from tests.gates.conftest import completed, post
from tests.tools.trainer_fixture import (NUMERIC, FileServer, JsonObject, JsonValue, as_int, as_object, candidates,
                                         feature_schema_hash, protocol, refpipe_carve, request, scenario,
                                         scenario_manifest, snapshot_files)

SERIES: List[Tuple[str, str, JsonObject]] = [("ar1_const", "ar1_const", {}),
                                             ("trend_season_ols", "trend_season_ols", {}),
                                             ("trend_season_ar1", "trend_season_ar1", {})]
# The reference pipeline's T1p result (`truthsuite.refpipe.run.run_series`, measured in-process): the selected series
# model's MASE with its origin-block bootstrap interval and the Diebold-Mariano statistic against seasonal naive.
T1P_MASE = 0.4401059204
T1P_MASE_CI = (0.3645724719, 0.5401424002)
T1P_DM = -4.884688476
# Its gate comparisons (baseline loss minus model loss, origin-block bootstrap at the 0.95 lower-bound level) and the
# final origin's Ljung-Box p-value on 24 lags.
T1P_COMPARISONS: Dict[str, Tuple[float, float, float]] = {
    "modelVsDummy": (5.48883724, 4.539196624, 6.437445142),
    "naiveVsDummy": (4.73113388, 3.824182146, 5.675830905),
    "modelVs:naive": (0.7577033605, 0.4988533414, 0.975043519),
    "seasonalNaiveVsDummy": (5.018343788, 4.114872797, 5.916094214),
    "modelVs:seasonalNaive": (0.4704934523, 0.2617983955, 0.6603556942),
}
T1P_LJUNG_BOX_P = 0.9001658262
# The reference pipeline writes these with 10 significant digits: 1e-9 absolute below 1, 1e-8 for values up to 10.
REFERENCE_DIGITS = 1e-9
REFERENCE_DIGITS_UNITS = 1e-8
# The reference pipeline's T4 interval for its selected model's MASE (its AR(1) is statsmodels' ARIMA, the sidecar's
# is conditional least squares, so the point values differ in the third decimal: 0.6242 vs 0.6229).
T4_REFERENCE_CI = (0.4854, 0.7821)
# The reference pipeline's T2p result (`python -m truthsuite.refpipe.run T2p`): the shipped GLM's holdout RMSE, the
# random-row contrast on the 2,000 blocked validation rows, and the pooled within-entity residual autocorrelation of
# the selected GLM with its Box-Pierce statistic on 3 lags.
T2P_RMSE = 1.559098962
# The reference pipeline bootstraps T2p's holdout by row. The protocol declares the entity-cluster bootstrap; the
# holdout holds one row per entity, so clusters are rows drawn in another order and the interval stays within 0.001
# of the reference's (measured 1.51156 / 1.60871). Whole entities versus rows is pinned by the route tests.
T2P_RMSE_ROW_CI = (1.512303196, 1.608225373)
T2P_CI_TOLERANCE = 0.001
T2P_CONTRAST = (2000, 1.551750799, 1.552041614)
T2P_ACF = (0.7229736366, 0.5823661424, 0.5135602571)
T2P_BOX_PIERCE = 7271.405527
T2P_INNER: JsonObject = {"kind": "blocked-time", "folds": 5, "gapPeriods": 1, "groupKey": "EntityKey"}


def _rolling(sid: str) -> Dict[str, int]:
    ro = as_object(as_object(scenario_manifest(sid)["planted"], "planted")["rollingOrigin"], "rollingOrigin")
    return {k: as_int(ro[k], f"rollingOrigin.{k}") for k in ("K", "H", "firstTestPeriod")}


def _series_request(server: FileServer, sid: str, extra: Optional[List[Tuple[str, str, JsonObject]]] = None,
                    lag_cols: int = 0, holdout_shift: int = 0,
                    ljung_box_alpha: float = 0.05) -> Tuple[JsonObject, pd.DataFrame]:
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
                     residualDiagnostics={"acfLags": 24, "ljungBoxAlpha": ljung_box_alpha}, secondaryMetrics=["r2"])
    task: JsonObject = {"kind": "forecast", "valueKind": "continuous"}
    cands: List[JsonValue] = candidates("continuous", SERIES + (extra or []))
    tag = f"{sid}-{lag_cols}-{holdout_shift}-{ljung_box_alpha}"
    return request(server, m, n, task, proto, cands, tag=tag), df


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
    for name, (value, lower, upper) in T1P_COMPARISONS.items():
        got = r.comparisons[name]
        assert max(abs(got.value - value), abs(got.ci[0] - lower), abs(got.ci[1] - upper)) <= REFERENCE_DIGITS_UNITS, name
    assert abs(r.forecast.dieboldMarianoVsSeasonalNaive.statistic - T1P_DM) <= REFERENCE_DIGITS
    assert r.residualDiagnostics is not None and not r.residualDiagnostics.autocorrelationFlagged
    assert abs(r.residualDiagnostics.ljungBox.pValue - T1P_LJUNG_BOX_P) <= REFERENCE_DIGITS
    assert {a.candidate for a in r.artifacts} == {"trend_season_ar1", "naive", "seasonalNaive"}


@pytest.mark.covers("T1p -> S-T.2")
def test_T1p_S_T_2_the_veto_uses_the_protocols_ljung_box_alpha(server: FileServer) -> None:
    """At alpha 1e-30 the trend + season OLS model (pre-test Ljung-Box p about 5e-22) is no longer vetoed, and its
    lowest inner MASE makes it the finalist."""
    req, _ = _series_request(server, "T1p", ljung_box_alpha=1e-30)
    assert completed(req).finalist == "trend_season_ols"


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


def _t2p_files() -> Tuple[bytes, bytes]:
    """T2p's snapshot files with the reference pipeline's carve."""
    df = scenario("T2p")
    return snapshot_files(df, {"UsageZ": NUMERIC, "Discount": NUMERIC}, refpipe_carve(df))


def _t2p_protocol(inner: JsonObject = T2P_INNER) -> JsonObject:
    """Blocked-time inner folds grouped by entity, entity-cluster intervals and residual diagnostics on 3 lags."""
    return protocol("continuous", innerValidation=inner,
                    intervals={"level": 0.95, "method": "cluster-bootstrap", "resamples": 1000,
                               "pairedTest": "paired-bootstrap"},
                    residualDiagnostics={"acfLags": 3, "ljungBoxAlpha": 0.05})


def _t2p(server: FileServer, tag: str) -> TrainerCompleted:
    m, n = _t2p_files()
    return completed(request(server, m, n, {"kind": "continuous"}, _t2p_protocol(), candidates("continuous"), tag=tag))


def _shipped_rmse(r: TrainerCompleted) -> Tuple[float, float, float]:
    if r.gate.outcome == "model":
        p = r.holdout.primary
    else:
        p = next(b.holdout for b in r.baselines if b.baseline.kind == r.gate.shipped)
    return p.value, p.interval.lower, p.interval.upper


@pytest.mark.gate("T2p -> S-T.4")
def test_T2p_S_T_4_blocked_grouped_folds(server: FileServer) -> None:
    """Every inner fold shares no entity between training and validation and trains only on periods at least the gap
    before validation (at the protocol's gap of 1 and at a gap of 2, which removes a training year the trailing block
    alone does not); the shipped RMSE and the random-row contrast on the same rows are the reference pipeline's."""
    m, n = _t2p_files()
    snap = SN.parse_snapshot(m, n, feature_schema_hash(m))
    dev = np.flatnonzero(np.array(snap.roles) == "development").astype(np.int64)
    entities = [snap.entity_keys[int(i)] for i in dev]
    all_ordinals = SN.period_ordinals(snap)
    ordinals = all_ordinals[dev]
    enc = TR.encode_label(ContinuousTask(kind="continuous"), snap.label)
    for gap in (1, 2):
        proto = EvaluationProtocol.model_validate(_t2p_protocol({**T2P_INNER, "gapPeriods": gap}))
        folds = TR.build_folds(proto, snap, dev, enc, all_ordinals)
        assert len(folds) == 5
        for f in folds:
            assert FO.shared_groups(f, entities) == 0
            assert int(ordinals[f.train].max()) <= int(ordinals[f.valid].min()) - gap
    r = _t2p(server, "t2p-st4")
    value, lower, upper = _shipped_rmse(r)
    assert r.gate.outcome == "keep-simple-baseline" and r.gate.shipped == "glm"
    assert abs(value - T2P_RMSE) <= REFERENCE_DIGITS
    assert max(abs(lower - T2P_RMSE_ROW_CI[0]), abs(upper - T2P_RMSE_ROW_CI[1])) <= T2P_CI_TOLERANCE
    c = r.innerSplitContrast
    assert c is not None and c.rows == T2P_CONTRAST[0]
    assert abs(c.blockedGroupedScore - T2P_CONTRAST[1]) <= REFERENCE_DIGITS
    assert abs(c.randomRowScore - T2P_CONTRAST[2]) <= REFERENCE_DIGITS


@pytest.mark.gate("T2p -> S-T.6")
def test_T2p_S_T_6_ljung_box_flags_panel_not_T1p(server: FileServer) -> None:
    """The panel's pooled within-entity residual autocorrelation is the reference pipeline's and is flagged; the T1p
    series model's final-origin residuals are not."""
    r = _t2p(server, "t2p-st6")
    d = r.residualDiagnostics
    assert d is not None and d.autocorrelationFlagged and d.ljungBox.lags == 3
    assert max(abs(a - b) for a, b in zip(d.acf, T2P_ACF)) <= REFERENCE_DIGITS and len(d.acf) == 3
    assert abs(d.ljungBox.statistic - T2P_BOX_PIERCE) <= 1e-6 * T2P_BOX_PIERCE
    s, _ = _series(server, "T1p")
    assert s.residualDiagnostics is not None and not s.residualDiagnostics.autocorrelationFlagged
