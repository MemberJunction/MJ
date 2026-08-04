-- PG-ONLY forward fix for two PostgreSQL-specific defects found during v5.41 parity validation.
-- Neither exists on SQL Server (SS has a single spUpdateScheduledJobStatistics and a complete vwUserViews),
-- so there is no T-SQL counterpart — this is applied only on the PostgreSQL side.

-- ---------------------------------------------------------------------------
-- Defect 1: duplicate spUpdateScheduledJobStatistics overload
-- ---------------------------------------------------------------------------
-- V202606022336 (v5.39) created spUpdateScheduledJobStatistics(UUID, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ)
-- (the T-SQL BIT param converted to BOOLEAN). V202606081200 (v5.40, pg-only) intended to replace it with an
-- INTEGER-param version, but its DROP targeted the INTEGER signature — which did not yet exist — so the
-- BOOLEAN overload survived and a second INTEGER overload was created. PostgreSQL then cannot resolve the
-- ScheduledJobEngine's untyped call ("function ... is not unique").
-- The engine (ScheduledJobEngine.ts) passes (success ? 1 : 0), i.e. INTEGER, so the INTEGER overload is the
-- intended one. Drop the stale BOOLEAN overload, leaving exactly one function.
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateScheduledJobStatistics"(UUID, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ);

-- ---------------------------------------------------------------------------
-- Defect 2: vwUserViews missing the ViewTypeID column
-- ---------------------------------------------------------------------------
-- The UserView base table and the EntityField metadata both carry ViewTypeID (and SS's vwUserViews exposes
-- it), but the PG vwUserViews view does not — so UserViewEngine fails to load saved views with
-- "column ViewTypeID does not exist". Re-create the view with ViewTypeID. To keep CREATE OR REPLACE valid
-- (PostgreSQL requires the existing column list, in order, unchanged) the new column is appended at the end;
-- CodeGen will reposition it canonically on its next regeneration of this view.
CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwUserViews" AS
 SELECT uv."ID",
    uv."UserID",
    uv."EntityID",
    uv."Name",
    uv."Description",
    uv."CategoryID",
    uv."IsShared",
    uv."IsDefault",
    uv."GridState",
    uv."FilterState",
    uv."CustomFilterState",
    uv."SmartFilterEnabled",
    uv."SmartFilterPrompt",
    uv."SmartFilterWhereClause",
    uv."SmartFilterExplanation",
    uv."WhereClause",
    uv."CustomWhereClause",
    uv."SortState",
    uv."__mj_CreatedAt",
    uv."__mj_UpdatedAt",
    uv."Thumbnail",
    uv."CardState",
    uv."DisplayState",
    u."Name" AS "UserName",
    u."FirstLast" AS "UserFirstLast",
    u."Email" AS "UserEmail",
    u."Type" AS "UserType",
    e."Name" AS "Entity",
    e."BaseView" AS "EntityBaseView",
    uv."ViewTypeID"
   FROM ${flyway:defaultSchema}."UserView" uv
     JOIN ${flyway:defaultSchema}."vwUsers" u ON uv."UserID" = u."ID"
     JOIN ${flyway:defaultSchema}."Entity" e ON uv."EntityID" = e."ID";

-- Re-assert SELECT grants defensively (CREATE OR REPLACE preserves them; this matches the baseline pattern).
DO $$ BEGIN GRANT SELECT ON ${flyway:defaultSchema}."vwUserViews" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
