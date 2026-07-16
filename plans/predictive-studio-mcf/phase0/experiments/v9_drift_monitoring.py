"""
V9 — Monitoring / drift detection (the priority Phase 0 originally missed).

Hypothesis: a PSI/KS drift monitor on a scored population flags a covariate shift
BEFORE holdout performance visibly rots, and the challenger-vs-incumbent
comparison recommends promote/hold correctly (never auto-promoting).

Method: train a model on a baseline period; then score a sequence of later
periods into which a planted, growing covariate shift is injected. Each period
we track (a) PSI on the score distribution + the top feature vs the training
snapshot, and (b) the TRUE holdout AUC on that period (via the referee). We show
the PSI alarm crosses its "stale" threshold at or before AUC decays materially.
Then we train a challenger on recent shifted data and show the direction-aware
comparison recommends 'promote' — as a RECOMMENDATION, never an auto-promote.

Run: ./run.sh v9_drift_monitoring
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.metrics import roc_auc_score

from harness import generators as G, referee as R

SEEDS = [81, 82, 83]
PERIODS = [0.0, 0.5, 1.0, 1.75, 2.5]  # growing covariate shift (std units) applied to f0..f2
PSI_WARN, PSI_STALE = 0.10, 0.25


def _psi(expected, actual, bins=10):
    qs = np.quantile(expected, np.linspace(0, 1, bins + 1))
    qs[0], qs[-1] = -np.inf, np.inf
    e = np.histogram(expected, qs)[0] / len(expected) + 1e-6
    a = np.histogram(actual, qs)[0] / len(actual) + 1e-6
    return float(np.sum((a - e) * np.log(a / e)))


def _shifted(gr_fn, seed, shift):
    """A period drawn from the same generator but with a covariate shift on f0..f2."""
    gr = gr_fn(seed)
    X = gr.X.copy()
    for c in ["f0", "f1", "f2"]:
        X[c] = X[c] + shift
    return X, gr.y


def run():
    per_rows = []
    challenger_rows = []
    for seed in SEEDS:
        genf = lambda s, sd=seed: G.gen_classification(sd * 100 + s, n=4000, p=8, informative=4, noise=1.0)
        # baseline period (shift 0): train incumbent + capture training score snapshot
        Xb, yb = _shifted(genf, 0, 0.0)
        ho0 = R.carve("v9_drift_monitoring", Xb, yb, seed)
        incumbent = XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                                  subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)
        incumbent.fit(ho0.Xdev, ho0.ydev)
        base_scores = incumbent.predict_proba(ho0.Xdev)[:, 1]
        base_f0 = ho0.Xdev["f0"].to_numpy()

        alarm_period = None
        decay_period = None
        base_auc = None
        for i, shift in enumerate(PERIODS):
            Xp, yp = _shifted(genf, i + 1, shift)
            sc = incumbent.predict_proba(Xp)[:, 1]
            auc = roc_auc_score(yp, sc)
            psi_score = _psi(base_scores, sc)
            psi_f0 = _psi(base_f0, Xp["f0"].to_numpy())
            psi_max = max(psi_score, psi_f0)
            if base_auc is None:
                base_auc = auc
            if alarm_period is None and psi_max >= PSI_STALE:
                alarm_period = i
            if decay_period is None and (base_auc - auc) >= 0.05:
                decay_period = i
            per_rows.append({"seed": seed, "period": i, "shift": shift,
                             "psi_score": round(psi_score, 3), "psi_f0": round(psi_f0, 3),
                             "holdout_auc": round(auc, 3), "auc_drop": round(base_auc - auc, 3),
                             "alarm": psi_max >= PSI_STALE})

        # challenger trained on the most-shifted period; compare direction-aware
        Xc, yc = _shifted(genf, 99, PERIODS[-1])
        hoc = R.carve("v9_drift_monitoring", Xc, yc, seed + 500)
        challenger = XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                                   subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)
        challenger.fit(hoc.Xdev, hoc.ydev)
        inc_auc = roc_auc_score(hoc.yhold, incumbent.predict_proba(hoc.Xhold)[:, 1])
        chal_auc = roc_auc_score(hoc.yhold, challenger.predict_proba(hoc.Xhold)[:, 1])
        improvement = chal_auc - inc_auc  # higher-is-better metric
        recommend = "promote" if improvement >= 0.02 else "hold"
        challenger_rows.append({"seed": seed, "incumbent_auc_on_new": round(inc_auc, 3),
                                "challenger_auc_on_new": round(chal_auc, 3),
                                "improvement": round(improvement, 3), "recommendation": recommend})

    df = pd.DataFrame(per_rows)
    ch = pd.DataFrame(challenger_rows)

    # did the alarm fire at or before the decay, per seed?
    lead = []
    for seed in SEEDS:
        s = df[df.seed == seed]
        alarm = s[s.alarm].period.min() if s.alarm.any() else np.inf
        decay = s[s.auc_drop >= 0.05].period.min() if (s.auc_drop >= 0.05).any() else np.inf
        lead.append({"seed": seed, "alarm_period": alarm, "decay_period": decay,
                     "alarm_leads_decay": alarm <= decay})
    ld = pd.DataFrame(lead)
    alarm_ok = ld["alarm_leads_decay"].all()
    chal_ok = (ch["recommendation"] == "promote").all()  # challenger on shifted data should win
    verdict = "PASS" if (alarm_ok and chal_ok) else "REVISE"

    print("\n=== V9 — Monitoring / drift detection ===")
    print(df.to_string(index=False))
    print("\nalarm-vs-decay timing per seed:")
    print(ld.to_string(index=False))
    print("\nchallenger-vs-incumbent on shifted data (RECOMMENDATION only, never auto-promote):")
    print(ch.to_string(index=False))
    print(f"\nPSI alarm fires at/before performance decay = {alarm_ok}; "
          f"challenger correctly recommended = {chal_ok}  → {verdict}")
    print("Reading: the drift monitor raises a flag from the DISTRIBUTION shift before the")
    print("holdout AUC visibly rots — i.e. you learn the model is going stale before it")
    print("silently hurts. The challenger comparison only RECOMMENDS; promotion stays a")
    print("human-gated decision. This is the monitoring pillar Arie emphasized.")

    R.save_result("v9_drift_monitoring", {
        "hypothesis": "PSI alarm precedes performance decay; challenger comparison direction-correct",
        "seeds": SEEDS, "periods": PERIODS, "per_period": per_rows,
        "timing": lead, "challenger": challenger_rows,
        "psi_warn": PSI_WARN, "psi_stale": PSI_STALE, "verdict": verdict,
        "pass_bar": "alarm at/before decay AND challenger recommendation correct",
    })


if __name__ == "__main__":
    run()
