/*******************************************************************************
 * Fix: the "UI: Own AI Prompt Runs" row-level-security filter still filtered on
 *      AIPromptRun.AgentRunID, which V202607241645__v5.50.x__Break_CodeGen_Cycle_
 *      Remove_PromptRun_AgentRunID dropped.
 *
 * That migration cleaned up the EntityField and EntityRelationship metadata for
 * the dropped column, but not the RLS filter. MJ appends a filter's FilterText
 * as a WHERE clause against the entity's base view, so every read of
 * MJ: AI Prompt Runs by a user holding the UI role -- i.e. ordinary end users --
 * failed with "Invalid column name 'AgentRunID'" (SQL Server) /
 * "column \"AgentRunID\" does not exist" (PostgreSQL).
 *
 * This affects BOTH platforms: RLS filters are entity metadata, not per-platform
 * DDL. It went unnoticed because every automated path reads AI Prompt Runs as a
 * privileged identity with no RLS applied -- the integration suite's RLS checks
 * use the synthetic "Integration Test: RLS Scoped Reader" role, never the UI role.
 *
 * The replacement preserves the original intent -- a UI user sees only prompt runs
 * belonging to their own agent runs -- using the derivation path that migration's
 * own design notes prescribe: AIAgentRunStep.TargetLogID for prompt-type steps.
 *
 *   before: AgentRunID IN (SELECT ID FROM vwAIAgentRuns WHERE UserID = '{{UserID}}')
 *   after:  ID IN (SELECT TargetLogID FROM vwAIAgentRunSteps
 *                   WHERE StepType = 'Prompt' AND TargetLogID IS NOT NULL
 *                     AND AgentRunID IN (SELECT ID FROM vwAIAgentRuns WHERE UserID = '{{UserID}}'))
 *
 * Visibility is unchanged for standalone prompt runs: previously they had a NULL
 * AgentRunID and so never matched `AgentRunID IN (...)`; now their ID is not a
 * TargetLogID of any of the user's prompt steps, so they still never match.
 *
 * The sibling filter "UI: Own AI Agent Run Steps" is deliberately left alone --
 * AIAgentRunStep.AgentRunID still exists and that filter is correct.
 ******************************************************************************/

UPDATE ${flyway:defaultSchema}.RowLevelSecurityFilter
SET FilterText = N'ID IN (SELECT TargetLogID FROM ${flyway:defaultSchema}.vwAIAgentRunSteps WHERE StepType = ''Prompt'' AND TargetLogID IS NOT NULL AND AgentRunID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentRuns WHERE UserID = ''{{UserID}}''))'
WHERE ID = 'E1AF0003-0000-4000-B000-000000000003';  -- UI: Own AI Prompt Runs
GO
