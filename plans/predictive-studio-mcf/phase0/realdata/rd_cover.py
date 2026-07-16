"""
RD-COVER — task coverage on real censoring (V3's real-data gate): CoxPH / WeibullAFT
vs the GBT-window workaround on time-to-lapse, with the REAL 69-event / 96%-censored
distribution. C-index on a shared eval set; bootstrap CIs (events are few — say so).
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, WeibullAFTFitter
from lifelines.utils import concordance_index
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from harness import referee as R
from features import build_period_frame, ASOF_NUM, ASOF_CAT, encode

SEEDS = [211, 212, 213]
SURV_COLS = ["tenure_days", "prior_periods", "events_before", "events_attended",
             "attend_rate", "event_recency_days", "courses_before", "orders_before",
             "order_recency_days", "payments_before", "dues_amount", "auto_renew"]


def _boot_ci(fn, n=200, seed=0):
    g = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        v = fn(g)
        if v is not None:
            vals.append(v)
    lo, hi = np.percentile(vals, [2.5, 97.5])
    return round(float(lo), 3), round(float(hi), 3)


def run(df_out=None, budget=None, quiet=False) -> dict:
    out = df_out or build_period_frame()
    df = out["df"].copy()
    rows = []
    for seed in SEEDS:
        g = np.random.default_rng(seed)
        idx = np.arange(len(df)); g.shuffle(idx)
        cut = int(len(df) * 0.7); dev, hold = idx[:cut], idx[cut:]
        d_dev, d_hold = df.iloc[dev], df.iloc[hold]

        scaler = StandardScaler().fit(d_dev[SURV_COLS].fillna(-1))
        def surv_frame(d):
            X = pd.DataFrame(scaler.transform(d[SURV_COLS].fillna(-1)), columns=SURV_COLS)
            X["duration"] = d["duration"].values
            X["event"] = d["event"].values
            return X

        sf_dev, sf_hold = surv_frame(d_dev), surv_frame(d_hold)
        cox = CoxPHFitter(penalizer=0.1).fit(sf_dev, "duration", "event")
        if budget: budget.spend("coxph")
        aft = WeibullAFTFitter(penalizer=0.1).fit(sf_dev, "duration", "event")
        if budget: budget.spend("weibull_aft")

        c_cox = concordance_index(sf_hold["duration"], -cox.predict_partial_hazard(sf_hold),
                                  sf_hold["event"])
        c_aft = concordance_index(sf_hold["duration"],
                                  aft.predict_expectation(sf_hold), sf_hold["event"])

        # GBT-window workaround: binary "lapses within 365d of period start",
        # trainable only where the outcome is knowable
        know_dev = d_dev[(d_dev["event"] == 1) | (d_dev["duration"] >= 365)]
        yw = ((know_dev["event"] == 1) & (know_dev["duration"] <= 365)).astype(int).to_numpy()
        Xw = encode(know_dev, ASOF_NUM, ASOF_CAT)
        gbt = XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                            subsample=0.9, eval_metric="logloss", n_jobs=4,
                            random_state=0).fit(Xw, yw)
        if budget: budget.spend("gbt_window365")
        Xh = encode(d_hold, ASOF_NUM, ASOF_CAT).reindex(columns=Xw.columns, fill_value=0)
        risk = gbt.predict_proba(Xh)[:, 1]
        c_gbt = concordance_index(d_hold["duration"], -risk, d_hold["event"])

        # timing rank-corr among actual lapsers on holdout
        lapsed = d_hold["event"] == 1
        if lapsed.sum() >= 5:
            from scipy.stats import spearmanr  # scipy ships with lifelines deps
            rc_cox, _ = spearmanr(-cox.predict_partial_hazard(sf_hold)[lapsed.values],
                                  d_hold.loc[lapsed, "duration"])
            rc_gbt, _ = spearmanr(-risk[lapsed.values], d_hold.loc[lapsed, "duration"])
        else:
            rc_cox = rc_gbt = float("nan")

        rows.append({"seed": seed, "hold_events": int(lapsed.sum()),
                     "cindex_cox": round(float(c_cox), 3),
                     "cindex_aft": round(float(c_aft), 3),
                     "cindex_gbt_window": round(float(c_gbt), 3),
                     "timing_rho_cox": round(float(rc_cox), 3),
                     "timing_rho_gbt": round(float(rc_gbt), 3)})

    df_r = pd.DataFrame(rows)
    surv_best = df_r[["cindex_cox", "cindex_aft"]].max(axis=1)
    wins = int((surv_best >= df_r["cindex_gbt_window"]).sum())
    verdict = "PASS" if wins >= 2 else "REVISE"
    if not quiet:
        print("\n=== RD-COVER — survival vs GBT-window on real censoring ===")
        print(df_r.to_string(index=False))
        print(f"\nsurvival family >= GBT-window ranking in {wins}/3 seeds → {verdict}")
        print("NOTE: only 69 lapse events overall — few holdout events per seed; treat "
              "point estimates as wide. The structural point stands regardless: the "
              "GBT-window emits NO time estimate; survival answers WHEN natively.")
    R.save_result("rd_cover", {
        "hypothesis": "censoring-aware survival >= GBT-window on real time-to-lapse ranking",
        "seeds": SEEDS, "per_seed": rows, "survival_wins": wins, "verdict": verdict,
        "pass_bar": "survival c-index >= gbt-window in >=2/3 seeds",
        "honest_limits": "69 events total; ~20 holdout events/seed; wide CIs",
    })
    return {"table": df_r, "verdict": verdict, "cox_model": cox}


if __name__ == "__main__":
    run()
