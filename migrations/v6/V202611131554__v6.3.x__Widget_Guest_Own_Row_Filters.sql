/*******************************************************************************
 * Row filters for three Widget Guest grants that had none.
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * The Widget Guest role holds Read + Create + Update on MJ: AI Agent Requests and
 * MJ: Conversation Skills, and Read + Create on MJ: Conversation Detail
 * Artifacts, all with no row filter. EntityInfo.UserExemptFromRowLevelSecurity
 * treats a grant with no filter as exempt, so a public widget guest (every guest
 * shares the one Anonymous principal) could read every row of those entities,
 * including rows from other guests and from named users, and could update the
 * Agent Request and Conversation Skill rows it could read.
 *
 * ── The three filters ────────────────────────────────────────────────────────
 * A guest's session Conversation carries ExternalID = the per-session scope on
 * the signed guest token ({{ScopeResourceID}}). Each filter reaches that
 * Conversation from its own entity:
 *
 *   MJ: AI Agent Requests             AIAgentRequest has no ConversationID. It is
 *                                     reached through OriginatingAgentRunID →
 *                                     AIAgentRun.ConversationID. A request with no
 *                                     originating run matches no row, so guests do
 *                                     not see it.
 *   MJ: Conversation Skills           ConversationSkill.ConversationID directly.
 *   MJ: Conversation Detail Artifacts ConversationDetailArtifact.ConversationDetailID
 *                                     → ConversationDetail.ConversationID.
 *
 * One filter record per entity: MJ enforces a same-entity invariant on row
 * filters (BuildSameEntityErrors in rowFilterValidation.ts).
 *
 * ── Fail-closed ──────────────────────────────────────────────────────────────
 * {{ScopeResourceID}} resolves to '' when the principal carries no scope
 * (RowLevelSecurityFilterInfo.MarkupFilterText, which also doubles any embedded
 * quote). In every filter below the token appears exactly once, inside a quoted
 * equality against Conversation.ExternalID, so an absent scope matches no rows.
 *
 * ── Scope of this migration ──────────────────────────────────────────────────
 * Seeds the three filter rows only, the same SQL-seed + metadata-link split the
 * existing Widget Guest filters use (V202607061250, V202608300200). The
 * EntityPermission → filter links ship in
 * metadata/entity-permissions/.entity-permissions.json via @lookup by Name.
 * That file also attaches the existing run-entity read filters as the Update
 * filter on MJ: AI Agent Runs, MJ: AI Agent Run Steps and MJ: AI Prompt Runs.
 * Create grants stay unfiltered, as on every other Widget Guest grant.
 *
 * Re-runnable: MERGE on fixed UUIDs.
 ******************************************************************************/

DECLARE @WidgetGuestAgentRequestsFilterID              UNIQUEIDENTIFIER = 'E5EEC668-2A81-46C2-AB14-D878B8E9A8CC';
DECLARE @WidgetGuestConversationSkillsFilterID         UNIQUEIDENTIFIER = '71EA442F-ED8E-46E9-9AC4-6C8D8F919D73';
DECLARE @WidgetGuestConversationDetailArtifactsFilterID UNIQUEIDENTIFIER = 'D401A7C8-1A5B-4A9D-B931-AFBEEE5F2F6E';

MERGE ${flyway:defaultSchema}.RowLevelSecurityFilter AS tgt
USING (VALUES
    (@WidgetGuestAgentRequestsFilterID, N'Widget Guest: Own Agent Requests',
        N'Limits a public web-widget guest to the MJ: AI Agent Requests raised by agent runs in its own session. AIAgentRequest has no ConversationID, so the filter goes through OriginatingAgentRunID to the agent run, then to the Conversation whose ExternalID equals the per-session scope ({{ScopeResourceID}}) on the signed guest token. Requests with no originating run match no row. Attached to the Widget Guest role''s read and update permission on MJ: AI Agent Requests.',
        N'OriginatingAgentRunID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentRuns WHERE ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))'),

    (@WidgetGuestConversationSkillsFilterID, N'Widget Guest: Own Conversation Skills',
        N'Limits a public web-widget guest to the MJ: Conversation Skills of its own session Conversation, the one whose ExternalID equals the per-session scope ({{ScopeResourceID}}) on the signed guest token. Attached to the Widget Guest role''s read and update permission on MJ: Conversation Skills.',
        N'ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}'')'),

    (@WidgetGuestConversationDetailArtifactsFilterID, N'Widget Guest: Own Conversation Detail Artifacts',
        N'Limits a public web-widget guest to the MJ: Conversation Detail Artifacts linked to messages in its own session Conversation. The filter goes through ConversationDetailID to the Conversation Detail, then to the Conversation whose ExternalID equals the per-session scope ({{ScopeResourceID}}) on the signed guest token. Attached to the Widget Guest role''s read permission on MJ: Conversation Detail Artifacts.',
        N'ConversationDetailID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversationDetails WHERE ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE ExternalID = ''{{ScopeResourceID}}''))')
) AS src (ID, Name, Description, FilterText)
ON tgt.ID = src.ID
WHEN MATCHED THEN UPDATE
    SET Name = src.Name, Description = src.Description, FilterText = src.FilterText
WHEN NOT MATCHED THEN INSERT (ID, Name, Description, FilterText)
    VALUES (src.ID, src.Name, src.Description, src.FilterText);
GO
