# WS3 Independent Security & Correctness Review: Consult & Handoff (`PR #5055`)

**Status:** Independent Review Report (`WS3` of [`plans/video-studio-hardening.md`](./video-studio-hardening.md) — findings filed as [#6710](https://github.com/MemberJunction/MJ/issues/6710)–[#6721](https://github.com/MemberJunction/MJ/issues/6721))
**Date:** 2026-11-10 (line anchors and issues verified against `origin/next` [`5cffee33d9`](https://github.com/MemberJunction/MJ/commit/5cffee33d97f492f63840811a4b91e2c09272c47) on 2026-11-17)
**Scope:** `packages/AI/Agents/src/base-agent.ts`, `packages/AI/Agents/src/AgentRunner.ts`, `packages/MJServer/src/resolvers/RunAIAgentResolver.ts`, `packages/AI/Agents/src/handoff-target.ts`, `packages/AI/Agents/src/sub-agent-consult.ts`, `packages/MessagingAdapters/src/base/BaseMessagingAdapter.ts`, `packages/TaskGraph/src/TaskGraphService.ts`, `packages/Angular/Generic/conversations/src/lib/utils/agent-handoff-map.ts`

---

## 1. Executive Summary

All 14 file groups from PR #5055 (`971479fed7`) touching `Consult` (sub-agent asks parent a question) and `Handoff` (Sage transfers a conversation to a specialist agent) were reviewed against the 5 focus areas in `plans/video-studio-hardening.md` (`WS3`):

| Focus Area | Verdict | Findings |
|---|---|---|
| **1. Run termination (`Consult`, `Retry`, root escalation, parallel sub-agents)** | Single sub-agent `Consult` round tracking and over-cap root escalation work; 3 bugs in default propagation, parallel sub-agents, and relationship-only `Consult` escalation | [**WS3-1 (#6710, High)**](https://github.com/MemberJunction/MJ/issues/6710), [**WS3-2 (#6711, High)**](https://github.com/MemberJunction/MJ/issues/6711), [**WS3-3 (#6712, Medium)**](https://github.com/MemberJunction/MJ/issues/6712) |
| **2. Payload flow between parent and child across `resumeRunId`** | Same-run and cross-run `resumeRunId` one-time consumption work; 3 bugs in downstream payload merging on resume, `childRunId`/`lastRunId` ownership verification, and `contextMessage` duplication | [**WS3-4 (#6713, High)**](https://github.com/MemberJunction/MJ/issues/6713), [**WS3-5 (#6714, Medium-High)**](https://github.com/MemberJunction/MJ/issues/6714), [**WS3-6 (#6715, Medium)**](https://github.com/MemberJunction/MJ/issues/6715) |
| **3. Preset precedence (`Handoff` & `Sub-Agent`)** | **Verified sound** (`Mention` pin $\rightarrow$ `mj.agentMode.<agentId>` $\rightarrow$ target `IsDefault` $\rightarrow$ `None`; never inherits Sage's `configurationId`) | None |
| **4. Permission, discoverability, tenant/company & `AllowedAgentIDs` checks across hosts** | `ResolveHandoffTarget` and `RunAIAgentResolver` are sound; 3 high-severity gaps in `AgentRunner.buildHandoffTargetParams`, `BaseMessagingAdapter`, and `Tasks` step folding / `TaskGraphService` | [**WS3-7 (#6716, Critical/High)**](https://github.com/MemberJunction/MJ/issues/6716), [**WS3-8 (#6717, High)**](https://github.com/MemberJunction/MJ/issues/6717), [**WS3-9 (#6718, High)**](https://github.com/MemberJunction/MJ/issues/6718) |
| **5. Hop limits, ping-pong prevention, and multi-hop tracking** | Cycle detection (`AlreadyInThisTurn`) and `MAX_HANDOFF_HOPS = 3` are sound; 2 medium bugs in `lookupTargetPriorRunId` and multi-hop card/history resolution + 1 low edge case | [**WS3-10 (#6719, Medium)**](https://github.com/MemberJunction/MJ/issues/6719), [**WS3-11 (#6720, Medium)**](https://github.com/MemberJunction/MJ/issues/6720), [**WS3-12 (#6721, Low)**](https://github.com/MemberJunction/MJ/issues/6721) |

---

## 2. What Was Verified as Sound

1. **Single Sub-Agent Consult Precedence, Guardrails & Root Escalation on Round Exhaustion:**
   - Sub-agent chat handling option resolution (`base-agent.ts:9031`, `resolveSubAgentChatHandlingOption`) implements `relationship.ChatHandlingOption ?? parentAgent.ChatHandlingOption ?? null`.
   - Consult max rounds (`base-agent.ts:18388`, `18605`) evaluates `params.agent.MaxSubAgentConsultRounds ?? DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS` (with `DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS = 3` exported from `packages/AI/Agents/src/sub-agent-consult.ts`).
   - Non-loop parent agents (`!this.AgentTypeInstance?.InjectLoopResultsAsMessage`) fall back to `null` with a once-per-run warning.
   - Over-cap `Consult` at root (`validatedStep.step === 'Chat' && effectiveOption === 'Consult' && this._depth === 0`, `base-agent.ts:18699-18700`) calls `raiseFeedbackRequest(params, stepEntity, chatStep)`, and `MJAIAgentRequestEntityServer.Save()` deduplicates open requests per `OriginatingAgentRunID` + `OriginatingAgentRunStepID`.
2. **Sub-Agent `resumeRunId` Validation & One-Time Consumption:**
   - `validateSubAgentNextStep` rejects non-UUID `resumeRunId`, checks `_openSubAgentConsults.get(resumeRunId)`, verifies `UUIDsEqual(openConsult.subAgentId, resolved.subAgentEntity.ID)`, and returns a `Retry` step on mismatch.
   - `ExecuteSubAgent` (`base-agent.ts:14537-14576`) deletes the entry from `_openSubAgentConsults` before invoking the child, preventing double-consumption.
3. **Handoff & Sub-Agent Preset Precedence:**
   - `ResolveConversationAgentPreset` (`packages/AI/BaseAIEngine/src/agent-preset-resolution.ts`) resolves for the **target** `AgentID` in order: `@mention` pin $\rightarrow$ `mj.agentMode.<agentId.toLowerCase()>` $\rightarrow$ target's `IsDefault && Status === 'Active'` preset $\rightarrow$ `None`.
   - `buildHandoffTargetParams` (`AgentRunner.ts:1473`) sets `configurationId` only from the target's resolved `preset?.AIConfigurationID`, ensuring Sage's configuration never leaks into the handed-off specialist run.
   - Sub-agent preset precedence (`resolveSubAgentConfiguration` in `base-agent.ts`, `TaskGraphService.ts`, and `MJAIAgentRelationshipEntityServer`) enforces `presetName` $\rightarrow$ active `AIAgentRelationship.ConfigurationPresetID` $\rightarrow$ inherit `params.configurationId`.
4. **Core `ResolveHandoffTarget` & `RunAIAgentResolver` Handoff Gates:**
   - `ResolveHandoffTarget` (`packages/AI/Agents/src/handoff-target.ts:97-168`) checks in strict order: `NotFound` (`CanUserViewAgent` fail-closed), `Self`, `NotDiscoverable` (`IsDirectlyDiscoverable`), `NotAllowedHere` (`KeepHostAllowedAgents`), `NoRunPermission` (`CanUserRunAgent` fail-closed), `AlreadyInThisTurn` (`UUIDSet`), and `HopLimit` (`MAX_HANDOFF_HOPS = 3`).
   - `runWithholdsHandoff` (`base-agent.ts`) withholds handoffs when `params.parentRun` is set, `!params.conversationDetailId`, `!Array.isArray(params.handoffChain)`, or the caller is an unscoped guest.

---

## 3. Concrete Findings (Filed Issues `#6710`–`#6721`)

### Finding WS3-1 (High) — [#6710](https://github.com/MemberJunction/MJ/issues/6710): Root agent propagating a child sub-agent `Chat` step under default `ChatHandlingOption = null` skips `raiseFeedbackRequest`
- **Location:** `packages/AI/Agents/src/base-agent.ts:18589-18708` (`handleSingleSubAgentChatStep`, lines `18699-18700`)
- **Defect:** Lines `18699-18700` gate `raiseFeedbackRequest` on `validatedStep.step === 'Chat' && effectiveOption === 'Consult' && this._depth === 0`. When `effectiveOption` is `null` (the default propagate behavior), `validateChatNextStep` returns `chatStep` (`terminate: true`), the root loop exits, and the run finishes in `Status = 'AwaitingFeedback'` with **no `MJ: AI Agent Requests` row created**.
- **Fix:** Change line `18699` to `if (validatedStep.step === 'Chat' && this._depth === 0)`.

### Finding WS3-2 (High) — [#6711](https://github.com/MemberJunction/MJ/issues/6711): `executeParallelSubAgents` silently swallows non-`Consult` child `Chat` steps and over-cap `Consult` escalations
- **Location:** `packages/AI/Agents/src/base-agent.ts:18360-18416` (`mergeParallelExecutionsIntoParent`), `18450-18524` (`executeParallelSubAgents`)
- **Defect:** When a parallel sub-agent finishes with `FinalStep === 'Chat'` and `effectiveOption !== 'Consult'` (or `round > maxRounds`), `mergeParallelExecutionsIntoParent` does nothing and falls through to normal completion; if `request.terminateAfter === true`, the parent terminates with `'Success'` while the child is in `AwaitingFeedback`.
- **Fix:** Route non-`Consult` and over-cap parallel child `Chat` results through `validateChatNextStep` (and `raiseFeedbackRequest` at `_depth === 0`) inside `mergeParallelExecutionsIntoParent`.

### Finding WS3-3 (Medium) — [#6712](https://github.com/MemberJunction/MJ/issues/6712): Relationship-level `ChatHandlingOption = 'Consult'` cannot escalate to the user when the parent's own `AIAgent.ChatHandlingOption` is `'Failed'`, `'Retry'`, or `'Success'`
- **Location:** `packages/AI/Agents/src/base-agent.ts:7734-7735` (`validateNextStep`), `9121-9141` (`validateChatNextStep`)
- **Defect:** When a relationship sets `ChatHandlingOption = 'Consult'` and the parent LLM chooses to escalate the child's consult question via its own `Chat` step, `validateNextStep` calls `validateChatNextStep` with `chatHandlingOption = undefined`, which falls back to `params.agent.ChatHandlingOption` (`'Failed'` / `'Retry'` / `'Success'`) and blocks escalation.
- **Fix:** When `this._openSubAgentConsults.size > 0`, allow the parent's escalation `Chat` step to pass through `validateChatNextStep` without remapping to `Failed`/`Retry`/`Success`.

### Finding WS3-4 (High) — [#6713](https://github.com/MemberJunction/MJ/issues/6713): `ExecuteSubAgent` drops parent downstream payload updates when resuming a sub-agent via `resumeRunId`
- **Location:** `packages/AI/Agents/src/base-agent.ts:14537-14645` (`ExecuteSubAgent`), `17460-17513` (`executeChildSubAgentStep`)
- **Defect:** `ExecuteSubAgent` passes `payload: verifiedResumeRunId ? undefined : payload` with `autoPopulateLastRunPayload: true`. Any parent payload updates made between the child's pause and its resumption are ignored when the child starts, and because `executeChildSubAgentStep` diffs the child's output against `previousDecision.newPayload` via `mergeUpstreamPayload`, absent keys can wipe parent updates.
- **Fix:** When `verifiedResumeRunId` is set, merge the parent's current downstream `payload` onto `lastRun.FinalPayload` before starting the resumed child run and preserve parent-only updates across upstream merge.

### Finding WS3-5 (Medium-High) — [#6714](https://github.com/MemberJunction/MJ/issues/6714): `LoadOpenSubAgentConsults` and `lastRunId` resume paths do not verify `AgentID` / `TargetLogID` ownership
- **Location:** `packages/AI/Agents/src/sub-agent-consult.ts:180-254` (`LoadOpenSubAgentConsults`), `packages/AI/Agents/src/base-agent.ts:15186-15226` (`initializeAgentRun`), `5764-5815` (`validateRunChain`)
- **Defect:** `LoadOpenSubAgentConsults` trusts `OutputData.consult.childRunId` and `subAgentId` without loading or verifying `UUIDsEqual(step.TargetLogID, consult.childRunId)` and `UUIDsEqual(step.TargetID, consult.subAgentId)`. `initializeAgentRun` loads `lastRun.FinalPayload` without verifying `UUIDsEqual(lastRun.AgentID, params.agent.ID)`.
- **Fix:** Enforce `UUIDsEqual` ownership checks on `TargetLogID`/`TargetID` in `LoadOpenSubAgentConsults` and `AgentID` in `initializeAgentRun` / `validateRunChain` before loading prior payloads.

### Finding WS3-6 (Medium) — [#6715](https://github.com/MemberJunction/MJ/issues/6715): Related sub-agent `prepareSubAgentMessages` duplicates `contextMessage` (`SubAgentContextPaths`) across consult rounds
- **Location:** `packages/AI/Agents/src/base-agent.ts:14419-14509` (`prepareSubAgentMessages`), `18825-18845` (`executeRelatedSubAgentStep`)
- **Defect:** `prepareSubAgentMessages` unconditionally pushes `contextMessage` when provided without checking whether prior conversation turns carried via `MessageMode` (`'All'` / `'Latest'` / `'Bookend'`) or consult rounds already include that `SubAgentContextPaths` injection, duplicating context across rounds.
- **Fix:** Deduplicate or replace any existing `SubAgentContextPaths` context message in `prepareSubAgentMessages` across resumed consult rounds.

### Finding WS3-7 (Critical/High) — [#6716](https://github.com/MemberJunction/MJ/issues/6716): `AgentRunner.buildHandoffTargetParams` drops `SearchScopeIDs`, `boundActionParams`, `SecurityEnvelope`, and `ParentRunTainted`
- **Location:** `packages/AI/Agents/src/AgentRunner.ts:1432-1480` (`buildHandoffTargetParams`), `1202-1279` (`FollowHandoffs`)
- **Defect:** `buildHandoffTargetParams` explicitly preserves `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, `SecondaryScopes`, `CredentialScope`, `Audience`, `ConversationBranchID`, `ConversationHistoryFrom`, and `provider`, but constructs a manual property map that omits `SearchScopeIDs`, server-bound `boundActionParams`, `SecurityEnvelope`, and `ParentRunTainted` when handing off to the target agent.
- **Fix:** Forward `SearchScopeIDs`, `boundActionParams`, `SecurityEnvelope`, and run taint (`ParentRunTainted`) from `sourceParams` / source run in `buildHandoffTargetParams` while still excluding `payload`, `lastRunId`, `autoPopulateLastRunPayload`, `configurationId`, `override`, `parentRun`, `onAgentRunCreated`, and `allowedAgentIds`.

### Finding WS3-8 (High) — [#6717](https://github.com/MemberJunction/MJ/issues/6717): `BaseMessagingAdapter` bypasses `CanUserViewAgent`, `CanUserRunAgent`, `IsDirectlyDiscoverable`, and `AllowedAgentIDs` on `@mention` / thread routing
- **Location:** `packages/MessagingAdapters/src/base/BaseMessagingAdapter.ts:645-688` (`resolveAgent`), `699-724` (`resolveThreadAgent`), `1589-1606` (`loadAvailableAgents`)
- **Defect:** `loadAvailableAgents` loads all active agents as `fallbackContextUser`, and both `resolveAgent` and `resolveThreadAgent` match `@mention` / thread history without checking `IsDirectlyDiscoverable(agent)`, `CanUserViewAgent(agent, contextUser)`, `CanUserRunAgent(agent, contextUser)`, or `KeepHostAllowedAgents`, allowing Slack/Teams users to directly `@mention` internal `ParentID` / `ExposeAsAction` sub-agents.
- **Fix:** Filter candidate agents in `BaseMessagingAdapter.resolveAgent` and `resolveThreadAgent` by `IsDirectlyDiscoverable`, `CanUserViewAgent`, `CanUserRunAgent`, and `KeepHostAllowedAgents`.

### Finding WS3-9 (High) — [#6718](https://github.com/MemberJunction/MJ/issues/6718): Orchestrator `Tasks` step (1-node folded and multi-node `TaskGraphService`) bypasses `AllowedAgentIDs` and `IsDirectlyDiscoverable`
- **Location:** `packages/AI/Agents/src/base-agent.ts:17980-17989` (`resolveSubAgentByName` when `allowAnyActiveAgent = true`), `packages/TaskGraph/src/TaskGraphService.ts:1574-1651` (`resolveAgents`)
- **Defect:** When an orchestrator emits a `Tasks` step, both the 1-node folded path (`resolveSubAgentByName(..., true)`) and the multi-node path (`TaskGraphService.resolveAgents`) fail to enforce `IsDirectlyDiscoverable` and `KeepHostAllowedAgents(..., allowedAgentIds)` for non-child/non-related agents.
- **Fix:** Enforce `IsDirectlyDiscoverable` and `KeepHostAllowedAgents` in both `resolveSubAgentByName(..., true)` and `TaskGraphService.resolveAgents` for non-child/non-related agents.

### Finding WS3-10 (Medium) — [#6719](https://github.com/MemberJunction/MJ/issues/6719): `AgentRunner.lookupTargetPriorRunId` omits `BypassCache: true` and `BuildStoppedPredecessorFilter`
- **Location:** `packages/AI/Agents/src/AgentRunner.ts:1386-1430` (`lookupTargetPriorRunId`)
- **Defect:** `lookupTargetPriorRunId` queries `Status IN (${settled})` using `MJAIAgentRunEntityExtended.SettledStatuses` (`['Completed', 'AwaitingFeedback']`), but omits `BypassCache: true` (risking cached RunView results across rapid multi-hop handoffs) and does not call `BuildStoppedPredecessorFilter`, allowing handoff target runs to link to user-stopped predecessor runs.
- **Fix:** Include `MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter` in `lookupTargetPriorRunId` and set `BypassCache: true`.

### Finding WS3-11 (Medium) — [#6720](https://github.com/MemberJunction/MJ/issues/6720): Multi-hop handoffs (`A -> B -> C`) drop intermediate hop briefs and split multi-hop chain state across details
- **Location:** `packages/AI/Agents/src/AgentRunner.ts:1081-1281` (`FollowHandoffs`), `1432-1452` (`buildHandoffTargetParams`); `packages/Angular/Generic/conversations/src/lib/utils/agent-handoff-map.ts:214-353` (`BuildHandoffsByDetailId`)
- **Defect:** In `FollowHandoffs`, `buildHandoffTargetParams` prepends only the current hop's `briefMsg` onto the unchanging pre-hop `baseHistory`, dropping intermediate hop briefs (`A -> B` when reaching `C`). Meanwhile in `BuildHandoffsByDetailId` (`agent-handoff-map.ts:330-337`), `HopChain` is only populated when `output.Chain.length >= 2`, leaving Hop 1's card showing only `A -> B` (`HopChain: null`) while Hop 2's card renders `A -> B -> C` separately.
- **Fix:** Accumulate prior hop briefs across `FollowHandoffs` hops and consolidate/link multi-hop chain visibility consistently in `BuildHandoffsByDetailId`.

### Finding WS3-12 (Low) — [#6721](https://github.com/MemberJunction/MJ/issues/6721): `CanAgentOwnSubAgentConsults` returns `false` when passed `{ ID }` without `ChatHandlingOption` populated
- **Location:** `packages/AI/Agents/src/sub-agent-consult.ts:147-172` (`CanAgentOwnSubAgentConsults`)
- **Defect:** Line `159` checks `if (typeof agentOrId === 'string')` instead of `if (agentOption === undefined)`, skipping the `AIEngine.Instance.Agents` lookup when an object with `{ ID }` is passed without `ChatHandlingOption`.
- **Fix:** Check whether `ChatHandlingOption` is `undefined` rather than `typeof agentOrId === 'string'` before looking up the agent in `AIEngine.Instance.Agents`.
