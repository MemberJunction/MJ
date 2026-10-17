---
"@memberjunction/actions-base": patch
"@memberjunction/ai-agents": patch
"@memberjunction/global": patch
---

Document the core performance work merged in #5729, which shipped without a changeset, and fix two defects it introduced.

**What #5729 changed**
- Agent run steps store less. A step whose end payload repeats an earlier step's stored end now points at that step through the new `AIAgentRunStep.PayloadAtEndSourceStepID` column instead of storing a second copy, the same way `PayloadAtStartSourceStepID` already works for start payloads. Prompt steps no longer store the volatile `<mj-runtime-state>` messages, and later Prompt steps of a run store only the messages added since the previous Prompt step.
- Core data access, caching and lookups are faster: indexed lookups replace linear scans in entity metadata, `BaseAIEngine`, the action engine and the class factory, and entity, cache, template and agent-runtime hot paths do less work per call.

**Fixes**
- `ActionEngineBase` lookup indexes now stay current after a save or delete. BaseEngine applies these changes to the cached arrays in place, and the params and result-code indexes were rebuilt only when the array was replaced, so they kept the old rows until restart. A param switched to `LogValue = false` kept being logged in plaintext to `ActionExecutionLog.Params`, a new `LogValue = false` param was not redacted, `GetActionByName` returned a renamed action's old entity, and `GetResultCode` missed new codes. The engine now discards its indexes on every data change, and the next lookup rebuilds them.
- Resuming a stopped agent run now rebuilds the message stack the run actually had. Prompt steps stored only new messages even after the loop had replaced, removed or rewritten earlier ones (expiry stubs, expiry removal, compaction, expansion), so a resume brought back expired or removed messages. A Prompt step now stores only the new messages when the earlier ones are unchanged, and stores the full stack otherwise. A resume starts from the latest full stack and appends the later additions. Runs recorded before this change still resume as before.
- Two step-payload lookups added in #5729 use `IndexByUUID` instead of a nested `UUIDsEqual` scan, and the nested-scan baselines for `BaseAIEngine.ts` and `entityInfo.ts` are lowered to their current counts, so the Source guards test passes again.

**Migration note for development databases**
Migration `V202610141910__v6.2.x__AIAgentRunStep_PayloadAtEndSourceStepID.sql` sorts below `V202610151535`, which merged first. Released databases (`6.2.0-edge.4` is at `V202610131859`) apply both, in order, on upgrade. A development database that was migrated from `next` after `V202610151535` landed but before #5729 merged has skipped `V202610141910`, because Flyway's `outOfOrder` defaults to `false`. On such a database, set `outOfOrder: true` in `mj.config.cjs`, run `mj migrate` once, then remove the setting.
