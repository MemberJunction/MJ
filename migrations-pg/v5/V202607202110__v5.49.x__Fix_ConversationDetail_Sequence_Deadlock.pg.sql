-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607202110__v5.49.x__Fix_ConversationDetail_Sequence_Deadlock.sql
--
-- INTENTIONALLY A NO-OP ON POSTGRESQL — and this file documents why, so it is not
-- mistaken for the silently-emptied output described in issue #3252.
--
-- The SQL Server migration fixes bug B48: the original AFTER INSERT trigger
-- trgConversationDetail_AssignSequence computed the next per-conversation Sequence
-- with a WITH (UPDLOCK, HOLDLOCK) MAX-read. In an AFTER trigger each concurrent
-- transaction already holds an exclusive key lock on its own new row, so the range
-- scan blocks on the other transaction's uncommitted row — a guaranteed deadlock.
-- The SS fix replaces that with a transaction-scoped sp_getapplock per ConversationID
-- (sorted acquisition, 30s bounded wait) plus READPAST on the MAX-read.
--
-- PostgreSQL never had this defect. The PG trigger installed by
-- V202607201104__v5.49.x__Agent_Conversation_Compaction.pg.sql is BEFORE INSERT
-- FOR EACH ROW and already serializes on a transaction-scoped
-- pg_advisory_xact_lock(1296126789, hashtext(ConversationID)) — assigning the value
-- before the row is written, so no exclusive key lock is held during the MAX read and
-- the deadlock cycle cannot form. The SS migration's own header says this fix
-- "converges SQL Server with the PostgreSQL variant, which already serializes via
-- pg_advisory_xact_lock."
--
-- Therefore the corrective DDL has no PostgreSQL counterpart: the PG trigger is
-- already in the fixed state. Nothing to apply.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- No DDL: see header. PG trigger already carries the fixed (BEFORE ROW + advisory lock)
-- semantics from V202607201104. This file exists to preserve 1:1 migration parity.
