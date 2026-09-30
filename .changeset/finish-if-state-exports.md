---
"@memberjunction/ai-agents": patch
---

feat(ai-agents): export the finishIf gate's pure parts, so an eval can apply exactly production's rule

The finishIf gate's state formatting, question building, verdict and validation now live in one pure module, `finish-if-state.ts`, and `BaseAgent` and `LoopAgentType` call it. Nothing the gate does changes; a test pinned the formatter's output before the move.

- `FormatActionForFinishIf`, `FormatSubAgentForFinishIf` and `CapFinishIfState` build the state the decision model reads, with `FINISH_IF_STATE_MAX` (16,000) and `FINISH_IF_STATE_EXCERPT` (2,000).
- `BuildFinishIfQuestions` maps the questions onto `q1`, `q2`, … Likelihood questions.
- `JudgeFinishIf` is the pass/fail rule: every question needs a Likelihood answer that reaches the threshold, so a missing answer, an answer of another kind or a non-numeric probability fails it. With no question at all it fails closed (production never asks an empty set: `IsValidFinishIf` requires one).
- `IsValidFinishIf` is the loop agent type's check: one to three non-empty questions and a non-empty message.

The finishIf replay eval (`integration-test-suite/rigs/finishif-replay.ts`) uses them to replay the gate on recorded runs.
