"""Per-row drivers of a linear model are `coef × (z − z̄)`, signed and centred on the mean encoded training row, on the
trainer path (the mean travels in the v2 envelope) and on the legacy path (the mean is stashed on the estimator). A
model without a stored training mean returns no driver, never an uncentred one."""

from __future__ import annotations

import base64
import io

import joblib
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient
from sklearn.linear_model import LogisticRegression

from app import artifacts, artifacts_v2, encoding as E, trainer as TR
from app.main import _row_contributions, app
from app.trainer_schemas import CandidateSpec, EvaluationProtocol, TrainerCompleted
from tests.tools.trainer_fixture import NUMERIC, DriverSpec, FileServer, JsonObject, candidates, protocol, request, \
    snapshot_files
from tests.tools.trainer_scaffold import TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

client = TestClient(app)
NIL = "00000000-0000-0000-0000-000000000000"
LOGISTIC = CandidateSpec(name="lr", algorithmId=NIL, driverKey="logistic_regression", hyperparameters={})
LOGISTIC_ONLY: list[DriverSpec] = [("glm_candidate", "logistic_regression", {})]


def _x_far_from_zero(seed: int, n: int) -> tuple[pd.DataFrame, TR.EncodedLabel]:
    """`x` centred at 5: an uncentred coef * x has the same sign for every row."""
    rng = np.random.default_rng(seed)
    x = rng.normal(5.0, 1.0, n)
    y = (rng.random(n) < 1 / (1 + np.exp(-(x - 5.0)))).astype(np.int64)
    return pd.DataFrame({"x": x, "noise": rng.normal(0.0, 1.0, n)}), TR.EncodedLabel(y, "binary", ["0", "1"], None)


def _fit(X: pd.DataFrame, enc: TR.EncodedLabel, spec: CandidateSpec = LOGISTIC) -> TR.TrainedPredictor:
    cols = [E.ColumnSpec(c, c, E.NumericEncoding("numeric")) for c in X.columns]
    p = EvaluationProtocol.model_validate(protocol("binary"))
    return TR.fit_predictor(spec, cols, X, enc, np.arange(len(X), dtype=np.int64), p, 1)


def _drivers(body: JsonObject) -> list[dict[str, float]]:
    preds = body["predictions"]
    assert isinstance(preds, list)
    out: list[dict[str, float]] = []
    for p in preds:
        assert isinstance(p, dict)
        contribs = p["contributions"]
        assert isinstance(contribs, list)
        row: dict[str, float] = {}
        for c in contribs:
            assert isinstance(c, dict) and isinstance(c["feature"], str) and isinstance(c["value"], float)
            row[c["feature"]] = c["value"]
        out.append(row)
    return out


def test_drivers_change_sign_with_the_row_not_with_the_model() -> None:
    X, enc = _x_far_from_zero(4, 2000)
    m = _fit(X, enc)
    assert m.driver_baseline is not None
    d = m.contributions(pd.DataFrame({"x": [7.0, 3.0], "noise": [0.0, 0.0]}), m.driver_baseline)
    top_hi, top_lo = dict(d[0] or []), dict(d[1] or [])
    assert top_hi["x"] > 0 > top_lo["x"]
    # the noise column at its training mean contributes (almost) nothing
    assert abs(top_hi.get("noise", 0.0)) < 0.05


def test_the_baseline_is_the_mean_encoded_training_row_aligned_with_its_column_names() -> None:
    X, enc = _x_far_from_zero(6, 500)
    m = _fit(X, enc)
    assert m.driver_baseline is not None
    encoded = np.asarray(m.pipeline[:-1].transform(X), dtype=np.float64)
    assert m.driver_baseline.columns == [str(c) for c in m.pipeline[:-1].get_feature_names_out()]
    assert m.driver_baseline.columns == ["x", "x__missing", "noise", "noise__missing"]
    np.testing.assert_allclose(m.driver_baseline.mean, encoded.mean(axis=0), atol=1e-12)


def test_each_driver_averages_to_zero_over_the_training_rows() -> None:
    """Centred on the training mean, each encoded column's driver averages to zero over the rows the model was fitted
    on, one-hot columns included (their training mean is the level's share, never zero); measured from zero, a
    one-hot column's average driver would be its coefficient times that share."""
    rng = np.random.default_rng(11)
    n = 1200
    plan = rng.choice(["basic", "plus", "pro"], size=n, p=[0.7, 0.2, 0.1])
    x = rng.normal(0.0, 1.0, n)
    logit = x + np.where(plan == "pro", 1.5, np.where(plan == "plus", 0.5, -0.5))
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(np.int64)
    X = pd.DataFrame({"x": x, "plan": plan})
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric")),
            E.ColumnSpec("plan", "plan", E.CategoricalEncoding(10, "onehot"), levels=("basic", "plus", "pro"))]
    p = EvaluationProtocol.model_validate(protocol("binary"))
    m = TR.fit_predictor(LOGISTIC, cols, X, TR.EncodedLabel(y, "binary", ["0", "1"], None),
                         np.arange(n, dtype=np.int64), p, 1)
    b = m.driver_baseline
    assert b is not None and {"plan_basic", "plan_plus", "plan_pro"} <= set(b.columns)
    sums = dict.fromkeys(b.columns, 0.0)
    for row in m.contributions(X, b, top_k=len(b.columns)):
        for name, value in row or []:
            sums[name] += value
    for name in ("x", "plan_basic", "plan_plus", "plan_pro"):
        assert abs(sums[name] / n) < 1e-6, name


def test_a_model_without_coefficients_has_no_baseline_and_no_driver() -> None:
    X, enc = _x_far_from_zero(7, 400)
    forest = CandidateSpec(name="rf", algorithmId=NIL, driverKey="random_forest", hyperparameters={"n_estimators": 10})
    m = _fit(X, enc, forest)
    assert m.driver_baseline is None
    assert m.contributions(X.head(3), None) == [None, None, None]


def test_a_linear_model_given_no_baseline_returns_no_driver() -> None:
    X, enc = _x_far_from_zero(8, 400)
    assert _fit(X, enc).contributions(X.head(2), None) == [None, None]


def test_the_baseline_is_not_pickled_with_the_predictor() -> None:
    """The envelope carries the mean; the payload must not hold a second copy that could disagree with it."""
    X, enc = _x_far_from_zero(9, 400)
    m = _fit(X, enc)
    buf = io.BytesIO()
    joblib.dump(m, buf)
    buf.seek(0)
    assert joblib.load(buf).driver_baseline is None
    assert m.driver_baseline is not None


def _v2_artifact(with_baseline: bool) -> str:
    X, enc = _x_far_from_zero(5, 1500)
    X = X[["x"]]
    m = _fit(X, enc)
    b = m.driver_baseline
    assert b is not None
    cols = [E.ColumnSpec("x", "x", E.NumericEncoding("numeric"))]
    return artifacts_v2.build("lr", m, cols, "binary", ["0", "1"], "0" * 64, b.mean if with_baseline else None,
                              b.columns if with_baseline else None).bytes_base64


def test_predict_returns_centred_drivers_for_a_v2_linear_model() -> None:
    body = client.post("/predict", json={"artifact_b64": _v2_artifact(True), "rows": [{"x": 7.0}, {"x": 3.0}]}).json()
    hi, lo = _drivers(body)
    assert hi["x"] > 0 > lo["x"]


def test_predict_returns_no_driver_for_a_v2_envelope_without_a_baseline() -> None:
    body = client.post("/predict", json={"artifact_b64": _v2_artifact(False), "rows": [{"x": 7.0}, {"x": 3.0}]}).json()
    assert [p["contributions"] for p in body["predictions"]] == [None, None]


def test_a_legacy_linear_model_without_a_training_mean_returns_no_driver() -> None:
    """A legacy model trained before the training mean was stashed returns no driver, never an uncentred one."""
    X = np.array([[1.0], [2.0], [3.0], [4.0]])
    model = LogisticRegression().fit(X, [0, 0, 1, 1])
    assert _row_contributions(model, X, ["x"]) == [None] * 4
    model.mj_driver_baseline_ = X.mean(axis=0)
    rows = _row_contributions(model, X, ["x"])
    assert rows[0] is not None and rows[3] is not None and rows[0][0]["value"] < 0 < rows[3][0]["value"]


def test_a_trainer_run_ships_the_training_mean_in_every_linear_envelope(server: FileServer) -> None:
    df = binary_frame()
    holdout = [str(i) for i, t in zip(df["ID"], df["T"]) if str(t).startswith("2024")]
    feats: dict[str, JsonObject] = {"x1": NUMERIC, "x2": NUMERIC}
    m, n = snapshot_files(df, feats, holdout, label_map={0: "no", 1: "yes"})
    req = request(server, m, n, TASK, protocol("binary"), candidates("binary", LOGISTIC_ONLY), tag="centred")
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 200, resp.text
    done = TrainerCompleted.model_validate(resp.json())
    linear = [a for a in done.artifacts if a.candidate in ("glm_candidate", "glm")]
    assert len(linear) == 2
    for art in linear:
        predictor, env = artifacts.load_v2_envelope(base64.b64decode(art.bytesBase64))
        assert env.driverBaseline is not None and env.transformedColumns is not None
        assert len(env.driverBaseline) == len(env.transformedColumns) == predictor.pipeline.steps[-1][1].coef_.shape[1]
    finalist = next(a for a in done.artifacts if a.candidate == "glm_candidate")
    rows = [{"x1": 3.0, "x2": 0.0}, {"x1": -3.0, "x2": 0.0}]
    hi, lo = _drivers(client.post("/predict", json={"artifact_b64": finalist.bytesBase64, "rows": rows}).json())
    assert hi["x1"] * lo["x1"] < 0
