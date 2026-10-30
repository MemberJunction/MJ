"""POST /trainer end to end: one holdout access, baselines fitted on development rows, paired comparisons, the gate,
calibration, artifacts, the incumbent diff, failures and refusals; and POST /predict on a v2 artifact."""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import math
from collections.abc import Callable
from typing import NoReturn, ParamSpec, TypeVar

import numpy as np
import pandas as pd
import pytest

from app import artifacts, artifacts_v2, calibration as CAL, evaluation as EV, forecast as FC, snapshot as SN
from app import temporal as T, trainer as TR
from app.baselines import NIL_UUID
from app.encoding import ColumnSpec, NumericEncoding
from app.failures import RunClock, TrainerFailure
from app.trainer_schemas import CandidateSpec, EvaluationProtocol, TrainerCompleted, TrainerFailed, TrainerRequest

from fastapi.testclient import TestClient

from app.main import app
from tests.tools.trainer_fixture import (
    NUMERIC,
    DriverSpec,
    FileServer,
    JsonObject,
    JsonValue,
    candidates,
    protocol,
    request,
    snapshot_files,
)
from tests.tools.trainer_scaffold import FEATS, TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

client = TestClient(app)
LABELS = {0: "no", 1: "yes"}
DECISION: JsonObject = {"action": "call", "actorRole": "rep", "capacityPerPeriod": 50, "period": "year"}
LOGISTIC_ONLY: list[DriverSpec] = [("glm_candidate", "logistic_regression", {})]
# A deep, fast-learning booster: overconfident out of fold, so its calibration map lowers the log loss and is applied.
OVERCONFIDENT: list[DriverSpec] = [("xgb_deep", "xgboost", {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.3})]
MULTICLASS_TASK: JsonObject = {"kind": "multiclass", "classOrder": ["a", "b", "c"], "adverseIndices": [2]}
MULTICLASS_LABELS = {0: "a", 1: "b", 2: "c"}
P = ParamSpec("P")
R = TypeVar("R")


def _obj(value: JsonValue) -> JsonObject:
    assert isinstance(value, dict)
    return value


def _list(value: JsonValue) -> list[JsonValue]:
    assert isinstance(value, list)
    return value


def _holdout_2024(df: pd.DataFrame) -> list[str]:
    return [str(i) for i, t in zip(df["ID"], df["T"]) if str(t).startswith("2024")]


def _request(server: FileServer, df: pd.DataFrame, feats: dict[str, JsonObject] = FEATS, tag: str = "snap",
             drivers: list[DriverSpec] | None = None, task: JsonObject = TASK,
             **proto_over: JsonValue) -> JsonObject:
    m, n = snapshot_files(df, feats, _holdout_2024(df), label_map=LABELS, slice_cols={"City": "city"},
                          decision=DECISION)
    proto = protocol("binary", slices={"outOfTime": True, "subgroups": ["City"]}, **proto_over)
    return request(server, m, n, task, proto, candidates("binary", drivers), tag=tag)


def _multiclass_request(server: FileServer, df: pd.DataFrame, tag: str) -> JsonObject:
    m, n = snapshot_files(df, FEATS, _holdout_2024(df), label_map=MULTICLASS_LABELS)
    return request(server, m, n, MULTICLASS_TASK, protocol("multiclass"), candidates("multiclass", LOGISTIC_ONLY),
                   tag=tag)


def _three_classes(df: pd.DataFrame) -> pd.DataFrame:
    """`df` with a three-class label driven by x2."""
    noisy = df["x2"].to_numpy() + np.random.default_rng(17).normal(scale=0.5, size=len(df))
    return df.assign(Target=np.digitize(noisy, [-0.5, 0.5]))


def _completed(req: JsonObject) -> TrainerCompleted:
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 200, resp.text
    return TrainerCompleted.model_validate(resp.json())


def _failed(req: JsonObject) -> TrainerFailed:
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 200, resp.text
    return TrainerFailed.model_validate(resp.json())


def test_trainer_route_returns_a_complete_result(server: FileServer) -> None:
    r = _completed(_request(server, binary_frame()))
    assert r.holdoutAccess.count == 1 and r.holdoutAccess.finalist == r.finalist
    assert {s.candidate for s in r.innerScores} == {"glm_candidate", "lgbm", "xgb"}
    assert all(s.optimistic for s in r.innerScores)
    assert r.holdout.primary.metric == "log-loss"
    assert r.holdout.primary.interval.lower <= r.holdout.primary.value <= r.holdout.primary.interval.upper
    assert {m.metric for m in r.holdout.secondary} == {"auc", "accuracy", "brier"}
    assert [b.role for b in r.baselines] == ["dummy", "simple", "simple"]
    assert {"modelVsDummy", "glmVsDummy", "oneFeatureVsDummy", "modelVs:glm", "modelVs:oneFeature"} <= set(r.comparisons)
    assert r.gate.outcome in ("model", "keep-simple-baseline")
    assert {a.candidate for a in r.artifacts} == {r.finalist, "oneFeature", "glm"}
    shipped = [a for a in r.artifacts if a.candidate == r.gate.shipped]
    assert len(shipped) == 1 and shipped[0].classOrder == ["no", "yes"]
    raw = base64.b64decode(shipped[0].bytesBase64)
    assert hashlib.sha256(raw).hexdigest() == shipped[0].sha256
    assert {s.slice.kind for s in r.slices} == {"subgroup", "out-of-time"}
    assert r.operatingPoint is not None and 0 <= r.operatingPoint.baseRate <= 1
    assert r.calibration is not None and len(r.calibration.reliability) == 10
    assert r.computeSeconds > 0 and r.cost.computeSeconds == r.computeSeconds
    assert {"python", "numpy", "scikit-learn", "xgboost", "lightgbm"} <= set(r.codeVersion.libraryVersions)


def test_baselines_are_fitted_on_development_rows_only(server: FileServer) -> None:
    """The dummy's holdout log loss is the one of the development rows' base rate, not of every row's."""
    df = binary_frame()
    r = _completed(_request(server, df))
    hold = df["T"].str.startswith("2024").to_numpy()
    y = df["Target"].to_numpy(dtype=np.float64)
    dev_rate, all_rate = float(np.mean(y[~hold])), float(np.mean(y))
    assert abs(dev_rate - all_rate) > 1e-4

    def log_loss(rate: float) -> float:
        yh = y[hold]
        return float(np.mean(-(yh * np.log(rate) + (1 - yh) * np.log(1 - rate))))

    dummy = next(b for b in r.baselines if b.role == "dummy")
    assert dummy.holdout.value == pytest.approx(log_loss(dev_rate), abs=1e-12)
    assert abs(dummy.holdout.value - log_loss(all_rate)) > 1e-9


def test_a_logistic_finalist_on_logistic_data_ships_uncalibrated(server: FileServer) -> None:
    """The map is applied only when its cross-fit lowers the score; a well-specified logistic model is not helped,
    so the report names the declared method rather than a fitted one."""
    r = _completed(_request(server, binary_frame(), drivers=LOGISTIC_ONLY))
    assert r.calibration is not None and r.calibration.method == "auto"


def test_shipped_v2_artifact_predicts_through_the_restricted_loader(server: FileServer) -> None:
    r = _completed(_request(server, binary_frame()))
    art = next(a for a in r.artifacts if a.candidate == r.gate.shipped)
    predictor, env = artifacts.load_v2_envelope(base64.b64decode(art.bytesBase64))
    assert env.classOrder == ["no", "yes"]
    X = pd.DataFrame({"x1": [0.1, -2.0], "x2": [0.0, 1.0], "city": ["SF", None]})
    p = predictor.predict(X)
    assert p.shape == (2,) and bool(np.all((p > 0) & (p < 1)))


def test_predict_returns_the_class_vector_of_a_v2_artifact(server: FileServer) -> None:
    r = _completed(_request(server, binary_frame()))
    art = next(a for a in r.artifacts if a.candidate == r.finalist)
    rows: list[dict[str, str | float | None]] = [{"x1": 0.1, "x2": 0.0, "city": "SF"}, {"x1": -2.0, "x2": 1.0, "city": None}]
    resp = client.post("/predict", json={"artifact_b64": art.bytesBase64, "rows": rows})
    assert resp.status_code == 200, resp.text
    body = _obj(resp.json())
    assert body["classOrder"] == ["no", "yes"]
    preds = [_obj(p) for p in _list(body["predictions"])]
    assert len(preds) == 2
    for p in preds:
        probs = [float(v) for v in _list(p["probabilities"]) if isinstance(v, (int, float))]
        assert len(probs) == 2 and sum(probs) == pytest.approx(1.0)
        assert p["score"] == pytest.approx(probs[1])
        assert p["class"] == ["no", "yes"][int(np.argmax(probs))]


def test_predict_refuses_a_v2_artifact_whose_payload_is_not_allowed() -> None:
    envelope = {"format": "ps-predictor/v2", "version": 2, "payload_b64": base64.b64encode(b"not a pickle").decode(),
                "featureColumns": [], "taskKind": "binary", "classOrder": ["no", "yes"],
                "featureSchemaHash": "0" * 64, "driverBaseline": None, "transformedColumns": None}
    b64 = base64.b64encode(json.dumps(envelope).encode("utf-8")).decode("ascii")
    resp = client.post("/predict", json={"artifact_b64": b64, "rows": [{"x1": 1.0}]})
    assert resp.status_code == 400 and "could not be decoded" in resp.json()["detail"]


def test_noise_ends_no_signal(server: FileServer) -> None:
    r = _completed(_request(server, binary_frame(noise=True)))
    assert r.gate.outcome == "no-signal" and r.gate.shipped is None


def test_cross_family_request_is_400_before_any_fit(server: FileServer) -> None:
    req = _request(server, binary_frame(200))
    _obj(req["protocol"])["primaryScore"] = {"family": "continuous", "metric": "rmse"}
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 400 and "ranking across families" in resp.json()["detail"]


def _seed_differs(req: JsonObject) -> None:
    seed = req["seed"]
    assert isinstance(seed, int)
    req["seed"] = seed + 1


def _duplicate_name(req: JsonObject) -> None:
    cands = _list(req["candidates"])
    cands.append(dict(_obj(cands[0])))


def _reserved_name(req: JsonObject) -> None:
    _obj(_list(req["candidates"])[0])["name"] = "dummy"


def _heuristic_prefix(req: JsonObject) -> None:
    _obj(_list(req["candidates"])[0])["name"] = "heuristic:renewal-score"


def _baseline_only_driver(req: JsonObject) -> None:
    _obj(_list(req["candidates"])[0])["driverKey"] = "poisson_glm"


def _rolling_origin_on_a_tabular_task(req: JsonObject) -> None:
    _obj(req["protocol"])["holdout"] = {"kind": "rolling-origin", "origins": 5, "horizonPeriods": 1, "gapPeriods": 0,
                                        "minTrainPeriods": 1, "window": "expanding"}


@pytest.mark.parametrize("mutate", [_seed_differs, _duplicate_name, _reserved_name, _heuristic_prefix,
                                    _baseline_only_driver, _rolling_origin_on_a_tabular_task])
def test_an_invalid_request_is_400_before_any_fit(server: FileServer, mutate: Callable[[JsonObject], None]) -> None:
    """Each request rule (seed, unique names, reserved gate-member names, baseline-only drivers, a holdout that fits
    the task) answers 400 with nothing fitted."""
    req = _request(server, binary_frame(200))
    mutate(req)
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 400, resp.text


def test_failure_returns_stage_and_no_metrics(server: FileServer) -> None:
    req = _request(server, binary_frame(300))
    _obj(_obj(req["snapshot"])["rowManifest"])["sha256"] = "1" * 64
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 200
    r = TrainerFailed.model_validate(resp.json())
    assert r.stage == "load-snapshot" and r.computeSeconds >= 0
    assert set(_obj(resp.json())) == {"status", "trainingRunId", "stage", "message", "computeSeconds"}


def test_too_many_candidates_is_budget_exceeded(server: FileServer) -> None:
    req = _request(server, binary_frame(300))
    _obj(_obj(req["protocol"])["budgets"])["maxCandidates"] = 2
    assert _failed(req).stage == "budget-exceeded"


def test_one_grouping_unit_cannot_cross_fit_calibration_and_fails_the_holdout_stage(server: FileServer) -> None:
    """Every row in one entity leaves nothing to split the calibration cross-fit on: `failed`, never a 500."""
    df = binary_frame(400).assign(EntityKey="e0")
    r = _failed(_request(server, df, drivers=LOGISTIC_ONLY))
    assert r.stage == "holdout" and "groups" in r.message


def _incumbent(server: FileServer, art_b64: str) -> JsonObject:
    return {"modelId": "00000000-0000-0000-0000-000000000099",
            "artifact": server.publish("incumbent.json", base64.b64decode(art_b64), "00000000-0000-0000-0000-000000000098")}


def test_incumbent_diff_compares_on_the_same_rows(server: FileServer) -> None:
    """The shipped artifact of one run, offered as the incumbent of the next, gives a paired diff of 0."""
    df = binary_frame()
    first = _completed(_request(server, df))
    art = next(a for a in first.artifacts if a.candidate == first.gate.shipped)
    req = _request(server, df)
    req["incumbent"] = _incumbent(server, art.bytesBase64)
    second = _completed(req)
    assert second.incumbentDiff is not None
    assert second.incumbentDiff.incumbentModelId == "00000000-0000-0000-0000-000000000099"
    assert abs(second.incumbentDiff.value) < 1e-12 and second.incumbentDiff.lower <= 0 <= second.incumbentDiff.upper


def test_an_incumbent_needing_columns_the_snapshot_lacks_fails_the_holdout_stage(server: FileServer) -> None:
    """An incumbent is compared only on the same rows and columns: one that needs a column absent from this snapshot
    is refused, never scored on a narrower frame."""
    df = binary_frame()
    wider = df.assign(x3=np.random.default_rng(5).normal(size=len(df)))
    first = _completed(_request(server, wider, {**FEATS, "x3": NUMERIC}, tag="wide"))
    art = next(a for a in first.artifacts if a.candidate == first.finalist)
    req = _request(server, df)
    req["incumbent"] = _incumbent(server, art.bytesBase64)
    r = _failed(req)
    assert r.stage == "holdout" and "x3" in r.message


# ---------------------------------------------------------------- numbers undefined on the holdout rows never 500 ---

def test_an_undefined_secondary_metric_is_left_out_and_the_run_completes(server: FileServer) -> None:
    """On noise nothing scores >= 0.5, so precision is undefined: it is omitted and the gate still reports no-signal."""
    r = _completed(_request(server, binary_frame(noise=True), secondaryMetrics=["precision"]))
    assert r.gate.outcome == "no-signal"
    assert "precision" not in {m.metric for m in r.holdout.secondary}


def test_a_binary_holdout_without_a_declared_class_fails_the_holdout_stage(server: FileServer) -> None:
    df = binary_frame()
    df.loc[df["T"].str.startswith("2024"), "Target"] = 0
    r = _failed(_request(server, df))
    assert r.stage == "holdout" and "'yes'" in r.message


def test_a_multiclass_holdout_without_a_declared_class_fails_the_holdout_stage(server: FileServer) -> None:
    df = _three_classes(binary_frame())
    hold = df["T"].str.startswith("2024")
    df.loc[hold, "Target"] = np.minimum(df.loc[hold, "Target"], 1)
    r = _failed(_multiclass_request(server, df, "mc-hold"))
    assert r.stage == "holdout" and "'c'" in r.message


def test_an_undefined_calibration_fit_reports_no_calibration(server: FileServer) -> None:
    """Constant holdout predictions leave the calibration slope undefined: no calibration report, never NaN."""
    df = binary_frame()
    hold = df["T"].str.startswith("2024")
    df.loc[hold, ["x1", "x2"]] = 0.0
    df.loc[hold, "city"] = "LA"
    r = _completed(_request(server, df, drivers=LOGISTIC_ONLY))
    assert r.calibration is None


def test_any_other_non_finite_number_fails_the_holdout_stage_naming_its_field(server: FileServer) -> None:
    r = _completed(_request(server, binary_frame(), drivers=LOGISTIC_ONLY))
    assert EV.refuse_non_finite(r) is r
    holdout = r.holdout.model_copy(update={"primary": r.holdout.primary.model_copy(update={"value": math.nan})})
    with pytest.raises(TrainerFailure) as e:
        EV.refuse_non_finite(r.model_copy(update={"holdout": holdout}))
    assert e.value.stage == "holdout" and "result.holdout.primary.value" in e.value.message


def test_a_calibration_map_that_cannot_be_fitted_fails_the_holdout_stage(server: FileServer) -> None:
    """A multiclass task whose rows never hold one declared class: the per-class map has nothing to fit."""
    df = binary_frame().assign(Target=lambda d: (d["x2"] > 0).astype(int))
    r = _failed(_multiclass_request(server, df, "mc-two"))
    assert r.stage == "holdout" and "calibration map" in r.message


# ------------------------------------------------------------------------------------------------ the incumbent ---

def test_an_incumbent_of_another_class_order_fails_the_holdout_stage(server: FileServer) -> None:
    """The same model under a flipped class order would be scored against the other class: refused, not diffed."""
    df = binary_frame()
    first = _completed(_request(server, df))
    art = next(a for a in first.artifacts if a.candidate == first.gate.shipped)
    req = _request(server, df, task={"kind": "binary", "classOrder": ["yes", "no"], "adverseIndex": 1})
    req["incumbent"] = _incumbent(server, art.bytesBase64)
    r = _failed(req)
    assert r.stage == "holdout" and "class order" in r.message


def test_an_incumbent_that_does_not_verify_fails_before_any_fit(server: FileServer,
                                                                 monkeypatch: pytest.MonkeyPatch) -> None:
    """Candidate selection (the first fit) and the holdout stage (baselines, calibration) are never reached."""
    def never(*_args: object, **_kwargs: object) -> NoReturn:
        raise AssertionError("a model was fitted before the incumbent was verified")

    monkeypatch.setattr(TR, "select_finalist", never)
    monkeypatch.setattr(EV, "evaluate", never)
    req = _request(server, binary_frame(300))
    inc = _incumbent(server, base64.b64encode(b"{}").decode("ascii"))
    _obj(inc["artifact"])["sha256"] = "2" * 64
    req["incumbent"] = inc
    r = _failed(req)
    assert r.stage == "load-snapshot" and "SHA-256" in r.message


# ------------------------------------------------------------------------------------------ the run clock ---------

def _then(fn: Callable[P, R], after: Callable[[], None]) -> Callable[P, R]:
    """`fn`, then `after`."""
    def wrapped(*args: P.args, **kwargs: P.kwargs) -> R:
        out = fn(*args, **kwargs)
        after()
        return out
    return wrapped


def test_a_budget_crossed_during_the_holdout_statistics_fails_the_run(server: FileServer,
                                                                    monkeypatch: pytest.MonkeyPatch) -> None:
    """The clock is checked after the last holdout statistic, so time spent there is enforced and counted."""
    late = {"now": False}
    elapsed = RunClock.compute_seconds

    def clock(self: RunClock) -> float:
        return 1e9 if late["now"] else elapsed(self)

    monkeypatch.setattr(RunClock, "compute_seconds", clock)
    monkeypatch.setattr(EV, "slice_results", _then(EV.slice_results, lambda: late.update(now=True)))
    r = _failed(_request(server, binary_frame(400), drivers=LOGISTIC_ONLY))
    assert r.stage == "timeout" and "holdout statistics" in r.message


# ------------------------------------------------------------------------------------- the applied calibration ---

def test_an_applied_calibration_map_is_fitted_on_the_finalists_out_of_fold_rows(server: FileServer) -> None:
    """The shipped finalist's map equals one fitted here on its out-of-fold development predictions, never on the
    holdout."""
    raw = _request(server, binary_frame(), drivers=OVERCONFIDENT)
    r = _completed(raw)
    assert r.calibration is not None and r.calibration.method == "platt"
    art = next(a for a in r.artifacts if a.candidate == r.finalist)
    shipped, _env = artifacts.load_v2_envelope(base64.b64decode(art.bytesBase64))
    assert shipped.calibrator is not None

    req = TrainerRequest.model_validate(raw)
    snap = SN.load(req, dt.datetime.now(dt.timezone.utc), RunClock(600, 600))
    enc = TR.encode_label(req.task, snap.label)
    dev = np.flatnonzero(np.array(snap.roles) == "development").astype(np.int64)
    out = TR.select_finalist(req.protocol, snap, snap.columns, enc, dev, req.candidates, 1, RunClock(600, 600),
                             SN.period_ordinals(snap))
    y_val = np.asarray(enc.y, dtype=np.float64)[dev][out.validated]
    expected = CAL.Calibrator("platt").fit(y_val, out.cv[r.finalist].oof)
    grid = np.linspace(0.01, 0.99, 50)
    assert np.allclose(shipped.calibrator.apply(grid), expected.apply(grid), rtol=0, atol=1e-12)


# ---------------------------------------------------------------------------------------- /predict, multiclass ----

def test_predict_returns_every_class_of_a_multiclass_v2_artifact() -> None:
    df = _three_classes(binary_frame())
    cols = [ColumnSpec("x2", "x2", NumericEncoding("numeric"))]
    enc = TR.EncodedLabel(df["Target"].to_numpy(dtype=np.int64), "multiclass", ["a", "b", "c"], None)
    proto = EvaluationProtocol.model_validate(protocol("multiclass"))
    spec = CandidateSpec(name="m", algorithmId=NIL_UUID, driverKey="logistic_regression", hyperparameters={})
    predictor = TR.fit_predictor(spec, cols, df[["x2"]], enc, np.arange(len(df), dtype=np.int64), proto, 1)
    built = artifacts_v2.build("m", predictor, cols, "multiclass", ["a", "b", "c"], "0" * 64, None, None)
    resp = client.post("/predict", json={"artifact_b64": built.bytes_base64,
                                         "rows": [{"x2": -3.0}, {"x2": 0.0}, {"x2": 3.0}]})
    assert resp.status_code == 200, resp.text
    body = _obj(resp.json())
    assert body["classOrder"] == ["a", "b", "c"]
    preds = [_obj(p) for p in _list(body["predictions"])]
    for p in preds:
        probs = [float(v) for v in _list(p["probabilities"]) if isinstance(v, (int, float))]
        assert len(probs) == 3 and sum(probs) == pytest.approx(1.0)
        assert p["score"] == pytest.approx(max(probs)) and p["class"] == "abc"[int(np.argmax(probs))]
    assert [p["class"] for p in preds] == ["a", "b", "c"]


# ------------------------------------------------------------------------------------------ forecast tasks --------

SERIES_DRIVERS: list[DriverSpec] = [("ar1_const", "ar1_const", {}), ("trend_season_ols", "trend_season_ols", {}),
                                    ("trend_season_ar1", "trend_season_ar1", {})]
FORECAST_TASK: JsonObject = {"kind": "forecast", "valueKind": "continuous"}
MONTHLY: JsonObject = {"action": "plan", "actorRole": "ops", "capacityPerPeriod": None, "period": "month"}


def _monthly_series(n: int = 96, seed: int = 5) -> pd.DataFrame:
    """One monthly series from January 2015: trend, a 12-month season and AR(1) noise."""
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    noise = np.zeros(n)
    for i in range(1, n):
        noise[i] = 0.5 * noise[i - 1] + rng.normal()
    y = 50 + 0.1 * t + 5 * np.sin(2 * np.pi * t / 12) + noise
    days = [f"{2015 + i // 12}-{i % 12 + 1:02d}-01" for i in range(n)]
    return pd.DataFrame({"ID": [f"s{i}" for i in range(n)], "EntityKey": "series", "T": days, "Period": days,
                         "Target": y})


def _forecast_request(server: FileServer, df: pd.DataFrame, tag: str, origins: int = 5, horizon: int = 6,
                      gap: int = 0, min_train: int = 24, window: str = "expanding",
                      holdout_rows: int | None = None, **proto_over: JsonValue) -> JsonObject:
    """A forecast request over `df` whose last `origins * horizon` rows (by position) are the locked holdout."""
    n_hold = origins * horizon if holdout_rows is None else holdout_rows
    hold = [str(i) for i in df["ID"].iloc[len(df) - n_hold:]]
    m, n = snapshot_files(df, {}, hold, period_col="Period", decision=MONTHLY)
    holdout: JsonObject = {"kind": "rolling-origin", "origins": origins, "horizonPeriods": horizon, "gapPeriods": gap,
                           "minTrainPeriods": min_train, "window": window}
    over: dict[str, JsonValue] = {"holdout": holdout, "secondaryMetrics": ["r2"],
                                  "residualDiagnostics": {"acfLags": 12, "ljungBoxAlpha": 0.05}}
    over.update(proto_over)
    return request(server, m, n, FORECAST_TASK, protocol("forecast", **over), candidates("continuous", SERIES_DRIVERS),
                   tag=tag)


def test_a_forecast_runs_a_rolling_origin_backtest(server: FileServer) -> None:
    r = _completed(_forecast_request(server, _monthly_series(), "fc-ok"))
    assert r.forecast is not None and [o.k for o in r.forecast.origins] == [1, 2, 3, 4, 5]
    first = 2015 * 12
    assert [o.testPeriods[0] - first for o in r.forecast.origins] == [66, 72, 78, 84, 90]
    assert all(o.lastTrainPeriod == o.testPeriods[0] - 1 for o in r.forecast.origins)
    assert all(set(o.mase) == {"model", "mean", "naive", "seasonalNaive"} for o in r.forecast.origins)
    assert r.holdout.primary.metric == "mase" and r.holdout.primary.n == 30
    assert {b.baseline.kind for b in r.baselines} == {"dummy", "naive", "seasonal-naive"}
    assert {"modelVsDummy", "modelVs:naive", "modelVs:seasonalNaive"} <= set(r.comparisons)
    assert {a.candidate for a in r.artifacts} == {r.finalist, "naive", "seasonalNaive"}
    assert {s.candidate for s in r.innerScores} == {"ar1_const", "trend_season_ols", "trend_season_ar1"}
    assert r.residualDiagnostics is not None and r.residualDiagnostics.ljungBox.lags == 12
    assert r.predictionIntervalCoverage == [] and r.importance == [] and r.incumbentDiff is None
    assert r.innerSplitContrast is None and r.forecast.dieboldMarianoVsSeasonalNaive.horizon == 6
    assert r.computeSeconds > 0 and r.cost.computeSeconds == r.computeSeconds


def test_a_forecast_mase_is_the_mean_of_its_origins(server: FileServer) -> None:
    """Equal-length origins: the pooled MASE of each member is the mean of its per-origin MASE."""
    r = _completed(_forecast_request(server, _monthly_series(), "fc-pool"))
    assert r.forecast is not None
    pooled = float(np.mean([o.mase["model"] for o in r.forecast.origins]))
    assert r.holdout.primary.value == pytest.approx(pooled, abs=1e-12)
    seasonal = next(b for b in r.baselines if b.baseline.kind == "seasonal-naive")
    per_origin = [o.mase["seasonalNaive"] for o in r.forecast.origins]
    assert seasonal.holdout.value == pytest.approx(float(np.mean(per_origin)), abs=1e-12)


def test_a_forecast_ranks_by_rmse_when_the_protocol_declares_it(server: FileServer) -> None:
    """An `rmse` forecast protocol scores unscaled errors: the seasonal-naive baseline's holdout RMSE equals one
    computed here from each origin's own training window."""
    df = _monthly_series()
    r = _completed(_forecast_request(server, df, "fc-rmse", primaryScore={"family": "forecast", "metric": "rmse"}))
    assert r.holdout.primary.metric == "rmse"
    y = df["Target"].to_numpy(dtype=np.float64)
    errors = []
    for start in range(66, 96, 6):
        last_season = y[start - 12:start]
        errors.append(y[start:start + 6] - last_season[np.arange(6) % 12])
    expected = math.sqrt(float(np.mean(np.concatenate(errors) ** 2)))
    seasonal = next(b for b in r.baselines if b.baseline.kind == "seasonal-naive")
    assert seasonal.holdout.metric == "rmse" and seasonal.holdout.value == pytest.approx(expected, abs=1e-9)


def test_a_forecast_origin_trains_up_to_the_gap_before_its_test_periods(server: FileServer) -> None:
    r = _completed(_forecast_request(server, _monthly_series(), "fc-gap", gap=2))
    assert r.forecast is not None
    assert all(o.lastTrainPeriod == o.testPeriods[0] - 3 for o in r.forecast.origins)


def _with_proto(req: JsonObject, key: str, value: JsonValue) -> JsonObject:
    _obj(req["protocol"])[key] = value
    return req


@pytest.mark.parametrize("key,value,named", [
    ("intervals", {"level": 0.95, "method": "bootstrap", "resamples": 1000, "pairedTest": "paired-bootstrap"},
     "'bootstrap'"),
    ("predictionIntervals", {"method": "split-conformal", "nominalCoverage": [0.8]}, "prediction-interval coverage"),
    ("baselines", [{"kind": "dummy", "name": "training-window-mean"}, {"kind": "naive"}], "seasonal-naive"),
])
def test_a_forecast_protocol_the_backtest_cannot_honour_is_400(server: FileServer, key: str, value: JsonValue,
                                                                named: str) -> None:
    """An interval method other than the block bootstrap by origin, declared prediction intervals, or no
    seasonal-naive baseline (the MASE scale and the gate need it) answer 400 before anything is fitted."""
    req = _with_proto(_forecast_request(server, _monthly_series(), f"fc-400-{key}"), key, value)
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 400 and named in resp.json()["detail"], resp.text


def _two_series(df: pd.DataFrame) -> pd.DataFrame:
    return df.assign(EntityKey=["a" if i % 2 else "b" for i in range(len(df))])


def _repeated_period(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.loc[10, "Period"] = out.loc[9, "Period"]
    return out


def _skipped_period(df: pd.DataFrame) -> pd.DataFrame:
    return df.drop(index=10).reset_index(drop=True)


@pytest.mark.parametrize("change,named", [(_two_series, "one series per snapshot"),
                                          (_repeated_period, "2015-10-01"), (_skipped_period, "2015-11-01")])
def test_a_forecast_snapshot_that_is_not_one_contiguous_series_fails_at_load(
        server: FileServer, change: Callable[[pd.DataFrame], pd.DataFrame], named: str) -> None:
    r = _failed(_forecast_request(server, change(_monthly_series()), f"fc-load-{change.__name__}"))
    assert r.stage == "load-snapshot" and named in r.message, r.message


def test_a_forecast_window_no_longer_than_the_season_fails_at_load(server: FileServer) -> None:
    """A sliding 12-period window cannot carry a 12-period seasonal-naive scale."""
    r = _failed(_forecast_request(server, _monthly_series(), "fc-short", min_train=12, window="sliding"))
    assert r.stage == "load-snapshot" and "seasonal period 12" in r.message, r.message


def test_a_forecast_manifest_off_the_design_fails_at_load(server: FileServer) -> None:
    r = _failed(_forecast_request(server, _monthly_series(), "fc-manifest", holdout_rows=29))
    assert r.stage == "load-snapshot" and "rolling-origin design" in r.message


def test_a_forecast_origin_whose_window_has_no_seasonal_change_fails_the_holdout_stage(server: FileServer) -> None:
    """Sliding windows over an exactly repeating stretch have MASE scale 0: `failed` naming the origin, never a
    500 or an infinite score."""
    df = _monthly_series()
    y = df["Target"].to_numpy(dtype=np.float64).copy()
    season = 50 + 5 * np.sin(2 * np.pi * np.arange(12) / 12)
    y[36:] = season[np.arange(36, 96) % 12]
    r = _failed(_forecast_request(server, df.assign(Target=y), "fc-flat", window="sliding"))
    assert r.stage == "holdout" and "origin 1" in r.message, r.message


def test_a_non_finite_forecast_statistic_fails_the_holdout_stage(server: FileServer,
                                                                 monkeypatch: pytest.MonkeyPatch) -> None:
    """A Diebold-Mariano statistic that is undefined (NaN) never reaches the wire."""
    monkeypatch.setattr(FC.T, "diebold_mariano",
                        lambda a, b, h: T.DMResult(float("nan"), float("nan"), 0.0, len(a)))
    r = _failed(_forecast_request(server, _monthly_series(), "fc-nan"))
    assert r.stage == "holdout" and "dieboldMarianoVsSeasonalNaive" in r.message, r.message


def test_a_forecast_artifact_that_cannot_ship_fails_the_holdout_stage(server: FileServer,
                                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_args: object, **_kwargs: object) -> NoReturn:
        raise artifacts_v2.NotShippableError("refused")

    monkeypatch.setattr(artifacts_v2, "build", refuse)
    r = _failed(_forecast_request(server, _monthly_series(), "fc-ship"))
    assert r.stage == "holdout" and "refused" in r.message


def test_a_budget_crossed_while_building_forecast_artifacts_fails_the_run(server: FileServer,
                                                                          monkeypatch: pytest.MonkeyPatch) -> None:
    """The forecast path's last clock check follows the artifacts, so their time is enforced and counted."""
    late = {"now": False}
    elapsed = RunClock.compute_seconds

    def clock(self: RunClock) -> float:
        return 1e9 if late["now"] else elapsed(self)

    monkeypatch.setattr(RunClock, "compute_seconds", clock)
    monkeypatch.setattr(artifacts_v2, "build", _then(artifacts_v2.build, lambda: late.update(now=True)))
    r = _failed(_forecast_request(server, _monthly_series(), "fc-clock"))
    assert r.stage == "timeout" and "forecast statistics" in r.message, r.message


def test_predict_refuses_a_series_forecast_artifact(server: FileServer) -> None:
    """Serving forecasts is not built: a series model's envelope answers 400 naming the limitation."""
    r = _completed(_forecast_request(server, _monthly_series(), "fc-predict"))
    art = next(a for a in r.artifacts if a.candidate == r.finalist)
    resp = client.post("/predict", json={"artifact_b64": art.bytesBase64, "rows": [{"x1": 1.0}]})
    assert resp.status_code == 400 and "forecast" in resp.json()["detail"], resp.text
