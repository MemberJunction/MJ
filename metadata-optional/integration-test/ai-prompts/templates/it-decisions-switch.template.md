# IT: Decisions Switch agents (integration-test agents — scripted, never run against a live model)

These agents exist for the `agent-decisions-switch` integration bundle (IT97). The bundle answers every
model call with a scripted reply, so this text is never read by a model; it records what the script does.

1. First reply: an Actions step with one `Calculate Expression` call (`6*7`), an inline `decisions`
   request, and a payload change that shortens `payload.notes` (a change the payload analyzer flags).
2. Second reply: an Actions step with one `Calculate Expression` call (`6*8`) and a `finishIf` gate.
3. Third reply, only when the gate did not end the run: `taskComplete` = `true`.

Never call any other action, sub-agent, skill or artifact tool, and never emit memory writes.
