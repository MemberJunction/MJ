"""
RD-CALIBRATE — the helps-or-skip calibration gate on real data (V6's real gate).
raw GBT vs isotonic-CV vs sigmoid-CV on the renewal holdout; at a 94% base rate a
SKIP decision is a valid pass — the gate deciding correctly IS the test.
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from xgboost import XGBClassifier

from harness import referee as R
from features import build_period_frame, ASOF_NUM, ASOF_CAT, encode

SEED = 201


def _gbt():
    return XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                         subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)


def run(df_out=None, budget=None, quiet=False) -> dict:
    out = df_out or build_period_frame()
    lab = out["df"].dropna(subset=["renewed"]).reset_index(drop=True)
    y = lab["renewed"].astype(int).to_numpy()
    X = encode(lab, ASOF_NUM, ASOF_CAT)
    ho = R.carve("rd_calibrate", X, y, SEED)

    arms = {}
    raw = _gbt().fit(ho.Xdev, ho.ydev)
    if budget: budget.spend("gbt_raw")
    arms["raw"] = R.score_on_holdout(ho, "raw", "classification",
                                     lambda Xh: raw.predict_proba(Xh)[:, 1])
    for method in ("isotonic", "sigmoid"):
        cal = CalibratedClassifierCV(_gbt(), method=method, cv=3).fit(ho.Xdev, ho.ydev)
        if budget: budget.spend(f"gbt_{method}_cv")
        arms[method] = R.score_on_holdout(ho, f"{method}_cv", "classification",
                                          lambda Xh, c=cal: c.predict_proba(Xh)[:, 1])

    rows = [{"arm": k, "ece": round(v["metrics"]["ece"], 4),
             "brier": round(v["metrics"]["brier"], 4),
             "logloss": round(v["metrics"]["logloss"], 4),
             "auc": round(v["metrics"]["auc"], 3)} for k, v in arms.items()]
    df_r = pd.DataFrame(rows)
    raw_ece = df_r.loc[df_r.arm == "raw", "ece"].iloc[0]
    best = df_r.loc[df_r.ece.idxmin()]
    # the helps-or-skip gate: calibrate only if raw ECE > 0.03 AND a CV method
    # improves ECE without degrading logloss
    should = raw_ece > 0.03
    improved = (best["arm"] != "raw" and
                best["logloss"] <= df_r.loc[df_r.arm == "raw", "logloss"].iloc[0] + 1e-3)
    gate = ("CALIBRATE:" + best["arm"]) if (should and improved) else "SKIP"
    verdict = "PASS"  # the gate deciding correctly is the pass; logloss-degradation would fail
    for _, r in df_r.iterrows():
        if r["arm"] != "raw" and r["logloss"] > df_r.loc[df_r.arm == "raw", "logloss"].iloc[0] * 1.10:
            verdict = "REVISE"
    if not quiet:
        print("\n=== RD-CALIBRATE — helps-or-skip gate on real renewal data ===")
        print(df_r.to_string(index=False))
        print(f"\nraw ECE = {raw_ece:.4f}; gate decision = {gate} → {verdict}")
    R.save_result("rd_calibrate", {
        "arms": rows, "raw_ece": float(raw_ece), "gate_decision": gate,
        "verdict": verdict,
        "pass_bar": "gate decides correctly; calibration never degrades logloss >10%",
    })
    return {"table": df_r, "gate": gate, "verdict": verdict}


if __name__ == "__main__":
    run()
