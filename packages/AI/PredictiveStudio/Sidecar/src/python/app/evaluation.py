"""The holdout stage: one scoring of the locked holdout for one finalist, baselines, paired comparisons, the publishing
gate, calibration, slices, the operating point, prediction-interval coverage, held-out permutation importance, the
incumbent diff, the artifacts, and two development-row statistics: the residual autocorrelation of an entity panel and
the random-row contrast of blocked-time inner validation.

Order matters and is fixed: (1) the calibration decision uses only out-of-fold development predictions; (2) the
finalist (calibrated or not) and every baseline are fitted on development rows; (3) the holdout is read ONCE, here,
through a reader that counts the access, and `holdoutAccess` is stamped at that moment; (4) everything after uses only
those predictions, except permutation importance, which re-predicts the same holdout rows (already read) with the
finalist after permuting each source column's features; (5) the development-row statistics read development rows
only: the finalist's in-sample residuals pooled within entities, and the finalist refitted on random-row folds of the
development rows. Every statistic, importance and the development-row statistics included, is computed before the run
clock's last check and before `computeSeconds` is stamped, so the reported cost is the whole run's.

A number that is undefined on these rows never reaches the wire as NaN (JSON cannot carry it): a holdout without
every declared class fails the stage, an undefined secondary metric is left out (the contract lists the secondary
metrics computed, not every declared one), an undefined calibration fit reports no calibration, and any other
non-finite number fails the stage naming its field. One deliberate exception to leaving an undefined number out: when
the protocol declares residual diagnostics on an entity panel and the finalist's development residuals are constant,
their autocorrelation is undefined and the stage fails rather than reporting no diagnostics, as the series path does,
because a declared check that cannot run must not read as a check that passed.
"""

from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Protocol, Sequence, Tuple

import numpy as np
import numpy.typing as npt
import pandas as pd

from . import artifacts, artifacts_v2, baselines as BL, calibration as CAL, encoding, intervals as IV, scores
from . import importance as IM, snapshot as SN, temporal as TM, trainer as TR
from .array_types import FArr, IntArr
from .failures import RunClock, TrainerFailure
from .folds import Fold, grouped, repeated_stratified
from .gate import NO_SIMPLE_SIGNAL_NOTE, GateRecord, GateRun, run_gate
from .snapshot import Snapshot
from .snapshot_format import INCUMBENT_SCORE_COLUMN
from .trainer import CandidateCV, EncodedLabel, SelectionOutcome, TrainedPredictor
from .trainer_schemas import (
    AutoCalibration, BaselineResult, BlockedTime, CalibrationReport, CandidateInnerScore, CandidateSpec, CodeVersion,
    GateKeepSimple, GateModel, GateNoSignal, HoldoutAccess, HoldoutScores, IncumbentDiff, IncumbentRef, Interval,
    IsotonicCalibration, LeakageFlag, LjungBox, MetricKey, MetricWithInterval, NoCalibration, OperatingPoint,
    OutOfTimeSlice, PairedComparison, PlattCalibration, PredictionIntervalCoverage, ReliabilityRow,
    ResidualDiagnostics, ReturnedArtifact, RunCost, SliceResult, SourceColumnImportance, SplitContrast, SubgroupSlice,
    TrainerCompleted, TrainerRequest,
)

ReportedCalibration = Literal["platt", "isotonic", "auto", "not-applicable"]
# Row permutations per source column in held-out permutation importance (the reference pipeline's count).
PERMUTATION_REPEATS = 5
# Folds of the random-row cross-validation set beside blocked-time folds (the reference pipeline's count).
RANDOM_ROW_FOLDS = 5


class _Bounds(Protocol):
    """An interval's bounds: a bootstrap interval, a paired bootstrap or a column importance."""

    @property
    def lower(self) -> float: ...

    @property
    def upper(self) -> float: ...


def _groups(req: TrainerRequest, snap: Snapshot, rows: IntArr, ordinals: IntArr) -> Optional[List[str]]:
    """Resampling units for intervals: grouping units for a cluster bootstrap, decision periods for a block bootstrap."""
    method = req.protocol.intervals.method
    if method == "cluster-bootstrap":
        return TR.unit_groups(snap, rows)
    if method == "block-bootstrap":
        return [str(int(ordinals[int(i)])) for i in rows]
    return None


def metric_with_interval(metric: MetricKey, value: float, ci: _Bounds, n: int, level: float) -> MetricWithInterval:
    """A metric's value on `n` rows with its interval at `level` (shared by the tabular holdout and the forecast)."""
    return MetricWithInterval(metric=metric, value=float(value),
                              interval=Interval(level=level, lower=float(ci.lower), upper=float(ci.upper)), n=n)


def inner_scores(cv: Dict[str, CandidateCV], metric: MetricKey) -> List[CandidateInnerScore]:
    """Every candidate's inner-CV score with its corrected interval; optimistic by construction (it chose the finalist)."""
    return [CandidateInnerScore(candidate=c.name, folds=c.inner.folds, optimistic=True,
                                inner=MetricWithInterval(metric=metric, value=c.inner.mean, n=c.inner.n_rows,
                                                         interval=Interval(level=TR.INNER_INTERVAL_LEVEL,
                                                                           lower=c.inner.lower, upper=c.inner.upper)))
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


def _fit_map(method: CAL.CalMethod, y: FArr, p: FArr, rows: str) -> CAL.Calibrator:
    """One calibration map fitted on `rows`.

    Raises:
        TrainerFailure: Stage `holdout`, when the map cannot be fitted (e.g. the rows lack a class).
    """
    try:
        return CAL.Calibrator(method).fit(y, p)
    except ValueError as exc:
        raise TrainerFailure("holdout", f"the calibration map cannot be fitted on {rows}: {exc}") from exc


def decide_calibration(req: TrainerRequest, enc: EncodedLabel, oof: FArr, y_val: FArr,
                       val_groups: Sequence[str]) -> Tuple[Optional[CAL.Calibrator], Optional[CalibrationDecision]]:
    """Fit the map on the finalist's out-of-fold predictions (rows its fold models never trained on); apply it to the
    full refit only when a 2-fold cross-fit of the map lowers the primary score on those rows, or repairs a slope
    outside 0.8-1.2. Each map's method follows the rows it is fitted on (`auto`: Platt below the threshold).

    Raises:
        TrainerFailure: Stage `holdout`, when the rows cannot be split or a map cannot be fitted.
    """
    c = req.protocol.calibration
    if isinstance(c, NoCalibration) or enc.family not in ("binary", "multiclass"):
        return None, None
    kind = _declared_kind(req)
    threshold = c.thresholdRows if isinstance(c, AutoCalibration) else 0
    primary = scores.primary_score(req.protocol.primaryScore.metric, None)
    crossed = np.empty_like(oof)
    for f in _halves(y_val, val_groups, req.protocol.seed):
        half = _fit_map(CAL.choose_method(kind, len(f.train), threshold), y_val[f.train], oof[f.train],
                        "one half of the out-of-fold rows")
        crossed[f.valid] = half.apply(oof[f.valid])
    raw = primary.aggregate(y_val, oof)
    cal = primary.aggregate(y_val, crossed)
    apply = cal < raw or _slope_repaired(enc, y_val, oof, crossed)
    method = CAL.choose_method(kind, len(y_val), threshold)
    calibrator = _fit_map(method, y_val, oof, "the out-of-fold rows")
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
    map was applied, else the declared one. None when no calibration applies to the task, or when the calibration
    fit is undefined on these rows (constant predictions, separated classes, no convergence)."""
    if decision is None:
        return None
    yk, top = _top_label(enc, y, p)
    fit = CAL.calibration_fit(yk, top)
    if not (math.isfinite(fit.slope) and math.isfinite(fit.intercept)):
        return None
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

    iv = req.protocol.intervals
    ci = IV.bootstrap_ci(ya, s, prec_at_k, iv.resamples, req.protocol.seed, groups, iv.level)
    return OperatingPoint(capacityPerPeriod=float(cap), baseRate=float(np.mean(ya)),
                          precisionAtCapacity=metric_with_interval("precision", prec_at_k(ya, s), ci, k, iv.level))


def slice_results(req: TrainerRequest, snap: Snapshot, hold: IntArr, ordinals: IntArr, y: FArr, pred: FArr,
                  primary: scores.PrimaryScore, g: Optional[List[str]]) -> List[SliceResult]:
    """Declared subgroup slices and, when `outOfTime`, one slice per holdout decision period (named by its first day),
    each with an interval."""
    p = req.protocol
    out: List[SliceResult] = []

    def one(mask: npt.NDArray[np.bool_]) -> MetricWithInterval:
        sub_g = None if g is None else [g[int(i)] for i in np.flatnonzero(mask)]
        ci = IV.bootstrap_ci(y[mask], pred[mask], primary.aggregate, p.intervals.resamples, p.seed, sub_g,
                             p.intervals.level)
        return metric_with_interval(p.primaryScore.metric, primary.aggregate(y[mask], pred[mask]), ci,
                                    int(mask.sum()), p.intervals.level)

    for field in p.slices.subgroups:
        values = snap.slice_values.get(field)
        if values is None:
            raise TrainerFailure("holdout", f"slice field '{field}' is not in the snapshot's sliceColumns")
        hv = np.asarray([values[int(i)] for i in hold], dtype=object)
        for v in sorted({str(x) for x in hv.tolist()}):
            out.append(SliceResult(slice=SubgroupSlice(kind="subgroup", field=field, value=v), primary=one(hv == v)))
    if p.slices.outOfTime:
        per = np.asarray([SN.period_start(int(ordinals[int(i)]), snap.decision.period).isoformat() for i in hold],
                         dtype=object)
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


def _incumbent_predictions(req: TrainerRequest, inc: IncumbentRef, raw: bytes, enc: EncodedLabel,
                           X_hold: pd.DataFrame, n_rows: int) -> FArr:
    """The incumbent's predictions on the holdout rows: its verified artifact bytes loaded by the restricted unpickler
    and scored with its OWN in-fold encoding, after checking it predicts the same task, classes and columns.

    Raises:
        TrainerFailure: Stage `holdout`, when the artifact cannot be loaded, predicts another task kind or class order,
            needs a column the snapshot lacks, cannot score these rows, or returns a prediction count other than the
            holdout's.
    """
    try:
        predictor, env = artifacts.load_v2_envelope(raw)
    except artifacts.ArtifactRefusedError as exc:
        raise TrainerFailure("holdout", f"incumbent {inc.modelId} is not a loadable v2 predictor: {exc}") from exc
    if env.taskKind != req.task.kind or env.classOrder != enc.class_order:
        raise TrainerFailure("holdout", f"incumbent {inc.modelId} predicts a '{env.taskKind}' task with class order "
                                        f"{env.classOrder}; this run is a '{req.task.kind}' task with class order "
                                        f"{enc.class_order}")
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


def incumbent_diff(req: TrainerRequest, incumbent_artifact: Optional[bytes], enc: EncodedLabel, X_hold: pd.DataFrame,
                   y_hold: FArr, shipped_pred: Optional[FArr], primary: scores.PrimaryScore,
                   g: Optional[List[str]]) -> Optional[IncumbentDiff]:
    """Paired (incumbent loss - shipped loss) on the same holdout rows, for comparing with the published model. Null
    with no incumbent or a no-signal gate. `incumbent_artifact` is the incumbent's artifact, downloaded and verified
    when the snapshot was loaded."""
    inc = req.incumbent
    if inc is None or incumbent_artifact is None or shipped_pred is None:
        return None
    inc_pred = _incumbent_predictions(req, inc, incumbent_artifact, enc, X_hold, len(y_hold))
    iv = req.protocol.intervals
    r = IV.paired_bootstrap(y_hold, inc_pred, shipped_pred, primary.aggregate, iv.resamples, req.protocol.seed, g,
                            iv.level)
    return IncumbentDiff(incumbentModelId=inc.modelId, value=r.value, lower=r.lower, upper=r.upper)


def with_incumbent(X: pd.DataFrame, snap: Snapshot, rows: IntArr) -> pd.DataFrame:
    """The frame plus the snapshot's incumbent-score column (for the incumbent-heuristic baseline), when present."""
    if snap.incumbent_score is None:
        return X
    return X.assign(**{INCUMBENT_SCORE_COLUMN: snap.incumbent_score[rows]})


def _fit_baselines(req: TrainerRequest, columns: Sequence[encoding.ColumnSpec], X_dev: pd.DataFrame, y_dev: FArr,
                   enc: EncodedLabel, out: SelectionOutcome, snap: Snapshot, dev: IntArr) -> List[BL.FittedBaseline]:
    """Fits every declared baseline on development rows only."""
    inc_col = INCUMBENT_SCORE_COLUMN if snap.incumbent_score is not None else None
    try:
        return BL.fit_all(req.protocol, columns, with_incumbent(X_dev, snap, dev),
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


def is_defined(m: MetricWithInterval) -> bool:
    """Whether the metric and both interval bounds are finite (an undefined secondary metric is left off the wire)."""
    return math.isfinite(m.value) and math.isfinite(m.interval.lower) and math.isfinite(m.interval.upper)


# The family's other proper score, reported beside the primary one (it never ranks).
_COMPANION_SCORE: Dict[str, scores.PrimaryMetric] = {"log-loss": "brier", "brier": "log-loss",
                                                       "multiclass-log-loss": "brier"}


def _secondary_metrics(req: TrainerRequest, enc: EncodedLabel, y_hold: FArr, pred: FArr,
                       g: Optional[List[str]]) -> List[MetricWithInterval]:
    """Declared secondary metrics plus the family's companion proper score. A metric undefined on these rows (e.g.
    precision when nothing is predicted positive) is left out rather than reported as NaN."""
    p = req.protocol
    R, seed, n, level = p.intervals.resamples, p.seed, len(y_hold), p.intervals.level
    out: List[MetricWithInterval] = []
    for m in p.secondaryMetrics:
        if _secondary_applies(m, enc.family):
            fn = scores.secondary_fn(m)
            out.append(metric_with_interval(m, fn(y_hold, pred), IV.bootstrap_ci(y_hold, pred, fn, R, seed, g, level),
                                            n, level))
    other = _COMPANION_SCORE.get(p.primaryScore.metric)
    if other is not None:
        alt = scores.primary_score(other, None)
        out.append(metric_with_interval(other, alt.aggregate(y_hold, pred),
                                        IV.bootstrap_ci(y_hold, pred, alt.aggregate, R, seed, g, level), n, level))
    return [m for m in out if is_defined(m)]


def _baseline_results(req: TrainerRequest, fitted: Sequence[BL.FittedBaseline], primary: scores.PrimaryScore,
                      y_hold: FArr, bpred: Dict[str, FArr], g: Optional[List[str]]) -> List[BaselineResult]:
    """Each baseline's holdout primary score with its interval."""
    p = req.protocol
    R, seed, n, level = p.intervals.resamples, p.seed, len(y_hold), p.intervals.level
    return [BaselineResult(baseline=p.baselines[b.spec_index], role=b.role,
                           holdout=metric_with_interval(
                               p.primaryScore.metric, primary.aggregate(y_hold, bpred[b.name]),
                               IV.bootstrap_ci(y_hold, bpred[b.name], primary.aggregate, R, seed, g, level), n, level))
            for b in fitted]


def _run_gate(req: TrainerRequest, enc: EncodedLabel, fitted: Sequence[BL.FittedBaseline], finalist_spec: CandidateSpec,
              calibrator: Optional[CAL.Calibrator], primary: scores.PrimaryScore, y_hold: FArr, pred: FArr,
              bpred: Dict[str, FArr], g: Optional[List[str]]) -> GateRun:
    """The publishing gate on holdout predictions only, at the protocol's margin and lower-bound level. An
    uncalibrated, untuned finalist on the GLM baseline's own driver IS the GLM baseline, so it is named as the
    delivered simple member and not compared with itself."""
    p = req.protocol
    dummy = next(b for b in fitted if b.role == "dummy")
    simple = [(b.name, bpred[b.name]) for b in fitted if b.role == "simple"]
    is_glm = (calibrator is None and finalist_spec.driverKey == BL.GLM_DRIVER[enc.family]
              and not finalist_spec.hyperparameters and any(nm == "glm" for nm, _ in simple))
    return run_gate(y_hold, primary.aggregate, finalist_spec.name, pred, bpred[dummy.name], simple,
                    "glm" if is_glm else None, p.promotion.margin, p.intervals.resamples, p.seed, g,
                    p.promotion.lowerBoundLevel)


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
    and the incumbent heuristic are yardsticks and never ship. Each envelope lists the columns its predictor uses and,
    for a linear predictor, the mean encoded training row its per-row drivers are measured from."""
    shippable: List[Tuple[str, TrainedPredictor]] = [(finalist_name, finalist)]
    shippable += [(b.name, b.predictor) for b in fitted
                  if b.role == "simple" and isinstance(b.predictor, TrainedPredictor)]
    return [returned_artifact(req, snap, name, predictor, enc.class_order) for name, predictor in shippable]


def returned_artifact(req: TrainerRequest, snap: Snapshot, name: str, predictor: artifacts_v2.ShippablePredictor,
                      class_order: Optional[List[str]]) -> ReturnedArtifact:
    """The v2 artifact of one shippable predictor, as the run returns it (the holdout stage and the forecast path).
    A tabular predictor's envelope lists the columns it uses and, for a linear predictor, the mean encoded training row
    its per-row drivers are measured from; a series forecaster reads no feature column.

    Raises:
        NotShippableError: From `artifacts_v2.build`, for a yardstick or a predictor type that never ships.
    """
    if isinstance(predictor, TrainedPredictor):
        b = predictor.driver_baseline
        built = artifacts_v2.build(name, predictor, predictor.columns, req.task.kind, class_order,
                                   snap.feature_schema_hash, None if b is None else b.mean,
                                   None if b is None else b.columns)
    else:
        built = artifacts_v2.build(name, predictor, [], req.task.kind, class_order, snap.feature_schema_hash, None,
                                   None)
    return ReturnedArtifact(candidate=built.candidate, bytesBase64=built.bytes_base64, sha256=built.sha256,
                            featureSchemaHash=built.feature_schema_hash, classOrder=built.class_order)


class _HoldoutReader:
    """The only way to the locked holdout's rows: `read` counts every access and refuses one past the protocol's
    holdout access budget, so the reported access count is the real one."""

    def __init__(self, snap: Snapshot, hold: IntArr, budget: int) -> None:
        self._snap = snap
        self._hold = hold
        self._budget = budget
        self.accesses = 0

    def read(self) -> pd.DataFrame:
        if self.accesses >= self._budget:
            raise TrainerFailure("holdout", f"the locked holdout may be read {self._budget} time(s); this would be "
                                            f"read {self.accesses + 1}")
        self.accesses += 1
        return self._snap.frame.iloc[self._hold].reset_index(drop=True)


@dataclass(frozen=True)
class _HoldoutPredictions:
    """The one holdout access: the rows, labels, the finalist's and every baseline's predictions, and when."""

    X: pd.DataFrame
    y: FArr
    pred: FArr
    bpred: Dict[str, FArr]
    accessed_at: str


def _score_holdout(reader: _HoldoutReader, snap: Snapshot, enc: EncodedLabel, hold: IntArr,
                   finalist: TrainedPredictor, fitted: Sequence[BL.FittedBaseline]) -> _HoldoutPredictions:
    """Reads the locked holdout once and predicts it with the finalist and every baseline.

    Raises:
        TrainerFailure: Stage `holdout`, when a prediction fails or a classification holdout lacks a declared class
            (its log loss would be defined, but AUC, the calibration fit and the paired tests would not).
    """
    X_hold = reader.read()
    accessed_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    y_hold = np.asarray(enc.y, dtype=np.float64)[hold]
    if enc.class_order is not None:
        present = {int(v) for v in y_hold.tolist()}
        absent = [c for k, c in enumerate(enc.class_order) if k not in present]
        if absent:
            raise TrainerFailure("holdout", f"the locked holdout has no row of class {absent}; every declared class "
                                            f"{enc.class_order} must occur in it")
    try:
        pred = np.asarray(finalist.predict(X_hold), dtype=np.float64)
        bpred = {b.name: np.asarray(b.predictor.predict(with_incumbent(X_hold, snap, hold)), dtype=np.float64)
                 for b in fitted}
    except ValueError as exc:
        raise TrainerFailure("holdout", str(exc)) from exc
    return _HoldoutPredictions(X_hold, y_hold, pred, bpred, accessed_at)


def _non_finite_path(value: object, path: str) -> Optional[str]:
    """The path of the first non-finite number inside a dumped result, or None."""
    if isinstance(value, float):
        return None if math.isfinite(value) else path
    if isinstance(value, dict):
        for k, v in value.items():
            found = _non_finite_path(v, f"{path}.{k}")
            if found is not None:
                return found
    elif isinstance(value, (list, tuple)):
        for i, v in enumerate(value):
            found = _non_finite_path(v, f"{path}[{i}]")
            if found is not None:
                return found
    return None


def refuse_non_finite(result: TrainerCompleted) -> TrainerCompleted:
    """The result, unchanged, when every number in it is finite (the wire is JSON, which has no NaN or infinity).

    Raises:
        TrainerFailure: Stage `holdout`, naming the path of the first non-finite number.
    """
    path = _non_finite_path(result.model_dump(mode="python"), "result")
    if path is not None:
        raise TrainerFailure("holdout", f"the result holds a number that is undefined on these rows, at {path}")
    return result


def held_out_importance(req: TrainerRequest, finalist: TrainedPredictor, X_hold: pd.DataFrame, y_hold: FArr,
                        primary: scores.PrimaryScore, columns: Sequence[encoding.ColumnSpec],
                        groups: Optional[Sequence[str]]) -> List[SourceColumnImportance]:
    """Held-out permutation importance of every source column the finalist uses, on the holdout rows: the increase
    of the primary score when the source's feature columns are permuted together, with the protocol's resamples,
    level and resampling units. It describes the finalist, as `holdout.primary` does, even when the gate ships a
    simple baseline instead.

    Raises:
        TrainerFailure: Stage `holdout`, when the finalist cannot predict a permuted frame.
    """
    p = req.protocol
    level = p.intervals.level
    try:
        found = IM.permutation_importance(finalist.predict, X_hold, y_hold, primary.aggregate,
                                          encoding.source_map(columns), PERMUTATION_REPEATS, p.seed,
                                          p.intervals.resamples, groups, level)
    except ValueError as exc:
        raise TrainerFailure("holdout", f"permutation importance: {exc}") from exc
    return [SourceColumnImportance(sourceColumn=c.source_column,
                                   permutationImportance=metric_with_interval(p.primaryScore.metric, c.drop, c,
                                                                              len(y_hold), level))
            for c in found]


def panel_residuals(req: TrainerRequest, snap: Snapshot, enc: EncodedLabel, dev: IntArr, finalist: TrainedPredictor,
                    X_dev: pd.DataFrame, y_dev: FArr, ordinals: IntArr) -> Optional[ResidualDiagnostics]:
    """Residual autocorrelation of an entity panel: the finalist's in-sample residuals on the development rows
    (label minus prediction), paired only within an entity in period order and pooled over entities, with a
    Box-Pierce test whose lags are weighted by their pairs (the reference pipeline's `run._residual_panel`).

    The lags are the declared `acfLags` capped at one less than the most distinct decision periods any entity has in
    the development rows, so every lag pairs two rows of some entity; `ljungBox.lags` reports the lags used. The
    reference pipeline caps at `max(1, min(3, rows - 1))` with `rows` the most rows any entity has: on a panel with one
    row per entity and period (the reference pipeline's panels) the two agree whenever 3 lags are declared. None when
    the protocol declares no residual diagnostics, when no entity has development rows in two decision periods
    (nothing repeats over time, even if an entity has several rows in one period), or for a multiclass task (its
    prediction is a probability vector, so a residual is not one number).

    Raises:
        TrainerFailure: Stage `holdout`, when the finalist cannot predict its development rows or the residuals are
            constant (their autocorrelation is undefined; the series path fails the same way).
    """
    rd = req.protocol.residualDiagnostics
    if rd is None or enc.family == "multiclass":
        return None
    entities = [snap.entity_keys[int(i)] for i in dev]
    periods_of: Dict[str, set[int]] = {}
    for entity, ordinal in zip(entities, ordinals[dev].tolist()):
        periods_of.setdefault(entity, set()).add(int(ordinal))
    periods = max(len(seen) for seen in periods_of.values())
    if periods < 2:
        return None
    # At most one less than an entity's periods, hence than its rows: every lag has a within-entity pair.
    lags = min(rd.acfLags, periods - 1)
    try:
        resid = y_dev - np.asarray(finalist.predict(X_dev), dtype=np.float64)
        rhos, pairs = TM.panel_acf(resid, entities, ordinals[dev], lags)
        q, p_value = TM.box_pierce(rhos, pairs)
    except ValueError as exc:
        raise TrainerFailure("holdout", f"residual diagnostics: {exc}") from exc
    return ResidualDiagnostics(acf=rhos, ljungBox=LjungBox(statistic=q, pValue=p_value, lags=lags),
                               autocorrelationFlagged=p_value < rd.ljungBoxAlpha)


def split_contrast(req: TrainerRequest, snap: Snapshot, enc: EncodedLabel, dev: IntArr, out: SelectionOutcome,
                   columns: Sequence[encoding.ColumnSpec], primary: scores.PrimaryScore,
                   clock: RunClock) -> Optional[SplitContrast]:
    """What random-row cross-validation would have reported for blocked-time inner validation: on the rows the blocked
    folds validated, the finalist's blocked out-of-fold score beside its out-of-fold score from random-row 5-fold over
    every development row (the reference pipeline's `run._random_row_contrast`, whose fold assignment is the first
    unstratified repeat). For a loss, a positive `inflation` is optimism random rows hide on serially correlated
    entity-period data. None unless the inner validation is blocked in time.

    Raises:
        TrainerFailure: Stage `holdout`, prefixed "random-row contrast: ", when the development rows cannot fill the
            folds or the finalist cannot be fitted on a random-row fold (the holdout has been read by now, so this is
            a holdout-stage failure, not inner CV); `timeout`/`budget-exceeded` from the run clock, checked after
            every fold.
    """
    if not isinstance(req.protocol.innerValidation, BlockedTime):
        return None
    y_dev = np.asarray(enc.y)[dev]
    try:
        random_folds = repeated_stratified(y_dev, RANDOM_ROW_FOLDS, 1, req.protocol.seed, stratify=False)
    except ValueError as exc:
        raise TrainerFailure("holdout", f"random-row contrast: {exc}") from exc
    spec = next(c for c in req.candidates if c.name == out.selection.finalist)
    every_row = np.arange(len(dev), dtype=np.int64)
    # The trainer's one cross-validation loop, run on the random-row folds: every development row is validated once,
    # so its out-of-fold predictions are in development-row order.
    try:
        random_cv = TR.cross_validate(req.protocol, snap, columns, enc, dev, spec, req.threads, clock, random_folds,
                                      every_row)
    except TrainerFailure as exc:
        if exc.stage != "inner-cv":
            raise
        raise TrainerFailure("holdout", f"random-row contrast: {exc.message}") from exc
    y_val = np.asarray(y_dev, dtype=np.float64)[out.validated]
    blocked = primary.aggregate(y_val, out.cv[spec.name].oof)
    random_row = primary.aggregate(y_val, random_cv.oof[out.validated])
    return SplitContrast(rows=len(out.validated), blockedGroupedScore=blocked, randomRowScore=random_row,
                         inflation=blocked - random_row)


def evaluate(req: TrainerRequest, snap: Snapshot, enc: EncodedLabel, dev: IntArr, hold: IntArr,
             out: SelectionOutcome, columns: Sequence[encoding.ColumnSpec], code: CodeVersion, clock: RunClock,
             leakage_flags: Sequence[LeakageFlag], incumbent_artifact: Optional[bytes]) -> TrainerCompleted:
    """The holdout stage for one selected finalist; see the module docstring for the fixed order.

    Raises:
        TrainerFailure: Stage `holdout`/`baselines` for a failure in this stage, including the development-row
            statistics (constant panel residuals, a random-row contrast fold that cannot be filled or fitted);
            `timeout`/`budget-exceeded` from the run clock, checked after the baselines, after the holdout scoring,
            after every random-row contrast fold and after every statistic.
    """
    p = req.protocol
    primary = scores.primary_score(p.primaryScore.metric, enc.tweedie_power)
    level = p.intervals.level
    ordinals = SN.period_ordinals(snap)
    X_dev = snap.frame.iloc[dev].reset_index(drop=True)
    y_dev = np.asarray(enc.y, dtype=np.float64)[dev]
    y_val = y_dev[out.validated]
    finalist_spec = next(c for c in req.candidates if c.name == out.selection.finalist)
    finalist_oof = out.cv[finalist_spec.name].oof
    # (1)-(2): calibration decision and baselines, development rows only
    calibrator, cal_decision = decide_calibration(req, enc, finalist_oof, y_val,
                                                  TR.unit_groups(snap, dev[out.validated]))
    finalist = out.finalist
    finalist.calibrator = calibrator
    fitted = _fit_baselines(req, columns, X_dev, y_dev, enc, out, snap, dev)
    clock.check("baselines")
    # (3): the one holdout access
    reader = _HoldoutReader(snap, hold, p.holdoutAccessBudget)
    h = _score_holdout(reader, snap, enc, hold, finalist, fitted)
    # (4): everything below uses `h.pred` / `h.bpred` only
    g = _groups(req, snap, hold, ordinals)
    n = len(hold)
    prim_ci = IV.bootstrap_ci(h.y, h.pred, primary.aggregate, p.intervals.resamples, p.seed, g, level)
    prim = metric_with_interval(p.primaryScore.metric, primary.aggregate(h.y, h.pred), prim_ci, n, level)
    gr = _run_gate(req, enc, fitted, finalist_spec, calibrator, primary, h.y, h.pred, h.bpred, g)
    d = gr.decision
    comparisons = {k: PairedComparison(value=v.value, ci=(v.lower, v.upper), beats=v.beats)
                   for k, v in gr.comparisons.items()}
    clock.check("holdout scoring")
    arts = _artifacts(req, snap, enc, finalist_spec.name, finalist, fitted)
    shipped_pred = None if d.shipped is None else (h.pred if d.outcome == "model" else h.bpred[d.shipped])
    inc_diff = incumbent_diff(req, incumbent_artifact, enc, h.X, h.y, shipped_pred, primary, g)
    regression = enc.family not in ("binary", "multiclass")
    r_oof = y_val - finalist_oof if regression else np.zeros(0, dtype=np.float64)
    secondary = _secondary_metrics(req, enc, h.y, h.pred, g)
    base_results = _baseline_results(req, fitted, primary, h.y, h.bpred, g)
    calibration = _calibration_report(req, enc, h.y, h.pred, cal_decision)
    op = operating_point(req, snap, hold, ordinals, h.y, h.pred, g)
    coverage = interval_coverage(req, enc, r_oof, h.y, h.pred)
    sl = slice_results(req, snap, hold, ordinals, h.y, h.pred, primary, g)
    imp = held_out_importance(req, finalist, h.X, h.y, primary, columns, g)
    # (5): development-row statistics
    residual = panel_residuals(req, snap, enc, dev, finalist, X_dev, y_dev, ordinals)
    contrast = split_contrast(req, snap, enc, dev, out, columns, primary, clock)
    clock.check("holdout statistics")
    budget = p.holdoutAccessBudget
    if reader.accesses != budget:
        raise TrainerFailure("holdout", f"the locked holdout was read {reader.accesses} time(s); the protocol's "
                                        f"budget is {budget}")
    cost = clock.compute_seconds()
    return refuse_non_finite(TrainerCompleted(
        status="completed", trainingRunId=req.trainingRunId, codeVersion=code, computeSeconds=cost,
        innerScores=inner_scores(out.cv, p.primaryScore.metric), finalist=finalist_spec.name,
        holdoutAccess=HoldoutAccess(accessedAt=h.accessed_at, count=budget, finalist=finalist_spec.name),
        holdout=HoldoutScores(primary=prim, secondary=secondary), baselines=base_results, comparisons=comparisons,
        gate=gate_model(d), artifacts=arts, incumbentDiff=inc_diff, calibration=calibration, slices=sl,
        operatingPoint=op, cost=RunCost(computeSeconds=cost, tokens=0, usd=0.0, budget=p.budgets, stoppedByBudget=False),
        importance=imp, leakageFlags=list(leakage_flags), predictionIntervalCoverage=coverage,
        residualDiagnostics=residual, forecast=None, innerSplitContrast=contrast,
    ))
