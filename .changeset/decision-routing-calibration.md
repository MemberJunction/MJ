---
"@memberjunction/ai": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ng-conversations": minor
---

Conversation routing acts on calibrated probabilities (plan Task 2.4). `ApplyPlattCalibration` and `PlattCalibration` in `@memberjunction/ai` map a decision model's raw probability to a calibrated one. Routing calibrates the thread Likelihood per answering model (`ROUTING_CONTINUES_CALIBRATION`: Jev and LLM Decision, fitted by the Phase 2 Decision Eval), treats an uncalibrated model's answer as unsure, and waits 350 ms instead of 250 ms, which covers about 95% of Jev's answers.
