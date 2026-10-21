# probes/refpipe/scoring.py — P5 scores, intervals and diagnostics. Losses are "lower is better" except auc and r2.
#   proper scores: log_loss_score (binary + multiclass), brier, poisson_deviance, tweedie_deviance(power 1.5), rmse [S4.1, S4.3]
#   secondary:     auc (binary; macro one-vs-rest for multiclass), mae, r2
#   intervals:     bootstrap_ci / paired_bootstrap, optionally clustered (entity or origin blocks)            [S6.2, S-T.5]
#   calibration:   slope, intercept, CITL — same GLM method as probes/reference/evaluate_reference.py      [S6.3]
#   importance:    held-out permutation importance aggregated per source column                             [S9.4, S2.4(iii)]
#   residuals:     acf1, durbin_watson, ljung_box, effective_n, panel_acf (pooled within-entity)            [S-T.6]
#   forecasts:     mase_scale (origin training window only), diebold_mariano (HLN-corrected)               [S-T.3]
from __future__ import annotations

import math
import warnings
from collections.abc import Callable, Mapping, Sequence

import numpy as np
import numpy.typing as npt
import pandas as pd
import statsmodels.api as sm
from scipy import stats

FArr = npt.NDArray[np.float64]
Arr = npt.NDArray[np.generic]
ScoreFn = Callable[[Arr, Arr], float]
EPS = 1e-15


def _f(a: object) -> FArr:
    return np.asarray(a, dtype=np.float64)


def log_loss_score(y: Arr, p: Arr) -> float:
    pa = _f(p)
    if pa.ndim == 1:
        yy = _f(y)
        q = np.clip(pa, EPS, 1 - EPS)
        return float(-np.mean(yy * np.log(q) + (1 - yy) * np.log(1 - q)))
    q = np.clip(pa, EPS, 1 - EPS)
    q = q / q.sum(axis=1, keepdims=True)
    yi = np.asarray(y, dtype=np.int64)
    return float(-np.mean(np.log(q[np.arange(len(yi)), yi])))


def brier(y: Arr, p: Arr) -> float:
    pa = _f(p)
    if pa.ndim == 1:
        return float(np.mean((pa - _f(y)) ** 2))
    yi = np.asarray(y, dtype=np.int64)
    onehot = np.zeros_like(pa)
    onehot[np.arange(len(yi)), yi] = 1.0
    return float(np.mean(np.sum((pa - onehot) ** 2, axis=1)))


def _auc_binary(y: FArr, s: FArr) -> float:
    pos = y == 1
    n1 = int(pos.sum()); n0 = len(y) - n1
    if n1 == 0 or n0 == 0:
        return float("nan")
    r = stats.rankdata(s)
    return float((r[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def auc(y: Arr, p: Arr) -> float:
    pa = _f(p)
    if pa.ndim == 1:
        return _auc_binary(_f(y), pa)
    yi = np.asarray(y, dtype=np.int64)
    return float(np.mean([_auc_binary((yi == k).astype(np.float64), pa[:, k]) for k in range(pa.shape[1])]))


def auc_by_class(y: Arr, p: Arr) -> list[float]:
    pa = _f(p); yi = np.asarray(y, dtype=np.int64)
    return [_auc_binary((yi == k).astype(np.float64), pa[:, k]) for k in range(pa.shape[1])]


def rmse(y: Arr, p: Arr) -> float:
    return float(math.sqrt(float(np.mean((_f(y) - _f(p)) ** 2))))


def mse(y: Arr, p: Arr) -> float:
    return float(np.mean((_f(y) - _f(p)) ** 2))


def mae(y: Arr, p: Arr) -> float:
    return float(np.mean(np.abs(_f(y) - _f(p))))


def r2(y: Arr, p: Arr) -> float:
    yy = _f(y)
    ss = float(np.sum((yy - yy.mean()) ** 2))
    return float(1 - float(np.sum((yy - _f(p)) ** 2)) / ss) if ss > 0 else float("nan")


def poisson_deviance(y: Arr, mu: Arr) -> float:
    yy = _f(y); m = np.maximum(_f(mu), EPS)
    with np.errstate(divide="ignore", invalid="ignore"):
        ylog = np.where(yy > 0, yy * np.log(yy / m), 0.0)
    return float(np.mean(2 * (ylog - (yy - m))))


def tweedie_deviance(y: Arr, mu: Arr, power: float = 1.5) -> float:
    yy = _f(y); m = np.maximum(_f(mu), EPS); p = power
    dev = 2 * (np.power(yy, 2 - p) / ((1 - p) * (2 - p)) - yy * np.power(m, 1 - p) / (1 - p) + np.power(m, 2 - p) / (2 - p))
    return float(np.mean(dev))


def mase_scale(train: Arr, m: int = 12) -> float:
    """In-sample seasonal-naive MAE of the origin's training window only (FPP3 5.8, scaled seasonal errors)."""
    tr = _f(train)
    if len(tr) <= m:
        raise ValueError("training window shorter than the seasonal period")
    return float(np.mean(np.abs(tr[m:] - tr[:-m])))


def _index_sets(n: int, groups: Sequence[object] | None) -> list[npt.NDArray[np.int64]] | None:
    if groups is None:
        return None
    g = pd.Series(list(groups)).astype(str)
    codes, _ = pd.factorize(g, sort=True)
    order = np.argsort(codes, kind="mergesort")
    bounds = np.flatnonzero(np.diff(codes[order])) + 1
    return [a.astype(np.int64) for a in np.split(order, bounds)]


def _resample(rng: np.random.Generator, n: int, sets: list[npt.NDArray[np.int64]] | None) -> npt.NDArray[np.int64]:
    if sets is None:
        return rng.integers(0, n, n).astype(np.int64)
    pick = rng.integers(0, len(sets), len(sets))
    return np.concatenate([sets[int(i)] for i in pick])


def bootstrap_ci(y: Arr, pred: Arr, fn: ScoreFn, n: int = 1000, seed: int = 0,
                 groups: Sequence[object] | None = None) -> tuple[float, float]:
    """95% percentile bootstrap of fn over test rows (whole groups when groups is given: cluster bootstrap)."""
    yy = np.asarray(y); pp = np.asarray(pred)
    rng = np.random.default_rng(seed); sets = _index_sets(len(yy), groups)
    vals = []
    for _ in range(n):
        i = _resample(rng, len(yy), sets)
        v = fn(yy[i], pp[i])
        if not math.isnan(v):
            vals.append(v)
    if not vals:
        return float("nan"), float("nan")
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def paired_bootstrap(y: Arr, pred_base: Arr, pred_model: Arr, fn: ScoreFn, n: int = 1000, seed: int = 0,
                     groups: Sequence[object] | None = None) -> tuple[float, float, float]:
    """(fn(base) - fn(model)) with a paired 95% bootstrap CI on the same resampled test rows. >0 = model better (loss)."""
    yy = np.asarray(y); a = np.asarray(pred_base); b = np.asarray(pred_model)
    rng = np.random.default_rng(seed); sets = _index_sets(len(yy), groups)
    vals = []
    for _ in range(n):
        i = _resample(rng, len(yy), sets)
        v = fn(yy[i], a[i]) - fn(yy[i], b[i])
        if not math.isnan(v):
            vals.append(v)
    return float(fn(yy, a) - fn(yy, b)), float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def _logit(p: FArr, eps: float = 1e-6) -> FArr:
    pc = np.clip(p, eps, 1 - eps)
    return np.asarray(np.log(pc / (1 - pc)), dtype=np.float64)


def calibration(y: Arr, p: Arr) -> dict[str, float]:
    """Calibration slope and intercept (y ~ a + b*logit p) and calibration-in-the-large (y ~ offset(logit p))."""
    yy = _f(y); lp = _logit(_f(p))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        citl = sm.GLM(yy, np.ones((len(yy), 1)), offset=lp, family=sm.families.Binomial()).fit()
        if float(np.ptp(lp)) < 1e-8:  # constant predictions: the slope is undefined (reported as null)
            slope, icpt = float("nan"), float("nan")
        else:
            fit = sm.GLM(yy, sm.add_constant(lp, has_constant="add"), family=sm.families.Binomial()).fit()
            slope, icpt = float(fit.params[1]), float(fit.params[0])
    return {"slope": slope, "intercept": icpt, "citl": float(citl.params[0]),
            "meanPredicted": float(np.mean(_f(p))), "meanObserved": float(np.mean(yy))}


def reliability(y: Arr, p: Arr, bins: int = 10) -> list[dict[str, float]]:
    """Quantile-bin reliability table: mean predicted vs observed rate per bin (S6.3)."""
    yy = _f(y); pp = _f(p)
    order = np.argsort(pp, kind="mergesort")
    out = []
    for chunk in np.array_split(order, bins):
        if len(chunk) == 0:
            continue
        out.append({"n": float(len(chunk)), "meanPredicted": float(pp[chunk].mean()), "observed": float(yy[chunk].mean())})
    return out


PredictFn = Callable[[pd.DataFrame], Arr]


def permutation_importance_by_column(model: PredictFn, X_test: pd.DataFrame, y_test: Arr, fn: ScoreFn,
                                     source_map: Mapping[str, Sequence[str]], n_repeats: int = 5, seed: int = 0,
                                     n_boot: int = 300, groups: Sequence[object] | None = None) -> list[dict[str, object]]:
    """Held-out permutation importance per SOURCE column: all frame columns derived from one source are permuted
    together with one row permutation, so encoding cannot split (dilute) a source column's importance.
    drop = mean over repeats of fn(permuted) - fn(intact), with a paired bootstrap CI over the same test rows."""
    yy = np.asarray(y_test)
    base = np.asarray(model(X_test))
    rng = np.random.default_rng(seed)
    out: list[dict[str, object]] = []
    for src in sorted(source_map):
        cols = list(source_map[src])
        perms = []
        for _ in range(n_repeats):
            Xp = X_test.copy()
            idx = rng.permutation(len(Xp))
            for c in cols:
                Xp[c] = X_test[c].to_numpy()[idx]
            perms.append(np.asarray(model(Xp)))
        drop = float(np.mean([fn(yy, pp) for pp in perms]) - fn(yy, base))
        brng = np.random.default_rng(seed + 1); sets = _index_sets(len(yy), groups); vals = []
        for _ in range(n_boot):
            i = _resample(brng, len(yy), sets)
            vals.append(float(np.mean([fn(yy[i], pp[i]) for pp in perms]) - fn(yy[i], base[i])))
        out.append({"column": src, "drop": drop, "ci": [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]})
    out.sort(key=lambda d: (-float(str(d["drop"])), str(d["column"])))
    return out


def acf(e: Arr, nlags: int) -> FArr:
    x = _f(e) - float(np.mean(_f(e)))
    den = float(np.sum(x * x))
    return np.array([float(np.sum(x[k:] * x[: len(x) - k])) / den for k in range(1, nlags + 1)], dtype=np.float64)


def acf1(e: Arr) -> float:
    return float(acf(e, 1)[0])


def durbin_watson(e: Arr) -> float:
    x = _f(e)
    return float(np.sum(np.diff(x) ** 2) / np.sum(x * x))


def ljung_box(e: Arr, lags: int) -> tuple[float, float]:
    n = len(e); r = acf(e, lags)
    q = float(n * (n + 2) * np.sum(r ** 2 / (n - np.arange(1, lags + 1))))
    return q, float(stats.chi2.sf(q, lags))


def hac_se(d: Arr, lags: int) -> float:
    """Newey-West (Bartlett) standard error of the mean of d with the given number of lags."""
    x = _f(d); n = len(x); z = x - x.mean()
    var = float(np.sum(z * z)) / n
    for k in range(1, min(lags, n - 1) + 1):
        var += 2 * (1 - k / (lags + 1)) * float(np.sum(z[k:] * z[: n - k])) / n
    return float(math.sqrt(max(var, 0.0) / n))


def chi2_sf(q: float, df: int) -> float:
    return float(stats.chi2.sf(q, df))


def effective_n(n: int, acf1_value: float) -> float:
    return float(n * (1 - acf1_value) / (1 + acf1_value))


def panel_acf(resid: Arr, entity: Sequence[object], order: Arr, nlags: int) -> tuple[list[float], list[int]]:
    """Pooled within-entity residual autocorrelation at lags 1..nlags (residuals demeaned globally), with pair counts."""
    d = pd.DataFrame({"e": _f(resid), "g": pd.Series(list(entity)).astype(str).to_numpy(), "o": np.asarray(order)})
    d = d.sort_values(["g", "o"], kind="mergesort")
    d["e"] = d["e"] - d["e"].mean()
    den = float((d["e"] ** 2).mean())
    rhos: list[float] = []; ns: list[int] = []
    for k in range(1, nlags + 1):
        lag = d.groupby("g", sort=False)["e"].shift(k)
        m = lag.notna()
        rhos.append(float((d.loc[m, "e"] * lag[m]).mean() / den) if m.any() else float("nan"))
        ns.append(int(m.sum()))
    return rhos, ns


def diebold_mariano(loss_a: Arr, loss_b: Arr, h: int) -> dict[str, float]:
    """DM test of equal accuracy on loss differential d = loss_a - loss_b, HAC variance with h-1 lags, Harvey-Leybourne-
    Newbold small-sample correction, t(n-1) reference. Negative statistic = a more accurate than b."""
    d = _f(loss_a) - _f(loss_b); n = len(d); dbar = float(d.mean()); x = d - dbar
    gamma = [float(np.sum(x[k:] * x[: n - k]) / n) for k in range(h)]
    var = (gamma[0] + 2 * sum(gamma[1:])) / n
    if var <= 0:
        return {"statistic": float("nan"), "pValue": float("nan"), "meanDiff": dbar, "n": float(n)}
    dm = dbar / math.sqrt(var)
    corr = math.sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n)
    stat = dm * corr
    return {"statistic": float(stat), "pValue": float(2 * stats.t.sf(abs(stat), n - 1)), "meanDiff": dbar, "n": float(n)}
