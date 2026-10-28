"""The trainer's selection stage.

`select_finalist` runs every candidate on every inner fold of the DEVELOPMENT rows (each fit is one sklearn Pipeline:
in-fold encoding + estimator, see encoding.py), scores each fold with the protocol's primary proper score, picks one
finalist by the one-standard-error rule (selection.py), and refits it on all development rows. It never reads a
locked-holdout row: the caller takes the development index from the row manifest before anything is fitted, and
`_assert_dev_only` re-checks that index and every fold (fold positions index the development rows and are mapped back
to snapshot rows through it). The holdout is scored later, once, by the evaluation stage.

Class rebalancing (`resampling: in-fold`) is applied to each fit's training rows only, after the fold split, so a
validation or holdout row is never duplicated, dropped or reweighted.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, Optional, Protocol

import numpy as np
import numpy.typing as npt
import pandas as pd
from sklearn.base import BaseEstimator
from sklearn.pipeline import Pipeline
from threadpoolctl import threadpool_limits

from . import algorithms, encoding, folds as F, scores
from .failures import RunClock, TrainerFailure
from .selection import InnerScore, Selection, corrected_resampled_t, select_one_se
from .snapshot import RowRole, Snapshot
from .trainer_schemas import (
    BinaryTask,
    BlockedTime,
    CandidateSpec,
    EvaluationProtocol,
    ForecastTask,
    GroupedKFold,
    InFoldResampling,
    MulticlassTask,
    NonNegativeTask,
    RepeatedStratifiedKFold,
    TaskType,
)

FArr = npt.NDArray[np.float64]
IntArr = npt.NDArray[np.int64]
Family = algorithms.TabularFamily
ResampleMethod = Literal["class-weight", "undersample", "oversample"]
# The inner interval level the contract fixes for every candidate's inner score.
INNER_INTERVAL_LEVEL = 0.95
# Drivers whose estimators take sklearn's `class_weight`; the `class-weight` resampling sets it to `balanced`.
_CLASS_WEIGHT_DRIVERS = frozenset({"logistic_regression", "random_forest", "lightgbm"})


@dataclass(frozen=True)
class EncodedLabel:
    """The label as fitted: a class index into `class_order` (classification) or the float value; the task family;
    the declared Tweedie power of a non-negative target."""

    y: npt.NDArray[np.generic]
    family: Family
    class_order: Optional[list[str]]
    tweedie_power: Optional[float]


def encode_label(task: TaskType, label: npt.NDArray[np.generic]) -> EncodedLabel:
    """The label cells as the trainer fits them. A forecast's family is its value kind.

    Raises:
        TrainerFailure: Stage `load-snapshot`, for a class outside `classOrder`, a non-numeric value or a negative
            count/non-negative value.
    """
    if isinstance(task, (BinaryTask, MulticlassTask)):
        order = list(task.classOrder)
        index = {c: i for i, c in enumerate(order)}
        bad = sorted({str(v) for v in label.tolist() if str(v) not in index})
        if bad:
            raise TrainerFailure("load-snapshot", f"label values {bad} are not in the declared classOrder {order}")
        return EncodedLabel(np.asarray([index[str(v)] for v in label.tolist()], dtype=np.int64), task.kind, order, None)
    fam: Family = task.valueKind if isinstance(task, ForecastTask) else task.kind
    try:
        y = np.asarray([float(v) for v in label.tolist()], dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise TrainerFailure("load-snapshot", f"a {fam} target holds a non-numeric value: {exc}") from exc
    if fam in ("count", "non-negative") and bool(np.any(y < 0)):
        raise TrainerFailure("load-snapshot", f"a {fam} target has {int(np.sum(y < 0))} negative values")
    power = task.tweediePower if isinstance(task, NonNegativeTask) else None
    return EncodedLabel(y, fam, None, power)


class CalibrationMap(Protocol):
    """A fitted calibration map: raw probabilities in, calibrated probabilities out."""

    def apply(self, p: FArr) -> FArr: ...


# sklearn ships no type stubs, so BaseEstimator is `Any` to mypy and subclassing it is reported.
class TrainedPredictor(BaseEstimator):  # type: ignore[misc]
    """A fitted in-fold pipeline plus (optionally) a calibration map. `predict` returns P(classOrder[1]) for
    binary, (n, K) probabilities in classOrder for multiclass, the conditional mean otherwise."""

    def __init__(self, pipeline: Pipeline, family: Family, n_classes: int,
                 columns: Sequence[encoding.ColumnSpec] = (), threads: int = 1) -> None:
        self.pipeline = pipeline
        self.threads = threads
        self.columns = list(columns)
        self.family = family
        self.n_classes = n_classes
        self.calibrator: Optional[CalibrationMap] = None

    def predict_raw(self, X: pd.DataFrame) -> FArr:
        """The pipeline's prediction before calibration, with native thread pools held to the fit's thread count."""
        frame = encoding.normalize(self.columns, X)
        with threadpool_limits(limits=self.threads):
            if self.family in ("binary", "multiclass"):
                proba = np.asarray(self.pipeline.predict_proba(frame), dtype=np.float64)
                classes = [int(c) for c in self.pipeline.classes_]
                full = np.zeros((len(frame), self.n_classes), dtype=np.float64)
                full[:, classes] = proba
                return full[:, 1] if self.family == "binary" else full
            out = np.asarray(self.pipeline.predict(frame), dtype=np.float64)
        return np.maximum(out, 1e-9) if self.family in ("count", "non-negative") else out

    def predict(self, X: pd.DataFrame) -> FArr:
        raw = self.predict_raw(X)
        if self.calibrator is None:
            return raw
        return self.calibrator.apply(raw)


def _resample(idx: IntArr, y: npt.NDArray[np.generic], method: Optional[ResampleMethod], seed: int) -> IntArr:
    """In-fold class rebalancing of TRAINING indices only; validation and holdout rows are never touched."""
    if method not in ("undersample", "oversample"):
        return idx
    rng = np.random.default_rng(seed)
    yy = np.asarray(y)[idx]
    classes, counts = np.unique(yy, return_counts=True)
    target = int(counts.min()) if method == "undersample" else int(counts.max())
    parts: list[IntArr] = []
    for c in classes:
        members = idx[yy == c]
        parts.append(rng.choice(members, size=target, replace=method == "oversample").astype(np.int64))
    return np.sort(np.concatenate(parts))


def fit_predictor(spec: CandidateSpec, columns: Sequence[encoding.ColumnSpec], X: pd.DataFrame,
                  enc: EncodedLabel, idx: IntArr, protocol: EvaluationProtocol, threads: int) -> TrainedPredictor:
    """One candidate's Pipeline (encoding + estimator) fitted on rows `idx` of `X` after in-fold resampling; the
    encoder learns from those rows only. Count and non-negative targets encode as continuous (the target encoder's
    regression mode); their objective and score stay the family's own.

    Raises:
        ValueError: From the estimator factory (unsupported driver, refused hyperparameter) or the fit.
    """
    hp = dict(spec.hyperparameters)
    resampling = protocol.resampling
    method: Optional[ResampleMethod] = resampling.method if isinstance(resampling, InFoldResampling) else None
    if method == "class-weight" and enc.family in ("binary", "multiclass") and spec.driverKey in _CLASS_WEIGHT_DRIVERS:
        hp.setdefault("class_weight", "balanced")
    est = algorithms.tabular_estimator(spec.driverKey, enc.family, hp, protocol.seed, threads, enc.tweedie_power)
    target_type: encoding.TargetType = (
        "binary" if enc.family == "binary" else "multiclass" if enc.family == "multiclass" else "continuous")
    pipe = Pipeline([("encode", encoding.build_preprocessor(columns, target_type, protocol.seed)), ("model", est)])
    fit_idx = _resample(idx, enc.y, method, protocol.seed)
    train_frame = encoding.normalize(columns, X.iloc[fit_idx][encoding.used_columns(columns)])
    # The BLAS behind the MLP's matrix products has no n_jobs; hold every native pool to `threads` during the fit.
    with threadpool_limits(limits=threads):
        pipe.fit(train_frame, np.asarray(enc.y)[fit_idx])
    n_classes = len(enc.class_order) if enc.class_order is not None else 0
    return TrainedPredictor(pipe, enc.family, n_classes, columns, threads)


def _unit_groups(snap: Snapshot, dev: IntArr) -> list[str]:
    """Each development row's grouping unit: the manifest's group key, else its entity key."""
    return [str(snap.group_keys[int(i)] or snap.entity_keys[int(i)]) for i in dev]


def build_folds(protocol: EvaluationProtocol, snap: Snapshot, dev: IntArr, enc: EncodedLabel,
                period_ordinals: IntArr) -> list[F.Fold]:
    """The protocol's inner folds over the development rows `dev` (fold positions index `dev`). Repeated k-fold is
    stratified on the class for classification and random otherwise. Grouped k-fold groups on the manifest's grouping
    unit (group key, else entity key). Blocked-time reads the protocol's `groupKey` to decide grouping: null means no
    grouping (every row is its own group); a named key groups on the same manifest unit. The named key itself is not
    resolved here: the manifest carries one grouping unit per row.

    Raises:
        ValueError: When the development rows cannot fill the folds (see folds.py).
    """
    iv = protocol.innerValidation
    if isinstance(iv, RepeatedStratifiedKFold):
        return F.repeated_stratified(np.asarray(enc.y)[dev], iv.folds, iv.repeats, protocol.seed,
                                     stratify=enc.family in ("binary", "multiclass"))
    groups = _unit_groups(snap, dev)
    if isinstance(iv, GroupedKFold):
        return F.grouped(groups, iv.folds, iv.repeats, protocol.seed)
    blocked: BlockedTime = iv
    return F.blocked_time(period_ordinals[dev], None if blocked.groupKey is None else groups, blocked.folds,
                          blocked.gapPeriods, protocol.seed)


@dataclass(frozen=True)
class CandidateCV:
    """One candidate's inner CV: its fold scores, per-row loss and out-of-fold predictions over the validated rows,
    and its inner score."""

    name: str
    fold_scores: list[float]
    row_loss: FArr          # per validated dev row, mean over repeats
    oof: FArr               # repeat-0 out-of-fold predictions, rows in `validated` order
    inner: InnerScore


@dataclass(frozen=True)
class SelectionOutcome:
    """Every candidate's inner CV, the one-SE decision, the finalist refitted on all development rows, the folds and
    the validated development positions."""

    cv: dict[str, CandidateCV]
    selection: Selection
    finalist: TrainedPredictor
    folds: list[F.Fold]
    validated: IntArr       # positions (into dev) validated at least once, ascending


def _snapshot_rows(positions: IntArr, dev: IntArr) -> IntArr:
    """Fold positions (into the development rows) mapped back to snapshot rows."""
    return np.asarray(dev[positions], dtype=np.int64)


def _require_development(rows: IntArr, roles: Sequence[RowRole], where: str) -> None:
    if any(roles[int(r)] != "development" for r in rows):
        raise TrainerFailure("inner-cv", f"{where} touched a locked-holdout row")


def _assert_dev_only(fold: F.Fold, dev: IntArr, roles: Sequence[RowRole]) -> None:
    """Both sides of an inner fold are development rows of the snapshot."""
    for side in (fold.train, fold.valid):
        _require_development(_snapshot_rows(side, dev), roles, "an inner fold")


def select_finalist(protocol: EvaluationProtocol, snap: Snapshot, columns: Sequence[encoding.ColumnSpec],
                    enc: EncodedLabel, dev: IntArr, candidates: Sequence[CandidateSpec], threads: int,
                    clock: RunClock, period_ordinals: IntArr) -> SelectionOutcome:
    """Cross-validate every candidate on every fold, pick the finalist by the 1-SE rule, refit it on all dev rows.

    Raises:
        TrainerFailure: Stage `inner-cv` when the development index or a fold holds a locked-holdout row, the folds
            cannot be built, or a candidate cannot be fitted; `timeout`/`budget-exceeded` from the run clock.
    """
    _require_development(dev, snap.roles, "the development index")
    try:
        primary = scores.primary_score(protocol.primaryScore.metric, enc.tweedie_power)
        folds = build_folds(protocol, snap, dev, enc, period_ordinals)
    except ValueError as exc:
        raise TrainerFailure("inner-cv", str(exc)) from exc
    for fold in folds:
        _assert_dev_only(fold, dev, snap.roles)
    X = snap.frame.iloc[dev].reset_index(drop=True)
    dev_enc = EncodedLabel(np.asarray(enc.y)[dev], enc.family, enc.class_order, enc.tweedie_power)
    validated = np.unique(np.concatenate([f.valid for f in folds])).astype(np.int64)
    cv = {spec.name: _cross_validate(spec, columns, X, dev_enc, folds, validated, primary, protocol, threads, clock)
          for spec in candidates}
    order = [c.name for c in candidates]
    # The pooled score is each candidate's repeat-0 out-of-fold score; the paired row loss is each validated row's loss
    # averaged over every repeat. With one repeat both are the reference pipeline's (`_select`) exactly.
    y_val = np.asarray(dev_enc.y, dtype=np.float64)[validated]
    sel = select_one_se(order, {c: primary.aggregate(y_val, cv[c].oof) for c in order},
                        {c: cv[c].row_loss for c in order})
    spec = next(c for c in candidates if c.name == sel.finalist)
    try:
        finalist = fit_predictor(spec, columns, X, dev_enc, np.arange(len(dev), dtype=np.int64), protocol, threads)
    except ValueError as exc:
        raise TrainerFailure("inner-cv", f"refit of finalist '{spec.name}': {exc}") from exc
    clock.check("finalist refit")
    return SelectionOutcome(cv, sel, finalist, folds, validated)


def _cross_validate(spec: CandidateSpec, columns: Sequence[encoding.ColumnSpec], X: pd.DataFrame,
                    dev_enc: EncodedLabel, folds: Sequence[F.Fold], validated: IntArr, primary: scores.PrimaryScore,
                    protocol: EvaluationProtocol, threads: int, clock: RunClock) -> CandidateCV:
    """One candidate on every fold: fold scores, per-row loss averaged over repeats, repeat-0 out-of-fold predictions
    and the corrected resampled-t interval of its inner mean."""
    pos_of = {int(v): i for i, v in enumerate(validated.tolist())}
    y_dev = np.asarray(dev_enc.y, dtype=np.float64)
    loss_sum = np.zeros(len(validated), dtype=np.float64)
    loss_cnt = np.zeros(len(validated), dtype=np.float64)
    oof_parts: dict[int, FArr] = {}
    fold_scores: list[float] = []
    n_train: list[int] = []
    n_valid: list[int] = []
    for fold in folds:
        try:
            model = fit_predictor(spec, columns, X, dev_enc, fold.train, protocol, threads)
            pred = model.predict(X.iloc[fold.valid])
        except ValueError as exc:
            raise TrainerFailure("inner-cv", f"candidate '{spec.name}': {exc}") from exc
        yv = y_dev[fold.valid]
        fold_scores.append(primary.aggregate(yv, pred))
        where = np.array([pos_of[int(i)] for i in fold.valid], dtype=np.int64)
        loss_sum[where] += primary.row_loss(yv, pred)
        loss_cnt[where] += 1
        if fold.repeat == 0:
            for j, i in enumerate(fold.valid.tolist()):
                oof_parts[pos_of[int(i)]] = np.asarray(pred[j], dtype=np.float64)
        n_train.append(len(fold.train))
        n_valid.append(len(fold.valid))
        clock.check(f"inner CV of '{spec.name}'")
    oof = np.asarray([oof_parts[i] for i in range(len(validated))], dtype=np.float64)
    mean, lo, hi = corrected_resampled_t(fold_scores, float(np.mean(n_train)), float(np.mean(n_valid)),
                                         INNER_INTERVAL_LEVEL)
    return CandidateCV(spec.name, fold_scores, loss_sum / np.maximum(loss_cnt, 1), oof,
                       InnerScore(spec.name, mean, lo, hi, len(fold_scores), len(validated)))
