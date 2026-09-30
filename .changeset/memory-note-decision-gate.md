---
"@memberjunction/ai-agents": patch
---

The Memory Manager can gate extracted notes on a typed decision instead of the extraction prompt's self-reported confidence (`EnableDecisionGate`, or `enableDecisionGate` in `params.data`; off by default). Each candidate note is asked as its own Likelihood, calibrated per model, and kept at a calibrated 0.6. Only Jev is calibrated: measured on 337 labelled notes, it kept 6.2% of conversation-only notes at 96.1% precision, where the self-reported rule kept 40.0% at 85.3%. A batch answered by an uncalibrated model, or a failed call, falls back to the self-reported rule.

- The decision's run step joins the agent run's steps and carries the decision's prompt run, so the run's cost and token totals count the gate.
- Each note is judged against the conversation it came from: one decision per conversation, with that conversation's excerpt formatted as the measurement's corpus was (`FormatMemoryNoteExcerpt`, `GroupMemoryNotesByConversation`). A note that names none of several conversations keeps the self-reported rule.
- A note the calibrated model gave no usable answer for keeps the self-reported rule, as a failed call's batch does. Corrective notes mined from failed runs are not gated, since the gate was measured on conversation notes only. The gate's calls take the run's cancellation signal.
