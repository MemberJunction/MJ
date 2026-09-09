"""Artifact deserialization must never execute code from the artifact bytes.

Two halves: every estimator family the sidecar trains must still round-trip through the
restricted loader with identical predictions, and a crafted artifact whose pickle stream
names a callable outside the allowed libraries must be refused before that callable runs.
"""

from __future__ import annotations

import base64
import io
import json
import os
import pickle
import subprocess
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pytest
from sklearn.datasets import make_classification, make_regression
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.neural_network import MLPClassifier

from app import artifacts


# ---------------------------------------------------------------------------
# Legitimate artifacts still load
# ---------------------------------------------------------------------------

def _assert_same_predictions(loaded: Any, original: Any, X: np.ndarray) -> None:
    a, b = loaded.predict(X), original.predict(X)
    if np.issubdtype(np.asarray(a).dtype, np.number):
        # Tree ensembles can differ in the last bits after a round trip (summation order).
        np.testing.assert_allclose(a, b, rtol=1e-9, atol=1e-9)
    else:
        np.testing.assert_array_equal(a, b)


def _fitted_estimators() -> list:
    Xc, yc = make_classification(n_samples=120, n_features=5, random_state=1)
    Xr, yr = make_regression(n_samples=120, n_features=5, random_state=1)
    return [
        (LogisticRegression(max_iter=200).fit(Xc, yc), Xc),
        (RandomForestClassifier(n_estimators=8, random_state=1).fit(Xc, yc), Xc),
        (MLPClassifier(hidden_layer_sizes=(8,), max_iter=200, random_state=1).fit(Xc, yc), Xc),
        (Ridge().fit(Xr, yr), Xr),
    ]


@pytest.mark.parametrize("estimator,X", _fitted_estimators(), ids=lambda v: type(v).__name__)
def test_estimator_round_trips_through_restricted_loader(estimator: Any, X: np.ndarray) -> None:
    artifact_b64, _ = artifacts.serialize_envelope(estimator, {}, [])
    loaded, envelope = artifacts.deserialize_envelope(artifact_b64)
    assert envelope["format"] == "joblib"
    _assert_same_predictions(loaded, estimator, X)


# ---------------------------------------------------------------------------
# Every family the sidecar trains, through the production factory
# ---------------------------------------------------------------------------

def _families():
    from app import algorithms
    Xc, yc = make_classification(n_samples=120, n_features=5, random_state=1)
    Xr, yr = make_regression(n_samples=120, n_features=5, random_state=1)
    labels = np.array(["renew" if v else "lapse" for v in yc])
    cases = []
    for alg in algorithms.supported_algorithms():
        for pt, X, y in (("classification", Xc, labels), ("regression", Xr, yr)):
            try:
                est = algorithms.build_estimator(alg, pt, {})
            except Exception:
                continue
            if alg in ("xgboost", "lightgbm") and pt == "classification":
                y = yc
            cases.append(pytest.param(est, X, y, id=f"{alg}-{pt}"))
    return cases


@pytest.mark.parametrize("estimator,X,y", _families())
def test_every_trained_family_round_trips(estimator: Any, X: np.ndarray, y: np.ndarray) -> None:
    try:
        estimator.fit(X, y)
    except Exception as exc:  # driver unavailable on this machine (no OpenMP runtime)
        pytest.skip(f"driver unavailable: {exc}")
    estimator.mj_label_classes_ = ["lapse", "renew"]
    artifact_b64, _ = artifacts.serialize_envelope(estimator, {}, [])
    loaded, _ = artifacts.deserialize_envelope(artifact_b64)
    _assert_same_predictions(loaded, estimator, X)


def test_string_class_labels_round_trip() -> None:
    X, y = make_classification(n_samples=80, n_features=4, random_state=2)
    labels = np.array(["renew" if v else "lapse" for v in y])
    est = LogisticRegression(max_iter=200).fit(X, labels)
    loaded, _ = artifacts.deserialize_envelope(artifacts.serialize_envelope(est, {}, [])[0])
    assert list(loaded.classes_) == ["lapse", "renew"]


def test_legitimate_object_dtype_array_loads_through_the_guarded_path() -> None:
    # An object-dtype array of plain Python values is legitimate and is exactly the path a
    # bare pickle.load used to take around find_class. It must still load.
    X, y = make_classification(n_samples=80, n_features=4, random_state=5)
    est = LogisticRegression(max_iter=200).fit(X, y)
    est.classes_ = np.array(["lapse", "renew"], dtype=object)
    est.mj_label_classes_ = ["lapse", "renew"]
    loaded, _ = artifacts.deserialize_envelope(artifacts.serialize_envelope(est, {}, [])[0])
    assert loaded.classes_.dtype == object
    assert list(loaded.classes_) == ["lapse", "renew"]


def test_compressed_stream_loads() -> None:
    X, y = make_regression(n_samples=60, n_features=3, random_state=3)
    est = Ridge().fit(X, y)
    buf = io.BytesIO()
    joblib.dump(est, buf, compress=3)
    loaded, _ = artifacts.deserialize_envelope(_envelope_for_payload(buf.getvalue()))
    np.testing.assert_allclose(loaded.predict(X), est.predict(X))


# ---------------------------------------------------------------------------
# Hostile artifacts are refused before anything runs
# ---------------------------------------------------------------------------

class _RunsOnLoad:
    """Pickles to a call of ``target(*args)``: the classic CWE-502 payload shape."""

    def __init__(self, target: Any, args: tuple) -> None:
        self.target = target
        self.args = args

    def __reduce__(self):
        return (self.target, self.args)


def _envelope_for(obj: Any) -> str:
    return artifacts.serialize_envelope(obj, {}, [])[0]


def _envelope_for_payload(payload: bytes) -> str:
    envelope = {
        "format": "joblib",
        "version": artifacts.ENVELOPE_VERSION,
        "payload_b64": base64.b64encode(payload).decode("ascii"),
        "fitted_preprocessing": {},
        "feature_schema": [],
    }
    return base64.b64encode(json.dumps(envelope).encode("utf-8")).decode("ascii")


def _assert_refused(artifact: str, sentinel: Path | None = None, match: str = "Refusing to load") -> None:
    with pytest.raises(artifacts.ArtifactRefusedError, match=match):
        artifacts.deserialize_envelope(artifact)
    if sentinel is not None:
        assert not sentinel.exists()


def test_refusal_is_a_value_error_for_the_endpoint() -> None:
    assert issubclass(artifacts.ArtifactRefusedError, ValueError)
    assert issubclass(artifacts.ArtifactRefusedError, pickle.UnpicklingError)


def test_os_system_payload_is_refused_and_does_not_run(tmp_path: Path) -> None:
    sentinel = tmp_path / "pwned"
    _assert_refused(_envelope_for(_RunsOnLoad(os.system, (f"touch {sentinel}",))), sentinel)


def test_subprocess_payload_is_refused(tmp_path: Path) -> None:
    sentinel = tmp_path / "pwned"
    _assert_refused(_envelope_for(_RunsOnLoad(subprocess.call, (["touch", str(sentinel)],))), sentinel)


def test_builtin_eval_payload_is_refused() -> None:
    _assert_refused(_envelope_for(_RunsOnLoad(eval, ("__import__('os').getcwd()",))))


def test_object_dtype_array_payload_is_refused(tmp_path: Path) -> None:
    # The bypass: elements of an object array are unpickled by joblib's array wrapper with
    # a bare pickle.load, which never consulted find_class on the outer unpickler.
    sentinel = tmp_path / "pwned"
    bomb = np.empty(1, dtype=object)
    bomb[0] = _RunsOnLoad(os.system, (f"touch {sentinel}",))
    _assert_refused(_envelope_for(bomb), sentinel)


def test_object_dtype_array_nested_in_an_estimator_is_refused(tmp_path: Path) -> None:
    sentinel = tmp_path / "pwned"
    X, y = make_classification(n_samples=60, n_features=4, random_state=4)
    est = LogisticRegression(max_iter=100).fit(X, y)
    bomb = np.empty(1, dtype=object)
    bomb[0] = _RunsOnLoad(os.system, (f"touch {sentinel}",))
    est.classes_ = bomb
    _assert_refused(_envelope_for(est), sentinel)


def test_numpy_exec_gadget_is_refused(tmp_path: Path) -> None:
    from numpy.testing._private.utils import runstring
    sentinel = tmp_path / "pwned"
    _assert_refused(_envelope_for(_RunsOnLoad(runstring, (f"open({str(sentinel)!r}, 'w').close()", {}))), sentinel)


def test_reentrant_loader_gadgets_are_refused(tmp_path: Path) -> None:
    # Loaders that would unpickle a second stage with an unrestricted unpickler.
    inner = tmp_path / "stage2.pkl"
    sentinel = tmp_path / "pwned"
    joblib.dump(_RunsOnLoad(os.system, (f"touch {sentinel}",)), inner)
    gadgets = [(joblib.load, (str(inner),)), (np.load, (str(inner), None, True))]
    try:
        import pandas as pd
        gadgets.append((pd.read_pickle, (str(inner),)))
    except ImportError:
        pass
    for target, args in gadgets:
        _assert_refused(_envelope_for(_RunsOnLoad(target, args)), sentinel)


def test_legacy_ndarray_wrapper_is_refused() -> None:
    from joblib.numpy_pickle_compat import NDArrayWrapper
    _assert_refused(_envelope_for(NDArrayWrapper("x.npy", None)))


def test_plain_pickle_with_stdlib_globals_is_refused() -> None:
    _assert_refused(_envelope_for_payload(pickle.dumps(_RunsOnLoad(os.getcwd, ()))))


def test_garbage_payload_is_a_client_error_not_a_crash() -> None:
    _assert_refused(_envelope_for_payload(b"not a pickle at all"), match="could not be decoded")
    with pytest.raises(artifacts.ArtifactRefusedError):
        artifacts.deserialize_envelope("%%%not base64%%%")


def test_refused_artifact_is_not_cached() -> None:
    artifact = _envelope_for(_RunsOnLoad(eval, ("1",)))
    key = artifacts.artifact_hash(artifact)
    with pytest.raises(artifacts.ArtifactRefusedError):
        artifacts.load_estimator(artifact, None)
    assert artifacts.MODEL_CACHE.get(key) is None


def test_predict_endpoint_maps_refusal_to_400(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient
    from app.main import app
    sentinel = tmp_path / "pwned"
    client = TestClient(app)
    resp = client.post("/predict", json={
        "artifact_b64": _envelope_for(_RunsOnLoad(os.system, (f"touch {sentinel}",))),
        "fitted_preprocessing": {"output_columns": ["f0"]},
        "rows": [{"f0": 1.0}],
    })
    assert resp.status_code == 400, resp.text
    assert "Refusing to load" in resp.text
    assert not sentinel.exists()


def test_allow_list_shape() -> None:
    assert artifacts._is_allowed_global("sklearn.linear_model._logistic", "LogisticRegression")
    assert artifacts._is_allowed_global("numpy", "ndarray")
    assert artifacts._is_allowed_global("numpy.dtypes", "Float64DType")
    assert not artifacts._is_allowed_global("os", "system")
    assert not artifacts._is_allowed_global("builtins", "getattr")
    assert artifacts._is_allowed_global("_codecs", "encode")
    assert not artifacts._is_allowed_global("_codecs", "decode")
    assert not artifacts._is_allowed_global("numpy.testing._private.utils", "runstring")
    assert not artifacts._is_allowed_global("pandas", "read_pickle")
    assert not artifacts._is_allowed_global("joblib", "load")
    assert not artifacts._is_allowed_global("sklearn.linear_model._logistic", "anything_else")
