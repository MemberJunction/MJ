# V1 — Semantic Leakage Detection (the "meaning catches what statistics can't" bet)

**Verdict: PASS** — this is the single clearest demonstration of *why* an LLM-era system can differ from the AutoML graveyard.

## Hypothesis
An LLM reading only the schema + column descriptions (never data values) flags planted target leakage a correlation screen misses — especially a leak whose statistical signal is faint but whose *name* is a giveaway — and the union of both screens beats either alone.

## Method
A renewal-prediction schema (Gemini 2.5-flash, 3 seeds) with three leak classes planted among honest features and three decoys (suspicious-looking but harmless names, e.g. `RenewalReminderCount` = reminders *sent* pre-decision):
- **(a) direct proxy** — `InvoicePaidThisYear` (strong correlation)
- **(b) post-outcome** — `CancellationProcessedDate` (staff action after the outcome)
- **(c) name-only** — `RenewalConfirmationEmailOpened`, correlation deliberately dampened below 0.3, but the name is a dead giveaway

Two screens: **STATISTICAL** — a reasonable |corr| > 0.30 flag (not a strawman); **SEMANTIC** — the LLM given only {name, description, dtype}, never a single value.

## Result (mean over 3 seeds, `results/llm_audit.jsonl`)

| metric | statistical (0.30) | semantic (LLM) | union |
|---|---|---|---|
| overall leak recall | 0.67 | **1.00** | **1.00** |
| name-only leak (c) recall | **0.00** | **1.00** | 1.00 |
| decoy false-positive rate | 0.00 | **0.00** | — |

PASS bar: semantic name-only recall ≥ 0.8 (**1.00**), decoy FP ≤ 0.2 (**0.00**), union − stats ≥ 0.2 (**0.33**).

## Reading
The statistical screen did its job on the strongly-correlated leaks (0.67 recall) but was structurally blind to the name-only leak — its correlation was below any sane threshold, so *no purely statistical method could catch it*. The LLM caught all three, including the name-only one, and did **not** trip on any of the three decoys (it correctly kept `RenewalReminderCount`, reasoning that reminders are sent pre-decision). This is precisely the capability the AutoML graveyard lacked: its optimizer saw anonymous floats, so a leak that wasn't statistically loud was invisible. Meaning makes it visible.

## What it does for the plan
Validates the semantic-leakage-screening claim (WS-2 / the leakage guard) with a clean, reproducible result, and is the crispest possible artifact for the core thesis to Arie: *"the thing that changed since 2019 is that the screener can read."* The design consequence is already the plan's: run **both** screens and take the union — statistics for the loud leaks, meaning for the quiet-but-named ones.

## Caveat
One schema, one model, temperature 0. The result is strong but should be widened across more schemas/models before load-bearing production claims; the mechanism, though, is not model-specific — any competent LLM reads `CancellationProcessedDate` as post-outcome.

## Reproduce
`./run.sh v1_semantic_leakage` — seeds 61–63, model gemini-2.5-flash. Prompts + responses in `results/llm_audit.jsonl`; summary in `results/v1_semantic_leakage.result.json`.
