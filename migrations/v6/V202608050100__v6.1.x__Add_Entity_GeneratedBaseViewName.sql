-- =============================================================================
-- Entity.GeneratedBaseViewName — let an entity have BOTH a generated base view
-- and a custom one layered over it.
-- =============================================================================
--
-- THE PROBLEM THIS SOLVES. `BaseViewGenerated = 0` is all-or-nothing: CodeGen
-- stops generating the base view entirely, so the application inherits the WHOLE
-- thing — every related-entity display join, the geo join, the recursive root-ID
-- OUTER APPLY, the soft-delete predicate — in order to add one computed column.
--
-- That inheritance is not a one-time cost. It is a standing obligation to
-- hand-maintain generated SQL: add a foreign key later and its display field
-- simply never appears, because nothing regenerates the join. The failure is
-- silent — the column is absent rather than wrong — which is the worst shape a
-- schema defect can take. It also freezes the entity at whatever MemberJunction
-- generated on the day the view was copied; geo columns and root-ID columns both
-- arrived after custom views existed in the wild, and no custom view has them
-- unless somebody hand-merged.
--
-- WHAT THIS COLUMN DOES. When `GeneratedBaseViewName` is non-NULL, CodeGen keeps
-- generating a full base view — under THAT name — and the application owns
-- `BaseView`, which is expected to wrap it:
--
--     CREATE VIEW vwOrderHeaders AS
--     SELECT g.*, CASE WHEN ... END AS IsOverdue
--     FROM   vwOrderHeadersGenerated g
--
-- The application layer is then a few reviewable lines, and everything
-- underneath keeps regenerating. A new foreign key appears automatically.
--
-- ADDITIVE ON PURPOSE. NULL — every existing row — reproduces today's behaviour
-- exactly: `BaseViewGenerated` alone decides, and there is no second view. This
-- introduces no migration of semantics and nothing to re-verify for installs
-- that do not opt in.
--
-- WHAT READS WHICH. `BaseView` remains the entity's public surface: entity field
-- discovery, permissions, and the generated CRUD procedures all target it, so a
-- computed column added in the custom layer becomes a first-class EntityField
-- (IsVirtual = 1) and is returned by spCreate/spUpdate/spDelete like any other.
-- `GeneratedBaseViewName` is an implementation detail of that surface.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD [GeneratedBaseViewName] NVARCHAR(255) NULL;
GO

-- A view cannot select from itself. Equal names would be an infinite recursion
-- that SQL Server reports at query time, far from the metadata that caused it,
-- so it is refused where it is written.
--
-- The BaseView IS NOT NULL arm is not redundant. `X <> NULL` evaluates to UNKNOWN,
-- and a CHECK constraint PASSES on UNKNOWN — so without it a row could name an
-- inner view while leaving the public surface NULL. That row is "layered" by every
-- runtime test, but permissions and the CRUD procedures target BaseView, so CodeGen
-- would emit GRANT/SELECT against [schema].[null]. Layering requires a public view
-- to layer onto.
ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD CONSTRAINT [CK_Entity_GeneratedBaseViewName_NotBaseView]
    CHECK ([GeneratedBaseViewName] IS NULL
           OR ([BaseView] IS NOT NULL AND [GeneratedBaseViewName] <> [BaseView]));
GO

-- Layering requires BaseViewGenerated = 0. The combination BaseViewGenerated = 1
-- WITH an inner name is contradictory — the flag claims CodeGen writes BaseView,
-- the name says the application owns it — and the two halves of CodeGen read
-- different columns, so in that state they disagree:
--
--   · View GENERATION gates on `BaseViewGenerated || HasLayeredBaseView`, so the
--     inner view is written.
--   · The outer view's REFRESH and its GRANTs gate on `!BaseViewGenerated`, so
--     both are skipped.
--
-- The result is an entity whose public surface is never granted and never
-- refreshed, while CodeGen reports success. Nothing errors; the view is simply
-- unreadable by the roles that should have it, and stale besides.
--
-- `EntityInfo.HasLayeredBaseView` deliberately ignores BaseViewGenerated — were it
-- to honour it, this same combination would make CodeGen treat the entity as
-- ordinary and OVERWRITE the application's hand-written BaseView. That fail-safe is
-- the right default and stays; refusing the state here means it is never relied on.
-- Together with the constraint above, the three documented arrangements are now the
-- only reachable ones.
ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD CONSTRAINT [CK_Entity_LayeredBaseView_RequiresCustomBaseView]
    CHECK ([GeneratedBaseViewName] IS NULL OR [BaseViewGenerated] = 0);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When set, CodeGen generates the entity''s full base view under THIS name instead of BaseView, and the application owns BaseView — which is expected to wrap it (SELECT g.*, <extras> FROM <GeneratedBaseViewName> g). This gives an entity a custom base view WITHOUT inheriting the generated SQL: related-entity display joins, geo columns and recursive root-ID columns keep regenerating underneath, so a foreign key added later still appears. NULL (the default, and every pre-existing row) means the previous all-or-nothing behaviour: BaseViewGenerated alone decides whether CodeGen writes BaseView, and there is no second view. BaseView remains the public surface — entity field discovery, permissions and the generated CRUD procedures all target it. SQL SERVER ONLY: layering relies on sp_refreshview to re-resolve the application-owned outer view''s SELECT * against a regenerated inner view. PostgreSQL freezes a view''s column list at creation and has no refresh equivalent, so CodeGen rejects this column on PostgreSQL rather than let the outer view go silently stale.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'GeneratedBaseViewName';
GO




























-- =============================================================================
-- Entity.AllowDirectSQLInsert / AllowDirectSQLUpdate / AllowDirectSQLDelete
-- Declare, per entity, which writes may bypass BaseEntity.
-- =============================================================================
--
-- THE DEFAULT IS "NO". MemberJunction's contract is that every mutation flows
-- through `BaseEntity.Save()` / `.Delete()`, because that is the only path where
-- the platform's guarantees actually run:
--
--   · Record Changes         — the audit trail (TrackRecordChanges)
--   · Cache invalidation     — BaseEntity events maintain the server RunView
--                              cache and drive cross-server pub/sub
--   · Entity Actions         — create/update/delete hooks
--   · Validation             — field rules and BaseEntity subclass overrides
--   · Soft delete            — DELETE means "set DeletedAt", not "remove the row"
--
-- SQL written outside that path silently skips ALL of it. These three columns
-- make the exception explicit and reviewable instead of tribal knowledge.
--
-- WHAT THEY ARE. A DECLARATION, not an enforcement. Nothing here can stop anyone
-- from opening a query window and issuing DML — no constraint, trigger or grant
-- in this migration attempts to. They record which entities are SANCTIONED for
-- direct SQL so that the code paths and tooling which *choose* to honour the
-- contract can consult one authoritative answer: bulk/ETL and integration sync,
-- record-set processing, and agents or generators authoring SQL. Treat a `0` as
-- "if you are about to write raw DML against this table, you are doing something
-- the platform does not expect."
--
-- WHY THREE COLUMNS AND NOT ONE. The verbs carry genuinely different risk. A
-- bulk INSERT on a staging-shaped entity is routine; a direct DELETE on a
-- soft-delete entity destroys rows the platform promised to keep. Splitting them
-- lets an entity sanction the cheap case without also sanctioning the dangerous
-- one.
--
-- THE INVARIANTS ARE ENFORCED. Two CHECK constraints below, because both failure
-- modes they prevent are silent:
--
--   1. Direct SQL requires TrackRecordChanges = 0 AND TrustServerCacheCompletely = 0.
--      Direct DML writes no RecordChange row and fires no invalidation event, so
--      leaving either flag on yields an audit trail that LOOKS complete but is
--      not, and a server cache that serves stale rows indefinitely. Neither
--      errors; both are discovered long after the fact. Note that
--      `TrustServerCacheCompletely` already documents exactly this scenario
--      ("entities whose rows are created as side-effects of other operations via
--      raw SQL") — these columns are the declarative half of that same fact.
--
--   2. AllowDirectSQLDelete requires DeleteType = 'Hard'. A direct DELETE against
--      a soft-delete entity removes the row outright rather than setting
--      DeletedAt, defeating soft delete entirely.
--
-- Consequence worth knowing: you cannot later turn TrackRecordChanges back on
-- (or convert an entity to soft delete) while a direct-SQL flag is set. That is
-- deliberate — it forces the conversation rather than silently degrading the
-- guarantee.
--
-- ADDITIVE. All three default to 0, which is exactly today's behaviour, so every
-- existing row satisfies both constraints on creation and no install changes
-- semantics unless it opts in.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD [AllowDirectSQLInsert] BIT NOT NULL
            CONSTRAINT [DF_Entity_AllowDirectSQLInsert] DEFAULT (0),
        [AllowDirectSQLUpdate] BIT NOT NULL
            CONSTRAINT [DF_Entity_AllowDirectSQLUpdate] DEFAULT (0),
        [AllowDirectSQLDelete] BIT NOT NULL
            CONSTRAINT [DF_Entity_AllowDirectSQLDelete] DEFAULT (0);
GO

-- Direct SQL bypasses both the audit trail and cache invalidation. An entity that
-- sanctions it must therefore claim neither guarantee. Multi-column CHECK, so it is
-- a TABLE-level constraint and CodeGen will not mistake it for a column value list.
ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD CONSTRAINT [CK_Entity_AllowDirectSQL_RequiresUntrackedUncached]
    CHECK (
        (
            [AllowDirectSQLInsert] = 0
        AND [AllowDirectSQLUpdate] = 0
        AND [AllowDirectSQLDelete] = 0
        )
        OR
        (
            [TrackRecordChanges] = 0
        AND [TrustServerCacheCompletely] = 0
        )
    );
GO

-- A direct DELETE removes the row; it does not set DeletedAt. Sanctioning it on a
-- soft-delete entity would quietly defeat soft delete, so the combination is refused.
ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD CONSTRAINT [CK_Entity_AllowDirectSQLDelete_RequiresHardDelete]
    CHECK ([AllowDirectSQLDelete] = 0 OR [DeleteType] = 'Hard');
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this entity may be populated by INSERT statements that do not go through BaseEntity.Save() — bulk loads, ETL/integration sync, or rows created as a side effect of a stored procedure. Default 0, meaning every insert is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct insert produces neither an audit row nor a cache-invalidation event.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AllowDirectSQLInsert';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this entity may be modified by UPDATE statements that do not go through BaseEntity.Save() — bulk backfills, integration sync, or maintenance routines. Default 0, meaning every update is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct update produces neither an audit row nor a cache-invalidation event.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AllowDirectSQLUpdate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this entity may have rows removed by DELETE statements that do not go through BaseEntity.Delete() — purge and retention routines, or integration sync reconciling a remote source. Default 0, meaning every delete is expected to flow through BaseEntity so that record-change tracking, entity actions, cascade handling and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, and additionally requires DeleteType = ''Hard'' — a direct DELETE removes the row outright rather than setting DeletedAt, which would defeat soft delete.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AllowDirectSQLDelete';
GO























































-- ============================================================================================
-- ============================================================================================
-- ==                                                                                        ==
-- ==                    E V E R Y T H I N G   B E L O W   T H I S   L I N E                 ==
-- ==                  W A S   G E N E R A T E D   B Y   M E M B E R J U N C T I O N         ==
-- ==                              C O D E G E N   —   D O   N O T   E D I T                 ==
-- ==                                                                                        ==
-- ============================================================================================
-- ============================================================================================
--
-- Produced by `mj codegen` against a clean database built from migrations + `mj sync push`.
-- It contains EntityField inserts for the new Entity columns, the regenerated vwEntities
-- permissions and spCreate/spUpdate/spDelete for MJ: Entities, the sp_refreshview that makes
-- the new columns visible through vwEntities, and CodeGen-authored validator functions for the
-- CHECK constraints added above.
--
-- It ALSO carries a full regeneration of MJ: Content Item Chunks — its ParentChunkID root-ID
-- function, base view, CRUD routines and the ParentChunk related-entity display field. That is
-- NOT incidental churn: those objects were missing from the baseline, and CodeGen is supplying
-- them. Deliberately retained.
--
-- Two CodeGen passes are appended in order, and both are required. Pass 1 creates the base view
-- carrying the ParentChunk display column; pass 2 discovers that column and inserts it as a
-- virtual EntityField. A third pass produced no output, confirming convergence.
--
-- The validator function NAMES are LLM-authored and are not stable across runs — regenerating
-- will produce equivalent functions under different names. Do not treat a name change in a
-- future run as a defect.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen against a clean
-- database and replace this entire generated section.
-- ============================================================================================

-- ===== CodeGen pass 1 of 2 =====

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '750c9831-e23f-4edf-85ed-acf1685bbceb' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'GeneratedBaseViewName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '750c9831-e23f-4edf-85ed-acf1685bbceb',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100146,
            'GeneratedBaseViewName',
            'Generated Base View Name',
            'When set, CodeGen generates the entity''s full base view under THIS name instead of BaseView, and the application owns BaseView — which is expected to wrap it (SELECT g.*, <extras> FROM <GeneratedBaseViewName> g). This gives an entity a custom base view WITHOUT inheriting the generated SQL: related-entity display joins, geo columns and recursive root-ID columns keep regenerating underneath, so a foreign key added later still appears. NULL (the default, and every pre-existing row) means the previous all-or-nothing behaviour: BaseViewGenerated alone decides whether CodeGen writes BaseView, and there is no second view. BaseView remains the public surface — entity field discovery, permissions and the generated CRUD procedures all target it. SQL SERVER ONLY: layering relies on sp_refreshview to re-resolve the application-owned outer view''s SELECT * against a regenerated inner view. PostgreSQL freezes a view''s column list at creation and has no refresh equivalent, so CodeGen rejects this column on PostgreSQL rather than let the outer view go silently stale.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a020410-e5a6-4484-9f1e-88c5c010f42a' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AllowDirectSQLInsert')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a020410-e5a6-4484-9f1e-88c5c010f42a',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100147,
            'AllowDirectSQLInsert',
            'Allow Direct SQL Insert',
            'When 1, this entity may be populated by INSERT statements that do not go through BaseEntity.Save() — bulk loads, ETL/integration sync, or rows created as a side effect of a stored procedure. Default 0, meaning every insert is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct insert produces neither an audit row nor a cache-invalidation event.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e46d739-bfcc-4fff-a831-c38b8ad195c0' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AllowDirectSQLUpdate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7e46d739-bfcc-4fff-a831-c38b8ad195c0',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100148,
            'AllowDirectSQLUpdate',
            'Allow Direct SQL Update',
            'When 1, this entity may be modified by UPDATE statements that do not go through BaseEntity.Save() — bulk backfills, integration sync, or maintenance routines. Default 0, meaning every update is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct update produces neither an audit row nor a cache-invalidation event.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81621c87-9505-456c-9c8e-6f955ec7c22c' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AllowDirectSQLDelete')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81621c87-9505-456c-9c8e-6f955ec7c22c',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100149,
            'AllowDirectSQLDelete',
            'Allow Direct SQL Delete',
            'When 1, this entity may have rows removed by DELETE statements that do not go through BaseEntity.Delete() — purge and retention routines, or integration sync reconciling a remote source. Default 0, meaning every delete is expected to flow through BaseEntity so that record-change tracking, entity actions, cascade handling and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, and additionally requires DeleteType = ''Hard'' — a direct DELETE removes the row outright rather than setting DeletedAt, which would defeat soft delete.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to update entity field related entity name field map for entity field ID 96841354-26BF-4919-91A3-B3170EA58F68 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='96841354-26BF-4919-91A3-B3170EA58F68', @RelatedEntityNameFieldMap='ParentChunk';

/* Root ID Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentChunkID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentChunkID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentChunkID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentChunkID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemChunks]
AS
SELECT
    c.*,
    MJContentItem_ContentItemID.[Name] AS [ContentItem],
    MJContentItemChunk_ParentChunkID.[SegmentTitle] AS [ParentChunk],
    root_ParentChunkID.RootID AS [RootParentChunkID]
FROM
    [${flyway:defaultSchema}].[ContentItemChunk] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ContentItemID
  ON
    [c].[ContentItemID] = MJContentItem_ContentItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentItemChunk] AS MJContentItemChunk_ParentChunkID
  ON
    [c].[ParentChunkID] = MJContentItemChunk_ParentChunkID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]([c].[ID], [c].[ParentChunkID]) AS root_ParentChunkID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Permissions for vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk]
    @ID uniqueidentifier = NULL,
    @ContentItemID uniqueidentifier,
    @Sequence int,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ID],
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk]
    @ID uniqueidentifier,
    @ContentItemID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        [ContentItemID] = ISNULL(@ContentItemID, [ContentItemID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Text] = CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, [Text]) END,
        [VectorRecordID] = CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, [VectorRecordID]) END,
        [EmbeddingStatus] = ISNULL(@EmbeddingStatus, [EmbeddingStatus]),
        [TaggingStatus] = ISNULL(@TaggingStatus, [TaggingStatus]),
        [DeleteStatus] = CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, [DeleteStatus]) END,
        [LastEmbeddedAt] = CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, [LastEmbeddedAt]) END,
        [LastTaggedAt] = CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, [LastTaggedAt]) END,
        [LastDeletedAt] = CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, [LastDeletedAt]) END,
        [Modality] = ISNULL(@Modality, [Modality]),
        [StartOffset] = CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, [StartOffset]) END,
        [EndOffset] = CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, [EndOffset]) END,
        [StartMs] = CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, [StartMs]) END,
        [EndMs] = CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, [EndMs]) END,
        [PageNumber] = CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, [PageNumber]) END,
        [SegmentTitle] = CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, [SegmentTitle]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Transcript] = CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, [Transcript]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [ParentChunkID] = CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, [ParentChunkID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemChunks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemChunk]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemChunk];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemChunk
ON [${flyway:defaultSchema}].[ContentItemChunk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemChunk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemChunk]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

-- Index for foreign key ExternalDataSourceID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID ON [${flyway:defaultSchema}].[Entity] ([ExternalDataSourceID]);

/* Base View Permissions SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @NameSuffix_Clear bit = 0,
    @NameSuffix nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog_Clear bit = 0,
    @FullTextCatalog nvarchar(255) = NULL,
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex_Clear bit = 0,
    @FullTextIndex nvarchar(255) = NULL,
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction_Clear bit = 0,
    @FullTextSearchFunction nvarchar(255) = NULL,
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows_Clear bit = 0,
    @UserViewMaxRows int = NULL,
    @spCreate_Clear bit = 0,
    @spCreate nvarchar(255) = NULL,
    @spUpdate_Clear bit = 0,
    @spUpdate nvarchar(255) = NULL,
    @spDelete_Clear bit = 0,
    @spDelete nvarchar(255) = NULL,
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch_Clear bit = 0,
    @spMatch nvarchar(255) = NULL,
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName_Clear bit = 0,
    @EntityObjectSubclassName nvarchar(255) = NULL,
    @EntityObjectSubclassImport_Clear bit = 0,
    @EntityObjectSubclassImport nvarchar(255) = NULL,
    @PreferredCommunicationField_Clear bit = 0,
    @PreferredCommunicationField nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder_Clear bit = 0,
    @RowsToPackSampleOrder nvarchar(MAX) = NULL,
    @AutoRowCountFrequency_Clear bit = 0,
    @AutoRowCountFrequency int = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @RowCountRunAt_Clear bit = 0,
    @RowCountRunAt datetimeoffset = NULL,
    @Status nvarchar(25) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @AllowMultipleSubtypes bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateAllowUserSearchAPI bit = NULL,
    @TrustServerCacheCompletely bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL,
    @AllowCaching bit = NULL,
    @DetectExternalChanges bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @ExternalObjectName_Clear bit = 0,
    @ExternalObjectName nvarchar(255) = NULL,
    @GeneratedBaseViewName_Clear bit = 0,
    @GeneratedBaseViewName nvarchar(255) = NULL,
    @AllowDirectSQLInsert bit = NULL,
    @AllowDirectSQLUpdate bit = NULL,
    @AllowDirectSQLDelete bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ID],
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding],
                [AllowCaching],
                [DetectExternalChanges],
                [ExternalDataSourceID],
                [ExternalObjectName],
                [GeneratedBaseViewName],
                [AllowDirectSQLInsert],
                [AllowDirectSQLUpdate],
                [AllowDirectSQLDelete]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, NULL) END,
                ISNULL(@FullTextCatalogGenerated, 1),
                CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, NULL) END,
                ISNULL(@FullTextIndexGenerated, 1),
                CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, NULL) END,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, 1000) END,
                CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, NULL) END,
                CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, NULL) END,
                CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, NULL) END,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, NULL) END,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, NULL) END,
                CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, NULL) END,
                CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, NULL) END,
                CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, NULL) END,
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1),
                ISNULL(@AllowCaching, 0),
                ISNULL(@DetectExternalChanges, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, NULL) END,
                CASE WHEN @GeneratedBaseViewName_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedBaseViewName, NULL) END,
                ISNULL(@AllowDirectSQLInsert, 0),
                ISNULL(@AllowDirectSQLUpdate, 0),
                ISNULL(@AllowDirectSQLDelete, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding],
                [AllowCaching],
                [DetectExternalChanges],
                [ExternalDataSourceID],
                [ExternalObjectName],
                [GeneratedBaseViewName],
                [AllowDirectSQLInsert],
                [AllowDirectSQLUpdate],
                [AllowDirectSQLDelete]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, NULL) END,
                ISNULL(@FullTextCatalogGenerated, 1),
                CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, NULL) END,
                ISNULL(@FullTextIndexGenerated, 1),
                CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, NULL) END,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, 1000) END,
                CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, NULL) END,
                CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, NULL) END,
                CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, NULL) END,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, NULL) END,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, NULL) END,
                CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, NULL) END,
                CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, NULL) END,
                CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, NULL) END,
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1),
                ISNULL(@AllowCaching, 0),
                ISNULL(@DetectExternalChanges, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, NULL) END,
                CASE WHEN @GeneratedBaseViewName_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedBaseViewName, NULL) END,
                ISNULL(@AllowDirectSQLInsert, 0),
                ISNULL(@AllowDirectSQLUpdate, 0),
                ISNULL(@AllowDirectSQLDelete, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @NameSuffix_Clear bit = 0,
    @NameSuffix nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255) = NULL,
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog_Clear bit = 0,
    @FullTextCatalog nvarchar(255) = NULL,
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex_Clear bit = 0,
    @FullTextIndex nvarchar(255) = NULL,
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction_Clear bit = 0,
    @FullTextSearchFunction nvarchar(255) = NULL,
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows_Clear bit = 0,
    @UserViewMaxRows int = NULL,
    @spCreate_Clear bit = 0,
    @spCreate nvarchar(255) = NULL,
    @spUpdate_Clear bit = 0,
    @spUpdate nvarchar(255) = NULL,
    @spDelete_Clear bit = 0,
    @spDelete nvarchar(255) = NULL,
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch_Clear bit = 0,
    @spMatch nvarchar(255) = NULL,
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName_Clear bit = 0,
    @EntityObjectSubclassName nvarchar(255) = NULL,
    @EntityObjectSubclassImport_Clear bit = 0,
    @EntityObjectSubclassImport nvarchar(255) = NULL,
    @PreferredCommunicationField_Clear bit = 0,
    @PreferredCommunicationField nvarchar(255) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder_Clear bit = 0,
    @RowsToPackSampleOrder nvarchar(MAX) = NULL,
    @AutoRowCountFrequency_Clear bit = 0,
    @AutoRowCountFrequency int = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @RowCountRunAt_Clear bit = 0,
    @RowCountRunAt datetimeoffset = NULL,
    @Status nvarchar(25) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @AllowMultipleSubtypes bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateAllowUserSearchAPI bit = NULL,
    @TrustServerCacheCompletely bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL,
    @AllowCaching bit = NULL,
    @DetectExternalChanges bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @ExternalObjectName_Clear bit = 0,
    @ExternalObjectName nvarchar(255) = NULL,
    @GeneratedBaseViewName_Clear bit = 0,
    @GeneratedBaseViewName nvarchar(255) = NULL,
    @AllowDirectSQLInsert bit = NULL,
    @AllowDirectSQLUpdate bit = NULL,
    @AllowDirectSQLDelete bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [NameSuffix] = CASE WHEN @NameSuffix_Clear = 1 THEN NULL ELSE ISNULL(@NameSuffix, [NameSuffix]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [AutoUpdateDescription] = ISNULL(@AutoUpdateDescription, [AutoUpdateDescription]),
        [BaseView] = ISNULL(@BaseView, [BaseView]),
        [BaseViewGenerated] = ISNULL(@BaseViewGenerated, [BaseViewGenerated]),
        [VirtualEntity] = ISNULL(@VirtualEntity, [VirtualEntity]),
        [TrackRecordChanges] = ISNULL(@TrackRecordChanges, [TrackRecordChanges]),
        [AuditRecordAccess] = ISNULL(@AuditRecordAccess, [AuditRecordAccess]),
        [AuditViewRuns] = ISNULL(@AuditViewRuns, [AuditViewRuns]),
        [IncludeInAPI] = ISNULL(@IncludeInAPI, [IncludeInAPI]),
        [AllowAllRowsAPI] = ISNULL(@AllowAllRowsAPI, [AllowAllRowsAPI]),
        [AllowUpdateAPI] = ISNULL(@AllowUpdateAPI, [AllowUpdateAPI]),
        [AllowCreateAPI] = ISNULL(@AllowCreateAPI, [AllowCreateAPI]),
        [AllowDeleteAPI] = ISNULL(@AllowDeleteAPI, [AllowDeleteAPI]),
        [CustomResolverAPI] = ISNULL(@CustomResolverAPI, [CustomResolverAPI]),
        [AllowUserSearchAPI] = ISNULL(@AllowUserSearchAPI, [AllowUserSearchAPI]),
        [FullTextSearchEnabled] = ISNULL(@FullTextSearchEnabled, [FullTextSearchEnabled]),
        [FullTextCatalog] = CASE WHEN @FullTextCatalog_Clear = 1 THEN NULL ELSE ISNULL(@FullTextCatalog, [FullTextCatalog]) END,
        [FullTextCatalogGenerated] = ISNULL(@FullTextCatalogGenerated, [FullTextCatalogGenerated]),
        [FullTextIndex] = CASE WHEN @FullTextIndex_Clear = 1 THEN NULL ELSE ISNULL(@FullTextIndex, [FullTextIndex]) END,
        [FullTextIndexGenerated] = ISNULL(@FullTextIndexGenerated, [FullTextIndexGenerated]),
        [FullTextSearchFunction] = CASE WHEN @FullTextSearchFunction_Clear = 1 THEN NULL ELSE ISNULL(@FullTextSearchFunction, [FullTextSearchFunction]) END,
        [FullTextSearchFunctionGenerated] = ISNULL(@FullTextSearchFunctionGenerated, [FullTextSearchFunctionGenerated]),
        [UserViewMaxRows] = CASE WHEN @UserViewMaxRows_Clear = 1 THEN NULL ELSE ISNULL(@UserViewMaxRows, [UserViewMaxRows]) END,
        [spCreate] = CASE WHEN @spCreate_Clear = 1 THEN NULL ELSE ISNULL(@spCreate, [spCreate]) END,
        [spUpdate] = CASE WHEN @spUpdate_Clear = 1 THEN NULL ELSE ISNULL(@spUpdate, [spUpdate]) END,
        [spDelete] = CASE WHEN @spDelete_Clear = 1 THEN NULL ELSE ISNULL(@spDelete, [spDelete]) END,
        [spCreateGenerated] = ISNULL(@spCreateGenerated, [spCreateGenerated]),
        [spUpdateGenerated] = ISNULL(@spUpdateGenerated, [spUpdateGenerated]),
        [spDeleteGenerated] = ISNULL(@spDeleteGenerated, [spDeleteGenerated]),
        [CascadeDeletes] = ISNULL(@CascadeDeletes, [CascadeDeletes]),
        [DeleteType] = ISNULL(@DeleteType, [DeleteType]),
        [AllowRecordMerge] = ISNULL(@AllowRecordMerge, [AllowRecordMerge]),
        [spMatch] = CASE WHEN @spMatch_Clear = 1 THEN NULL ELSE ISNULL(@spMatch, [spMatch]) END,
        [RelationshipDefaultDisplayType] = ISNULL(@RelationshipDefaultDisplayType, [RelationshipDefaultDisplayType]),
        [UserFormGenerated] = ISNULL(@UserFormGenerated, [UserFormGenerated]),
        [EntityObjectSubclassName] = CASE WHEN @EntityObjectSubclassName_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassName, [EntityObjectSubclassName]) END,
        [EntityObjectSubclassImport] = CASE WHEN @EntityObjectSubclassImport_Clear = 1 THEN NULL ELSE ISNULL(@EntityObjectSubclassImport, [EntityObjectSubclassImport]) END,
        [PreferredCommunicationField] = CASE WHEN @PreferredCommunicationField_Clear = 1 THEN NULL ELSE ISNULL(@PreferredCommunicationField, [PreferredCommunicationField]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [ScopeDefault] = CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, [ScopeDefault]) END,
        [RowsToPackWithSchema] = ISNULL(@RowsToPackWithSchema, [RowsToPackWithSchema]),
        [RowsToPackSampleMethod] = ISNULL(@RowsToPackSampleMethod, [RowsToPackSampleMethod]),
        [RowsToPackSampleCount] = ISNULL(@RowsToPackSampleCount, [RowsToPackSampleCount]),
        [RowsToPackSampleOrder] = CASE WHEN @RowsToPackSampleOrder_Clear = 1 THEN NULL ELSE ISNULL(@RowsToPackSampleOrder, [RowsToPackSampleOrder]) END,
        [AutoRowCountFrequency] = CASE WHEN @AutoRowCountFrequency_Clear = 1 THEN NULL ELSE ISNULL(@AutoRowCountFrequency, [AutoRowCountFrequency]) END,
        [RowCount] = CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, [RowCount]) END,
        [RowCountRunAt] = CASE WHEN @RowCountRunAt_Clear = 1 THEN NULL ELSE ISNULL(@RowCountRunAt, [RowCountRunAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [AllowMultipleSubtypes] = ISNULL(@AllowMultipleSubtypes, [AllowMultipleSubtypes]),
        [AutoUpdateFullTextSearch] = ISNULL(@AutoUpdateFullTextSearch, [AutoUpdateFullTextSearch]),
        [AutoUpdateAllowUserSearchAPI] = ISNULL(@AutoUpdateAllowUserSearchAPI, [AutoUpdateAllowUserSearchAPI]),
        [TrustServerCacheCompletely] = ISNULL(@TrustServerCacheCompletely, [TrustServerCacheCompletely]),
        [SupportsGeoCoding] = ISNULL(@SupportsGeoCoding, [SupportsGeoCoding]),
        [AutoUpdateSupportsGeoCoding] = ISNULL(@AutoUpdateSupportsGeoCoding, [AutoUpdateSupportsGeoCoding]),
        [AllowCaching] = ISNULL(@AllowCaching, [AllowCaching]),
        [DetectExternalChanges] = ISNULL(@DetectExternalChanges, [DetectExternalChanges]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END,
        [ExternalObjectName] = CASE WHEN @ExternalObjectName_Clear = 1 THEN NULL ELSE ISNULL(@ExternalObjectName, [ExternalObjectName]) END,
        [GeneratedBaseViewName] = CASE WHEN @GeneratedBaseViewName_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedBaseViewName, [GeneratedBaseViewName]) END,
        [AllowDirectSQLInsert] = ISNULL(@AllowDirectSQLInsert, [AllowDirectSQLInsert]),
        [AllowDirectSQLUpdate] = ISNULL(@AllowDirectSQLUpdate, [AllowDirectSQLUpdate]),
        [AllowDirectSQLDelete] = ISNULL(@AllowDirectSQLDelete, [AllowDirectSQLDelete])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration];

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ: Entities.ExternalDataSourceID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'External Integration',
   GeneratedFormSection = 'Category',
   DisplayName = 'External Data Source',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C919DAE-C8E3-46BE-A0B7-A7C96B56DFA8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.ExternalObjectName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'External Integration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F1EC0ED5-1BFA-4170-8AB5-67D57E63375E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.GeneratedBaseViewName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Identity & Structure',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '750C9831-E23F-4EDF-85ED-ACF1685BBCEB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLInsert 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Procedures & Deletion',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A020410-E5A6-4484-9F1E-88C5C010F42A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLUpdate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Procedures & Deletion',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E46D739-BFCC-4FFF-A831-C38B8AD195C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLDelete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Procedures & Deletion',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '81621C87-9505-456C-9C8E-6F955EC7C22C' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('79e92137-7a7b-47a0-8de8-ec7f8bb91283', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"External Integration":{"icon":"fa fa-plug","description":"Settings for connecting and mapping to external data sources and objects"}}', GETUTCDATE(), GETUTCDATE());

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"External Integration":"fa fa-plug"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryIcons';

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';

/* Generated Validation Functions for MJ: Entities */
-- CHECK constraint for MJ: Entities @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([AllowDirectSQLDelete]=(0) OR [DeleteType]=''Hard'')', 'public ValidateDeleteTypeForDirectSQLDelete(result: ValidationResult) {
	if (this.AllowDirectSQLDelete && this.DeleteType !== "Hard") {
		result.Errors.push(new ValidationErrorInfo(
			"DeleteType",
			"Delete Type must be ''Hard'' if Allow Direct SQL Delete is enabled.",
			this.DeleteType,
			ValidationErrorType.Failure
		));
	}
}', 'If direct SQL deletion is allowed, the delete type must be set to ''Hard'' to ensure data integrity.', 'ValidateDeleteTypeForDirectSQLDelete', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6');

            -- CHECK constraint for MJ: Entities @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([AllowDirectSQLInsert]=(0) AND [AllowDirectSQLUpdate]=(0) AND [AllowDirectSQLDelete]=(0) OR [TrackRecordChanges]=(0) AND [TrustServerCacheCompletely]=(0))', 'public ValidateDirectSQLAndTrackingConstraints(result: ValidationResult) {
    if ((this.AllowDirectSQLInsert || this.AllowDirectSQLUpdate || this.AllowDirectSQLDelete) && (this.TrackRecordChanges || this.TrustServerCacheCompletely)) {
        result.Errors.push(new ValidationErrorInfo(
            "AllowDirectSQLInsert",
            "Direct SQL operations (Insert, Update, Delete) cannot be enabled when Track Record Changes or Trust Server Cache Completely is enabled.",
            this.AllowDirectSQLInsert,
            ValidationErrorType.Failure
        ));
    }
}', 'Direct SQL operations (Insert, Update, and Delete) must be disabled if Track Record Changes or Trust Server Cache Completely is enabled, ensuring that cache integrity and change tracking are not bypassed.', 'ValidateDirectSQLAndTrackingConstraints', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6');

            -- CHECK constraint for MJ: Entities @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([GeneratedBaseViewName] IS NULL OR [BaseViewGenerated]=(0))', 'public ValidateGeneratedBaseViewNameAndBaseViewGenerated(result: ValidationResult) {
    if (this.GeneratedBaseViewName != null && this.BaseViewGenerated) {
        result.Errors.push(new ValidationErrorInfo(
            "GeneratedBaseViewName",
            "Generated Base View Name must be empty when Base View Generated is enabled.",
            this.GeneratedBaseViewName,
            ValidationErrorType.Failure
        ));
    }
}', 'If the base view is marked as generated, the generated base view name must be null. A generated base view name can only be set when the base view is not marked as generated.', 'ValidateGeneratedBaseViewNameAndBaseViewGenerated', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6');

            -- CHECK constraint for MJ: Entities @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([GeneratedBaseViewName] IS NULL OR [BaseView] IS NOT NULL AND [GeneratedBaseViewName]<>[BaseView])', 'public ValidateGeneratedBaseViewNameDifferentFromBaseView(result: ValidationResult) {
	if (this.GeneratedBaseViewName != null && this.GeneratedBaseViewName.trim() !== "") {
		if (this.BaseView == null || this.BaseView.trim() === "") {
			result.Errors.push(new ValidationErrorInfo(
				"GeneratedBaseViewName",
				"A Base View must be specified when a Generated Base View Name is provided.",
				this.GeneratedBaseViewName,
				ValidationErrorType.Failure
			));
		} else if (this.GeneratedBaseViewName === this.BaseView) {
			result.Errors.push(new ValidationErrorInfo(
				"GeneratedBaseViewName",
				"The Generated Base View Name cannot be the same as the Base View name.",
				this.GeneratedBaseViewName,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If a generated base view name is specified, a base view must also be defined, and the generated base view name cannot be the same as the base view name to prevent naming conflicts.', 'ValidateGeneratedBaseViewNameDifferentFromBaseView', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E0238F34-2837-EF11-86D4-6045BDEE16E6');



-- ===== CodeGen pass 2 of 2 (discovers the ParentChunk display field created by pass 1) =====

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d201b4b-bedf-4475-a6b0-9ce3063072b3' OR (EntityID = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND Name = 'ParentChunk')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4d201b4b-bedf-4475-a6b0-9ce3063072b3',
            '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21', -- Entity: MJ: Content Item Chunks
            100052,
            'ParentChunk',
            'Parent Chunk',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Index for Foreign Keys for ContentItemChunk */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentItemID in table ContentItemChunk
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemChunk_ContentItemID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemChunk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemChunk_ContentItemID ON [${flyway:defaultSchema}].[ContentItemChunk] ([ContentItemID]);

-- Index for foreign key ParentChunkID in table ContentItemChunk
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentItemChunk_ParentChunkID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentItemChunk]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentItemChunk_ParentChunkID ON [${flyway:defaultSchema}].[ContentItemChunk] ([ParentChunkID]);

/* Root ID Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentChunkID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentChunkID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentChunkID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentChunkID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemChunks]
AS
SELECT
    c.*,
    MJContentItem_ContentItemID.[Name] AS [ContentItem],
    MJContentItemChunk_ParentChunkID.[SegmentTitle] AS [ParentChunk],
    root_ParentChunkID.RootID AS [RootParentChunkID]
FROM
    [${flyway:defaultSchema}].[ContentItemChunk] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ContentItemID
  ON
    [c].[ContentItemID] = MJContentItem_ContentItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentItemChunk] AS MJContentItemChunk_ParentChunkID
  ON
    [c].[ParentChunkID] = MJContentItemChunk_ParentChunkID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]([c].[ID], [c].[ParentChunkID]) AS root_ParentChunkID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Permissions for vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk]
    @ID uniqueidentifier = NULL,
    @ContentItemID uniqueidentifier,
    @Sequence int,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ID],
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk]
    @ID uniqueidentifier,
    @ContentItemID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        [ContentItemID] = ISNULL(@ContentItemID, [ContentItemID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Text] = CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, [Text]) END,
        [VectorRecordID] = CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, [VectorRecordID]) END,
        [EmbeddingStatus] = ISNULL(@EmbeddingStatus, [EmbeddingStatus]),
        [TaggingStatus] = ISNULL(@TaggingStatus, [TaggingStatus]),
        [DeleteStatus] = CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, [DeleteStatus]) END,
        [LastEmbeddedAt] = CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, [LastEmbeddedAt]) END,
        [LastTaggedAt] = CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, [LastTaggedAt]) END,
        [LastDeletedAt] = CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, [LastDeletedAt]) END,
        [Modality] = ISNULL(@Modality, [Modality]),
        [StartOffset] = CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, [StartOffset]) END,
        [EndOffset] = CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, [EndOffset]) END,
        [StartMs] = CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, [StartMs]) END,
        [EndMs] = CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, [EndMs]) END,
        [PageNumber] = CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, [PageNumber]) END,
        [SegmentTitle] = CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, [SegmentTitle]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Transcript] = CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, [Transcript]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [ParentChunkID] = CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, [ParentChunkID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemChunks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemChunk]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemChunk];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemChunk
ON [${flyway:defaultSchema}].[ContentItemChunk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemChunk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemChunk]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* Set categories for 27 fields */

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C07B5B08-0084-4F59-B638-243F526546E4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D402F99-B9A1-4ABB-9D19-A4B204D09BAC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E337B81-5B94-46AC-B696-0EFA27C9F85B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ContentItemID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '073F4C8A-F2AB-4F27-9FE3-743882972F31' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7618B84A-5040-4C23-9007-71F193E13B8A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Modality 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CA10D77-D4C3-4844-9AC6-CF684C1027A5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.SegmentTitle 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '62FF46F8-8815-462F-9F31-8818D831B2BB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.SegmenterKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8C51C895-93BF-43D8-9049-6A6AC8484A76' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '96841354-26BF-4919-91A3-B3170EA58F68' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ContentItem 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Content Item Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9527FB1B-0C05-4C0E-A709-C8922FAC9C8E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunk 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Chunk Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Chunk Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D201B4B-BEDF-4475-A6B0-9CE3063072B3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.RootParentChunkID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3AB39FD0-661F-4722-8D8B-39966220D555' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Text 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80DC7D33-19F5-4781-BC71-E1E1B882C514' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5CB468A1-7C22-47EB-BF54-F53BC2C45714' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.Transcript 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0B9E206-C912-4BAF-9336-A2AF8BABA492' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.VectorRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F761D312-981B-47E1-94DC-42FF4550CC13' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.EmbeddingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '06DB407C-561A-4740-8A28-E93DC745435B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.TaggingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A805FBDB-79C6-4B2B-B39D-693CCE47A9E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.DeleteStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EDEFD181-AC1E-4533-A7F7-CAD268E1EC07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.LastEmbeddedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F645E2C-17FF-4569-B28C-BF8CAEAA0B68' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.LastTaggedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C847A8B-A352-43F7-BCDF-CA951AD2F9A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.LastDeletedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EB2AE41-CE4E-45E5-B481-B929099AC6E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.StartOffset 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0F04464-9380-4CFE-A012-27E6EDA15913' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.EndOffset 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C98F7A52-C1DC-4A2F-8733-5A4A49A6CDE9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.StartMs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Start Milliseconds',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E8A8A29-A598-49A4-AC97-C8DD923E506A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.EndMs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'End Milliseconds',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B42C9ED-789E-4417-AD71-44BBB7EBF7D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Content Item Chunks.PageNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D52720E3-05A7-41B2-8C00-C57D8767A930' AND AutoUpdateCategory = 1;

/* Generated Validation Functions for MJ: AI Agent Types */
-- CHECK constraint for MJ: AI Agent Types: Field: CompactionTriggerPercent was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CompactionTriggerPercent]>=(1) AND [CompactionTriggerPercent]<=(100))', 'public ValidateCompactionTriggerPercentRange(result: ValidationResult) {
    if (this.CompactionTriggerPercent < 1 || this.CompactionTriggerPercent > 100) {
        result.Errors.push(new ValidationErrorInfo(
            "CompactionTriggerPercent",
            "Compaction trigger percentage must be between 1 and 100.",
            this.CompactionTriggerPercent,
            ValidationErrorType.Failure
        ));
    }
}', 'The compaction trigger percentage must be a value between 1 and 100 percent.', 'ValidateCompactionTriggerPercentRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'BE42811A-7C55-4C1E-A654-F7812897B633');



-- ===== CodeGen pass 3 of 3: the two pilot entities adopting LAYERED base views =====
-- Emitted via forceRegeneration (entityWhereClause scoped to these two). Adopting layering
-- is a METADATA change, so neither entity lands in the modified/new list and CodeGen would
-- otherwise create the inner views in the dev database and emit nothing for anyone else.
-- The inner views MUST be created here, because the outer views in the next migration
-- select from them.

/* Base View SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: vwUserViewRunDetailsGenerated
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User View Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserViewRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRunDetailsGenerated]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserViewRunDetailsGenerated];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewRunDetailsGenerated]
AS
SELECT
    u.*,
    MJUserViewRun_UserViewRunID.[UserView] AS [UserViewRun]
FROM
    [${flyway:defaultSchema}].[UserViewRunDetail] AS u
INNER JOIN
    [${flyway:defaultSchema}].[vwUserViewRuns] AS MJUserViewRun_UserViewRunID
  ON
    [u].[UserViewRunID] = MJUserViewRun_UserViewRunID.[ID]
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewRunDetails]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRunDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]';
END;

/* Base View Permissions SQL for MJ: User View Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Run Details
-- Item: Permissions for vwUserViewRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewRunDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View SQL for MJ: Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Installations
-- Item: vwVersionInstallationsGenerated
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Version Installations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VersionInstallation
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVersionInstallationsGenerated]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVersionInstallationsGenerated];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVersionInstallationsGenerated]
AS
SELECT
    v.*
FROM
    [${flyway:defaultSchema}].[VersionInstallation] AS v
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVersionInstallations]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionInstallations] TO [cdp_Integration], [cdp_UI], [cdp_Developer]';
END;

/* Base View Permissions SQL for MJ: Version Installations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Installations
-- Item: Permissions for vwVersionInstallations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionInstallations] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

