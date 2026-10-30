"""Evaluation score gates on planted truth: the proper score of each task family ranks and gates, baselines and every
reported number carry intervals, prediction intervals cover at their nominal rate, the calibration hide rule, slices,
the operating point at a declared capacity, and the class vector a multiclass predictor returns."""

from __future__ import annotations

import math

import numpy as np
import numpy.typing as npt
import pandas as pd
import pytest

from app import calibration as CAL, intervals as IV, scores
from app.trainer_schemas import MetricWithInterval, OutOfTimeSlice, TrainerCompleted
from tests.gates.conftest import (W_BINARY_FEATURES, completed, last_cycle_ids, load_artifact, post, shipped_artifact,
                                  world, world_frame, world_truth)
from tests.tools.trainer_fixture import (BINARY_LABELS as LM, BINARY_TASK as BIN, NUMERIC, FileServer, JsonObject,
                                         JsonValue, as_list, as_number, as_object, as_str, candidates, person_years,
                                         protocol, refpipe, request, scenario, snapshot_files)

FArr = npt.NDArray[np.float64]

ONEHOT: JsonObject = {"kind": "categorical", "cardinalityCap": 20, "method": "onehot"}
# Gate member name -> the baseline kind it reports under.
_MEMBER_KIND = {"glm": "glm", "oneFeature": "one-feature", "dummy": "dummy"}


# ------------------------------------------------------------------------------------------ reference results -----

def _strs(v: JsonValue, where: str) -> list[str]:
    return [as_str(x, f"{where}[]") for x in as_list(v, where)]


def ref_test_ids(ref_id: str) -> list[str]:
    """The reference pipeline's locked-holdout row IDs for a reference id."""
    return _strs(as_object(refpipe(ref_id)["split"], "split")["testIds"], f"{ref_id} split.testIds")


def ref_features(ref_id: str) -> list[str]:
    """The reference pipeline's feature columns for a reference id."""
    return _strs(refpipe(ref_id)["features"], f"{ref_id} features")


def ref_primary(ref_id: str) -> tuple[float, float, float]:
    """(value, lower, upper) of the reference pipeline's holdout primary score."""
    p = as_object(refpipe(ref_id)["primaryScore"], f"{ref_id} primaryScore")
    ci = as_list(p["ci"], "ci")
    assert len(ci) == 2
    return as_number(p["value"], "value"), as_number(ci[0], "ci[0]"), as_number(ci[1], "ci[1]")


def ref_inner_score(ref_id: str, candidate: str) -> float:
    """The reference pipeline's inner-CV primary score of one of its candidates (glm, lgbm, xgb)."""
    for c in as_list(refpipe(ref_id)["candidates"], f"{ref_id} candidates"):
        entry = as_object(c, "candidate")
        if entry.get("name") == candidate:
            return as_number(entry["innerCvScore"], f"{candidate} innerCvScore")
    raise KeyError(f"{ref_id} has no reference candidate {candidate}")


# ------------------------------------------------------------------------------------------------- helpers --------

def scenario_run(server: FileServer, sid: str, task: JsonObject, family: str, *, shuffle: bool = False,
                 label_map: dict[int, str] | None = None, cands: list[JsonValue] | None = None,
                 **proto_over: JsonValue) -> TrainerCompleted:
    """One trainer run on a planted scenario over the reference pipeline's features and locked holdout."""
    ref_id = f"{sid}-shuffled" if shuffle else sid
    df = scenario(sid)
    if shuffle:
        df["Target"] = df["Target"].to_numpy()[np.random.default_rng(12345).permutation(len(df))]
    feats: dict[str, JsonObject] = {c: NUMERIC for c in ref_features(ref_id)}
    m, n = snapshot_files(df, feats, ref_test_ids(ref_id), label_map=label_map)
    return completed(request(server, m, n, task, protocol(family, **proto_over),
                             cands if cands is not None else candidates(family), tag=ref_id))


def shipped_holdout(r: TrainerCompleted) -> MetricWithInterval:
    """The holdout primary score of what the gate ships: the finalist, or the simple baseline it keeps."""
    assert r.gate.shipped is not None, "the gate ships nothing"
    if r.gate.outcome == "model":
        return r.holdout.primary
    kind = _MEMBER_KIND[r.gate.shipped]
    return next(b.holdout for b in r.baselines if b.baseline.kind == kind)


def shipped_predictions(r: TrainerCompleted, frame: pd.DataFrame) -> FArr:
    """The shipped artifact's predictions for `frame`, loaded the way the engine loads it."""
    predictor, env = load_artifact(shipped_artifact(r))
    return np.asarray(predictor.predict(frame[[c.name for c in env.featureColumns]]), dtype=np.float64)


def predict_class_vectors(r: TrainerCompleted, rows: list[JsonObject]) -> tuple[list[str], list[list[float]]]:
    """POST /predict with the shipped artifact: (the response's classOrder, each row's probability vector)."""
    status, body = post("/predict", {"artifact_b64": shipped_artifact(r).bytesBase64, "fitted_preprocessing": {},
                                     "feature_schema": [], "rows": list(rows)})
    assert status == 200, f"/predict answered {status}: {body}"
    resp = as_object(body, "/predict response")
    order = _strs(resp["classOrder"], "classOrder")
    preds = resp["predictions"]
    assert isinstance(preds, list)
    vectors: list[list[float]] = []
    for i, p in enumerate(preds):
        probs = as_object(p, f"predictions[{i}]").get("probabilities")
        vectors.append([as_number(x, "probability") for x in probs] if isinstance(probs, list) else [])
    return order, vectors


def records(frame: pd.DataFrame) -> list[JsonObject]:
    """Frame rows as JSON objects (numpy scalars as Python scalars, missing as null)."""
    out: list[JsonObject] = []
    for rec in frame.to_dict("records"):
        row: JsonObject = {}
        for k, v in rec.items():
            item: object = v.item() if isinstance(v, np.generic) else v
            if isinstance(item, float) and math.isnan(item):
                row[str(k)] = None
            elif item is None or isinstance(item, (bool, int, float, str)):
                row[str(k)] = item
            else:
                raise TypeError(f"column {k} holds a {type(item).__name__}")
        out.append(row)
    return out


def strictly_inside(m: MetricWithInterval) -> bool:
    """Both bounds are finite and lie on either side of the estimate."""
    return math.isfinite(m.interval.lower) and math.isfinite(m.interval.upper) and \
        m.interval.lower < m.value < m.interval.upper


# ------------------------------------------------------------------------------------- binary claims (C2) --------

@pytest.mark.gate("C2 -> S4.5")
def test_C2_S4_5_baselines_with_intervals_and_outcomes(server: FileServer) -> None:
    """Every baseline is scored with an interval; the GLM baseline is kept and equals the reference pipeline's; with
    shuffled labels nothing beats the constant predictor."""
    r = scenario_run(server, "C2", BIN, "binary", label_map=LM)
    assert [b.baseline.kind for b in r.baselines] == ["dummy", "one-feature", "glm"]
    assert all(strictly_inside(b.holdout) for b in r.baselines)
    assert (r.gate.outcome, r.gate.shipped) == ("keep-simple-baseline", "glm")
    value, lo, hi = ref_primary("C2")
    glm = shipped_holdout(r)
    assert glm.value == pytest.approx(value, abs=1e-6)
    assert (glm.interval.lower, glm.interval.upper) == pytest.approx((lo, hi), abs=1e-6)
    shuffled = scenario_run(server, "C2", BIN, "binary", shuffle=True, label_map=LM)
    assert shuffled.gate.outcome == "no-signal"


@pytest.mark.gate("C2 -> S4.1")
def test_C2_S4_1_log_loss_not_accuracy_ranks(server: FileServer) -> None:
    """At a 2% base rate every candidate predicts 'no fraud' for nearly every row, so accuracy barely tells a constant
    predictor from a model. A near-constant candidate listed first (a logistic regression regularised almost to its
    intercept) ranks above 0 candidates with a better log loss: log loss, not accuracy, ranks and gates."""
    flat: tuple[str, str, JsonObject] = ("near_constant", "logistic_regression", {"C": 1e-6})
    r = scenario_run(server, "C2", BIN, "binary", label_map=LM,
                     cands=candidates("binary", [flat, ("glm_candidate", "logistic_regression", {}),
                                                 ("lgbm", "lightgbm", {}), ("xgb", "xgboost", {})]))
    assert r.holdout.primary.metric == "log-loss"
    inner = {s.candidate: s.inner for s in r.innerScores}
    assert all(s.metric == "log-loss" for s in inner.values())
    better = [c for c, s in inner.items() if c != "near_constant" and s.interval.upper < inner["near_constant"].interval.lower]
    assert better, f"no candidate's inner log loss lies below the near-constant candidate's: {inner}"
    assert r.finalist != "near_constant", f"the near-constant candidate ranked above {better}"
    dummy = next(b for b in r.baselines if b.role == "dummy")
    assert any(b.role == "simple" and b.holdout.value < dummy.holdout.value for b in r.baselines)
    assert r.comparisons["modelVsDummy"].beats is True and r.gate.outcome != "no-signal"


@pytest.mark.gate("C2 -> S6.2")
def test_C2_S6_2_auc_interval_width_band(server: FileServer) -> None:
    """The bootstrap AUC interval's half-width over 1.96 Hanley-McNeil standard errors lies in [0.67, 1.28]."""
    r = scenario_run(server, "C2", BIN, "binary", label_map=LM)
    auc = next(s for s in r.holdout.secondary if s.metric == "auc")
    y = scenario("C2").set_index("ID").loc[ref_test_ids("C2")]["Target"].to_numpy(dtype=np.int64)
    se = IV.hanley_mcneil_se(auc.value, int(y.sum()), int(len(y) - y.sum()))
    ratio = (auc.interval.upper - auc.interval.lower) / 2 / (1.96 * se)
    assert 0.67 <= ratio <= 1.28, f"AUC {auc.value:.4f} [{auc.interval.lower:.4f}, {auc.interval.upper:.4f}]: ratio {ratio:.3f}"


@pytest.mark.gate("C2 -> S1.2")
def test_C2_S1_2_precision_at_capacity(server: FileServer) -> None:
    """Precision among the 150 highest-scored claims a year is reported with its 95% interval beside the base rate."""
    df = scenario("C2")
    decision: JsonObject = {"action": "review claim", "actorRole": "investigator", "capacityPerPeriod": 150,
                            "period": "year"}
    m, n = snapshot_files(df, {c: NUMERIC for c in ref_features("C2")}, ref_test_ids("C2"), label_map=LM,
                          decision=decision)
    r = completed(request(server, m, n, BIN, protocol("binary"), candidates("binary"), tag="c2-op"))
    op = r.operatingPoint
    assert op is not None and op.capacityPerPeriod == 150
    assert op.precisionAtCapacity.metric == "precision" and op.precisionAtCapacity.interval.level == 0.95
    assert op.precisionAtCapacity.interval.lower <= op.precisionAtCapacity.value <= op.precisionAtCapacity.interval.upper
    assert op.baseRate == pytest.approx(151 / 7500, abs=1e-9)


# -------------------------------------------------------------------------------- count and non-negative ---------

def _assert_no_negative_predictions(r: TrainerCompleted, sid: str) -> None:
    hold = scenario(sid).set_index("ID").loc[ref_test_ids(sid)]
    p = shipped_predictions(r, hold)
    assert int(np.sum(p < 0)) == 0, f"{int(np.sum(p < 0))} negative predictions"


def _assert_family_objectives(r: TrainerCompleted, sid: str) -> None:
    """The GLM baseline and the boosted candidates fit the family's own likelihood: the GLM baseline's holdout score
    and the XGBoost candidate's inner-CV score equal the reference pipeline's (same model, objective, seed and folds).
    LightGBM is not pinned: the trainer centres numeric columns before every driver and LightGBM's histogram bins
    always split at zero, so its fits differ from the reference pipeline's uncentred ones by design."""
    value, _lo, _hi = ref_primary(sid)
    glm = next(b.holdout for b in r.baselines if b.baseline.kind == "glm")
    assert glm.value == pytest.approx(value, abs=1e-6), f"GLM baseline {glm.value} vs the reference pipeline's {value}"
    xgb = next(s.inner for s in r.innerScores if s.candidate == "xgb")
    want = ref_inner_score(sid, "xgb")
    assert xgb.value == pytest.approx(want, abs=1e-6), f"xgb inner score {xgb.value} vs the reference pipeline's {want}"


@pytest.mark.gate("R3 -> S4.3")
def test_R3_S4_3_poisson_deviance(server: FileServer) -> None:
    """A count target ranks and gates on Poisson deviance; its GLM baseline and XGBoost candidate are the reference
    pipeline's Poisson fits (scores within 1e-6); what ships scores at most 1.1713 and predicts no negatives."""
    r = scenario_run(server, "R3", {"kind": "count"}, "count")
    assert r.holdout.primary.metric == "poisson-deviance" and r.gate.shipped is not None
    _assert_family_objectives(r, "R3")
    shipped = shipped_holdout(r)
    assert shipped.value <= 1.1713, f"shipped {r.gate.shipped} Poisson deviance {shipped.value}"
    _assert_no_negative_predictions(r, "R3")


@pytest.mark.gate("R2p -> S4.3")
def test_R2p_S4_3_tweedie_deviance(server: FileServer) -> None:
    """A non-negative target ranks and gates on Tweedie deviance at its declared power 1.5; its GLM baseline and XGBoost
    candidate are the reference pipeline's Tweedie fits (scores within 1e-6); what ships scores at most 22.7529 and
    predicts no negatives."""
    r = scenario_run(server, "R2p", {"kind": "non-negative", "tweediePower": 1.5}, "non-negative")
    assert r.holdout.primary.metric == "tweedie-deviance" and r.gate.shipped is not None
    _assert_family_objectives(r, "R2p")
    shipped = shipped_holdout(r)
    assert shipped.value <= 22.7529, f"shipped {r.gate.shipped} Tweedie deviance {shipped.value}"
    _assert_no_negative_predictions(r, "R2p")


@pytest.mark.gate("R2-real -> S4.4")
def test_R2_real_S4_4_rmse_across_families_is_refused(server: FileServer) -> None:
    """A non-negative target's candidates ranked by RMSE is refused before anything fits."""
    df = scenario("R2-real")
    feats: dict[str, JsonObject] = {c: (NUMERIC if pd.api.types.is_numeric_dtype(df[c]) else ONEHOT)
                                    for c in ref_features("R2-real")}
    m, n = snapshot_files(df, feats, ref_test_ids("R2-real"))
    req = request(server, m, n, {"kind": "non-negative", "tweediePower": 1.5},
                  protocol("non-negative", primaryScore={"family": "continuous", "metric": "rmse"}),
                  candidates("non-negative", [("tweedie", "lightgbm", {}), ("xgb", "xgboost", {})]))
    status, body = post("/trainer", req)
    detail = as_object(body, "response").get("detail")
    assert status == 400 and isinstance(detail, str) and "ranking across families" in detail, f"{status}: {body}"


# ------------------------------------------------------------------------------------------- continuous (R1) ------

@pytest.mark.gate("R1 -> S6.6")
def test_R1_S6_6_prediction_interval_coverage(server: FileServer) -> None:
    """80% and 90% split-conformal intervals from one run, each covering within nominal +/- 3 binomial SEs of 1,500.
    The finalist is a fully grown random forest, whose training residuals are far smaller than its error on unseen
    rows: intervals sized from anything but out-of-fold residuals undercover."""
    r = scenario_run(server, "R1", {"kind": "continuous"}, "continuous",
                     cands=candidates("continuous", [("forest", "random_forest", {})]),
                     predictionIntervals={"method": "split-conformal", "nominalCoverage": [0.8, 0.9]})
    assert r.finalist == "forest"
    bands = {0.8: (0.769, 0.831), 0.9: (0.877, 0.923)}
    got = {c.nominal: c for c in r.predictionIntervalCoverage}
    assert set(got) == set(bands)
    for level, (lo, hi) in bands.items():
        assert got[level].n == 1500 and lo <= got[level].observed <= hi, f"{level}: {got[level]}"


# ------------------------------------------------------------------------------------------ multiclass (W9) ------

W9_FEATURES: dict[str, JsonObject] = {"TicketTier": ONEHOT, "DaysRegisteredBefore": NUMERIC, "PriorAttendance": NUMERIC}


def w9_frame(seed: int) -> pd.DataFrame:
    w = world("W9-multiclass", seed)
    return pd.DataFrame({"ID": w["ID"], "EntityKey": w["PersonID"], "T": w["EventDate"], "TicketTier": w["TicketTier"],
                         "DaysRegisteredBefore": w["DaysRegisteredBefore"], "PriorAttendance": w["PriorAttendance"],
                         "Target": w["Outcome"]})


@pytest.mark.gate("C3 -> S4.1")
def test_C3_S4_1_multiclass_log_loss_and_class_vector(server: FileServer) -> None:
    """A multiclass target ranks on multiclass log loss (what ships scores at most 0.7427) and /predict returns a
    probability vector over the declared classes for every one of the 3,000 held-out rows."""
    df = w9_frame(42)
    classes = sorted(str(c) for c in df["Target"].unique())
    test_ids = ref_test_ids("C3")
    m, n = snapshot_files(df, W9_FEATURES, test_ids)
    task: JsonObject = {"kind": "multiclass", "classOrder": list(classes), "adverseIndices": [classes.index("NoShow")]}
    r = completed(request(server, m, n, task, protocol("multiclass"), candidates("multiclass"), tag="c3"))
    assert r.holdout.primary.metric == "multiclass-log-loss"
    shipped = shipped_holdout(r)
    assert shipped.value <= 0.7427, f"shipped {r.gate.shipped} multiclass log loss {shipped.value}"
    order, vectors = predict_class_vectors(r, records(df.set_index("ID").loc[test_ids][list(W9_FEATURES)]))
    assert order == classes and len(vectors) == 3000
    carrying = sum(1 for v in vectors if len(v) == 3 and abs(sum(v) - 1) < 1e-9)
    assert carrying == 3000, f"{carrying} of 3000 rows carry a 3-class probability vector"


@pytest.mark.gate("W9 -> S6.3")
def test_W9_S6_3_per_class_auc_and_top_label_slope(server: FileServer) -> None:
    """Classes declared out of alphabetical order: each class's AUC from /predict's class vector lies within 0.03 of
    the planted oracle's, and the top-label calibration slope lies in 0.8-1.2."""
    df = w9_frame(42)
    truth = world_truth("W9-multiclass", 42).set_index("EventRegistrationID")
    classes = ["NoShow", "Attended", "Cancelled"]
    assert classes != sorted(classes) and set(classes) == {str(c) for c in df["Target"].unique()}
    hold = [str(i) for i in df.loc[pd.to_datetime(df["T"]).dt.year == 2026, "ID"]]
    m, n = snapshot_files(df, W9_FEATURES, hold)
    task: JsonObject = {"kind": "multiclass", "classOrder": list(classes), "adverseIndices": [0]}
    r = completed(request(server, m, n, task, protocol("multiclass"), candidates("multiclass"), tag="w9"))
    assert r.calibration is not None and 0.8 <= r.calibration.slope <= 1.2, f"top-label slope {r.calibration}"
    h = df.set_index("ID").loc[hold]
    order, vectors = predict_class_vectors(r, records(h[list(W9_FEATURES)]))
    assert order == classes
    P = np.asarray(vectors, dtype=np.float64)
    y = np.asarray([classes.index(str(v)) for v in h["Target"]], dtype=np.float64)
    oracle = truth.loc[hold, [f"TrueP_{c}" for c in classes]].to_numpy(dtype=np.float64)
    model_auc = scores.auc_by_class(y, P)
    oracle_auc = scores.auc_by_class(y, oracle)
    gaps = [abs(a - b) for a, b in zip(model_auc, oracle_auc)]
    assert len(gaps) == 3 and all(g <= 0.03 for g in gaps), f"model {model_auc} vs oracle {oracle_auc}"


# --------------------------------------------------------------------------------------- binary worlds (W7, W1) ---

@pytest.mark.gate("W7 -> S6.2")
@pytest.mark.parametrize("seed", [42, 43, 44])
def test_W7_S6_2_every_number_has_both_bounds(server: FileServer, seed: int) -> None:
    """On a small imbalanced world every reported score and every paired comparison has a lower and an upper bound on
    either side of its estimate."""
    df = world_frame(world("W7-small-imbalanced", seed))
    m, n = snapshot_files(df, W_BINARY_FEATURES, last_cycle_ids(df), label_map=LM)
    r = completed(request(server, m, n, BIN, protocol("binary"), candidates("binary"), tag=f"w7-{seed}"))
    rows = [r.holdout.primary, *r.holdout.secondary, *(b.holdout for b in r.baselines), *(s.inner for s in r.innerScores)]
    one_sided = [f"{x.metric} {x.value} [{x.interval.lower}, {x.interval.upper}]" for x in rows if not strictly_inside(x)]
    assert not one_sided, f"scores without both bounds: {one_sided}"
    bad = [f"{k} {c.value} {c.ci}" for k, c in r.comparisons.items()
           if not (math.isfinite(c.ci[0]) and math.isfinite(c.ci[1]) and c.ci[0] < c.value < c.ci[1])]
    assert not bad, f"comparisons without both bounds: {bad}"


# The calibration hide rule's declared expectation on W1-signal: the family x seed cells whose holdout calibration
# slope lies outside 0.8-1.2, so the family is hidden there. Every other cell is calibrated and offered. LightGBM s43
# ships uncalibrated (the cross-fitted map neither lowers the log loss nor brings the slope inside) at 0.7999;
# random forest s42 (1.2227) and MLP s42 (0.7994) ship an isotonic map whose holdout slope falls just outside.
W1_HIDDEN: frozenset[tuple[str, int]] = frozenset({("lightgbm", 43), ("random_forest", 42), ("mlp", 42)})


@pytest.mark.gate("W1 -> S6.3")
@pytest.mark.parametrize("seed", [42, 43, 44])
@pytest.mark.parametrize("driver", ["logistic_regression", "random_forest", "xgboost", "lightgbm", "mlp"])
def test_W1_S6_3_every_family_calibrated_or_hidden(server: FileServer, seed: int, driver: str) -> None:
    """Every family is reported with log loss, Brier and a calibration slope; an offered family is calibrated (slope
    0.8-1.2) and the family of a cell declared miscalibrated is hidden by the hide rule."""
    df = world_frame(world("W1-signal", seed))
    m, n = snapshot_files(df, W_BINARY_FEATURES, last_cycle_ids(df), label_map=LM)
    r = completed(request(server, m, n, BIN, protocol("binary"), candidates("binary", [(driver, driver, {})]),
                          tag=f"w1-{seed}-{driver}"))
    assert r.calibration is not None, "no calibration reported"
    metrics = {s.metric for s in r.holdout.secondary} | {r.holdout.primary.metric}
    assert {"log-loss", "brier"} <= metrics
    slope = r.calibration.slope
    expected_hidden = (driver, seed) in W1_HIDDEN
    assert CAL.slope_hides_family(slope) is expected_hidden, \
        f"{driver} s{seed}: slope {slope:.4f}, declared {'hidden' if expected_hidden else 'offered'}"
    if expected_hidden:
        assert not 0.8 <= slope <= 1.2, f"declared-hidden family {driver} s{seed} measures slope {slope:.4f}, inside"
    else:
        assert 0.8 <= slope <= 1.2, f"offered family {driver} s{seed} is miscalibrated: slope {slope:.4f}"


# ------------------------------------------------------------------------------------------------- slices --------

C1_NUMERIC = ("tenure_years", "prior_lapse", "events_attended_y", "courses_completed_y", "certs_held_y",
              "committee_active_y", "nondues_lines_y", "nondues_spend_y")
C1_FEATURES: dict[str, JsonObject] = {**{c: NUMERIC for c in C1_NUMERIC},
                                      **{c: ONEHOT for c in ("tier", "segment", "region")}}


def c1_frame() -> pd.DataFrame:
    """C1: the MoreCheese person-years table, keyed like the reference pipeline (person:period)."""
    py = person_years()
    df = pd.DataFrame({"ID": py["person_id"].astype(str) + ":" + py["period_index"].astype(str),
                       "EntityKey": py["person_id"].astype(str),
                       "T": pd.to_datetime(py["decision_date"]).dt.strftime("%Y-%m-%d"),
                       "Target": py["renewed"].astype(int)})
    for c in (*C1_NUMERIC, "tier", "segment", "region"):
        df[c] = py[c].to_numpy()
    df["tenure_band"] = np.minimum(np.floor(df["tenure_years"]), 5).astype(int).astype(str)
    return df


@pytest.mark.gate("C1 -> S6.4")
def test_C1_S6_4_region_and_tenure_slices(server: FileServer) -> None:
    """Every declared region and tenure-band value of the holdout is its own slice, each with a 95% interval."""
    df = c1_frame()
    test_ids = ref_test_ids("C1")
    m, n = snapshot_files(df, C1_FEATURES, test_ids, label_map=LM, slice_cols={"Region": "region", "TenureBand": "tenure_band"})
    proto = protocol("binary", slices={"outOfTime": False, "subgroups": ["Region", "TenureBand"]},
                     intervals={"level": 0.95, "method": "cluster-bootstrap", "resamples": 1000, "pairedTest": "paired-bootstrap"})
    r = completed(request(server, m, n, BIN, proto, candidates("binary"), tag="c1-slices"))
    hold = df.set_index("ID").loc[test_ids]
    declared = {("Region", v) for v in hold["region"].astype(str)} | {("TenureBand", v) for v in hold["tenure_band"]}
    got = {(s.slice.field, s.slice.value) for s in r.slices if s.slice.kind == "subgroup"}
    assert got == declared
    bad = [f"{s.slice}: {s.primary.value} [{s.primary.interval.lower}, {s.primary.interval.upper}]"
           for s in r.slices if not (strictly_inside(s.primary) and s.primary.interval.level == 0.95)]
    assert not bad, f"slices without a 95% interval: {bad}"


@pytest.mark.gate("D1c -> S6.4")
def test_D1c_S6_4_one_slice_per_post_cutoff_period(server: FileServer) -> None:
    """Each post-cutoff year of the holdout is its own out-of-time slice, each with a 95% interval."""
    df = scenario("D1c")
    hold = [str(i) for i in df.loc[pd.to_datetime(df["T"]) >= pd.Timestamp("2022-01-01"), "ID"]]
    m, n = snapshot_files(df, {c: NUMERIC for c in ("EngagementZ", "TenureZ", "AutoRenew")}, hold, label_map=LM)
    r = completed(request(server, m, n, BIN, protocol("binary", slices={"outOfTime": True, "subgroups": []}),
                          candidates("binary"), tag="d1c"))
    periods = sorted({str(t)[:4] + "-01-01" for t in df.loc[df["ID"].isin(hold), "T"]})
    got = [(s.slice.period, s.primary) for s in r.slices if isinstance(s.slice, OutOfTimeSlice)]
    assert len(periods) > 1
    assert sorted(period for period, _ in got) == periods
    assert all(strictly_inside(primary) and primary.interval.level == 0.95 for _, primary in got)
