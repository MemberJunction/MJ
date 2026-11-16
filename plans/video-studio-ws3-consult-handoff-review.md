# WS3 Independent Security & Correctness Review: Consult & Handoff (`PR #5055`)

**Status:** Independent Review Report (`WS3` of [`plans/video-studio-hardening.md`](./video-studio-hardening.md))
**Date:** 2026-11-10
**Scope:** `packages/AI/Agents/src/base-agent.ts`, `packages/AI/Agents/src/AgentRunner.ts`, `packages/MJServer/src/resolvers/RunAIAgentResolver.ts`, `packages/AI/Agents/src/handoff-target.ts`, `packages/AI/Agents/src/sub-agent-consult.ts`, `packages/MessagingAdapters/src/base/BaseMessagingAdapter.ts`, `packages/TaskGraph/src/TaskGraphService.ts`, `packages/Angular/Generic/conversations/src/lib/utils/agent-handoff-map.ts`

---

## 1. Executive Summary

All 14 file groups from PR #5055 (`971479fed7`) touching `Consult` (sub-agent asks parent a question) and `Handoff` (Sage transfers a conversation to a specialist agent) were reviewed against the 5 focus areas in `plans/video-studio-hardening.md` (`WS3`):

| Focus Area | Verdict | Findings |
|---|---|---|
| **1. Run termination (`Consult`, `Retry`, root escalation, parallel sub-agents)** | Single sub-agent `Consult` round tracking and over-cap root escalation work; 3 bugs in default propagation, parallel sub-agents, and relationship-only `Consult` escalation | **Issue #1 (High)**, **Issue #2 (High)**, **Issue #3 (Medium)** |
| **2. Payload flow between parent and child across `resumeRunId`** | Same-run and cross-run `resumeRunId` one-time consumption work; 3 bugs in downstream payload merging on resume, `childRunId`/`lastRunId` ownership verification, and `contextMessage` duplication | **Issue #4 (High)**, **Issue #5 (Medium-High)**, **Issue #6 (Medium)** |
| **3. Preset precedence (`Handoff` & `Sub-Agent`)** | **Verified sound** (`Mention` pin $\rightarrow$ `mj.agentMode.<agentId>` $\rightarrow$ target `IsDefault` $\rightarrow$ `None`; never inherits Sage's `configurationId`) | None |
| **4. Permission, discoverability, tenant/company & `AllowedAgentIDs` checks across hosts** | `ResolveHandoffTarget` and `RunAIAgentResolver` are sound; 3 high-severity gaps in `AgentRunner.buildHandoffTargetParams`, `BaseMessagingAdapter`, and `Tasks` step folding / `TaskGraphService` | **Issue #7 (Critical/High)**, **Issue #8 (High)**, **Issue #9 (High)** |
| **5. Hop limits, ping-pong prevention, and multi-hop tracking** | Cycle detection (`AlreadyInThisTurn`) and `MAX_HANDOFF_HOPS = 3` are sound; 2 medium bugs in `lookupTargetPriorRunId` and multi-hop card/history resolution + 1 low edge case | **Issue #10 (Medium)**, **Issue #11 (Medium)**, **Issue #12 (Low)** |

---

## 2. What Was Verified as Sound

1. **Single Sub-Agent Consult Precedence, Guardrails & Root Escalation on Round Exhaustion:**
   - Sub-agent chat handling option resolution (`base-agent.ts:18728`, `resolveSubAgentChatHandlingOption`) implements `relationship.ChatHandlingOption ?? parentAgent.ChatHandlingOption ?? null`.
   - Consult max rounds (`base-agent.ts:18516`, `18733`) evaluates `params.agent.MaxSubAgentConsultRounds ?? DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS` (with `DEFAULT_MAX_SUB_AGENT_CONSULT_ROUNDS = 3` exported from `packages/AI/Agents/src/sub-agent-consult.ts:17`).
   - Non-loop parent agents (`!this.AgentTypeInstance?.InjectLoopResultsAsMessage`) fall back to `null` with a once-per-run warning.
   - Over-cap `Consult` at root (`round > maxRounds && this._depth === 0`, `base-agent.ts:18827-18828`) calls `raiseFeedbackRequest(params, stepEntity, chatStep)`, and `MJAIAgentRequestEntityServer.Save()` (`MJAIAgentRequestEntityServer.ts:95-145`) deduplicates open requests per `OriginatingAgentRunID` + `OriginatingAgentRunStepID`.
2. **Sub-Agent `resumeRunId` Validation & One-Time Consumption:**
   - `validateSubAgentNextStep` rejects non-UUID `resumeRunId`, checks `_openSubAgentConsults.get(resumeRunId)`, verifies `UUIDsEqual(openConsult.subAgentId, resolved.subAgentEntity.ID)`, and returns a `Retry` step on mismatch.
   - `ExecuteSubAgent` (`base-agent.ts:14291-14350`) deletes the entry from `_openSubAgentConsults` before invoking the child, preventing double-consumption.
3. **Handoff & Sub-Agent Preset Precedence:**
   - `ResolveConversationAgentPreset` (`packages/AI/BaseAIEngine/src/agent-preset-resolution.ts:158-242`) resolves for the **target** `AgentID` in order: `@mention` pin $\rightarrow$ `mj.agentMode.<agentId.toLowerCase()>` $\rightarrow$ target's `IsDefault && Status === 'Active'` preset $\rightarrow$ `None`.
   - `buildHandoffTargetParams` (`AgentRunner.ts:1374`) sets `configurationId: resolvedPreset.Preset?.AIConfigurationID ?? undefined`, ensuring Sage's configuration never leaks into the handed-off specialist run.
   - Sub-agent preset precedence (`base-agent.ts:7535-7558`, `14258-14306`, `TaskGraphService.ts:1629-1662`, `MJAIAgentRelationshipEntityServer.server.ts:10-91`) enforces `presetName` $\rightarrow$ active `AIAgentRelationship.ConfigurationPresetID` $\rightarrow$ inherit `params.configurationId`.
4. **Core `ResolveHandoffTarget` & `RunAIAgentResolver` Handoff Gates:**
   - `ResolveHandoffTarget` (`packages/AI/Agents/src/handoff-target.ts:97-168`) checks in strict order: `NotFound` (`CanUserViewAgent` fail-closed), `Self`, `NotDiscoverable` (`IsDirectlyDiscoverable`), `NotAllowedHere` (`KeepHostAllowedAgents`), `NoRunPermission` (`CanUserRunAgent` fail-closed), `AlreadyInThisTurn` (`UUIDSet`), and `HopLimit` (`MAX_HANDOFF_HOPS = 3`).
   - `runWithholdsHandoff` (`base-agent.ts:3423-3436`, `7412-7427`) withholds handoffs when `params.parentRun` is set, `!params.conversationDetailId`, `!Array.isArray(params.handoffChain)`, or the caller is an unscoped guest.

---

## 3. Concrete Findings (Ready-to-File Issues / Fixes)

### Finding WS3-1 (High): Root agent propagating a child sub-agent `Chat` step under default `ChatHandlingOption = null` skips `raiseFeedbackRequest`
- **Location:** `packages/AI/Agents/src/base-agent.ts:18717-18835` (`handleSingleSubAgentChatStep`, lines 18827-18828)
- **Defect:** Lines 18827-18828 gate `raiseFeedbackRequest` on `validatedStep.step === 'Chat' && effectiveOption === 'Consult' && this._depth === 0`. When `effectiveOption` is `null` (the default propagate behavior), `validateChatNextStep` returns `chatStep` (`terminate: true`), the root loop exits, and the run finishes in `Status = 'AwaitingFeedback'` with **no `MJ: AI Agent Requests` row created**.
- **Fix:** Change line 18827 to `if (validatedStep.step === 'Chat' && this._depth === 0)`.

### Finding WS3-2 (High): `executeParallelSubAgents` silently swallows non-`Consult` child `Chat` steps and over-cap `Consult` escalations
- **Location:** `packages/AI/Agents/src/base-agent.ts:18488-18550` (`mergeParallelExecutionsIntoParent`), `18590-18650` (`executeParallelSubAgents`)
- **Defect:** When a parallel sub-agent finishes with `FinalStep === 'Chat'` and `effectiveOption !== 'Consult'` (or `round > maxRounds`), `mergeParallelExecutionsIntoParent` does nothing and falls through to logging normal completion; if `request.terminateAfter === true`, the parent terminates with `'Success'` while the child is in `AwaitingFeedback`.
- **Fix:** Route non-`Consult` and over-cap parallel child `Chat` results through `validateChatNextStep` (and `raiseFeedbackRequest` at `_depth === 0`) inside `mergeParallelExecutionsIntoParent`.

### Finding WS3-3 (Medium): Relationship-level `ChatHandlingOption = 'Consult'` cannot escalate to the user when the parent's own `AIAgent.ChatHandlingOption` is `'Failed'`, `'Retry'`, or `'Success'`
- **Location:** `packages/AI/Agents/src/base-agent.ts:7396-7403` (`validateNextStep`)
- **Defect:** When a relationship sets `ChatHandlingOption = 'Consult'` and the parent LLM chooses to escalate the child's consult question via its own `Chat` step, `validateNextStep` calls `validateChatNextStep` with `chatHandlingOption = undefined`, which falls back to `params.agent.ChatHandlingOption` (`'Failed'` / `'Retry'` / `'Success'`) and blocks escalation.
- **Fix:** When `this._openSubAgentConsults.size > 0`, allow the parent's escalation `Chat` step to pass through `validateChatNextStep` with `'Chat'`.

### Finding WS3-4 (High): `ExecuteSubAgent` drops parent downstream payload updates when resuming a sub-agent via `resumeRunId`
- **Location:** `packages/AI/Agents/src/base-agent.ts:14291-14350` (`ExecuteSubAgent`), `16958-16992` (`executeChildSubAgentStep`)
- **Defect:** `ExecuteSubAgent` passes `payload: verifiedResumeRunId ? undefined : payload` with `autoPopulateLastRunPayload: true`. Any parent payload updates made between the child's pause and its resumption are ignored when the child starts, and because `executeChildSubAgentStep` diffs the child's output against `scopedPayload` (which had the parent's updates), `mergeSubAgentPayload` treats those parent keys as deleted by the child and wipes them.
- **Fix:** When `verifiedResumeRunId` is set, merge the parent's current downstream `payload` onto `lastRun.FinalPayload` before starting the resumed child run and use that merged object as `originalScopedPayload`.

### Finding WS3-5 (Medium-High): `LoadOpenSubAgentConsults`, `buildResumedConsultTurns`, and `initializeAgentRun` do not verify `AgentID` / `TargetLogID` ownership on `childRunId` / `lastRunId`
- **Location:** `packages/AI/Agents/src/sub-agent-consult.ts:179-256`, `packages/AI/Agents/src/base-agent.ts:14756-14767`, `14833-14887`
- **Defect:** `LoadOpenSubAgentConsults` trusts `OutputData.consult.childRunId` without checking `UUIDsEqual(step.TargetLogID, consult.childRunId)` and `UUIDsEqual(step.TargetID, consult.subAgentId)`. `initializeAgentRun` loads `lastRun.FinalPayload` without checking `UUIDsEqual(lastRun.AgentID, params.agent.ID)`, and `buildResumedConsultTurns` loads Prompt steps for `childRunId` without checking `UUIDsEqual(childRun.AgentID, subAgentId)`.
- **Fix:** Enforce `UUIDsEqual` ownership checks in all three places before loading prior payloads or prompt turns.

### Finding WS3-6 (Medium): Related sub-agent `ExecuteSubAgent` duplicates `contextMessage` (`SubAgentContextPaths`) on every resumed consult round
- **Location:** `packages/AI/Agents/src/base-agent.ts:14873-14875` (`buildResumedConsultTurns`)
- **Defect:** `buildResumedConsultTurns` prepends `{ role: 'system', content: contextMessage }` even when `priorMessages` loaded from the child's prior Prompt steps already start with that system message, duplicating `conversation.all` on each consult round.
- **Fix:** Replace the existing leading system context message (or skip prepending when `priorMessages` already contains it) in `buildResumedConsultTurns`.

### Finding WS3-7 (Critical/High): `AgentRunner.buildHandoffTargetParams` drops `SearchScopeIDs`, `boundActionParams`, `SecurityEnvelope`, and `ParentRunTainted`
- **Location:** `packages/AI/Agents/src/AgentRunner.ts:1337-1384` (`buildHandoffTargetParams`)
- **Defect:** `buildHandoffTargetParams` explicitly preserves `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, `SecondaryScopes`, `Audience`, `ConversationBranchID`, `ConversationHistoryFrom`, and `provider`, but constructs a manual property map that omits `SearchScopeIDs`, server-bound `boundActionParams`, `SecurityEnvelope`, and `ParentRunTainted` when handing off to the target agent.
- **Fix:** Spread `sourceParams` in `buildHandoffTargetParams`, explicitly override only the per-target fields (`agent`, `conversationMessages`, `payload: undefined`, `lastRunId`, `autoPopulateLastRunPayload`, `configurationId`, `allowedAgentIds`, `handoffChain`, `parentRun: undefined`, `onAgentRunCreated: undefined`), and propagate taint from the source run.

### Finding WS3-8 (High): `BaseMessagingAdapter` bypasses `CanUserViewAgent`, `CanUserRunAgent`, `IsDirectlyDiscoverable`, and `AllowedAgentIDs` on `@mention` / thread routing
- **Location:** `packages/MessagingAdapters/src/base/BaseMessagingAdapter.ts:645-688` (`resolveAgent`), `1589-1603` (`loadAvailableAgents`)
- **Defect:** `loadAvailableAgents` loads all active agents as `fallbackContextUser`, and `resolveAgent` matches `@mention` / thread history without checking `IsDirectlyDiscoverable(agent)`, `CanUserViewAgent(agent, contextUser)`, or `CanUserRunAgent(agent, contextUser)`, allowing Slack/Teams users to directly `@mention` internal `ParentID` / `ExposeAsAction` sub-agents.
- **Fix:** Filter candidate agents in `BaseMessagingAdapter.resolveAgent` by `IsDirectlyDiscoverable`, `CanUserViewAgent`, `CanUserRunAgent`, and `KeepHostAllowedAgents`.

### Finding WS3-9 (High): Orchestrator `Tasks` step (1-node folded and multi-node `TaskGraphService`) bypasses `AllowedAgentIDs` and `IsDirectlyDiscoverable`
- **Location:** `packages/AI/Agents/src/base-agent.ts:17440-17471` (`resolveSubAgentByName` when `allowAnyActiveAgent = true`), `packages/TaskGraph/src/TaskGraphService.ts:1545-1622` (`resolveAgents`)
- **Defect:** When an orchestrator emits a `Tasks` step, both the 1-node folded path (`resolveSubAgentByName(..., true)`) and the multi-node path (`TaskGraphService.resolveAgents`) check `CanUserViewAgent` and `CanUserRunAgent`, but neither checks `IsDirectlyDiscoverable` or `KeepHostAllowedAgents(..., allowedAgentIds)`.
- **Fix:** Enforce `IsDirectlyDiscoverable` and `KeepHostAllowedAgents` in both `resolveSubAgentByName(..., true)` and `TaskGraphService.resolveAgents` for non-child/non-related agents.

### Finding WS3-10 (Medium): `AgentRunner.lookupTargetPriorRunId` omits `BypassCache: true` and `BuildStoppedPredecessorFilter`
- **Location:** `packages/AI/Agents/src/AgentRunner.ts:1300-1335` (`lookupTargetPriorRunId`)
- **Defect:** `lookupTargetPriorRunId` correctly queries `Status IN (${settled})` using `MJAIAgentRunEntityExtended.SettledStatuses` (`['Completed', 'AwaitingFeedback']`), but omits `BypassCache: true` (risking cached RunView results across rapid multi-hop handoffs) and does not call `BuildStoppedPredecessorFilter`, allowing handoff target runs to link to user-stopped predecessor runs.
- **Fix:** Include `MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter` in `lookupTargetPriorRunId` and set `BypassCache: true`.

### Finding WS3-11 (Medium): Multi-hop handoffs (`A -> B -> C`) drop intermediate hop briefs and leave `BuildHandoffsByDetailId` showing only Hop 1 (`A -> B`)
- **Location:** `packages/AI/Agents/src/AgentRunner.ts:990`, `1351-1357`; `packages/Angular/Generic/conversations/src/lib/utils/agent-handoff-map.ts:346-356` (`BuildHandoffsByDetailId`)
- **Defect:** In `BuildHandoffsByDetailId`, when multiple `Handoff` steps share the same `TargetDetailID`, `if (!byDetailId.has(detailId))` keeps the first hop (`HopCount = 1`, `TargetAgent = B`) and ignores the final hop (`HopCount = 2`, `HopChain = [A, B, C]`, `TargetAgent = C`).
- **Fix:** Prefer the `AgentHandoffInfo` with the highest `HopCount` for a given `detailId` in `BuildHandoffsByDetailId`, and accumulate hop briefs across multi-hop handoffs in `FollowHandoffs`.

### Finding WS3-12 (Low): `CanAgentOwnSubAgentConsults` returns `false` when passed `{ ID }` without `ChatHandlingOption` populated
- **Location:** `packages/AI/Agents/src/sub-agent-consult.ts:156-164`
- **Defect:** Checks `if (typeof agentOrId === 'string')` instead of `if (agentOption === undefined)`, skipping the `AIEngine.Instance.Agents` lookup when an object with `{ ID }` is passed without `ChatHandlingOption`.
- **Fix:** Change `if (typeof agentOrId === 'string')` to `if (agentOption === undefined)`.
