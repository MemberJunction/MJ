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
   is instead carried as rows in the dedicated join table __mj.MaterializedResultQuery
   (both FKs point OUTWARD → no cycle). A query's materialization is found via
   MaterializedResultQuery.QueryID; author intent is Query.IsMaterialized. There is no
   SourceQueryID or MaterializedResultID column.

   Note (CodeGen handles automatically — intentionally omitted below):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata (generated from this schema; the __mj schema's
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
