"""Inner-CV scores with corrected intervals, the one-standard-error selection rule, and the selection stage: every
candidate is fitted and scored on development rows only, with encoding and class rebalancing learned in-fold."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd
import pytest

from app import folds as F, scores, selection, snapshot as SN, trainer as TR
from app.encoding import CategoricalEncoding, ColumnSpec, NumericEncoding
from app.failures import RunClock, TrainerFailure
from app.trainer_schemas import BinaryTask, CandidateSpec, CountTask, EvaluationProtocol, TrainerRequest
from tests.tools.trainer_fixture import (
    NUMERIC,
    DriverSpec,
    FileServer,
    JsonObject,
    candidates,
    protocol,
    request,
    snapshot_files,
)
from tests.tools.trainer_scaffold import FEATS, TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

# scikit-learn 1.4.2's LogisticRegression passes `iprint` to scipy 1.17.1's L-BFGS-B, which deprecates it; both
# versions are pinned in requirements.txt, so the notice is a library pairing, not something these tests exercise.
pytestmark = pytest.mark.filterwarnings("ignore:scipy.optimize. The `disp` and `iprint` options:DeprecationWarning")

NOW = dt.datetime(2026, 10, 12, tzinfo=dt.timezone.utc)
# Two cheap candidates, simplest first (the one-standard-error rule's complexity order).
GLM_AND_FOREST: list[DriverSpec] = [("glm_candidate", "logistic_regression", {}),
                                    ("forest", "random_forest", {"n_estimators": 50, "min_samples_leaf": 5})]


def _holdout_2024(df: pd.DataFrame) -> list[str]:
    return [str(i) for i, t in zip(df["ID"], df["T"]) if str(t).startswith("2024")]


def _req(server: FileServer, df: pd.DataFrame, **proto_over: JsonObject) -> TrainerRequest:
    m, n = snapshot_files(df, FEATS, _holdout_2024(df), label_map={0: "no", 1: "yes"})
    return TrainerRequest.model_validate(request(server, m, n, TASK, protocol("binary", **proto_over), candidates("binary")))


def _select(req: TrainerRequest, snap: SN.Snapshot) -> TR.SelectionOutcome:
    enc = TR.encode_label(req.task, snap.label)
    dev = np.flatnonzero(np.array(snap.roles) == "development").astype(np.int64)
    return TR.select_finalist(req.protocol, snap, snap.columns, enc, dev, req.candidates, 1, RunClock(600, 600),
                              SN.period_ordinals(snap))


def test_corrected_resampled_t_is_wider_than_naive() -> None:
    s = [0.50, 0.52, 0.49, 0.51, 0.53]
    mean, lo, hi = selection.corrected_resampled_t(s, 800, 200, 0.95)
    naive_half = 2.776 * float(np.std(s, ddof=1)) / np.sqrt(5)
    assert mean == pytest.approx(0.51)
    assert (hi - lo) / 2 > naive_half


def test_one_se_rule_prefers_earliest_within_one_se() -> None:
    rl = {"simple": np.array([0.30, 0.31, 0.29, 0.30]), "complex": np.array([0.29, 0.31, 0.29, 0.30])}
    sel = selection.select_one_se(["simple", "complex"], {"simple": 0.300, "complex": 0.2975}, rl)
    assert sel.best_by_score == "complex" and sel.finalist == "simple"
    assert sel.excess["simple"] == pytest.approx(0.0025)
    assert sel.se_of_excess["simple"] == 0.0025000000000000022
    assert sel.within_one_se == {"simple": True, "complex": True}


def test_select_finalist_runs_on_development_rows_only(server: FileServer) -> None:
    req = _req(server, binary_frame())
    snap = SN.load(req, NOW)
    dev = np.flatnonzero(np.array(snap.roles) == "development").astype(np.int64)
    out = _select(req, snap)
    assert set(out.cv) == {"glm_candidate", "lgbm", "xgb"}
    for f in out.folds:
        assert all(snap.roles[int(dev[int(i)])] == "development" for i in np.concatenate([f.train, f.valid]))
    for c in out.cv.values():
        assert c.inner.lower <= c.inner.mean <= c.inner.upper and c.inner.folds == 5


def test_in_fold_undersampling_never_touches_validation_rows() -> None:
    y = np.array([1] * 20 + [0] * 180)
    idx = np.arange(150, dtype=np.int64)
    out = TR._resample(idx, y, "undersample", 0)
    assert set(out.tolist()) <= set(idx.tolist())
    assert int(np.sum(y[out] == 1)) == int(np.sum(y[out] == 0)) == 20


@pytest.mark.parametrize(("metric", "power"), [("tweedie-deviance", None), ("tweedie-deviance", 2.5), ("auc", None)])
def test_a_primary_score_without_a_proper_definition_is_refused(metric: str, power: float | None) -> None:
    with pytest.raises(ValueError):
        scores.primary_score(metric, power)  # type: ignore[arg-type]  # deliberately outside PrimaryMetric


# ------------------------------------------------------------------------------------------------ fold kinds -------

def _folds_for(server: FileServer, inner: JsonObject) -> tuple[SN.Snapshot, TR.IntArr, list[F.Fold]]:
    req = _req(server, binary_frame(), innerValidation=inner)
    snap = SN.load(req, NOW)
    enc = TR.encode_label(req.task, snap.label)
    dev = np.flatnonzero(np.array(snap.roles) == "development").astype(np.int64)
    return snap, dev, TR.build_folds(req.protocol, snap, dev, enc, SN.period_ordinals(snap))


def _entities(snap: SN.Snapshot, dev: TR.IntArr) -> list[str]:
    return [snap.entity_keys[int(i)] for i in dev]


def test_an_ungrouped_blocked_time_protocol_does_not_group_rows(server: FileServer) -> None:
    """`groupKey: null`: every row is its own group, so one entity's rows may sit on both sides of a fold."""
    snap, dev, folds = _folds_for(server, {"kind": "blocked-time", "folds": 3, "gapPeriods": 0, "groupKey": None})
    assert sum(F.shared_groups(f, _entities(snap, dev)) for f in folds) > 0


def test_a_grouped_blocked_time_protocol_keeps_each_unit_on_one_side(server: FileServer) -> None:
    snap, dev, folds = _folds_for(server, {"kind": "blocked-time", "folds": 3, "gapPeriods": 0, "groupKey": "EntityKey"})
    assert all(F.shared_groups(f, _entities(snap, dev)) == 0 for f in folds)


def test_grouped_kfold_keeps_each_unit_on_one_side(server: FileServer) -> None:
    snap, dev, folds = _folds_for(server, {"kind": "grouped-kfold", "folds": 5, "repeats": 2, "groupKey": "EntityKey"})
    assert len(folds) == 10
    assert all(F.shared_groups(f, _entities(snap, dev)) == 0 for f in folds)


def test_repeated_kfold_on_a_continuous_target_is_unstratified(server: FileServer) -> None:
    req = _req(server, binary_frame(), innerValidation={"kind": "repeated-stratified-kfold", "folds": 5, "repeats": 2})
    snap = SN.load(req, NOW)
    dev = np.flatnonzero(np.array(snap.roles) == "development").astype(np.int64)
    y = np.random.default_rng(1).normal(size=len(snap.roles))
    enc = TR.EncodedLabel(y, "continuous", None, None)
    got = TR.build_folds(req.protocol, snap, dev, enc, SN.period_ordinals(snap))
    want = F.repeated_stratified(y[dev], 5, 2, req.protocol.seed, stratify=False)
    assert [(f.repeat, f.train.tolist(), f.valid.tolist()) for f in got] == \
        [(f.repeat, f.train.tolist(), f.valid.tolist()) for f in want]


# ------------------------------------------------------------------------------------- no holdout row leaks -------

def _interaction_rows(n: int = 1200, seed: int = 11) -> pd.DataFrame:
    """Rows whose label is the sign of x1*x2: a forest learns it, a logistic regression cannot. Mixed into the
    development rows they make the forest the finalist; as locked holdout they must change nothing."""
    rng = np.random.default_rng(seed)
    x1 = rng.normal(size=n)
    x2 = rng.normal(size=n)
    return pd.DataFrame({"ID": [f"h{i}" for i in range(n)], "EntityKey": [f"he{i // 3}" for i in range(n)],
                         "T": ["2024-06-01"] * n, "x1": x1, "x2": x2,
                         "city": rng.choice(["NYC", "LA", "SF", "CHI"], size=n),
                         "Target": (x1 * x2 > 0).astype(int)})


def _glm_forest_outcome(server: FileServer, df: pd.DataFrame, holdout: list[str], tag: str) -> TR.SelectionOutcome:
    m, n = snapshot_files(df, FEATS, holdout, label_map={0: "no", 1: "yes"})
    req = TrainerRequest.model_validate(request(server, m, n, TASK, protocol("binary"), candidates("binary", GLM_AND_FOREST),
                                                tag=tag))
    return _select(req, SN.load(req, NOW))


def test_locked_holdout_rows_never_reach_selection(server: FileServer) -> None:
    full = binary_frame()
    development = full[~full["T"].str.startswith("2024")]
    interaction = _interaction_rows()
    with_benign_holdout = _glm_forest_outcome(server, full, _holdout_2024(full), "benign")
    with_interaction_holdout = _glm_forest_outcome(server, pd.concat([development, interaction], ignore_index=True),
                                                   list(interaction["ID"]), "interaction")
    interaction_leaked = _glm_forest_outcome(server, pd.concat([development, interaction], ignore_index=True), [],
                                             "leaked")
    # Leaked into development, the interaction rows change the finalist ...
    assert with_benign_holdout.selection.finalist == "glm_candidate"
    assert interaction_leaked.selection.finalist == "forest"
    # ... held out, they change nothing: the same folds, fold scores, finalist and finalist predictions.
    assert with_interaction_holdout.selection.finalist == "glm_candidate"
    for name in ("glm_candidate", "forest"):
        assert with_interaction_holdout.cv[name].fold_scores == with_benign_holdout.cv[name].fold_scores
    probe = development[["x1", "x2", "city"]].reset_index(drop=True)
    np.testing.assert_array_equal(with_interaction_holdout.finalist.predict(probe),
                                  with_benign_holdout.finalist.predict(probe))


def test_a_development_index_holding_a_holdout_row_is_refused(server: FileServer) -> None:
    req = _req(server, binary_frame())
    snap = SN.load(req, NOW)
    enc = TR.encode_label(req.task, snap.label)
    roles = np.array(snap.roles)
    dev = np.flatnonzero(roles == "development").astype(np.int64)
    one_holdout_row = np.flatnonzero(roles == "locked-holdout")[:1].astype(np.int64)
    tainted = np.sort(np.concatenate([dev, one_holdout_row]))
    with pytest.raises(TrainerFailure) as err:
        TR.select_finalist(req.protocol, snap, snap.columns, enc, tainted, req.candidates, 1, RunClock(600, 600),
                           SN.period_ordinals(snap))
    assert err.value.stage == "inner-cv"


# ------------------------------------------------------------------------------- count and non-negative scores ----

def _amount_frame(kind: str, n: int = 600, seed: int = 5) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    x1 = rng.normal(size=n)
    x2 = rng.normal(size=n)
    mu = np.exp(0.3 + 0.5 * x1 - 0.3 * x2)
    target = (rng.poisson(mu).astype(float) if kind == "count"
              else np.where(rng.random(n) < 0.4, 0.0, rng.gamma(2.0, mu / 2.0)))
    years = rng.choice([2021, 2022, 2023, 2024], size=n)
    return pd.DataFrame({"ID": [f"r{i}" for i in range(n)], "EntityKey": [f"e{i // 3}" for i in range(n)],
                         "T": [f"{y_}-06-01" for y_ in years], "x1": x1, "x2": x2, "Target": target})


@pytest.mark.parametrize(("task", "expected_metric", "expected_row_loss"), [
    ({"kind": "count"}, "poisson-deviance", scores.row_poisson_deviance),
    ({"kind": "non-negative", "tweediePower": 1.5}, "tweedie-deviance", scores.row_tweedie_deviance(1.5)),
])
def test_count_and_non_negative_targets_are_scored_by_their_deviance(
        server: FileServer, task: JsonObject, expected_metric: str, expected_row_loss: scores.RowLoss) -> None:
    kind = str(task["kind"])
    df = _amount_frame(kind)
    m, n = snapshot_files(df, {"x1": NUMERIC, "x2": NUMERIC}, _holdout_2024(df))
    drivers: list[DriverSpec] = [("forest", "random_forest", {"n_estimators": 30, "min_samples_leaf": 5}),
                                 ("lgbm", "lightgbm", {"n_estimators": 40})]
    req = TrainerRequest.model_validate(request(server, m, n, task, protocol(kind), candidates(kind, drivers)))
    assert req.protocol.primaryScore.metric == expected_metric
    snap = SN.load(req, NOW)
    enc = TR.encode_label(req.task, snap.label)
    assert enc.family == kind
    out = _select(req, snap)
    y_dev = np.asarray(enc.y, dtype=np.float64)[np.flatnonzero(np.array(snap.roles) == "development")]
    y_val = y_dev[out.validated]
    for c in out.cv.values():
        # one repeat: each validated row's loss is the family's deviance of its one out-of-fold prediction
        np.testing.assert_allclose(c.row_loss, expected_row_loss(y_val, c.oof), rtol=1e-12)
        assert not np.allclose(c.row_loss, scores.row_squared_error(y_val, c.oof))
        assert c.inner.mean == pytest.approx(float(np.mean(c.fold_scores)))


@pytest.mark.parametrize("cells", [["3", "many"], [2.0, -1.0], [1.0, None]])
def test_a_count_label_that_is_not_a_non_negative_number_is_refused(cells: list[object]) -> None:
    with pytest.raises(TrainerFailure) as err:
        TR.encode_label(CountTask(kind="count"), np.asarray(cells, dtype=object))
    assert err.value.stage == "load-snapshot"


# ------------------------------------------------------------------------------------ in-fold preprocessing -------

def test_the_preprocessor_learns_from_the_fit_rows_only() -> None:
    """Imputer and scaler statistics come from the rows a fit trains on, never from the other development rows."""
    rng = np.random.default_rng(7)
    n = 400
    x2 = rng.normal(size=n)
    x2[200:] += 50.0                     # rows outside the fit would move the mean and median far away
    x2[rng.random(n) < 0.1] = np.nan
    X = pd.DataFrame({"x2": x2, "city": rng.choice(["NYC", "LA"], size=n).tolist()})
    columns = [ColumnSpec("x2", "x2", NumericEncoding("numeric")),
               ColumnSpec("city", "city", CategoricalEncoding(10, "onehot"), None, ("LA", "NYC"))]
    task = BinaryTask(kind="binary", classOrder=("no", "yes"), adverseIndex=1)
    enc = TR.encode_label(task, np.asarray(rng.choice(["no", "yes"], size=n), dtype=object))
    idx = np.arange(200, dtype=np.int64)
    proto = EvaluationProtocol.model_validate(protocol("binary"))
    spec = CandidateSpec.model_validate(candidates("binary")[0])
    fitted = TR.fit_predictor(spec, columns, X, enc, idx, proto, 1)
    numeric = fitted.pipeline.named_steps["encode"].named_transformers_["num:x2"]
    train_values = x2[:200][~np.isnan(x2[:200])]
    assert float(numeric.named_steps["impute"].statistics_[0]) == pytest.approx(float(np.median(train_values)))
    assert float(numeric.named_steps["scale"].mean_[0]) == pytest.approx(
        float(np.mean(np.where(np.isnan(x2[:200]), np.median(train_values), x2[:200]))))

