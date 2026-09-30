---
"@memberjunction/ai-agents": patch
---

The Memory Manager can gate extracted notes on a typed decision instead of the extraction prompt's self-reported confidence (`EnableDecisionGate`, or `enableDecisionGate` in `params.data`; off by default). Each candidate note is asked as its own Likelihood, calibrated per model, and kept at a calibrated 0.6. Only Jev is calibrated: measured on 337 labelled notes, it kept 6.2% of conversation-only notes at 96.1% precision, where the self-reported rule kept 40.0% at 85.3%. A batch answered by an uncalibrated model, or a failed call, falls back to the self-reported rule.
