"""
The 7-block prompt constructor (A6.5) — THE answer to "when someone asks a
question, how is the prompt constructed?"

build_prompt() deterministically assembles one block per framework subsystem:
  1 GOAL (Goal Analyst)         2 GROUNDED SCHEMA (Data Scout + leakage guard)
  3 NODE QUALIA (Statistician)  4 COMPONENT CATALOG (registry, progressive disclosure)
  5 REUSE CANDIDATES (library)  6 BANKS & GATES (tree walk-up)
  7 OUTPUT CONTRACT (validateTriageDecision)

Each block's sha256 goes into the manifest so every LLM judgment is traceable to
the exact framework state it saw. Ablations drop a block by name.
"""
from __future__ import annotations
import hashlib
import json

from catalog import filter_catalog, render_entry
from features import ASOF_NUM, ASOF_CAT, LEAK_TRAPS

# plain-English meaning + grounding per as-of feature (Block 2)
FEATURE_MEANINGS: dict[str, str] = {
    "tenure_days": "days since the member joined (Person.JoinDate), as of the period start",
    "prior_periods": "count of this member's earlier membership periods (MembershipPeriod)",
    "prior_lapses": "count of earlier periods that ended Lapsed (MembershipPeriod.Status)",
    "events_before": "event registrations before the period start (EventRegistration.RegisteredOn)",
    "events_attended": "events actually attended before the period start (EventRegistration.Attended)",
    "attend_rate": "attended / registered ratio before the period start",
    "event_recency_days": "days since last event registration (9999 = never)",
    "courses_before": "course enrollments before the period start (CourseEnrollment.EnrolledOn)",
    "courses_completed": "courses completed before the period start (CourseEnrollment.Status)",
    "complete_rate": "completed / enrolled ratio before the period start",
    "orders_before": "orders placed before the period start (Order.OrderDate)",
    "order_recency_days": "days since last order (9999 = never)",
    "payments_before": "payments made before the period start (Payment.PaymentDate)",
    "dues_amount": "this period's dues amount (MembershipPeriod.DuesAmount)",
    "auto_renew": "auto-renew flag on this period (MembershipPeriod.AutoRenew)",
    "start_year": "the period's start year",
    "tier": "membership tier (MembershipPeriod.MembershipTier)",
    "segment": "member segment (Person.Segment: Producer/Retailer/Enthusiast/Supplier/Educator)",
    "region": "member region (Person.Region)",
}

EXCLUDED_REASONS: dict[str, str] = {
    "Status": "the period outcome itself — the label source",
    "CancellationDate": "written at cancellation time; post-outcome",
    "CancellationReason": "written at cancellation time; post-outcome",
    "RenewalDate": "written when renewal is processed; post-outcome",
    "EndDate": "finalized when the period closes; post-outcome",
}

BANKS_BY_FAMILY: dict[str, list[str]] = {
    "classification": [
        "impute: median (P1) | sentinel-with-indicator (P2)",
        "transform: — (tree families) | yeo-johnson (P2, linear family only)",
        "scale: — for tree families (scale-invariant) | standardize REQUIRED for linear/MLP",
        "encode: one-hot (P1) | target-encode (P2, high-cardinality only)",
        "GATE (class balance 0.944, minority n=69): prefer class-weighting; judge by PR-AUC/"
        "lift-at-k, NOT accuracy; stratified k-fold CV mandatory",
        "GATE (probabilities consumed downstream): calibration required (CV form)",
    ],
    "survival": [
        "impute: median (P1)",
        "scale: standardize for Cox (P1)",
        "GATE (heavy censoring): use a censoring-aware family; naive regression on observed "
        "durations is biased; report C-index",
    ],
    "forecasting": [
        "transform: none | log (if variance grows with level)",
        "GATE (time series): validation MUST be a trailing time window — random splits leak the future",
        "GATE (floor): must beat seasonal-naive (MASE < 1)",
    ],
    "clustering": [
        "scale: standardize REQUIRED (distance-based)",
        "GATE (k): choose k by silhouette; if all silhouettes are weak, say so — do not force clusters",
    ],
    "uplift": [
        "GATE (identification): requires a treatment/exposure column from a randomized or "
        "well-understood assignment; without it uplift is unidentifiable — DEFER and name the data needed",
        "GATE (probabilities): base models must be calibrated (uplift is a DIFFERENCE of probabilities)",
    ],
    "regression": [
        "impute: median (P1)", "scale: standardize for linear (P1); — for tree",
        "encode: one-hot (P1)",
    ],
}

CONTRACT_TEXT = """Return JSON matching the provided schema. Legality rules (enforced by code after you answer):
- triage=combine  => composition_graph required; it must instantiate a TEMPLATE from Block 4 whose sockets your chosen components fill, with port-compatible edges (or a listed adapter).
- triage=reuse    => chosen_components must name a Block 5 candidate.
- triage=defer    => data_prerequisites must name the concrete missing data, OR chosen_components must list >=2 candidate families to branch.
- cited_stats     => every entry must quote a statistic that appears in Block 3, by exact name and value.
- model_worth_building + expected_meaningfulness are REQUIRED: name the concrete decision the model would inform, the value metric that matters GIVEN the data (e.g. base rates), and an honest expected-performance ceiling grounded in Block 3.
- validation_plan is REQUIRED: HOW the model must be validated for its verdict to be trusted (split type, metric). Respect the Block 6 gates.
Decide. Do not invent statistics, components, or ports that are not in the blocks above."""


def _schema_block(extra_note: str = "") -> str:
    lines = ["AVAILABLE FEATURES (assembled AS-OF each period's start date — engagement strictly before the decision):"]
    for c in ASOF_NUM + ASOF_CAT:
        lines.append(f"- {c}: {FEATURE_MEANINGS.get(c, '')}")
    lines.append("\nEXCLUDED by the leakage guard (visible for transparency; you may NOT use them):")
    for c, why in EXCLUDED_REASONS.items():
        lines.append(f"- {c} — EXCLUDED: {why}")
    if extra_note:
        lines.append(f"\n{extra_note}")
    return "\n".join(lines)


def build_prompt(situation: dict, qualia: dict, library: list[dict],
                 drop_blocks: set[str] | None = None) -> tuple[str, dict]:
    """Assemble the 7-block prompt. drop_blocks ∈ {'QUALIA','CATALOG'} for ablations."""
    drop = drop_blocks or set()
    fam = situation["family"]
    entries, adapters = filter_catalog(fam)

    blocks: dict[str, str] = {}
    blocks["GOAL"] = (f"QUESTION: {situation['question']}\n"
                      f"UNIT OF ANALYSIS: {situation['unit']}\n"
                      f"A good answer names the decision it informs and how its value would be judged.")
    blocks["SCHEMA"] = _schema_block(
        "" if fam != "uplift" else
        "NOTE: this is the complete schema — there is no record of who was contacted, "
        "invited personally, or intervened on.")
    if "QUALIA" not in drop:
        blocks["QUALIA"] = "COMPUTED STATISTICS (code-computed on the real data; cite these by name):\n" + \
            json.dumps(qualia, indent=1)
    if "CATALOG" not in drop:
        cat = "\n".join(render_entry(c) for c in entries)
        ad = "\n".join(f"- ADAPTER: {a['name']} — {a['strategy']}" for a in adapters)
        blocks["CATALOG"] = ("COMPONENT CATALOG (typed ports; composition is legal only on port match "
                             "or a listed adapter):\n" + cat + ("\n" + ad if ad else ""))
    lib = ("None yet — this is the first question of the session." if not library else
           "\n".join(f"- \"{r['nominal_name']}\" [{r['technical']}] emits: {r['emits']} "
                     f"grounded in: {r['groundings']} holdout: {r['holdout']} — {r['narrative']}"
                     for r in library))
    blocks["REUSE"] = "COMPONENTS ALREADY BUILT THIS SESSION (reuse before rebuilding):\n" + lib
    blocks["BANKS"] = "PREPROCESSING BANKS & GATES for the candidate families:\n" + \
        "\n".join(f"- {b}" for b in BANKS_BY_FAMILY.get(fam, []))
    blocks["CONTRACT"] = CONTRACT_TEXT

    text = "You are the model-design agent for an association-management platform.\n\n"
    manifest = {}
    for i, (name, content) in enumerate(blocks.items(), 1):
        text += f"## BLOCK {i} — {name}\n{content}\n\n"
        manifest[name] = hashlib.sha256(content.encode()).hexdigest()[:12]
    return text, manifest
