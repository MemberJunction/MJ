---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/server": patch
---

Fix agent-run steps (and prompt runs) occasionally stuck at `Status='Running'` / `CompletedAt=NULL`.

When a step finished fast enough that its fire-and-forget INSERT was still in flight, the in-memory
finalize mutation (`Completed`) was reverted by the INSERT's post-save reload
(`BaseEntity.finalizeSave` → `init()` + `SetMany(insertedRow)`), and the chained force-persisted UPDATE
then wrote the stale `Running` row. Predominantly hit fast Actions, but any fast step (e.g. a
quick/cached prompt) could be affected.

The fire-and-forget save queue now applies finalize/`TargetLogID` mutations INSIDE the post-INSERT
continuation (after the reload), so they survive: `AgentRunStepSaveQueue.QueueUpdate` gains an optional
`applyMutation` callback, `finalizeAgentRunStep` gains a `completedAt` option for deterministic re-apply,
and `BaseAgent.finalizeStepEntity` + the three `TargetLogID` callback sites re-assert their values
post-INSERT. `AIPromptRunner.updatePromptRun` now awaits the initial INSERT before mutating the final
state. This mirrors the already-correct `ActionEngine.finalizeActionLog` pattern (which has zero stuck
rows). Adds regression tests covering the race and the legacy clobber.

Also removes a per-chunk `console.log` in `RunAIAgentResolver`'s streaming callback (debug noise that
became hot once single-model prompt streaming was enabled).
