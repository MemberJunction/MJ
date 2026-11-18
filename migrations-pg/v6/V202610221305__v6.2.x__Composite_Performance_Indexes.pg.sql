-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610221305__v6.2.x__Composite_Performance_Indexes.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The AST transpiler reported all five `IF NOT EXISTS (SELECT … FROM sys.indexes …) BEGIN CREATE
-- NONCLUSTERED INDEX … END` blocks as unhandled. Each is ported as PostgreSQL's
-- `CREATE INDEX IF NOT EXISTS`, which is the same guard; `INCLUDE` columns are kept (PostgreSQL 11+).
-- Index names match the SQL Server migration. There are no CodeGen objects: the migration adds
-- indexes only.
-- ╚════════════════════════════════════════╝

-- 1. RecordChange: record history and timeline lookups by (EntityID, RecordID), newest first.
CREATE INDEX IF NOT EXISTS "IX_RecordChange_EntityID_RecordID_ChangedAt"
    ON __mj."RecordChange" ("EntityID" ASC, "RecordID" ASC, "ChangedAt" DESC);

-- 2. UserRecordLog: record-access telemetry upserts and recent-record lookups.
CREATE INDEX IF NOT EXISTS "IX_UserRecordLog_EntityID_RecordID_UserID"
    ON __mj."UserRecordLog" ("EntityID" ASC, "RecordID" ASC, "UserID" ASC)
    INCLUDE ("LatestAt", "TotalCount");

-- 3. TaggedItem: polymorphic tag resolution and record-link dependency lookups.
CREATE INDEX IF NOT EXISTS "IX_TaggedItem_EntityID_RecordID"
    ON __mj."TaggedItem" ("EntityID" ASC, "RecordID" ASC)
    INCLUDE ("TagID");

-- 4. ConversationDetail: chronological message loading per conversation.
CREATE INDEX IF NOT EXISTS "IX_ConversationDetail_ConversationID_CreatedAt"
    ON __mj."ConversationDetail" ("ConversationID" ASC, "__mj_CreatedAt" ASC);

-- 5. SystemEvent: the missing foreign-key index on EntityID.
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SystemEvent_EntityID"
    ON __mj."SystemEvent" ("EntityID" ASC);
