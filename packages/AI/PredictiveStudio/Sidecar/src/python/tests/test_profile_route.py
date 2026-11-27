"""POST /profile (PR 5, A4 attack 10; D5-32): the read-only profile of a draft unit's development rows.

The route takes feature columns, labels, a fold count and a seed in the body (no snapshot, no training run, no row
written anywhere: it holds no database connection) and returns, per field, the single-feature inner-CV log-loss
improvement over the dummy (class prior) with its paired-bootstrap interval and a near-unique flag, plus the
all-features GLM's improvement over the dummy on the same folds.
"""

from __future__ import annotations

import numpy as np
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

N = 600
SEED = 42


def _world() -> tuple[list[str], dict[str, list[float | str | None]]]:
    rng = np.random.default_rng(SEED)
    y = (rng.random(N) < 0.3).astype(int)
    labels = [str(v) for v in y.tolist()]
    leaky = [float(v) for v in y.tolist()]
    noise = [float(v) for v in rng.normal(size=N).tolist()]
    region = [str(v) for v in rng.choice(["EU", "US", "APAC"], size=N).tolist()]
    ident = [f"M-{i:05d}" for i in range(N)]
    return labels, {"leaky": leaky, "noise": noise, "region": region, "ident": ident}


def _profile(features: dict[str, list[float | str | None]], labels: list[str], folds: int = 5) -> dict:
    res = client.post("/profile", json={"features": features, "labels": labels, "folds": folds, "seed": SEED})
    assert res.status_code == 200, res.text
    return res.json()


def _field(body: dict, name: str) -> dict:
    return next(f for f in body["fields"] if f["name"] == name)


def test_leaky_field_interval_excludes_zero_and_noise_field_includes_it() -> None:
    labels, features = _world()
    body = _profile({"leaky": features["leaky"], "noise": features["noise"]}, labels)
    leaky = _field(body, "leaky")["improvement"]
    noise = _field(body, "noise")["improvement"]
    assert leaky["metric"] == "log-loss"
    assert leaky["interval"]["lower"] > 0, leaky
    assert noise["interval"]["lower"] <= 0 <= noise["interval"]["upper"], noise
    assert leaky["n"] == N and noise["n"] == N


def test_glm_vs_dummy_and_compute_seconds() -> None:
    labels, features = _world()
    with_leak = _profile({"leaky": features["leaky"], "noise": features["noise"]}, labels)
    assert with_leak["glmVsDummy"]["interval"]["lower"] > 0
    assert with_leak["computeSeconds"] >= 0
    noise_only = _profile({"noise": features["noise"], "region": features["region"]}, labels)
    g = noise_only["glmVsDummy"]["interval"]
    assert g["lower"] <= 0, g


def test_near_unique_identifier_is_flagged_and_strings_and_nulls_are_accepted() -> None:
    labels, features = _world()
    region = list(features["region"])
    region[0] = None
    body = _profile({"ident": features["ident"], "region": region}, labels)
    assert _field(body, "ident")["nearUnique"] is True
    assert _field(body, "region")["nearUnique"] is False


def test_profile_is_deterministic_for_a_seed() -> None:
    labels, features = _world()
    a = _profile({"noise": features["noise"]}, labels)
    b = _profile({"noise": features["noise"]}, labels)
    assert a["fields"] == b["fields"] and a["glmVsDummy"] == b["glmVsDummy"]


def test_mismatched_lengths_and_one_class_are_refused_422() -> None:
    labels, features = _world()
    short = client.post("/profile", json={"features": {"noise": features["noise"][:10]}, "labels": labels, "folds": 5, "seed": SEED})
    assert short.status_code == 422
    one_class = client.post("/profile", json={"features": {"noise": features["noise"]}, "labels": ["1"] * N, "folds": 5, "seed": SEED})
    assert one_class.status_code == 422


def test_route_writes_nothing() -> None:
    """The route takes everything it reads in the body: it imports no database client and holds no connection."""
    import app.profile as profile_module

    source = open(profile_module.__file__, encoding="utf-8").read()
    for forbidden in ("pyodbc", "pymssql", "sqlalchemy", "requests", "httpx", "open("):
        assert forbidden not in source, forbidden
