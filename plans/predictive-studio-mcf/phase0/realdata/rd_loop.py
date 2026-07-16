"""
RD-LOOP — the metacognitive loop mechanics (A6.8): defer → parallel branches →
synthesis checkpoint reading the REAL leaderboard → resolve/stop, under a HARD
TrainBudget(6); plus the illegal-wiring reject→repair demonstrated at the port level.

The defer itself is seeded mechanically (triage is RD-REASON's test; this tests the
LOOP): branch candidates {logistic_regression, xgboost} for the renewal ranker.
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import json
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from harness import referee as R
from harness import llm as L
from features import build_period_frame, ASOF_NUM, ASOF_CAT, encode
from session import TrainBudget, BudgetExceeded, LLMLedger
from schemas import SYNTHESIS_SCHEMA

SEED = 201

# ---- port legality (deterministic, the composite-schema twin) ----
PORT_RULES = {("probability", "probability"): True,        # calibrator input
              ("survival-curve", "probability"): False}    # the illegal temptation
ADAPTED = {("cluster-id", "features:tabular"), ("latent-state", "features:tabular"),
           ("probability", "features:tabular")}


def edge_legal(frm: str, to: str) -> tuple[bool, str]:
    if frm == to or (frm, to) in ADAPTED:
        return True, "port match or registered adapter"
    if PORT_RULES.get((frm, to)) is True:
        return True, "port match"
    return False, f"no port match {frm}->{to} and no registered adapter"


def run():
    out = build_period_frame()
    lab = out["df"].dropna(subset=["renewed"]).reset_index(drop=True)
    y = lab["renewed"].astype(int).to_numpy()
    X = encode(lab, ASOF_NUM, ASOF_CAT)
    ho = R.carve("rd_loop", X, y, SEED)
    budget = TrainBudget(6)
    ledger = LLMLedger()

    # ---- branches (the resolved defer) ----
    leaderboard = []
    m_log = make_pipeline(StandardScaler(),
                          LogisticRegression(max_iter=2000, class_weight="balanced"))
    m_log.fit(ho.Xdev, ho.ydev); budget.spend("branch:logistic")
    r_log = R.score_on_holdout(ho, "branch_logistic", "classification",
                               lambda Xh: m_log.predict_proba(Xh)[:, 1])
    leaderboard.append({"branch": "logistic_regression", "auc": round(r_log["metrics"]["auc"], 3),
                        "logloss": round(r_log["metrics"]["logloss"], 3)})
    m_gbt = XGBClassifier(n_estimators=250, max_depth=4, learning_rate=0.08,
                          subsample=0.9, eval_metric="logloss", n_jobs=4, random_state=0)
    m_gbt.fit(ho.Xdev, ho.ydev); budget.spend("branch:xgboost")
    r_gbt = R.score_on_holdout(ho, "branch_xgboost", "classification",
                               lambda Xh: m_gbt.predict_proba(Xh)[:, 1])
    leaderboard.append({"branch": "xgboost", "auc": round(r_gbt["metrics"]["auc"], 3),
                        "logloss": round(r_gbt["metrics"]["logloss"], 3)})

    # ---- illegal-wiring reject (deterministic port check, always demonstrated) ----
    illegal_edge = ("survival-curve", "probability")
    legal, reason = edge_legal(*illegal_edge)
    assert not legal, "the illegal temptation must be rejected by the port rules"
    rejection = (f"PROPOSAL 'pipe CoxPH survival-curve into the Isotonic Calibrator' REJECTED: "
                 f"{reason}. A survival curve is not a probability port; no adapter exists.")

    # ---- synthesis checkpoint (LLM reads the REAL leaderboard + budget + the rejection) ----
    prompt = (
        "You are the synthesis checkpoint of a model-design session.\n"
        f"BranchGroup 'renewal-ranker' results on the LOCKED holdout:\n{json.dumps(leaderboard, indent=1)}\n"
        f"Budget: {budget.state()} (hard cap — exceeding aborts the session).\n"
        f"A prior recombine proposal was rejected by the type system:\n{rejection}\n\n"
        "Choose ONE action: 'resolve' (name the winner and stop branching), 'recombine' "
        "(ONLY with a port-legal graph), or 'stop'. Cite the actual numbers."
    )
    ledger.spend("synthesis")
    syn = L.ask_json(prompt, SYNTHESIS_SCHEMA, "rd_loop", tag="synthesis")
    action = syn.get("action")
    winner = (syn.get("winner") or "").lower()
    lead_best = max(leaderboard, key=lambda r: r["auc"])
    resolve_ok = action in ("resolve", "stop") and \
        (action == "stop" or lead_best["branch"].split("_")[0] in winner or winner in lead_best["branch"])
    cites_ok = any(str(lead_best["auc"]) in c for c in syn.get("cited_numbers", []))

    # ---- budget hard-cap demonstration: a runaway sweep must be stopped ----
    tripped = False
    try:
        for i in range(10):  # a runaway hyperparameter sweep
            budget.spend(f"sweep:{i}")
    except BudgetExceeded as e:
        tripped = True
        trip_msg = str(e)

    verdict = "PASS" if (resolve_ok and cites_ok and tripped) else "REVISE"
    print("\n=== RD-LOOP — branches → synthesis → budget cap → illegal reject ===")
    print(pd.DataFrame(leaderboard).to_string(index=False))
    print(f"\nsynthesis: action={action} winner={syn.get('winner')} "
          f"cites_real_numbers={cites_ok}")
    print(f"illegal wiring rejected deterministically: True ({reason})")
    print(f"budget hard-cap tripped on runaway sweep: {tripped} ({trip_msg if tripped else ''})")
    print(f"→ {verdict}")

    R.save_result("rd_loop", {
        "leaderboard": leaderboard, "synthesis": syn,
        "resolve_ok": bool(resolve_ok), "cites_ok": bool(cites_ok),
        "illegal_edge": illegal_edge, "illegal_rejected": True,
        "budget_tripped": bool(tripped), "budget_log": budget.log,
        "verdict": verdict,
        "pass_bar": "synthesis resolves/stops citing real numbers AND budget cap trips "
                    "AND illegal wiring rejected",
    })


if __name__ == "__main__":
    run()
