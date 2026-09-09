-- ==============================================================================================
-- U202609092100 — undo the backfill
-- ==============================================================================================
--
-- Ticket MJC-264. Reverses V202609092100 and nothing else.
--
-- WHY ${mjSchema} AND NOT THE FLYWAY DEFAULT-SCHEMA PLACEHOLDER. This migration is applied under
-- `--schema mjc_integration_catalog` so it keeps its own flyway history. Under that flag the
-- flyway built-in resolves to the HISTORY schema, not the core schema — so it must not appear in
-- this file at all, not even in a comment, because placeholders are substituted in comments too.
--
-- WHY THIS IS AN UNCONDITIONAL DELETE AND NOT A FILTERED ONE. V202609091900 created these two
-- tables EMPTY and this backfill is the first and only thing that writes them, so at the point
-- this undo can legitimately run, everything in them is exactly what the backfill created.
-- Filtering on the provenance link instead would leave behind any row whose IntegrationObjectID
-- happened to be NULL and hand the operator a half-populated catalog, which is worse than either
-- outcome. Dropping the tables is the other migration's job — U202609091900 does that.
--
-- THE SHARED CATALOG IS NOT TOUCHED. IntegrationObject and IntegrationObjectField are never
-- written by the V and are never written here.
-- ==============================================================================================

-- Fields first: CompanyIntegrationObjectField has two foreign keys into CompanyIntegrationObject
-- (the owning object and the dependency edge), so the objects cannot go first.
DELETE FROM [${mjSchema}].[CompanyIntegrationObjectField];
GO
DELETE FROM [${mjSchema}].[CompanyIntegrationObject];
GO
