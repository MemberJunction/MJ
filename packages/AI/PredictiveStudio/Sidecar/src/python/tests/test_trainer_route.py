"""POST /trainer end to end: one holdout access, baselines fitted on development rows, paired comparisons, the gate,
calibration, artifacts, the incumbent diff, failures and refusals; and POST /predict on a v2 artifact."""

from __future__ import annotations

import base64
import hashlib
import json
from collections.abc import Callable

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import artifacts
from app.main import app
from app.trainer_schemas import TrainerCompleted, TrainerFailed
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

# scikit-learn 1.4.2's LogisticRegression passes `iprint` to scipy 1.17.1's L-BFGS-B, which deprecates it; both
# versions are pinned in requirements.txt, so the notice is a library pairing, not something these tests exercise.
pytestmark = pytest.mark.filterwarnings("ignore:scipy.optimize. The `disp` and `iprint` options:DeprecationWarning")

client = TestClient(app)
LABELS = {0: "no", 1: "yes"}
DECISION: JsonObject = {"action": "call", "actorRole": "rep", "capacityPerPeriod": 50, "period": "year"}
LOGISTIC_ONLY: list[DriverSpec] = [("glm_candidate", "logistic_regression", {})]


def _obj(value: JsonValue) -> JsonObject:
    assert isinstance(value, dict)
    return value


def _list(value: JsonValue) -> list[JsonValue]:
    assert isinstance(value, list)
    return value


def _holdout_2024(df: pd.DataFrame) -> list[str]:
    return [str(i) for i, t in zip(df["ID"], df["T"]) if str(t).startswith("2024")]


def _request(server: FileServer, df: pd.DataFrame, feats: dict[str, JsonObject] = FEATS, tag: str = "snap",
             drivers: list[DriverSpec] | None = None) -> JsonObject:
    m, n = snapshot_files(df, feats, _holdout_2024(df), label_map=LABELS, slice_cols={"City": "city"},
                          decision=DECISION)
    proto = protocol("binary", slices={"outOfTime": True, "subgroups": ["City"]})
    return request(server, m, n, TASK, proto, candidates("binary", drivers), tag=tag)


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
