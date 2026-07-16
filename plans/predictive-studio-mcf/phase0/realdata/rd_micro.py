"""
RD-MICRO — the report-grade micro-arms (A6.8, no pass bars):
  (a) does the Block-6 gate's advice actually help HERE? class-weighted vs default
      GBT at the real 94/6 base rate, PR-AUC(lapse) compared
  (b) missingness policy: sentinel(-1/9999) vs median-impute vs median+indicator
  (c) verdict-stability was measured inside rd_reason (S1 repeat) — referenced only
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score
from xgboost import XGBClassifier

from harness import referee as R
from features import build_period_frame, ASOF_NUM, ASOF_CAT, encode

SEEDS = [201, 202, 203]
SENTINELS = {"event_recency_days": 9999.0, "order_recency_days": 9999.0}


def _gbt(**kw):
    return XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                         subsample=0.9, eval_metric="logloss", n_jobs=4,
                         random_state=0, **kw)


def run():
    out = build_period_frame()
    lab = out["df"].dropna(subset=["renewed"]).reset_index(drop=True)
    y = lab["renewed"].astype(int).to_numpy()

    rows_w, rows_m = [], []
    for seed in SEEDS:
        g = np.random.default_rng(seed)
        idx = np.arange(len(lab)); g.shuffle(idx)
        cut = int(len(lab) * 0.7); dev, hold = idx[:cut], idx[cut:]

        # (a) class weighting
        X = encode(lab, ASOF_NUM, ASOF_CAT)
        spw = float((y[dev] == 1).sum() / max((y[dev] == 0).sum(), 1))
        for arm, kw in (("default", {}), ("class_weighted", {"scale_pos_weight": 1 / spw})):
            m = _gbt(**kw).fit(X.iloc[dev], y[dev])
            p = m.predict_proba(X.iloc[hold])[:, 1]
            rows_w.append({"seed": seed, "arm": arm,
                           "auc": round(roc_auc_score(y[hold], p), 3),
                           "prauc_lapse": round(average_precision_score(1 - y[hold], 1 - p), 3)})

        # (b) missingness policy on the sentinel-carrying recency columns
        variants = {}
        Xs = encode(lab, ASOF_NUM, ASOF_CAT)                      # sentinel as-built
        variants["sentinel"] = Xs
        Xm = Xs.copy()
        for c, s in SENTINELS.items():
            med = Xm.loc[Xm.index[dev], c].replace(s, np.nan).median()
            Xm[c] = Xm[c].replace(s, med)
        variants["median"] = Xm
        Xi = Xm.copy()
        for c, s in SENTINELS.items():
            Xi[c + "_missing"] = (Xs[c] == s).astype(int)
        variants["median_plus_indicator"] = Xi
        for arm, Xv in variants.items():
            m = _gbt().fit(Xv.iloc[dev], y[dev])
            p = m.predict_proba(Xv.iloc[hold])[:, 1]
            rows_m.append({"seed": seed, "arm": arm,
                           "auc": round(roc_auc_score(y[hold], p), 3),
                           "prauc_lapse": round(average_precision_score(1 - y[hold], 1 - p), 3)})

    dw = pd.DataFrame(rows_w).groupby("arm")[["auc", "prauc_lapse"]].mean().round(3)
    dm = pd.DataFrame(rows_m).groupby("arm")[["auc", "prauc_lapse"]].mean().round(3)
    print("\n=== RD-MICRO (report-grade; no pass bars) ===")
    print("\n(a) class weighting at the real 94/6 base rate (mean of 3 seeds):")
    print(dw.to_string())
    print("\n(b) missingness policy on sentinel recency columns (mean of 3 seeds):")
    print(dm.to_string())
    print("\n(c) verdict stability: measured in rd_reason (S1 repeat, same context → same verdict)")

    R.save_result("rd_micro", {
        "class_weighting": dw.reset_index().to_dict("records"),
        "missingness": dm.reset_index().to_dict("records"),
        "note": "report-grade; informs the bank/gate wisdom claim + the hadData presence-mask design",
    })


if __name__ == "__main__":
    run()
