# RD-REASON — The agent reasons through five real situations (the centerpiece)

**Verdict: PASS (5/5, with the layered honesty story demonstrated live).**

## Method
ONE session over the real More Cheese schema. Per situation, the prompt is **assembled from 7 framework-state blocks** (GOAL, GROUNDED SCHEMA with the excluded traps shown, code-computed NODE QUALIA, port-typed COMPONENT CATALOG, session REUSE library, BANKS & GATES, typed OUTPUT CONTRACT incl. `model_worth_building` + `expected_meaningfulness` + `validation_plan`). Verdicts are code-validated (`validate_triage` — the standalone twin of `validateTriageDecision`), **executed** (RD-COMPOSE / RD-COVER / RD-FORECAST), story-tagged, and registered so later situations can reuse earlier components. Order S1→S2→S4→S5→**S3 last** (reuse-temptation resistance). Gemini 2.5-flash, temp 0, all audited.

## Results (`results/rd_reason.result.json`)
| Situation | Verdict | Correct? |
|---|---|---|
| S1 Who will renew? | classification / **combine** (cluster+HMM into calibrated GBT), calibration + rank metrics flagged | ✅ |
| S2 When will a member lapse? | **survival** / commit (cited events=69, censored=0.956) | ✅ |
| S4 Dues revenue next year? | **forecasting** / commit, time-ordered validation in the plan | ✅ |
| S5 What archetypes exist? | **clustering** / commit (run 2; run 1 chose **reuse** of S1's cluster component — both legal) | ✅ |
| S3 Who is worth contacting? | **defer** naming contact/intervention history — after ONE code-gated repair | ✅ |

- **The headline finding (run 1 vs run 2):** single-shot, with a library full of tempting classifiers, the agent **reused the renewal risk-ranker as an uplift answer** — the risk-vs-uplift conflation, the exact real-world failure V10 quantified — *despite a prose warning in the banks block*. The **deterministic identification gate** (uplift + `treatment_column_present=False` ⇒ only defer is legal) rejected it, and the **reject→repair loop** recovered the correct DEFER in one retry. Prose guidance was insufficient; the typed gate was — the plan's "LLM proposes, code enforces" thesis, demonstrated on the hardest case.
- **Citations 1.00** (every cited stat exists in Block 3), **meaningfulness 5/5** (each verdict names the decision informed, a base-rate-appropriate value metric — rank/PR at 94% renewal — and an honest qualia-grounded ceiling).
- **Ablations:** dropping the CATALOG made S3 commit a plain classifier — **the port-typed catalog is load-bearing for honesty**, not decoration. Dropping QUALIA left S1/S2 family-correct (real questions carry family in their wording — weaker stats-dependence than V4's synthetic scenarios; noted honestly). Net delta +0.33, driven by the honesty case.
- **Stability:** S1 repeat (same empty-library context) → same verdict. **Budget:** 15/15 fits, never exceeded. **The chain:** components built in S1/S2/S4 were story-tagged and registered; run 1's S5 demonstrably reused S1's cluster component.

## Design consequences (fed to Doc 5)
1. The identification gate belongs in `validateTriageDecision` as CODE (landed here first).
2. The output contract must include `validation_plan` (surfaced when S4's first run had nowhere structured to state it — mirrors `ModelingPlanSpec.ValidationStrategy`).
3. Reuse-temptation is real: library presence changes verdicts; the repair loop is the correct containment.

## Reproduce
`.venv/bin/python realdata/rd_reason.py` (sources `.env.local`). Raw prompts/verdicts hashed per block in `results/llm_audit.jsonl`.
