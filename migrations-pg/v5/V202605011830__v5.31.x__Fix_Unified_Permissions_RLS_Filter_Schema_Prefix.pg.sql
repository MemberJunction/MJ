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

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj."RowLevelSecurityFilter"
SET "FilterText" = 'AgentRunID IN (SELECT ID FROM __mj."vwAIAgentRuns" WHERE UserID = ''{{UserID}}'')'
WHERE "ID" = 'E1AF0002-0000-4000-B000-000000000002';  -- UI: Own AI Agent Run Steps;

UPDATE __mj."RowLevelSecurityFilter"
SET "FilterText" = 'AgentRunID IN (SELECT ID FROM __mj."vwAIAgentRuns" WHERE UserID = ''{{UserID}}'')'
WHERE "ID" = 'E1AF0003-0000-4000-B000-000000000003';  -- UI: Own AI Prompt Runs;


-- ===================== Other =====================

-- =============================================================================
-- v5.31.x — Fix RLS filter target for Unified Permissions Phase 2
--
-- V202604241700__v5.30.x__Unified_Permissions_Phase_2.sql inserted two
-- RowLevelSecurityFilter rows whose FilterText subqueries referenced
-- the base table AIAgentRun without a schema prefix:
--
--     'AgentRunID IN (SELECT ID FROM AIAgentRun WHERE UserID = ''{{UserID}}'')'
--
-- Two problems:
--
--   1. No schema prefix. The RLS engine inlines FilterText into the
--      entity's resolver query at runtime. SQL Server resolves a bare
--      AIAgentRun against the caller's default schema (typically dbo),
--      which doesn't contain the table — Msg 208, "Invalid object name".
--
--   2. References the base table, not the base view. MJAPI executes
--      resolver SQL under the caller's user context (not the CodeGen /
--      dbowner user). UI users are granted SELECT on vwAIAgentRuns by
--      CodeGen, but NOT on the base table AIAgentRun — so even with the
--      schema fixed, the subquery would fail with Msg 229, "SELECT
--      permission was denied on the object 'AIAgentRun'".
--
-- The fix is to reference __mj.vwAIAgentRuns. Flyway
-- resolves the placeholder at execute time so the stored value contains
-- the actual schema (e.g. __mj.vwAIAgentRuns), and the base view is what
-- end-user roles have permission to read.
--
-- vwAIAgentRuns exposes both ID and UserID, so the predicate stays
-- structurally identical.
--
-- The third filter (E1AF0001..., UserID = '{{UserID}}') does not
-- reference a table and is left unchanged.
-- =============================================================================
