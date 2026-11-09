# truthsuite/refpipe/audit.py — the reference pipeline's leakage audit (S2.4, S-T.1). It sees only the TRAINING carve and never the manifest's
# trap declarations: every flag is derived from the data.
#   (iii) high-cardinality ID: a non-numeric column whose distinct-value ratio exceeds 0.5.
#   (i)/(ii) single-feature out-of-sample score of feature X_t against the time-shifted label y_{t+k}, k in {-1, 0, +1}
#        (within entity, in T order; k = 0 only when the data has no time order). A column is flagged when its best
#        shift is k >= 0 (a same-period or future-period outcome) and that score beats the oracle-free plausibility
#        ceiling. A column whose best shift is k = -1 is a past-period outcome (a lag): legitimate, kept.
#   Scores: binary AUC, multiclass macro one-vs-rest AUC, continuous R^2 (ceiling 0.9 each, declared); series use the
#   R^2 of the naive-last innovation (y_{t+k} - y_{t+k-1} on X_t - y_{t+k-1}), because in a trending or persistent
#   series any lag has a high level R^2 and the level cannot separate a lag from a same-period copy.
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
import pandas as pd

from truthsuite.refpipe.scoring import auc, r2
from truthsuite.refpipe.splits import inner_cv

FArr = npt.NDArray[np.float64]
CEILING = {"auc": 0.9, "r2": 0.9, "innovationR2": 0.9}
ID_DISTINCT_RATIO = 0.5
SHRINK = 10.0  # bin-mean shrinkage toward the fold's overall mean (pseudo-rows)


def _key(v: object) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "__nan__"
    return str(v)


def _bin_keys(x_tr: npt.NDArray[np.generic], x_va: npt.NDArray[np.generic], numeric: bool) -> tuple[list[str], list[str]]:
    if numeric and len(np.unique(x_tr.astype(np.float64)[~np.isnan(x_tr.astype(np.float64))])) > 20:
        xt = x_tr.astype(np.float64); xv = x_va.astype(np.float64)
        edges = np.unique(np.nanquantile(xt, np.linspace(0, 1, 21)[1:-1]))
        kt = np.where(np.isnan(xt), -1, np.searchsorted(edges, xt, side="right"))
        kv = np.where(np.isnan(xv), -1, np.searchsorted(edges, xv, side="right"))
        return [str(int(v)) for v in kt], [str(int(v)) for v in kv]
    return [_key(v) for v in x_tr.tolist()], [_key(v) for v in x_va.tolist()]


def _oof_binned(x: npt.NDArray[np.generic], numeric: bool, Y: FArr,
                folds: list[tuple[npt.NDArray[np.int64], npt.NDArray[np.int64]]]) -> tuple[npt.NDArray[np.int64], FArr]:
    """Out-of-fold shrunken bin means of each column of Y (one column per class / one for continuous)."""
    idx_all: list[npt.NDArray[np.int64]] = []; pred_all: list[FArr] = []
    for tr, va in folds:
        if len(tr) == 0 or len(va) == 0:
            continue
        kt, kv = _bin_keys(x[tr], x[va], numeric)
        Ytr = Y[tr]; prior = Ytr.mean(axis=0)
        sums: dict[str, FArr] = {}; counts: dict[str, int] = {}
        for i, k in enumerate(kt):
            sums[k] = sums.get(k, np.zeros(Y.shape[1])) + Ytr[i]; counts[k] = counts.get(k, 0) + 1
        lookup = {k: (sums[k] + SHRINK * prior) / (counts[k] + SHRINK) for k in sums}
        pv = np.array([lookup.get(k, prior) for k in kv], dtype=np.float64)
        idx_all.append(va); pred_all.append(pv)
    return np.concatenate(idx_all), np.concatenate(pred_all)


def _ols_oof_r2(xf: FArr, yf: FArr, k: int = 5) -> float:
    n = len(yf); blocks = np.array_split(np.arange(n), k); pred = np.empty(n)
    for b in blocks:
        m = np.ones(n, dtype=bool); m[b] = False
        X = np.column_stack([np.ones(int(m.sum())), xf[m]])
        beta, *_ = np.linalg.lstsq(X, yf[m], rcond=None)
        pred[b] = beta[0] + beta[1] * xf[b]
    return r2(yf, pred)


def _shifted(train: pd.DataFrame, col: str, k: int, series: bool) -> pd.DataFrame:
    d = train[["ID", "EntityKey", "T", col, "Target"]].copy()
    g = d.groupby("EntityKey", sort=False)["Target"]
    d["y"] = g.shift(-k)
    if series:
        d["yprev"] = g.shift(-(k - 1))
        d = d.dropna(subset=["y", "yprev", col])
    else:
        d = d.dropna(subset=["y"])
    return d.reset_index(drop=True)


def score_shift(train: pd.DataFrame, col: str, k: int, problem: str, series: bool, grouped: bool, seed: int
                ) -> tuple[float, str, int]:
    d = _shifted(train, col, k, series)
    if len(d) < 20:
        return float("nan"), "n/a", len(d)
    if series:
        xf = d[col].astype(float).to_numpy() - d["yprev"].astype(float).to_numpy()
        yf = d["y"].astype(float).to_numpy() - d["yprev"].astype(float).to_numpy()
        if float(np.std(xf)) < 1e-12:
            return 0.0, "innovationR2", len(d)
        return _ols_oof_r2(xf, yf), "innovationR2", len(d)
    folds = inner_cv(d, k=5, seed=seed, grouped=grouped)
    xa = d[col].to_numpy(); numeric = bool(pd.api.types.is_numeric_dtype(d[col]))
    if problem == "multiclass":
        yi = d["y"].astype(int).to_numpy(); K = int(train["Target"].max()) + 1
        Y = np.eye(K)[yi]
        idx, P = _oof_binned(xa, numeric, Y, folds)
        return auc(yi[idx], P), "auc", len(d)
    yv = d["y"].astype(float).to_numpy()
    idx, P = _oof_binned(xa, numeric, yv.reshape(-1, 1), folds)
    if problem == "binary":
        return auc(yv[idx], P[:, 0]), "auc", len(d)
    return r2(yv[idx], P[:, 0]), "r2", len(d)


@dataclass
class Audit:
    kept: list[str]
    past_outcomes: list[str]
    flags: list[dict[str, object]]
    json: dict[str, object]


def leakage_audit(train: pd.DataFrame, features: list[str], problem: str, series: bool, has_time: bool,
                  entities_repeat: bool, seed: int) -> Audit:
    d = train.sort_values(["EntityKey", "T", "ID"], kind="mergesort").reset_index(drop=True) if has_time else train
    shifts = (-1, 0, 1) if has_time and (series or entities_repeat) else (0,)
    rows: list[dict[str, object]] = []; flags: list[dict[str, object]] = []; kept: list[str] = []
    lag_outcomes: list[str] = []
    for col in features:
        x = d[col]
        if not bool(pd.api.types.is_numeric_dtype(x)):
            ratio = float(x.nunique(dropna=True)) / max(1, int(x.notna().sum()))
            if ratio > ID_DISTINCT_RATIO:
                ev = {"column": col, "check": "high-cardinality-id (S2.4 iii)", "distinctRatio": ratio,
                      "threshold": ID_DISTINCT_RATIO, "nDistinct": int(x.nunique(dropna=True))}
                rows.append(ev); flags.append({**ev, "reason": f"non-numeric column with {ev['nDistinct']} distinct values in {int(x.notna().sum())} training rows (ratio {ratio:.3f} > {ID_DISTINCT_RATIO})"})
                continue
        scores: dict[str, float] = {}; metric = "n/a"; npairs: dict[str, int] = {}
        for k in shifts:
            s, metric, n = score_shift(d, col, k, problem, series, entities_repeat, seed)
            scores[f"{k:+d}"] = s; npairs[f"{k:+d}"] = n
        valid = {kk: v for kk, v in scores.items() if not np.isnan(v)}
        best = max(sorted(valid), key=lambda kk: valid[kk]) if valid else "+0"
        ceiling = CEILING.get(metric, float("nan"))
        best_score = valid.get(best, float("nan"))
        flagged = int(best) >= 0 and best_score > ceiling
        ev2: dict[str, object] = {"column": col, "check": "time-shifted-label / target-proxy (S2.4 i-ii)", "metric": metric,
                                  "scoreByShift": scores, "pairsByShift": npairs, "bestShift": int(best),
                                  "ceiling": ceiling, "flag": bool(flagged)}
        rows.append(ev2)
        if flagged:
            what = "same-period outcome / target proxy" if int(best) == 0 else "future-period outcome (time-shifted label)"
            flags.append({**ev2, "reason": f"{what}: single-feature out-of-sample {metric} {best_score:.4f} at shift {best} > ceiling {ceiling}"})
        else:
            kept.append(col)
            if int(best) == -1 and best_score > ceiling:
                lag_outcomes.append(col)
    return Audit(kept, lag_outcomes, flags,
                 {"method": "data-driven; training carve only; manifest trap declarations are not read",
                  "ceilings": CEILING, "idDistinctRatio": ID_DISTINCT_RATIO, "shifts": list(shifts),
                  "evidence": rows, "flags": flags, "kept": kept, "pastOutcomeColumns": lag_outcomes})
