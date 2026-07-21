-- =====================================================================================
-- Fix: concurrent same-conversation ConversationDetail inserts deadlock (B48)
-- =====================================================================================
-- The original trgConversationDetail_AssignSequence (V202607201104) computed the next
-- per-conversation Sequence with a WITH (UPDLOCK, HOLDLOCK) MAX-read. Because the trigger
-- is AFTER INSERT, each concurrent transaction already holds an exclusive key lock on its
-- own new row when the trigger's range-scan tries to read past the OTHER transaction's
-- uncommitted row — a guaranteed mutual block. SQL Server kills one transaction as the
-- deadlock victim and that user's message save fails outright (BaseEntity.Save() does not
-- retry deadlocks). Reproduced deterministically by integration check
-- conversation-compaction.CC12 (4 parallel saves into one conversation).
--
-- The fix replaces the range locks with two cooperating pieces:
--
--  1. sp_getapplock, transaction-scoped, keyed per ConversationID: same-conversation
--     writers now QUEUE (millisecond waits) instead of deadlocking; different
--     conversations never contend. Locks are acquired in sorted ConversationID order so
--     two multi-conversation batches cannot deadlock on the app locks themselves. This
--     also converges SQL Server with the PostgreSQL variant, which already serializes
--     via pg_advisory_xact_lock.
--
--  2. READPAST on the MAX-read (replacing UPDLOCK/HOLDLOCK): the app lock alone is not
--     enough in an AFTER trigger — the lock holder's scan would still block on a QUEUED
--     writer's already-inserted row (that writer inserted before reaching the app lock),
--     recreating the deadlock through the app lock. READPAST skips locked uncommitted
--     rows, and skipping them is CORRECT here: every skipped row belongs to a writer
--     queued behind the app lock, which computes its own Sequence when it acquires the
--     lock and sees everything committed before it. A queued writer that rolls back
--     leaves no gap or duplicate (its row vanishes; the next holder computes from the
--     committed MAX).
--
-- NOTE: READPAST requires locking READ COMMITTED (MJ's standard configuration). It is
-- not valid under snapshot isolation; deployments running SNAPSHOT would need the
-- INSTEAD OF variant instead (see plans/integration-test-expansion/bug-register.md B48).
-- No schema change — CodeGen not involved.
GO
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trgConversationDetail_AssignSequence]
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted)
        RETURN;

    -- ── 1. Serialize same-conversation writers on transaction-scoped app locks ──
    -- Sorted acquisition order prevents applock-vs-applock deadlocks between two
    -- statements that each insert into multiple conversations.
    DECLARE @conv UNIQUEIDENTIFIER;
    DECLARE @lockResult INT;
    DECLARE conv_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT DISTINCT [ConversationID] FROM inserted ORDER BY [ConversationID];
    OPEN conv_cursor;
    FETCH NEXT FROM conv_cursor INTO @conv;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        DECLARE @resource NVARCHAR(255) = N'ConvDetailSeq:' + CONVERT(char(36), @conv);
        EXEC @lockResult = sp_getapplock
            @Resource    = @resource,
            @LockMode    = 'Exclusive',
            @LockOwner   = 'Transaction',
            @LockTimeout = 30000;   -- bounded: a wedged writer yields a clean error, not an infinite queue
        IF @lockResult < 0
        BEGIN
            CLOSE conv_cursor; DEALLOCATE conv_cursor;
            RAISERROR(N'trgConversationDetail_AssignSequence: could not acquire the per-conversation sequence lock (%s) within 30s — another writer to this conversation appears wedged.', 16, 1, @resource);
            ROLLBACK TRANSACTION;
            RETURN;
        END
        FETCH NEXT FROM conv_cursor INTO @conv;
    END
    CLOSE conv_cursor; DEALLOCATE conv_cursor;

    -- ── 2. Assign per-conversation monotonic Sequence values ──
    -- READPAST (not UPDLOCK/HOLDLOCK) on the committed-MAX read: see header for why
    -- skipping other transactions' uncommitted rows is both deadlock-free and correct.
    ;WITH batch AS (
        SELECT i.[ID], i.[ConversationID],
               ROW_NUMBER() OVER (PARTITION BY i.[ConversationID]
                                  ORDER BY i.[__mj_CreatedAt] ASC, i.[ID] ASC) AS rn
        FROM inserted i
    ),
    existing AS (
        SELECT cd.[ConversationID], MAX(cd.[Sequence]) AS MaxSeq
        FROM [${flyway:defaultSchema}].[ConversationDetail] cd WITH (READPAST)
        WHERE cd.[ConversationID] IN (SELECT DISTINCT [ConversationID] FROM inserted)
          AND cd.[ID] NOT IN (SELECT [ID] FROM inserted)
        GROUP BY cd.[ConversationID]
    )
    UPDATE cd
        SET cd.[Sequence] = ISNULL(e.MaxSeq, 0) + b.rn
    FROM [${flyway:defaultSchema}].[ConversationDetail] cd
    JOIN batch b      ON b.[ID] = cd.[ID]
    LEFT JOIN existing e ON e.[ConversationID] = b.[ConversationID];
END
GO
