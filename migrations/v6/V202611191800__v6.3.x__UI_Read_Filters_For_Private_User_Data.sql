/*******************************************************************************
 * Row filters that limit the UI role's reads of per-user data.
 *
 * The UI role is held by every ordinary signed-in user. The entities below hold
 * one user's data and the UI role reads them with no row filter, so any user can
 * read every row. EntityInfo.UserExemptFromRowLevelSecurity treats a grant with
 * no filter as exempt, so each filter here narrows the UI role's read grant to
 * the caller's own rows. Developer and Integration keep their unfiltered grants.
 *
 * ── The filters ──────────────────────────────────────────────────────────────
 *   MJ: Diagnostic Sessions        CreatedByUserID is the caller.
 *   MJ: Diagnostic Session Chunks  The parent session's CreatedByUserID is the
 *                                  caller (the chunk has no user column).
 *   MJ: Diagnostic Bundles         CreatedByUserID is the caller.
 *   MJ: AI Agent Run Medias        The media's agent run belongs to the caller,
 *                                  as in 'UI: Own AI Agent Run Steps'.
 *   MJ: AI Prompt Run Medias       The media's prompt run is a prompt step of one
 *                                  of the caller's agent runs, as in
 *                                  'UI: Own AI Prompt Runs'.
 *   MJ: AI Agent Examples          The example is the caller's own or is shared
 *                                  (UserID is NULL), the same scope
 *                                  AIEngine applies when it picks examples.
 *
 * One filter record per entity: MJ enforces a same-entity invariant on row
 * filters (BuildSameEntityErrors in rowFilterValidation.ts).
 *
 * ── Scope of this migration ──────────────────────────────────────────────────
 * Seeds the filter rows only. `MJ: Row Level Security Filters` grants Create to
 * no role, so `mj sync push` cannot write them. The EntityPermission → filter
 * links ship in
 * metadata/entity-permissions/.private-user-data-read-filters.json via @lookup
 * by Name, the same split V202611161547 and V202609201900 use.
 *
 * Re-runnable: MERGE on fixed UUIDs.
 ******************************************************************************/

DECLARE @UIDiagnosticSessionsFilterID      UNIQUEIDENTIFIER = 'AB4D8195-3819-4C13-A2AB-E63A510A3E7C';
DECLARE @UIDiagnosticSessionChunksFilterID UNIQUEIDENTIFIER = '3B6242B3-541A-41C7-98D4-CC24ECF92503';
DECLARE @UIDiagnosticBundlesFilterID       UNIQUEIDENTIFIER = '43C8FE6E-3D6B-4955-B72B-50832CE63ADD';
DECLARE @UIAgentRunMediasFilterID          UNIQUEIDENTIFIER = '409D24AB-CB08-4241-B033-B0ABE103515F';
DECLARE @UIPromptRunMediasFilterID         UNIQUEIDENTIFIER = 'DD05A1D8-46F6-4B43-A730-AE5552A655AE';
DECLARE @UIAgentExamplesFilterID           UNIQUEIDENTIFIER = '94026104-293E-4036-AA82-22D75EEAEFE5';

MERGE ${flyway:defaultSchema}.RowLevelSecurityFilter AS tgt
USING (VALUES
    (@UIDiagnosticSessionsFilterID, N'UI: Own Diagnostic Sessions',
        N'Limits MJ: Diagnostic Sessions to the sessions the current user created. Attached to the UI role''s read permission on the entity. Users who hold the Diagnostics: Run Sessions authorization work through roles with unfiltered grants.',
        N'CreatedByUserID = ''{{UserID}}'''),

    (@UIDiagnosticSessionChunksFilterID, N'UI: Own Diagnostic Session Chunks',
        N'Limits MJ: Diagnostic Session Chunks to the chunks of diagnostic sessions the current user created. The chunk has no user column, so the filter goes through DiagnosticSessionID to the parent session. Attached to the UI role''s read permission on the entity.',
        N'DiagnosticSessionID IN (SELECT ID FROM ${flyway:defaultSchema}.vwDiagnosticSessions WHERE CreatedByUserID = ''{{UserID}}'')'),

    (@UIDiagnosticBundlesFilterID, N'UI: Own Diagnostic Bundles',
        N'Limits MJ: Diagnostic Bundles to the bundles the current user created. Attached to the UI role''s read permission on the entity.',
        N'CreatedByUserID = ''{{UserID}}'''),

    (@UIAgentRunMediasFilterID, N'UI: Own AI Agent Run Medias',
        N'Limits MJ: AI Agent Run Medias to the media of agent runs the current user owns. The media has no user column, so the filter goes through AgentRunID, the same shape as UI: Own AI Agent Run Steps. Attached to the UI role''s read permission on the entity.',
        N'AgentRunID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentRuns WHERE UserID = ''{{UserID}}'')'),

    (@UIPromptRunMediasFilterID, N'UI: Own AI Prompt Run Medias',
        N'Limits MJ: AI Prompt Run Medias to the media of prompt runs that are prompt steps of agent runs the current user owns, the same rule as UI: Own AI Prompt Runs. Attached to the UI role''s read permission on the entity.',
        N'PromptRunID IN (SELECT TargetLogID FROM ${flyway:defaultSchema}.vwAIAgentRunSteps WHERE StepType = ''Prompt'' AND TargetLogID IS NOT NULL AND AgentRunID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentRuns WHERE UserID = ''{{UserID}}''))'),

    (@UIAgentExamplesFilterID, N'UI: Own Or Shared AI Agent Examples',
        N'Limits MJ: AI Agent Examples to the current user''s own examples and to shared examples (UserID is NULL). Attached to the UI role''s read permission on the entity.',
        N'(UserID IS NULL OR UserID = ''{{UserID}}'')')
) AS src (ID, Name, Description, FilterText)
ON tgt.ID = src.ID
WHEN MATCHED THEN UPDATE
    SET Name = src.Name, Description = src.Description, FilterText = src.FilterText
WHEN NOT MATCHED THEN INSERT (ID, Name, Description, FilterText)
    VALUES (src.ID, src.Name, src.Description, src.FilterText);
GO
