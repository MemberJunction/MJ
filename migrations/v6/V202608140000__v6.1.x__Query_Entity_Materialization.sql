/* ============================================================================
   Query & Entity Materialization — consolidated migration
   v6.1.x

   Companion plans:
     /plans/query-entity-materialization.md         (Phase 1 design)
     /plans/query-entity-materialization-phase2.md  (Phase 2 read-time injection)

   Single migration for the whole feature (supersedes the reverted per-step set:
   Foundation + RowFilter + KeyColumns + SourceRowCount + CodeGen + ForceFull-
   RebuildCadence + ReadFilterSpec). Creates the "MJ: Materialized Results" entity
   with its FINAL column shape in ONE correct CREATE TABLE (no incremental
   create→alter→codegen churn), the "MJ: Materialized Result Queries" join table,
   and the author-intent flag on Query. The CodeGen output (entity/field metadata,
   wrapper view, CRUD procs, permissions) is a SINGLE pass generated against this
   final schema and appended below after the DDL.

   DB-design note (circular-FK elimination): the original design put FKs in BOTH
   directions — MaterializedResult.SourceQueryID → Query AND Query.MaterializedResultID
   → MaterializedResult — which is a mutual FK cycle CodeGen rejects. The relationship
   is instead carried as rows in the dedicated join table ${flyway:defaultSchema}.MaterializedResultQuery
   (both FKs point OUTWARD → no cycle). A query's materialization is found via
   MaterializedResultQuery.QueryID; author intent is Query.IsMaterialized. There is no
   SourceQueryID or MaterializedResultID column.

   Note (CodeGen handles automatically — intentionally omitted below):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata (generated from this schema; the default schema's
       'MJ: ' EntityNamePrefix yields "MJ: Materialized Results" and
       "MJ: Materialized Result Queries")
   ============================================================================ */

-- ─── MJ: Materialized Results ────────────────────────────────────────────────
-- One row per materialization. Unifies both "front doors" (a materialized stored
-- Query, or a materialized entity base view) at the metadata layer, and is the
-- work queue the refresh scheduler reads. Final column shape (all phases).
CREATE TABLE ${flyway:defaultSchema}.MaterializedResult (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),

    -- Which door produced this materialization.
    SourceType          NVARCHAR(20)     NOT NULL,

    -- Provenance for the base-view case (the Query case links via MaterializedResultQuery).
    SourceEntityID      UNIQUEIDENTIFIER NULL,   -- base-view case (the source entity; null for query)
    GeneratedEntityID   UNIQUEIDENTIFIER NULL,   -- Query case: the new read-only Virtual Entity (null for base-view, which reuses the source entity)

    -- Physical objects (the table is swappable storage; the view is the stable contract).
    SchemaName          NVARCHAR(255)    NOT NULL,
    TableName           NVARCHAR(255)    NOT NULL,
    ViewName            NVARCHAR(255)    NOT NULL,

    -- Parameterization classification (§9).
    ParamMode           NVARCHAR(20)     NOT NULL DEFAULT 'None',

    -- Refresh model (§11).
    RefreshStrategy     NVARCHAR(30)     NOT NULL DEFAULT 'FullRebuild',
    RefreshSchedule     NVARCHAR(255)    NULL,    -- cron expression; NULL = manual only
    LastRefreshedAt     DATETIMEOFFSET   NULL,
    NextRefreshAt       DATETIMEOFFSET   NULL,
    Watermark           DATETIMEOFFSET   NULL,    -- last-seen MAX(__mj_UpdatedAt) for incremental / dirty-group

    -- Lifecycle (§13).
    Status              NVARCHAR(20)     NOT NULL DEFAULT 'Building',

    -- Cost / size profile for the selection contract (§8).
    [RowCount]          BIGINT           NULL,
    ApproxBuildCostMs   BIGINT           NULL,

    -- Free-text / structured note: what this materialization is good for (§8).
    IntendedWorkload    NVARCHAR(MAX)    NULL,

    -- Row-filter (RowFilterBroad) persistence (§6.4 / §9).
    RowFilterColumns    NVARCHAR(MAX)    NULL,
    BroadSQL            NVARCHAR(MAX)    NULL,

    -- Keyed/aggregation surrogate hashing (§ Phase 3).
    KeyColumns          NVARCHAR(MAX)    NULL,

    -- DirtyGroupRecompute delete-detection guard (§ Phase 3).
    SourceRowCount      BIGINT           NULL,

    -- Incremental forced-full-rebuild cadence (balanced-delete self-heal).
    RefreshesSinceFullRebuild INT        NOT NULL DEFAULT 0,

    -- Read-time filter predicate contract for RowFilterBroad (§ Phase 2 read injection).
    ReadFilterSpec      NVARCHAR(MAX)    NULL,

    CONSTRAINT PK_MaterializedResult PRIMARY KEY (ID),
    CONSTRAINT FK_MaterializedResult_SourceEntity
        FOREIGN KEY (SourceEntityID)    REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_MaterializedResult_GeneratedEntity
        FOREIGN KEY (GeneratedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_MaterializedResult_SourceType
        CHECK (SourceType IN ('Query', 'EntityBaseView')),
    CONSTRAINT CK_MaterializedResult_ParamMode
        CHECK (ParamMode IN ('None', 'RowFilterBroad', 'PerValueCache', 'BoundFixed')),
    CONSTRAINT CK_MaterializedResult_RefreshStrategy
        CHECK (RefreshStrategy IN ('FullRebuild', 'Incremental', 'DirtyGroupRecompute')),
    CONSTRAINT CK_MaterializedResult_Status
        CHECK (Status IN ('Active', 'Stale', 'Building', 'Disabled', 'DriftHold'))
);

-- ─── MJ: Materialized Result Queries (join table) ────────────────────────────
-- Carries the MaterializedResult <-> Query relationship as rows (replaces the
-- former SourceQueryID / MaterializedResultID direct FKs, which formed a mutual
-- FK cycle). Both FKs point outward → no cycle. The pairing is 1:1 (a query has
-- at most one materialization and vice-versa), enforced by the two UNIQUE keys.
CREATE TABLE ${flyway:defaultSchema}.MaterializedResultQuery (
    ID                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MaterializedResultID UNIQUEIDENTIFIER NOT NULL,
    QueryID              UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_MaterializedResultQuery PRIMARY KEY (ID),
    CONSTRAINT FK_MaterializedResultQuery_MaterializedResult
        FOREIGN KEY (MaterializedResultID) REFERENCES ${flyway:defaultSchema}.MaterializedResult(ID),
    CONSTRAINT FK_MaterializedResultQuery_Query
        FOREIGN KEY (QueryID)              REFERENCES ${flyway:defaultSchema}.Query(ID),
    CONSTRAINT UQ_MaterializedResultQuery_MaterializedResult UNIQUE (MaterializedResultID),
    CONSTRAINT UQ_MaterializedResultQuery_Query UNIQUE (QueryID)
);

-- ─── Author-intent flag on Query (§3.3) ──────────────────────────────────────
-- The author's *declared intent* that CodeGen scans for; the MaterializedResult row
-- carries the authoritative state, linked via the MaterializedResultQuery join table.
ALTER TABLE ${flyway:defaultSchema}.Query ADD
    IsMaterialized       BIT              NOT NULL DEFAULT 0;

-- ─── Column descriptions (CodeGen reads these into EntityField metadata) ──────
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Which materialization door produced this row: ''Query'' (a materialized stored Query, surfaced as a new read-only Virtual Entity; the source query is linked via the MaterializedResultQuery join table) or ''EntityBaseView'' (a 1:1 materialized copy of an existing entity''s base view, which reuses the source entity).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'SourceType';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For the EntityBaseView case, the existing entity whose base view is materialized (RLS applies unchanged). NULL for the Query case (whose source query is linked via the MaterializedResultQuery join table).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'SourceEntityID';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For the Query case, the new read-only Virtual Entity CodeGen mints for the materialized result shape. NULL for the EntityBaseView case (which reuses the source entity).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'GeneratedEntityID';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Schema of the physical materialized table and its wrapper view.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'SchemaName';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Physical materialized table (swappable storage, repointed on atomic refresh). Convention: materialized_<Name>.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'TableName';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Wrapper view (the stable read contract; body is SELECT * FROM the physical table). Convention: materialized_vw<Name>. The atomic swap repoints this view, never truncates the table in place.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'ViewName';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Parameterization classification: ''None'' (unparameterized), ''RowFilterBroad'' (materialize broad, filter at read), ''PerValueCache'' (bounded structural variant), or ''BoundFixed'' (params bound to fixed values). v1 supports ''None'' and ''RowFilterBroad''; ''PerValueCache'' and ''BoundFixed'' are reserved for later phases.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'ParamMode';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Refresh strategy: ''FullRebuild'' (rebuild the whole result), ''Incremental'' (MERGE on the surrogate key), or ''DirtyGroupRecompute'' (recompute groups changed since Watermark). v1 ships all three: ''FullRebuild'' for unkeyed materializations, and ''Incremental''/''DirtyGroupRecompute'' auto-selected by CodeGen for eligible keyed aggregations.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'RefreshStrategy';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Cron expression for scheduled rehydration via the ScheduledJobEngine. NULL means manual refresh only. Stagger across materializations to avoid refresh-window contention.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'RefreshSchedule';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Timestamp of the last successful refresh (freshness surfacing for the selection contract).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'LastRefreshedAt';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Next scheduled refresh time, computed from RefreshSchedule; the scheduler reads this as its due-work signal.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'NextRefreshAt';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Last-seen MAX(__mj_UpdatedAt) of the source data; the staleness probe for incremental / dirty-group refresh. Reuses the existing query smart-cache fingerprint pattern.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'Watermark';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Lifecycle state: ''Building'' (materializing), ''Active'' (fresh, readable), ''Stale'' (past expected freshness), ''Disabled'' (turned off), ''DriftHold'' (upstream schema drift detected; held for review).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Approximate row count of the last build — part of the cost/size profile an agent (Skip) uses to choose live vs. materialized.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'RowCount';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Approximate build cost in milliseconds of the last refresh — part of the cost/size profile for the selection contract.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'ApproxBuildCostMs';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Human/structured note describing what this materialization is good for; surfaced in the selection contract so callers pick the right variant.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'IntendedWorkload';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'JSON array of the output column names that the row-filter parameters map to. Populated when ParamMode is RowFilterBroad. The materialization holds all rows broad and these columns are filtered at read time (plan section 6.4). NULL for non-row-filter materializations.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'RowFilterColumns';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For a RowFilterBroad materialization, the broad source SELECT that the refresh engine materializes: the source query with its row-filter WHERE predicates removed, so the materialized table holds every row the query could return for any parameter value. NULL for non-parameterized materializations, which use the source query SQL directly.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'BroadSQL';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Phase 3: JSON array of the key columns ({name, type}) for a keyed/aggregation materialization — the combined key hashed into the surrogate (the stable match key for incremental refresh / dirty-group recompute). NULL means not keyed, in which case a synthetic IDENTITY/ROW_NUMBER surrogate is used.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'KeyColumns';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Phase 3 (DirtyGroupRecompute): the SOURCE table row count observed at the last successful refresh. Delete-detection guard — if the current source COUNT(*) is lower than this, rows were deleted and the refresh falls back to a full rebuild (dirty-group recompute cannot localize deletes from surviving rows). NULL means no baseline yet (first run does a full rebuild and sets it). Distinct from RowCount, which counts materialized rows (groups).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'SourceRowCount';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Count of consecutive incremental (Incremental/DirtyGroupRecompute) refreshes since the last full rebuild. The refresher forces a full rebuild once this reaches its threshold, reconciling drift that a balanced delete+insert (net-zero source row-count change) leaves uncaught by the delete-detection guard. Reset to 0 on every full rebuild; incremented on every incremental refresh.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'RefreshesSinceFullRebuild';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For a RowFilterBroad materialization, a JSON array of read-time filter predicates — each { column, operator, paramName, kind } — that the runtime provider injects against the broad materialized table when a caller runs the query with DataSource=Materialized. operator is one of the read-time-safe set (=, !=, <>, <, >, <=, >=, IN, NOT IN); kind is scalar or list. Values are always bound as SQL parameters, never interpolated. NULL for non-row-filter materializations.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'ReadFilterSpec';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'The materialization (MJ: Materialized Results) side of the query<->materialization link.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResultQuery', @level2type=N'COLUMN', @level2name=N'MaterializedResultID';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'The source Query (MJ: Queries) whose result this materialization was built from. The link lives here (not as a direct FK on either table) to avoid the MaterializedResult<->Query circular dependency.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResultQuery', @level2type=N'COLUMN', @level2name=N'QueryID';

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Author''s declared intent that this Query should be materialized. CodeGen scans for IsMaterialized = 1 and, if the query qualifies (§9/§10), materializes it. The authoritative state lives on the linked MJ: Materialized Results row (found via the MaterializedResultQuery join table).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Query', @level2type=N'COLUMN', @level2name=N'IsMaterialized';
GO


















































/**********************************************************************************************************************
 * CodeGen Run Output — appended per MemberJunction single-migration convention (do NOT ship a separate CodeGen_Run file)
 *
 * The statements below are emitted by `mj codegen` for the two new entities created by the DDL above
 * (MJ: Materialized Results, MJ: Materialized Result Queries) and the Query.IsMaterialized field:
 * entity/field metadata, base views, CRUD stored procedures, permissions, and entity relationships.
 **********************************************************************************************************************/

/* SQL generated to create new entity MJ: Materialized Results */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'e7606da1-ab65-4a6d-bc7e-0970bf30dc50',
         'MJ: Materialized Results',
         'Materialized Results',
         NULL,
         NULL,
         'MaterializedResult',
         'vwMaterializedResults',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Materialized Results to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e7606da1-ab65-4a6d-bc7e-0970bf30dc50', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Materialized Results for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e7606da1-ab65-4a6d-bc7e-0970bf30dc50', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Materialized Results for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e7606da1-ab65-4a6d-bc7e-0970bf30dc50', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Materialized Results for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e7606da1-ab65-4a6d-bc7e-0970bf30dc50', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: Materialized Result Queries */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ab9eca24-70b0-49b8-80cb-0d57c6e63339',
         'MJ: Materialized Result Queries',
         'Materialized Result Queries',
         NULL,
         NULL,
         'MaterializedResultQuery',
         'vwMaterializedResultQueries',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Materialized Result Queries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ab9eca24-70b0-49b8-80cb-0d57c6e63339', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Materialized Result Queries for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ab9eca24-70b0-49b8-80cb-0d57c6e63339', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Materialized Result Queries for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ab9eca24-70b0-49b8-80cb-0d57c6e63339', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Materialized Result Queries for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ab9eca24-70b0-49b8-80cb-0d57c6e63339', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResult] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResult] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResult] ADD CONSTRAINT [DF___mj_MaterializedResult___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResult] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResult] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResult */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResult] ADD CONSTRAINT [DF___mj_MaterializedResult___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResultQuery] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
UPDATE [${flyway:defaultSchema}].[MaterializedResultQuery] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResultQuery] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResultQuery] ADD CONSTRAINT [DF___mj_MaterializedResultQuery___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResultQuery] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
UPDATE [${flyway:defaultSchema}].[MaterializedResultQuery] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResultQuery] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MaterializedResultQuery */
ALTER TABLE [${flyway:defaultSchema}].[MaterializedResultQuery] ADD CONSTRAINT [DF___mj_MaterializedResultQuery___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 31 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae855067-4272-42c0-9a27-43c54d482a3f' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'ID')) BEGIN
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
            'ae855067-4272-42c0-9a27-43c54d482a3f',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '220a7546-e3a3-4970-857c-c3d7c5da5069' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'SourceType')) BEGIN
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
            '220a7546-e3a3-4970-857c-c3d7c5da5069',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 2,
            'SourceType',
            'Source Type',
            'Which materialization door produced this row: ''Query'' (a materialized stored Query, surfaced as a new read-only Virtual Entity; the source query is linked via the MaterializedResultQuery join table) or ''EntityBaseView'' (a 1:1 materialized copy of an existing entity''s base view, which reuses the source entity).',
            'nvarchar',
            40,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e380096f-4e02-4bcd-94a0-6de8d8c95d6d' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'SourceEntityID')) BEGIN
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
            'e380096f-4e02-4bcd-94a0-6de8d8c95d6d',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 3,
            'SourceEntityID',
            'Source Entity ID',
            'For the EntityBaseView case, the existing entity whose base view is materialized (RLS applies unchanged). NULL for the Query case (whose source query is linked via the MaterializedResultQuery join table).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a50de14a-85fd-43d9-ab17-56c2388a2f5e' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'GeneratedEntityID')) BEGIN
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
            'a50de14a-85fd-43d9-ab17-56c2388a2f5e',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 4,
            'GeneratedEntityID',
            'Generated Entity ID',
            'For the Query case, the new read-only Virtual Entity CodeGen mints for the materialized result shape. NULL for the EntityBaseView case (which reuses the source entity).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb315b4d-3751-48de-8bf8-a08c62b54548' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'SchemaName')) BEGIN
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
            'fb315b4d-3751-48de-8bf8-a08c62b54548',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 5,
            'SchemaName',
            'Schema Name',
            'Schema of the physical materialized table and its wrapper view.',
            'nvarchar',
            510,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8f9c20b-cca4-413a-ba8b-ddec4be897ad' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'TableName')) BEGIN
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
            'f8f9c20b-cca4-413a-ba8b-ddec4be897ad',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 6,
            'TableName',
            'Table Name',
            'Physical materialized table (swappable storage, repointed on atomic refresh). Convention: materialized_<Name>.',
            'nvarchar',
            510,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f71c2a95-dbda-4d6e-b942-78ee06ff2873' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'ViewName')) BEGIN
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
            'f71c2a95-dbda-4d6e-b942-78ee06ff2873',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 7,
            'ViewName',
            'View Name',
            'Wrapper view (the stable read contract; body is SELECT * FROM the physical table). Convention: materialized_vw<Name>. The atomic swap repoints this view, never truncates the table in place.',
            'nvarchar',
            510,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f7a88fc-346e-4165-9586-3873163ffa08' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'ParamMode')) BEGIN
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
            '5f7a88fc-346e-4165-9586-3873163ffa08',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 8,
            'ParamMode',
            'Param Mode',
            'Parameterization classification: ''None'' (unparameterized), ''RowFilterBroad'' (materialize broad, filter at read), ''PerValueCache'' (bounded structural variant), or ''BoundFixed'' (params bound to fixed values). v1 supports ''None'' and ''RowFilterBroad''; ''PerValueCache'' and ''BoundFixed'' are reserved for later phases.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'None',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e9c7182e-612c-441a-9004-5b1ffd527181' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'RefreshStrategy')) BEGIN
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
            'e9c7182e-612c-441a-9004-5b1ffd527181',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 9,
            'RefreshStrategy',
            'Refresh Strategy',
            'Refresh strategy: ''FullRebuild'' (rebuild the whole result), ''Incremental'' (MERGE on the surrogate key), or ''DirtyGroupRecompute'' (recompute groups changed since Watermark). v1 ships all three: ''FullRebuild'' for unkeyed materializations, and ''Incremental''/''DirtyGroupRecompute'' auto-selected by CodeGen for eligible keyed aggregations.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'FullRebuild',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9667f45f-7a9a-4cfa-9a02-64616a694678' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'RefreshSchedule')) BEGIN
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
            '9667f45f-7a9a-4cfa-9a02-64616a694678',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 10,
            'RefreshSchedule',
            'Refresh Schedule',
            'Cron expression for scheduled rehydration via the ScheduledJobEngine. NULL means manual refresh only. Stagger across materializations to avoid refresh-window contention.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f34a70c-498b-4c10-8014-425c7a85ce0d' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'LastRefreshedAt')) BEGIN
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
            '4f34a70c-498b-4c10-8014-425c7a85ce0d',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 11,
            'LastRefreshedAt',
            'Last Refreshed At',
            'Timestamp of the last successful refresh (freshness surfacing for the selection contract).',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb97e7ab-5e10-4a68-89e7-918154742919' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'NextRefreshAt')) BEGIN
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
            'bb97e7ab-5e10-4a68-89e7-918154742919',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 12,
            'NextRefreshAt',
            'Next Refresh At',
            'Next scheduled refresh time, computed from RefreshSchedule; the scheduler reads this as its due-work signal.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'db11789a-dedd-4b1f-a401-c4ecd8f61efe' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'Watermark')) BEGIN
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
            'db11789a-dedd-4b1f-a401-c4ecd8f61efe',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 13,
            'Watermark',
            'Watermark',
            'Last-seen MAX(__mj_UpdatedAt) of the source data; the staleness probe for incremental / dirty-group refresh. Reuses the existing query smart-cache fingerprint pattern.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ad0de01-90f6-4988-928f-00a1aa588691' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'Status')) BEGIN
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
            '6ad0de01-90f6-4988-928f-00a1aa588691',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 14,
            'Status',
            'Status',
            'Lifecycle state: ''Building'' (materializing), ''Active'' (fresh, readable), ''Stale'' (past expected freshness), ''Disabled'' (turned off), ''DriftHold'' (upstream schema drift detected; held for review).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Building',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb316ab6-9b1a-479c-b1a6-f0f3626c02a1' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'RowCount')) BEGIN
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
            'eb316ab6-9b1a-479c-b1a6-f0f3626c02a1',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 15,
            'RowCount',
            'Row Count',
            'Approximate row count of the last build — part of the cost/size profile an agent (Skip) uses to choose live vs. materialized.',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c27d62e3-d1d7-4385-b70a-66bac9a584ce' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'ApproxBuildCostMs')) BEGIN
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
            'c27d62e3-d1d7-4385-b70a-66bac9a584ce',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 16,
            'ApproxBuildCostMs',
            'Approx Build Cost Ms',
            'Approximate build cost in milliseconds of the last refresh — part of the cost/size profile for the selection contract.',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc5e90bd-5cc2-40b9-888f-79ef4b19e204' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'IntendedWorkload')) BEGIN
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
            'dc5e90bd-5cc2-40b9-888f-79ef4b19e204',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 17,
            'IntendedWorkload',
            'Intended Workload',
            'Human/structured note describing what this materialization is good for; surfaced in the selection contract so callers pick the right variant.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ef10a27-673b-473f-b3f0-ba10acaf51d8' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'RowFilterColumns')) BEGIN
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
            '9ef10a27-673b-473f-b3f0-ba10acaf51d8',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 18,
            'RowFilterColumns',
            'Row Filter Columns',
            'JSON array of the output column names that the row-filter parameters map to. Populated when ParamMode is RowFilterBroad. The materialization holds all rows broad and these columns are filtered at read time (plan section 6.4). NULL for non-row-filter materializations.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c61bfdd-47b7-40b9-a5dc-3023f6df54fd' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'BroadSQL')) BEGIN
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
            '1c61bfdd-47b7-40b9-a5dc-3023f6df54fd',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 19,
            'BroadSQL',
            'Broad SQL',
            'For a RowFilterBroad materialization, the broad source SELECT that the refresh engine materializes: the source query with its row-filter WHERE predicates removed, so the materialized table holds every row the query could return for any parameter value. NULL for non-parameterized materializations, which use the source query SQL directly.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a671411-66f0-45c6-821c-eadf439389aa' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'KeyColumns')) BEGIN
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
            '1a671411-66f0-45c6-821c-eadf439389aa',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 20,
            'KeyColumns',
            'Key Columns',
            'Phase 3: JSON array of the key columns ({name, type}) for a keyed/aggregation materialization — the combined key hashed into the surrogate (the stable match key for incremental refresh / dirty-group recompute). NULL means not keyed, in which case a synthetic IDENTITY/ROW_NUMBER surrogate is used.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'debd7ba5-864e-452c-9ab0-16557ca691cf' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'SourceRowCount')) BEGIN
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
            'debd7ba5-864e-452c-9ab0-16557ca691cf',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 21,
            'SourceRowCount',
            'Source Row Count',
            'Phase 3 (DirtyGroupRecompute): the SOURCE table row count observed at the last successful refresh. Delete-detection guard — if the current source COUNT(*) is lower than this, rows were deleted and the refresh falls back to a full rebuild (dirty-group recompute cannot localize deletes from surviving rows). NULL means no baseline yet (first run does a full rebuild and sets it). Distinct from RowCount, which counts materialized rows (groups).',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '534dcd98-5678-441a-b177-2ba662f370a8' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'RefreshesSinceFullRebuild')) BEGIN
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
            '534dcd98-5678-441a-b177-2ba662f370a8',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 22,
            'RefreshesSinceFullRebuild',
            'Refreshes Since Full Rebuild',
            'Count of consecutive incremental (Incremental/DirtyGroupRecompute) refreshes since the last full rebuild. The refresher forces a full rebuild once this reaches its threshold, reconciling drift that a balanced delete+insert (net-zero source row-count change) leaves uncaught by the delete-detection guard. Reset to 0 on every full rebuild; incremented on every incremental refresh.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f4443c7-1f61-4322-b565-537251f85b5f' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'ReadFilterSpec')) BEGIN
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
            '7f4443c7-1f61-4322-b565-537251f85b5f',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 23,
            'ReadFilterSpec',
            'Read Filter Spec',
            'For a RowFilterBroad materialization, a JSON array of read-time filter predicates — each { column, operator, paramName, kind } — that the runtime provider injects against the broad materialized table when a caller runs the query with DataSource=Materialized. operator is one of the read-time-safe set (=, !=, <>, <, >, <=, >=, IN, NOT IN); kind is scalar or list. Values are always bound as SQL parameters, never interpolated. NULL for non-row-filter materializations.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0c31a10-6977-4c1f-a3bd-33615a245ba4' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = '__mj_CreatedAt')) BEGIN
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
            'd0c31a10-6977-4c1f-a3bd-33615a245ba4',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 24,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd54fcc87-7142-41c8-bfbe-53adf4eca896' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd54fcc87-7142-41c8-bfbe-53adf4eca896',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 25,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '480b3f08-ae0f-4c5f-b3e2-f398cefebb87' OR (EntityID = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND Name = 'ID')) BEGIN
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
            '480b3f08-ae0f-4c5f-b3e2-f398cefebb87',
            'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- Entity: MJ: Materialized Result Queries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a2e6ee3e-9584-4cad-b940-9715470e9e34' OR (EntityID = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND Name = 'MaterializedResultID')) BEGIN
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
            'a2e6ee3e-9584-4cad-b940-9715470e9e34',
            'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- Entity: MJ: Materialized Result Queries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 2,
            'MaterializedResultID',
            'Materialized Result ID',
            'The materialization (MJ: Materialized Results) side of the query<->materialization link.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de467b6e-8bc2-47a2-a908-345e94eb5939' OR (EntityID = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND Name = 'QueryID')) BEGIN
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
            'de467b6e-8bc2-47a2-a908-345e94eb5939',
            'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- Entity: MJ: Materialized Result Queries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 3,
            'QueryID',
            'Query ID',
            'The source Query (MJ: Queries) whose result this materialization was built from. The link lives here (not as a direct FK on either table) to avoid the MaterializedResult<->Query circular dependency.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '1B248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4be737b3-4430-4c07-85fe-20d4f098960d' OR (EntityID = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4be737b3-4430-4c07-85fe-20d4f098960d',
            'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- Entity: MJ: Materialized Result Queries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 4,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15320ca5-af0b-47e7-a597-8f97efa19b58' OR (EntityID = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '15320ca5-af0b-47e7-a597-8f97efa19b58',
            'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- Entity: MJ: Materialized Result Queries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 5,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca8eddc4-0ec1-41ed-8f2b-7fb2acc0ccb3' OR (EntityID = '1B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsMaterialized')) BEGIN
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
            'ca8eddc4-0ec1-41ed-8f2b-7fb2acc0ccb3',
            '1B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Queries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1B248F34-2837-EF11-86D4-6045BDEE16E6') + 26,
            'IsMaterialized',
            'Is Materialized',
            'Author''s declared intent that this Query should be materialized. CodeGen scans for IsMaterialized = 1 and, if the query qualifies (§9/§10), materializes it. The authoritative state lives on the linked MJ: Materialized Results row (found via the MaterializedResultQuery join table).',
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

/* SQL text to insert entity field value with ID f2c0df9f-a421-483e-babe-ee9c0556ddc2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f2c0df9f-a421-483e-babe-ee9c0556ddc2', '220A7546-E3A3-4970-857C-C3D7C5DA5069', 1, 'EntityBaseView', 'EntityBaseView', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4e9499aa-dfa2-4136-a1db-96fc9723d4c5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4e9499aa-dfa2-4136-a1db-96fc9723d4c5', '220A7546-E3A3-4970-857C-C3D7C5DA5069', 2, 'Query', 'Query', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 220A7546-E3A3-4970-857C-C3D7C5DA5069 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='220A7546-E3A3-4970-857C-C3D7C5DA5069';

/* SQL text to insert entity field value with ID cfee325e-8083-4704-9861-bd9275360cae */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cfee325e-8083-4704-9861-bd9275360cae', '5F7A88FC-346E-4165-9586-3873163FFA08', 1, 'BoundFixed', 'BoundFixed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3d08948e-e3f6-46a3-bef3-51cfcfde8aa9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3d08948e-e3f6-46a3-bef3-51cfcfde8aa9', '5F7A88FC-346E-4165-9586-3873163FFA08', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f7355537-76ab-49e0-8926-13e676b0e849 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f7355537-76ab-49e0-8926-13e676b0e849', '5F7A88FC-346E-4165-9586-3873163FFA08', 3, 'PerValueCache', 'PerValueCache', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b2cdab44-af5e-4cfa-be26-d16a4e1ef6b9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b2cdab44-af5e-4cfa-be26-d16a4e1ef6b9', '5F7A88FC-346E-4165-9586-3873163FFA08', 4, 'RowFilterBroad', 'RowFilterBroad', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5F7A88FC-346E-4165-9586-3873163FFA08 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5F7A88FC-346E-4165-9586-3873163FFA08';

/* SQL text to insert entity field value with ID 6e0b5dfc-41dd-47a1-bc4e-65263711454e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6e0b5dfc-41dd-47a1-bc4e-65263711454e', 'E9C7182E-612C-441A-9004-5B1FFD527181', 1, 'DirtyGroupRecompute', 'DirtyGroupRecompute', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eff83664-0aeb-469b-8ab6-6ff5b47bdc56 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eff83664-0aeb-469b-8ab6-6ff5b47bdc56', 'E9C7182E-612C-441A-9004-5B1FFD527181', 2, 'FullRebuild', 'FullRebuild', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 98164d3b-bb86-41a9-a23e-5efde48a26c3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('98164d3b-bb86-41a9-a23e-5efde48a26c3', 'E9C7182E-612C-441A-9004-5B1FFD527181', 3, 'Incremental', 'Incremental', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E9C7182E-612C-441A-9004-5B1FFD527181 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E9C7182E-612C-441A-9004-5B1FFD527181';

/* SQL text to insert entity field value with ID e806bf74-93a8-474a-834f-17aaba7401aa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e806bf74-93a8-474a-834f-17aaba7401aa', '6AD0DE01-90F6-4988-928F-00A1AA588691', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cefd10de-ac95-4ef1-8ada-524e6ef5c3b5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cefd10de-ac95-4ef1-8ada-524e6ef5c3b5', '6AD0DE01-90F6-4988-928F-00A1AA588691', 2, 'Building', 'Building', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 73f603f9-3036-454c-9a9e-7116534bee7d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('73f603f9-3036-454c-9a9e-7116534bee7d', '6AD0DE01-90F6-4988-928F-00A1AA588691', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e327b83b-24f4-4477-bea4-7dcb3d8e499b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e327b83b-24f4-4477-bea4-7dcb3d8e499b', '6AD0DE01-90F6-4988-928F-00A1AA588691', 4, 'DriftHold', 'DriftHold', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 994999a7-1ecc-494b-aca8-4f8befc66c34 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('994999a7-1ecc-494b-aca8-4f8befc66c34', '6AD0DE01-90F6-4988-928F-00A1AA588691', 5, 'Stale', 'Stale', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6AD0DE01-90F6-4988-928F-00A1AA588691 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6AD0DE01-90F6-4988-928F-00A1AA588691';


/* Create Entity Relationship: MJ: Materialized Results -> MJ: Materialized Result Queries (One To Many via MaterializedResultID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9036d2f9-0a1f-4a5a-9766-8185817046d5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9036d2f9-0a1f-4a5a-9766-8185817046d5', 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', 'MaterializedResultID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Materialized Results (One To Many via SourceEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f3a33a4d-944e-40f7-a74b-bd384a6c909d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f3a33a4d-944e-40f7-a74b-bd384a6c909d', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', 'SourceEntityID', 'One To Many', 1, 1, 74, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Materialized Results (One To Many via GeneratedEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5c86af12-934b-4baf-9108-db2ca4658876'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5c86af12-934b-4baf-9108-db2ca4658876', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', 'GeneratedEntityID', 'One To Many', 1, 1, 75, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Queries -> MJ: Materialized Result Queries (One To Many via QueryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'cd9f0517-320b-4b39-a576-849620510e97'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cd9f0517-320b-4b39-a576-849620510e97', '1B248F34-2837-EF11-86D4-6045BDEE16E6', 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', 'QueryID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for MaterializedResultQuery */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MaterializedResultID in table MaterializedResultQuery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MaterializedResultQuery_MaterializedResultID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MaterializedResultQuery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MaterializedResultQuery_MaterializedResultID ON [${flyway:defaultSchema}].[MaterializedResultQuery] ([MaterializedResultID]);

-- Index for foreign key QueryID in table MaterializedResultQuery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MaterializedResultQuery_QueryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MaterializedResultQuery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MaterializedResultQuery_QueryID ON [${flyway:defaultSchema}].[MaterializedResultQuery] ([QueryID]);

/* SQL text to update entity field related entity name field map for entity field ID DE467B6E-8BC2-47A2-A908-345E94EB5939 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DE467B6E-8BC2-47A2-A908-345E94EB5939', @RelatedEntityNameFieldMap='Query';

/* Base View SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: vwMaterializedResultQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Materialized Result Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MaterializedResultQuery
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMaterializedResultQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMaterializedResultQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMaterializedResultQueries]
AS
SELECT
    m.*,
    MJQuery_QueryID.[Name] AS [Query]
FROM
    [${flyway:defaultSchema}].[MaterializedResultQuery] AS m
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS MJQuery_QueryID
  ON
    [m].[QueryID] = MJQuery_QueryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMaterializedResultQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: Permissions for vwMaterializedResultQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMaterializedResultQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: spCreateMaterializedResultQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MaterializedResultQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMaterializedResultQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMaterializedResultQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMaterializedResultQuery]
    @ID uniqueidentifier = NULL,
    @MaterializedResultID uniqueidentifier,
    @QueryID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MaterializedResultQuery]
            (
                [ID],
                [MaterializedResultID],
                [QueryID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MaterializedResultID,
                @QueryID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MaterializedResultQuery]
            (
                [MaterializedResultID],
                [QueryID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MaterializedResultID,
                @QueryID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMaterializedResultQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMaterializedResultQuery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Materialized Result Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMaterializedResultQuery] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: spUpdateMaterializedResultQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MaterializedResultQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMaterializedResultQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMaterializedResultQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMaterializedResultQuery]
    @ID uniqueidentifier,
    @MaterializedResultID uniqueidentifier = NULL,
    @QueryID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MaterializedResultQuery]
    SET
        [MaterializedResultID] = ISNULL(@MaterializedResultID, [MaterializedResultID]),
        [QueryID] = ISNULL(@QueryID, [QueryID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMaterializedResultQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMaterializedResultQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMaterializedResultQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MaterializedResultQuery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMaterializedResultQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMaterializedResultQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMaterializedResultQuery
ON [${flyway:defaultSchema}].[MaterializedResultQuery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MaterializedResultQuery]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MaterializedResultQuery] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Materialized Result Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMaterializedResultQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Materialized Result Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Result Queries
-- Item: spDeleteMaterializedResultQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MaterializedResultQuery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMaterializedResultQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMaterializedResultQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMaterializedResultQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MaterializedResultQuery]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMaterializedResultQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Materialized Result Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMaterializedResultQuery] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MaterializedResult */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceEntityID in table MaterializedResult
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MaterializedResult_SourceEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MaterializedResult]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MaterializedResult_SourceEntityID ON [${flyway:defaultSchema}].[MaterializedResult] ([SourceEntityID]);

-- Index for foreign key GeneratedEntityID in table MaterializedResult
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MaterializedResult_GeneratedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MaterializedResult]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MaterializedResult_GeneratedEntityID ON [${flyway:defaultSchema}].[MaterializedResult] ([GeneratedEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID E380096F-4E02-4BCD-94A0-6DE8D8C95D6D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E380096F-4E02-4BCD-94A0-6DE8D8C95D6D', @RelatedEntityNameFieldMap='SourceEntity';

/* SQL text to update entity field related entity name field map for entity field ID A50DE14A-85FD-43D9-AB17-56C2388A2F5E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A50DE14A-85FD-43D9-AB17-56C2388A2F5E', @RelatedEntityNameFieldMap='GeneratedEntity';

/* Base View SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: vwMaterializedResults
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Materialized Results
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MaterializedResult
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMaterializedResults]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMaterializedResults];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMaterializedResults]
AS
SELECT
    m.*,
    MJEntity_SourceEntityID.[Name] AS [SourceEntity],
    MJEntity_GeneratedEntityID.[Name] AS [GeneratedEntity]
FROM
    [${flyway:defaultSchema}].[MaterializedResult] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_SourceEntityID
  ON
    [m].[SourceEntityID] = MJEntity_SourceEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_GeneratedEntityID
  ON
    [m].[GeneratedEntityID] = MJEntity_GeneratedEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMaterializedResults] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: Permissions for vwMaterializedResults
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMaterializedResults] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: spCreateMaterializedResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MaterializedResult
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMaterializedResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMaterializedResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMaterializedResult]
    @ID uniqueidentifier = NULL,
    @SourceType nvarchar(20),
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @GeneratedEntityID_Clear bit = 0,
    @GeneratedEntityID uniqueidentifier = NULL,
    @SchemaName nvarchar(255),
    @TableName nvarchar(255),
    @ViewName nvarchar(255),
    @ParamMode nvarchar(20) = NULL,
    @RefreshStrategy nvarchar(30) = NULL,
    @RefreshSchedule_Clear bit = 0,
    @RefreshSchedule nvarchar(255) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @NextRefreshAt_Clear bit = 0,
    @NextRefreshAt datetimeoffset = NULL,
    @Watermark_Clear bit = 0,
    @Watermark datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @ApproxBuildCostMs_Clear bit = 0,
    @ApproxBuildCostMs bigint = NULL,
    @IntendedWorkload_Clear bit = 0,
    @IntendedWorkload nvarchar(MAX) = NULL,
    @RowFilterColumns_Clear bit = 0,
    @RowFilterColumns nvarchar(MAX) = NULL,
    @BroadSQL_Clear bit = 0,
    @BroadSQL nvarchar(MAX) = NULL,
    @KeyColumns_Clear bit = 0,
    @KeyColumns nvarchar(MAX) = NULL,
    @SourceRowCount_Clear bit = 0,
    @SourceRowCount bigint = NULL,
    @RefreshesSinceFullRebuild int = NULL,
    @ReadFilterSpec_Clear bit = 0,
    @ReadFilterSpec nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MaterializedResult]
            (
                [ID],
                [SourceType],
                [SourceEntityID],
                [GeneratedEntityID],
                [SchemaName],
                [TableName],
                [ViewName],
                [ParamMode],
                [RefreshStrategy],
                [RefreshSchedule],
                [LastRefreshedAt],
                [NextRefreshAt],
                [Watermark],
                [Status],
                [RowCount],
                [ApproxBuildCostMs],
                [IntendedWorkload],
                [RowFilterColumns],
                [BroadSQL],
                [KeyColumns],
                [SourceRowCount],
                [RefreshesSinceFullRebuild],
                [ReadFilterSpec]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SourceType,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @GeneratedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedEntityID, NULL) END,
                @SchemaName,
                @TableName,
                @ViewName,
                ISNULL(@ParamMode, 'None'),
                ISNULL(@RefreshStrategy, 'FullRebuild'),
                CASE WHEN @RefreshSchedule_Clear = 1 THEN NULL ELSE ISNULL(@RefreshSchedule, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @NextRefreshAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRefreshAt, NULL) END,
                CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, NULL) END,
                ISNULL(@Status, 'Building'),
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @ApproxBuildCostMs_Clear = 1 THEN NULL ELSE ISNULL(@ApproxBuildCostMs, NULL) END,
                CASE WHEN @IntendedWorkload_Clear = 1 THEN NULL ELSE ISNULL(@IntendedWorkload, NULL) END,
                CASE WHEN @RowFilterColumns_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterColumns, NULL) END,
                CASE WHEN @BroadSQL_Clear = 1 THEN NULL ELSE ISNULL(@BroadSQL, NULL) END,
                CASE WHEN @KeyColumns_Clear = 1 THEN NULL ELSE ISNULL(@KeyColumns, NULL) END,
                CASE WHEN @SourceRowCount_Clear = 1 THEN NULL ELSE ISNULL(@SourceRowCount, NULL) END,
                ISNULL(@RefreshesSinceFullRebuild, 0),
                CASE WHEN @ReadFilterSpec_Clear = 1 THEN NULL ELSE ISNULL(@ReadFilterSpec, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MaterializedResult]
            (
                [SourceType],
                [SourceEntityID],
                [GeneratedEntityID],
                [SchemaName],
                [TableName],
                [ViewName],
                [ParamMode],
                [RefreshStrategy],
                [RefreshSchedule],
                [LastRefreshedAt],
                [NextRefreshAt],
                [Watermark],
                [Status],
                [RowCount],
                [ApproxBuildCostMs],
                [IntendedWorkload],
                [RowFilterColumns],
                [BroadSQL],
                [KeyColumns],
                [SourceRowCount],
                [RefreshesSinceFullRebuild],
                [ReadFilterSpec]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SourceType,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @GeneratedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedEntityID, NULL) END,
                @SchemaName,
                @TableName,
                @ViewName,
                ISNULL(@ParamMode, 'None'),
                ISNULL(@RefreshStrategy, 'FullRebuild'),
                CASE WHEN @RefreshSchedule_Clear = 1 THEN NULL ELSE ISNULL(@RefreshSchedule, NULL) END,
                CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, NULL) END,
                CASE WHEN @NextRefreshAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRefreshAt, NULL) END,
                CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, NULL) END,
                ISNULL(@Status, 'Building'),
                CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, NULL) END,
                CASE WHEN @ApproxBuildCostMs_Clear = 1 THEN NULL ELSE ISNULL(@ApproxBuildCostMs, NULL) END,
                CASE WHEN @IntendedWorkload_Clear = 1 THEN NULL ELSE ISNULL(@IntendedWorkload, NULL) END,
                CASE WHEN @RowFilterColumns_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterColumns, NULL) END,
                CASE WHEN @BroadSQL_Clear = 1 THEN NULL ELSE ISNULL(@BroadSQL, NULL) END,
                CASE WHEN @KeyColumns_Clear = 1 THEN NULL ELSE ISNULL(@KeyColumns, NULL) END,
                CASE WHEN @SourceRowCount_Clear = 1 THEN NULL ELSE ISNULL(@SourceRowCount, NULL) END,
                ISNULL(@RefreshesSinceFullRebuild, 0),
                CASE WHEN @ReadFilterSpec_Clear = 1 THEN NULL ELSE ISNULL(@ReadFilterSpec, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMaterializedResults] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMaterializedResult] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Materialized Results */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMaterializedResult] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: spUpdateMaterializedResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MaterializedResult
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMaterializedResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMaterializedResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMaterializedResult]
    @ID uniqueidentifier,
    @SourceType nvarchar(20) = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @GeneratedEntityID_Clear bit = 0,
    @GeneratedEntityID uniqueidentifier = NULL,
    @SchemaName nvarchar(255) = NULL,
    @TableName nvarchar(255) = NULL,
    @ViewName nvarchar(255) = NULL,
    @ParamMode nvarchar(20) = NULL,
    @RefreshStrategy nvarchar(30) = NULL,
    @RefreshSchedule_Clear bit = 0,
    @RefreshSchedule nvarchar(255) = NULL,
    @LastRefreshedAt_Clear bit = 0,
    @LastRefreshedAt datetimeoffset = NULL,
    @NextRefreshAt_Clear bit = 0,
    @NextRefreshAt datetimeoffset = NULL,
    @Watermark_Clear bit = 0,
    @Watermark datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @RowCount_Clear bit = 0,
    @RowCount bigint = NULL,
    @ApproxBuildCostMs_Clear bit = 0,
    @ApproxBuildCostMs bigint = NULL,
    @IntendedWorkload_Clear bit = 0,
    @IntendedWorkload nvarchar(MAX) = NULL,
    @RowFilterColumns_Clear bit = 0,
    @RowFilterColumns nvarchar(MAX) = NULL,
    @BroadSQL_Clear bit = 0,
    @BroadSQL nvarchar(MAX) = NULL,
    @KeyColumns_Clear bit = 0,
    @KeyColumns nvarchar(MAX) = NULL,
    @SourceRowCount_Clear bit = 0,
    @SourceRowCount bigint = NULL,
    @RefreshesSinceFullRebuild int = NULL,
    @ReadFilterSpec_Clear bit = 0,
    @ReadFilterSpec nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MaterializedResult]
    SET
        [SourceType] = ISNULL(@SourceType, [SourceType]),
        [SourceEntityID] = CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, [SourceEntityID]) END,
        [GeneratedEntityID] = CASE WHEN @GeneratedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@GeneratedEntityID, [GeneratedEntityID]) END,
        [SchemaName] = ISNULL(@SchemaName, [SchemaName]),
        [TableName] = ISNULL(@TableName, [TableName]),
        [ViewName] = ISNULL(@ViewName, [ViewName]),
        [ParamMode] = ISNULL(@ParamMode, [ParamMode]),
        [RefreshStrategy] = ISNULL(@RefreshStrategy, [RefreshStrategy]),
        [RefreshSchedule] = CASE WHEN @RefreshSchedule_Clear = 1 THEN NULL ELSE ISNULL(@RefreshSchedule, [RefreshSchedule]) END,
        [LastRefreshedAt] = CASE WHEN @LastRefreshedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRefreshedAt, [LastRefreshedAt]) END,
        [NextRefreshAt] = CASE WHEN @NextRefreshAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRefreshAt, [NextRefreshAt]) END,
        [Watermark] = CASE WHEN @Watermark_Clear = 1 THEN NULL ELSE ISNULL(@Watermark, [Watermark]) END,
        [Status] = ISNULL(@Status, [Status]),
        [RowCount] = CASE WHEN @RowCount_Clear = 1 THEN NULL ELSE ISNULL(@RowCount, [RowCount]) END,
        [ApproxBuildCostMs] = CASE WHEN @ApproxBuildCostMs_Clear = 1 THEN NULL ELSE ISNULL(@ApproxBuildCostMs, [ApproxBuildCostMs]) END,
        [IntendedWorkload] = CASE WHEN @IntendedWorkload_Clear = 1 THEN NULL ELSE ISNULL(@IntendedWorkload, [IntendedWorkload]) END,
        [RowFilterColumns] = CASE WHEN @RowFilterColumns_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterColumns, [RowFilterColumns]) END,
        [BroadSQL] = CASE WHEN @BroadSQL_Clear = 1 THEN NULL ELSE ISNULL(@BroadSQL, [BroadSQL]) END,
        [KeyColumns] = CASE WHEN @KeyColumns_Clear = 1 THEN NULL ELSE ISNULL(@KeyColumns, [KeyColumns]) END,
        [SourceRowCount] = CASE WHEN @SourceRowCount_Clear = 1 THEN NULL ELSE ISNULL(@SourceRowCount, [SourceRowCount]) END,
        [RefreshesSinceFullRebuild] = ISNULL(@RefreshesSinceFullRebuild, [RefreshesSinceFullRebuild]),
        [ReadFilterSpec] = CASE WHEN @ReadFilterSpec_Clear = 1 THEN NULL ELSE ISNULL(@ReadFilterSpec, [ReadFilterSpec]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMaterializedResults] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMaterializedResults]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMaterializedResult] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MaterializedResult table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMaterializedResult]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMaterializedResult];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMaterializedResult
ON [${flyway:defaultSchema}].[MaterializedResult]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MaterializedResult]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MaterializedResult] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Materialized Results */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMaterializedResult] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Materialized Results */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Materialized Results
-- Item: spDeleteMaterializedResult
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MaterializedResult
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMaterializedResult]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMaterializedResult];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMaterializedResult]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MaterializedResult]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMaterializedResult] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Materialized Results */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMaterializedResult] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Query */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_CategoryID ON [${flyway:defaultSchema}].[Query] ([CategoryID]);

-- Index for foreign key EmbeddingModelID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_EmbeddingModelID ON [${flyway:defaultSchema}].[Query] ([EmbeddingModelID]);

-- Index for foreign key SQLDialectID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_SQLDialectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_SQLDialectID ON [${flyway:defaultSchema}].[Query] ([SQLDialectID]);

-- Index for foreign key ExternalDataSourceID in table Query
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Query]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Query_ExternalDataSourceID ON [${flyway:defaultSchema}].[Query] ([ExternalDataSourceID]);

/* Base View SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Query
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueries]
AS
SELECT
    q.*,
    MJQueryCategory_CategoryID.[Name] AS [Category],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJSQLDialect_SQLDialectID.[Name] AS [SQLDialect],
    MJExternalDataSource_ExternalDataSourceID.[Name] AS [ExternalDataSource]
FROM
    [${flyway:defaultSchema}].[Query] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS MJQueryCategory_CategoryID
  ON
    [q].[CategoryID] = MJQueryCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [q].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SQLDialect] AS MJSQLDialect_SQLDialectID
  ON
    [q].[SQLDialectID] = MJSQLDialect_SQLDialectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ExternalDataSource] AS MJExternalDataSource_ExternalDataSourceID
  ON
    [q].[ExternalDataSourceID] = MJExternalDataSource_ExternalDataSourceID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: Permissions for vwQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueries] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spCreateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQuery]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [ID],
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Query]
            (
                [Name],
                [CategoryID],
                [UserQuestion],
                [Description],
                [SQL],
                [TechnicalDescription],
                [OriginalSQL],
                [Feedback],
                [Status],
                [QualityRank],
                [ExecutionCostRank],
                [UsesTemplate],
                [AuditQueryRuns],
                [CacheEnabled],
                [CacheTTLMinutes],
                [CacheMaxSize],
                [EmbeddingVector],
                [EmbeddingModelID],
                [CacheValidationSQL],
                [SQLDialectID],
                [Reusable],
                [ExternalDataSourceID],
                [IsMaterialized]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, NULL) END,
                CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, NULL) END,
                CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, NULL) END,
                CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, NULL) END,
                CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, 0) END,
                CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, NULL) END,
                CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, 0) END,
                ISNULL(@AuditQueryRuns, 0),
                ISNULL(@CacheEnabled, 0),
                CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, NULL) END,
                CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, NULL) END,
                CASE WHEN @SQLDialectID = '00000000-0000-0000-0000-000000000000' THEN '1F203987-A37B-4BC1-85B3-BA50DC33C3E0' ELSE ISNULL(@SQLDialectID, '1F203987-A37B-4BC1-85B3-BA50DC33C3E0') END,
                ISNULL(@Reusable, 0),
                CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, NULL) END,
                ISNULL(@IsMaterialized, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQuery] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spUpdateQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQuery]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @UserQuestion_Clear bit = 0,
    @UserQuestion nvarchar(MAX) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SQL_Clear bit = 0,
    @SQL nvarchar(MAX) = NULL,
    @TechnicalDescription_Clear bit = 0,
    @TechnicalDescription nvarchar(MAX) = NULL,
    @OriginalSQL_Clear bit = 0,
    @OriginalSQL nvarchar(MAX) = NULL,
    @Feedback_Clear bit = 0,
    @Feedback nvarchar(MAX) = NULL,
    @Status nvarchar(15) = NULL,
    @QualityRank_Clear bit = 0,
    @QualityRank int = NULL,
    @ExecutionCostRank_Clear bit = 0,
    @ExecutionCostRank int = NULL,
    @UsesTemplate_Clear bit = 0,
    @UsesTemplate bit = NULL,
    @AuditQueryRuns bit = NULL,
    @CacheEnabled bit = NULL,
    @CacheTTLMinutes_Clear bit = 0,
    @CacheTTLMinutes int = NULL,
    @CacheMaxSize_Clear bit = 0,
    @CacheMaxSize int = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @CacheValidationSQL_Clear bit = 0,
    @CacheValidationSQL nvarchar(MAX) = NULL,
    @SQLDialectID uniqueidentifier = NULL,
    @Reusable bit = NULL,
    @ExternalDataSourceID_Clear bit = 0,
    @ExternalDataSourceID uniqueidentifier = NULL,
    @IsMaterialized bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [UserQuestion] = CASE WHEN @UserQuestion_Clear = 1 THEN NULL ELSE ISNULL(@UserQuestion, [UserQuestion]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [SQL] = CASE WHEN @SQL_Clear = 1 THEN NULL ELSE ISNULL(@SQL, [SQL]) END,
        [TechnicalDescription] = CASE WHEN @TechnicalDescription_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDescription, [TechnicalDescription]) END,
        [OriginalSQL] = CASE WHEN @OriginalSQL_Clear = 1 THEN NULL ELSE ISNULL(@OriginalSQL, [OriginalSQL]) END,
        [Feedback] = CASE WHEN @Feedback_Clear = 1 THEN NULL ELSE ISNULL(@Feedback, [Feedback]) END,
        [Status] = ISNULL(@Status, [Status]),
        [QualityRank] = CASE WHEN @QualityRank_Clear = 1 THEN NULL ELSE ISNULL(@QualityRank, [QualityRank]) END,
        [ExecutionCostRank] = CASE WHEN @ExecutionCostRank_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionCostRank, [ExecutionCostRank]) END,
        [UsesTemplate] = CASE WHEN @UsesTemplate_Clear = 1 THEN NULL ELSE ISNULL(@UsesTemplate, [UsesTemplate]) END,
        [AuditQueryRuns] = ISNULL(@AuditQueryRuns, [AuditQueryRuns]),
        [CacheEnabled] = ISNULL(@CacheEnabled, [CacheEnabled]),
        [CacheTTLMinutes] = CASE WHEN @CacheTTLMinutes_Clear = 1 THEN NULL ELSE ISNULL(@CacheTTLMinutes, [CacheTTLMinutes]) END,
        [CacheMaxSize] = CASE WHEN @CacheMaxSize_Clear = 1 THEN NULL ELSE ISNULL(@CacheMaxSize, [CacheMaxSize]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [CacheValidationSQL] = CASE WHEN @CacheValidationSQL_Clear = 1 THEN NULL ELSE ISNULL(@CacheValidationSQL, [CacheValidationSQL]) END,
        [SQLDialectID] = ISNULL(@SQLDialectID, [SQLDialectID]),
        [Reusable] = ISNULL(@Reusable, [Reusable]),
        [ExternalDataSourceID] = CASE WHEN @ExternalDataSourceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDataSourceID, [ExternalDataSourceID]) END,
        [IsMaterialized] = ISNULL(@IsMaterialized, [IsMaterialized])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Query table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQuery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQuery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQuery
ON [${flyway:defaultSchema}].[Query]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Query]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Query] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queries
-- Item: spDeleteQuery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Query
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQuery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQuery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on DataContextItem using cursor to call spUpdateDataContextItem
    DECLARE @MJDataContextItems_QueryIDID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_DataContextID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_Type nvarchar(50)
    DECLARE @MJDataContextItems_QueryID_ViewID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_QueryID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_EntityID uniqueidentifier
    DECLARE @MJDataContextItems_QueryID_RecordID nvarchar(450)
    DECLARE @MJDataContextItems_QueryID_SQL nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_DataJSON nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_LastRefreshedAt datetimeoffset
    DECLARE @MJDataContextItems_QueryID_Description nvarchar(MAX)
    DECLARE @MJDataContextItems_QueryID_CodeName nvarchar(255)
    DECLARE cascade_update_MJDataContextItems_QueryID_cursor CURSOR FOR
        SELECT [ID], [DataContextID], [Type], [ViewID], [QueryID], [EntityID], [RecordID], [SQL], [DataJSON], [LastRefreshedAt], [Description], [CodeName]
        FROM [${flyway:defaultSchema}].[DataContextItem]
        WHERE [QueryID] = @ID

    OPEN cascade_update_MJDataContextItems_QueryID_cursor
    FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDataContextItems_QueryID_QueryID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDataContextItem] @ID = @MJDataContextItems_QueryIDID, @DataContextID = @MJDataContextItems_QueryID_DataContextID, @Type = @MJDataContextItems_QueryID_Type, @ViewID = @MJDataContextItems_QueryID_ViewID, @QueryID_Clear = 1, @QueryID = @MJDataContextItems_QueryID_QueryID, @EntityID = @MJDataContextItems_QueryID_EntityID, @RecordID = @MJDataContextItems_QueryID_RecordID, @SQL = @MJDataContextItems_QueryID_SQL, @DataJSON = @MJDataContextItems_QueryID_DataJSON, @LastRefreshedAt = @MJDataContextItems_QueryID_LastRefreshedAt, @Description = @MJDataContextItems_QueryID_Description, @CodeName = @MJDataContextItems_QueryID_CodeName

        FETCH NEXT FROM cascade_update_MJDataContextItems_QueryID_cursor INTO @MJDataContextItems_QueryIDID, @MJDataContextItems_QueryID_DataContextID, @MJDataContextItems_QueryID_Type, @MJDataContextItems_QueryID_ViewID, @MJDataContextItems_QueryID_QueryID, @MJDataContextItems_QueryID_EntityID, @MJDataContextItems_QueryID_RecordID, @MJDataContextItems_QueryID_SQL, @MJDataContextItems_QueryID_DataJSON, @MJDataContextItems_QueryID_LastRefreshedAt, @MJDataContextItems_QueryID_Description, @MJDataContextItems_QueryID_CodeName
    END

    CLOSE cascade_update_MJDataContextItems_QueryID_cursor
    DEALLOCATE cascade_update_MJDataContextItems_QueryID_cursor
    
    -- Cascade delete from MaterializedResultQuery using cursor to call spDeleteMaterializedResultQuery
    DECLARE @MJMaterializedResultQueries_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJMaterializedResultQueries_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MaterializedResultQuery]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJMaterializedResultQueries_QueryID_cursor INTO @MJMaterializedResultQueries_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMaterializedResultQuery] @ID = @MJMaterializedResultQueries_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJMaterializedResultQueries_QueryID_cursor INTO @MJMaterializedResultQueries_QueryIDID
    END
    
    CLOSE cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    DEALLOCATE cascade_delete_MJMaterializedResultQueries_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_QueryID_cursor INTO @MJQueryDependencies_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_QueryID_cursor
    
    -- Cascade delete from QueryDependency using cursor to call spDeleteQueryDependency
    DECLARE @MJQueryDependencies_DependsOnQueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryDependency]
        WHERE [DependsOnQueryID] = @ID
    
    OPEN cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryDependency] @ID = @MJQueryDependencies_DependsOnQueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor INTO @MJQueryDependencies_DependsOnQueryIDID
    END
    
    CLOSE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    DEALLOCATE cascade_delete_MJQueryDependencies_DependsOnQueryID_cursor
    
    -- Cascade delete from QueryEntity using cursor to call spDeleteQueryEntity
    DECLARE @MJQueryEntities_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryEntities_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryEntity]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryEntities_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryEntity] @ID = @MJQueryEntities_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryEntities_QueryID_cursor INTO @MJQueryEntities_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryEntities_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryEntities_QueryID_cursor
    
    -- Cascade delete from QueryField using cursor to call spDeleteQueryField
    DECLARE @MJQueryFields_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryFields_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryField]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryFields_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryField] @ID = @MJQueryFields_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryFields_QueryID_cursor INTO @MJQueryFields_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryFields_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryFields_QueryID_cursor
    
    -- Cascade delete from QueryParameter using cursor to call spDeleteQueryParameter
    DECLARE @MJQueryParameters_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryParameters_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryParameter]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryParameters_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryParameter] @ID = @MJQueryParameters_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryParameters_QueryID_cursor INTO @MJQueryParameters_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryParameters_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryParameters_QueryID_cursor
    
    -- Cascade delete from QueryPermission using cursor to call spDeleteQueryPermission
    DECLARE @MJQueryPermissions_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQueryPermissions_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QueryPermission]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQueryPermissions_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQueryPermission] @ID = @MJQueryPermissions_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQueryPermissions_QueryID_cursor INTO @MJQueryPermissions_QueryIDID
    END
    
    CLOSE cascade_delete_MJQueryPermissions_QueryID_cursor
    DEALLOCATE cascade_delete_MJQueryPermissions_QueryID_cursor
    
    -- Cascade delete from QuerySQL using cursor to call spDeleteQuerySQL
    DECLARE @MJQuerySQLs_QueryIDID uniqueidentifier
    DECLARE cascade_delete_MJQuerySQLs_QueryID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[QuerySQL]
        WHERE [QueryID] = @ID
    
    OPEN cascade_delete_MJQuerySQLs_QueryID_cursor
    FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteQuerySQL] @ID = @MJQuerySQLs_QueryIDID
        
        FETCH NEXT FROM cascade_delete_MJQuerySQLs_QueryID_cursor INTO @MJQuerySQLs_QueryIDID
    END
    
    CLOSE cascade_delete_MJQuerySQLs_QueryID_cursor
    DEALLOCATE cascade_delete_MJQuerySQLs_QueryID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Query]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Queries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQuery] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96918760-8cde-4e99-86fb-569cb3f59dc7' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'SourceEntity')) BEGIN
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
            '96918760-8cde-4e99-86fb-569cb3f59dc7',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 26,
            'SourceEntity',
            'Source Entity',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39040122-3182-4899-bed9-32749af785bb' OR (EntityID = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50' AND Name = 'GeneratedEntity')) BEGIN
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
            '39040122-3182-4899-bed9-32749af785bb',
            'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50', -- Entity: MJ: Materialized Results
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E7606DA1-AB65-4A6D-BC7E-0970BF30DC50') + 27,
            'GeneratedEntity',
            'Generated Entity',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a994e214-1cb5-4e13-9f04-45eaefeedf1c' OR (EntityID = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339' AND Name = 'Query')) BEGIN
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
            'a994e214-1cb5-4e13-9f04-45eaefeedf1c',
            'AB9ECA24-70B0-49B8-80CB-0D57C6E63339', -- Entity: MJ: Materialized Result Queries
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'AB9ECA24-70B0-49B8-80CB-0D57C6E63339') + 6,
            'Query',
            'Query',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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

