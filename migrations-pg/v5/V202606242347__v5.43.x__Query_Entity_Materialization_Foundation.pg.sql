-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."MaterializedResult" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),

 -- Which door produced this materialization.
 "SourceType" VARCHAR(20) NOT NULL,

 -- Provenance (exactly one source side is set, per SourceType).
 "SourceQueryID" UUID NULL, -- Query case (null for base-view)
 "SourceEntityID" UUID NULL, -- base-view case (the source entity; null for query)
 "GeneratedEntityID" UUID NULL, -- Query case: the new read-only Virtual Entity (null for base-view, which reuses the source entity)

 -- Physical objects (the table is swappable storage; the view is the stable contract).
 "SchemaName" VARCHAR(255) NOT NULL,
 "TableName" VARCHAR(255) NOT NULL,
 "ViewName" VARCHAR(255) NOT NULL,

 -- Parameterization classification (§9) — v1 ships 'None' / 'BoundFixed'.
 "ParamMode" VARCHAR(20) NOT NULL DEFAULT 'None',

 -- Refresh model (§11) — v1 ships 'FullRebuild'.
 "RefreshStrategy" VARCHAR(30) NOT NULL DEFAULT 'FullRebuild',
 "RefreshSchedule" VARCHAR(255) NULL, -- cron expression; NULL = manual only
 "LastRefreshedAt" TIMESTAMPTZ NULL,
 "NextRefreshAt" TIMESTAMPTZ NULL,
 "Watermark" TIMESTAMPTZ NULL, -- last-seen MAX(__mj_UpdatedAt) for incremental / dirty-group (later phases)

 -- Lifecycle (§13).
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Building',

 -- Cost / size profile for the selection contract (§8).
 "RowCount" BIGINT NULL,
 "ApproxBuildCostMs" BIGINT NULL,

 -- Free-text / structured note: what this materialization is good for (§8).
 "IntendedWorkload" TEXT NULL,

 CONSTRAINT PK_MaterializedResult PRIMARY KEY ("ID"),
 CONSTRAINT FK_MaterializedResult_SourceQuery
 FOREIGN KEY ("SourceQueryID") REFERENCES __mj."Query"("ID"),
 CONSTRAINT FK_MaterializedResult_SourceEntity
 FOREIGN KEY ("SourceEntityID") REFERENCES __mj."Entity"("ID"),
 CONSTRAINT FK_MaterializedResult_GeneratedEntity
 FOREIGN KEY ("GeneratedEntityID") REFERENCES __mj."Entity"("ID"),
 CONSTRAINT CK_MaterializedResult_SourceType
 CHECK ("SourceType" IN ('Query', 'EntityBaseView')),
 CONSTRAINT CK_MaterializedResult_ParamMode
 CHECK ("ParamMode" IN ('None', 'RowFilterBroad', 'PerValueCache', 'BoundFixed')),
 CONSTRAINT CK_MaterializedResult_RefreshStrategy
 CHECK ("RefreshStrategy" IN ('FullRebuild', 'Incremental', 'DirtyGroupRecompute')),
 CONSTRAINT CK_MaterializedResult_Status
 CHECK ("Status" IN ('Active', 'Stale', 'Building', 'Disabled', 'DriftHold'))
);

-- ─── Author-intent flags on Query (§3.3) ─────────────────────────────────────
-- Query flags are the author's *declared intent* that CodeGen scans for; the
-- MaterializedResult row carries the authoritative state.;

ALTER TABLE __mj."Query"
 ADD COLUMN IF NOT EXISTS "IsMaterialized"       BOOLEAN              NOT NULL DEFAULT FALSE,
 ADD COLUMN IF NOT EXISTS "MaterializedResultID" UUID NULL
        CONSTRAINT FK_Query_MaterializedResult
        REFERENCES __mj."MaterializedResult"("ID");

-- ─── Column descriptions (CodeGen reads these into EntityField metadata) ──────;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."MaterializedResult"."SourceType" IS 'Which materialization door produced this row: ''Query'' (a materialized stored Query, surfaced as a new read-only Virtual Entity) or ''EntityBaseView'' (a 1:1 materialized copy of an existing entity''s base view, which reuses the source entity).';

COMMENT ON COLUMN __mj."MaterializedResult"."SourceQueryID" IS 'For the Query case, the stored Query whose result is materialized. NULL for the EntityBaseView case.';

COMMENT ON COLUMN __mj."MaterializedResult"."SourceEntityID" IS 'For the EntityBaseView case, the existing entity whose base view is materialized (RLS applies unchanged). NULL for the Query case.';

COMMENT ON COLUMN __mj."MaterializedResult"."GeneratedEntityID" IS 'For the Query case, the new read-only Virtual Entity CodeGen mints for the materialized result shape. NULL for the EntityBaseView case (which reuses the source entity).';

COMMENT ON COLUMN __mj."MaterializedResult"."SchemaName" IS 'Schema of the physical materialized table and its wrapper view.';

COMMENT ON COLUMN __mj."MaterializedResult"."TableName" IS 'Physical materialized table (swappable storage, repointed on atomic refresh). Convention: materialized_<Name>.';

COMMENT ON COLUMN __mj."MaterializedResult"."ViewName" IS 'Wrapper view (the stable read contract; body is SELECT * FROM the physical table). Convention: materialized_vw<Name>. The atomic swap repoints this view, never truncates the table in place.';

COMMENT ON COLUMN __mj."MaterializedResult"."ParamMode" IS 'Parameterization classification: ''None'' (unparameterized), ''RowFilterBroad'' (materialize broad, filter at read), ''PerValueCache'' (bounded structural variant), or ''BoundFixed'' (params bound to fixed values). v1 supports ''None'' and ''BoundFixed''.';

COMMENT ON COLUMN __mj."MaterializedResult"."RefreshStrategy" IS 'Refresh strategy: ''FullRebuild'' (rebuild the whole result), ''Incremental'' (MERGE on the surrogate key), or ''DirtyGroupRecompute'' (recompute groups changed since Watermark). v1 ships ''FullRebuild'' only.';

COMMENT ON COLUMN __mj."MaterializedResult"."RefreshSchedule" IS 'Cron expression for scheduled rehydration via the ScheduledJobEngine. NULL means manual refresh only. Stagger across materializations to avoid refresh-window contention.';

COMMENT ON COLUMN __mj."MaterializedResult"."LastRefreshedAt" IS 'Timestamp of the last successful refresh (freshness surfacing for the selection contract).';

COMMENT ON COLUMN __mj."MaterializedResult"."NextRefreshAt" IS 'Next scheduled refresh time, computed from RefreshSchedule; the scheduler reads this as its due-work signal.';

COMMENT ON COLUMN __mj."MaterializedResult"."Watermark" IS 'Last-seen MAX(__mj_UpdatedAt) of the source data; the staleness probe for incremental / dirty-group refresh (later phases). Reuses the existing query smart-cache fingerprint pattern.';

COMMENT ON COLUMN __mj."MaterializedResult"."Status" IS 'Lifecycle state: ''Building'' (materializing), ''Active'' (fresh, readable), ''Stale'' (past expected freshness), ''Disabled'' (turned off), ''DriftHold'' (upstream schema drift detected; held for review).';

COMMENT ON COLUMN __mj."MaterializedResult"."RowCount" IS 'Approximate row count of the last build — part of the cost/size profile an agent (Skip) uses to choose live vs. materialized.';

COMMENT ON COLUMN __mj."MaterializedResult"."ApproxBuildCostMs" IS 'Approximate build cost in milliseconds of the last refresh — part of the cost/size profile for the selection contract.';

COMMENT ON COLUMN __mj."MaterializedResult"."IntendedWorkload" IS 'Human/structured note describing what this materialization is good for; surfaced in the selection contract so callers pick the right variant.';

COMMENT ON COLUMN __mj."Query"."IsMaterialized" IS 'Author''s declared intent that this Query should be materialized. CodeGen scans for IsMaterialized = 1 and, if the query qualifies (§9/§10), materializes it. The authoritative state lives on the linked MJ: Materialized Results row.';

COMMENT ON COLUMN __mj."Query"."MaterializedResultID" IS 'Back-link to the MJ: Materialized Results row produced for this Query (NULL until CodeGen materializes it).';


-- ===================== Other =====================

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
