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
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app import artifacts


# ---------------------------------------------------------------------------
# Legitimate artifacts still load
# ---------------------------------------------------------------------------

def _fitted_estimators() -> list:
    Xc, yc = make_classification(n_samples=120, n_features=5, random_state=1)
    Xr, yr = make_regression(n_samples=120, n_features=5, random_state=1)
    return [
        (LogisticRegression(max_iter=200).fit(Xc, yc), Xc),
        (RandomForestClassifier(n_estimators=8, random_state=1).fit(Xc, yc), Xc),
        (MLPClassifier(hidden_layer_sizes=(8,), max_iter=200, random_state=1).fit(Xc, yc), Xc),
        (Ridge().fit(Xr, yr), Xr),
        (GradientBoostingRegressor(n_estimators=8, random_state=1).fit(Xr, yr), Xr),
        (make_pipeline(StandardScaler(), LogisticRegression(max_iter=200)).fit(Xc, yc), Xc),
    ]


@pytest.mark.parametrize("estimator,X", _fitted_estimators(), ids=lambda v: type(v).__name__)
def test_estimator_round_trips_through_restricted_loader(estimator: Any, X: np.ndarray) -> None:
    artifact_b64, _ = artifacts.serialize_envelope(estimator, {}, [])
    loaded, envelope = artifacts.deserialize_envelope(artifact_b64)
    assert envelope["format"] == "joblib"
    np.testing.assert_allclose(loaded.predict(X), estimator.predict(X))


# ---------------------------------------------------------------------------
# Hostile artifacts are refused before anything runs
# ---------------------------------------------------------------------------

class _RunsOnLoad:
    """Pickles to a call of ``target(*args)``: the classic CWE-502 payload shape."""

    def __init__(self, target: Any, args: tuple) -> None:
        self.target = target
        self.args = args

    def __reduce__(self):  # noqa: D401 - pickle protocol
        return (self.target, self.args)


def _envelope_for(obj: Any) -> str:
    buf = io.BytesIO()
    joblib.dump(obj, buf)
    envelope = {
        "format": "joblib",
        "version": artifacts.ENVELOPE_VERSION,
        "payload_b64": base64.b64encode(buf.getvalue()).decode("ascii"),
        "fitted_preprocessing": {},
        "feature_schema": [],
    }
    return base64.b64encode(json.dumps(envelope).encode("utf-8")).decode("ascii")


def test_os_system_payload_is_refused_and_does_not_run(tmp_path: Path) -> None:
    sentinel = tmp_path / "pwned"
    artifact = _envelope_for(_RunsOnLoad(os.system, (f"touch {sentinel}",)))
    with pytest.raises(pickle.UnpicklingError, match=r"Refusing to load (posix|nt|os)\.system"):
        artifacts.deserialize_envelope(artifact)
    assert not sentinel.exists()


def test_subprocess_payload_is_refused(tmp_path: Path) -> None:
    sentinel = tmp_path / "pwned"
    artifact = _envelope_for(_RunsOnLoad(subprocess.call, (["touch", str(sentinel)],)))
    with pytest.raises(pickle.UnpicklingError, match="Refusing to load subprocess.call"):
        artifacts.deserialize_envelope(artifact)
    assert not sentinel.exists()


def test_builtin_eval_payload_is_refused() -> None:
    artifact = _envelope_for(_RunsOnLoad(eval, ("__import__('os').getcwd()",)))
    with pytest.raises(pickle.UnpicklingError, match="Refusing to load builtins.eval"):
        artifacts.deserialize_envelope(artifact)


def test_plain_pickle_with_stdlib_globals_is_refused() -> None:
    # A stream built with the standard pickler, not joblib, naming an arbitrary module.
    payload = pickle.dumps(_RunsOnLoad(os.getcwd, ()))
    envelope = {
        "format": "joblib",
        "version": artifacts.ENVELOPE_VERSION,
        "payload_b64": base64.b64encode(payload).decode("ascii"),
        "fitted_preprocessing": {},
        "feature_schema": [],
    }
    artifact = base64.b64encode(json.dumps(envelope).encode("utf-8")).decode("ascii")
    with pytest.raises(pickle.UnpicklingError):
        artifacts.deserialize_envelope(artifact)


def test_refused_artifact_is_not_cached() -> None:
    artifact = _envelope_for(_RunsOnLoad(eval, ("1",)))
    key = artifacts.artifact_hash(artifact)
    with pytest.raises(pickle.UnpicklingError):
        artifacts.load_estimator(artifact, None)
    assert artifacts.MODEL_CACHE.get(key) is None


def test_allow_list_shape() -> None:
    assert artifacts._is_allowed_global("sklearn.linear_model._logistic", "LogisticRegression")
    assert artifacts._is_allowed_global("numpy", "ndarray")
    assert artifacts._is_allowed_global("collections", "OrderedDict")
    assert not artifacts._is_allowed_global("os", "system")
    assert not artifacts._is_allowed_global("builtins", "getattr")
    assert not artifacts._is_allowed_global("sklearnx", "anything")
