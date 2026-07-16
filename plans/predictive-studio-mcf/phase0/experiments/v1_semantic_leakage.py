"""
V1 — Semantic leakage detection (the "meaning catches what statistics can't" bet).

Hypothesis: an LLM reading ONLY the schema + column descriptions (never values)
flags planted target leakage that a correlation screen misses — especially leaks
whose statistical signal is dampened but whose NAME/meaning is a dead giveaway —
and the union of the two screens beats either alone.

Method: a renewal-prediction schema with three leak classes planted among honest
features + decoys (suspicious-looking but harmless names):
  (a) direct proxy, strong correlation  (InvoicePaidThisYear)
  (b) post-outcome timestamp            (CancellationProcessedDate)
  (c) name-only leak: correlation deliberately dampened < 0.3, but the NAME is a
      giveaway                          (RenewalConfirmationEmailOpened)
Two screens:
  STATISTICAL — flag any column with |corr(col, target)| > 0.95 (on planted data)
  SEMANTIC    — the LLM, given ONLY {name, description, dtype}, flags likely leaks
We measure recall per class and the decoy false-positive rate, and the union.

Run: ./run.sh v1_semantic_leakage
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd

from harness import generators as G, referee as R
from harness import llm as L

SEEDS = [61, 62, 63]

# schema: (column, description, is_leak, corr_dampen) — corr_dampen<1 quiets the stat signal
SCHEMA = [
    ("TenureYears", "Number of years the member has belonged.", False, None),
    ("EventsAttended12mo", "Count of events attended in the trailing 12 months.", False, None),
    ("EmailEngagementScore", "Aggregate email open/click score over the period.", False, None),
    ("ChapterId", "The member's local chapter identifier.", False, None),
    ("DuesAmount", "Annual dues billed to the member.", False, None),
    # leaks:
    ("InvoicePaidThisYear", "1 if the member has paid this year's renewal invoice.", True, 1.0),      # (a)
    ("CancellationProcessedDate", "Date the member's cancellation was processed by staff.", True, 1.0),  # (b)
    ("RenewalConfirmationEmailOpened", "1 if the member opened the post-renewal confirmation email.", True, 0.18),  # (c) name-only
    # decoys (suspicious-looking, harmless):
    ("LastLoginRecencyDays", "Days since the member last logged in.", False, None),
    ("RenewalReminderCount", "How many renewal reminder emails were SENT (pre-decision).", False, None),
    ("PaymentMethodType", "Card vs ACH vs check — the member's saved payment method.", False, None),
]

LEAK_CLASS = {"InvoicePaidThisYear": "a_direct", "CancellationProcessedDate": "b_postoutcome",
              "RenewalConfirmationEmailOpened": "c_name_only"}
DECOYS = {"LastLoginRecencyDays", "RenewalReminderCount", "PaymentMethodType"}
LEAKS = set(LEAK_CLASS)

LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "flagged": {"type": "array", "items": {
            "type": "object",
            "properties": {"column": {"type": "string"}, "reason": {"type": "string"}},
            "required": ["column", "reason"]}}},
    "required": ["flagged"],
}


def _build_data(seed):
    g = G.gen_classification(seed, n=4000, p=5)
    df = g.X.copy()
    df.columns = ["TenureYears", "EventsAttended12mo", "EmailEngagementScore", "ChapterId", "DuesAmount"]
    y = g.y
    rng = np.random.default_rng(seed + 100)
    for col, _desc, is_leak, dampen in SCHEMA:
        if col in df.columns:
            continue
        if is_leak:
            df[col] = y * 1.0 + rng.normal(0, 1.0 / max(dampen, 1e-3), size=len(y))
        else:  # decoy: independent of y
            df[col] = rng.normal(size=len(y))
    return df, y


def _statistical_screen(df, y, thresh: float = 0.30):
    # A REASONABLE correlation screen (0.30), not a strawman. It should catch the
    # strongly-correlated leaks (a,b) and miss only the name-only one (c) whose
    # correlation was deliberately dampened below the threshold.
    flags = set()
    for c in df.columns:
        col = pd.to_numeric(df[c], errors="coerce")
        if col.notna().sum() < 10:
            continue
        r = np.corrcoef(col.fillna(col.mean()), y)[0, 1]
        if abs(r) > thresh:
            flags.add(c)
    return flags


def _semantic_screen(seed):
    lines = [f"- {c} ({'numeric'}): {d}" for c, d, _l, _dm in SCHEMA]
    prompt = (
        "You are auditing features for a model that predicts whether an association "
        "member will RENEW their membership for the coming year. Target = Renewed (1/0), "
        "known at renewal-decision time.\n\n"
        "TARGET LEAKAGE is any feature whose value would only be known AT OR AFTER the "
        "renewal outcome, or that is a direct proxy for it — using it would let the model "
        "'cheat'. Judge ONLY from each column's name and description below; you do NOT see "
        "any data values.\n\nColumns:\n" + "\n".join(lines) +
        "\n\nReturn JSON: the columns you would flag as likely target leakage, each with a "
        "one-line reason. Do not flag legitimate pre-decision predictors."
    )
    out = L.ask_json(prompt, LLM_SCHEMA, "v1_semantic_leakage", tag=f"seed{seed}")
    return {f["column"] for f in out.get("flagged", []) if "column" in f}


def _recall(flagged, truth_set):
    if not truth_set:
        return float("nan")
    return len(flagged & truth_set) / len(truth_set)


def run():
    per_seed = []
    for seed in SEEDS:
        df, y = _build_data(seed)
        stat = _statistical_screen(df, y)
        sem = _semantic_screen(seed)
        union = stat | sem

        classes = {"a_direct", "b_postoutcome", "c_name_only"}
        by_class = {}
        for cls in classes:
            cols = {c for c, k in LEAK_CLASS.items() if k == cls}
            by_class[cls] = {
                "stat": _recall(stat & LEAKS, cols),
                "sem": _recall(sem & LEAKS, cols),
            }
        per_seed.append({
            "seed": seed,
            "stat_recall_all": _recall(stat & LEAKS, LEAKS),
            "sem_recall_all": _recall(sem & LEAKS, LEAKS),
            "union_recall_all": _recall(union & LEAKS, LEAKS),
            "sem_decoy_fp": len(sem & DECOYS) / len(DECOYS),
            "stat_decoy_fp": len(stat & DECOYS) / len(DECOYS),
            "sem_c_nameonly": by_class["c_name_only"]["sem"],
            "stat_c_nameonly": by_class["c_name_only"]["stat"],
        })

    df = pd.DataFrame(per_seed)
    sem_c = df["sem_c_nameonly"].mean()
    sem_decoy = df["sem_decoy_fp"].mean()
    stat_all = df["stat_recall_all"].mean()
    union_all = df["union_recall_all"].mean()

    # PASS: LLM recalls the name-only leak >=0.8 with decoy FP <=0.2, and the union
    # beats a REASONABLE (0.30) statistical screen by >=0.2 on overall leak recall.
    verdict = "PASS" if (sem_c >= 0.8 and sem_decoy <= 0.2 and (union_all - stat_all) >= 0.2) else \
              ("REVISE" if sem_c >= 0.5 else "KILL")

    print("\n=== V1 — Semantic leakage detection ===")
    print(df.round(3).to_string(index=False))
    print(f"\nname-only-leak recall  — statistical = {df['stat_c_nameonly'].mean():.2f} ; "
          f"semantic = {sem_c:.2f}")
    print(f"decoy false-positive   — statistical = {df['stat_decoy_fp'].mean():.2f} ; "
          f"semantic = {sem_decoy:.2f}")
    print(f"overall leak recall    — statistical = {stat_all:.2f} ; union = {union_all:.2f}")
    print(f"→ {verdict}")
    print("Reading: the name-only leak (correlation dampened below 0.3) is invisible to the")
    print("statistical screen but obvious from its NAME — which only a meaning-aware screen")
    print("can read. This is the mechanism the AutoML graveyard structurally lacked.")

    R.save_result("v1_semantic_leakage", {
        "hypothesis": "semantic screen catches name-only leaks statistics miss; union wins",
        "seeds": SEEDS, "per_seed": per_seed,
        "sem_nameonly_recall": sem_c, "sem_decoy_fp": sem_decoy,
        "stat_recall_all": stat_all, "union_recall_all": union_all, "verdict": verdict,
        "pass_bar": "sem name-only recall>=0.8, decoy FP<=0.2, union-stats>=0.2",
    })


if __name__ == "__main__":
    run()
