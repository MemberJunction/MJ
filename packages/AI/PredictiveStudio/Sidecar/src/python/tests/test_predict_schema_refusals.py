"""/predict refuses what it cannot score (G5.2's sidecar half, `W1 -> S7.3 #2`).

A legacy (v1) model is scored only against the feature schema stored with it: a request without one is a 400 "no
stored feature schema" (the scorer never falls back to the fitted output columns), and rows whose columns do not match
the schema are a 400 naming each missing schema column and each row column the schema does not name (a renamed
feature shows as one of each). A v2 envelope carries its own feature columns and names them the same way. A
multiclass response carries every class's probability in `classOrder`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Dict, List, Optional, Union

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sklearn.datasets import make_classification

from app import artifacts, artifacts_v2, preprocessing, trainer as TR
from app.baselines import NIL_UUID
from app.encoding import ColumnSpec, NumericEncoding
from app.main import app
from app.trainer_schemas import CandidateSpec, EvaluationProtocol
from tests.tools.legacy_envelope import legacy_envelope
from tests.tools.trainer_fixture import protocol
from tests.tools.trainer_scaffold import binary_frame

Cell = Union[str, float, int, bool, None]
Row = Dict[str, Cell]
Json = Union[None, bool, int, float, str, List["Json"], Dict[str, "Json"]]

FEATURES = ["DistanceZ", "Tenure", "Visits"]
ROWS: List[Row] = [{"DistanceZ": z, "Tenure": t, "Visits": v}
                   for z, t, v in ((-1.0, 0.5, 2.0), (0.0, 0.0, 0.0), (1.5, -0.5, -1.0))]


@dataclass(frozen=True)
class Artifact:
    """A model envelope as /predict receives it: the base64 artifact, its fitted preprocessing (legacy only) and the
    feature schema stored with the model (empty for a v2 envelope, which carries its own feature columns)."""

    artifact_b64: str
    fitted_preprocessing: Dict[str, object]
    feature_schema: List[Dict[str, str]]


_UNSET: List[Dict[str, str]] = []


def PredictBody(artifact: Artifact, feature_schema: Optional[List[Dict[str, str]]] = _UNSET,
                rows: Optional[List[Row]] = None) -> Dict[str, object]:
    """The /predict body for `artifact`; `feature_schema=None` drops the stored schema, the default sends it."""
    body: Dict[str, object] = {"artifact_b64": artifact.artifact_b64, "rows": ROWS if rows is None else rows}
    if artifact.fitted_preprocessing:
        body["fitted_preprocessing"] = artifact.fitted_preprocessing
    schema = artifact.feature_schema if feature_schema is _UNSET else feature_schema
    if schema is not None:
        body["feature_schema"] = schema
    return body


def Renamed(row: Row, old: str, new: str) -> Row:
    """`row` with column `old` renamed to `new`."""
    return {new if k == old else k: v for k, v in row.items()}


def _legacy(n_classes: int) -> Artifact:
    X, y = make_classification(n_samples=300, n_features=len(FEATURES), n_informative=3, n_redundant=0,
                               n_classes=n_classes, random_state=42)
    names = ["c0", "c1", "c2"][:n_classes]
    columns = FEATURES + ["label"]
    rows: List[List[object]] = [[float(v) for v in X[i]] + [names[int(y[i])]] for i in range(len(y))]
    schema = [{"Name": f, "Kind": "numeric"} for f in FEATURES]
    ops: List[Dict[str, object]] = [{"op": "standardize", "cols": list(FEATURES)}]
    artifact, _model_id, fitted = legacy_envelope("logistic_regression", "classification", columns, rows, schema,
                                                  "label", ops)
    return Artifact(artifact, fitted, schema)


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def legacy_artifact() -> Artifact:
    return _legacy(2)


@pytest.fixture(scope="module")
def v2_artifact() -> Artifact:
    """A v2 binary predictor over x1 and x2 (the trainer's own envelope)."""
    df = binary_frame().assign(x1=lambda d: d["x1"].fillna(0.0))
    cols = [ColumnSpec("x1", "x1", NumericEncoding("numeric")), ColumnSpec("x2", "x2", NumericEncoding("numeric"))]
    enc = TR.EncodedLabel(df["Target"].to_numpy(dtype=np.int64), "binary", ["no", "yes"], 1)
    proto = EvaluationProtocol.model_validate(protocol("binary"))
    spec = CandidateSpec(name="m", algorithmId=NIL_UUID, driverKey="logistic_regression", hyperparameters={})
    predictor = TR.fit_predictor(spec, cols, df[["x1", "x2"]], enc, np.arange(len(df), dtype=np.int64), proto, 1)
    built = artifacts_v2.build("m", predictor, cols, "binary", ["no", "yes"], "0" * 64, None, None)
    return Artifact(built.bytes_base64, {}, [])


@pytest.fixture(scope="module", params=["legacy", "v2"])
def w9_artifact(request: pytest.FixtureRequest) -> Artifact:
    """A three-class model (W9-multiclass's shape): a legacy envelope, or a v2 predictor over the same features."""
    if request.param == "legacy":
        return _legacy(3)
    X, y = make_classification(n_samples=300, n_features=len(FEATURES), n_informative=3, n_redundant=0, n_classes=3,
                               random_state=42)
    df = pd.DataFrame(X, columns=FEATURES)
    cols = [ColumnSpec(f, f, NumericEncoding("numeric")) for f in FEATURES]
    enc = TR.EncodedLabel(np.asarray(y, dtype=np.int64), "multiclass", ["c0", "c1", "c2"], None)
    proto = EvaluationProtocol.model_validate(protocol("multiclass"))
    spec = CandidateSpec(name="m", algorithmId=NIL_UUID, driverKey="logistic_regression", hyperparameters={})
    predictor = TR.fit_predictor(spec, cols, df, enc, np.arange(len(df), dtype=np.int64), proto, 1)
    built = artifacts_v2.build("m", predictor, cols, "multiclass", ["c0", "c1", "c2"], "0" * 64, None, None)
    return Artifact(built.bytes_base64, {}, [])


def _detail(body: Json) -> str:
    assert isinstance(body, dict)
    detail = body["detail"]
    assert isinstance(detail, str)
    return detail


def test_predict_without_feature_schema_is_refused(client: TestClient, legacy_artifact: Artifact) -> None:
    r = client.post("/predict", json=PredictBody(legacy_artifact, feature_schema=None))
    assert r.status_code == 400 and "no stored feature schema" in _detail(r.json()), r.text


def test_predict_with_an_empty_feature_schema_is_refused(client: TestClient, legacy_artifact: Artifact) -> None:
    r = client.post("/predict", json=PredictBody(legacy_artifact, feature_schema=[]))
    assert r.status_code == 400 and "no stored feature schema" in _detail(r.json()), r.text


def test_predict_names_a_renamed_feature(client: TestClient, legacy_artifact: Artifact) -> None:
    rows = [Renamed(row, "DistanceZ", "Distance_Z") for row in ROWS]
    r = client.post("/predict", json=PredictBody(legacy_artifact, rows=rows))
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and "DistanceZ" in detail and "Distance_Z" in detail, r.text


def test_predict_names_every_missing_feature(client: TestClient, legacy_artifact: Artifact) -> None:
    rows: List[Row] = [{"Visits": row["Visits"]} for row in ROWS]
    r = client.post("/predict", json=PredictBody(legacy_artifact, rows=rows))
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and "DistanceZ" in detail and "Tenure" in detail, r.text


def test_predict_scores_rows_that_carry_every_schema_column(client: TestClient, legacy_artifact: Artifact) -> None:
    """A matching request still scores; an extra row column beside the schema's is not a mismatch."""
    rows: List[Row] = [{**row, "RecordID": "r1"} for row in ROWS]
    r = client.post("/predict", json=PredictBody(legacy_artifact, rows=rows))
    assert r.status_code == 200, r.text


def test_v2_predict_names_a_renamed_feature(client: TestClient, v2_artifact: Artifact) -> None:
    rows: List[Row] = [{"x1_renamed": 0.1, "x2": 0.0}, {"x1_renamed": -2.0, "x2": 1.0}]
    r = client.post("/predict", json=PredictBody(v2_artifact, rows=rows))
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and "x1" in detail and "x1_renamed" in detail, r.text


def test_multiclass_returns_every_class_probability_in_class_order(client: TestClient, w9_artifact: Artifact) -> None:
    body = client.post("/predict", json=PredictBody(w9_artifact)).json()
    assert isinstance(body, dict) and isinstance(body["classOrder"], list) and len(body["classOrder"]) == 3, body
    assert all(len(p["probabilities"]) == len(body["classOrder"]) for p in body["predictions"])


# ------------------------------------------------------------------ the request schema against the artifact's ----

def _schema(names: List[str]) -> List[Dict[str, str]]:
    return [{"Name": n, "Kind": "numeric"} for n in names]


def test_predict_refuses_a_request_schema_that_omits_a_stored_feature(client: TestClient,
                                                                      legacy_artifact: Artifact) -> None:
    """Schema and rows both leave DistanceZ out: never scored with DistanceZ filled as 0."""
    rows: List[Row] = [{k: v for k, v in row.items() if k != "DistanceZ"} for row in ROWS]
    body = PredictBody(legacy_artifact, feature_schema=_schema(["Tenure", "Visits"]), rows=rows)
    r = client.post("/predict", json=body)
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and "DistanceZ" in detail, r.text


def test_predict_refuses_a_request_schema_with_a_column_the_artifact_does_not_know(client: TestClient,
                                                                                  legacy_artifact: Artifact) -> None:
    rows: List[Row] = [{**row, "Extra": 1.0} for row in ROWS]
    body = PredictBody(legacy_artifact, feature_schema=_schema(FEATURES + ["Extra"]), rows=rows)
    r = client.post("/predict", json=body)
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and "Extra" in detail, r.text


def test_predict_from_the_cache_refuses_a_schema_the_fitted_columns_do_not_cover(client: TestClient,
                                                                                legacy_artifact: Artifact) -> None:
    """A warm-cache hit by model_id keeps the envelope it was cached with: its stored schema and fitted columns refuse
    a request schema that leaves DistanceZ out."""
    rows: List[Row] = [{k: v for k, v in row.items() if k != "DistanceZ"} for row in ROWS]
    model_id = hashlib.sha256(legacy_artifact.artifact_b64.encode("ascii")).hexdigest()
    body: Dict[str, object] = {"model_id": model_id, "fitted_preprocessing": legacy_artifact.fitted_preprocessing,
                               "feature_schema": _schema(["Tenure", "Visits"]), "rows": rows}
    r = client.post("/predict", json=body)
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and "DistanceZ" in detail, r.text


def test_predict_scores_a_request_schema_that_matches_the_artifact(client: TestClient,
                                                                   legacy_artifact: Artifact) -> None:
    r = client.post("/predict", json=PredictBody(legacy_artifact, feature_schema=_schema(list(FEATURES))))
    assert r.status_code == 200, r.text


# ------------------------------------------------------ the request's fitted preprocessing against the model's ----

IMPUTE_ROWS: List[Row] = [{"DistanceZ": 4.0, "Tenure": 0.5, "Visits": 0.5},
                          {"DistanceZ": None, "Tenure": 0.5, "Visits": 0.5}]


@pytest.fixture(scope="module")
def impute_artifact() -> Artifact:
    """A legacy model whose DistanceZ is shifted +5 and mean-imputed: a null scored as 0.0 instead of the trained fill
    moves the prediction."""
    X, y = make_classification(n_samples=300, n_features=len(FEATURES), n_informative=3, n_redundant=0, n_classes=2,
                               random_state=42)
    columns = FEATURES + ["label"]
    rows: List[List[object]] = [[float(X[i][0]) + 5.0, float(X[i][1]), float(X[i][2]), ["c0", "c1"][int(y[i])]]
                                for i in range(len(y))]
    schema = _schema(list(FEATURES))
    ops: List[Dict[str, object]] = [{"op": "impute", "col": "DistanceZ", "strategy": "mean"}]
    artifact, _model_id, fitted = legacy_envelope("logistic_regression", "classification", columns, rows, schema,
                                                  "label", ops)
    return Artifact(artifact, fitted, schema)


def _with_ops(fitted: Dict[str, object], ops: List[Dict[str, object]]) -> Dict[str, object]:
    return {**fitted, "ops": ops}


def _stored_ops(artifact: Artifact) -> List[Dict[str, object]]:
    ops = artifact.fitted_preprocessing["ops"]
    assert isinstance(ops, list)
    return [dict(op) for op in ops]


def _post_with_fitted(client: TestClient, artifact: Artifact, fitted: Optional[Dict[str, object]]) -> Json:
    body: Dict[str, object] = {"artifact_b64": artifact.artifact_b64, "feature_schema": artifact.feature_schema,
                               "rows": IMPUTE_ROWS}
    if fitted is not None:
        body["fitted_preprocessing"] = fitted
    r = client.post("/predict", json=body)
    out: Json = {"status": r.status_code, "body": r.json()}
    return out


def _stored_score(artifact: Artifact) -> List[float]:
    """The scores the model's own stored preprocessing gives IMPUTE_ROWS, computed outside the route."""
    estimator, envelope = artifacts.load_estimator(artifact.artifact_b64, None)
    X = preprocessing.transform(IMPUTE_ROWS, envelope["fitted_preprocessing"], list(FEATURES))
    return [float(p[1]) for p in estimator.predict_proba(X)]


def _scores(result: Json) -> List[float]:
    assert isinstance(result, dict) and result["status"] == 200, result
    body = result["body"]
    assert isinstance(body, dict) and isinstance(body["predictions"], list)
    out: List[float] = []
    for p in body["predictions"]:
        assert isinstance(p, dict) and isinstance(p["score"], float)
        out.append(p["score"])
    return out


def _refusal(result: Json) -> str:
    assert isinstance(result, dict) and result["status"] == 400, result
    return _detail(result["body"])


def test_predict_refuses_a_request_copy_without_the_impute(client: TestClient, impute_artifact: Artifact) -> None:
    fitted = _with_ops(impute_artifact.fitted_preprocessing, [])
    detail = _refusal(_post_with_fitted(client, impute_artifact, fitted))
    assert "the request's fitted preprocessing differs from the model's stored copy" in detail


def test_predict_refuses_a_request_copy_whose_fill_is_zeroed(client: TestClient, impute_artifact: Artifact) -> None:
    ops = _stored_ops(impute_artifact)
    ops[0]["fill"] = 0.0
    detail = _refusal(_post_with_fitted(client, impute_artifact, _with_ops(impute_artifact.fitted_preprocessing, ops)))
    assert "the request's fitted preprocessing differs from the model's stored copy" in detail


def test_predict_refuses_a_request_copy_that_drops_a_column_the_schema_keeps(client: TestClient,
                                                                            impute_artifact: Artifact) -> None:
    fitted = {**impute_artifact.fitted_preprocessing, "ops": [], "output_columns": ["Tenure", "Visits"]}
    detail = _refusal(_post_with_fitted(client, impute_artifact, fitted))
    assert "the request's fitted preprocessing differs from the model's stored copy" in detail


def test_predict_scores_the_models_own_copy_and_an_omitted_copy_alike(client: TestClient,
                                                                     impute_artifact: Artifact) -> None:
    expected = _stored_score(impute_artifact)
    own = _scores(_post_with_fitted(client, impute_artifact, impute_artifact.fitted_preprocessing))
    omitted = _scores(_post_with_fitted(client, impute_artifact, None))
    assert own == pytest.approx(expected) and omitted == pytest.approx(expected)


def test_predict_compares_the_request_copy_by_structure_not_text(client: TestClient,
                                                                 impute_artifact: Artifact) -> None:
    """The same fitted preprocessing with its keys in another order is the model's copy."""
    reordered = dict(reversed(list(impute_artifact.fitted_preprocessing.items())))
    scores = _scores(_post_with_fitted(client, impute_artifact, reordered))
    assert scores == pytest.approx(_stored_score(impute_artifact))


def test_predict_turns_a_feature_count_mismatch_into_a_400(client: TestClient, impute_artifact: Artifact) -> None:
    """An envelope that stores no fitted preprocessing scores with the request copy; one that drops a column the
    stored schema keeps reaches the estimator with 2 of its 3 features: a 400 naming both counts, never a 500."""
    estimator, _envelope = artifacts.load_estimator(impute_artifact.artifact_b64, None)
    key = "m57-no-stored-preprocessing"
    artifacts.MODEL_CACHE.put(key, (estimator, {"feature_schema": impute_artifact.feature_schema}))
    fitted = {"ops": [], "output_columns": ["Tenure", "Visits"]}
    r = client.post("/predict", json={"model_id": key, "fitted_preprocessing": fitted,
                                      "feature_schema": impute_artifact.feature_schema, "rows": IMPUTE_ROWS})
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and "expects 3" in detail and "2" in detail, r.text


@pytest.mark.parametrize(
    ("ops", "expected"),
    [
        ([{"op": "impute", "fill": 4.5}], "op 0 ('impute') lacks col"),
        ([{"op": "onehot", "col": "DistanceZ"}], "op 0 ('onehot') lacks vocabulary"),
        ([{"op": "rescale", "col": "DistanceZ"}], "op 0 ('rescale') is not a known op"),
    ],
)
def test_predict_refuses_a_malformed_request_copy_with_a_400(client: TestClient, impute_artifact: Artifact,
                                                             ops: List[Json], expected: str) -> None:
    """An envelope that stores no fitted preprocessing scores with the request copy only after its shape is checked:
    an op lacking a key it reads, or an unknown op, is a 400 naming the op and the key, never a 500."""
    estimator, _envelope = artifacts.load_estimator(impute_artifact.artifact_b64, None)
    key = "m57-malformed-request-copy"
    artifacts.MODEL_CACHE.put(key, (estimator, {"feature_schema": impute_artifact.feature_schema}))
    fitted = {"ops": ops, "output_columns": ["Tenure", "Visits", "DistanceZ"]}
    r = client.post("/predict", json={"model_id": key, "fitted_preprocessing": fitted,
                                      "feature_schema": impute_artifact.feature_schema, "rows": IMPUTE_ROWS})
    detail = _detail(r.json()) if r.status_code == 400 else r.text
    assert r.status_code == 400 and expected in detail, r.text
