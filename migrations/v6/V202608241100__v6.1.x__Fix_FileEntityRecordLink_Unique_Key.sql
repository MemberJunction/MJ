/* ==============================================================================================
   FileEntityRecordLink's unique key omits RecordID, so a file can attach to only ONE record
   per entity. (MJ issue #3943.)

   WHAT IS WRONG

   `__mj.FileEntityRecordLink` is the generic soft-key many-to-many between any file and any record
   of any entity. Its columns are ID, FileID (FK), EntityID (FK), RecordID NVARCHAR(750) — a SOFT
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

     * It is not two FK columns. RecordID is an nvarchar(750) soft key, so the "natural key is a
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
IF EXISTS (
    SELECT 1
    FROM sys.key_constraints kc
    WHERE kc.name = 'UQ_FileEntityRecordLink_EntityID_FileID'
      AND kc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.FileEntityRecordLink')
)
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.FileEntityRecordLink
        DROP CONSTRAINT UQ_FileEntityRecordLink_EntityID_FileID;

    PRINT N'${flyway:defaultSchema}.FileEntityRecordLink: dropped UQ_FileEntityRecordLink_EntityID_FileID';
END
ELSE
    PRINT N'${flyway:defaultSchema}.FileEntityRecordLink: UQ_FileEntityRecordLink_EntityID_FileID not present, nothing to drop';
GO

-- ---------------------------------------------------------------------------------------------
-- 2. Add the correct (EntityID, RecordID, FileID) key — a widening, so it cannot fail on data.
-- ---------------------------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1
    FROM sys.key_constraints kc
    WHERE kc.name = 'UQ_FileEntityRecordLink_EntityID_RecordID_FileID'
      AND kc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.FileEntityRecordLink')
)
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.FileEntityRecordLink
        ADD CONSTRAINT UQ_FileEntityRecordLink_EntityID_RecordID_FileID
        UNIQUE NONCLUSTERED (EntityID, RecordID, FileID);

    PRINT N'${flyway:defaultSchema}.FileEntityRecordLink: added UQ_FileEntityRecordLink_EntityID_RecordID_FileID';
END
ELSE
    PRINT N'${flyway:defaultSchema}.FileEntityRecordLink: UQ_FileEntityRecordLink_EntityID_RecordID_FileID already present';
GO
