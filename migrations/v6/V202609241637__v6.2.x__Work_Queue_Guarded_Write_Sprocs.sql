-- ============================================================================
-- Work Queue — guarded-write stored procedures (plans/work-queue-1/12, CD9)
-- ============================================================================
-- WHY THIS EXISTS. The work-queue engine (@memberjunction/work-queue-engine) claims, heartbeats,
-- settles and sweeps WorkQueueMessage / WorkQueueDelivery / WorkQueueDeduplication rows. MJ grants
-- its runtime roles SELECT on views and EXECUTE on stored procedures and never table-level DML, so
-- raw DML from the engine would be refused under a least-privilege cdp_* login — and a refusal
-- reports rowcount 0, which the lease fence reads as "another worker won", so nothing would ever be
-- claimed. Same defect, same remedy as the task graph (#4575,
-- V202609191819__v6.2.x__TaskGraph_Guarded_Write_Sprocs.sql), the scheduling engine, the agent-run
-- watchdog and durable sync runs. Every queue statement therefore lives here, static, under
-- ownership chaining.
--
-- WHAT IS PRESERVED (03 §7). One conditional statement per write whose @@ROWCOUNT is the arbitration
-- signal, returned as [AffectedRows]; never read-then-write. Holder writes are fenced on
-- ID + LeaseToken + Status = 'InFlight' + CancelRequestedAt IS NULL; the single exception is
-- AcknowledgeCancel, which requires the cancel flag. One clock: SYSDATETIMEOFFSET() on both sides of
-- every comparison. Row-returning writes capture OUTPUT ... INTO a table variable (CodeGen tables carry
-- update triggers, so a bare OUTPUT fails) and end with exactly one SELECT. Bounded work: every scan is
-- TOP (@n), every purge DELETE TOP (@n) WITH (READPAST).
--
-- NO DYNAMIC SQL, DELIBERATELY. sp_executesql breaks ownership chaining. Mode-dependent predicates are
-- static OR arms on a parameter (with OPTION (RECOMPILE) on the hot reads so the optimizer sees the
-- value); set inputs arrive as JSON read with OPENJSON.
--
-- GRANTS. cdp_Developer and cdp_Integration, matching the permissions CodeGen granted on the three
-- driver-owned entities. Deliberately NOT cdp_UI: UI has no read on Messages or Deliveries (03 §6.7).
--
-- PostgreSQL counterpart is produced by the release build.
-- ============================================================================

-- Procedures bake in the QUOTED_IDENTIFIER / ANSI_NULLS settings active at CREATE time; the delivery
-- table carries filtered indexes and the OPENJSON path needs them ON.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Publish and the deduplication ledger (03 §2.1)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Serialises publishes per (topic, partition key) so PublishOrdinal is monotonic per key in commit
-- order. Transaction-owned: the caller must be inside a transaction, which also releases the lock.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueAcquirePublishOrderLock];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueAcquirePublishOrderLock]
    @Resource NVARCHAR(255),
    @TimeoutMs INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LockResult INT;
    EXEC @LockResult = sp_getapplock @Resource = @Resource, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = @TimeoutMs;
    IF @LockResult = -1 THROW 51001, N'WorkQueue publish-order lock timeout', 1;
    IF @LockResult < 0 THROW 51000, N'WorkQueue publish-order lock was not acquired', 1;
    SELECT @LockResult AS [LockResult];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueAcquirePublishOrderLock] TO [cdp_Developer], [cdp_Integration];
GO

-- Inserts only when no message has this ID (MessageID is globally unique, F10): one primary-key seek
-- under a range lock. Returns the inserted row, or nothing when a row already exists — the driver then
-- reads it with SelectMessage and compares canonical envelopes. PublishedAt is the column default.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueInsertMessage];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueInsertMessage]
    @ID UNIQUEIDENTIFIER,
    @TopicID UNIQUEIDENTIFIER,
    @PartitionKey NVARCHAR(200),
    @Attributes NVARCHAR(4000),
    @Payload NVARCHAR(MAX),
    @PayloadRef NVARCHAR(2000),
    @CorrelationID NVARCHAR(200),
    @PublishedByUserID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Inserted TABLE ([ID] UNIQUEIDENTIFIER, [PublishOrdinal] BIGINT);
    INSERT INTO [${flyway:defaultSchema}].[WorkQueueMessage] ([ID], [TopicID], [PartitionKey], [Attributes], [Payload], [PayloadRef], [CorrelationID], [PublishedByUserID])
    OUTPUT inserted.[ID], inserted.[PublishOrdinal] INTO @Inserted
    SELECT @ID, @TopicID, @PartitionKey, @Attributes, @Payload, @PayloadRef, @CorrelationID, @PublishedByUserID
    WHERE NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueMessage] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @ID);
    SELECT [ID], [PublishOrdinal] FROM @Inserted;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueInsertMessage] TO [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueSelectMessage];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueSelectMessage]
    @MessageID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT [ID], [TopicID], [PartitionKey], [Attributes], [Payload], [PayloadRef], [CorrelationID]
    FROM [${flyway:defaultSchema}].[WorkQueueMessage]
    WHERE [ID] = @MessageID;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueSelectMessage] TO [cdp_Developer], [cdp_Integration];
GO

-- One Pending delivery per element of the JSON array [{MessageID, SubscriptionID, PartitionKey, OrderKey}].
-- Status, AttemptCount, IsReplay and VisibleAt come from the column defaults. Chunked by the driver.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueInsertDeliveries];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueInsertDeliveries]
    @Deliveries NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [${flyway:defaultSchema}].[WorkQueueDelivery] ([MessageID], [SubscriptionID], [PartitionKey], [OrderKey])
    SELECT j.[MessageID], j.[SubscriptionID], j.[PartitionKey], j.[OrderKey]
    FROM OPENJSON(@Deliveries) WITH (
        [MessageID] UNIQUEIDENTIFIER '$.MessageID',
        [SubscriptionID] UNIQUEIDENTIFIER '$.SubscriptionID',
        [PartitionKey] NVARCHAR(200) '$.PartitionKey',
        [OrderKey] BIGINT '$.OrderKey'
    ) j;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueInsertDeliveries] TO [cdp_Developer], [cdp_Integration];
GO

-- F1: takes a free key, replaces an expired row in place, or re-takes a Reserved row owned by the SAME
-- MessageID (a retry after a crash). Never re-takes a Confirmed row or another message's reservation:
-- those return no row and the caller reads the owner. Returns the row it now owns (0-1).
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueReserveDeduplication];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueReserveDeduplication]
    @TopicID UNIQUEIDENTIFIER,
    @DeduplicationKey NVARCHAR(200),
    @MessageID UNIQUEIDENTIFIER,
    @ReserveSeconds INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Reservation TABLE ([MessageID] UNIQUEIDENTIFIER, [Status] NVARCHAR(20));
    UPDATE [${flyway:defaultSchema}].[WorkQueueDeduplication] WITH (UPDLOCK, HOLDLOCK)
    SET [MessageID] = @MessageID, [Status] = N'Reserved', [ExpiresAt] = DATEADD(SECOND, @ReserveSeconds, SYSDATETIMEOFFSET())
    OUTPUT inserted.[MessageID], inserted.[Status] INTO @Reservation
    WHERE [TopicID] = @TopicID AND [DeduplicationKey] = @DeduplicationKey
      AND ([ExpiresAt] <= SYSDATETIMEOFFSET() OR ([Status] = N'Reserved' AND [MessageID] = @MessageID));
    IF NOT EXISTS (SELECT 1 FROM @Reservation)
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueDeduplication] ([TopicID], [DeduplicationKey], [MessageID], [Status], [ExpiresAt])
        OUTPUT inserted.[MessageID], inserted.[Status] INTO @Reservation
        SELECT @TopicID, @DeduplicationKey, @MessageID, N'Reserved', DATEADD(SECOND, @ReserveSeconds, SYSDATETIMEOFFSET())
        WHERE NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDeduplication] WITH (UPDLOCK, HOLDLOCK)
                          WHERE [TopicID] = @TopicID AND [DeduplicationKey] = @DeduplicationKey);
    SELECT [MessageID], [Status] FROM @Reservation;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueReserveDeduplication] TO [cdp_Developer], [cdp_Integration];
GO

-- A separate statement on purpose: it must see a row committed while the reserve was waiting.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueSelectDeduplicationOwner];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueSelectDeduplicationOwner]
    @TopicID UNIQUEIDENTIFIER,
    @DeduplicationKey NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT [MessageID], [Status]
    FROM [${flyway:defaultSchema}].[WorkQueueDeduplication]
    WHERE [TopicID] = @TopicID AND [DeduplicationKey] = @DeduplicationKey AND [ExpiresAt] > SYSDATETIMEOFFSET();
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueSelectDeduplicationOwner] TO [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueConfirmDeduplication];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueConfirmDeduplication]
    @TopicID UNIQUEIDENTIFIER,
    @DeduplicationKey NVARCHAR(200),
    @MessageID UNIQUEIDENTIFIER,
    @TtlSeconds INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDeduplication]
    SET [Status] = N'Confirmed', [ExpiresAt] = DATEADD(SECOND, @TtlSeconds, SYSDATETIMEOFFSET())
    WHERE [TopicID] = @TopicID AND [DeduplicationKey] = @DeduplicationKey AND [MessageID] = @MessageID;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueConfirmDeduplication] TO [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueReleaseDeduplication];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueReleaseDeduplication]
    @TopicID UNIQUEIDENTIFIER,
    @DeduplicationKey NVARCHAR(200),
    @MessageID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [${flyway:defaultSchema}].[WorkQueueDeduplication]
    WHERE [TopicID] = @TopicID AND [DeduplicationKey] = @DeduplicationKey AND [MessageID] = @MessageID AND [Status] = N'Reserved';
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueReleaseDeduplication] TO [cdp_Developer], [cdp_Integration];
GO

-- IX_WorkQueueDeduplication_ExpiresAt; READPAST so sweeps and publishers never wait on each other.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueuePurgeExpiredDeduplications];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueuePurgeExpiredDeduplications]
    @BatchSize INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE TOP (@BatchSize) FROM [${flyway:defaultSchema}].[WorkQueueDeduplication] WITH (READPAST)
    WHERE [ExpiresAt] <= SYSDATETIMEOFFSET();
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueuePurgeExpiredDeduplications] TO [cdp_Developer], [cdp_Integration];
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Consume: expire, claim, heartbeat, settle, acknowledge a cancel (03 §7)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- An expired in-flight row is Discarded when a cancel was requested (the holder is dead), Pending when
-- attempts remain, otherwise DeadLettered with reason 'LeaseExpired'. Bounded to 500 rows per pass; the
-- next cycle continues. Returns ONLY the rows it dead-lettered (the engine's NotifyDeadLettered seam).
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueExpireLeases];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueExpireLeases]
    @SubscriptionID UNIQUEIDENTIFIER,
    @MaxAttempts INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Expired TABLE ([ID] UNIQUEIDENTIFIER, [SubscriptionID] UNIQUEIDENTIFIER, [PartitionKey] NVARCHAR(200), [Status] NVARCHAR(20), [DeadLetterReason] NVARCHAR(100));
    UPDATE TOP (500) d SET
        [Status] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN N'Discarded'
                        WHEN d.[AttemptCount] >= @MaxAttempts THEN N'DeadLettered' ELSE N'Pending' END,
        [DeadLetterReason] = CASE WHEN d.[CancelRequestedAt] IS NULL AND d.[AttemptCount] >= @MaxAttempts THEN N'LeaseExpired' ELSE d.[DeadLetterReason] END,
        [DeadLetteredAt] = CASE WHEN d.[CancelRequestedAt] IS NULL AND d.[AttemptCount] >= @MaxAttempts THEN SYSDATETIMEOFFSET() ELSE d.[DeadLetteredAt] END,
        [CompletedAt] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE d.[CompletedAt] END,
        [LastError] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN d.[LastError] ELSE N'LeaseExpired' END,
        [VisibleAt] = SYSDATETIMEOFFSET(),
        [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    OUTPUT inserted.[ID], inserted.[SubscriptionID], inserted.[PartitionKey], inserted.[Status], inserted.[DeadLetterReason] INTO @Expired
    FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
    WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'InFlight' AND d.[LeaseExpiresAt] < SYSDATETIMEOFFSET();
    SELECT [ID] AS [DeliveryID], [SubscriptionID], [PartitionKey], [DeadLetterReason] AS [Reason] FROM @Expired WHERE [Status] = N'DeadLettered';
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueExpireLeases] TO [cdp_Developer], [cdp_Integration];
GO

-- Autoscaler metric (03 §11): claimable Pending under the partition rules PLUS InFlight (a scaler
-- subtracts running executions, so a Pending-only count starves the queue). Every count stops at @Cap.
-- @Mode: 'None' | 'Exclusive' (distinct idle keys) | 'Ordered' (heads).
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueSubscriptionBacklog];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueSubscriptionBacklog]
    @SubscriptionID UNIQUEIDENTIFIER,
    @Mode NVARCHAR(20),
    @Cap INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM (SELECT TOP (@Cap) 1 AS [x] FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
                               WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'Pending' AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
                                 AND d.[PartitionKey] IS NULL
                                 AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueSubscription] s WHERE s.[ID] = @SubscriptionID AND s.[Status] = N'Active')) k)
        + CASE
            WHEN @Mode = N'Exclusive' THEN
                (SELECT COUNT(*) FROM (SELECT DISTINCT TOP (@Cap) d.[PartitionKey] FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
                                       WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'Pending' AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
                                         AND d.[PartitionKey] IS NOT NULL
                                         AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueSubscription] s WHERE s.[ID] = @SubscriptionID AND s.[Status] = N'Active')
                                         AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] f
                                                         WHERE f.[SubscriptionID] = d.[SubscriptionID] AND f.[PartitionKey] = d.[PartitionKey] AND f.[Status] = N'InFlight')) h)
            WHEN @Mode = N'Ordered' THEN
                (SELECT COUNT(*) FROM (SELECT TOP (@Cap) 1 AS [x] FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
                                       WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'Pending' AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
                                         AND d.[PartitionKey] IS NOT NULL
                                         AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueSubscription] s WHERE s.[ID] = @SubscriptionID AND s.[Status] = N'Active')
                                         AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] f
                                                         WHERE f.[SubscriptionID] = d.[SubscriptionID] AND f.[PartitionKey] = d.[PartitionKey] AND f.[Status] = N'InFlight')
                                         AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] e
                                                         WHERE e.[SubscriptionID] = d.[SubscriptionID] AND e.[PartitionKey] = d.[PartitionKey]
                                                           AND e.[OrderKey] < d.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered'))) h)
            ELSE 0
          END AS [Claimable],
        (SELECT COUNT(*) FROM (SELECT TOP (@Cap) 1 AS [x] FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
                               WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'InFlight') f) AS [InFlight];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueSubscriptionBacklog] TO [cdp_Developer], [cdp_Integration];
GO

-- Claims up to @MaxRows keyless, visible, uncancelled Pending rows of an active subscription with
-- skip-locked hints, issuing a fresh lease token and counting the attempt. Returns the claimed
-- deliveries joined to their messages.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueClaimUnpartitioned];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueClaimUnpartitioned]
    @SubscriptionID UNIQUEIDENTIFIER,
    @LeaseOwner NVARCHAR(200),
    @LeaseSeconds INT,
    @MaxRows INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Claimed TABLE ([ID] UNIQUEIDENTIFIER, [MessageID] UNIQUEIDENTIFIER, [AttemptCount] INT, [LeaseToken] UNIQUEIDENTIFIER, [LeaseExpiresAt] DATETIMEOFFSET(7), [IsReplay] BIT);
    WITH [Ready] AS (
        SELECT TOP (@MaxRows) d.[ID], d.[MessageID], d.[Status], d.[LeaseToken], d.[LeaseOwner], d.[LeaseExpiresAt],
            d.[LastHeartbeatAt], d.[AttemptCount], d.[Progress], d.[IsReplay]
        FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d WITH (UPDLOCK, READPAST, ROWLOCK)
        WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'Pending' AND d.[PartitionKey] IS NULL
          AND d.[VisibleAt] <= SYSDATETIMEOFFSET() AND d.[CancelRequestedAt] IS NULL
          AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueSubscription] s WHERE s.[ID] = @SubscriptionID AND s.[Status] = N'Active')
        ORDER BY d.[VisibleAt]
    )
    UPDATE [Ready] SET
        [Status] = N'InFlight', [LeaseToken] = NEWID(), [LeaseOwner] = @LeaseOwner,
        [LeaseExpiresAt] = DATEADD(SECOND, @LeaseSeconds, SYSDATETIMEOFFSET()), [LastHeartbeatAt] = SYSDATETIMEOFFSET(),
        [AttemptCount] = [AttemptCount] + 1, [Progress] = NULL
    OUTPUT inserted.[ID], inserted.[MessageID], inserted.[AttemptCount], inserted.[LeaseToken], inserted.[LeaseExpiresAt], inserted.[IsReplay] INTO @Claimed;
    SELECT c.[ID] AS [DeliveryID], c.[AttemptCount], c.[LeaseToken], c.[LeaseExpiresAt], c.[IsReplay],
        m.[ID] AS [MessageID], m.[PartitionKey], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID], m.[PublishedAt]
    FROM @Claimed c INNER JOIN [${flyway:defaultSchema}].[WorkQueueMessage] m ON m.[ID] = c.[MessageID];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueClaimUnpartitioned] TO [cdp_Developer], [cdp_Integration];
GO

-- Streams IX_WorkQueueDelivery_Claim in VisibleAt order and stops after TOP (@MaxRows) qualifying rows.
-- Exclusive: keys with nothing in flight. Ordered (@Ordered = 1): additionally the head of its key.
-- No window function and no sort over the backlog. Several rows of one idle key may come back for
-- Exclusive; the consumer keeps the first per key.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueSelectPartitionCandidates];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueSelectPartitionCandidates]
    @SubscriptionID UNIQUEIDENTIFIER,
    @Ordered BIT,
    @MaxRows INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@MaxRows) d.[ID] AS [DeliveryID], d.[PartitionKey]
    FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
    WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'Pending' AND d.[PartitionKey] IS NOT NULL AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
      AND d.[CancelRequestedAt] IS NULL
      AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueSubscription] s WHERE s.[ID] = @SubscriptionID AND s.[Status] = N'Active')
      AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] f
                      WHERE f.[SubscriptionID] = d.[SubscriptionID] AND f.[PartitionKey] = d.[PartitionKey] AND f.[Status] = N'InFlight')
      AND (@Ordered = 0 OR NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] e
                                       WHERE e.[SubscriptionID] = d.[SubscriptionID] AND e.[PartitionKey] = d.[PartitionKey]
                                         AND e.[OrderKey] < d.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')))
    ORDER BY d.[VisibleAt]
    OPTION (RECOMPILE);
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueSelectPartitionCandidates] TO [cdp_Developer], [cdp_Integration];
GO

-- Claims ONE candidate, re-checking every rule on the row. UQ_WorkQueueDelivery_InFlightPartition is the
-- race-proof backstop; a unique violation here means another worker claimed the key first.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueClaimPartitionCandidate];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueClaimPartitionCandidate]
    @SubscriptionID UNIQUEIDENTIFIER,
    @DeliveryID UNIQUEIDENTIFIER,
    @Ordered BIT,
    @LeaseOwner NVARCHAR(200),
    @LeaseSeconds INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Claimed TABLE ([ID] UNIQUEIDENTIFIER, [MessageID] UNIQUEIDENTIFIER, [AttemptCount] INT, [LeaseToken] UNIQUEIDENTIFIER, [LeaseExpiresAt] DATETIMEOFFSET(7), [IsReplay] BIT);
    UPDATE d SET
        [Status] = N'InFlight', [LeaseToken] = NEWID(), [LeaseOwner] = @LeaseOwner,
        [LeaseExpiresAt] = DATEADD(SECOND, @LeaseSeconds, SYSDATETIMEOFFSET()), [LastHeartbeatAt] = SYSDATETIMEOFFSET(),
        [AttemptCount] = [AttemptCount] + 1, [Progress] = NULL
    OUTPUT inserted.[ID], inserted.[MessageID], inserted.[AttemptCount], inserted.[LeaseToken], inserted.[LeaseExpiresAt], inserted.[IsReplay] INTO @Claimed
    FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
    WHERE d.[ID] = @DeliveryID AND d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'Pending'
      AND d.[VisibleAt] <= SYSDATETIMEOFFSET() AND d.[PartitionKey] IS NOT NULL AND d.[CancelRequestedAt] IS NULL
      AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueSubscription] s WHERE s.[ID] = @SubscriptionID AND s.[Status] = N'Active')
      AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] f
                      WHERE f.[SubscriptionID] = d.[SubscriptionID] AND f.[PartitionKey] = d.[PartitionKey] AND f.[Status] = N'InFlight')
      AND (@Ordered = 0 OR NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] e
                                       WHERE e.[SubscriptionID] = d.[SubscriptionID] AND e.[PartitionKey] = d.[PartitionKey]
                                         AND e.[OrderKey] < d.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')));
    SELECT c.[ID] AS [DeliveryID], c.[AttemptCount], c.[LeaseToken], c.[LeaseExpiresAt], c.[IsReplay],
        m.[ID] AS [MessageID], m.[PartitionKey], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID], m.[PublishedAt]
    FROM @Claimed c INNER JOIN [${flyway:defaultSchema}].[WorkQueueMessage] m ON m.[ID] = c.[MessageID];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueClaimPartitionCandidate] TO [cdp_Developer], [cdp_Integration];
GO

-- Heartbeat. Fenced on the holder's token and the cancel flag: zero rows means Lost or Cancelled, and
-- SelectLeaseState tells the two apart.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueExtendLease];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueExtendLease]
    @DeliveryID UNIQUEIDENTIFIER,
    @LeaseToken UNIQUEIDENTIFIER,
    @LeaseSeconds INT,
    @Progress NVARCHAR(4000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [LeaseExpiresAt] = DATEADD(SECOND, @LeaseSeconds, SYSDATETIMEOFFSET()), [LastHeartbeatAt] = SYSDATETIMEOFFSET(), [Progress] = COALESCE(@Progress, [Progress])
    WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueExtendLease] TO [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueSelectLeaseState];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueSelectLeaseState]
    @DeliveryID UNIQUEIDENTIFIER,
    @LeaseToken UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(CASE WHEN [CancelRequestedAt] IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS [CancelRequested]
    FROM [${flyway:defaultSchema}].[WorkQueueDelivery]
    WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight';
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueSelectLeaseState] TO [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueCompleteDelivery];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueCompleteDelivery]
    @DeliveryID UNIQUEIDENTIFIER,
    @LeaseToken UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [Status] = N'Completed', [CompletedAt] = SYSDATETIMEOFFSET(), [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueCompleteDelivery] TO [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueRetryDelivery];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueRetryDelivery]
    @DeliveryID UNIQUEIDENTIFIER,
    @LeaseToken UNIQUEIDENTIFIER,
    @DelaySeconds INT,
    @Error NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [Status] = N'Pending', [VisibleAt] = DATEADD(SECOND, @DelaySeconds, SYSDATETIMEOFFSET()), [LastError] = @Error,
        [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueRetryDelivery] TO [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueDeadLetterDelivery];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueDeadLetterDelivery]
    @DeliveryID UNIQUEIDENTIFIER,
    @LeaseToken UNIQUEIDENTIFIER,
    @Reason NVARCHAR(100),
    @Error NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [Status] = N'DeadLettered', [DeadLetterReason] = @Reason, [DeadLetteredAt] = SYSDATETIMEOFFSET(), [LastError] = COALESCE(@Error, [LastError]),
        [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueDeadLetterDelivery] TO [cdp_Developer], [cdp_Integration];
GO

-- Release on shutdown: back to Pending without consuming the attempt.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueReleaseDelivery];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueReleaseDelivery]
    @DeliveryID UNIQUEIDENTIFIER,
    @LeaseToken UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [Status] = N'Pending', [AttemptCount] = CASE WHEN [AttemptCount] > 0 THEN [AttemptCount] - 1 ELSE 0 END, [VisibleAt] = SYSDATETIMEOFFSET(),
        [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueReleaseDelivery] TO [cdp_Developer], [cdp_Integration];
GO

-- The one holder write allowed after a cancel (F2): token-fenced, requires the flag, discards now so the
-- key frees the moment the handler has stopped.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueAcknowledgeCancel];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueAcknowledgeCancel]
    @DeliveryID UNIQUEIDENTIFIER,
    @LeaseToken UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET(), [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    WHERE [ID] = @DeliveryID AND [LeaseToken] = @LeaseToken AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NOT NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueAcknowledgeCancel] TO [cdp_Developer], [cdp_Integration];
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Operator, sweeper and topology validation (03 §5.2, §7)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Per-status index seeks, never one aggregate over the subscription. BlockedKeys only for Ordered.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueSubscriptionStats];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueSubscriptionStats]
    @SubscriptionID UNIQUEIDENTIFIER,
    @Ordered BIT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM [${flyway:defaultSchema}].[WorkQueueDelivery] p WHERE p.[SubscriptionID] = @SubscriptionID AND p.[Status] = N'Pending') AS [Pending],
        (SELECT COUNT(*) FROM [${flyway:defaultSchema}].[WorkQueueDelivery] f WHERE f.[SubscriptionID] = @SubscriptionID AND f.[Status] = N'InFlight') AS [InFlight],
        (SELECT COUNT(*) FROM [${flyway:defaultSchema}].[WorkQueueDelivery] x WHERE x.[SubscriptionID] = @SubscriptionID AND x.[Status] = N'DeadLettered') AS [DeadLettered],
        CASE WHEN @Ordered = 1 THEN
            (SELECT COUNT(*) FROM [${flyway:defaultSchema}].[WorkQueueDelivery] h
             WHERE h.[SubscriptionID] = @SubscriptionID AND h.[Status] = N'DeadLettered' AND h.[PartitionKey] IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] e
                               WHERE e.[SubscriptionID] = h.[SubscriptionID] AND e.[PartitionKey] = h.[PartitionKey]
                                 AND e.[OrderKey] < h.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')))
        ELSE CAST(NULL AS INT) END AS [BlockedKeys],
        (SELECT DATEDIFF(SECOND, MIN(o.[VisibleAt]), SYSDATETIMEOFFSET()) FROM [${flyway:defaultSchema}].[WorkQueueDelivery] o
         WHERE o.[SubscriptionID] = @SubscriptionID AND o.[Status] = N'Pending') AS [OldestPendingAgeSeconds],
        (SELECT COUNT(*) FROM [${flyway:defaultSchema}].[WorkQueueDelivery] c
         WHERE c.[Status] = N'Completed' AND c.[CompletedAt] >= DATEADD(HOUR, -1, SYSDATETIMEOFFSET()) AND c.[SubscriptionID] = @SubscriptionID) AS [CompletedLastHour];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueSubscriptionStats] TO [cdp_Developer], [cdp_Integration];
GO

-- Keyset page of dead letters by delivery ID, message joined. BlocksKey: an Ordered head.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueListDeadLetters];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueListDeadLetters]
    @SubscriptionID UNIQUEIDENTIFIER,
    @Ordered BIT,
    @AfterDeliveryID UNIQUEIDENTIFIER,
    @PageSize INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@PageSize) d.[ID] AS [DeliveryID], d.[AttemptCount], d.[DeadLetterReason], d.[LastError], d.[DeadLetteredAt],
        d.[PartitionKey] AS [DeliveryPartitionKey],
        CAST(CASE WHEN @Ordered = 1 AND d.[PartitionKey] IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] e
                                   WHERE e.[SubscriptionID] = d.[SubscriptionID] AND e.[PartitionKey] = d.[PartitionKey]
                                     AND e.[OrderKey] < d.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered'))
                  THEN 1 ELSE 0 END AS BIT) AS [BlocksKey],
        m.[ID] AS [MessageID], m.[PartitionKey], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID], m.[PublishedAt]
    FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
    INNER JOIN [${flyway:defaultSchema}].[WorkQueueMessage] m ON m.[ID] = d.[MessageID]
    WHERE d.[SubscriptionID] = @SubscriptionID AND d.[Status] = N'DeadLettered'
      AND (@AfterDeliveryID IS NULL OR d.[ID] > @AfterDeliveryID)
    ORDER BY d.[ID]
    OPTION (RECOMPILE);
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueListDeadLetters] TO [cdp_Developer], [cdp_Integration];
GO

-- Partition conditions derived from the delivery rows alone: InFlight, Blocked (Ordered head is dead-
-- lettered), else Idle. @Condition NULL = every non-Idle key. Keyset by partition key.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueListPartitions];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueListPartitions]
    @SubscriptionID UNIQUEIDENTIFIER,
    @Ordered BIT,
    @Condition NVARCHAR(20),
    @AfterPartitionKey NVARCHAR(200),
    @PageSize INT
AS
BEGIN
    SET NOCOUNT ON;
    WITH [Keys] AS (
        SELECT d.[PartitionKey],
            SUM(CASE WHEN d.[Status] = N'InFlight' THEN 1 ELSE 0 END) AS [InFlightCount],
            SUM(CASE WHEN d.[Status] = N'Pending' THEN 1 ELSE 0 END) AS [WaitingItems],
            MIN(d.[OrderKey]) AS [HeadOrderKey]
        FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
        WHERE d.[SubscriptionID] = @SubscriptionID AND d.[PartitionKey] IS NOT NULL AND d.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')
          AND (@AfterPartitionKey IS NULL OR d.[PartitionKey] > @AfterPartitionKey)
        GROUP BY d.[PartitionKey]
    ), [Shaped] AS (
        SELECT k.[PartitionKey], k.[WaitingItems], h.[ID] AS [HeadDeliveryID],
            CASE WHEN k.[InFlightCount] > 0 THEN N'InFlight'
                 WHEN @Ordered = 1 AND h.[Status] = N'DeadLettered' THEN N'Blocked'
                 ELSE N'Idle' END AS [Condition]
        FROM [Keys] k
        INNER JOIN [${flyway:defaultSchema}].[WorkQueueDelivery] h
            ON h.[SubscriptionID] = @SubscriptionID AND h.[PartitionKey] = k.[PartitionKey] AND h.[OrderKey] = k.[HeadOrderKey]
    )
    SELECT TOP (@PageSize) [PartitionKey], [Condition], [HeadDeliveryID], [WaitingItems]
    FROM [Shaped]
    WHERE (@Condition IS NULL AND [Condition] <> N'Idle') OR [Condition] = @Condition
    ORDER BY [PartitionKey]
    OPTION (RECOMPILE);
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueListPartitions] TO [cdp_Developer], [cdp_Integration];
GO

-- Replay keeps the delivery's OrderKey, so an Ordered head keeps its place.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueReplayDelivery];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueReplayDelivery]
    @SubscriptionID UNIQUEIDENTIFIER,
    @DeliveryID UNIQUEIDENTIFIER,
    @ActorUserID UNIQUEIDENTIFIER,
    @Note NVARCHAR(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [Status] = N'Pending', [AttemptCount] = 0, [IsReplay] = 1, [VisibleAt] = SYSDATETIMEOFFSET(),
        [DeadLetterReason] = NULL, [DeadLetteredAt] = NULL, [ResolvedByUserID] = @ActorUserID, [ResolutionNote] = @Note
    WHERE [ID] = @DeliveryID AND [SubscriptionID] = @SubscriptionID AND [Status] = N'DeadLettered';
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueReplayDelivery] TO [cdp_Developer], [cdp_Integration];
GO

-- Discards a dead letter, or a Pending delivery when @AllowPending = 1. InFlight rows are cancelled
-- through spWorkQueueCancelInFlightDelivery instead.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueDiscardDelivery];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueDiscardDelivery]
    @SubscriptionID UNIQUEIDENTIFIER,
    @DeliveryID UNIQUEIDENTIFIER,
    @AllowPending BIT,
    @ActorUserID UNIQUEIDENTIFIER,
    @Reason NVARCHAR(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET(), [ResolvedByUserID] = @ActorUserID, [ResolutionNote] = @Reason,
        [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    WHERE [ID] = @DeliveryID AND [SubscriptionID] = @SubscriptionID
      AND ([Status] = N'DeadLettered' OR (@AllowPending = 1 AND [Status] = N'Pending'));
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueDiscardDelivery] TO [cdp_Developer], [cdp_Integration];
GO

-- Cancel in flight (F2): stamps CancelRequestedAt and leaves the lease token UNCHANGED so the holder can
-- acknowledge. The row becomes Discarded when the holder acknowledges or when its lease expires.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueCancelInFlightDelivery];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueCancelInFlightDelivery]
    @SubscriptionID UNIQUEIDENTIFIER,
    @DeliveryID UNIQUEIDENTIFIER,
    @ActorUserID UNIQUEIDENTIFIER,
    @Reason NVARCHAR(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET [CancelRequestedAt] = SYSDATETIMEOFFSET(), [ResolvedByUserID] = @ActorUserID, [ResolutionNote] = @Reason
    WHERE [ID] = @DeliveryID AND [SubscriptionID] = @SubscriptionID AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueCancelInFlightDelivery] TO [cdp_Developer], [cdp_Integration];
GO

-- Sweeper-wide expiry using each subscription's own MaxAttempts, in a bounded batch.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueExpireLeasesAll];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueExpireLeasesAll]
    @BatchSize INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Expired TABLE ([ID] UNIQUEIDENTIFIER, [SubscriptionID] UNIQUEIDENTIFIER, [PartitionKey] NVARCHAR(200), [Status] NVARCHAR(20), [DeadLetterReason] NVARCHAR(100));
    UPDATE TOP (@BatchSize) d SET
        [Status] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN N'Discarded'
                        WHEN d.[AttemptCount] >= s.[MaxAttempts] THEN N'DeadLettered' ELSE N'Pending' END,
        [DeadLetterReason] = CASE WHEN d.[CancelRequestedAt] IS NULL AND d.[AttemptCount] >= s.[MaxAttempts] THEN N'LeaseExpired' ELSE d.[DeadLetterReason] END,
        [DeadLetteredAt] = CASE WHEN d.[CancelRequestedAt] IS NULL AND d.[AttemptCount] >= s.[MaxAttempts] THEN SYSDATETIMEOFFSET() ELSE d.[DeadLetteredAt] END,
        [CompletedAt] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE d.[CompletedAt] END,
        [LastError] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN d.[LastError] ELSE N'LeaseExpired' END,
        [VisibleAt] = SYSDATETIMEOFFSET(),
        [LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL
    OUTPUT inserted.[ID], inserted.[SubscriptionID], inserted.[PartitionKey], inserted.[Status], inserted.[DeadLetterReason] INTO @Expired
    FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d
    INNER JOIN [${flyway:defaultSchema}].[WorkQueueSubscription] s ON s.[ID] = d.[SubscriptionID]
    WHERE d.[Status] = N'InFlight' AND d.[LeaseExpiresAt] < SYSDATETIMEOFFSET();
    SELECT [ID] AS [DeliveryID], [SubscriptionID], [PartitionKey], [DeadLetterReason] AS [Reason] FROM @Expired WHERE [Status] = N'DeadLettered';
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueExpireLeasesAll] TO [cdp_Developer], [cdp_Integration];
GO

-- One sweeper at a time (F9): a non-blocking lock owned by the caller's transaction (pooled connections
-- make a session lock unsafe). The transaction is held open by TryAcquireSweepLock until Release().
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueAcquireSweepLock];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueAcquireSweepLock]
    @Resource NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LockResult INT;
    EXEC @LockResult = sp_getapplock @Resource = @Resource, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 0;
    SELECT CAST(CASE WHEN @LockResult >= 0 THEN 1 ELSE 0 END AS BIT) AS [Acquired];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueAcquireSweepLock] TO [cdp_Developer], [cdp_Integration];
GO

-- Database prerequisite (03 §6): the Database transport requires READ_COMMITTED_SNAPSHOT.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueueReadCommittedSnapshotState];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueueReadCommittedSnapshotState]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(is_read_committed_snapshot_on AS BIT) AS [SnapshotOn] FROM sys.databases WHERE name = DB_NAME();
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueueReadCommittedSnapshotState] TO [cdp_Developer], [cdp_Integration];
GO

-- Retention purge of terminal deliveries. The first CompletedAt predicate is sargable on
-- IX_WorkQueueDelivery_Purge (nothing is purgeable before the smallest retention of any topic has
-- passed); the second applies each row's own topic retention.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueuePurgeTerminalDeliveries];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueuePurgeTerminalDeliveries]
    @BatchSize INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE TOP (@BatchSize) d
    FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d WITH (READPAST)
    INNER JOIN [${flyway:defaultSchema}].[WorkQueueSubscription] s ON s.[ID] = d.[SubscriptionID]
    INNER JOIN [${flyway:defaultSchema}].[WorkQueueTopic] t ON t.[ID] = s.[TopicID]
    WHERE d.[Status] IN (N'Completed', N'Discarded')
      AND d.[CompletedAt] < DATEADD(DAY, -(SELECT MIN(mt.[RetentionDays]) FROM [${flyway:defaultSchema}].[WorkQueueTopic] mt), SYSDATETIMEOFFSET())
      AND d.[CompletedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET());
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueuePurgeTerminalDeliveries] TO [cdp_Developer], [cdp_Integration];
GO

-- A message is an orphan once every delivery of it is gone: one IX_WorkQueueMessage_Purge range seek
-- per topic.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spWorkQueuePurgeOrphanMessages];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spWorkQueuePurgeOrphanMessages]
    @BatchSize INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE TOP (@BatchSize) m
    FROM [${flyway:defaultSchema}].[WorkQueueTopic] t
    INNER JOIN [${flyway:defaultSchema}].[WorkQueueMessage] m WITH (READPAST)
        ON m.[TopicID] = t.[ID] AND m.[PublishedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())
    WHERE NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[WorkQueueDelivery] d WHERE d.[MessageID] = m.[ID]);
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spWorkQueuePurgeOrphanMessages] TO [cdp_Developer], [cdp_Integration];
GO
