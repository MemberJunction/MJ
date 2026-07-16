"""
RD-ASSEMBLE — data-assembly + leakage honesty on REAL traps (V1+V7 on real data),
plus the trust-gate assertion (A6.8): the leaky model's near-perfect score must
trigger the single-feature-dominance flag and a BLOCKED promotion.

Arms (all scored by the locked-holdout referee):
  naive_with_traps : GBT on as-of features + the real post-outcome columns
                     (CancellationReason, cancel_days_after_start, renewal_year —
                     `Status` is the label source itself, quarantined from modeling
                     but included in the semantic screen's input)
  stat_screen      : |corr|>0.5 statistical leak screen — which traps does it catch?
  semantic_screen  : ONE Gemini call over column names+meanings only (no values)
  asof_honest      : GBT on as-of features only — the honest number

Run: cd phase0 && DYLD_LIBRARY_PATH=/opt/homebrew/opt/libomp/lib .venv/bin/python realdata/rd_assemble.py
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import json
import numpy as np
import pandas as pd
from xgboost import XGBClassifier

from harness import referee as R
from harness import llm as L
from features import (build_period_frame, ASOF_NUM, ASOF_CAT, DECOY_SAFE, encode)
from promptbuild import FEATURE_MEANINGS
from schemas import LEAKSCREEN_SCHEMA

SEEDS = [201, 202, 203]
# modeling traps (Status excluded: it IS the label definition, not a leaked feature)
TRAP_NUM = ["cancel_days_after_start", "renewal_year"]
TRAP_CAT = ["CancellationReason"]
SCREEN_TRAPS = ["Status", "CancellationDate", "CancellationReason", "RenewalDate", "EndDate"]
DOMINANCE_THRESHOLD = 0.5  # the LeakageGuard default posture: one feature owning >50% importance


def _gbt():
    return XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                         subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)


def semantic_screen() -> dict:
    """One Gemini call: schema + meanings only — never values."""
    cols = []
    for c in ASOF_NUM + ASOF_CAT + DECOY_SAFE:
        if c in FEATURE_MEANINGS or c in DECOY_SAFE:
            cols.append(f"- {c}: {FEATURE_MEANINGS.get(c, 'member/period attribute')}")
    trap_meanings = {
        "Status": "the period's status (Renewed / Active / Lapsed / PendingRenewal)",
        "CancellationDate": "date the membership was cancelled",
        "CancellationReason": "reason recorded for the cancellation",
        "RenewalDate": "date the renewal was processed",
        "EndDate": "the period's end date",
    }
    for c, m in trap_meanings.items():
        cols.append(f"- {c}: {m}")
    prompt = (
        "We are building a model that predicts, AT THE MOMENT A MEMBERSHIP PERIOD STARTS, "
        "whether that period will end in renewal or lapse.\n\n"
        "Below are candidate feature columns with their meanings. Flag every column that "
        "would LEAK the outcome (information not knowable at the period start / written "
        "after or because of the outcome). Do not flag legitimate as-of features.\n\n"
        + "\n".join(sorted(set(cols))) +
        "\n\nReturn a flag for EVERY column listed."
    )
    return L.ask_json(prompt, LEAKSCREEN_SCHEMA, "rd_assemble", tag="semantic_screen")


def run():
    out = build_period_frame()
    df = out["df"]
    lab = df.dropna(subset=["renewed"]).reset_index(drop=True)
    y = lab["renewed"].astype(int).to_numpy()

    rows = []
    dominance_records = []
    for seed in SEEDS:
        # one carve per seed over the labeled frame; arms share it
        Xasof = encode(lab, ASOF_NUM, ASOF_CAT)
        ho = R.carve("rd_assemble", Xasof, y, seed)
        dev_idx = ho.Xdev.index  # not used; referee reset indices — recompute split below
        # referee carve shuffles by seed; rebuild the same split for the naive arm's frame
        g = np.random.default_rng(seed)
        idx = np.arange(len(lab)); g.shuffle(idx)
        cut = int(len(lab) * 0.7); dev, holdo = idx[:cut], idx[cut:]

        # --- asof_honest ---
        m1 = _gbt().fit(ho.Xdev, ho.ydev)
        rec1 = R.score_on_holdout(ho, "asof_honest", "classification",
                                  lambda X: m1.predict_proba(X)[:, 1])

        # --- naive_with_traps (same rows, wider columns) ---
        Xnaive_all = encode(lab, ASOF_NUM + TRAP_NUM, ASOF_CAT + TRAP_CAT)
        Xn_dev, Xn_hold = Xnaive_all.iloc[dev].reset_index(drop=True), Xnaive_all.iloc[holdo].reset_index(drop=True)
        m2 = _gbt().fit(Xn_dev, y[dev])
        ho_n = R.Holdout("rd_assemble", Xn_dev, y[dev], Xn_hold, y[holdo],
                         set(), seed)  # same partition; hashes not needed for this arm
        rec2 = R.score_on_holdout(ho_n, "naive_with_traps", "classification",
                                  lambda X: m2.predict_proba(X)[:, 1])

        # --- trust gate: single-feature dominance on the naive model ---
        imp = dict(zip(Xnaive_all.columns, m2.feature_importances_))
        shares = {k: v / max(sum(imp.values()), 1e-9) for k, v in imp.items()}
        top_feat, top_share = max(shares.items(), key=lambda kv: kv[1])
        blocked = top_share > DOMINANCE_THRESHOLD
        dominance_records.append({"seed": seed, "top_feature": top_feat,
                                  "top_share": round(top_share, 3),
                                  "promotion_blocked": blocked})

        rows.append({"seed": seed,
                     "auc_asof": round(rec1["metrics"]["auc"], 3),
                     "auc_naive": round(rec2["metrics"]["auc"], 3),
                     "inflation": round(rec2["metrics"]["auc"] - rec1["metrics"]["auc"], 3)})

    # --- statistical screen (labeled rows; encoded traps + decoys) ---
    stat_flags = {}
    for c in TRAP_NUM:
        v = lab[c].fillna(-1)
        stat_flags[c] = abs(np.corrcoef(v, y)[0, 1]) > 0.5
    for c in TRAP_CAT + ["Status"]:
        d = pd.get_dummies(lab[c].fillna("NA").astype(str))
        stat_flags[c] = bool(max(abs(np.corrcoef(d[col], y)[0, 1]) for col in d.columns) > 0.5)
    stat_flags["CancellationDate"] = stat_flags.get("cancel_days_after_start", False)
    stat_flags["RenewalDate"] = stat_flags.get("renewal_year", False)
    stat_flags["EndDate"] = False  # not in the modeled frame; statistically unexamined
    for c in DECOY_SAFE:
        col = lab[c] if c in lab.columns else None
        if col is None:
            stat_flags[c] = False
        elif col.dtype == object:
            d = pd.get_dummies(col.fillna("NA").astype(str))
            stat_flags[c] = bool(max(abs(np.corrcoef(d[x], y)[0, 1]) for x in d.columns) > 0.5)
        else:
            stat_flags[c] = bool(abs(np.corrcoef(col.fillna(-1), y)[0, 1]) > 0.5)

    # --- semantic screen (1 LLM call) ---
    sem = semantic_screen()
    sem_flags = {f["column"]: bool(f["leaky"]) for f in sem.get("flags", [])}

    def screen_scores(flags: dict) -> tuple[float, float, dict]:
        recall = float(np.mean([flags.get(t, False) for t in SCREEN_TRAPS]))
        fpr = float(np.mean([flags.get(d, False) for d in DECOY_SAFE]))
        per_trap = {t: bool(flags.get(t, False)) for t in SCREEN_TRAPS}
        return recall, fpr, per_trap

    stat_recall, stat_fpr, stat_per = screen_scores(stat_flags)
    sem_recall, sem_fpr, sem_per = screen_scores(sem_flags)

    df_r = pd.DataFrame(rows)
    infl = df_r["inflation"].mean()
    dom = pd.DataFrame(dominance_records)
    gate_ok = dom["promotion_blocked"].all()
    verdict = "PASS" if (infl >= 0.10 and sem_recall >= 0.8 and sem_fpr <= 0.2 and gate_ok) else \
              ("REVISE" if infl >= 0.05 and sem_recall >= 0.6 else "KILL")

    print("\n=== RD-ASSEMBLE — real-trap leakage + as-of honesty + trust gate ===")
    print(df_r.to_string(index=False))
    print(f"\nmean inflation naive-over-asof = {infl:+.3f} AUC (bar >= +0.10)")
    print("\nper-trap catches:")
    for t in SCREEN_TRAPS:
        print(f"  {t:22s} stat={stat_per[t]}  semantic={sem_per[t]}")
    print(f"stat screen   recall={stat_recall:.2f} decoyFPR={stat_fpr:.2f}")
    print(f"semantic scrn recall={sem_recall:.2f} decoyFPR={sem_fpr:.2f} (bars >=0.8, <=0.2)")
    print("\ntrust gate (single-feature dominance on the LEAKY model):")
    print(dom.to_string(index=False))
    print(f"promotion blocked in all seeds = {gate_ok}  → {verdict}")

    R.save_result("rd_assemble", {
        "hypothesis": "real post-outcome traps inflate; semantic screen catches them by meaning; "
                      "as-of assembly is honest; dominance gate blocks the leaky model",
        "seeds": SEEDS, "per_seed": rows, "mean_inflation": infl,
        "stat_screen": {"recall": stat_recall, "fpr": stat_fpr, "per_trap": stat_per},
        "semantic_screen": {"recall": sem_recall, "fpr": sem_fpr, "per_trap": sem_per,
                            "raw": sem},
        "dominance": dominance_records, "gate_blocked_all": bool(gate_ok),
        "verdict": verdict,
        "pass_bar": "inflation>=0.10 AND sem recall>=0.8 AND sem FPR<=0.2 AND gate blocks all seeds",
    })


if __name__ == "__main__":
    run()
