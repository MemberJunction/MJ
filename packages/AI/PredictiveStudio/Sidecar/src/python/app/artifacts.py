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
from joblib.numpy_pickle import NumpyUnpickler

ENVELOPE_VERSION = 1


# ---------------------------------------------------------------------------
# Restricted unpickling
# ---------------------------------------------------------------------------
#
# joblib is pickle underneath, and pickle resolves and CALLS arbitrary importable
# callables while loading (that is how ``os.system`` in a ``__reduce__`` becomes remote
# code execution, CWE-502). Artifact bytes come back to this process from storage and
# from callers of ``/predict``, so they are not trusted input. Rather than switch
# formats (which would orphan every stored model) the loader below only resolves
# globals from the libraries an estimator legitimately serializes. Anything else is
# refused before it is constructed.
#
# Keep the lists tight. If a new estimator family needs another module, add the
# narrowest prefix that unblocks it and cover it in test_artifact_unpickle_guard.py.

#: Top-level packages whose every module may be resolved.
_ALLOWED_MODULE_PREFIXES: Tuple[str, ...] = (
    "sklearn.",
    "numpy.",
    "scipy.",
    "xgboost.",
    "lightgbm.",
    "pandas.",
    "joblib.",
)

#: Exact (module, name) pairs from the standard library that estimator pickles need.
_ALLOWED_GLOBALS: FrozenSet[Tuple[str, str]] = frozenset(
    {
        ("builtins", "object"),
        ("builtins", "set"),
        ("builtins", "frozenset"),
        ("builtins", "slice"),
        ("builtins", "range"),
        ("builtins", "bytearray"),
        ("builtins", "complex"),
        ("collections", "OrderedDict"),
        ("collections", "defaultdict"),
        ("collections", "deque"),
        ("copyreg", "_reconstructor"),
        ("_codecs", "encode"),
    }
)


def _is_allowed_global(module: str, name: str) -> bool:
    """True when ``module.name`` may be resolved while loading an artifact."""
    if (module, name) in _ALLOWED_GLOBALS:
        return True
    return any(module == prefix[:-1] or module.startswith(prefix) for prefix in _ALLOWED_MODULE_PREFIXES)


class RestrictedModelUnpickler(NumpyUnpickler):
    """joblib's unpickler with ``find_class`` gated by the allow-lists above."""

    def find_class(self, module: str, name: str) -> Any:  # noqa: D401 - pickle API
        if not _is_allowed_global(module, name):
            raise pickle.UnpicklingError(
                f"Refusing to load {module}.{name} from a model artifact: "
                "not an allowed estimator library"
            )
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
    """Deserialize raw joblib bytes back into an estimator.

    Uses :class:`RestrictedModelUnpickler` rather than ``joblib.load`` so a crafted
    artifact cannot execute code during deserialization. ``_model_to_bytes`` writes an
    uncompressed stream, which is what this reader expects.
    """
    return RestrictedModelUnpickler("<artifact>", io.BytesIO(raw)).load()


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
    """Decode a base64 envelope back into ``(estimator, envelope_dict)``."""
    import json

    envelope_json = base64.b64decode(artifact_b64.encode("ascii")).decode("utf-8")
    envelope = json.loads(envelope_json)
    payload = base64.b64decode(envelope["payload_b64"].encode("ascii"))
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
