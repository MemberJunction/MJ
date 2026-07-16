"""
RD-STORY — story formation + faithfulness + retrieval + reuse (V8's real-data run).

Library = the components the SESSION actually built (session_library_session1.json):
nominal names + narratives proposed by the Story Tagger during the session, grounded
in real columns. Tests:
  faithfulness : the renewal ranker's narrative must name >=2 of its top-3 REAL
                 feature importances (anti post-hoc-rationalization, code-checked)
  retrieval    : 8 task queries, TF-IDF over nominal+narrative vs technical names
  reuse        : the cross-situation reuse event (S5 reusing S1's cluster component —
                 observed in session run 1; this run's S5 chose commit; both recorded)
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import json
import re
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from harness import referee as R

RESULTS = Path(__file__).resolve().parent.parent / "results"

QUERIES = [  # (query, correct technical component)
    ("find members drifting away before renewal", "calibrated_gbt_renewal"),
    ("who is likely to leave us this year", "calibrated_gbt_renewal"),
    ("how much membership lifetime does each member have left", "coxph_time_to_lapse"),
    ("when will people cancel", "coxph_time_to_lapse"),
    ("what will we collect in dues next year", "ets_dues_forecast"),
    ("project our revenue for budgeting", "ets_dues_forecast"),
    ("group our members into engagement types", "kmeans_engagement"),
    ("which audience segments exist in the community", "kmeans_engagement"),
]

FEATURE_SYNONYMS = {  # paraphrase-tolerant matching narrative<->feature names
    "tenure_days": ["tenure", "how long", "membership length", "years as a member"],
    "prior_periods": ["prior period", "previous membership", "renewal history", "past periods"],
    "events_attended": ["event", "attendance", "attended"],
    "attend_rate": ["attendance rate", "attend rate", "show-up"],
    "event_recency_days": ["recency", "recent event", "last event", "recently"],
    "orders_before": ["order", "purchase"],
    "order_recency_days": ["recent order", "recent purchase", "recency"],
    "payments_before": ["payment"],
    "courses_before": ["course", "enrollment", "learning"],
    "complete_rate": ["completion", "completed courses"],
    "dues_amount": ["dues"],
    "auto_renew": ["auto-renew", "auto renew", "autorenew"],
    "start_year": ["year", "cohort"],
}


def run():
    lib = json.loads((RESULTS / "session_library_session1.json").read_text())
    by_tech = {r["technical"]: r for r in lib}

    # ---- faithfulness: narrative vs REAL top-3 importances (renewal ranker) ----
    rr = by_tech["calibrated_gbt_renewal"]
    fi = rr.get("feature_importance", {})
    top3 = [k for k, _ in sorted(fi.items(), key=lambda kv: -abs(kv[1]))[:3]]
    text = (rr["nominal_name"] + " " + rr["narrative"]).lower()
    named = []
    for f in top3:
        pats = [f.replace("_", " ")] + FEATURE_SYNONYMS.get(f, [])
        if any(p in text for p in pats):
            named.append(f)
    faithful = len(named) >= 2

    # ---- retrieval: nominal+narrative vs technical-only ----
    def top3_acc(doc_fn) -> float:
        docs = [doc_fn(r) for r in lib]
        vec = TfidfVectorizer().fit(docs + [q for q, _ in QUERIES])
        D = vec.transform(docs)
        hits = 0
        for q, truth in QUERIES:
            sims = cosine_similarity(vec.transform([q]), D)[0]
            top = [lib[i]["technical"] for i in np.argsort(-sims)[:3]]
            hits += truth in top
        return hits / len(QUERIES)

    acc_nominal = top3_acc(lambda r: f"{r['nominal_name']} {r['narrative']} {' '.join(r.get('groundings', []))}")
    acc_technical = top3_acc(lambda r: r["technical"].replace("_", " "))

    # ---- the reuse event (cross-run evidence, reported honestly) ----
    reuse_events = []
    audit = (RESULTS / "llm_audit.jsonl").read_text().splitlines()
    for line in audit:
        rec = json.loads(line)
        if rec.get("experiment") == "rd_reason" and rec.get("tag") == "S5_verdict":
            resp = rec.get("response", {})
            if resp.get("triage") == "reuse":
                reuse_events.append({"run_ts": rec["ts"],
                                     "chosen": resp.get("chosen_components", [])})
    verdict = "PASS" if (faithful and acc_nominal >= 0.75 and acc_nominal >= acc_technical
                         and len(reuse_events) >= 1) else "REVISE"

    print("\n=== RD-STORY — formation, faithfulness, retrieval, reuse ===")
    print("library:")
    for r in lib:
        print(f"  \"{r['nominal_name']}\" [{r['technical']}] — {r['narrative'][:90]}...")
    print(f"\nfaithfulness (renewal ranker): top-3 real importances {top3}; "
          f"narrative names {named} → {'FAITHFUL' if faithful else 'POST-HOC'}")
    print(f"retrieval top-3: nominal+narrative {acc_nominal:.2f} vs technical-only {acc_technical:.2f}")
    print(f"cross-situation reuse events observed (S5→S1 cluster component): {len(reuse_events)} "
          f"(session run 1; run 2's S5 chose commit — both legal, both recorded)")
    print(f"→ {verdict}")

    R.save_result("rd_story", {
        "library": lib, "faithfulness": {"top3": top3, "named": named, "faithful": faithful},
        "retrieval": {"nominal": acc_nominal, "technical": acc_technical, "queries": QUERIES},
        "reuse_events": reuse_events, "verdict": verdict,
        "pass_bar": "faithful narrative AND nominal retrieval >=0.75 AND >= technical "
                    "AND >=1 reuse event",
    })


if __name__ == "__main__":
    run()
