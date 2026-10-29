"""Planted-truth gate tests of the trainer. A test that is a gate's measurement carries
`@pytest.mark.gate("<dataset> -> <criterion>")` (the gate's `MJ: Tests` row Name; the gate's check in
integration-test-suite/src/checks/ runs its node id through PsGatePytest.Run); a test that only adds coverage to a gate
measured elsewhere carries `@pytest.mark.covers("<row Name>")`. They read the truth suite's data cache through
truthsuite.paths (tests/tools/trainer_fixture.py; never skipped: a seed missing from the cache fails). 400-seed gates
also carry `seeds400`; they belong to the statistical suite."""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from collections.abc import Iterator

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from app import artifacts
from app.artifacts_v2 import PredictorEnvelope
from app.main import app
from app.run import run_trainer
from app.trainer import TrainedPredictor
from app.trainer_schemas import ReturnedArtifact, TrainerCompleted, TrainerRequest, TrainerResult
from tests.tools.trainer_fixture import NUMERIC, FileServer, JsonObject, JsonValue, world_dir

_CLIENT = TestClient(app)
_RESULT = TypeAdapter(TrainerResult)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "gate(name): planted-truth gate, named as its MJ: Tests row Name")
    config.addinivalue_line("markers", "seeds400: 400-seed statistical gate (suite Training (statistical))")
    config.addinivalue_line("markers", "covers(name): additional coverage for a gate registered with another test")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """400-seed tests run with PS_SEEDS400=1 or when their node id is named on the command line (PsGatePytest.Run
    names each gate's nodes); a plain `pytest tests/gates` run deselects them."""
    if os.environ.get("PS_SEEDS400") == "1":
        return
    named = [str(a) for a in config.args if "::" in str(a)]

    def is_named(item: pytest.Item) -> bool:
        return any(item.nodeid == a or item.nodeid.startswith(f"{a}[") for a in named)

    dropped = [i for i in items if i.get_closest_marker("seeds400") is not None and not is_named(i)]
    if dropped:
        config.hook.pytest_deselected(items=dropped)
        items[:] = [i for i in items if i not in dropped]


def sidecar_url() -> str | None:
    """A running sidecar's base URL (PS_SIDECAR_URL, runtime verification), or None to run in-process."""
    url = os.environ.get("PS_SIDECAR_URL", "").strip()
    return url.rstrip("/") if url else None


def post(path: str, body: JsonObject) -> tuple[int, JsonValue]:
    """POST a JSON body to a sidecar route: (HTTP status, parsed JSON body). Through the running sidecar when
    PS_SIDECAR_URL is set, else the in-process app."""
    url = sidecar_url()
    if url is None:
        resp = _CLIENT.post(path, json=body)
        parsed: JsonValue = resp.json()
        return resp.status_code, parsed
    req = urllib.request.Request(f"{url}{path}", data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=3600) as r:  # noqa: S310 - a local sidecar
            ok: JsonValue = json.loads(r.read())
            return int(r.status), ok
    except urllib.error.HTTPError as e:
        err: JsonValue = json.loads(e.read())
        return int(e.code), err


def completed(payload: JsonObject) -> TrainerCompleted:
    """Run one trainer request and require a completed result: in-process, or through a running sidecar's
    POST /trainer when PS_SIDECAR_URL is set, so the same gate tests exercise the real server process."""
    if sidecar_url() is None:
        res = run_trainer(TrainerRequest.model_validate(payload))
    else:
        status, body = post("/trainer", payload)
        assert status == 200, f"/trainer answered {status}: {body}"
        res = _RESULT.validate_python(body)
    assert isinstance(res, TrainerCompleted), f"the trainer did not complete: {res}"
    return res


def load_artifact(art: ReturnedArtifact) -> tuple[TrainedPredictor, PredictorEnvelope]:
    """A returned artifact decoded the way the engine loads it: (predictor, envelope)."""
    return artifacts.load_v2_envelope(base64.b64decode(art.bytesBase64))


def shipped_artifact(r: TrainerCompleted) -> ReturnedArtifact:
    """The artifact of what the gate ships (the finalist, or the simple baseline it keeps); fails when the gate ships
    nothing or the run returns no artifact for it."""
    assert r.gate.shipped is not None, "the gate ships nothing"
    found = [a for a in r.artifacts if a.candidate == r.gate.shipped]
    assert len(found) == 1, f"{len(found)} artifacts for the shipped '{r.gate.shipped}'"
    return found[0]


def artifact_sources(r: TrainerCompleted) -> dict[str, set[str]]:
    """The source columns of every artifact the run returns (the finalist and the baselines), by candidate name."""
    return {a.candidate: {c.sourceColumn for c in load_artifact(a)[1].featureColumns} for a in r.artifacts}


@pytest.fixture(scope="module")
def server() -> Iterator[FileServer]:
    """One local file server per gate module, serving every snapshot the module's tests publish."""
    s = FileServer()
    yield s
    s.close()


def world(name: str, seed: int) -> pd.DataFrame:
    """One generated world seed's rows (person-cycles), IDs and person keys read as strings."""
    return pd.read_csv(world_dir(name, seed) / "rows.csv", dtype={"ID": str, "PersonID": str})


def world_truth(name: str, seed: int) -> pd.DataFrame:
    """One generated world seed's planted truth (the true probability per row)."""
    return pd.read_csv(world_dir(name, seed) / "truth.csv")


_ONEHOT: JsonObject = {"kind": "categorical", "cardinalityCap": 10, "method": "onehot"}

# The feature encodings of a binary renewal world: its numeric, categorical and boolean member columns plus five noise
# columns, as the product's assembler declares them.
W_BINARY_FEATURES: dict[str, JsonObject] = {
    "Year": NUMERIC,
    "Plan": _ONEHOT,
    "EventsAttended": NUMERIC,
    "IncomeK": NUMERIC,
    "AutoRenew": {"kind": "boolean"},
    "Region": _ONEHOT,
    **{f"Noise{i}": NUMERIC for i in range(1, 6)},
}


def world_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Binary world rows -> trainer frame (EntityKey = person, T = cycle start, Target = renewed as 0/1)."""
    out = df.rename(columns={"PersonID": "EntityKey", "StartDate": "T"}).copy()
    out["Target"] = out["Renewed"].astype(int)
    return out


def last_cycle_ids(df: pd.DataFrame) -> list[str]:
    """The row IDs of the world's last cycle year: the locked holdout."""
    return [str(i) for i in df.loc[df["Year"] == df["Year"].max(), "ID"]]
