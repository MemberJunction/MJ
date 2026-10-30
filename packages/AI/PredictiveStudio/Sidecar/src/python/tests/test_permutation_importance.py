"""Held-out permutation importance per source column: every feature column of a source permuted together, the
loss increase averaged over repeats, a paired bootstrap interval on the same rows; and its place in the trainer
result."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import importance as IM, scores
from app.main import app
from app.trainer_schemas import TrainerCompleted
from tests.tools.trainer_fixture import FileServer, candidates, protocol, request, snapshot_files
from tests.tools.trainer_scaffold import FEATS, TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

client = TestClient(app)


def _frame(seed: int = 2, n: int = 500) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame({"a=1": rng.integers(0, 2, n).astype(float), "a=2": rng.integers(0, 2, n).astype(float),
                         "noise": rng.normal(size=n)})


def _predict(F: pd.DataFrame) -> np.ndarray:
    return np.clip(0.05 + 0.9 * F["a=1"].to_numpy(), 0.01, 0.99)


LOG_LOSS = scores.primary_score("log-loss", None).aggregate
SOURCES = {"a": ["a=1", "a=2"], "noise": ["noise"]}


def test_permutation_importance_groups_encoded_columns() -> None:
    X = _frame()
    y = X["a=1"].to_numpy()
    imps = IM.permutation_importance(_predict, X, y, LOG_LOSS, SOURCES, 5, 0, 100, None)
    by = {i.source_column: i for i in imps}
    assert [i.source_column for i in imps] == ["a", "noise"]
    assert by["a"].drop > 0 and by["a"].lower > 0 and by["a"].lower <= by["a"].drop <= by["a"].upper
    assert by["noise"].drop == pytest.approx(0.0, abs=1e-12)
    assert IM.noise_share(imps, ["noise"]) == 0.0


def test_drop_is_the_mean_loss_increase_over_repeats_with_one_row_permutation_per_source() -> None:
    """The reference pipeline's draw order: one generator, sources in sorted order, one permutation per repeat shared
    by every feature column of the source."""
    X = _frame(seed=7)
    y = X["a=1"].to_numpy()
    rng = np.random.default_rng(11)
    base = LOG_LOSS(y, _predict(X))
    want = []
    for src in sorted(SOURCES):
        losses = []
        for _ in range(3):
            idx = rng.permutation(len(X))
            Xp = X.copy()
            for c in SOURCES[src]:
                Xp[c] = X[c].to_numpy()[idx]
            losses.append(LOG_LOSS(y, _predict(Xp)))
        want.append(float(np.mean(losses)) - base)
    got = {i.source_column: i.drop for i in IM.permutation_importance(_predict, X, y, LOG_LOSS, SOURCES, 3, 11, 50, None)}
    assert got == {"a": pytest.approx(want[0], abs=1e-12), "noise": pytest.approx(want[1], abs=1e-12)}


def test_interval_level_and_groups() -> None:
    """A narrower level gives a narrower interval; whole-group resampling is accepted."""
    X = _frame(seed=8)
    y = X["a=1"].to_numpy()
    wide = IM.permutation_importance(_predict, X, y, LOG_LOSS, SOURCES, 2, 0, 300, None, 0.95)[0]
    narrow = IM.permutation_importance(_predict, X, y, LOG_LOSS, SOURCES, 2, 0, 300, None, 0.5)[0]
    assert narrow.drop == wide.drop and wide.lower < narrow.lower <= narrow.upper < wide.upper
    groups = [str(i // 5) for i in range(len(X))]
    grouped = IM.permutation_importance(_predict, X, y, LOG_LOSS, SOURCES, 2, 0, 300, groups)[0]
    assert grouped.drop == wide.drop and grouped.lower <= grouped.drop <= grouped.upper


def test_multiclass_predictions() -> None:
    rng = np.random.default_rng(9)
    X = pd.DataFrame({"k": rng.integers(0, 3, 400).astype(float), "noise": rng.normal(size=400)})
    y = X["k"].to_numpy()

    def predict(F: pd.DataFrame) -> np.ndarray:
        return np.asarray(0.1 + 0.7 * np.eye(3)[F["k"].to_numpy().astype(int)], dtype=np.float64)

    fn = scores.primary_score("multiclass-log-loss", None).aggregate
    imps = IM.permutation_importance(predict, X, y, fn, {"k": ["k"], "noise": ["noise"]}, 2, 0, 100, None)
    assert imps[0].source_column == "k" and imps[0].lower > 0 and imps[1].drop == pytest.approx(0.0, abs=1e-12)


def test_noise_share_counts_positive_importance_only() -> None:
    imps = [IM.ColumnImportance("a", 0.3, 0.2, 0.4), IM.ColumnImportance("n1", 0.1, 0.0, 0.2),
            IM.ColumnImportance("n2", -0.2, -0.3, 0.0)]
    assert IM.noise_share(imps, ["n1", "n2"]) == pytest.approx(0.25)
    assert IM.noise_share([IM.ColumnImportance("a", -0.1, -0.2, 0.0)], ["a"]) == 0.0


def _importance_run(server: FileServer, df: pd.DataFrame, hold: list[str], resamples: int) -> TrainerCompleted:
    m, n = snapshot_files(df, FEATS, hold, label_map={0: "no", 1: "yes"})
    proto = protocol("binary", intervals={"level": 0.95, "method": "bootstrap", "resamples": resamples,
                                          "pairedTest": "paired-bootstrap"})
    req = request(server, m, n, TASK, proto, candidates("binary", [("glm_candidate", "logistic_regression", {})]),
                  tag=f"snap{resamples}")
    resp = client.post("/trainer", json=req)
    assert resp.status_code == 200, resp.text
    return TrainerCompleted.model_validate(resp.json())


def test_trainer_reports_held_out_importance_per_source(server: FileServer) -> None:
    df = binary_frame()
    hold = [str(i) for i, t in zip(df["ID"], df["T"]) if str(t).startswith("2024")]
    r = _importance_run(server, df, hold, 200)
    assert [i.sourceColumn for i in r.importance][0] == "x1"
    assert {i.sourceColumn for i in r.importance} == {"x1", "x2", "city"}
    for i in r.importance:
        pi = i.permutationImportance
        assert pi.metric == "log-loss" and pi.n == len(hold) and pi.interval.level == 0.95
        assert pi.interval.lower <= pi.value <= pi.interval.upper
    drops = [i.permutationImportance.value for i in r.importance]
    assert drops == sorted(drops, reverse=True)


def test_importance_interval_follows_the_protocol_resample_count(server: FileServer) -> None:
    """Same data, same finalist, same permutations: only the protocol's resample count differs, so every drop is equal
    and the intervals are not (the draw count is read from the protocol, not fixed)."""
    df = binary_frame()
    hold = [str(i) for i, t in zip(df["ID"], df["T"]) if str(t).startswith("2024")]
    a = {i.sourceColumn: i.permutationImportance for i in _importance_run(server, df, hold, 150).importance}
    b = {i.sourceColumn: i.permutationImportance for i in _importance_run(server, df, hold, 400).importance}
    assert set(a) == set(b) == {"x1", "x2", "city"}
    assert all(a[s].value == b[s].value for s in a)
    assert any((a[s].interval.lower, a[s].interval.upper) != (b[s].interval.lower, b[s].interval.upper) for s in a)
