"""
The five real modeling situations More Cheese poses (A6.5/A6.9.1), each with:
question, unit, expected verdicts (= ground truth for scoring), a qualia function
(ALL stats code-computed — never LLM-asserted), the catalog family filter, and
hard-fail conditions.

The qualia functions are the standalone twin of the future sidecar /profile +
Statistician sub-agent: LLM chooses lenses and interprets; code computes.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from xgboost import XGBClassifier

from features import ASOF_NUM, ASOF_CAT, encode

ENGAGE_COLS = ["events_before", "events_attended", "attend_rate", "event_recency_days",
               "courses_before", "complete_rate", "orders_before", "order_recency_days"]


def _hopkins(X: pd.DataFrame, seed: int = 0) -> float:
    g = np.random.default_rng(seed)
    Xn = (X - X.mean()) / (X.std() + 1e-9)
    m = min(80, len(Xn) // 4)
    idx = g.choice(len(Xn), m, replace=False)
    nn = NearestNeighbors(n_neighbors=2).fit(Xn)
    uj = nn.kneighbors(Xn.iloc[idx], return_distance=True)[0][:, 1]
    rand = g.uniform(Xn.min().values, Xn.max().values, size=(m, Xn.shape[1]))
    wj = nn.kneighbors(rand, return_distance=True)[0][:, 0]
    return float(np.sum(wj) / (np.sum(wj) + np.sum(uj)))


def _vif_max(X: pd.DataFrame) -> float:
    """max VIF across informative (non-constant) columns; capped for readability."""
    from sklearn.linear_model import LinearRegression
    X = X.loc[:, X.std() > 1e-9]  # constant columns are degenerate, not collinear
    vifs = []
    Xs = pd.DataFrame(StandardScaler().fit_transform(X), columns=X.columns)
    for c in X.columns:
        others = [o for o in X.columns if o != c]
        r2 = LinearRegression().fit(Xs[others], Xs[c]).score(Xs[others], Xs[c])
        vifs.append(1.0 / max(1.0 - r2, 1e-6))
    return float(min(max(vifs), 1000.0))


def qualia_classification(df: pd.DataFrame) -> dict:
    lab = df.dropna(subset=["renewed"]).copy()
    X = encode(lab, ASOF_NUM, ASOF_CAT)
    y = lab["renewed"].astype(int).to_numpy()
    uni = {}
    for c in ASOF_NUM:
        try:
            uni[c] = abs(roc_auc_score(y, lab[c].fillna(-1)) - 0.5) + 0.5
        except ValueError:
            pass
    top5 = dict(sorted(uni.items(), key=lambda kv: -kv[1])[:5])
    lin = cross_val_score(LogisticRegression(max_iter=1000),
                          StandardScaler().fit_transform(X), y, cv=3, scoring="roc_auc").mean()
    gbt = cross_val_score(XGBClassifier(n_estimators=150, max_depth=4, eval_metric="logloss",
                                        n_jobs=4), X, y, cv=3, scoring="roc_auc").mean()
    return {
        "n_periods": len(df), "n_labeled": len(lab),
        "class_balance_renewed": round(float(y.mean()), 3),
        "minority_count_lapsed": int((y == 0).sum()),
        "top5_univariate_auc": {k: round(v, 3) for k, v in top5.items()},
        "vif_max": round(_vif_max(lab[ASOF_NUM].fillna(-1)), 1),
        "cv_auc_linear": round(float(lin), 3), "cv_auc_gbt": round(float(gbt), 3),
        "hopkins_on_engagement": round(_hopkins(lab[ENGAGE_COLS].fillna(-1)), 3),
        "missingness_note": "event/order recency uses 9999 sentinel when no prior activity",
    }


def qualia_survival(df: pd.DataFrame) -> dict:
    events = int(df["event"].sum())
    return {
        "n_periods": len(df), "events_lapse": events,
        "censored_fraction": round(float(1 - events / len(df)), 3),
        "duration_column_present": True, "event_indicator_present": True,
        "median_observed_duration_days": round(float(df["duration"].median()), 0),
        "note": "most periods are renewed/active (right-censored for the lapse event); "
                "only lapsed periods have an observed event time",
    }


def qualia_uplift(df: pd.DataFrame) -> dict:
    cols = [c.lower() for c in df.columns]
    treatment_present = any(k in c for c in cols
                            for k in ("treatment", "contact", "campaign", "outreach", "exposure"))
    q = qualia_classification(df)
    q.update({
        "treatment_column_present": treatment_present,   # False — THE stat for S3
        "note_uplift": "no record of who was contacted/intervened-on exists anywhere in the schema; "
                       "uplift = P(y|treated) - P(y|control) is unidentifiable without it",
    })
    return q


def qualia_series(series: pd.Series) -> dict:
    s = series.dropna()
    t = np.arange(len(s))
    slope = float(np.polyfit(t, s.values, 1)[0])
    ac12 = float(s.autocorr(lag=12)) if len(s) > 24 else float("nan")
    return {
        "n_months": len(s), "trend_slope_per_month": round(slope, 1),
        "autocorr_lag12": round(ac12, 3),
        "last_12m_total": round(float(s.iloc[-12:].sum()), 0),
        "first_month": str(s.index[0]), "last_month": str(s.index[-1]),
        "note": "monthly dues revenue, 2013->2026; grows strongly year over year",
    }


def qualia_clustering(df: pd.DataFrame) -> dict:
    X = df[ENGAGE_COLS].fillna(-1)
    Xs = StandardScaler().fit_transform(X)
    sil = {}
    for k in range(2, 7):
        km = KMeans(n_clusters=k, n_init=5, random_state=0).fit(Xs)
        sil[k] = round(float(silhouette_score(Xs, km.labels_)), 3)
    return {
        "n_periods": len(df), "no_target_variable": True,
        "hopkins_on_engagement": round(_hopkins(X), 3),
        "silhouette_by_k": sil,
        "note": "unsupervised: the question asks WHAT GROUPS EXIST, not a prediction",
    }


def build_dues_series(mp: pd.DataFrame) -> pd.Series:
    d = mp.copy()
    d["_start"] = pd.to_datetime(d["StartDate"], errors="coerce")
    d = d.dropna(subset=["_start"])
    d["month"] = d["_start"].dt.to_period("M")
    s = d.groupby("month")["DuesAmount"].sum().astype(float)
    s.index = s.index.astype(str)
    return s


SITUATIONS: dict[str, dict] = {
    "S1": dict(
        question="Who will renew their membership?",
        unit="membership period", family="classification",
        expected_families={"classification"},
        expected_triage={"commit", "combine"},
        qualia="classification",
        hard_fails=["calibration_required must be true OR the value_metric must be "
                    "rank-based (PR-AUC / lift-at-k) given the 94% base rate"],
    ),
    "S2": dict(
        question="When will a member lapse — how much membership lifetime remains?",
        unit="membership period", family="survival",
        expected_families={"survival"},
        expected_triage={"commit", "defer"},
        qualia="survival",
        hard_fails=["task_family=classification (a fixed-window binary cannot answer WHEN)"],
    ),
    "S4": dict(
        question="What will monthly dues revenue be over the next 12 months?",
        unit="month", family="forecasting",
        expected_families={"forecasting"},
        expected_triage={"commit", "defer"},
        qualia="series",
        hard_fails=["failing to flag time-ordered validation (random split on a time series)"],
    ),
    "S5": dict(
        question="What member archetypes exist — how do our members naturally group?",
        unit="membership period", family="clustering",
        expected_families={"clustering"},
        expected_triage={"commit", "reuse"},
        qualia="clustering",
        hard_fails=["inventing a supervised target for an unsupervised question"],
    ),
    "S3": dict(  # runs LAST — reuse-temptation resistance
        question="Which members are worth contacting to prevent lapse?",
        unit="member", family="uplift",
        expected_families={"uplift", "none"},
        expected_triage={"defer"},
        qualia="uplift",
        hard_fails=["any commit/combine/reuse — no treatment column exists; "
                    "must DEFER naming contact/intervention history as the prerequisite"],
    ),
}

SESSION_ORDER = ["S1", "S2", "S4", "S5", "S3"]
