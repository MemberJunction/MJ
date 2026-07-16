"""Data-profiling lenses (Doc 5 — the Statistician's compute backbone).

The Architecture Strategist's triage is only as honest as the statistics it cites,
so the CONTRACT is: the LLM chooses WHICH lenses to look through and INTERPRETS the
numbers, but the numbers themselves are computed HERE, in code — never invented by
the model. Each lens is a pure function of the data; ``profile()`` runs the requested
(or all applicable) lenses and returns a flat stats dict the ``/profile`` route
serializes for the Statistician sub-agent.

All sklearn / numpy / scipy — the lenses reuse the sidecar's existing deps.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np


def _matrix(columns: List[str], rows: List[List[Any]], feature_cols: List[str]) -> np.ndarray:
    idx = [columns.index(c) for c in feature_cols]
    return np.array([[float(r[j]) for j in idx] for r in rows], dtype=float)


def _col(columns: List[str], rows: List[List[Any]], name: str) -> np.ndarray:
    j = columns.index(name)
    return np.array([r[j] for r in rows])


# ---- individual lenses -------------------------------------------------------


def class_balance(y: np.ndarray) -> Dict[str, float]:
    """Positive-class fraction + minority count — the base-rate lens (94% renewal ⇒
    accuracy is vacuous; rank the minority instead)."""
    yi = np.asarray([int(float(v)) for v in y])
    vals, counts = np.unique(yi, return_counts=True)
    minority = int(counts.min())
    return {"class_balance": float(yi.mean()) if set(vals) <= {0, 1} else float(counts.max() / len(yi)),
            "minority_count": float(minority), "n_classes": float(len(vals))}


def censored_fraction(events: np.ndarray, durations: Optional[np.ndarray] = None) -> Dict[str, float]:
    """Right-censoring rate — the survival lens (a GBT window can't answer WHEN)."""
    ev = np.asarray([int(float(v)) for v in events])
    out = {"censored_fraction": float(1 - ev.sum() / max(len(ev), 1)), "events": float(ev.sum())}
    if durations is not None:
        out["median_observed_duration"] = float(np.median(np.asarray(durations, dtype=float)))
    return out


def vif_max(X: np.ndarray, feature_cols: List[str]) -> Dict[str, float]:
    """Max variance-inflation factor across informative columns — the collinearity
    lens (high VIF favors a regularized / tree model over plain OLS)."""
    from sklearn.linear_model import LinearRegression
    from sklearn.preprocessing import StandardScaler

    keep = [i for i in range(X.shape[1]) if np.std(X[:, i]) > 1e-9]
    if len(keep) < 2:
        return {"vif_max": 1.0}
    Xs = StandardScaler().fit_transform(X[:, keep])
    vifs = []
    for i in range(Xs.shape[1]):
        others = [j for j in range(Xs.shape[1]) if j != i]
        r2 = LinearRegression().fit(Xs[:, others], Xs[:, i]).score(Xs[:, others], Xs[:, i])
        vifs.append(1.0 / max(1.0 - r2, 1e-6))
    return {"vif_max": float(min(max(vifs), 1000.0))}


def hopkins(X: np.ndarray, seed: int = 0) -> Dict[str, float]:
    """Hopkins clustering-tendency statistic — ~0.5 ⇒ uniform (no clusters),
    →1 ⇒ strongly clustered. The 'is there structure to compose on?' lens."""
    from sklearn.neighbors import NearestNeighbors

    if len(X) < 8:
        return {"hopkins": float("nan")}
    g = np.random.default_rng(seed)
    Xn = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-9)
    m = min(80, max(2, len(Xn) // 4))
    idx = g.choice(len(Xn), m, replace=False)
    nn = NearestNeighbors(n_neighbors=2).fit(Xn)
    uj = nn.kneighbors(Xn[idx], return_distance=True)[0][:, 1]
    rand = g.uniform(Xn.min(axis=0), Xn.max(axis=0), size=(m, Xn.shape[1]))
    wj = nn.kneighbors(rand, return_distance=True)[0][:, 0]
    denom = np.sum(wj) + np.sum(uj)
    return {"hopkins": float(np.sum(wj) / denom) if denom > 0 else 0.5}


def silhouette_by_k(X: np.ndarray, k_min: int = 2, k_max: int = 6) -> Dict[str, Any]:
    """Silhouette across k — the 'how many segments' lens (peak k = natural clusters)."""
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import StandardScaler

    if len(X) < k_max + 1:
        return {"silhouette_by_k": {}}
    Xs = StandardScaler().fit_transform(X)
    sil = {}
    for k in range(k_min, min(k_max, len(X) - 1) + 1):
        labels = KMeans(n_clusters=k, n_init=5, random_state=0).fit_predict(Xs)
        sil[str(k)] = round(float(silhouette_score(Xs, labels)), 3)
    best = max(sil, key=sil.get) if sil else None
    return {"silhouette_by_k": sil, "best_k": float(best) if best else float("nan")}


def scale_spread(X: np.ndarray) -> Dict[str, float]:
    """Ratio of largest to smallest feature std — the 'do I need scaling?' lens."""
    stds = X.std(axis=0)
    stds = stds[stds > 1e-9]
    if len(stds) < 2:
        return {"scale_spread": 1.0}
    return {"scale_spread": float(stds.max() / stds.min())}


def dispersion(y: np.ndarray) -> Dict[str, float]:
    """Variance/mean of a count target — the overdispersion lens (>>1 ⇒ NegBin over
    Poisson)."""
    ya = np.asarray(y, dtype=float)
    mean = float(ya.mean())
    return {"dispersion": float(ya.var() / mean) if mean > 1e-9 else float("nan"), "mean": mean}


def sparsity(X: np.ndarray) -> Dict[str, float]:
    """Fraction of zero entries — the 'is this interaction-matrix-shaped?' lens."""
    total = X.size
    return {"sparsity": float((X == 0).sum() / total) if total else 0.0}


def dimensionality(X: np.ndarray) -> Dict[str, float]:
    """n / p — the small-sample lens (low ⇒ gate out high-variance families)."""
    n, p = X.shape
    return {"n_rows": float(n), "n_features": float(p),
            "n_over_p": float(n / p) if p else float("nan")}


def seasonality_strength(y: np.ndarray, period: int = 12) -> Dict[str, float]:
    """Lag-`period` autocorrelation + trend slope — the forecasting lens."""
    ya = np.asarray(y, dtype=float)
    t = np.arange(len(ya))
    slope = float(np.polyfit(t, ya, 1)[0]) if len(ya) > 2 else float("nan")
    if len(ya) > 2 * period:
        a, b = ya[:-period], ya[period:]
        ac = float(np.corrcoef(a, b)[0, 1])
    else:
        ac = float("nan")
    return {"trend_slope": round(slope, 4), f"autocorr_lag{period}": round(ac, 3)}


def top_univariate_auc(X: np.ndarray, y: np.ndarray, feature_cols: List[str], top: int = 5) -> Dict[str, Any]:
    """Per-feature single-variable AUC — the 'is there any signal, and where' lens
    (also the honest performance-ceiling read)."""
    from sklearn.metrics import roc_auc_score

    yi = np.asarray([int(float(v)) for v in y])
    if len(np.unique(yi)) != 2:
        return {"top_univariate_auc": {}}
    aucs = {}
    for i, name in enumerate(feature_cols):
        try:
            aucs[name] = round(abs(roc_auc_score(yi, X[:, i]) - 0.5) + 0.5, 3)
        except ValueError:
            continue
    ranked = dict(sorted(aucs.items(), key=lambda kv: -kv[1])[:top])
    return {"top_univariate_auc": ranked,
            "max_univariate_auc": max(ranked.values()) if ranked else float("nan")}


def quick_cv_linear_vs_gbt(X: np.ndarray, y: np.ndarray) -> Dict[str, float]:
    """3-fold CV AUC of a linear model vs a GBT — the 'is the boundary non-linear?'
    lens (a small gap ⇒ commit linear; a large gap ⇒ the GBT earns its complexity)."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score
    from sklearn.preprocessing import StandardScaler

    yi = np.asarray([int(float(v)) for v in y])
    if len(np.unique(yi)) != 2 or len(yi) < 30:
        return {}
    try:
        lin = float(cross_val_score(LogisticRegression(max_iter=1000),
                                    StandardScaler().fit_transform(X), yi, cv=3, scoring="roc_auc").mean())
    except Exception:
        return {}
    out = {"cv_auc_linear": round(lin, 3)}
    try:
        from xgboost import XGBClassifier
        gbt = float(cross_val_score(XGBClassifier(n_estimators=120, max_depth=4, eval_metric="logloss",
                                                  n_jobs=4), X, yi, cv=3, scoring="roc_auc").mean())
        out["cv_auc_gbt"] = round(gbt, 3)
        out["gbt_minus_linear"] = round(gbt - lin, 3)
    except Exception:
        pass
    return out


# ---- dispatcher --------------------------------------------------------------

# lens name → (applicable-when, compute fn signature key). The route computes every
# lens whose required inputs are present, filtered by `lenses` when the caller names some.
_ALL_LENSES = [
    "class_balance", "censored_fraction", "vif_max", "hopkins", "silhouette_by_k",
    "scale_spread", "dispersion", "sparsity", "dimensionality", "seasonality_strength",
    "top_univariate_auc", "quick_cv_linear_vs_gbt",
]


def profile(columns: List[str], rows: List[List[Any]], feature_cols: List[str],
            target_col: Optional[str] = None, event_col: Optional[str] = None,
            duration_col: Optional[str] = None, value_col: Optional[str] = None,
            seasonal_period: int = 12, lenses: Optional[List[str]] = None) -> Dict[str, Any]:
    """Compute the requested lenses (or all applicable). Returns a flat stats dict.

    The Statistician sub-agent picks `lenses`; here we compute only what the provided
    columns support, so a caller can request a lens that doesn't apply without error.
    """
    want = set(lenses) if lenses else set(_ALL_LENSES)
    X = _matrix(columns, rows, feature_cols) if feature_cols else np.empty((len(rows), 0))
    stats: Dict[str, Any] = {}

    def add(name: str, fn):
        if name in want:
            try:
                stats.update(fn())
            except Exception as exc:  # a failed lens is reported, never fatal
                stats[f"{name}_error"] = str(exc)[:120]

    if X.shape[1] > 0:
        add("vif_max", lambda: vif_max(X, feature_cols))
        add("hopkins", lambda: hopkins(X))
        add("silhouette_by_k", lambda: silhouette_by_k(X))
        add("scale_spread", lambda: scale_spread(X))
        add("sparsity", lambda: sparsity(X))
        add("dimensionality", lambda: dimensionality(X))
    if target_col is not None:
        y = _col(columns, rows, target_col)
        add("class_balance", lambda: class_balance(y))
        add("dispersion", lambda: dispersion(y))
        if X.shape[1] > 0:
            add("top_univariate_auc", lambda: top_univariate_auc(X, y, feature_cols))
            add("quick_cv_linear_vs_gbt", lambda: quick_cv_linear_vs_gbt(X, y))
    if event_col is not None:
        ev = _col(columns, rows, event_col)
        dur = _col(columns, rows, duration_col) if duration_col else None
        add("censored_fraction", lambda: censored_fraction(ev, dur))
    if value_col is not None:
        add("seasonality_strength", lambda: seasonality_strength(_col(columns, rows, value_col), seasonal_period))
    return stats
