---
"@memberjunction/integration-test-suite": patch
---

Fix the live-agent harness reaching prompt runs through a column that does not exist, and stop it swallowing the failure

Three live-harness helpers filtered `MJ: AI Prompt Runs` on `AgentRunID`. That column is not on
`AIPromptRun` — its only agent-facing field is `AgentID`. A prompt run is reachable from its agent
run solely through the step that invoked it: an `MJ: AI Agent Run Steps` row with `StepType='Prompt'`
whose `TargetLogID` is the prompt run's ID.

The reason a nonexistent column survived in committed code is the second half. `RunView` does not
throw — it returns `Success: false` with an `ErrorMessage` — and each helper coalesced that to `[]`,
making a SQL error indistinguishable from "this run made no model calls". Callers read zero prompt
runs and either passed vacuously or failed on an unrelated-looking assertion. The swallow was the
actual defect; the wrong column name only exploited it.

The linkage rule now exists once, in `promptRunIdsFromSteps`, instead of being restated in four
places with three of them wrong. `deepDeleteRunTrees` resolves prompt runs *before* deleting steps —
the previous order deleted the steps first and destroyed the only path to those rows, so teardown
silently leaked every prompt run it claimed to purge. `requireRows` replaces the swallow in the read
helpers; teardown paths stay non-throwing by design but now log rather than going quiet.

`RS7` asserted a short-circuit with a 2-char query while `SearchEngine.MIN_TERM_LENGTH` is now 2
(lowered from 3 so short queries like "AI" and "US" are searchable), so it no longer described
product behavior. It now probes with a single character, below both the old and current thresholds,
testing the short-circuit rather than tracking the threshold's value. `SR5` had already been changed
this way when the 3-to-2 fix landed; `RS7` was missed because its bundle is live-model tier and the
deterministic gate never runs it.

Adds `prompt-run-linkage.test.ts`. Its unit tests pin the linkage rule and the loud-failure
property, but neither can catch someone re-adding an `AgentRunID` filter — only a real database
rejects that, and the live tier is triage-only, so the regression would ship exactly as it did the
first time. The file therefore also scans the check sources, the same filesystem-drift technique
`sibling-parity.test.ts` uses for bundle-to-metadata parity.
