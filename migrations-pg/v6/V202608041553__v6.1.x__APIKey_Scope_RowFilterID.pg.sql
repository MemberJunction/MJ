-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202608041553__v6.1.x__APIKey_Scope_RowFilterID.sql
-- PG counterpart of the T-SQL migration adding API-key-scoped row-filter storage.
-- Design: plans/api-key-row-filters.md. Hand-authored (simple additive DDL —
-- two nullable FK columns + comments; no CodeGen objects in this migration).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ---------------------------------------------------------------------------
-- APIKeyScope: per-key row filter
-- ---------------------------------------------------------------------------
ALTER TABLE __mj."APIKeyScope"
  ADD COLUMN "RowFilterID" UUID NULL;

ALTER TABLE __mj."APIKeyScope"
  ADD CONSTRAINT "FK_APIKeyScope_RowFilter"
  FOREIGN KEY ("RowFilterID") REFERENCES __mj."RowLevelSecurityFilter" ("ID");

COMMENT ON COLUMN __mj."APIKeyScope"."RowFilterID" IS 'Optional row-level filter narrowing WHICH RECORDS this scope grant applies to, in addition to the resource pattern that governs which entities. References the same RowLevelSecurityFilter catalog used by role-based RLS, so the filter text flows through the standard {{Token}} substitution engine and every existing RLS enforcement point (RunView, Load by primary key, save, delete, search). NULL (the default) means no row restriction - behavior identical to before this column existed. When set, the rule''s ResourcePattern must name a single exact entity (no wildcards, no comma-separated lists), every column the filter references must resolve to a real non-virtual field on that entity, and every other referrer of the same filter record must resolve to that same entity. Critically, this filter is evaluated INDEPENDENTLY of the role-RLS exemption: a user exempt from role RLS is still bound by their key''s filter, because narrowing a principal below what their roles allow is the entire purpose of a key ceiling.';

-- ---------------------------------------------------------------------------
-- APIApplicationScope: application ceiling row filter
-- ---------------------------------------------------------------------------
ALTER TABLE __mj."APIApplicationScope"
  ADD COLUMN "RowFilterID" UUID NULL;

ALTER TABLE __mj."APIApplicationScope"
  ADD CONSTRAINT "FK_APIApplicationScope_RowFilter"
  FOREIGN KEY ("RowFilterID") REFERENCES __mj."RowLevelSecurityFilter" ("ID");

COMMENT ON COLUMN __mj."APIApplicationScope"."RowFilterID" IS 'Optional row-level filter acting as a CEILING for every API key operating under this application - a restriction keys inherit and cannot widen. Composes with the per-key filter (APIKeyScope.RowFilterID) and with role-based RLS using AND, never OR, so no layer can broaden another. References the same RowLevelSecurityFilter catalog used by role-based RLS. NULL (the default) means the application imposes no row ceiling. The same authoring constraints as APIKeyScope.RowFilterID apply: exact single-entity resource pattern, all referenced columns must exist on that entity, and all referrers of the filter record must resolve to the same entity.';
