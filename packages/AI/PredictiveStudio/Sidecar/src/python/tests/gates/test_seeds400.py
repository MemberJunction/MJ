"""400-seed statistical gates (marker `seeds400`). The seed sets are the truth suite's: a scenario's `n400` set (its
spec seed, then spec*1000+1 ... +399) and W2-noise s100-s499 (`n400`) / s100-s159 (`t2`), read from its data cache
through truthsuite.paths (tests/tools/trainer_fixture.py). Generate a set into the cache before the gate runs with
`pnpm run truth:data -- --set <set> --only <id>` in TruthSuite. Rules: a noise world publishes a model on at most 28 of
400 seeds; a 95% interval covers its planted value on 372-388 of 400 seeds. Selected with PS_SEEDS400=1 or by naming
the node (the conftest deselects them otherwise). PS_SEED_LIMIT=<k> runs a noise-publish or optimism gate on its first
k seeds with the cap scaled to k (a mutation check). A coverage gate refuses it: a 372-388 band scaled to a few dozen
seeds fails honest intervals about a third of the time, so coverage is measured on all 400 seeds or not at all. The
stored gate outcome is the engine's decision over these intervals plus
guards that only demote `model`, so a sidecar `model` count within the cap bounds the stored count."""

from __future__ import annotations

import base64
import os
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import numpy.typing as npt
import pandas as pd
import pytest

from app import artifacts, scores
from tests.gates.conftest import W_BINARY_FEATURES, completed, last_cycle_ids, world, world_frame
from tests.tools.trainer_fixture import (BINARY_LABELS as LM, BINARY_TASK as BIN, NUMERIC, FileServer, JsonObject,
                                         candidates, protocol, refpipe_carve, request, scenario, scenario_dir,
                                         scenario_seeds400, snapshot_files)

FArr = npt.NDArray[np.float64]

WORKERS = int(os.environ.get("PS_GATE_WORKERS", "8"))
SEED_LIMIT = int(os.environ.get("PS_SEED_LIMIT", "0"))   # > 0 only for a statistical gate's mutation check
_KEYS = ("ID", "EntityKey", "T", "Target")


def limited(seeds: list[int]) -> list[int]:
    """The first PS_SEED_LIMIT seeds when it is set, else every seed of the set."""
    return seeds[:SEED_LIMIT] if SEED_LIMIT > 0 else seeds


def publish_cap(n: int) -> int:
    """At most 28 publications of 400, scaled to n seeds (floor)."""
    return 28 * n // 400


COVERAGE_BAND = (372, 388)   # covered seeds of 400


def seeds400(sid: str) -> list[int]:
    """The truth suite's n400 seed set of a scenario; every seed must be in the data cache."""
    seeds = scenario_seeds400(sid)
    for s in seeds:
        assert (scenario_dir(sid, s) / "rows.csv").is_file(), f"{sid} seed {s}: rows.csv missing from the truth suite's cache"
    return seeds


def _expected_log_loss(pi: FArr, p: FArr) -> float:
    """Log loss in expectation over y ~ Bernoulli(planted pi)."""
    q = np.clip(p, 1e-15, 1 - 1e-15)
    return float(np.mean(-(pi * np.log(q) + (1 - pi) * np.log(1 - q))))


def scenario_gate(sid: str, seed: int, family: str) -> tuple[str, float, float, float | None]:
    """(gate outcome, model-vs-dummy lower, upper, planted difference) for one scenario seed. The planted difference
    (C2 only) is the dummy's expected log loss minus the finalist's under the planted probabilities."""
    df = scenario(sid, seed)
    feats: dict[str, JsonObject] = {c: NUMERIC for c in df.columns if c not in _KEYS}
    hold = refpipe_carve(df)
    task: JsonObject = BIN if family == "binary" else {"kind": "continuous"}
    srv = FileServer()
    try:
        m, n = snapshot_files(df, feats, hold, label_map=LM if family == "binary" else None)
        r = completed(request(srv, m, n, task, protocol(family), candidates(family), tag=f"{sid}-{seed}"))
    finally:
        srv.close()
    c = r.comparisons["modelVsDummy"]
    planted: float | None = None
    if sid == "C2":
        truth = pd.read_csv(scenario_dir(sid, seed) / "truth.csv", dtype={"ID": str}).set_index("ID")
        art = next(a for a in r.artifacts if a.candidate == r.finalist)
        model, _env = artifacts.load_v2_envelope(base64.b64decode(art.bytesBase64))
        rows = df.set_index("ID")
        h = rows.loc[hold]
        pi = truth.loc[hold]["TrueValue"].to_numpy(dtype=np.float64)
        pm = np.asarray(model.predict(h[list(feats)]), dtype=np.float64)
        base_rate = float(rows.drop(index=hold)["Target"].mean())
        planted = _expected_log_loss(pi, np.full(len(h), base_rate)) - _expected_log_loss(pi, pm)
    return r.gate.outcome, c.ci[0], c.ci[1], planted


def w2_run(seed: int) -> tuple[str, float, float]:
    """(gate outcome, the finalist's reported holdout AUC, the same artifact's AUC on the fresh seed 9100)."""
    srv = FileServer()
    try:
        df = world_frame(world("W2-noise", seed))
        m, n = snapshot_files(df, W_BINARY_FEATURES, last_cycle_ids(df), label_map=LM)
        task: JsonObject = {"kind": "binary", "classOrder": ["0", "1"], "adverseIndex": 0}
        r = completed(request(srv, m, n, task, protocol("binary"), candidates("binary"), tag=f"w2-{seed}"))
    finally:
        srv.close()
    reported = next(x for x in r.holdout.secondary if x.metric == "auc")
    assert reported.interval.lower <= reported.value <= reported.interval.upper   # every winner's score has an interval
    art = next(a for a in r.artifacts if a.candidate == r.finalist)
    model, _env = artifacts.load_v2_envelope(base64.b64decode(art.bytesBase64))
    fresh = world_frame(world("W2-noise", 9100))
    fresh_auc = scores.auc(fresh["Target"].to_numpy(dtype=np.float64),
                           np.asarray(model.predict(fresh[list(W_BINARY_FEATURES)]), dtype=np.float64))
    return r.gate.outcome, reported.value, fresh_auc


def _scenario_outcomes(sid: str, family: str, seeds: list[int]) -> list[tuple[str, float, float, float | None]]:
    with ProcessPoolExecutor(WORKERS) as ex:
        return list(ex.map(scenario_gate, [sid] * len(seeds), seeds, [family] * len(seeds)))


@pytest.mark.seeds400
@pytest.mark.gate("N1c -> S6.5")
def test_N1c_S6_5_noise_publish() -> None:
    out = _scenario_outcomes("N1c", "binary", limited(seeds400("N1c")))
    published = sum(o[0] == "model" for o in out)
    assert published <= publish_cap(len(out)), f"{published} of {len(out)} noise seeds published a model"


@pytest.mark.seeds400
@pytest.mark.gate("N1r -> S6.5")
def test_N1r_S6_5_noise_publish() -> None:
    out = _scenario_outcomes("N1r", "continuous", limited(seeds400("N1r")))
    published = sum(o[0] == "model" for o in out)
    assert published <= publish_cap(len(out)), f"{published} of {len(out)} noise seeds published a model"


@pytest.mark.seeds400
@pytest.mark.gate("W2 -> S6.5")
def test_W2_S6_5_noise_publish() -> None:
    seeds = limited(list(range(100, 500)))
    with ProcessPoolExecutor(WORKERS) as ex:
        out = list(ex.map(w2_run, seeds))
    published = sum(o[0] == "model" for o in out)
    assert published <= publish_cap(len(out)), f"{published} of {len(out)} noise seeds published a model"


@pytest.mark.seeds400
@pytest.mark.gate("W2 -> S5.2")
def test_W2_S5_2_winner_optimism() -> None:
    with ProcessPoolExecutor(WORKERS) as ex:
        out = list(ex.map(w2_run, limited(list(range(100, 160)))))
    optimism = float(np.mean([rep - fresh for _, rep, fresh in out]))
    assert optimism < 0.0104, f"mean winner optimism {optimism:+.5f} over {len(out)} seeds"


@pytest.mark.seeds400
@pytest.mark.gate("C2 -> S6.2 #2")
def test_C2_S6_2_2_difference_interval_coverage() -> None:
    assert SEED_LIMIT == 0, f"PS_SEED_LIMIT={SEED_LIMIT} is set: the coverage gate runs on all 400 seeds only; unset it"
    out = _scenario_outcomes("C2", "binary", seeds400("C2"))
    assert len(out) == 400, f"the coverage gate ran {len(out)} seeds, not 400"
    covered = sum(1 for _, lo, hi, planted in out if planted is not None and lo <= planted <= hi)
    low, high = COVERAGE_BAND
    assert low <= covered <= high, f"the model-minus-dummy interval covers the planted difference on {covered} of " \
                                   f"400 seeds (band {low}-{high})"
