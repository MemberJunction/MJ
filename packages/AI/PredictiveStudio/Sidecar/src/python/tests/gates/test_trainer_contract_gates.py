"""Trainer contract gates on planted truth: single-threaded random-forest and MLP trainings repeat their predictions
exactly; a run records the library versions and the thread count it trained with; a target-encoded high-cardinality
column is encoded inside each fold, so shuffled labels score no better than chance out of fold and on the held-out
rows; and the inner scores of every candidate are means over every grouped fold, each with an interval."""

from __future__ import annotations

import datetime as dt
import math

import numpy as np
import numpy.typing as npt
import pytest
from sklearn.metrics import roc_auc_score

from app import code_version, snapshot as SN, trainer as TR
from app.failures import RunClock
from app.trainer_schemas import TrainerRequest
from tests.gates.conftest import W_BINARY_FEATURES, last_cycle_ids, world, world_frame
from tests.tools.trainer_fixture import FileServer, JsonObject, candidates, protocol, request, snapshot_files

TASK: JsonObject = {"kind": "binary", "classOrder": ["0", "1"], "adverseIndex": 0}
LM = {0: "0", 1: "1"}
NOW = dt.datetime(2026, 10, 12, tzinfo=dt.timezone.utc)

IntArr = npt.NDArray[np.int64]
Selected = tuple[SN.Snapshot, TR.EncodedLabel, IntArr, IntArr, TR.SelectionOutcome]


def _select(req: TrainerRequest) -> Selected:
    """Load the request's snapshot and run the selection stage: (snapshot, encoded label, development rows, holdout
    rows, selection outcome)."""
    snap = SN.load(req, NOW)
    enc = TR.encode_label(req.task, snap.label)
    roles = np.array(snap.roles)
    dev = np.flatnonzero(roles == "development").astype(np.int64)
    hold = np.flatnonzero(roles == "locked-holdout").astype(np.int64)
    out = TR.select_finalist(req.protocol, snap, snap.columns, enc, dev, req.candidates, req.threads,
                             RunClock(3600, 3600), SN.period_ordinals(snap))
    return snap, enc, dev, hold, out


@pytest.mark.gate("W1 -> S5.4 #2")
@pytest.mark.parametrize("driver", ["random_forest", "mlp"])
def test_W1_S5_4_2_rf_and_mlp_repeat_exactly(server: FileServer, driver: str) -> None:
    """Two single-threaded trainings of RF and MLP on W1-signal s42 give predictions equal within 1e-9."""
    df = world_frame(world("W1-signal", 42))
    m, n = snapshot_files(df, W_BINARY_FEATURES, last_cycle_ids(df), label_map=LM)
    preds = []
    for _ in range(2):
        req = TrainerRequest.model_validate(request(server, m, n, TASK, protocol("binary"),
                                                    candidates("binary", [(driver, driver, {})]), tag=f"w1-{driver}"))
        snap, _enc, _dev, _hold, out = _select(req)
        preds.append(out.finalist.predict(snap.frame))
    assert float(np.max(np.abs(preds[0] - preds[1]))) <= 1e-9


@pytest.mark.gate("W1 -> S5.4 #3")
def test_W1_S5_4_3_versions_and_threads_logged() -> None:
    """Every trainer run carries the versions of the libraries it ran on and the thread count it was given."""
    cv = code_version.code_version(threads=1, seed=0)
    for lib in ("python", "numpy", "scikit-learn", "xgboost", "lightgbm"):
        assert cv.libraryVersions[lib]
    assert cv.threads == 1 and cv.seed == 0


@pytest.mark.gate("W1 -> S5.3")
def test_W1_S5_3_inner_cv_means_with_intervals(server: FileServer) -> None:
    """Every candidate is scored on every one of 5x3 grouped folds; its inner score is their mean, inside an interval."""
    df = world_frame(world("W1-signal", 42))
    m, n = snapshot_files(df, W_BINARY_FEATURES, last_cycle_ids(df), label_map=LM)
    proto = protocol("binary", innerValidation={"kind": "grouped-kfold", "folds": 5, "repeats": 3, "groupKey": "PersonID"})
    req = TrainerRequest.model_validate(request(server, m, n, TASK, proto, candidates("binary"), tag="w1-s53"))
    _snap, _enc, _dev, _hold, out = _select(req)
    assert set(out.cv) == {c.name for c in req.candidates}            # nothing pruned
    for c in out.cv.values():
        assert c.inner.folds == 15 and len(c.fold_scores) == 15       # every candidate on every fold
        assert c.inner.lower < c.inner.mean < c.inner.upper


def _auc_interval(y: npt.NDArray[np.int64], p: npt.NDArray[np.float64]) -> tuple[float, float, float]:
    """(AUC, lower, upper): the AUC of scores `p` against 0/1 labels `y` with its 95% Hanley-McNeil interval."""
    auc = float(roc_auc_score(y, p))
    n1, n0 = int(y.sum()), int(len(y) - y.sum())
    q1, q2 = auc / (2 - auc), 2 * auc * auc / (1 + auc)
    se = math.sqrt((auc * (1 - auc) + (n1 - 1) * (q1 - auc * auc) + (n0 - 1) * (q2 - auc * auc)) / (n1 * n0))
    return auc, auc - 1.96 * se, auc + 1.96 * se


@pytest.mark.gate("W8 -> S3.4")
def test_W8_S3_4_target_encoding_is_in_fold(server: FileServer) -> None:
    """Shuffled labels: a target-encoded 400-level PostalCode scores no better than chance out of fold (the 95%
    interval of the development rows' out-of-fold AUC does not lie above 0.5; an encoder that saw a validation fold's
    labels lifts it) and on the held-out rows (the held-out AUC's 95% interval covers 0.5; an encoder that saw the
    holdout's labels lifts it)."""
    df = world_frame(world("W8-highcard", 42))
    df["Target"] = df["Target"].to_numpy()[np.random.default_rng(12345).permutation(len(df))]
    df["PostalCode"] = df["PostalCode"].fillna("none")
    feats: dict[str, JsonObject] = {"PostalCode": {"kind": "categorical", "cardinalityCap": 400, "method": "target-in-fold"}}
    m, n = snapshot_files(df, feats, last_cycle_ids(df), label_map=LM)
    req = TrainerRequest.model_validate(request(server, m, n, TASK, protocol("binary"),
                                                candidates("binary", [("lr", "logistic_regression", {})]), tag="w8-te"))
    snap, enc, dev, hold, out = _select(req)
    y_all = np.asarray(enc.y, dtype=np.int64)
    oof_auc, oof_lo, oof_hi = _auc_interval(y_all[dev][out.validated], out.cv[out.selection.finalist].oof)
    # One-sided: honest k-fold target encoding on null labels biases out-of-fold scores BELOW chance (the label totals
    # are fixed, so a level's training-fold mean moves against its validation-fold labels; on shuffles of this world
    # the pooled AUC ranges about 0.48-0.51). Leakage can only lift it, so only an interval above 0.5 is a failure.
    assert oof_lo <= 0.5, f"out-of-fold AUC {oof_auc:.4f} [{oof_lo:.4f}, {oof_hi:.4f}] lies above 0.5"
    hold_auc, hold_lo, hold_hi = _auc_interval(y_all[hold], out.finalist.predict(snap.frame.iloc[hold]))
    assert hold_lo <= 0.5 <= hold_hi, f"held-out AUC {hold_auc:.4f} [{hold_lo:.4f}, {hold_hi:.4f}] excludes 0.5"
