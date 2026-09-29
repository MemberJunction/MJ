---
"@memberjunction/ai-agents": patch
"@memberjunction/testing-engine": patch
---

Sage's agent-discovery decision now judges its answers calibrated per decision model, at a threshold set from the agent-discovery Decision Eval: `DECISION_DISCOVERY_MIN_CONFIDENCE` is 0.85, and `DECISION_DISCOVERY_CALIBRATION` holds the fitted Platt parameters for Jev and LLM Decision. An answer from a model with no calibration is treated as unsure. The Decision Eval records whether production would inject through the same calibrated path.
