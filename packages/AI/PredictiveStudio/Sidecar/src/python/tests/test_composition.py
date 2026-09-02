"""Composed-model tests: bagging, stacking, frozen reuse, and the refusals.

These cover the runtime that turns the Architect's ``reify`` / ``compose`` decisions from
something recordable into something trainable. The refusal tests matter as much as the happy
paths — the whole point of freezing a reused component is that the failure modes are LOUD:
a graph that cannot be built as described must error rather than quietly train something else.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.datasets import make_classification, make_regression

from app import artifacts, composition
from app.composition import CompositionError, FrozenEstimator
from app.main import app
from app.schemas import TrainComponentNode

client = TestClient(app)


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

def _classification_data(n: int = 200, features: int = 5, seed: int = 3) -> Tuple[List[str], List[list]]:
    X, y = make_classification(
        n_samples=n, n_features=features, n_informative=3, n_redundant=1, random_state=seed
    )
    columns = [f"f{i}" for i in range(features)] + ["label"]
    rows = [[float(v) for v in X[i]] + ["renew" if y[i] == 1 else "lapse"] for i in range(n)]
    return columns, rows


def _regression_data(n: int = 200, features: int = 5, seed: int = 5) -> Tuple[List[str], List[list]]:
    X, y = make_regression(
        n_samples=n, n_features=features, n_informative=3, noise=6.0, random_state=seed
    )
    columns = [f"f{i}" for i in range(features)] + ["target"]
    rows = [[float(v) for v in X[i]] + [float(y[i])] for i in range(n)]
    return columns, rows


def _request(problem_type: str, graph: dict, root_driver: str, features: int = 5) -> dict:
    if problem_type == "classification":
        columns, rows = _classification_data(features=features)
        target = "label"
    else:
        columns, rows = _regression_data(features=features)
        target = "target"
    feature_cols = [c for c in columns if c != target]
    return {
        # `algorithm` still names the ROOT driver even for a composed model, so every
        # existing read path keeps working.
        "algorithm": root_driver,
        "problem_type": problem_type,
        "hyperparameters": {},
        "validation": {"strategy": "train_test_split", "test_size": 0.25, "holdout_size": 0.2},
        "feature_schema": [{"Name": c, "Kind": "numeric"} for c in feature_cols],
        "preprocessing": [{"op": "standardize", "cols": feature_cols}],
        "target": target,
        "data": {"columns": columns, "rows": rows},
        "component_graph": graph,
    }


def _bagging_graph(base: str = "random_forest", **hp) -> dict:
    return {
        "driver": "bagging",
        "hyperparameters": {"n_estimators": 3, "random_state": 0, **hp},
        "children": [{"driver": base, "slot": "base_estimator", "hyperparameters": {}}],
    }


def _stacking_graph() -> dict:
    return {
        "driver": "stacking",
        "hyperparameters": {"cv": 3},
        "children": [
            {"driver": "random_forest", "slot": "estimators", "hyperparameters": {"n_estimators": 10}},
            {"driver": "logistic_regression", "slot": "estimators", "hyperparameters": {}},
            {"driver": "logistic_regression", "slot": "final_estimator", "hyperparameters": {}},
        ],
    }


# ---------------------------------------------------------------------------
# happy paths through the real /train endpoint
# ---------------------------------------------------------------------------

def test_bagging_classification_trains_and_reports_every_node() -> None:
    resp = client.post("/train", json=_request("classification", _bagging_graph(), "bagging"))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["metrics"]["accuracy"] > 0.6
    states = body["component_states"]
    assert [s["driver"] for s in states] == ["bagging", "random_forest"]
    assert all(s["fitted"] for s in states)
    assert all(s["reuse_instance_id"] is None for s in states)
    # the base estimator's slot survives the round trip; the root fills no slot
    assert states[0]["slot"] is None
    assert states[1]["slot"] == "base_estimator"


def test_stacking_classification_trains_and_predicts() -> None:
    req = _request("classification", _stacking_graph(), "stacking")
    resp = client.post("/train", json=req)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["metrics"]["accuracy"] > 0.6

    states = body["component_states"]
    assert [s["driver"] for s in states] == [
        "stacking", "random_forest", "logistic_regression", "logistic_regression"
    ]
    assert [s["slot"] for s in states] == [
        None, "estimators", "estimators", "final_estimator"
    ]

    # the composed artifact round-trips through /predict like any other model
    columns = req["data"]["columns"]
    rows = [dict(zip(columns, r)) for r in req["data"]["rows"][:5]]
    predict = client.post("/predict", json={
        "artifact_b64": body["artifact_b64"],
        "fitted_preprocessing": body["fitted_preprocessing"],
        "feature_schema": req["feature_schema"],
        "rows": rows,
    })
    assert predict.status_code == 200, predict.text
    assert len(predict.json()["predictions"]) == 5


def test_bagging_regression_trains() -> None:
    resp = client.post(
        "/train", json=_request("regression", _bagging_graph(base="ridge"), "bagging")
    )
    assert resp.status_code == 200, resp.text
    assert [s["driver"] for s in resp.json()["component_states"]] == ["bagging", "ridge"]


def test_composed_importance_is_keyed_by_column_name_or_absent() -> None:
    """Per-node importance uses real column names, and a node without one reports none."""
    resp = client.post("/train", json=_request("classification", _stacking_graph(), "stacking"))
    states = resp.json()["component_states"]
    by_driver = {(s["driver"], s["slot"]): s for s in states}

    rf = by_driver[("random_forest", "estimators")]
    assert set(rf["feature_importance"]) == {"f0", "f1", "f2", "f3", "f4"}
    # The stacking wrapper itself has no importances over the INPUT features — its
    # final estimator is fitted on meta-features — so it reports none rather than zeros.
    root = by_driver[("stacking", None)]
    assert root["feature_importance"] is None


# ---------------------------------------------------------------------------
# frozen reuse
# ---------------------------------------------------------------------------

def _train_reusable(features: int = 5) -> Tuple[str, dict]:
    """Train a plain model and return (artifact_b64, the request it was trained on)."""
    columns, rows = _classification_data(features=features)
    req = {
        "algorithm": "logistic_regression",
        "problem_type": "classification",
        "hyperparameters": {},
        "validation": {"strategy": "none"},
        "feature_schema": [{"Name": c, "Kind": "numeric"} for c in columns if c != "label"],
        "preprocessing": [],
        "target": "label",
        "data": {"columns": columns, "rows": rows},
    }
    resp = client.post("/train", json=req)
    assert resp.status_code == 200, resp.text
    return resp.json()["artifact_b64"], req


def test_reused_child_is_not_refit() -> None:
    """A reused component keeps its exact coefficients through an enclosing fit.

    This is the guarantee the whole reuse story rests on: if sklearn's clone-then-fit
    silently rebuilt the child, the model trained would not be the model described.
    """
    artifact, _ = _train_reusable()
    before, _envelope = artifacts.deserialize_envelope(artifact)
    coef_before = np.array(before.coef_, dtype=float).copy()

    graph = {
        "driver": "bagging",
        "hyperparameters": {"n_estimators": 3, "random_state": 0},
        "children": [{"driver": "logistic_regression", "slot": "base_estimator",
                      "reuse_instance_id": "child-1"}],
    }
    req = _request("classification", graph, "bagging")
    req["preprocessing"] = []  # match the matrix the child was fitted on
    req["component_artifacts"] = {"child-1": artifact}

    resp = client.post("/train", json=req)
    assert resp.status_code == 200, resp.text
    states = resp.json()["component_states"]

    child = states[1]
    assert child["reuse_instance_id"] == "child-1"
    assert child["fitted"] is False  # reported honestly as reused, not trained here

    rebuilt = composition.build_from_graph(
        TrainComponentNode(**graph), "classification", ["f0", "f1", "f2", "f3", "f4"],
        {"child-1": artifact},
    )
    rebuilt.fit(np.zeros((6, 5)), np.array([0, 1, 0, 1, 0, 1]))
    inner = rebuilt.estimator.estimator
    assert np.allclose(np.array(inner.coef_, dtype=float), coef_before)


def test_frozen_estimator_survives_clone() -> None:
    """``clone`` is what every ensemble calls before fitting — the freeze must survive it."""
    from sklearn.base import clone

    artifact, _ = _train_reusable()
    estimator, _envelope = artifacts.deserialize_envelope(artifact)
    frozen = FrozenEstimator(estimator)

    assert clone(frozen) is frozen
    assert frozen.fit(np.zeros((3, 5)), np.array([0, 1, 0])) is frozen
    assert frozen._estimator_type == "classifier"


def test_missing_reuse_artifact_is_an_error_not_a_refit() -> None:
    node = TrainComponentNode(**{
        "driver": "bagging",
        "children": [{"driver": "logistic_regression", "slot": "base_estimator",
                      "reuse_instance_id": "absent"}],
    })
    with pytest.raises(CompositionError, match="no artifact"):
        composition.build_from_graph(node, "classification", ["f0"], {})


def test_reused_component_of_the_wrong_width_is_refused() -> None:
    """Reuse across a different feature matrix is refused, not silently mispredicted."""
    artifact, _ = _train_reusable(features=5)
    node = TrainComponentNode(**{
        "driver": "bagging",
        "children": [{"driver": "logistic_regression", "slot": "base_estimator",
                      "reuse_instance_id": "child-1"}],
    })
    with pytest.raises(CompositionError, match="fitted on 5 features"):
        composition.build_from_graph(
            node, "classification", ["a", "b", "c"], {"child-1": artifact}
        )


# ---------------------------------------------------------------------------
# refusals on graph shape
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("graph,message", [
    ({"driver": "bagging", "children": [{"driver": "ridge", "slot": "nonsense"}]},
     "no slot called 'nonsense'"),
    ({"driver": "bagging", "children": [{"driver": "ridge"}]},
     "does not name the slot"),
    ({"driver": "bagging", "children": []},
     "exactly 1 component in slot 'base_estimator'"),
    ({"driver": "bagging", "children": [
        {"driver": "ridge", "slot": "base_estimator"},
        {"driver": "ridge", "slot": "base_estimator"}]},
     "exactly 1 component in slot 'base_estimator'"),
    ({"driver": "stacking", "children": [
        {"driver": "ridge", "slot": "estimators"},
        {"driver": "ridge", "slot": "final_estimator"}]},
     "at least 2 components"),
    ({"driver": "stacking", "children": [
        {"driver": "ridge", "slot": "estimators"},
        {"driver": "ridge", "slot": "estimators"}]},
     "exactly 1 component in slot 'final_estimator'"),
])
def test_malformed_graphs_are_refused(graph: dict, message: str) -> None:
    with pytest.raises(CompositionError, match=message):
        composition.build_from_graph(TrainComponentNode(**graph), "regression", ["f0"], {})


def test_unknown_leaf_driver_surfaces_the_algorithm_error() -> None:
    node = TrainComponentNode(**{
        "driver": "bagging",
        "children": [{"driver": "not_an_algorithm", "slot": "base_estimator"}],
    })
    with pytest.raises(ValueError):
        composition.build_from_graph(node, "regression", ["f0"], {})


def test_deeply_self_nested_graph_is_refused() -> None:
    node: Dict[str, object] = {"driver": "ridge"}
    for _ in range(composition.MAX_DEPTH + 2):
        node = {"driver": "bagging", "children": [dict(node, slot="base_estimator")]}
    with pytest.raises(CompositionError, match="nested more than"):
        composition.build_from_graph(TrainComponentNode(**node), "regression", ["f0"], {})


def test_malformed_graph_becomes_a_400_not_a_500() -> None:
    req = _request("regression", {"driver": "bagging", "children": []}, "bagging")
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "base_estimator" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# the un-composed path is untouched
# ---------------------------------------------------------------------------

def test_request_without_a_graph_reports_no_component_states() -> None:
    columns, rows = _classification_data()
    resp = client.post("/train", json={
        "algorithm": "logistic_regression",
        "problem_type": "classification",
        "hyperparameters": {},
        "validation": {"strategy": "none"},
        "feature_schema": [{"Name": c, "Kind": "numeric"} for c in columns if c != "label"],
        "preprocessing": [],
        "target": "label",
        "data": {"columns": columns, "rows": rows},
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["component_states"] is None
