/* ============================================================================
   Query & Entity Materialization — Phase 1 Foundation (Metadata)
   v5.43.x

   Companion plan: /plans/query-entity-materialization.md (design)

   Creates the auditable metadata edge for materialization (the "MJ: Materialized
   Results" entity) and the author-intent flags on Query. This is metadata only —
   the physical materialized tables/views and the refresh driver are wired by
   CodeGen and later steps. Nothing here changes existing read paths.

   Note (CodeGen handles automatically — intentionally omitted below):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata (auto-created from this schema; the __mj
       schema's 'MJ: ' EntityNamePrefix yields entity name "MJ: Materialized Results")
   ============================================================================ */

-- ─── MJ: Materialized Results ────────────────────────────────────────────────
-- One row per materialization. Unifies both "front doors" (a materialized stored
-- Query, or a materialized entity base view) at the metadata layer, and is the
-- work queue the refresh scheduler reads.
CREATE TABLE ${flyway:defaultSchema}.MaterializedResult (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),

    -- Which door produced this materialization.
    SourceType          NVARCHAR(20)     NOT NULL,

    -- Provenance (exactly one source side is set, per SourceType).
    SourceQueryID       UNIQUEIDENTIFIER NULL,   -- Query case   (null for base-view)
    SourceEntityID      UNIQUEIDENTIFIER NULL,   -- base-view case (the source entity; null for query)
    GeneratedEntityID   UNIQUEIDENTIFIER NULL,   -- Query case: the new read-only Virtual Entity (null for base-view, which reuses the source entity)

    -- Physical objects (the table is swappable storage; the view is the stable contract).
    SchemaName          NVARCHAR(255)    NOT NULL,
    TableName           NVARCHAR(255)    NOT NULL,
    ViewName            NVARCHAR(255)    NOT NULL,

    -- Parameterization classification (§9) — v1 ships 'None' / 'BoundFixed'.
    ParamMode           NVARCHAR(20)     NOT NULL DEFAULT 'None',

    -- Refresh model (§11) — v1 ships 'FullRebuild'.
    RefreshStrategy     NVARCHAR(30)     NOT NULL DEFAULT 'FullRebuild',
    RefreshSchedule     NVARCHAR(255)    NULL,    -- cron expression; NULL = manual only
    LastRefreshedAt     DATETIMEOFFSET   NULL,
    NextRefreshAt       DATETIMEOFFSET   NULL,
    Watermark           DATETIMEOFFSET   NULL,    -- last-seen MAX(__mj_UpdatedAt) for incremental / dirty-group (later phases)

    -- Lifecycle (§13).
    Status              NVARCHAR(20)     NOT NULL DEFAULT 'Building',

    -- Cost / size profile for the selection contract (§8).
    [RowCount]          BIGINT           NULL,
    ApproxBuildCostMs   BIGINT           NULL,

    -- Free-text / structured note: what this materialization is good for (§8).
    IntendedWorkload    NVARCHAR(MAX)    NULL,

    CONSTRAINT PK_MaterializedResult PRIMARY KEY (ID),
    CONSTRAINT FK_MaterializedResult_SourceQuery
        FOREIGN KEY (SourceQueryID)     REFERENCES ${flyway:defaultSchema}.Query(ID),
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

-- ─── Author-intent flags on Query (§3.3) ─────────────────────────────────────
-- Query flags are the author's *declared intent* that CodeGen scans for; the
-- MaterializedResult row carries the authoritative state.
ALTER TABLE ${flyway:defaultSchema}.Query ADD
    IsMaterialized       BIT              NOT NULL DEFAULT 0,
    MaterializedResultID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_Query_MaterializedResult
        REFERENCES ${flyway:defaultSchema}.MaterializedResult(ID);

-- ─── Column descriptions (CodeGen reads these into EntityField metadata) ──────
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Which materialization door produced this row: ''Query'' (a materialized stored Query, surfaced as a new read-only Virtual Entity) or ''EntityBaseView'' (a 1:1 materialized copy of an existing entity''s base view, which reuses the source entity).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'SourceType';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For the Query case, the stored Query whose result is materialized. NULL for the EntityBaseView case.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'SourceQueryID';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'For the EntityBaseView case, the existing entity whose base view is materialized (RLS applies unchanged). NULL for the Query case.',
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
    @value=N'Parameterization classification: ''None'' (unparameterized), ''RowFilterBroad'' (materialize broad, filter at read), ''PerValueCache'' (bounded structural variant), or ''BoundFixed'' (params bound to fixed values). v1 supports ''None'' and ''BoundFixed''.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MaterializedResult', @level2type=N'COLUMN', @level2name=N'ParamMode';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Refresh strategy: ''FullRebuild'' (rebuild the whole result), ''Incremental'' (MERGE on the surrogate key), or ''DirtyGroupRecompute'' (recompute groups changed since Watermark). v1 ships ''FullRebuild'' only.',
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
    @value=N'Last-seen MAX(__mj_UpdatedAt) of the source data; the staleness probe for incremental / dirty-group refresh (later phases). Reuses the existing query smart-cache fingerprint pattern.',
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
    @value=N'Author''s declared intent that this Query should be materialized. CodeGen scans for IsMaterialized = 1 and, if the query qualifies (§9/§10), materializes it. The authoritative state lives on the linked MJ: Materialized Results row.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Query', @level2type=N'COLUMN', @level2name=N'IsMaterialized';
EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Back-link to the MJ: Materialized Results row produced for this Query (NULL until CodeGen materializes it).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Query', @level2type=N'COLUMN', @level2name=N'MaterializedResultID';
