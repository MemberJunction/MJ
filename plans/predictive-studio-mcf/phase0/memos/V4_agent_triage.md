# V4 — Agent Triage Validity (the grand-plan loop's core decision)

**Verdict: PASS** — and it proves the statistics are load-bearing, not decorative.

## Hypothesis
An LLM given only computed statistics (no framework) makes the correct task-family + commit/defer/combine call ≥80% of the time, and the statistics materially help versus a no-stats ablation.

## Method
Seven scenarios with known-correct triage (clean-linear, survival, seasonal, cluster-heterogeneous, pure-noise, overdispersed-count, ambiguous) × 2 seeds. For each, a compact honest statistics block is computed from generated data (n, target type, class balance or variance/mean, best feature correlation, quick CV of linear vs GBT, censoring fraction, seasonality autocorrelation, Hopkins cluster tendency) and handed to Gemini 2.5-flash, which returns {task_family, triage, cited_stats}. **Ablation arm:** same goal wording, no statistics.

## Result (14 cases, `results/llm_audit.jsonl`)

| metric | value | bar |
|---|---|---|
| task-family accuracy (with stats) | **1.00** | — |
| full triage accuracy (with stats) | **0.86** | ≥0.80 |
| full triage accuracy (no stats) | 0.29 | — |
| **statistics advantage** | **+0.57** | ≥0.15 |

Every family routed correctly: continuous→linear, censored→survival, time-indexed→forecasting, cluster-tendency→combine (cluster-then-classify), no-signal→no_model, overdispersed count→count/GLM.

## Reading
Given honest statistics, the agent's routing was essentially perfect and its commit/defer/combine call correct 86% of the time. Stripped of the statistics — asked to triage from the goal sentence alone — it collapsed to 29%. **That 57-point gap is the whole argument for the Statistician sub-agent:** the LLM's judgment is only trustworthy when it reasons over computed numbers, not prose. This is also the anti-hallucination design in miniature — meaning guided by statistics, not meaning alone.

The two misses were both the "ambiguous" scenario, where the agent **committed to linear** instead of **deferring** as my rubric demanded. That is arguably the agent being *reasonable* (near-tied linear/GBT — picking one is defensible), not wrong; scored strictly it still cleared the bar. If anything it suggests the "defer" threshold is a tuning knob for the real Architecture Strategist, not a flaw in the idea.

## What it does for the plan
Validates Doc 5's triage design and the Statistician sub-agent pre-build, and sets the honest expectation: route task families with high confidence, treat commit-vs-defer as the softer call. The design consequence (already the plan's REVISE path): the triage decision must **cite the statistic that drove it** — which the agent did throughout, and which the eval harness will grade.

## Caveat
14 cases, one model. This is a pre-build signal, not the production eval — Doc 5's 12-scenario harness (more scenarios, adversarial verification, LLM-judge on citation validity) is the real gate. But the pre-build signal is strongly positive.

## Reproduce
`./run.sh v4_agent_triage` — seeds 71–72, model gemini-2.5-flash. Prompts + responses in `results/llm_audit.jsonl`; summary in `results/v4_agent_triage.result.json`.
