"""The holdout stage: one scoring of the locked holdout for one finalist, baselines, paired comparisons, the publishing
gate, calibration, slices, the operating point, prediction-interval coverage, the incumbent diff and the artifacts.

Order matters and is fixed: (1) the calibration decision uses only out-of-fold development predictions; (2) the
finalist (calibrated or not) and every baseline are fitted on development rows; (3) the holdout is read ONCE, here,
and `holdoutAccess` is stamped at that moment; (4) everything after uses only those predictions.
"""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Sequence, Tuple

import numpy as np
import numpy.typing as npt
import pandas as pd

from . import artifacts, artifacts_v2, baselines as BL, calibration as CAL, encoding, intervals as IV, scores
from . import snapshot as SN
from .array_types import FArr, IntArr
from .failures import RunClock, SnapshotLoadFailure, TrainerFailure
from .folds import Fold, grouped, repeated_stratified
from .gate import NO_SIMPLE_SIGNAL_NOTE, GateRecord, GateRun, run_gate
from .snapshot import Snapshot, fetch_verified
from .snapshot_format import INCUMBENT_SCORE_COLUMN
from .trainer import CandidateCV, EncodedLabel, SelectionOutcome, TrainedPredictor
from .trainer_schemas import (
    AutoCalibration, BaselineResult, CalibrationReport, CandidateInnerScore, CandidateSpec, CodeVersion, GateKeepSimple,
    GateModel, GateNoSignal, HoldoutAccess, HoldoutScores, IncumbentDiff, Interval, IsotonicCalibration, LeakageFlag,
    MetricKey, MetricWithInterval, NoCalibration, OperatingPoint, OutOfTimeSlice, PairedComparison, PlattCalibration,
    PredictionIntervalCoverage, ReliabilityRow, ReturnedArtifact, RunCost, SliceResult, SubgroupSlice,
    TrainerCompleted, TrainerRequest,
)

# The interval level the contract fixes for every holdout interval.
LEVEL = 0.95
ReportedCalibration = Literal["platt", "isotonic", "auto", "not-applicable"]


def _groups(req: TrainerRequest, snap: Snapshot, rows: IntArr, ordinals: IntArr) -> Optional[List[str]]:
    """Resampling units for intervals: entity keys for a cluster bootstrap, decision periods for a block bootstrap."""
    method = req.protocol.intervals.method
    if method == "cluster-bootstrap":
        return [snap.group_keys[int(i)] or snap.entity_keys[int(i)] for i in rows]
    if method == "block-bootstrap":
        return [str(int(ordinals[int(i)])) for i in rows]
    return None


def _mwi(metric: MetricKey, value: float, ci: IV.BootstrapInterval, n: int) -> MetricWithInterval:
    return MetricWithInterval(metric=metric, value=float(value),
                              interval=Interval(level=LEVEL, lower=float(ci.lower), upper=float(ci.upper)), n=n)


def inner_scores(cv: Dict[str, CandidateCV], metric: MetricKey) -> List[CandidateInnerScore]:
    """Every candidate's inner-CV score with its corrected interval; optimistic by construction (it chose the finalist)."""
    return [CandidateInnerScore(candidate=c.name, folds=c.inner.folds, optimistic=True,
                                inner=MetricWithInterval(metric=metric, value=c.inner.mean, n=c.inner.n_rows,
                                                         interval=Interval(level=LEVEL, lower=c.inner.lower,
                                                                           upper=c.inner.upper)))
            for c in cv.values()]


@dataclass(frozen=True)
class CalibrationDecision:
    """Whether the map is applied, its method, and the raw and cross-fitted primary scores the decision compared."""

    applied: bool
    method: CAL.CalMethod
    raw_score: float
    cross_fitted_score: float


def _declared_kind(req: TrainerRequest) -> Literal["platt", "isotonic", "auto"]:
    c = req.protocol.calibration
    if isinstance(c, PlattCalibration):
        return "platt"
    if isinstance(c, IsotonicCalibration):
        return "isotonic"
    return "auto"


def _halves(y: FArr, groups: Sequence[str], seed: int) -> List[Fold]:
    """The 2-fold split of the calibration cross-fit: whole grouping units when units repeat, else random rows.

    Raises:
        TrainerFailure: Stage `holdout`, when the rows cannot be split in two (one grouping unit, or one row).
    """
    try:
        if len(set(groups)) < len(groups):
            return grouped(list(groups), 2, 1, seed)
        return repeated_stratified(y, 2, 1, seed, stratify=False)
    except ValueError as exc:
        raise TrainerFailure("holdout", f"the calibration cross-fit cannot split the out-of-fold rows: {exc}") from exc


def decide_calibration(req: TrainerRequest, enc: EncodedLabel, oof: FArr, y_val: FArr,
                       val_groups: Sequence[str]) -> Tuple[Optional[CAL.Calibrator], Optional[CalibrationDecision]]:
    """Fit the map on the finalist's out-of-fold predictions (rows its fold models never trained on); apply it to the
    full refit only when a 2-fold cross-fit of the map lowers the primary score on those rows, or repairs a slope
    outside 0.8-1.2. Each map's method follows the rows it is fitted on (`auto`: Platt below the threshold)."""
    c = req.protocol.calibration
    if isinstance(c, NoCalibration) or enc.family not in ("binary", "multiclass"):
        return None, None
    kind = _declared_kind(req)
    threshold = c.thresholdRows if isinstance(c, AutoCalibration) else 0
    primary = scores.primary_score(req.protocol.primaryScore.metric, None)
    crossed = np.empty_like(oof)
    for f in _halves(y_val, val_groups, req.protocol.seed):
        method = CAL.choose_method(kind, len(f.train), threshold)
        crossed[f.valid] = CAL.Calibrator(method).fit(y_val[f.train], oof[f.train]).apply(oof[f.valid])
    raw = primary.aggregate(y_val, oof)
    cal = primary.aggregate(y_val, crossed)
    apply = cal < raw or _slope_repaired(enc, y_val, oof, crossed)
    method = CAL.choose_method(kind, len(y_val), threshold)
    calibrator = CAL.Calibrator(method).fit(y_val, oof)
    return (calibrator if apply else None), CalibrationDecision(apply, method, raw, cal)


def _top_label(enc: EncodedLabel, y: FArr, p: FArr) -> Tuple[FArr, FArr]:
    """Binary outcome and probability of the top label (multiclass), or of classOrder[1] (binary)."""
    if enc.family == "multiclass":
        hit = (np.argmax(p, axis=1) == np.asarray(y, dtype=np.int64)).astype(np.float64)
        return hit, np.asarray(np.max(p, axis=1), dtype=np.float64)
    return y, p


def _slope_repaired(enc: EncodedLabel, y: FArr, raw: FArr, crossed: FArr) -> bool:
    """Also apply the map when the raw out-of-fold slope is outside 0.8-1.2 and the cross-fitted map brings it inside
    (a miscalibrated family is repaired rather than shipped as is)."""
    ry, rp = _top_label(enc, y, raw)
    cy, cp = _top_label(enc, y, crossed)
    return CAL.slope_hides_family(CAL.calibration_fit(ry, rp).slope) and \
        not CAL.slope_hides_family(CAL.calibration_fit(cy, cp).slope)


def _calibration_report(req: TrainerRequest, enc: EncodedLabel, y: FArr, p: FArr,
                        decision: Optional[CalibrationDecision]) -> Optional[CalibrationReport]:
    """Holdout calibration of the delivered finalist (top-label for multiclass); the method is the fitted one when the
    map was applied, else the declared one."""
    if decision is None:
        return None
    yk, top = _top_label(enc, y, p)
    fit = CAL.calibration_fit(yk, top)
    rel = [ReliabilityRow(binLower=b.bin_lower, binUpper=b.bin_upper, meanPredicted=b.mean_predicted,
                          observedRate=b.observed_rate, n=b.n) for b in CAL.reliability(yk, top)]
    method: ReportedCalibration = decision.method if decision.applied else _declared_kind(req)
    return CalibrationReport(method=method, intercept=fit.intercept, slope=fit.slope, reliability=rel)


def operating_point(req: TrainerRequest, snap: Snapshot, hold: IntArr, ordinals: IntArr, y: FArr, p: FArr,
                    groups: Optional[List[str]]) -> Optional[OperatingPoint]:
    """Precision among the top k = capacity x (holdout decision periods) rows by adverse-class score, beside the base
    rate. None without a declared capacity or for a task other than binary."""
    cap = snap.decision.capacity_per_period
    task = req.task
    if cap is None or task.kind != "binary":
        return None
    adverse = task.adverseIndex
    s = p if adverse == 1 else 1 - p
    periods = {int(ordinals[int(i)]) for i in hold}
    k = max(1, min(len(hold), int(round(cap * len(periods)))))
    ya = (np.asarray(y, dtype=np.int64) == adverse).astype(np.float64)

    def prec_at_k(yy: FArr, ss: FArr) -> float:
        kk = max(1, int(round(k * len(ss) / len(s))))
        top = np.argsort(-np.asarray(ss, dtype=np.float64), kind="mergesort")[:kk]
        return float(np.mean(np.asarray(yy, dtype=np.float64)[top]))

    ci = IV.bootstrap_ci(ya, s, prec_at_k, req.protocol.intervals.resamples, req.protocol.seed, groups, LEVEL)
    return OperatingPoint(capacityPerPeriod=float(cap), precisionAtCapacity=_mwi("precision", prec_at_k(ya, s), ci, k),
                          baseRate=float(np.mean(ya)))


def _period_start(snap: Snapshot, i: int) -> str:
    """The first day (yyyy-mm-dd) of row i's decision period: the manifest's period when set, else its decision date,
    bucketed at the unit's decision period."""
    text = snap.periods[i] or snap.decision_dates[i]
    day = dt.date.fromisoformat(text[:10])
    period = snap.decision.period
    if period == "year":
        day = day.replace(month=1, day=1)
    elif period == "quarter":
        day = day.replace(month=(day.month - 1) // 3 * 3 + 1, day=1)
    elif period == "month":
        day = day.replace(day=1)
    elif period == "week":
        day = dt.date.fromordinal(day.toordinal() // 7 * 7)
    return day.isoformat()


def slice_results(req: TrainerRequest, snap: Snapshot, hold: IntArr, y: FArr, pred: FArr,
                  primary: scores.PrimaryScore, g: Optional[List[str]]) -> List[SliceResult]:
    """Declared subgroup slices and, when `outOfTime`, one slice per holdout decision period, each with an interval."""
    p = req.protocol
    out: List[SliceResult] = []

    def one(mask: npt.NDArray[np.bool_]) -> MetricWithInterval:
        sub_g = None if g is None else [g[int(i)] for i in np.flatnonzero(mask)]
        ci = IV.bootstrap_ci(y[mask], pred[mask], primary.aggregate, p.intervals.resamples, p.seed, sub_g, LEVEL)
        return _mwi(p.primaryScore.metric, primary.aggregate(y[mask], pred[mask]), ci, int(mask.sum()))

    for field in p.slices.subgroups:
        values = snap.slice_values.get(field)
        if values is None:
            raise TrainerFailure("holdout", f"slice field '{field}' is not in the snapshot's sliceColumns")
        hv = np.asarray([values[int(i)] for i in hold], dtype=object)
        for v in sorted({str(x) for x in hv.tolist()}):
            out.append(SliceResult(slice=SubgroupSlice(kind="subgroup", field=field, value=v), primary=one(hv == v)))
    if p.slices.outOfTime:
        per = np.asarray([_period_start(snap, int(i)) for i in hold], dtype=object)
        for v in sorted({str(x) for x in per.tolist()}):
            out.append(SliceResult(slice=OutOfTimeSlice(kind="out-of-time", period=v), primary=one(per == v)))
    return out


def interval_coverage(req: TrainerRequest, enc: EncodedLabel, r_oof: FArr, y: FArr,
                      pred: FArr) -> List[PredictionIntervalCoverage]:
    """One entry per declared nominal level: split-conformal (|out-of-fold residual| quantile) or out-of-fold
    signed-residual quantiles (lower bound clipped at 0 for count/non-negative); coverage measured on the holdout.
    Empty when the protocol declares no prediction intervals or the task is a classification."""
    pi = req.protocol.predictionIntervals
    if pi is None or enc.family in ("binary", "multiclass"):
        return []
    n = len(r_oof)
    out: List[PredictionIntervalCoverage] = []
    for c in pi.nominalCoverage:
        if pi.method == "split-conformal":
            q = float(np.quantile(np.abs(r_oof), min(1.0, math.ceil((n + 1) * c) / n)))
            lo, hi = pred - q, pred + q
        else:
            lo = pred + float(np.quantile(r_oof, (1 - c) / 2))
            hi = pred + float(np.quantile(r_oof, (1 + c) / 2))
        if enc.family in ("count", "non-negative"):
            lo = np.maximum(lo, 0.0)
        out.append(PredictionIntervalCoverage(nominal=c, observed=float(np.mean((y >= lo) & (y <= hi))), n=len(y)))
    return out


def _incumbent_predictions(req: TrainerRequest, X_hold: pd.DataFrame, n_rows: int, clock: RunClock) -> FArr:
    """The incumbent's predictions on the holdout rows: its artifact downloaded through its pre-authorised URL,
    hash-verified, loaded by the restricted unpickler and scored with its OWN in-fold encoding.

    Raises:
        TrainerFailure: Stage `holdout`, when the artifact cannot be fetched or loaded, needs a column the snapshot
            lacks, cannot score these rows, or returns a prediction count other than the holdout's.
    """
    inc = req.incumbent
    assert inc is not None
    try:
        raw = fetch_verified(inc.artifact, dt.datetime.now(dt.timezone.utc), clock)
    except SnapshotLoadFailure as exc:
        raise TrainerFailure("holdout", f"incumbent {inc.modelId} artifact: {exc.message}") from exc
    try:
        predictor, env = artifacts.load_v2_envelope(raw)
    except artifacts.ArtifactRefusedError as exc:
        raise TrainerFailure("holdout", f"incumbent {inc.modelId} is not a loadable v2 predictor: {exc}") from exc
    needed = [c.name for c in env.featureColumns if c.encoding.kind != "identifier"]
    missing = sorted(set(needed) - set(X_hold.columns))
    if missing:
        raise TrainerFailure("holdout", f"incumbent {inc.modelId} needs columns absent from the snapshot: {missing}")
    try:
        out = np.asarray(predictor.predict(X_hold[needed]), dtype=np.float64)
    except ValueError as exc:
        raise TrainerFailure("holdout", f"incumbent {inc.modelId} cannot score the holdout rows: {exc}") from exc
    if out.shape[0] != n_rows:
        raise TrainerFailure("holdout", f"incumbent {inc.modelId} returned {out.shape[0]} predictions for {n_rows} "
                                        "holdout rows")
    return out


def incumbent_diff(req: TrainerRequest, X_hold: pd.DataFrame, y_hold: FArr, shipped_pred: Optional[FArr],
                   primary: scores.PrimaryScore, g: Optional[List[str]], clock: RunClock) -> Optional[IncumbentDiff]:
    """Paired (incumbent loss - shipped loss) on the same holdout rows, for comparing with the published model. Null
    with no incumbent or a no-signal gate."""
    if req.incumbent is None or shipped_pred is None:
        return None
    inc = _incumbent_predictions(req, X_hold, len(y_hold), clock)
    r = IV.paired_bootstrap(y_hold, inc, shipped_pred, primary.aggregate, req.protocol.intervals.resamples,
                            req.protocol.seed, g, LEVEL)
    return IncumbentDiff(incumbentModelId=req.incumbent.modelId, value=r.value, lower=r.lower, upper=r.upper)


def _with_incumbent(X: pd.DataFrame, snap: Snapshot, rows: IntArr) -> pd.DataFrame:
    """The frame plus the snapshot's incumbent-score column (for the incumbent-heuristic baseline), when present."""
    if snap.incumbent_score is None:
        return X
    return X.assign(**{INCUMBENT_SCORE_COLUMN: snap.incumbent_score[rows]})


def _fit_baselines(req: TrainerRequest, columns: Sequence[encoding.ColumnSpec], X_dev: pd.DataFrame, y_dev: FArr,
                   enc: EncodedLabel, out: SelectionOutcome, snap: Snapshot, dev: IntArr) -> List[BL.FittedBaseline]:
    """Fits every declared baseline on development rows only."""
    inc_col = INCUMBENT_SCORE_COLUMN if snap.incumbent_score is not None else None
    try:
        return BL.fit_all(req.protocol, columns, _with_incumbent(X_dev, snap, dev),
                          EncodedLabel(y_dev, enc.family, enc.class_order, enc.tweedie_power), out.folds, req.threads,
                          inc_col)
    except ValueError as exc:
        raise TrainerFailure("baselines", str(exc)) from exc


def _secondary_applies(metric: str, family: str) -> bool:
    """A declared secondary metric is reported only for the label families it is defined on."""
    if metric in ("precision", "recall", "f1", "calibration-slope"):
        return family == "binary"
    if metric in ("auc", "accuracy"):
        return family in ("binary", "multiclass")
    if metric == "r2":
        return family not in ("binary", "multiclass")
    return True


# The family's other proper score, reported beside the primary one (it never ranks).
_COMPANION_SCORE: Dict[str, scores.PrimaryMetric] = {"log-loss": "brier", "brier": "log-loss",
                                                       "multiclass-log-loss": "brier"}


def _secondary_metrics(req: TrainerRequest, enc: EncodedLabel, y_hold: FArr, pred: FArr,
                       g: Optional[List[str]]) -> List[MetricWithInterval]:
    """Declared secondary metrics plus the family's companion proper score."""
    p = req.protocol
    R, seed, n = p.intervals.resamples, p.seed, len(y_hold)
    out: List[MetricWithInterval] = []
    for m in p.secondaryMetrics:
        if _secondary_applies(m, enc.family):
            fn = scores.secondary_fn(m)
            out.append(_mwi(m, fn(y_hold, pred), IV.bootstrap_ci(y_hold, pred, fn, R, seed, g, LEVEL), n))
    other = _COMPANION_SCORE.get(p.primaryScore.metric)
    if other is not None:
        alt = scores.primary_score(other, None)
        out.append(_mwi(other, alt.aggregate(y_hold, pred), IV.bootstrap_ci(y_hold, pred, alt.aggregate, R, seed, g, LEVEL), n))
    return out


def _baseline_results(req: TrainerRequest, fitted: Sequence[BL.FittedBaseline], primary: scores.PrimaryScore,
                      y_hold: FArr, bpred: Dict[str, FArr], g: Optional[List[str]]) -> List[BaselineResult]:
    """Each baseline's holdout primary score with its interval."""
    p = req.protocol
    R, seed, n = p.intervals.resamples, p.seed, len(y_hold)
    return [BaselineResult(baseline=p.baselines[b.spec_index], role=b.role,
                           holdout=_mwi(p.primaryScore.metric, primary.aggregate(y_hold, bpred[b.name]),
                                        IV.bootstrap_ci(y_hold, bpred[b.name], primary.aggregate, R, seed, g, LEVEL), n))
            for b in fitted]


def _run_gate(req: TrainerRequest, enc: EncodedLabel, fitted: Sequence[BL.FittedBaseline], finalist_spec: CandidateSpec,
              calibrator: Optional[CAL.Calibrator], primary: scores.PrimaryScore, y_hold: FArr, pred: FArr,
              bpred: Dict[str, FArr], g: Optional[List[str]]) -> GateRun:
    """The publishing gate on holdout predictions only. An uncalibrated, untuned finalist on the GLM baseline's own
    driver IS the GLM baseline, so it is named as the delivered simple member and not compared with itself."""
    p = req.protocol
    dummy = next(b for b in fitted if b.role == "dummy")
    simple = [(b.name, bpred[b.name]) for b in fitted if b.role == "simple"]
    is_glm = (calibrator is None and finalist_spec.driverKey == BL.GLM_DRIVER[enc.family]
              and not finalist_spec.hyperparameters and any(nm == "glm" for nm, _ in simple))
    return run_gate(y_hold, primary.aggregate, finalist_spec.name, pred, bpred[dummy.name], simple,
                    "glm" if is_glm else None, p.promotion.margin, p.intervals.resamples, p.seed, g, LEVEL)


def gate_model(d: GateRecord) -> GateModel | GateKeepSimple | GateNoSignal:
    """The wire shape of a gate decision.

    Raises:
        ValueError: For a record whose outcome, branch and shipped member disagree (`gate_record` never builds one).
    """
    if d.outcome == "no-signal":
        return GateNoSignal(outcome="no-signal", branch="c:no-signal", shipped=None, shippedRole=None, note=None)
    if d.shipped is None:
        raise ValueError(f"a '{d.outcome}' gate decision names no shipped member")
    if d.outcome == "keep-simple-baseline":
        return GateKeepSimple(outcome="keep-simple-baseline", branch="b:keep-simple-baseline", shipped=d.shipped,
                              shippedRole="simpleBaseline", note=None)
    if d.branch == "a:beats-best-simple" or d.branch == "a:Q15-only-model-beats-dummy":
        if d.note is None:
            return GateModel(outcome="model", branch=d.branch, shipped=d.shipped, shippedRole="model", note=None)
        return GateModel(outcome="model", branch=d.branch, shipped=d.shipped, shippedRole="model",
                         note=NO_SIMPLE_SIGNAL_NOTE)
    raise ValueError(f"a 'model' gate decision on branch '{d.branch}'")


def _artifacts(req: TrainerRequest, snap: Snapshot, enc: EncodedLabel, finalist_name: str, finalist: TrainedPredictor,
               fitted: Sequence[BL.FittedBaseline]) -> List[ReturnedArtifact]:
    """v2 artifacts for the finalist and every fitted simple baseline the gate could ship (one-feature, GLM). The dummy
    and the incumbent heuristic are yardsticks and never ship. Each envelope lists the columns its predictor uses."""
    shippable: List[Tuple[str, TrainedPredictor]] = [(finalist_name, finalist)]
    shippable += [(b.name, b.predictor) for b in fitted
                  if b.role == "simple" and isinstance(b.predictor, TrainedPredictor)]
    out: List[ReturnedArtifact] = []
    for name, predictor in shippable:
        built = artifacts_v2.build(name, predictor, predictor.columns, req.task.kind, enc.class_order,
                                   snap.feature_schema_hash, None, None)
        out.append(ReturnedArtifact(candidate=built.candidate, bytesBase64=built.bytes_base64, sha256=built.sha256,
                                    featureSchemaHash=built.feature_schema_hash, classOrder=built.class_order))
    return out


@dataclass(frozen=True)
class _HoldoutPredictions:
    """The one holdout access: the rows, labels, the finalist's and every baseline's predictions, and when."""

    X: pd.DataFrame
    y: FArr
    pred: FArr
    bpred: Dict[str, FArr]
    accessed_at: str


def _score_holdout(snap: Snapshot, enc: EncodedLabel, hold: IntArr, finalist: TrainedPredictor,
                   fitted: Sequence[BL.FittedBaseline]) -> _HoldoutPredictions:
    """Reads the locked holdout once and predicts it with the finalist and every baseline."""
    X_hold = snap.frame.iloc[hold].reset_index(drop=True)
    X_hold_b = _with_incumbent(X_hold, snap, hold)
    accessed_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        pred = np.asarray(finalist.predict(X_hold), dtype=np.float64)
        bpred = {b.name: np.asarray(b.predictor.predict(X_hold_b), dtype=np.float64) for b in fitted}
    except ValueError as exc:
        raise TrainerFailure("holdout", str(exc)) from exc
    return _HoldoutPredictions(X_hold, np.asarray(enc.y, dtype=np.float64)[hold], pred, bpred, accessed_at)


def evaluate(req: TrainerRequest, snap: Snapshot, enc: EncodedLabel, dev: IntArr, hold: IntArr,
             out: SelectionOutcome, columns: Sequence[encoding.ColumnSpec], code: CodeVersion, clock: RunClock,
             leakage_flags: Sequence[LeakageFlag]) -> TrainerCompleted:
    """The holdout stage for one selected finalist; see the module docstring for the fixed order."""
    p = req.protocol
    primary = scores.primary_score(p.primaryScore.metric, enc.tweedie_power)
    ordinals = SN.period_ordinals(snap)
    X_dev = snap.frame.iloc[dev].reset_index(drop=True)
    y_dev = np.asarray(enc.y, dtype=np.float64)[dev]
    y_val = y_dev[out.validated]
    finalist_spec = next(c for c in req.candidates if c.name == out.selection.finalist)
    finalist_oof = out.cv[finalist_spec.name].oof
    val_groups = [snap.group_keys[int(dev[int(i)])] or snap.entity_keys[int(dev[int(i)])] for i in out.validated]
    # (1)-(2): calibration decision and baselines, development rows only
    calibrator, cal_decision = decide_calibration(req, enc, finalist_oof, y_val, val_groups)
    finalist = out.finalist
    finalist.calibrator = calibrator
    fitted = _fit_baselines(req, columns, X_dev, y_dev, enc, out, snap, dev)
    clock.check("baselines")
    # (3): the one holdout access
    h = _score_holdout(snap, enc, hold, finalist, fitted)
    # (4): everything below uses `h.pred` / `h.bpred` only
    g = _groups(req, snap, hold, ordinals)
    n = len(hold)
    prim = _mwi(p.primaryScore.metric, primary.aggregate(h.y, h.pred),
                IV.bootstrap_ci(h.y, h.pred, primary.aggregate, p.intervals.resamples, p.seed, g, LEVEL), n)
    gr = _run_gate(req, enc, fitted, finalist_spec, calibrator, primary, h.y, h.pred, h.bpred, g)
    d = gr.decision
    comparisons = {k: PairedComparison(value=v.value, ci=(v.lower, v.upper), beats=v.beats)
                   for k, v in gr.comparisons.items()}
    clock.check("holdout scoring")
    arts = _artifacts(req, snap, enc, finalist_spec.name, finalist, fitted)
    shipped_pred = None if d.shipped is None else (h.pred if d.outcome == "model" else h.bpred[d.shipped])
    inc_diff = incumbent_diff(req, h.X, h.y, shipped_pred, primary, g, clock)
    regression = enc.family not in ("binary", "multiclass")
    r_oof = y_val - finalist_oof if regression else np.zeros(0, dtype=np.float64)
    cost = clock.compute_seconds()
    return TrainerCompleted(
        status="completed", trainingRunId=req.trainingRunId, codeVersion=code, computeSeconds=cost,
        innerScores=inner_scores(out.cv, p.primaryScore.metric), finalist=finalist_spec.name,
        holdoutAccess=HoldoutAccess(accessedAt=h.accessed_at, count=1, finalist=finalist_spec.name),
        holdout=HoldoutScores(primary=prim, secondary=_secondary_metrics(req, enc, h.y, h.pred, g)),
        baselines=_baseline_results(req, fitted, primary, h.y, h.bpred, g), comparisons=comparisons,
        gate=gate_model(d), artifacts=arts, incumbentDiff=inc_diff,
        calibration=_calibration_report(req, enc, h.y, h.pred, cal_decision),
        slices=slice_results(req, snap, hold, h.y, h.pred, primary, g),
        operatingPoint=operating_point(req, snap, hold, ordinals, h.y, h.pred, g),
        cost=RunCost(computeSeconds=cost, tokens=0, usd=0.0, budget=p.budgets, stoppedByBudget=False),
        importance=[], leakageFlags=list(leakage_flags),
        predictionIntervalCoverage=interval_coverage(req, enc, r_oof, h.y, h.pred), residualDiagnostics=None,
        forecast=None, innerSplitContrast=None,
    )
