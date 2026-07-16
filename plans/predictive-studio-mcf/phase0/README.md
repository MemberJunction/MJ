# Phase 0 — Idea-Validation Program

**Purpose.** Test the *contested bets* of the Model Component Framework with cheap, falsifiable experiments **before** any framework machinery is built. This is Tier 0 (does the idea work?) — distinct from Tier 1 (is the software correct?), which is the production test suite built later. See ADDENDUM 5 of the master plan.

**Standing rule.** Every number in every memo comes from the locked-holdout **referee** (`harness/referee.py`), which carves a holdout once, hashes its rows, and scores it exactly once per experiment arm — logging everything to an append-only audit JSONL under `results/`. No experiment computes its own holdout number. Phase 0 practices the honesty it tests.

**Environment.** Self-contained venv at `phase0/.venv` (Python 3.13). Runs on standalone Python (sklearn / xgboost / lightgbm / lifelines / statsmodels / hmmlearn) — needs no MCF migration, no catalog, no framework code. LLM-dependent arms (V1, V4, V8, V5-agent) call an external model API; model + prompt checksums are recorded per run.

## Folder layout

| Folder | Contents |
|---|---|
| `harness/` | Reusable kit: `generators.py` (seeded planted-truth mini-generators), `referee.py` (locked-holdout scorer + audit log), `dials.py` (withLeakage/withMissing/…), `llm.py` (structured-output LLM harness) |
| `experiments/` | One runnable script per experiment: `v1_semantic_leakage.py`, `v2_component_lift.py`, … Each prints a result table and writes a result JSON. |
| `results/` | Machine output: per-run audit JSONL, per-experiment result JSON, seeds. The reproducible proof. |
| `memos/` | One human-readable memo per experiment (hypothesis · method · N/seeds · result table · verdict · what it gates) + the final `PHASE0_VERDICT.md`. |
| `data/` | Any fixed datasets (real association data if provided; otherwise generators are seeded and need none). |

## The experiments + kill criteria (summary — full spec in plan ADDENDUM 5)

| ID | Bet tested | PASS bar | KILL consequence | LLM? |
|---|---|---|---|---|
| **V1** | semantic leakage detection beats statistics | LLM recall ≥0.8 on name-only leaks, decoy-FP ≤0.2, union > stats by ≥0.2 | drop "semantic leakage screening" claim | yes |
| **V2** | components-as-features lift a GBT (THE composition bet) | ≥+0.03 AUC on ≥2/3 planted + ≥+0.01 realistic | **Docs 4–5 composition → research track; pillars only** | no |
| **V3** | task coverage: survival beats GBT-windows | survival wins timing + calibration | family deprioritized | no |
| **V4** | agent triage validity (commit/defer/combine) | ≥80% accuracy w/ stats, ≥15pt over no-stats | triage → human-confirm / redesign | yes |
| **V5** | reproduce p-hacking AND contain it with locked holdout | Arm A overfits noise ≥0.1; Arm B holdout stays at dummy | (informative either way — no gate) | partial |
| **V6** | shipped-class models are miscalibrated; isotonic fixes | raw ECE ≥0.05, isotonic cuts ≥50% | (ammunition — no gate) | no |
| **V7** | naive aggregation leaks; as-of doesn't (Featuretools grave) | naive shows val↔temporal gap; as-of none | (informative — no gate) | no |
| **V8** | meaning-tag retrieval beats keyword | nominal top-3 ≥0.8, ≥0.2 over keyword | right-size tagging investment | yes |

## Run order (trust-building first)

harness → **V7, V5** (graveyard reproductions — what Arie is waiting on) → **V1, V2** (core bets) → **V4** → **V6, V3** → **V8**.

## Status

See `memos/PHASE0_VERDICT.md` (updated as experiments complete) for the live scoreboard.
