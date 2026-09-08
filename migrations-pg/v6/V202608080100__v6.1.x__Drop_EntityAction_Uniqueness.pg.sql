-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202608080100__v6.1.x__Drop_EntityAction_Uniqueness.sql
-- Hand-authored counterpart.
--
-- The T-SQL original guards the drop with a sys.key_constraints catalog lookup, which the AST
-- transpiler reports as unhandled (IF-EXISTS-BEGIN over SQL Server system views). PostgreSQL
-- expresses the same intent natively with DROP CONSTRAINT IF EXISTS, so the guard becomes a
-- clause rather than a catalog query — same semantics, idempotent on databases where the
-- constraint was never present.
--
-- Name verified against the PG ledger: created as a named UNIQUE constraint on
-- __mj."EntityAction" by V202605221002__v5.37.x__Add_Unique_Constraints_To_MJ_Junction_Tables
-- and carried into the v5.37/v5.38/v5.46 baselines.
--
-- Rationale for the drop is in the SQL Server original: EntityAction is an
-- association-with-attributes (Status, Sequence, LoggingMode + three child collections), and the
-- v6.1.x ScopeEntityID/ScopeRecordID columns are unusable while (ActionID, EntityID) is unique.
-- No replacement constraint by design.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."EntityAction"
    DROP CONSTRAINT IF EXISTS "UQ_EntityAction_ActionID_EntityID";
