-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- ===================== DDL: Columns =====================

-- =============================================================================
-- Entity.AutoUpdateDisplayName — a per-entity lock on the display name, so
-- CodeGen can improve `Entity.DisplayName` without ever overwriting a human.
-- =============================================================================
--
-- See the SQL Server counterpart
-- (migrations/v6/V202608252345__v6.1.x__Add_Entity_AutoUpdateDisplayName.sql)
-- for the full rationale. In short: EntityField has carried this flag since
-- v2.122 and CodeGen honours it when writing LLM-generated field display names;
-- Entity has no equivalent, because nothing ever auto-updated an entity's
-- display name. The flag is the precondition for the optional
-- EntityDisplayNames advanced-generation feature — without it, that pass could
-- not tell a mechanical default from a deliberate human choice.
--
-- DEFAULT TRUE matches EntityField. It is safe because the flag alone changes
-- nothing: the feature it gates ships disabled.
-- =============================================================================

ALTER TABLE __mj."Entity"
ADD COLUMN "AutoUpdateDisplayName" BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN __mj."Entity"."AutoUpdateDisplayName" IS
'When true (the default), CodeGen may auto-update this entity''s DisplayName — currently via the optional EntityDisplayNames advanced-generation feature, which asks an LLM to expand opaque table-derived names (ACCT_STAT_CD) into readable ones (Account Status Codes). When false, the DisplayName is locked and CodeGen will not change it, whatever any generator proposes. Mirrors EntityField.AutoUpdateDisplayName. Note this flag governs only AUTOMATIC updates: a user editing the DisplayName directly is unaffected either way.';
