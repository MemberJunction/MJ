"""
RD-REASON — the centerpiece: the design agent reasons through FIVE real modeling
situations on one schema, via the 7-block constructed prompt, deciding not just the
task family but WHETHER a model is worth building and how meaningful it would be —
then each verdict is EXECUTED, story-tagged, and registered so later situations can
reuse earlier components (the chain: reason → compose → story → reuse).

Session order S1→S2→S4→S5→S3 (S3 LAST: with a library full of tempting classifiers
it must still DEFER — no treatment column exists).

LLM calls: 5 verdicts + ~5 story tags + 3 ablations + 1 stability ≈ 14 (ledger-capped).
"""
from __future__ import annotations
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))

import json
import numpy as np
import pandas as pd

from harness import referee as R
from harness import llm as L
from features import build_period_frame
from situations import (SITUATIONS, SESSION_ORDER, build_dues_series,
                        qualia_classification, qualia_survival, qualia_uplift,
                        qualia_series, qualia_clustering)
from promptbuild import build_prompt
from schemas import TRIAGE_SCHEMA, STORY_SCHEMA
from catalog import CATALOG
from session import SessionLibrary, TrainBudget, LLMLedger
import rd_compose
import rd_cover
import rd_forecast
import rd_calibrate

CAT_NAMES = {c["name"].lower() for c in CATALOG}
RUN_ID = "session1"


def _flat_keys(d: dict, prefix="") -> set[str]:
    out = set()
    for k, v in d.items():
        out.add(str(k).lower())
        if isinstance(v, dict):
            out |= _flat_keys(v)
    return out


def validate_triage(resp: dict, situation: dict, library: list[dict], qualia: dict) -> dict:
    """Code-side legality — the standalone twin of validateTriageDecision.

    Includes the DETERMINISTIC identification gate: a causal/uplift question with no
    treatment column admits ONLY defer — reusing a risk model as an uplift answer is
    the risk-vs-uplift conflation, rejected by code regardless of how plausible the
    LLM's rationale sounds (LLM proposes; code enforces)."""
    problems = []
    tri = resp.get("triage")
    if situation.get("family") == "uplift" and qualia.get("treatment_column_present") is False \
            and tri != "defer":
        problems.append(
            "IDENTIFICATION GATE: the question asks who contact would CHANGE (uplift), but no "
            "treatment/contact-history column exists — uplift is unidentifiable; a risk model "
            "ranks who might lapse, NOT who contact would move. Only defer (naming the missing "
            "data) is legal.")
    if tri == "combine":
        g = resp.get("composition_graph") or {}
        nodes = g.get("nodes") or []
        if len(nodes) < 2:
            problems.append("combine without a >=2-node composition_graph")
        unknown = [n["component"] for n in nodes
                   if n.get("component", "").lower() not in CAT_NAMES]
        if unknown:
            problems.append(f"combine references unknown components: {unknown}")
    if tri == "reuse":
        names = {r["nominal_name"].lower() for r in library} | \
                {r["technical"].lower() for r in library}
        chosen = [c.lower() for c in resp.get("chosen_components", [])]
        if not any(any(c in n or n in c for n in names) for c in chosen):
            problems.append("reuse without naming a session-library candidate")
    if tri == "defer":
        if not resp.get("data_prerequisites") and len(resp.get("chosen_components", [])) < 2:
            problems.append("defer without prerequisites or >=2 branch candidates")
    qkeys = _flat_keys(qualia)
    bad_cites = [c["name"] for c in resp.get("cited_stats", [])
                 if c.get("name", "").lower().split(".")[-1] not in qkeys
                 and not any(c.get("name", "").lower() in k or k in c.get("name", "").lower()
                             for k in qkeys)]
    if bad_cites:
        problems.append(f"cited stats not present in Block 3: {bad_cites}")
    return {"legal": not problems, "problems": problems,
            "citations_valid": 1.0 - len(bad_cites) / max(len(resp.get("cited_stats", [])), 1)}


def score_verdict(sid: str, resp: dict) -> dict:
    s = SITUATIONS[sid]
    fam = str(resp.get("task_family", "")).lower()
    tri = str(resp.get("triage", "")).lower()
    family_ok = fam in s["expected_families"]
    triage_ok = tri in s["expected_triage"]
    blob = json.dumps(resp).lower()
    hard_fail = None
    if sid == "S3" and tri != "defer":
        hard_fail = "S3 must DEFER (no treatment data)"
    if sid == "S1":
        vm = str(resp.get("expected_meaningfulness", {}).get("value_metric", "")).lower()
        if not (resp.get("calibration_required") or
                any(t in vm for t in ("pr", "lift", "rank", "precision", "recall"))):
            hard_fail = "S1: neither calibration flagged nor a rank-based value metric at 94% base rate"
    if sid == "S4" and not any(t in blob for t in
                               ("time-ordered", "trailing", "chronolog", "temporal",
                                "walk-forward", "time-based split", "last 12")):
        hard_fail = "S4: time-ordered validation not flagged"
    if sid == "S5" and fam == "classification":
        hard_fail = "S5: invented a supervised target for an unsupervised question"
    em = resp.get("expected_meaningfulness", {}) or {}
    meaningful_ok = all(str(em.get(k, "")).strip() for k in
                        ("decision_informed", "value_metric", "honest_ceiling"))
    return {"family_ok": family_ok, "triage_ok": triage_ok,
            "meaningful_ok": meaningful_ok, "hard_fail": hard_fail,
            "family": fam, "triage": tri}


def story_tag(technical: str, importance: dict, groundings: list[str],
              extra: str, ledger: LLMLedger) -> dict:
    top = sorted(importance.items(), key=lambda kv: -abs(kv[1]))[:5]
    prompt = (
        "You are naming a built model component for a capability library.\n"
        f"Technical identity: {technical}\n"
        f"Top feature importances: {json.dumps([{'feature': k, 'importance': round(v, 4)} for k, v in top])}\n"
        f"Grounded in: {groundings}\n"
        f"Context: {extra}\n\n"
        "Propose a nominal name (<=6 words, what it FINDS, not what it's made of) and a "
        "2-sentence narrative that mentions the features it actually relies on."
    )
    ledger.spend(f"story:{technical[:30]}")
    return L.ask_json(prompt, STORY_SCHEMA, "rd_reason", tag=f"story_{technical[:24]}")


def run():
    out = build_period_frame()
    df = out["df"]
    mp = out["tables"]["MembershipPeriod"]
    lib = SessionLibrary(RUN_ID)
    budget = TrainBudget(15)
    ledger = LLMLedger()

    qualia_fns = {
        "classification": lambda: qualia_classification(df),
        "survival": lambda: qualia_survival(df),
        "uplift": lambda: qualia_uplift(df),
        "series": lambda: qualia_series(build_dues_series(mp)),
        "clustering": lambda: qualia_clustering(df),
    }

    results = []
    for sid in SESSION_ORDER:
        s = SITUATIONS[sid]
        qualia = qualia_fns[s["qualia"]]()
        prompt, manifest = build_prompt(s, qualia, lib.for_block5())
        ledger.spend(f"verdict:{sid}")
        resp = L.ask_json(prompt, TRIAGE_SCHEMA, "rd_reason", tag=f"{sid}_verdict")
        legality = validate_triage(resp, s, lib.for_block5(), qualia)
        repaired = False
        first_attempt = None
        if not legality["legal"]:
            # the reject→repair loop: code rejects with the reason; ONE retry
            first_attempt = resp
            repair_prompt = (prompt +
                             "\n\n## LEGALITY GATE — YOUR PREVIOUS VERDICT WAS REJECTED\n" +
                             "\n".join(f"- {p}" for p in legality["problems"]) +
                             "\nRe-decide within the rules. Return the full JSON again.")
            ledger.spend(f"repair:{sid}")
            resp = L.ask_json(repair_prompt, TRIAGE_SCHEMA, "rd_reason", tag=f"{sid}_repair")
            legality = validate_triage(resp, s, lib.for_block5(), qualia)
            repaired = True
        scores = score_verdict(sid, resp)
        scores["repaired"] = repaired
        exec_summary = None

        # ---- execute the verdict (the chain) ----
        if sid == "S1" and scores["triage"] in ("commit", "combine"):
            _, lab = rd_compose._prep(out)
            arms = rd_compose.run_arms(lab, out["tables"]["EventRegistration"],
                                       seeds=[201], budget=budget)
            row = arms["rows"][0]
            comps = arms["components"]
            exec_summary = row
            fi = comps["base_importance"]
            tag = story_tag(f"calibrated GBT renewal classifier (holdout AUC {row['auc_composite']}, "
                            f"PR-AUC(lapse) {row['prauc_lapse_composite']}, ECE {row['ece_composite']})",
                            fi, ["MembershipPeriod", "EventRegistration", "Order", "CourseEnrollment"],
                            "predicts renewal at period start from as-of engagement", ledger)
            lib.register(nominal_name=tag.get("nominal_name", "renewal ranker"),
                         technical="calibrated_gbt_renewal", emits=["probability"],
                         groundings=tag.get("groundings", []),
                         holdout=f"AUC {row['auc_composite']} / PR-AUC(lapse) {row['prauc_lapse_composite']}",
                         narrative=tag.get("narrative", ""), built_in=sid,
                         feature_importance=fi)
            tag2 = story_tag(f"KMeans engagement clusters (k={row['k']}, silhouette {row['silhouette']})",
                             {}, ["EventRegistration", "CourseEnrollment", "Order"],
                             "groups members by engagement cadence; cluster-id usable as a feature "
                             "or as standalone segmentation", ledger)
            lib.register(nominal_name=tag2.get("nominal_name", "engagement segments"),
                         technical="kmeans_engagement", emits=["cluster-id"],
                         groundings=tag2.get("groundings", []),
                         holdout=f"silhouette {row['silhouette']}",
                         narrative=tag2.get("narrative", ""), built_in=sid)
        elif sid == "S2" and scores["family"] == "survival":
            cov = rd_cover.run(out, budget=budget, quiet=True)
            r0 = cov["table"].iloc[0]
            exec_summary = r0.to_dict()
            tag = story_tag(f"Cox proportional-hazards time-to-lapse (C-index {r0['cindex_cox']})",
                            {}, ["MembershipPeriod.StartDate", "MembershipPeriod.CancellationDate"],
                            "ranks members by lapse hazard and yields survival curves (WHEN, not just if)",
                            ledger)
            lib.register(nominal_name=tag.get("nominal_name", "lifetime estimator"),
                         technical="coxph_time_to_lapse", emits=["hazard", "survival-curve"],
                         groundings=tag.get("groundings", []),
                         holdout=f"C-index {r0['cindex_cox']}",
                         narrative=tag.get("narrative", ""), built_in=sid)
        elif sid == "S4" and scores["family"] == "forecasting":
            fc = rd_forecast.run(out, budget=budget, quiet=True)
            exec_summary = {"mase_naive": fc["mase_naive"], "mase_ets": fc["mase_ets"]}
            tag = story_tag(f"ETS dues-revenue forecaster (MASE {fc['mase_ets']:.2f} vs naive "
                            f"{fc['mase_naive']:.2f}, trailing-12m holdout)",
                            {}, ["MembershipPeriod.DuesAmount", "MembershipPeriod.StartDate"],
                            "forecasts monthly dues revenue with trend+seasonality", ledger)
            lib.register(nominal_name=tag.get("nominal_name", "revenue outlook"),
                         technical="ets_dues_forecast", emits=["forecast-series"],
                         groundings=tag.get("groundings", []),
                         holdout=f"MASE {fc['mase_ets']:.2f}",
                         narrative=tag.get("narrative", ""), built_in=sid)
        elif sid == "S5":
            exec_summary = {"reused": scores["triage"] == "reuse"}
            # reuse = the library's cluster component answers the archetype question; no new fit
        # S3: defer — nothing to execute (that's the point)

        results.append({"sid": sid, "question": s["question"], "resp": resp,
                        "first_attempt": first_attempt,
                        "legality": legality, "scores": scores,
                        "exec": exec_summary, "prompt_manifest": manifest,
                        "library_size_at_ask": len(lib.for_block5())})
        print(f"[{sid}] family={scores['family']} triage={scores['triage']} "
              f"family_ok={scores['family_ok']} triage_ok={scores['triage_ok']} "
              f"legal={legality['legal']} repaired={repaired} hard_fail={scores['hard_fail']}")

    # ---- ablations (EMPTY library = like-for-like with a first ask) ----
    ablations = []
    for sid, drop in (("S1", {"QUALIA"}), ("S2", {"QUALIA"}), ("S3", {"CATALOG"})):
        s = SITUATIONS[sid]
        qualia = qualia_fns[s["qualia"]]()
        prompt, _ = build_prompt(s, qualia, [], drop_blocks=drop)
        ledger.spend(f"ablation:{sid}")
        resp = L.ask_json(prompt, TRIAGE_SCHEMA, "rd_reason", tag=f"{sid}_ablate_{'_'.join(drop)}")
        sc = score_verdict(sid, resp)
        ablations.append({"sid": sid, "dropped": list(drop), "family": sc["family"],
                          "triage": sc["triage"], "family_ok": sc["family_ok"],
                          "triage_ok": sc["triage_ok"], "hard_fail": sc["hard_fail"]})
        print(f"[ablation {sid} -{drop}] family={sc['family']} triage={sc['triage']} "
              f"ok={sc['family_ok'] and sc['triage_ok']}")

    # ---- stability: S1 asked twice (EMPTY library — replicates the original context) ----
    s = SITUATIONS["S1"]; qualia = qualia_fns[s["qualia"]]()
    prompt, _ = build_prompt(s, qualia, [])
    ledger.spend("stability:S1")
    resp2 = L.ask_json(prompt, TRIAGE_SCHEMA, "rd_reason", tag="S1_stability_repeat")
    sc2 = score_verdict("S1", resp2)
    first_s1 = next(r for r in results if r["sid"] == "S1")
    stable = (sc2["family"] == first_s1["scores"]["family"] and
              sc2["triage"] == first_s1["scores"]["triage"])

    # ---- scoring ----
    per = [(r["scores"]["family_ok"] and r["scores"]["triage_ok"]
            and r["scores"]["hard_fail"] is None) for r in results]
    n_ok = sum(per)
    s3 = next(r for r in results if r["sid"] == "S3")
    s3_defers = s3["scores"]["triage"] == "defer" and s3["scores"]["hard_fail"] is None
    cit = float(np.mean([r["legality"]["citations_valid"] for r in results]))
    meaningful = sum(r["scores"]["meaningful_ok"] for r in results)
    reuse_happened = any(r["sid"] == "S5" and r["scores"]["triage"] == "reuse" for r in results)
    abl_ok = sum(a["family_ok"] and a["triage_ok"] and a["hard_fail"] is None
                 for a in ablations)
    full_on_same = sum(1 for r in results if r["sid"] in ("S1", "S2", "S3")
                       and r["scores"]["family_ok"] and r["scores"]["triage_ok"]
                       and r["scores"]["hard_fail"] is None)
    delta = full_on_same / 3 - abl_ok / 3

    verdict = "PASS" if (n_ok >= 4 and s3_defers and cit >= 0.8 and meaningful >= 4
                         and delta >= 0.15) else \
              ("REVISE" if n_ok >= 3 and s3_defers else "KILL")

    print(f"\n=== RD-REASON summary ===")
    print(f"situations correct: {n_ok}/5 | S3 defers: {s3_defers} | citations {cit:.2f} | "
          f"meaningfulness {meaningful}/5 | reuse@S5: {reuse_happened}")
    print(f"ablation delta (full-vs-ablated on S1/S2/S3): {delta:+.2f} | S1 stable repeat: {stable}")
    print(f"train budget: {budget.state()} | LLM calls: {len(ledger.calls)} → {verdict}")

    lib.save()
    R.save_result("rd_reason", {
        "session_order": SESSION_ORDER,
        "per_situation": [{k: v for k, v in r.items() if k != "resp"} |
                          {"verdict_summary": {kk: r["resp"].get(kk) for kk in
                           ("task_family", "triage", "model_worth_building",
                            "expected_meaningfulness", "data_prerequisites",
                            "calibration_required")}} for r in results],
        "raw_responses": {r["sid"]: r["resp"] for r in results},
        "ablations": ablations, "stability_S1_repeat_same": bool(stable),
        "n_correct": n_ok, "s3_defers": bool(s3_defers), "citations_valid": cit,
        "meaningfulness_ok": int(meaningful), "reuse_at_S5": bool(reuse_happened),
        "ablation_delta": float(delta), "train_budget": budget.state(),
        "repairs_needed": int(sum(r["scores"].get("repaired", False) for r in results)),
        "llm_calls": ledger.calls, "verdict": verdict,
        "pass_bar": ">=4/5 correct AND S3 defers (post-repair, <=1 repair) AND "
                    "citations>=0.8 AND meaningfulness>=4/5 AND ablation delta>=0.15",
    })


if __name__ == "__main__":
    run()
