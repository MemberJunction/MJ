"""
V5 — Reproduce p-hacking (leaderboard overfitting) AND contain it with the locked holdout.

Hypothesis:
  (a) An agent/search that iterates freely against a VISIBLE validation set will
      overfit it — reporting a good number on pure noise (the AutoML leaderboard
      failure, multiple-comparisons overfitting).
  (b) The mechanical locked holdout (scored once, never used for selection) fully
      contains the damage — it reports the honest ~0.5 on noise.

Method: the multiple-comparisons SEARCH is itself the p-hacking mechanism, so we
reproduce it deterministically with a 200-config random search (feature subsets +
hyperparameters) that keeps the best-on-validation config — exactly what an agent
tuning against a visible score does (an LLM agent would do the same or worse, as
it can also rationalize). Datasets: pure-noise (true AUC 0.5) and weak-signal.
Arm A = best validation AUC found (what a p-hacker would report). Arm B = that
same config's score on the locked holdout (what's true).

Run: ./run.sh v5_phacking
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

SEEDS = [41, 42, 43, 44, 45]
N_CONFIGS = 400
VAL_SIZE = 120  # small validation set: where multiple-comparisons p-hacking bites hardest
                # (realistic for association-scale data + aggressive tuning)


def _search(Xtr, ytr, Xval, yval, all_cols, seed):
    """Random-config search that KEEPS the best-on-validation config (the p-hack)."""
    g = np.random.default_rng(seed)
    best = {"val_auc": -1, "cfg": None}
    crossed_060 = 0
    for _ in range(N_CONFIGS):
        k = g.integers(3, len(all_cols) + 1)
        cols = list(g.choice(all_cols, size=k, replace=False))
        depth = int(g.integers(2, 6)); est = int(g.choice([50, 100, 200]))
        lr = float(g.choice([0.05, 0.1, 0.2]))
        clf = XGBClassifier(n_estimators=est, max_depth=depth, learning_rate=lr,
                            subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)
        clf.fit(Xtr[cols], ytr)
        va = roc_auc_score(yval, clf.predict_proba(Xval[cols])[:, 1])
        if va >= 0.60:
            crossed_060 += 1
        if va > best["val_auc"]:
            best = {"val_auc": va, "cfg": (cols, depth, est, lr)}
    return best, crossed_060


def _fit_best(Xtr, ytr, cfg):
    cols, depth, est, lr = cfg
    clf = XGBClassifier(n_estimators=est, max_depth=depth, learning_rate=lr,
                        subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)
    clf.fit(Xtr[cols], ytr)
    return clf, cols


def run_dataset(label, gen_fn):
    rows = []
    for seed in SEEDS:
        gr = gen_fn(seed)
        ho = R.carve("v5_phacking", gr.X, gr.y, seed)  # locked holdout
        # split dev into train + VISIBLE validation (the thing the search abuses)
        g = np.random.default_rng(seed + 1)
        idx = np.arange(len(ho.Xdev)); g.shuffle(idx)
        val = idx[:VAL_SIZE]; tr = idx[VAL_SIZE:]
        Xtr, ytr = ho.Xdev.iloc[tr].reset_index(drop=True), ho.ydev[tr]
        Xval, yval = ho.Xdev.iloc[val].reset_index(drop=True), ho.ydev[val]
        all_cols = list(gr.X.columns)

        best, crossed = _search(Xtr, ytr, Xval, yval, all_cols, seed)
        clf, cols = _fit_best(Xtr, ytr, best["cfg"])
        # Arm B: the p-hacked config scored ONCE on the locked holdout
        r = R.score_on_holdout(ho, f"{label}_holdout", "classification",
                               lambda Xh: clf.predict_proba(Xh[cols])[:, 1],
                               extra={"seed": seed, "best_val_auc": best["val_auc"],
                                      "configs_crossing_0.60_on_noise": crossed})
        rows.append({"seed": seed, "best_val_auc": best["val_auc"],
                     "holdout_auc": r["metrics"]["auc"],
                     "optimism": best["val_auc"] - r["metrics"]["auc"],
                     "cfgs>=0.60": crossed})
    return pd.DataFrame(rows)


def run():
    noise = run_dataset("noise", lambda s: G.gen_pure_noise(s, n=3000, p=20))
    weak = run_dataset("weak", lambda s: G.gen_weak_signal(s, n=3000, p=20))

    n_valmean = noise["best_val_auc"].mean(); n_holdmean = noise["holdout_auc"].mean()
    n_optim = noise["optimism"].mean(); n_cross = noise["cfgs>=0.60"].mean()

    # PASS: on noise, search overfits validation (optimism >= 0.10) AND holdout ~ dummy (<=0.56)
    reproduced = n_optim >= 0.10
    contained = n_holdmean <= 0.56
    verdict = "PASS" if (reproduced and contained) else "REVISE"

    print("\n=== V5 — p-hacking reproduction + locked-holdout containment ===")
    print("PURE NOISE (true AUC = 0.5):")
    print(noise.round(4).to_string(index=False))
    print(f"  best validation AUC (what a p-hacker reports) mean = {n_valmean:.4f}")
    print(f"  locked-holdout AUC (the truth)                 mean = {n_holdmean:.4f}")
    print(f"  optimism (val - holdout)                       mean = {n_optim:.4f}")
    print(f"  random configs crossing val-AUC 0.60 on NOISE  mean = {n_cross:.1f} / {N_CONFIGS}")
    print("\nWEAK SIGNAL:")
    print(weak.round(4).to_string(index=False))
    print(f"\nreproduced p-hack (noise optimism>=0.10) = {reproduced}; "
          f"contained (noise holdout<=0.56) = {contained}  → {verdict}")
    print("Reading: searching against a visible score manufactures ~{:.2f} AUC of fake".format(n_optim))
    print("skill on PURE NOISE; the locked holdout — never used for selection — still")
    print("reports the honest ~0.5. This is the graveyard's deadliest failure, reproduced")
    print("and mechanically contained. NOTE: an LLM agent does not exempt this — the")
    print("containment must be mechanical, which is exactly the plan's design.")

    R.save_result("v5_phacking", {
        "hypothesis": "free search overfits validation; locked holdout contains it",
        "seeds": SEEDS, "noise": noise.to_dict(orient="records"),
        "weak": weak.to_dict(orient="records"),
        "noise_best_val_mean": n_valmean, "noise_holdout_mean": n_holdmean,
        "noise_optimism_mean": n_optim, "configs_crossing_0.60_mean": n_cross,
        "verdict": verdict, "pass_bar": "noise optimism>=0.10 AND noise holdout<=0.56",
    })


if __name__ == "__main__":
    run()
