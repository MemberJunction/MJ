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
import threading
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import joblib

ENVELOPE_VERSION = 1


# ---------------------------------------------------------------------------
# Serialize / deserialize
# ---------------------------------------------------------------------------

def _model_to_bytes(estimator: Any) -> bytes:
    buf = io.BytesIO()
    joblib.dump(estimator, buf)
    return buf.getvalue()


def _bytes_to_model(raw: bytes) -> Any:
    return joblib.load(io.BytesIO(raw))


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
    return hashlib.sha256(artifact_b64.encode("ascii")).hexdigest()


# ---------------------------------------------------------------------------
# Warm LRU cache
# ---------------------------------------------------------------------------

class ModelCache:
    """Thread-safe LRU cache of deserialized ``(estimator, envelope)`` pairs."""

    def __init__(self, max_size: int = 32) -> None:
        self._max_size = max_size
        self._store: "OrderedDict[str, Tuple[Any, Dict[str, Any]]]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Tuple[Any, Dict[str, Any]]]:
        with self._lock:
            if key not in self._store:
                return None
            self._store.move_to_end(key)
            return self._store[key]

    def put(self, key: str, value: Tuple[Any, Dict[str, Any]]) -> None:
        with self._lock:
            self._store[key] = value
            self._store.move_to_end(key)
            while len(self._store) > self._max_size:
                self._store.popitem(last=False)

    def __len__(self) -> int:
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
