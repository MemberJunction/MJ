---
"@memberjunction/ai-agents": patch
"@memberjunction/testing-engine": patch
---

Sage's agent-discovery decision now judges its answers calibrated per decision model, at a threshold set from the agent-discovery Decision Eval: `DECISION_DISCOVERY_MIN_CONFIDENCE` is 0.85, and `DECISION_DISCOVERY_CALIBRATION` holds the fitted Platt parameters for Jev and LLM Decision. Each calibration applies only to the exact model it was fitted on, through `FindDecisionCalibration` (`@memberjunction/ai-core-plus`): Jev at its pinned `typesafe/jev-1.13-20260917`, and LLM Decision only when its GPT-OSS-120B chat model answered. An answer from a model with no calibration is treated as unsure, and discovery warns once per such model. The Decision Eval records whether production would inject through the same calibrated path.
