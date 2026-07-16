"""
V7 — Aggregation leakage reproduction (the Featuretools grave; the as-of bet).

Hypothesis: naive relational aggregates (no time cutoff) inflate a model's
apparent performance and then collapse under a temporally-honest evaluation;
as-of aggregates (events <= decision date) do not.

Method: planted event-log data where post-decision events correlate with the
label (churned members stop generating events). Two feature-assembly arms feed
the SAME GBT and the SAME locked holdout:
  NAIVE — aggregate over ALL events (leaks the future)
  AS-OF — aggregate only events on/before each entity's decision day

We report each arm's holdout AUC. The leak shows up as the NAIVE arm scoring
far above the honest AS-OF arm — apparent skill that is really future-peeking.

Run: ./run.sh v7_aggregation_leakage
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from xgboost import XGBClassifier

from harness import generators as G, referee as R

SEEDS = [11, 12, 13, 14, 15]


def _aggregate(entities: pd.DataFrame, events: pd.DataFrame, as_of: bool) -> pd.DataFrame:
    """Build one feature row per entity. as_of=True clips events to the decision day."""
    feats = []
    ev_by_ent = {e: g for e, g in events.groupby("entity")}
    for _, row in entities.iterrows():
        e = row["entity"]
        g = ev_by_ent.get(e, None)
        if g is not None and as_of:
            g = g[g["day"] <= row["decision_day"]]
        if g is None or len(g) == 0:
            feats.append({"ev_count": 0, "ev_amount_sum": 0.0, "ev_amount_mean": 0.0,
                          "ev_recency": row["tenure_days"], "tenure_days": row["tenure_days"]})
            continue
        feats.append({
            "ev_count": len(g),
            "ev_amount_sum": float(g["amount"].sum()),
            "ev_amount_mean": float(g["amount"].mean()),
            "ev_recency": float(row["decision_day"] - g["day"].max()) if as_of else float(row["tenure_days"] - 0),
            "tenure_days": row["tenure_days"],
        })
    return pd.DataFrame(feats)


def _fit_predict(Xdev, ydev, Xhold):
    clf = XGBClassifier(n_estimators=200, max_depth=4, learning_rate=0.1,
                        subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)
    clf.fit(Xdev, ydev)
    return clf.predict_proba(Xhold)[:, 1]


def run():
    rows = []
    for seed in SEEDS:
        gr = G.gen_event_log(seed, n_entities=3000)
        entities, events, y = gr.X, gr.truth["events"], gr.y

        naive = _aggregate(entities, events, as_of=False)
        asof = _aggregate(entities, events, as_of=True)

        # one holdout split (by entity), shared across arms
        ho_naive = R.carve("v7_aggregation_leakage", naive, y, seed)
        # rebuild the SAME split indices for the as-of matrix by re-carving with same seed
        ho_asof = R.carve("v7_aggregation_leakage", asof, y, seed)

        r_naive = R.score_on_holdout(ho_naive, "naive_all_events", "classification",
                                     lambda Xh: _fit_predict(ho_naive.Xdev, ho_naive.ydev, Xh),
                                     extra={"seed": seed})
        r_asof = R.score_on_holdout(ho_asof, "asof_cutoff", "classification",
                                    lambda Xh: _fit_predict(ho_asof.Xdev, ho_asof.ydev, Xh),
                                    extra={"seed": seed})
        rows.append({"seed": seed,
                     "naive_auc": r_naive["metrics"]["auc"],
                     "asof_auc": r_asof["metrics"]["auc"],
                     "gap": r_naive["metrics"]["auc"] - r_asof["metrics"]["auc"]})

    df = pd.DataFrame(rows)
    naive_mean = df["naive_auc"].mean()
    asof_mean = df["asof_auc"].mean()
    gap_mean = df["gap"].mean()

    # PASS: naive arm materially inflated over the honest as-of arm (leak reproduced)
    verdict = "PASS" if gap_mean >= 0.05 else "REVISE"

    print("\n=== V7 — Aggregation leakage (Featuretools grave) ===")
    print(df.round(4).to_string(index=False))
    print(f"\nnaive AUC (leaky)  mean = {naive_mean:.4f}")
    print(f"as-of AUC (honest) mean = {asof_mean:.4f}")
    print(f"inflation gap      mean = {gap_mean:.4f}   → {verdict}")
    print("Reading: the naive 'aggregate everything' feature set looks better ONLY")
    print("because it peeks at post-decision events; as-of assembly removes the peek.")

    R.save_result("v7_aggregation_leakage", {
        "hypothesis": "naive aggregation leaks the future; as-of does not",
        "seeds": SEEDS, "per_seed": rows,
        "naive_auc_mean": naive_mean, "asof_auc_mean": asof_mean,
        "inflation_gap_mean": gap_mean, "verdict": verdict,
        "pass_bar": "inflation gap >= 0.05",
    })


if __name__ == "__main__":
    run()
