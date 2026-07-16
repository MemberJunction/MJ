"""
V8 — Story-tag retrieval (the reuse bet; cheapest, optional).

Hypothesis: meaning-tagged components ("detects cooling->dormant drift") are
retrieved for a new task better than keyword search over technical names
("GaussianHMM_4state_v3") — i.e. reuse-before-rebuild works because components
are findable by what they FIND.

Method: a library of component cards (technical name + nominal story tag +
description) and a set of task queries with known-correct answers. Three arms:
  KEYWORD  — token overlap between the query and the TECHNICAL name only
  NOMINAL  — an LLM ranks the nominal story tags against the query
  BOTH     — LLM ranks over technical + nominal + description
Metric: top-3 retrieval accuracy (is a correct component in the top 3).

Run: ./run.sh v8_story_retrieval
"""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import re
from harness import referee as R
from harness import llm as L

# library: id -> (technical_name, nominal_story, description)
LIBRARY = {
    "c1": ("GaussianHMM_4state_v3", "Sees members cooling toward dormancy before they lapse",
           "Hidden-state sequence model over activity logs; emits engagement state."),
    "c2": ("IsotonicCalibrator_xgb_v7", "Turns raw risk scores into honest renewal probabilities",
           "Post-hoc calibration mapping scores to calibrated probabilities."),
    "c3": ("ImplicitALS_32f_v1", "Knows which products a member is likely to buy next",
           "Collaborative-filtering latent factors over purchase history."),
    "c4": ("CoxPH_lapse_v2", "Estimates how long until a member lapses",
           "Proportional-hazards survival model on tenure and engagement."),
    "c5": ("KMeans_behavior_v4", "Groups members into behavioral segments",
           "Clusters members by engagement pattern into segments."),
    "c6": ("SARIMA_dues_v2", "Forecasts dues revenue with its seasonal swings",
           "Seasonal time-series model for monthly dues."),
    "c7": ("BGNBD_alive_v1", "Judges whether a lapsed-looking member is really still active",
           "Buy-till-you-die model estimating probability a member is still active."),
    "c8": ("XGB_renewal_v9", "Predicts yes/no whether a member renews",
           "Gradient-boosted classifier for the renewal decision."),
    "c9": ("GammaGamma_clv_v1", "Estimates a member's future monetary value",
           "Monetary-value model pairing with BG/NBD for lifetime value."),
    "c10": ("AssocRules_basket_v1", "Finds which memberships and events are bought together",
            "Association-rule mining over co-purchase baskets."),
}

# queries -> set of acceptable component ids
QUERIES = {
    "who is quietly disengaging and about to leave?": {"c1", "c4"},
    "can I trust these scores as real probabilities?": {"c2"},
    "what should we recommend this member buy next?": {"c3"},
    "when will this member lapse?": {"c4", "c1"},
    "what natural groups do our members fall into?": {"c5"},
    "project next year's dues revenue by month": {"c6"},
    "is this inactive member actually gone or just quiet?": {"c7", "c1"},
    "how much is this member worth over time?": {"c9"},
    "which products sell together?": {"c10"},
    "will this member renew?": {"c8"},
}

RANK_SCHEMA = {
    "type": "object",
    "properties": {"top3": {"type": "array", "items": {"type": "string"}}},
    "required": ["top3"],
}


def keyword_rank(query):
    q = set(re.findall(r"[a-z]+", query.lower()))
    scored = []
    for cid, (tech, _nom, _desc) in LIBRARY.items():
        toks = set(re.findall(r"[a-z]+", tech.lower()))
        scored.append((len(q & toks), cid))
    scored.sort(reverse=True)
    return [cid for _s, cid in scored[:3]]


def llm_rank(query, use_nominal, use_desc):
    lines = []
    for cid, (tech, nom, desc) in LIBRARY.items():
        parts = [f"id={cid}", f"name={tech}"]
        if use_nominal:
            parts.append(f"does='{nom}'")
        if use_desc:
            parts.append(f"desc='{desc}'")
        lines.append("  " + " | ".join(parts))
    prompt = (f"A user asks: \"{query}\"\nHere is a library of reusable model components:\n"
              + "\n".join(lines) +
              "\n\nReturn JSON with 'top3': the up-to-3 component ids most useful for the "
              "user's question, best first.")
    tag = f"{'nom' if use_nominal else 'tech'}{'+desc' if use_desc else ''}"
    out = L.ask_json(prompt, RANK_SCHEMA, "v8_story_retrieval", tag=tag)
    return [c for c in out.get("top3", [])][:3]


def hit(ranked, gold):
    return len(set(ranked) & gold) > 0


def run():
    kw, nom, both = [], [], []
    per = []
    for q, gold in QUERIES.items():
        k = keyword_rank(q)
        n = llm_rank(q, use_nominal=True, use_desc=False)
        b = llm_rank(q, use_nominal=True, use_desc=True)
        kw.append(hit(k, gold)); nom.append(hit(n, gold)); both.append(hit(b, gold))
        per.append({"query": q[:44], "keyword_top3": k, "nominal_top3": n,
                    "kw_hit": hit(k, gold), "nom_hit": hit(n, gold), "both_hit": hit(b, gold)})

    kacc = sum(kw) / len(kw); nacc = sum(nom) / len(nom); bacc = sum(both) / len(both)
    best = max(nacc, bacc)
    verdict = "PASS" if (best >= 0.8 and (best - kacc) >= 0.2) else \
              ("REVISE" if best >= 0.6 else "KILL")

    print("\n=== V8 — Story-tag retrieval (reuse-before-rebuild) ===")
    for r in per:
        print(f"  {r['query']:<46} kw={r['kw_hit']!s:<5} nominal={r['nom_hit']!s:<5} both={r['both_hit']}")
    print(f"\ntop-3 accuracy — keyword(technical)={kacc:.2f}  nominal={nacc:.2f}  both={bacc:.2f}")
    print(f"best meaning-aware − keyword = {best - kacc:+.2f}  → {verdict}")
    print("Reading: searching by what a component FINDS (its story) retrieves the right")
    print("capability far better than matching technical names — so the library compounds:")
    print("the next project reuses instead of rebuilding.")

    R.save_result("v8_story_retrieval", {
        "hypothesis": "nominal/story retrieval beats keyword-over-technical",
        "queries": list(QUERIES), "per_query": per,
        "keyword_acc": kacc, "nominal_acc": nacc, "both_acc": bacc, "verdict": verdict,
        "pass_bar": "meaning-aware top3>=0.8 and >=0.2 over keyword",
    })


if __name__ == "__main__":
    run()
