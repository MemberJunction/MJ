-- =============================================================================
-- Composite Nonclustered Performance Indexes (v6.2.x)
-- =============================================================================
-- Adds composite nonclustered indexes for high-frequency polymorphic and
-- timeline queries across core MemberJunction tables:
--
--   1. RecordChange (EntityID, RecordID, ChangedAt DESC)
--      Serves <mj-record-changes> timeline queries and record history lookups
--      filtering by (EntityID, RecordID) and ordering by ChangedAt DESC without
--      key-lookup sort spills.
--
--   2. UserRecordLog (EntityID, RecordID, UserID) INCLUDE (LatestAt, TotalCount)
--      Serves record-access telemetry upserts and recent-record lookups by
--      (EntityID, RecordID, UserID).
--
--   3. TaggedItem (EntityID, RecordID) INCLUDE (TagID)
--      Serves polymorphic tag resolution and <mj-record-links> dependency lookups
--      scoped by (EntityID, RecordID).
--
--   4. ConversationDetail (ConversationID, __mj_CreatedAt ASC)
--      Serves chronological message loading for conversations ordered by
--      __mj_CreatedAt.
--
--   5. SystemEvent (EntityID)
--      Adds the missing foreign-key index on SystemEvent.EntityID to prevent
--      full table scans when checking entity dependencies or filtering events
--      by entity.
--
-- DDL-only index creation (no table column or view shape changes, so no CodeGen
-- output block is required). PostgreSQL counterpart deferred to release build.
-- =============================================================================

-- 1. RecordChange: composite index on (EntityID, RecordID, ChangedAt DESC)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}'
      AND t.name = 'RecordChange'
      AND i.name = 'IX_RecordChange_EntityID_RecordID_ChangedAt'
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_RecordChange_EntityID_RecordID_ChangedAt]
        ON [${flyway:defaultSchema}].[RecordChange] ([EntityID] ASC, [RecordID] ASC, [ChangedAt] DESC);
END
GO

-- 2. UserRecordLog: composite index on (EntityID, RecordID, UserID) INCLUDE (LatestAt, TotalCount)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}'
      AND t.name = 'UserRecordLog'
      AND i.name = 'IX_UserRecordLog_EntityID_RecordID_UserID'
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_UserRecordLog_EntityID_RecordID_UserID]
        ON [${flyway:defaultSchema}].[UserRecordLog] ([EntityID] ASC, [RecordID] ASC, [UserID] ASC)
        INCLUDE ([LatestAt], [TotalCount]);
END
GO

-- 3. TaggedItem: composite index on (EntityID, RecordID) INCLUDE (TagID)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}'
      AND t.name = 'TaggedItem'
      AND i.name = 'IX_TaggedItem_EntityID_RecordID'
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_TaggedItem_EntityID_RecordID]
        ON [${flyway:defaultSchema}].[TaggedItem] ([EntityID] ASC, [RecordID] ASC)
        INCLUDE ([TagID]);
END
GO

-- 4. ConversationDetail: composite index on (ConversationID, __mj_CreatedAt ASC)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}'
      AND t.name = 'ConversationDetail'
      AND i.name = 'IX_ConversationDetail_ConversationID_CreatedAt'
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_ConversationDetail_ConversationID_CreatedAt]
        ON [${flyway:defaultSchema}].[ConversationDetail] ([ConversationID] ASC, [__mj_CreatedAt] ASC);
END
GO

-- 5. SystemEvent: foreign-key index on (EntityID)
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}'
      AND t.name = 'SystemEvent'
      AND i.name = 'IDX_AUTO_MJ_FKEY_SystemEvent_EntityID'
)
BEGIN
    CREATE NONCLUSTERED INDEX [IDX_AUTO_MJ_FKEY_SystemEvent_EntityID]
        ON [${flyway:defaultSchema}].[SystemEvent] ([EntityID] ASC);
END
GO
