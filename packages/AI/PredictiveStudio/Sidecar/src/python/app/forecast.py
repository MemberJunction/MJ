"""The forecast path: a rolling-origin backtest of one series.

The protocol's rolling-origin holdout places `origins` non-overlapping `horizonPeriods`-period test windows at the end
of the series; origin k trains only on the periods up to `gapPeriods` before its first test period (expanding from the
first period, or a sliding `minTrainPeriods` window). The row manifest's locked-holdout rows must be exactly those test
periods. This is the reference pipeline's design (`truthsuite.refpipe.run.run_series`), and it differs from the
tabular holdout in two ways that are intended: a later origin trains on earlier origins' test periods (each origin
forecasts only periods after its own window, so no origin reads a target it is scored on), and the returned artifacts
are fitted on the whole series, the way the series will be forecast after publishing. `holdoutAccess.count` is 1:
the outer origins are scored once, for one finalist.

Selection reads only the periods before the first test period: up to three inner origins of `horizonPeriods` periods
end there, each trained on every period before it (minus the gap). A candidate whose residuals on that whole
pre-test window fail Ljung-Box (p below the protocol's `ljungBoxAlpha`, else 0.05; lags min(24, n / 5)) is vetoed
unless every candidate fails; the rest are ranked by their pooled inner loss, and the earliest candidate (request
order) within one Newey-West standard error (horizon - 1 lags) of the best is the finalist. Series drivers
(`temporal.SERIES_ALGOS`) fit the target alone; any other driver is a tabular predictor fitted on the snapshot's
columns. The engine refuses a lag column shorter than the horizon; it does not add the gap, so with `gapPeriods` g a
lag-h column at the j-th test period of an origin reads a period after that origin's training window when j > h - g.
The protocol's `innerValidation` is not read here: the inner origins are the forecast's inner validation, and
`innerScores[].folds` reports how many ran.

Every outer origin scores the finalist, the training-window mean (the gate's dummy), the naive and the seasonal-naive
forecasts, each fitted on that origin's window (`temporal.backtest`), and every declared incumbent heuristic, read
from the snapshot's incumbent-score column at the origin's test periods (as the tabular path reads it; a declared
heuristic without that column fails at `baselines`). Naive, seasonal naive and the heuristics are the gate's simple
set. With a `mase` primary score every member's errors are scaled by the origin's own in-sample seasonal-naive MAE;
with `rmse` they are not scaled. The gate and
every interval resample whole origins (block bootstrap by origin), which is why a forecast protocol must declare
`block-bootstrap`; the Diebold-Mariano test of the model against seasonal naive is reported beside the gate's
comparisons whatever `pairedTest` declares. Residual ACF and Ljung-Box of the finalist at the final origin are
reported when the protocol declares residual diagnostics.

What a forecast run does not report, and why:
  - prediction-interval coverage: the contract's interval methods (split-conformal, quantile) are not what the series
    models' Gaussian h-step intervals are, so a protocol declaring prediction intervals is refused rather than
    reported under a method it did not use; `predictionIntervalCoverage` is empty.
  - importance: series drivers read no feature column, and permutation importance of a tabular finalist's lag
    columns per origin window is not built, so `importance` is empty.
  - the incumbent diff: scoring a published forecast model on these origins needs a forecast loader and per-origin
    scoring of the incumbent, which are not built, so `incumbentDiff` is null.
  - slices: a protocol declaring them is refused (out-of-time and subgroup slices of a series backtest are not
    built). Calibration and the operating point are defined on classification rows only.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Dict, Final, List, Optional, Sequence, Tuple

import numpy as np
from scipy import stats

from . import artifacts_v2, baselines as BL, intervals as IV, scores, snapshot as SN, temporal as T
from .array_types import FArr, IntArr
from .evaluation import (gate_model, is_defined, metric_with_interval, refuse_non_finite, returned_artifact,
                         with_incumbent)
from .failures import RequestRefused, RunClock, TrainerFailure
from .gate import GateRun, run_gate
from .trainer import INNER_INTERVAL_LEVEL, EncodedLabel, TrainedPredictor, fit_predictor
from .snapshot_format import INCUMBENT_SCORE_COLUMN
from .trainer_schemas import (
    BaselineResult, CandidateInnerScore, CandidateSpec, CodeVersion, DieboldMariano, EvaluationProtocol,
    ForecastEvaluation, HoldoutAccess, HoldoutScores, Interval, LjungBox, MetricWithInterval, PairedComparison,
    ResidualDiagnostics, ReturnedArtifact, RollingOriginHoldout, RollingOriginResult, RunCost, SeasonalNaiveBaseline,
    TrainerCompleted, TrainerRequest,
)

# The Ljung-Box veto's significance level when the protocol declares no residual diagnostics.
DEFAULT_LJUNG_BOX_ALPHA: Final = 0.05
# The veto's lags: min(VETO_MAX_LAGS, residuals // VETO_RESIDUALS_PER_LAG), at least 1 (the reference pipeline's rule).
VETO_MAX_LAGS: Final = 24
VETO_RESIDUALS_PER_LAG: Final = 5
# At most this many inner origins end at the first test period.
MAX_INNER_ORIGINS: Final = 3
# The backtest's member names: the model under test and the three baselines `temporal.backtest` forecasts.
MODEL: Final = "model"
MEAN_MEMBER: Final = "mean"
SIMPLE_MEMBERS: Final = ("naive", "seasonalNaive")
# A declared baseline kind -> the backtest member that stands for it (a heuristic is named by `baselines.fit_all`).
BASELINE_MEMBER: Final[Dict[str, str]] = {"dummy": MEAN_MEMBER, "naive": "naive", "seasonal-naive": "seasonalNaive"}
# The declared baseline kinds `baselines.fit_all` reads for a forecast: the dummy (the gate's yardstick, required as on
# the tabular path) and the incumbent heuristics.
FIT_ALL_KINDS: Final = ("dummy", "incumbent-heuristic")


def refuse_invalid_forecast(p: EvaluationProtocol) -> None:
    """Refuse a forecast protocol the rolling-origin backtest cannot honour.

    Raises:
        RequestRefused: For an interval method other than `block-bootstrap` (the backtest resamples whole origins),
            declared prediction intervals (forecast prediction-interval coverage is not available), no seasonal-naive
            baseline (it sets the MASE scale's season and is a member of the gate), or declared slices.
    """
    if p.intervals.method != "block-bootstrap":
        raise RequestRefused(f"a forecast's intervals resample whole rolling origins ('block-bootstrap'); the protocol "
                             f"declares '{p.intervals.method}'")
    if p.predictionIntervals is not None:
        raise RequestRefused(f"forecast prediction-interval coverage is not available; the protocol declares "
                             f"predictionIntervals '{p.predictionIntervals.method}'")
    if _season(p) is None:
        raise RequestRefused("a forecast needs a declared seasonal-naive baseline: its season sets the MASE scale and "
                             "it is a member of the publishing gate")
    declared = (["out-of-time"] if p.slices.outOfTime else []) + ([f"subgroups {p.slices.subgroups}"]
                                                                 if p.slices.subgroups else [])
    if declared:
        raise RequestRefused(f"forecast slices are not available; the protocol declares {' and '.join(declared)}")


def _season(p: EvaluationProtocol) -> Optional[int]:
    """The season of the protocol's first seasonal-naive baseline."""
    return next((b.season for b in p.baselines if isinstance(b, SeasonalNaiveBaseline)), None)


# ------------------------------------------------------------------------------------------------ the series -----

@dataclass(frozen=True)
class _Series:
    """The snapshot's rows in period order, the period ordinal of each, and the season and its phase."""

    order: IntArr
    periods: IntArr
    season: int
    phase: int


def _one_series(req: TrainerRequest, snap: SN.Snapshot) -> _Series:
    """The snapshot as one series with one row per period and no missing period.

    Raises:
        TrainerFailure: Stage `load-snapshot` for more than one entity, a repeated period or a skipped period.
    """
    entities = sorted(set(snap.entity_keys))
    if len(entities) != 1:
        raise TrainerFailure("load-snapshot", f"a forecast trains one series per snapshot; this snapshot holds "
                                              f"{len(entities)} entities (panel forecasts are not available)")
    ordinals = SN.period_ordinals(snap)
    order = np.argsort(ordinals, kind="mergesort").astype(np.int64)
    periods = ordinals[order]
    unit = snap.decision.period
    for i in range(1, len(periods)):
        step = int(periods[i] - periods[i - 1])
        if step == 0:
            raise TrainerFailure("load-snapshot", f"period {SN.period_start(int(periods[i]), unit).isoformat()} holds "
                                                  f"more than one row; a forecast series has one row per period")
        if step > 1:
            missing = SN.period_start(int(periods[i - 1]) + 1, unit).isoformat()
            raise TrainerFailure("load-snapshot", f"period {missing} is missing; a forecast series has a row for every "
                                                  f"period")
    season = _season(req.protocol)
    if season is None:   # refuse_invalid_forecast refuses this before anything runs
        raise TrainerFailure("load-snapshot", "a forecast needs a declared seasonal-naive baseline")
    return _Series(order, periods, season, int(periods[0]) % season)


@dataclass(frozen=True)
class _Design:
    """The outer origins (the locked holdout) and the inner origins (selection, before the first test period)."""

    outer: List[T.Origin]
    inner: List[T.Origin]
    pre_test_last: int   # the last period of the pre-test window the Ljung-Box veto fits on


def _checked_design(snap: SN.Snapshot, ho: RollingOriginHoldout, s: _Series) -> _Design:
    """The rolling-origin design for the series, checked against the row manifest and the season.

    Raises:
        TrainerFailure: Stage `load-snapshot` when the design cannot be placed, a training window is not longer than
            the season (no MASE scale), or the manifest's locked-holdout rows are not the design's test periods.
    """
    n = len(s.order)
    try:
        outer = T.rolling_origins(n, ho.origins, ho.horizonPeriods, ho.gapPeriods, ho.minTrainPeriods, ho.window)
    except ValueError as exc:
        raise TrainerFailure("load-snapshot", str(exc)) from exc
    h, gap = ho.horizonPeriods, ho.gapPeriods
    first_test = outer[0].test[0]
    n_inner = max(1, min(MAX_INNER_ORIGINS, (first_test - ho.minTrainPeriods) // h))
    ends = [first_test - 1 - (n_inner - j) * h for j in range(n_inner)]
    inner = [T.Origin(j + 1, end - gap, 0, tuple(range(end + 1, end + 1 + h))) for j, end in enumerate(ends)]
    for kind, origins in (("origin", outer), ("inner origin", inner)):
        for o in origins:
            size = o.last_train - o.first_train + 1
            if size <= s.season:
                raise TrainerFailure("load-snapshot", f"{kind} {o.k}'s training window has {max(size, 0)} periods; "
                                                      f"it must be longer than the seasonal period {s.season}")
    test = {i for o in outer for i in o.test}
    roles = [snap.roles[int(s.order[i])] for i in range(n)]
    if any((roles[i] == "locked-holdout") != (i in test) for i in range(n)):
        raise TrainerFailure("load-snapshot", "the row manifest's locked-holdout rows are not the test periods of the "
                                              "protocol's rolling-origin design")
    return _Design(outer, inner, first_test - 1 - gap)


# ------------------------------------------------------------------------------------------------ fitting --------

class _Fitter:
    """Fits one candidate on a window of periods and forecasts later periods: a series driver on the target alone, any
    other driver as a tabular predictor on the snapshot's columns (in period order)."""

    def __init__(self, req: TrainerRequest, snap: SN.Snapshot, enc: EncodedLabel, s: _Series) -> None:
        self.req, self.snap, self.s = req, snap, s
        self.y: FArr = np.asarray(np.asarray(enc.y, dtype=np.float64)[s.order], dtype=np.float64)
        self.X = snap.frame.iloc[s.order].reset_index(drop=True)
        self.enc = EncodedLabel(self.y, enc.family, None, enc.tweedie_power)

    def fit(self, spec: CandidateSpec, first: int, last: int) -> artifacts_v2.ShippablePredictor:
        """`spec` fitted on periods first..last.

        Raises:
            ValueError: From the series model or the tabular fit.
        """
        t = np.arange(first, last + 1, dtype=np.int64)
        algo = T.series_algo(spec.driverKey)
        if algo is not None:
            return T.SeriesModel(algo, self.s.season, self.s.phase).fit(self.y[t], t)
        return fit_predictor(spec, self.snap.columns, self.X, self.enc, t, self.req.protocol, self.req.threads)

    def forecast(self, model: artifacts_v2.ShippablePredictor, periods: Sequence[int]) -> FArr:
        """`model`'s forecasts of the given period indices."""
        t = np.asarray(periods, dtype=np.int64)
        if isinstance(model, TrainedPredictor):
            return np.asarray(model.predict(self.X.iloc[t]), dtype=np.float64)
        return model.forecast(t)

    def residuals(self, model: artifacts_v2.ShippablePredictor, first: int, last: int) -> FArr:
        """`model`'s in-window residuals on periods first..last."""
        if isinstance(model, TrainedPredictor):
            t = np.arange(first, last + 1, dtype=np.int64)
            return np.asarray(self.y[t] - model.predict(self.X.iloc[t]), dtype=np.float64)
        if isinstance(model, T.SeriesModel):
            return model.resid
        raise ValueError(f"a {model.kind} baseline has no residuals")

    def forecaster(self, spec: CandidateSpec) -> T.OriginForecaster:
        """`spec` as a `temporal.backtest` forecaster: fitted on each origin's window, forecasting its test periods."""
        return lambda o: self.forecast(self.fit(spec, o.first_train, o.last_train), o.test)


def _backtest(fit: _Fitter, origins: Sequence[T.Origin], spec: CandidateSpec) -> List[T.OriginScores]:
    """`temporal.backtest` of `spec` on `origins`.

    Raises:
        ValueError: Naming the origin, from a fit, a forecast or a zero MASE scale.
    """
    return T.backtest(fit.y, origins, fit.s.season, fit.forecaster(spec))


def _rows(metric: scores.PrimaryMetric, scored: Sequence[T.OriginScores],
          forecasts: Sequence[FArr]) -> Tuple[FArr, FArr]:
    """(y, prediction) whose primary-score loss is the loss of `forecasts` (one array per origin): absolute errors
    scaled by each origin's scale against 0 for MASE (the reference pipeline's device; the same arithmetic as
    `OriginScores.scaled_errors`), else the actual values and the forecasts."""
    if metric == "mase":
        e = np.concatenate([np.abs(o.actual - f) / o.scale for o, f in zip(scored, forecasts)])
        return np.zeros(len(e), dtype=np.float64), np.asarray(e, dtype=np.float64)
    return (np.asarray(np.concatenate([o.actual for o in scored]), dtype=np.float64),
            np.asarray(np.concatenate(list(forecasts)), dtype=np.float64))


def _member_rows(metric: scores.PrimaryMetric, scored: Sequence[T.OriginScores], member: str) -> Tuple[FArr, FArr]:
    """`_rows` of one backtest member."""
    return _rows(metric, scored, [o.forecasts[member] for o in scored])


# ------------------------------------------------------------------------------------------------ selection ------

@dataclass(frozen=True)
class _Selection:
    finalist: CandidateSpec
    inner_scores: List[CandidateInnerScore]


def _veto_alpha(p: EvaluationProtocol) -> float:
    return p.residualDiagnostics.ljungBoxAlpha if p.residualDiagnostics is not None else DEFAULT_LJUNG_BOX_ALPHA


def _inner_score(name: str, metric: scores.PrimaryMetric, losses: FArr, n_inner: int, h: int) -> CandidateInnerScore:
    """The candidate's pooled inner score with a Newey-West interval of its mean loss (RMSE: the square root of the
    mean squared error and of its bounds)."""
    mean, se = float(losses.mean()), T.hac_se(losses, h - 1)
    z = float(stats.norm.ppf((1 + INNER_INTERVAL_LEVEL) / 2))
    lo, hi = mean - z * se, mean + z * se
    if metric == "rmse":
        mean, lo, hi = float(np.sqrt(mean)), float(np.sqrt(max(lo, 0.0))), float(np.sqrt(hi))
    return CandidateInnerScore(candidate=name, folds=n_inner, optimistic=True,
                               inner=MetricWithInterval(metric=metric, value=mean, n=len(losses),
                                                        interval=Interval(level=INNER_INTERVAL_LEVEL, lower=lo,
                                                                          upper=hi)))


def _select(req: TrainerRequest, fit: _Fitter, design: _Design, primary: scores.PrimaryScore, h: int,
            clock: RunClock) -> _Selection:
    """Inner origins inside the pre-test window only: Ljung-Box veto, pooled inner loss, one-standard-error rule.

    Raises:
        TrainerFailure: Stage `inner-cv` when a candidate cannot be fitted, forecast or tested on the pre-test window.
    """
    losses: Dict[str, FArr] = {}
    lb_p: Dict[str, float] = {}
    for c in req.candidates:
        try:
            y_rows, pred = _member_rows(primary.metric, _backtest(fit, design.inner, c), MODEL)
            resid = fit.residuals(fit.fit(c, 0, design.pre_test_last), 0, design.pre_test_last)
            lb_p[c.name] = T.ljung_box(resid, max(1, min(VETO_MAX_LAGS, len(resid) // VETO_RESIDUALS_PER_LAG)))[1]
        except ValueError as exc:
            raise TrainerFailure("inner-cv", f"candidate '{c.name}': {exc}") from exc
        losses[c.name] = np.asarray(primary.row_loss(y_rows, pred), dtype=np.float64)
        clock.check(f"inner origins of '{c.name}'")
    alpha = _veto_alpha(req.protocol)
    names = [c.name for c in req.candidates]
    eligible = [nm for nm in names if lb_p[nm] >= alpha] or names
    best = min(eligible, key=lambda nm: (float(losses[nm].mean()), eligible.index(nm)))
    chosen = next(nm for nm in eligible
                  if float((losses[nm] - losses[best]).mean()) <= T.hac_se(losses[nm] - losses[best], h - 1))
    inner = [_inner_score(nm, primary.metric, losses[nm], len(design.inner), h) for nm in names]
    return _Selection(next(c for c in req.candidates if c.name == chosen), inner)


# ------------------------------------------------------------------------------------------------ the heuristics -

@dataclass(frozen=True)
class _Heuristic:
    """A declared incumbent heuristic: its index in `protocol.baselines`, its gate member name and its forecast at
    every period of the series (the snapshot's incumbent-score column, in period order)."""

    declared_index: int
    name: str
    forecast: FArr


def _heuristics(req: TrainerRequest, snap: SN.Snapshot, fit: _Fitter) -> List[_Heuristic]:
    """Every declared incumbent heuristic, read through `baselines.fit_all` as the tabular path reads it (one owner of
    the member name, the column predictor and the refusal of a heuristic without the incumbent-score column).
    `fit_all` is handed the declared dummy and heuristics only (it also requires the dummy, as the tabular gate does);
    its dummy is not used, since the forecast's dummy is the training-window mean of each origin.

    Raises:
        TrainerFailure: Stage `baselines`, as on the tabular path, when a heuristic is declared but the snapshot has no
            incumbent-score column, or no dummy is declared.
    """
    p = req.protocol
    kept = [(i, b) for i, b in enumerate(p.baselines) if b.kind in FIT_ALL_KINDS]
    column = INCUMBENT_SCORE_COLUMN if snap.incumbent_score is not None else None
    try:
        fitted = BL.fit_all(p.model_copy(update={"baselines": [b for _, b in kept]}), snap.columns, fit.X, fit.enc,
                            [], req.threads, column)
        frame = with_incumbent(fit.X, snap, fit.s.order)
        return [_Heuristic(kept[f.spec_index][0], f.name, np.asarray(f.predictor.predict(frame), dtype=np.float64))
                for f in fitted if f.role == "simple"]
    except ValueError as exc:
        raise TrainerFailure("baselines", str(exc)) from exc


# ------------------------------------------------------------------------------------------------ the outer origins

@dataclass(frozen=True)
class _Outer:
    """The outer origins' scores, the gate's rows and per-member predictions, the gate's simple set (naive, seasonal
    naive, then the heuristics), each declared baseline's member, and the origin-block groups."""

    scored: List[T.OriginScores]
    y: FArr
    pred: Dict[str, FArr]
    simple: List[str]
    member_of_baseline: Dict[int, str]
    groups: List[str]
    accessed_at: str


def _score_outer(req: TrainerRequest, fit: _Fitter, design: _Design, spec: CandidateSpec,
                 metric: scores.PrimaryMetric, heuristics: Sequence[_Heuristic]) -> _Outer:
    """Scores the outer origins once for the finalist, the three baselines and the declared heuristics.

    Raises:
        TrainerFailure: Stage `holdout`, naming the origin, when a fit, a forecast or a MASE scale fails.
    """
    accessed_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        scored = _backtest(fit, design.outer, spec)
    except ValueError as exc:
        raise TrainerFailure("holdout", str(exc)) from exc
    y = _member_rows(metric, scored, MODEL)[0]
    pred = {member: _member_rows(metric, scored, member)[1] for member in (MODEL, MEAN_MEMBER) + SIMPLE_MEMBERS}
    for hz in heuristics:
        pred[hz.name] = _rows(metric, scored, [hz.forecast[list(o.origin.test)] for o in scored])[1]
    members = {i: BASELINE_MEMBER[b.kind] for i, b in enumerate(req.protocol.baselines) if b.kind in BASELINE_MEMBER}
    members.update({hz.declared_index: hz.name for hz in heuristics})
    groups = [str(o.k) for o in scored for _ in o.origin.test]
    return _Outer(scored, y, pred, list(SIMPLE_MEMBERS) + [hz.name for hz in heuristics], members, groups,
                  accessed_at)


def _origin_results(scored: Sequence[T.OriginScores], s: _Series) -> List[RollingOriginResult]:
    """Each outer origin in period ordinals, with every member's MASE at that origin."""
    return [RollingOriginResult(k=o.k, lastTrainPeriod=int(s.periods[o.origin.last_train]),
                                testPeriods=[int(s.periods[i]) for i in o.origin.test], scale=o.scale,
                                mase={m: o.mase(m) for m in (MODEL, MEAN_MEMBER) + SIMPLE_MEMBERS})
            for o in scored]


def _gate(req: TrainerRequest, primary: scores.PrimaryScore, finalist: str, out: _Outer) -> GateRun:
    """The publishing gate on the origins' rows: dummy = training-window mean, simple set = naive, seasonal naive and
    the declared heuristics, each comparison a block bootstrap by origin at the protocol's margin and lower-bound
    level."""
    p = req.protocol
    return run_gate(out.y, primary.aggregate, finalist, out.pred[MODEL], out.pred[MEAN_MEMBER],
                    [(m, out.pred[m]) for m in out.simple], None, p.promotion.margin, p.intervals.resamples,
                    p.seed, out.groups, p.promotion.lowerBoundLevel)


def _metric(req: TrainerRequest, primary: scores.PrimaryScore, out: _Outer, member: str) -> MetricWithInterval:
    """A member's pooled primary score with its origin-block bootstrap interval."""
    iv = req.protocol.intervals
    ci = IV.bootstrap_ci(out.y, out.pred[member], primary.aggregate, iv.resamples, req.protocol.seed, out.groups,
                         iv.level)
    return metric_with_interval(primary.metric, primary.aggregate(out.y, out.pred[member]), ci, len(out.y),
                                iv.level)


def _baselines(req: TrainerRequest, primary: scores.PrimaryScore, out: _Outer) -> List[BaselineResult]:
    """Each declared baseline, in declared order, scored on the origins' rows."""
    return [BaselineResult(baseline=b, role="dummy" if b.kind == "dummy" else "simple",
                           holdout=_metric(req, primary, out, out.member_of_baseline[i]))
            for i, b in enumerate(req.protocol.baselines) if i in out.member_of_baseline]


def _secondary(req: TrainerRequest, out: _Outer) -> List[MetricWithInterval]:
    """R-squared of the finalist's forecasts when declared and defined (the only secondary metric of a regression
    family); left out when it is undefined on these rows, as the holdout stage does."""
    if "r2" not in req.protocol.secondaryMetrics:
        return []
    ys = np.concatenate([o.actual for o in out.scored])
    fc = np.concatenate([o.forecasts[MODEL] for o in out.scored])
    iv = req.protocol.intervals
    ci = IV.bootstrap_ci(ys, fc, scores.r2, iv.resamples, req.protocol.seed, out.groups, iv.level)
    m = metric_with_interval("r2", scores.r2(ys, fc), ci, len(ys), iv.level)
    return [m] if is_defined(m) else []


def _diebold_mariano(primary: scores.PrimaryScore, out: _Outer, h: int) -> DieboldMariano:
    """The model against seasonal naive on the primary score's per-row losses."""
    dm = T.diebold_mariano(primary.row_loss(out.y, out.pred[MODEL]),
                           primary.row_loss(out.y, out.pred["seasonalNaive"]), h)
    return DieboldMariano(statistic=dm.statistic, pValue=dm.p_value, meanDiff=dm.mean_diff, n=dm.n, horizon=h)


def _final_origin_diagnostics(req: TrainerRequest, fit: _Fitter, design: _Design,
                              spec: CandidateSpec) -> Optional[ResidualDiagnostics]:
    """Residual ACF and Ljung-Box of the finalist fitted on the final outer origin's window; None when the protocol
    declares no residual diagnostics.

    Raises:
        TrainerFailure: Stage `holdout` when the residuals cannot be tested (too few, or constant).
    """
    rd = req.protocol.residualDiagnostics
    if rd is None:
        return None
    last = design.outer[-1]
    try:
        resid = fit.residuals(fit.fit(spec, last.first_train, last.last_train), last.first_train, last.last_train)
        q, pv = T.ljung_box(resid, rd.acfLags)
        acf = T.acf(resid, rd.acfLags)
    except ValueError as exc:
        raise TrainerFailure("holdout", f"residual diagnostics at origin {last.k}: {exc}") from exc
    return ResidualDiagnostics(acf=[float(v) for v in acf], ljungBox=LjungBox(statistic=q, pValue=pv, lags=rd.acfLags),
                               autocorrelationFlagged=pv < rd.ljungBoxAlpha)


def _artifacts(req: TrainerRequest, snap: SN.Snapshot, fit: _Fitter, spec: CandidateSpec) -> List[ReturnedArtifact]:
    """The finalist and the naive and seasonal-naive members, fitted on the whole series. A series forecaster reads no
    feature column; a tabular finalist lists its columns and its driver baseline like the holdout stage's artifacts.

    Raises:
        TrainerFailure: Stage `holdout` when a member cannot be fitted or built.
    """
    last = len(fit.y) - 1
    t_all = np.arange(last + 1, dtype=np.int64)
    try:
        members: List[Tuple[str, artifacts_v2.ShippablePredictor]] = [
            (spec.name, fit.fit(spec, 0, last)),
            ("naive", T.SeriesBaseline("naive", fit.s.season).fit(fit.y, t_all)),
            ("seasonalNaive", T.SeriesBaseline("seasonal-naive", fit.s.season).fit(fit.y, t_all)),
        ]
        return [returned_artifact(req, snap, name, predictor, None) for name, predictor in members]
    except ValueError as exc:   # NotShippableError is a ValueError
        raise TrainerFailure("holdout", f"forecast artifacts: {exc}") from exc


# ------------------------------------------------------------------------------------------------ the run --------

def run_forecast(req: TrainerRequest, snap: SN.Snapshot, enc: EncodedLabel, code: CodeVersion,
                 clock: RunClock) -> TrainerCompleted:
    """One forecast run: check the series and the design, read the declared heuristics, select on inner origins,
    score the outer origins once, then the gate, statistics, diagnostics and artifacts, all before the run clock's
    last check. `code` is the run's CodeVersion, computed by the caller before the run's work.

    Raises:
        TrainerFailure: `load-snapshot` (not one contiguous series, or a design the manifest or the season cannot
            carry), `baselines` (a declared heuristic without its column, or no declared dummy), `inner-cv`
            (selection), `holdout` (an outer origin, a statistic, the diagnostics, an artifact, or a non-finite
            number), `timeout`/`budget-exceeded` from the run clock.
    """
    p = req.protocol
    ho = p.holdout
    if not isinstance(ho, RollingOriginHoldout):   # refuse_invalid pairs a forecast with a rolling-origin holdout
        raise TrainerFailure("load-snapshot", "a forecast task needs a rolling-origin holdout")
    s = _one_series(req, snap)
    design = _checked_design(snap, ho, s)
    fit = _Fitter(req, snap, enc, s)
    heuristics = _heuristics(req, snap, fit)
    primary = scores.primary_score(p.primaryScore.metric, enc.tweedie_power)
    sel = _select(req, fit, design, primary, ho.horizonPeriods, clock)
    out = _score_outer(req, fit, design, sel.finalist, primary.metric, heuristics)
    clock.check("rolling origins")
    gr = _gate(req, primary, sel.finalist.name, out)
    baselines = _baselines(req, primary, out)
    holdout = HoldoutScores(primary=_metric(req, primary, out, MODEL), secondary=_secondary(req, out))
    forecast = ForecastEvaluation(origins=_origin_results(out.scored, s),
                                  dieboldMarianoVsSeasonalNaive=_diebold_mariano(primary, out, ho.horizonPeriods))
    diagnostics = _final_origin_diagnostics(req, fit, design, sel.finalist)
    arts = _artifacts(req, snap, fit, sel.finalist)
    clock.check("forecast statistics")
    cost = clock.compute_seconds()
    return refuse_non_finite(TrainerCompleted(
        status="completed", trainingRunId=req.trainingRunId, codeVersion=code,
        computeSeconds=cost, innerScores=sel.inner_scores, finalist=sel.finalist.name,
        holdoutAccess=HoldoutAccess(accessedAt=out.accessed_at, count=p.holdoutAccessBudget,
                                    finalist=sel.finalist.name),
        holdout=holdout, baselines=baselines,
        comparisons={k: PairedComparison(value=v.value, ci=(v.lower, v.upper), beats=v.beats)
                     for k, v in gr.comparisons.items()},
        gate=gate_model(gr.decision), artifacts=arts, incumbentDiff=None, calibration=None, slices=[],
        operatingPoint=None,
        cost=RunCost(computeSeconds=cost, tokens=0, usd=0.0, budget=p.budgets, stoppedByBudget=False),
        importance=[], leakageFlags=[], predictionIntervalCoverage=[], residualDiagnostics=diagnostics,
        forecast=forecast, innerSplitContrast=None,
    ))
