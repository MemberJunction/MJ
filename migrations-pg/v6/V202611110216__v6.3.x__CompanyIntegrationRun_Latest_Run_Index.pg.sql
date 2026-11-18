-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611110216__v6.3.x__CompanyIntegrationRun_Latest_Run_Index.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* #4825 — reading MJ: Company Integrations must not wait on a running sync. */
/* vwCompanyIntegrations found each connection's latest run with a correlated TOP 1 ... ORDER BY StartedAt DESC over */
/* CompanyIntegrationRun. The only index on that table was the foreign-key index on CompanyIntegrationID, so the */
/* optimizer scanned the run table and waited on any run row a sync held locked: loading an unrelated connection timed */
/* out while syncs ran. A covering index on (CompanyIntegrationID, StartedAt DESC) lets the lookup seek straight to one */
/* connection's newest run, and OUTER APPLY reads exactly that row. The output columns are unchanged. */
CREATE INDEX "IX_CompanyIntegrationRun_CompanyIntegrationID_StartedAt" ON __mj."CompanyIntegrationRun"("CompanyIntegrationID", "StartedAt" DESC NULLS LAST) INCLUDE ("EndedAt");

-- ===================== HAND-FINISHED (v6.3.0-edge.1 release build) =====================
-- vwCompanyIntegrations: latest run via LATERAL ... LIMIT 1 (SQL Server: OUTER APPLY ... TOP 1).
--
-- The split converter classifies `CREATE OR ALTER VIEW vwCompanyIntegrations` as a CodeGen object
-- (vw* name) and drops it, but this view is app-owned (MJ: Company Integrations has
-- BaseViewGenerated = false), so CodeGen never regenerates it. Ported by hand.
-- Output columns are unchanged (same names, order and types as the previous PG definition), so
-- CREATE OR REPLACE applies in place and no dependent is dropped. DESC sorts NULLs last on both
-- platforms, matching the previous PG text (`DESC NULLS LAST`).
CREATE OR REPLACE VIEW __mj."vwCompanyIntegrations" AS
SELECT
  ci.*,
  c."Name" AS "Company",
  i."Name" AS "Integration",
  i."ClassName" AS "DriverClassName",
  i."ImportPath" AS "DriverImportPath",
  cir."ID" AS "LastRunID",
  cir."StartedAt" AS "LastRunStartedAt",
  cir."EndedAt" AS "LastRunEndedAt"
FROM
  __mj."CompanyIntegration" ci
INNER JOIN
  __mj."Company" c ON ci."CompanyID" = c."ID"
INNER JOIN
  __mj."Integration" i ON ci."IntegrationID" = i."ID"
LEFT JOIN LATERAL (
  SELECT cirInner."ID", cirInner."StartedAt", cirInner."EndedAt"
  FROM __mj."CompanyIntegrationRun" cirInner
  WHERE cirInner."CompanyIntegrationID" = ci."ID"
  ORDER BY cirInner."StartedAt" DESC NULLS LAST
  LIMIT 1
) cir ON TRUE;
