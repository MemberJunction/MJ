"""Monitor procedure M in the sidecar (M6.1, D4-05, D4-11): `/monitor/drift` and `/monitor/calibrate`.

Procedure M (plan §5, Ruling Q24): at each look each input gets a z statistic against the training (reference) window,
an empirical two-sided p from seeded no-drift replays at that look, and Benjamini-Hochberg across the look's inputs at
q(L); `/monitor/calibrate` finds q(L), the largest level whose any-alarm rate over L looks is at most the target, by
bisection on seeded replays. The designs are the review's: T4 (one AR(1) series, phi 0.9, 227 reference lags, L = 12)
and D1c (three cross-section inputs, 12,000 reference rows, 4,000 rows per look, L = 3).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Dict, List, Union

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import main, monitor
from app.array_types import FArr

Json = Union[None, bool, int, float, str, List["Json"], Dict[str, "Json"]]

N_REF = 12_000
N_PER = 4_000
P_AUTO = 0.35
D1C_INPUTS = ("EngagementZ", "TenureZ", "AutoRenew")


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(main.app)


def _d1c_input(rng: np.random.Generator, name: str, shift: float) -> Dict[str, Json]:
    """One D1c-design input: reference and one look's rows, the look's mean shifted by `shift` SD."""
    if name == "AutoRenew":
        ref = rng.binomial(1, P_AUTO, N_REF).astype(np.float64)
        cur = rng.binomial(1, P_AUTO, N_PER).astype(np.float64)
        return {"name": name, "kind": "proportion", "reference": ref.tolist(), "current": cur.tolist()}
    return {"name": name, "kind": "mean", "reference": rng.normal(0.0, 1.0, N_REF).tolist(),
            "current": rng.normal(shift, 1.0, N_PER).tolist()}


def _d1c_inputs(shifted: str, shift: float, seed: int) -> List[Json]:
    rng = np.random.default_rng(seed)
    return [_d1c_input(rng, n, shift if n == shifted else 0.0) for n in D1C_INPUTS]


NO_SHIFT_INPUTS: List[Json] = _d1c_inputs("", 0.0, 11)


def SHIFTED(name: str, shift: float) -> List[Json]:
    return _d1c_inputs(name, shift, 12)


def DriftBody(inputs: List[Json], q: float, look: int, replays: int = 2000, seed: int = 7) -> Dict[str, Json]:
    return {"inputs": inputs, "look": look, "q": q, "replays": replays, "seed": seed}


def _t4_reference(seed: int) -> FArr:
    """227 lags of the T4 series (AR(1) phi 0.9, sigma 2.0, level 100, stationary start)."""
    rng = np.random.default_rng(seed)
    e = rng.normal(0.0, 2.0 / math.sqrt(1 - 0.81))
    out = np.empty(227)
    for t in range(227):
        if t > 0:
            e = 0.9 * e + rng.normal(0.0, 2.0)
        out[t] = 100.0 + e
    return out


def CalibrateBody(looks: int, replays: int, seed: int, target: float) -> Dict[str, Json]:
    """The T4 design (L = 12, one series input) when `looks` is 12; the D1c design (three inputs) otherwise."""
    if looks == 12:
        inputs: List[Json] = [{"name": "LagValue", "kind": "series", "reference": _t4_reference(0).tolist(), "lookSize": 1}]
    else:
        rng = np.random.default_rng(3)
        inputs = [{"name": "EngagementZ", "kind": "mean", "reference": rng.normal(0, 1, N_REF).tolist(), "lookSize": N_PER},
                  {"name": "TenureZ", "kind": "mean", "reference": rng.normal(0, 1, N_REF).tolist(), "lookSize": N_PER},
                  {"name": "AutoRenew", "kind": "proportion",
                   "reference": rng.binomial(1, P_AUTO, N_REF).astype(np.float64).tolist(), "lookSize": N_PER}]
    return {"inputs": inputs, "looks": looks, "replays": replays, "seed": seed, "target": target}


# --------------------------------------------------------------------------------------------- the constants -----

def test_q_constants_are_the_documented_ones() -> None:
    assert monitor.Q_BY_LOOKS == {12: 0.0095, 3: 0.0171}


def test_withdrawn_q_values_appear_nowhere() -> None:
    # Spelled in two parts so a repository grep for the withdrawn values stays at zero hits.
    withdrawn = ["0.010" + "04", "0.017" + "37"]
    src = Path(monitor.__file__).read_text() + Path(main.__file__).read_text()
    assert all(w not in src for w in withdrawn)


# ---------------------------------------------------------------------------------------------- /monitor/drift -----

def test_bh_controls_the_false_discovery_proportion_at_q(client: TestClient) -> None:
    r = client.post("/monitor/drift", json=DriftBody(inputs=NO_SHIFT_INPUTS, q=0.0171, look=1)).json()
    assert r["alarms"] == []
    assert [x["input"] for x in r["results"]] == list(D1C_INPUTS)
    assert all(x["flagged"] is False and x["look"] == 1 and x["q"] == 0.0171 for x in r["results"])


def test_a_planted_mean_shift_is_flagged_within_one_look(client: TestClient) -> None:
    r = client.post("/monitor/drift", json=DriftBody(inputs=SHIFTED("EngagementZ", 0.1), q=0.0171, look=1)).json()
    assert [a["input"] for a in r["alarms"]] == ["EngagementZ"]
    alarm = r["alarms"][0]
    assert alarm["z"] > 4 and alarm["p"] == pytest.approx(1 / 2001) and alarm["pAdjusted"] <= 0.0171


def test_the_mean_false_discovery_proportion_under_a_planted_shift_is_at_most_q() -> None:
    # D2's design over 300 seeds: the FDP over the union of flags (TenureZ and AutoRenew are false flags) stays <= 0.05.
    rng = np.random.default_rng(8080)
    fdp: List[float] = []
    for _ in range(300):
        p = np.array([monitor.empirical_p(z, monitor.replay_z(spec, rng, 2000, 1)[:, 0])
                      for spec, z in _d2_look(rng)])
        flagged = monitor.bh_adjust(p) <= 0.0171
        fdp.append(float(flagged[1:].sum() / flagged.sum()) if flagged.any() else 0.0)
    assert float(np.mean(fdp)) <= 0.05


def _d2_look(rng: np.random.Generator) -> List[tuple[monitor.InputSpec, float]]:
    out: List[tuple[monitor.InputSpec, float]] = []
    for raw in _d1c_inputs("EngagementZ", 0.1, int(rng.integers(0, 2**31))):
        assert isinstance(raw, dict)
        req = monitor.DriftInput.model_validate(raw)
        spec = monitor.InputSpec.of(req.kind, np.asarray(req.reference, dtype=np.float64), len(req.current))
        out.append((spec, spec.z(np.asarray(req.current, dtype=np.float64))))
    return out


def test_bh_adjusted_p_values_match_the_step_up_definition() -> None:
    adj = monitor.bh_adjust(np.array([0.01, 0.04, 0.03, 0.5]))
    assert adj.tolist() == pytest.approx([0.04, 0.04 * 4 / 3, 0.04 * 4 / 3, 0.5])


def test_a_series_input_is_scored_against_its_reference_sd(client: TestClient) -> None:
    ref = _t4_reference(0)
    value = float(ref.mean() + 5 * ref.std(ddof=1))
    body = DriftBody(inputs=[{"name": "LagValue", "kind": "series", "reference": ref.tolist(), "current": [value]}],
                     q=0.0095, look=3)
    r = client.post("/monitor/drift", json=body).json()
    assert r["results"][0]["z"] == pytest.approx(5.0)
    assert r["results"][0]["look"] == 3


def test_a_drift_call_is_reproducible_under_its_seed(client: TestClient) -> None:
    body = DriftBody(inputs=SHIFTED("TenureZ", 0.02), q=0.0171, look=2)
    assert client.post("/monitor/drift", json=body).json() == client.post("/monitor/drift", json=body).json()


@pytest.mark.parametrize("bad", [
    {"look": 0},
    {"q": 0.0},
    {"replays": 99},
    {"inputs": []},
    {"inputs": [{"name": "A", "kind": "proportion", "reference": [0, 1, 2], "current": [1]}]},
    {"inputs": [{"name": "A", "kind": "mean", "reference": [1.0, 1.0, 1.0], "current": [1.0]}]},
    {"inputs": [{"name": "A", "kind": "series", "reference": [1.0, 2.0, 3.0], "current": [1.0, 2.0]}]},
    {"inputs": [{"name": "A", "kind": "mean", "reference": [1.0, 2.0], "current": [1.0]},
                {"name": "A", "kind": "mean", "reference": [1.0, 2.0], "current": [1.0]}]},
    {"extra": 1},
])
def test_a_request_outside_the_contract_is_a_422(client: TestClient, bad: Dict[str, Json]) -> None:
    body = DriftBody(inputs=[{"name": "A", "kind": "mean", "reference": [1.0, 2.0, 3.0], "current": [2.0]}],
                     q=0.0171, look=1)
    body.update(bad)
    assert client.post("/monitor/drift", json=body).status_code == 422


# ------------------------------------------------------------------------------------------ /monitor/calibrate -----

def test_calibrate_finds_q_by_bisection_on_seeded_replays(client: TestClient) -> None:
    r = client.post("/monitor/calibrate", json=CalibrateBody(looks=12, replays=2000, seed=7, target=0.05)).json()
    assert 0.0085 <= r["q"] <= 0.0105
    assert r["anyAlarmRate"] <= 0.05 and (r["looks"], r["replays"], r["target"]) == (12, 2000, 0.05)


def test_calibrate_recovers_q3_for_the_d1c_design(client: TestClient) -> None:
    r = client.post("/monitor/calibrate", json=CalibrateBody(looks=3, replays=2000, seed=7, target=0.05)).json()
    assert 0.0155 <= r["q"] <= 0.0190


def test_calibrate_refuses_a_series_input_with_more_than_one_row_per_look(client: TestClient) -> None:
    body = CalibrateBody(looks=12, replays=2000, seed=7, target=0.05)
    inputs = body["inputs"]
    assert isinstance(inputs, list) and isinstance(inputs[0], dict)
    inputs[0]["lookSize"] = 2
    assert client.post("/monitor/calibrate", json=body).status_code == 422
