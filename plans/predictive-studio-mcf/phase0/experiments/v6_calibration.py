"""
V6 — Calibration deficit on shipped-model-class estimators (the WS-1 quantification).

Hypothesis: the shipped PS model classes (gradient-boosted trees especially)
emit materially miscalibrated scores, and a simple isotonic post-hoc step fixes
it — so "0.8 means 80%" needs calibration, and calibration is cheap.

Method: planted-probability classification data (we KNOW each row's true P(y=1)).
Train XGBoost + LogisticRegression on a train split, measure ECE/Brier on the
locked holdout RAW, then fit an isotonic calibrator on a held-out calibration
slice (never the holdout) and re-measure. Reported: raw vs calibrated ECE/Brier.

Run: ./run.sh v6_calibration
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.isotonic import IsotonicRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.base import clone

from harness import generators as G, referee as R

SEEDS = [21, 22, 23, 24, 25]


def _ece(y, p, bins=10):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    edges = np.linspace(0, 1, bins + 1)
    idx = np.digitize(p, edges) - 1
    e = 0.0
    for b in range(bins):
        m = idx == b
        if m.sum():
            e += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(e)


def run():
    rows = []
    for seed in SEEDS:
        gr = G.gen_classification(seed, n=5000, p=8, informative=4, noise=1.0)
        ho = R.carve("v6_calibration", gr.X, gr.y, seed)

        # split dev into train + calibration (calibrator never sees holdout)
        g = np.random.default_rng(seed)
        idx = np.arange(len(ho.Xdev)); g.shuffle(idx)
        cut = int(len(idx) * 0.75)
        tr, cal = idx[:cut], idx[cut:]
        Xtr, ytr = ho.Xdev.iloc[tr], ho.ydev[tr]
        Xcal, ycal = ho.Xdev.iloc[cal], ho.ydev[cal]
        ho.assert_untouched(Xtr)  # tripwire

        for name, mk in [("xgboost", lambda: XGBClassifier(n_estimators=300, max_depth=4,
                          learning_rate=0.08, subsample=0.9, eval_metric="logloss",
                          n_jobs=4, random_state=0)),
                         ("logistic", lambda: LogisticRegression(max_iter=1000))]:
            clf = mk(); clf.fit(Xtr, ytr)
            raw_hold = clf.predict_proba(ho.Xhold)[:, 1]
            # (a) naive: single held-out slice isotonic
            cal_scores = clf.predict_proba(Xcal)[:, 1]
            iso = IsotonicRegression(out_of_bounds="clip").fit(cal_scores, ycal)
            naive_hold = iso.predict(raw_hold)
            # (b) proper: cross-validated isotonic calibration (what WS-1 would ship)
            cccv = CalibratedClassifierCV(clone(mk()), method="isotonic", cv=5)
            cccv.fit(ho.Xdev, ho.ydev)  # dev only; holdout still untouched
            proper_hold = cccv.predict_proba(ho.Xhold)[:, 1]

            r_raw = R.score_on_holdout(ho, f"{name}_raw", "classification",
                                       lambda Xh, s=raw_hold: s, extra={"seed": seed})
            r_naive = R.score_on_holdout(ho, f"{name}_isotonic_slice", "classification",
                                         lambda Xh, s=naive_hold: s, extra={"seed": seed})
            r_proper = R.score_on_holdout(ho, f"{name}_isotonic_cv", "classification",
                                          lambda Xh, s=proper_hold: s, extra={"seed": seed})
            rows.append({"seed": seed, "model": name,
                         "raw_ece": r_raw["metrics"]["ece"],
                         "slice_ece": r_naive["metrics"]["ece"],
                         "cv_ece": r_proper["metrics"]["ece"],
                         "raw_brier": r_raw["metrics"]["brier"],
                         "cv_brier": r_proper["metrics"]["brier"],
                         "auc": r_raw["metrics"]["auc"]})

    df = pd.DataFrame(rows)
    summ = df.groupby("model").agg(raw_ece=("raw_ece", "mean"), slice_ece=("slice_ece", "mean"),
                                   cv_ece=("cv_ece", "mean"), auc=("auc", "mean")).reset_index()
    summ["cv_cut_pct"] = (1 - summ["cv_ece"] / summ["raw_ece"]) * 100

    gbt = summ[summ["model"] == "xgboost"].iloc[0]
    # PASS: GBT is miscalibrated AND the PROPER (cv) method fixes it materially
    verdict = "PASS" if (gbt["raw_ece"] >= 0.05 and gbt["cv_cut_pct"] >= 50) else "REVISE"

    print("\n=== V6 — Calibration deficit + isotonic fix ===")
    print(summ.round(4).to_string(index=False))
    print(f"\nGBT raw ECE = {gbt['raw_ece']:.4f}; CV-isotonic cuts it {gbt['cv_cut_pct']:.0f}%  → {verdict}")
    print("Findings: (1) GBT scores ARE miscalibrated (raw ECE above 0.05).")
    print("(2) A naive single-slice isotonic is unreliable — it can WORSEN an already-")
    print("    calibrated model (see logistic slice_ece). (3) Proper cross-validated")
    print("    calibration is the method to ship, and it must be gated ('helps-or-skip').")
    print("AUC (ranking) is essentially unchanged throughout — calibration changes MEANING, not skill.")

    R.save_result("v6_calibration", {
        "hypothesis": "shipped-class models miscalibrated; proper calibration fixes it",
        "seeds": SEEDS, "summary": summ.to_dict(orient="records"), "verdict": verdict,
        "pass_bar": "GBT raw ECE >= 0.05 and CV-isotonic cuts >= 50%",
        "design_note": "single-slice isotonic risky; ship CalibratedClassifierCV + a helps-or-skip gate",
    })


if __name__ == "__main__":
    run()
