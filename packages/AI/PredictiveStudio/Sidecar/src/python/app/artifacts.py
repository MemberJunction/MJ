"""Model artifact envelope (serialize/deserialize) + warm LRU model cache.

Envelope shape (base64-encoded as ``artifact_b64`` on the wire)::

    {
      "format": "joblib" | "xgboost-json" | "lightgbm-text",
      "version": 1,
      "payload_b64": "<base64 of the serialized model bytes>",
      "fitted_preprocessing": { ... },
      "feature_schema": [ {"Name": ..., "Kind": ...}, ... ]
    }

All estimators are serialized via ``joblib`` (sklearn, xgboost's sklearn
wrapper, and lightgbm's sklearn wrapper all pickle cleanly). The ``format``
field is kept for forward-compat with native booster dumps.

A process-wide ``OrderedDict``-backed LRU cache keeps recently deserialized
``(estimator, envelope)`` pairs keyed by a content hash of the artifact, so
repeated ``/predict`` calls against the same model skip the deserialize cost.
"""

from __future__ import annotations

import base64
import hashlib
import io
import pickle
import threading
from collections import OrderedDict
from typing import Any, Dict, FrozenSet, List, Optional, Tuple

import joblib
from joblib.numpy_pickle import NumpyArrayWrapper, NumpyUnpickler
from joblib.numpy_pickle_utils import _ensure_native_byte_order, _read_fileobject

ENVELOPE_VERSION = 1


# ---------------------------------------------------------------------------
# Restricted unpickling
# ---------------------------------------------------------------------------
#
# joblib is pickle underneath, and pickle resolves and CALLS importable callables while
# loading: a stream whose reduce target is ``os.system`` executes it (CWE-502). Artifact
# bytes come back to this process from storage and from ``/predict`` callers, so they are
# not trusted input. Rather than change formats (which would orphan every stored model)
# the loader below applies three rules, each of which closed a proven bypass:
#
# 1. ``find_class`` resolves ONLY the exact (module, name) pairs listed in
#    ``_ALLOWED_GLOBALS``. Whole-package allow-lists were tried first and were defeated
#    through ``numpy.testing._private.utils.runstring`` (an ``exec`` wrapper) and through
#    ``pandas.read_pickle`` / ``joblib.load`` / ``numpy.load``, which re-enter an
#    unrestricted unpickler on an attacker-chosen path. The list was produced by loading
#    every estimator family the sidecar trains, across hyperparameter variants, and
#    recording what pickle asked for. Nothing on it takes a path, URL or code string.
# 2. Object-dtype arrays are guarded. joblib's ``NumpyArrayWrapper.read_array`` unpickles
#    the elements of an object array with a bare module-level ``pickle.load`` on the same
#    stream, which bypasses any ``find_class`` override on the outer unpickler. The
#    wrapper class name is therefore mapped to ``_GuardedArrayWrapper``, which routes that
#    nested load through this same restricted unpickler. String class labels make object
#    arrays a normal part of a legitimate artifact, so refusing them is not an option.
# 3. Every failure surfaces as ``ArtifactRefusedError``, which is both an
#    ``UnpicklingError`` and a ``ValueError``, so ``/predict`` maps it to 400 rather than a
#    500 with a traceback.
#
# If a new estimator family fails to load with "not an allowed global", add the narrowest
# exact pairs it needs to ``_ALLOWED_GLOBALS`` and extend the round-trip test. Do not add a
# module prefix.

#: Exact (module, name) pairs pickle may resolve while loading an artifact. Everything here
#: is a class or a reconstructor that takes no path, URL or source text.
_ALLOWED_GLOBALS: FrozenSet[Tuple[str, str]] = frozenset(
    {
        # Python
        ("builtins", "bytearray"),
        ("collections", "OrderedDict"),
        ("collections", "defaultdict"),
        # joblib writes object arrays with pickle protocol 2, which spells bytes as _codecs.encode(str, "latin1")
        ("_codecs", "encode"),
        # numpy (1.x and 2.x module spellings)
        ("numpy", "dtype"),
        ("numpy", "ndarray"),
        ("numpy.core.multiarray", "scalar"),
        ("numpy.core.multiarray", "_reconstruct"),
        ("numpy._core.multiarray", "scalar"),
        ("numpy._core.multiarray", "_reconstruct"),
        ("numpy.random._pickle", "__bit_generator_ctor"),
        ("numpy.random._pickle", "__randomstate_ctor"),
        # joblib array container (mapped to the guarded subclass below)
        ("joblib.numpy_pickle", "NumpyArrayWrapper"),
        # scikit-learn
        ("sklearn.ensemble._forest", "RandomForestClassifier"),
        ("sklearn.ensemble._forest", "RandomForestRegressor"),
        ("sklearn.linear_model._logistic", "LogisticRegression"),
        ("sklearn.linear_model._ridge", "Ridge"),
        ("sklearn.neural_network._multilayer_perceptron", "MLPClassifier"),
        ("sklearn.neural_network._multilayer_perceptron", "MLPRegressor"),
        ("sklearn.neural_network._stochastic_optimizers", "AdamOptimizer"),
        ("sklearn.neural_network._stochastic_optimizers", "SGDOptimizer"),
        ("sklearn.preprocessing._label", "LabelBinarizer"),
        ("sklearn.preprocessing._label", "LabelEncoder"),
        ("sklearn.tree._classes", "DecisionTreeClassifier"),
        ("sklearn.tree._classes", "DecisionTreeRegressor"),
        ("sklearn.tree._tree", "Tree"),
        # gradient boosting drivers
        ("xgboost.core", "Booster"),
        ("xgboost.sklearn", "XGBClassifier"),
        ("xgboost.sklearn", "XGBRegressor"),
        ("lightgbm.basic", "Booster"),
        ("lightgbm.sklearn", "LGBMClassifier"),
        ("lightgbm.sklearn", "LGBMRegressor"),
    }
)


def _is_allowed_global(module: str, name: str) -> bool:
    """True when ``module.name`` may be resolved while loading an artifact."""
    if (module, name) in _ALLOWED_GLOBALS:
        return True
    # numpy 2 pickles dtypes as classes of the numpy.dtypes module (Float64DType, ...).
    return module == "numpy.dtypes" and name.endswith("DType")


class ArtifactRefusedError(pickle.UnpicklingError, ValueError):
    """An artifact could not be loaded safely. Both an UnpicklingError and a ValueError so
    callers that map ValueError to a client error (``/predict``) treat it as one."""


class _GuardedArrayWrapper(NumpyArrayWrapper):
    """joblib's array container with the object-array path routed through the restricted
    unpickler instead of a bare ``pickle.load``."""

    def read_array(self, unpickler: "RestrictedModelUnpickler") -> Any:  # type: ignore[override]
        if self.dtype.hasobject:
            nested = RestrictedModelUnpickler(unpickler.filename, unpickler.file_handle)
            return _ensure_native_byte_order(nested.load())
        return super().read_array(unpickler)


class RestrictedModelUnpickler(NumpyUnpickler):
    """joblib's unpickler with ``find_class`` gated by ``_ALLOWED_GLOBALS``."""

    def find_class(self, module: str, name: str) -> Any:
        if not _is_allowed_global(module, name):
            raise ArtifactRefusedError(
                f"Refusing to load {module}.{name} from a model artifact: not an allowed global"
            )
        if (module, name) == ("joblib.numpy_pickle", "NumpyArrayWrapper"):
            return _GuardedArrayWrapper
        return super().find_class(module, name)


# ---------------------------------------------------------------------------
# Serialize / deserialize
# ---------------------------------------------------------------------------

def _model_to_bytes(estimator: Any) -> bytes:
    """Serialize an estimator to raw bytes via joblib (in-memory, no temp file)."""
    buf = io.BytesIO()
    joblib.dump(estimator, buf)
    return buf.getvalue()


def _bytes_to_model(raw: bytes) -> Any:
    """Deserialize raw joblib bytes back into an estimator through the restricted loader.

    ``_read_fileobject`` is joblib's own compression detection, so streams written with
    ``compress=`` load the same way ``joblib.load`` would. Any failure, including a refused
    global, a truncated stream or a malformed payload, is raised as ArtifactRefusedError.
    """
    try:
        with _read_fileobject(io.BytesIO(raw), "<artifact>", mmap_mode=None) as fobj:
            return RestrictedModelUnpickler("<artifact>", fobj).load()
    except ArtifactRefusedError:
        raise
    except Exception as exc:  # noqa: BLE001 - every decode failure is a client error
        raise ArtifactRefusedError(f"Artifact could not be decoded: {type(exc).__name__}: {exc}") from exc


def serialize_envelope(
    estimator: Any,
    fitted_preprocessing: Dict[str, Any],
    feature_schema: List[Dict[str, Any]],
) -> Tuple[str, str]:
    """Serialize an estimator + metadata into a base64 envelope.

    Returns ``(artifact_b64, model_id)`` where ``model_id`` is a stable content
    hash usable as a warm-cache key.
    """
    payload = _model_to_bytes(estimator)
    envelope = {
        "format": "joblib",
        "version": ENVELOPE_VERSION,
        "payload_b64": base64.b64encode(payload).decode("ascii"),
        "fitted_preprocessing": fitted_preprocessing,
        "feature_schema": feature_schema,
    }
    import json

    envelope_json = json.dumps(envelope, separators=(",", ":"), sort_keys=True)
    artifact_b64 = base64.b64encode(envelope_json.encode("utf-8")).decode("ascii")
    model_id = hashlib.sha256(artifact_b64.encode("ascii")).hexdigest()
    return artifact_b64, model_id


def deserialize_envelope(artifact_b64: str) -> Tuple[Any, Dict[str, Any]]:
    """Decode a base64 envelope back into ``(estimator, envelope_dict)``.

    Raises ArtifactRefusedError (a ValueError) for anything that is not a well-formed
    envelope produced by :func:`serialize_envelope`.
    """
    import json

    try:
        envelope_json = base64.b64decode(artifact_b64.encode("ascii"), validate=True).decode("utf-8")
        envelope = json.loads(envelope_json)
        if not isinstance(envelope, dict) or envelope.get("format") != "joblib":
            raise ArtifactRefusedError("Artifact envelope is not a joblib envelope")
        payload = base64.b64decode(str(envelope["payload_b64"]).encode("ascii"), validate=True)
    except ArtifactRefusedError:
        raise
    except Exception as exc:  # noqa: BLE001 - malformed envelope is a client error
        raise ArtifactRefusedError(f"Artifact envelope could not be decoded: {type(exc).__name__}: {exc}") from exc
    estimator = _bytes_to_model(payload)
    return estimator, envelope


def artifact_hash(artifact_b64: str) -> str:
    """Content hash (sha256 hex) of a base64 artifact — the warm-cache key.

    Identical to the ``model_id`` returned by :func:`serialize_envelope`, so a
    freshly trained model and a re-submitted artifact resolve to the same slot.
    """
    return hashlib.sha256(artifact_b64.encode("ascii")).hexdigest()


# ---------------------------------------------------------------------------
# Warm LRU cache
# ---------------------------------------------------------------------------

class ModelCache:
    """Thread-safe LRU cache of deserialized ``(estimator, envelope)`` pairs."""

    def __init__(self, max_size: int = 32) -> None:
        """Create an LRU cache bounded to ``max_size`` deserialized models."""
        self._max_size = max_size
        self._store: "OrderedDict[str, Tuple[Any, Dict[str, Any]]]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Tuple[Any, Dict[str, Any]]]:
        """Return the cached pair for ``key``, marking it most-recently-used.

        Returns ``None`` on a miss. Thread-safe.
        """
        with self._lock:
            if key not in self._store:
                return None
            self._store.move_to_end(key)
            return self._store[key]

    def put(self, key: str, value: Tuple[Any, Dict[str, Any]]) -> None:
        """Insert/refresh ``key`` as most-recently-used, evicting the LRU entry
        when the cache exceeds ``max_size``. Thread-safe."""
        with self._lock:
            self._store[key] = value
            self._store.move_to_end(key)
            while len(self._store) > self._max_size:
                self._store.popitem(last=False)

    def __len__(self) -> int:
        """Current number of cached models. Thread-safe."""
        with self._lock:
            return len(self._store)


# Process-global cache instance.
MODEL_CACHE = ModelCache()


def load_estimator(
    artifact_b64: Optional[str], model_id: Optional[str]
) -> Tuple[Any, Dict[str, Any]]:
    """Resolve an estimator from the warm cache or by deserializing the artifact.

    Resolution order:
      1. ``model_id`` cache hit (no artifact bytes needed).
      2. ``artifact_b64`` -> compute hash -> cache hit, or deserialize + cache.

    Raises ``ValueError`` when neither a usable cache key nor artifact is given.
    """
    if model_id:
        cached = MODEL_CACHE.get(model_id)
        if cached is not None:
            return cached

    if not artifact_b64:
        raise ValueError(
            "No artifact available: provide artifact_b64, or a model_id that is "
            "still in the warm cache."
        )

    key = artifact_hash(artifact_b64)
    cached = MODEL_CACHE.get(key)
    if cached is not None:
        return cached

    estimator, envelope = deserialize_envelope(artifact_b64)
    MODEL_CACHE.put(key, (estimator, envelope))
    return estimator, envelope
