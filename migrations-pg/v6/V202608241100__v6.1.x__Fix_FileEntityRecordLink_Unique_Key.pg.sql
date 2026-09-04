-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
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

-- SKIPPED: conditional DDL (auto-conversion not supported)
-- IF EXISTS (
--     SELECT 1
--     FROM sys.key_constraints kc
--     WHERE kc.name = 'UQ_FileEntityRecordLink_EntityID_FileID'
--       AND kc.parent_object_id = OBJECT_ID('__mj.FileEntityRecordLink')
-- )
-- BEGIN
--     ALTER TABLE __mj.FileEntityRecordLink
--         DROP CONSTRAINT UQ_FileEntityRecordLink_EntityID_FileID;
-- 
--     PRINT '__mj.FileEntityRecordLink: dropped UQ_FileEntityRecordLink_EntityID_FileID';
-- END
-- ELSE


-- SKIPPED: conditional DDL (auto-conversion not supported)
-- IF NOT EXISTS (
--     SELECT 1
--     FROM sys.key_constraints kc
--     WHERE kc.name = 'UQ_FileEntityRecordLink_EntityID_RecordID_FileID'
--       AND kc.parent_object_id = OBJECT_ID('__mj.FileEntityRecordLink')
-- )
-- BEGIN
--     ALTER TABLE __mj.FileEntityRecordLink
--         ADD CONSTRAINT UQ_FileEntityRecordLink_EntityID_RecordID_FileID
--         UNIQUE NONCLUSTERED (EntityID, RecordID, FileID);
-- 
--     PRINT '__mj.FileEntityRecordLink: added UQ_FileEntityRecordLink_EntityID_RecordID_FileID';
-- END
-- ELSE


-- ===================== Other =====================

/* ==============================================================================================
   FileEntityRecordLink's unique key omits RecordID, so a file can attach to only ONE record
   per entity. (MJ issue #3943.)

   WHAT IS WRONG

   `__mj.FileEntityRecordLink` is the generic soft-key many-to-many between any file and any record
   of any entity. Its columns are ID, FileID (FK), EntityID (FK), RecordID VARCHAR(750) — a SOFT
   key, deliberately not an FK — plus timestamps. The row's identity is therefore the triple
   (EntityID, RecordID, FileID): "this file is attached to that record of that entity."

   The constraint added by V202605221002__v5.37.x__Add_Unique_Constraints_To_MJ_Junction_Tables.sql
   is only (EntityID, FileID). That makes attaching one file to a second record of the same entity
   a unique-key violation — the exact operation the table exists to support.

   WHY THIS READS AS UNINTENDED RATHER THAN DELIBERATE

   That migration states its own scope in its header: 17 "pure junction" tables consisting of TWO
   FOREIGN-KEY COLUMNS plus ID/Sequence/timestamps, with no other meaningful data columns, written
   only by CodeGen / metadata sync or by first-creation-only paths. FileEntityRecordLink fails both
   halves of that test:

     * It is not two FK columns. RecordID is an VARCHAR(750) soft key, so the "natural key is a
       pair of foreign keys" heuristic mechanically picked EntityID + FileID and dropped the one
       column that makes a row distinct.
     * It does have a runtime writer — packages/AI/Agents/src/realtime/realtime-recording-store.ts
       creates link rows during agent sessions.

   MJ's own metadata describes this table as the motivating example for soft-key detection (see the
   EntityField.EntityIDFieldName description, which names FileEntityRecordLink's
   EntityID/RecordID pair by name), confirming (EntityID, RecordID) is meant to be the record
   address rather than an incidental payload.

   PRIOR ART IN THIS ERA

   This is the second constraint from that same v5.37 batch to be corrected on the same grounds.
   V202608080100__v6.1.x__Drop_EntityAction_Uniqueness.sql dropped UQ_EntityAction_ActionID_EntityID
   with reason 1 stated as "THE CONSTRAINT WAS APPLIED OUTSIDE ITS OWN DECLARED SCOPE" — EntityAction
   carried Status/Sequence/LoggingMode and owned child collections, so it was an
   association-with-attributes rather than a link table. FileEntityRecordLink fails the same
   predicate for a different reason: its third column is a soft key, not an attribute. The pattern
   is the batch's two-FK-column heuristic being applied to tables it did not describe.

   It has gone unnoticed because storeRealtimeRecording uploads a fresh MJ: Files row per session,
   so it never presents the same FileID twice, and there are no readers yet. The constraint has
   never been exercised.

   WHAT THIS DOES

   Replaces the constraint with (EntityID, RecordID, FileID). This is a WIDENING: every row that
   satisfied the old two-column key satisfies the three-column one, so it cannot fail on existing
   data and needs no de-duplication pass or data migration. It still forbids the duplicate the
   original was reaching for — the same file linked twice to the same record.

   Both statements are guarded on sys.key_constraints so the script is re-runnable and so a
   database that somehow lacks the old constraint still ends up with the new one.

   INDEXING: intentionally none added. The lookup every consumer will issue is
   WHERE EntityID = ? AND RecordID = ?, and the new unique constraint's backing index leads with
   exactly that prefix and carries FileID as its third key column — it already covers that query.
   A separate IX_..._EntityID_RecordID INCLUDE (FileID) would duplicate it. Add one only if a
   measured plan later shows a need.

   PRE-EXISTING DATA LOSS (informational — not repairable here): the v5.37 migration deleted
   pre-existing duplicates before adding each constraint, keeping the earliest __mj_CreatedAt per
   (EntityID, FileID) group. A deployment that legitimately had one file linked to several records
   of the same entity lost those link rows then. It logged per-table duplicate/deletion counts, so
   affected deployments can check their upgrade logs; the rows are not recoverable.

   No CodeGen is required: this changes a constraint, not a column. Nothing in the generated ORM
   or in entity metadata changes.
   ============================================================================================== */

-- ---------------------------------------------------------------------------------------------
-- 1. Drop the too-narrow (EntityID, FileID) key.
-- ---------------------------------------------------------------------------------------------

-- ---------------------------------------------------------------------------------------------
-- 2. Add the correct (EntityID, RecordID, FileID) key — a widening, so it cannot fail on data.
-- ---------------------------------------------------------------------------------------------

-- ============================================================================
-- HAND-PORTED. The converter emitted this file with ZERO executable statements.
--
-- Both of the SQL Server migration's steps live inside `IF EXISTS (...) BEGIN ... END` guards,
-- and the converter dropped the guards and the DDL inside them together, leaving only the header.
-- scripts/check-pg-migration-content.mjs caught it (source has 7 content statements, counterpart
-- had 0); a line-count comparison did NOT, because the surviving header is longer than the whole
-- SQL Server file.
--
-- This is NOT empty-by-design. The defect is present on PostgreSQL: a freshly migrated database
-- holds `UQ_FileEntityRecordLink_EntityID_FileID UNIQUE ("EntityID", "FileID")`, verified against
-- this release's own verification database. So on PostgreSQL, exactly as on SQL Server, a file can
-- attach to only ONE record per entity — while __mj."FileEntityRecordLink" exists precisely to be
-- the generic many-to-many between any file and any record of any entity (MJ issue #3943). The
-- row's identity is the triple (EntityID, RecordID, FileID); RecordID is an nvarchar(750) SOFT key
-- that the v5.37 junction-table sweep's "natural key is a pair of foreign keys" heuristic
-- mechanically skipped, dropping the one column that makes a row distinct.
--
-- Ported as two guarded DO blocks, mirroring the source's structure step for step:
--   1. drop the wrong (EntityID, FileID) key if present
--   2. add the correct (EntityID, RecordID, FileID) key if absent
-- Guards read pg_constraint (the catalogue counterpart of sys.key_constraints), so the migration is
-- idempotent and applies cleanly both to a fresh database and to one migrating through. Step 2 is a
-- WIDENING of step 1's key, so it cannot fail on existing data. RAISE NOTICE stands in for PRINT.
-- ============================================================================

DO $mj$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FileEntityRecordLink'
          AND c.conname = 'UQ_FileEntityRecordLink_EntityID_FileID'
    ) THEN
        ALTER TABLE __mj."FileEntityRecordLink"
            DROP CONSTRAINT "UQ_FileEntityRecordLink_EntityID_FileID";
        RAISE NOTICE '__mj.FileEntityRecordLink: dropped UQ_FileEntityRecordLink_EntityID_FileID';
    ELSE
        RAISE NOTICE '__mj.FileEntityRecordLink: UQ_FileEntityRecordLink_EntityID_FileID not present, nothing to drop';
    END IF;
END
$mj$;

DO $mj$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'FileEntityRecordLink'
          AND c.conname = 'UQ_FileEntityRecordLink_EntityID_RecordID_FileID'
    ) THEN
        ALTER TABLE __mj."FileEntityRecordLink"
            ADD CONSTRAINT "UQ_FileEntityRecordLink_EntityID_RecordID_FileID"
            UNIQUE ("EntityID", "RecordID", "FileID");
        RAISE NOTICE '__mj.FileEntityRecordLink: added UQ_FileEntityRecordLink_EntityID_RecordID_FileID';
    ELSE
        RAISE NOTICE '__mj.FileEntityRecordLink: UQ_FileEntityRecordLink_EntityID_RecordID_FileID already present';
    END IF;
END
$mj$;
