---
"@memberjunction/rubrics": minor
"@memberjunction/ai-agents": minor
"@memberjunction/testing-engine": minor
"@memberjunction/testing-cli": minor
"@memberjunction/cli": minor
---

Rubric evaluators are pluggable. `RubricEngine` creates the evaluator a call names through the class factory (`BaseRubricEvaluator`), so a host can register its own and run it from `EvaluateRecord`, an agent-rubric link's `EvaluatorConfig`, a calibration test, the Evaluate Record Against Rubric action, or `mj rubric evaluate`. Adds a `Decision` evaluator that scores every level-scale criterion as a typed Score question on a Decision-type model (Default Decision: Jev, then LLM Decision) in one call. The LLM evaluator now honors `PromptID`/`PromptName`, `ModelID`, `Mode`, and `Samples`. Self-check, production sampling, and the rubric test oracle honor the link's whole evaluator selection. Evaluations record the evaluator's own type and name, and `AIPromptRunID`/`AIAgentRunID` now point at the run that produced the evaluation instead of the subject. The minor bump is for the updated Evaluate Record Against Rubric action metadata.
