-- ============================================================================
-- Scoped Search: dimensional bounds — schema additions
-- Migration: v5.50.x
-- Date: 2026-07-28
-- ============================================================================
-- Every change here is ADDITIVE: a new nullable column, a new table, or a new
-- extended property. Nothing existing is altered, retyped, made stricter or
-- dropped, so this satisfies the publish-then-no-breaking-changes policy
-- (packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md). With every new column NULL and
-- every CHECK admitting NULL, an installation that applies this migration and
-- changes no data behaves exactly as it did before.
--
-- Three concerns, consolidated into one migration deliberately: they all add
-- columns to the same handful of Search Scope tables, none of them has been
-- applied in any environment, and shipping them separately would mean three
-- reviews, three CodeGen runs, and two intermediate schema states nobody ever
-- needs to exist.
--
--   A. AISkill.SearchScopeAccess + AISkillSearchScope, and StartAt / EndAt /
--      PrimaryScopeRecordID on SearchScopePermission. A skill becomes a search
--      principal in the same sense an agent already is, and a grant can be
--      limited to a time window and to one tenant.
--
--   B. RequiredMetadataKeys on SearchScopeExternalIndex, and AISkillID /
--      PrimaryScopeRecordID / ScopeDecisionJSON on SearchExecutionLog. A lane can
--      state which keys its rendered filter must constrain on, and the log can
--      record WHY a search could reach what it reached.
--
--   C. RequiredMetadataKeys on SearchScopeEntity — the same contract on the SQL
--      lane, which has the identical partially-rendered-filter exposure and is in
--      practice the lane most applications actually restrict on.
--
-- CodeGen owns everything derived from this — views, stored procedures,
-- EntityField rows and the generated entity classes. DDL + extended properties
-- ONLY, per migrations/CLAUDE.md.
-- ============================================================================

SET NOCOUNT ON;


-- ############################################################################
-- A. A SKILL principal, plus tenant + time scoping on scope grants
-- ############################################################################

-- 1. AISkill.SearchScopeAccess - the skill principal. NULL behaves as None, keeping every
--    existing skill inert.
ALTER TABLE [${flyway:defaultSchema}].[AISkill] ADD [SearchScopeAccess] NVARCHAR(20) NULL;
GO
ALTER TABLE [${flyway:defaultSchema}].[AISkill]
    ADD CONSTRAINT [CK_AISkill_SearchScopeAccess]
    CHECK ([SearchScopeAccess] IS NULL OR [SearchScopeAccess] IN (N'None', N'Assigned', N'All'));
GO
EXEC sp_addextendedproperty @name=N'MS_Description',
 @value=N'Which Search Scopes this skill may reach when activated. None = grants no retrieval scope; Assigned = only scopes listed in AISkillSearchScope; All = any active scope. NULL behaves as None so existing skills are unaffected. Mirrors AIAgent.SearchScopeAccess so a skill and an agent are interchangeable principals to SearchScopePermissionResolver.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',
 @level1type=N'TABLE', @level1name=N'AISkill',
 @level2type=N'COLUMN',@level2name=N'SearchScopeAccess';
GO

-- 2. AISkillSearchScope - skill-keyed grant rows, mirroring AIAgentSearchScope.
CREATE TABLE [${flyway:defaultSchema}].[AISkillSearchScope] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AISkillSearchScope_ID] DEFAULT (newsequentialid()),
    [SkillID]       UNIQUEIDENTIFIER NOT NULL,
    [SearchScopeID] UNIQUEIDENTIFIER NOT NULL,
    [Status]        NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AISkillSearchScope_Status] DEFAULT (N'Active'),
    [StartAt]       DATETIMEOFFSET   NULL,
    [EndAt]         DATETIMEOFFSET   NULL,
    [Priority]      INT              NULL,
    [IsDefault]     BIT              NOT NULL CONSTRAINT [DF_AISkillSearchScope_IsDefault] DEFAULT (0),
    CONSTRAINT [PK_AISkillSearchScope] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AISkillSearchScope_Skill]       FOREIGN KEY ([SkillID])       REFERENCES [${flyway:defaultSchema}].[AISkill]([ID]),
    CONSTRAINT [FK_AISkillSearchScope_SearchScope] FOREIGN KEY ([SearchScopeID]) REFERENCES [${flyway:defaultSchema}].[SearchScope]([ID]),
    CONSTRAINT [CK_AISkillSearchScope_Status] CHECK ([Status] IN (N'Active', N'Inactive')),
    CONSTRAINT [UQ_AISkillSearchScope] UNIQUE ([SkillID], [SearchScopeID])
);
GO
EXEC sp_addextendedproperty @name=N'MS_Description',
 @value=N'Search Scopes an AI Skill may reach when activated, honoured when AISkill.SearchScopeAccess = ''Assigned''. Mirrors AIAgentSearchScope: Status plus an optional StartAt/EndAt window time-box a grant, and Priority/IsDefault pick among several. An empty table means no skill grants any scope - the pre-migration behaviour.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',
 @level1type=N'TABLE', @level1name=N'AISkillSearchScope';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'The skill this grant belongs to.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'AISkillSearchScope',@level2type=N'COLUMN',@level2name=N'SkillID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'The Search Scope this skill may reach.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'AISkillSearchScope',@level2type=N'COLUMN',@level2name=N'SearchScopeID';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'Active or Inactive. Inactive rows are ignored during resolution.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'AISkillSearchScope',@level2type=N'COLUMN',@level2name=N'Status';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'Optional start of the window in which this grant is honoured. NULL = no lower bound. Evaluated against the current time on every resolution, so a window opening or closing needs no cache invalidation.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'AISkillSearchScope',@level2type=N'COLUMN',@level2name=N'StartAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'Optional end of the window in which this grant is honoured. NULL = no upper bound.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'AISkillSearchScope',@level2type=N'COLUMN',@level2name=N'EndAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'Lower numbers win when several granted scopes are candidates and none is marked IsDefault.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'AISkillSearchScope',@level2type=N'COLUMN',@level2name=N'Priority';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'When set, this scope is chosen for the skill ahead of Priority ordering.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'AISkillSearchScope',@level2type=N'COLUMN',@level2name=N'IsDefault';
GO

-- 3 + 4. SearchScopePermission - a time window and a tenant key on the grant itself.
ALTER TABLE [${flyway:defaultSchema}].[SearchScopePermission]
    ADD [StartAt] DATETIMEOFFSET NULL,
        [EndAt] DATETIMEOFFSET NULL,
        [PrimaryScopeRecordID] UNIQUEIDENTIFIER NULL;
GO
EXEC sp_addextendedproperty @name=N'MS_Description',
 @value=N'Optional start of the window in which this grant applies. NULL = no lower bound. SearchScopePermission was the only member of this family without a time window, so temporary grants previously needed a bespoke mechanism.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'SearchScopePermission',@level2type=N'COLUMN',@level2name=N'StartAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',@value=N'Optional end of the window in which this grant applies. NULL = no upper bound.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'SearchScopePermission',@level2type=N'COLUMN',@level2name=N'EndAt';
GO
EXEC sp_addextendedproperty @name=N'MS_Description',
 @value=N'Optional tenant this grant is limited to, matched against SearchContext.PrimaryScopeRecordID at search time and type-checkable against the scope''s own PrimaryScopeEntityID. NULL = applies to every tenant, which is the pre-migration behaviour for all existing rows. Deliberately NOT called OrganizationID: MJ is domain-agnostic and a scope''s primary scope may be a Company, Client or Practice, so this reuses the existing primary-scope concept rather than inventing a parallel tenancy column.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',@level1type=N'TABLE',@level1name=N'SearchScopePermission',@level2type=N'COLUMN',@level2name=N'PrimaryScopeRecordID';
GO


-- ############################################################################
-- B. The ingest label contract, and decision provenance on the execution log
-- ############################################################################

-- ─────────────────────────────────────────────────────────────────────────────────────
-- PHASE E: the ingest label contract
-- ─────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE [${flyway:defaultSchema}].[SearchScopeExternalIndex]
    ADD [RequiredMetadataKeys] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
 @name=N'MS_Description',
 @value=N'JSON array of metadata key names the rendered MetadataFilter MUST constrain on for this lane to be considered safe, e.g. ["OrganizationID","ContentSourceID"]. Checked against the RENDERED filter at search time: if a key is missing the lane is SKIPPED rather than queried, because a partially-rendered filter silently widens the search. This also documents the ingest contract — these are the labels the writer must stamp on every document in the index, since a filter on a key that was never written either matches nothing or (on providers that ignore unknown keys) matches everything. NULL = no contract declared, which is the pre-migration behaviour.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',
 @level1type=N'TABLE', @level1name=N'SearchScopeExternalIndex',
 @level2type=N'COLUMN',@level2name=N'RequiredMetadataKeys';
GO

-- ─────────────────────────────────────────────────────────────────────────────────────
-- PHASE F: decision provenance on the execution log
-- ─────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog]
    ADD [AISkillID]            UNIQUEIDENTIFIER NULL,
        [PrimaryScopeRecordID] UNIQUEIDENTIFIER NULL,
        [ScopeDecisionJSON]    NVARCHAR(MAX)    NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[SearchExecutionLog]
    ADD CONSTRAINT [FK_SearchExecutionLog_AISkill]
    FOREIGN KEY ([AISkillID]) REFERENCES [${flyway:defaultSchema}].[AISkill]([ID]);
GO

EXEC sp_addextendedproperty
 @name=N'MS_Description',
 @value=N'The AI Skill on whose behalf this search ran, or NULL for a search with no active skill. Mirrors AIAgentID: since a skill is a search principal in its own right (AISkill.SearchScopeAccess plus MJ: AI Skill Search Scopes rows can reach a scope the user''s own roles do not grant), the log must record which skill was active or the entitlement decision cannot be reconstructed.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',
 @level1type=N'TABLE', @level1name=N'SearchExecutionLog',
 @level2type=N'COLUMN',@level2name=N'AISkillID';
GO

EXEC sp_addextendedproperty
 @name=N'MS_Description',
 @value=N'The tenant this search ran for, taken from SearchContext.PrimaryScopeRecordID. Lets a multi-tenant deployment partition, filter and retain search audit history per customer. NULL for untenanted searches. Named for the existing primary-scope concept rather than OrganizationID because a scope''s primary scope may be a Company, Client or Practice.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',
 @level1type=N'TABLE', @level1name=N'SearchExecutionLog',
 @level2type=N'COLUMN',@level2name=N'PrimaryScopeRecordID';
GO

EXEC sp_addextendedproperty
 @name=N'MS_Description',
 @value=N'Serialized ScopeExplanation recording WHY this search could reach what it reached: the entitlement decision and the grant that produced it, every dimension with its provenance (CallerSupplied / ServerDerived / Default / DiscardedCaller / Absent), and each lane''s rendered filter with its active-or-skipped status and reason. Identical in shape to the value returned by SearchEngine.ExplainScope(), so the dry-run an administrator previews before running a search is the same structure the audit log stores afterwards. NULL when the engine did not capture a decision (older writers, or a failure before scope resolution).',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',
 @level1type=N'TABLE', @level1name=N'SearchExecutionLog',
 @level2type=N'COLUMN',@level2name=N'ScopeDecisionJSON';
GO


-- ############################################################################
-- C. The same label contract on the entity (SQL) lane
-- ############################################################################

ALTER TABLE [${flyway:defaultSchema}].[SearchScopeEntity]
    ADD [RequiredMetadataKeys] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
 @name=N'MS_Description',
 @value=N'JSON array of column or alias names the rendered ExtraFilter MUST reference for this lane to be considered safe, e.g. ["OrganizationID","ContentSourceID"]. Checked against the RENDERED filter at search time: if one is missing the lane is SKIPPED rather than queried, because a partially-rendered filter (an {% if %} clause dropped when its dimension was absent or discarded) is still valid SQL and silently widens the search. Same concept and same engine check as SearchScopeExternalIndex.RequiredMetadataKeys, applied to the SQL lane. NULL = no contract declared, which is the pre-migration behaviour.',
 @level0type=N'SCHEMA',@level0name=N'${flyway:defaultSchema}',
 @level1type=N'TABLE', @level1name=N'SearchScopeEntity',
 @level2type=N'COLUMN',@level2name=N'RequiredMetadataKeys';
GO
