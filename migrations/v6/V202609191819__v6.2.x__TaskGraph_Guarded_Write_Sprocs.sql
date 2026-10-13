-- Task-graph claim protocol: dedicated guarded stored procedures (#4575).
--
-- WHY THIS EXISTS. `TaskClaimStore` issued every one of its guarded writes as raw SQL against the
-- BASE TABLES `Task` and `AIAgentRun`. MJ grants its runtime roles SELECT on views and EXECUTE on
-- stored procedures and never table-level DML, so under a least-privilege cdp_* login every claim
-- was refused — and the refusal was swallowed and read as "another instance won the race", so the
-- dispatcher skipped every task forever. Nothing was ever claimed on such an install.
--
-- This is the same defect, and the same remedy, as the agent-run watchdog in v5.39
-- (V202606040230__v5.39.x__AgentRunWatchdog_Maintenance_Sprocs.sql), the scheduling engine's lock
-- sprocs (V202606022336__v5.39.x__Scheduling_Engine_Atomic_Sprocs.sql), and durable sync runs in
-- v6.1 (V202608140100__v6.1.x__Durable_Sync_Runs.sql). Those three already do what this one does;
-- the task-graph store was the odd one out.
--
-- WHAT IS PRESERVED. Each procedure is the guarded statement it replaces, verbatim:
--   * ONE conditional statement whose @@ROWCOUNT is the arbitration signal — never read-then-write,
--     so two instances can never both win. The count is returned as [AffectedRows].
--   * ONE clock. Every lease comparison reads SYSUTCDATETIME() on both sides. A lease written from
--     one host's clock and judged against another's turns ordinary NTP skew into premature
--     reclamation (the task runs twice) or a lease that outlives its worker.
--   * The exact predicates. A transition that guarded on ClaimedBy=@me still does; the Task table
--     stays user-writable (D20), so those guards are what stop a stale executor overwriting a
--     reassignment.
--
-- NO DYNAMIC SQL, DELIBERATELY. Ownership chaining gives EXECUTE-only callers access to the tables
-- these procedures touch — but only for static statements. `sp_executesql` inside a procedure breaks
-- the chain and would re-require the table grant this migration exists to remove, or an
-- `EXECUTE AS OWNER` escalation. Every statement below is static; the one procedure that needs a
-- variable number of JSON writes loops in T-SQL under a row lock instead.
--
-- GRANTS. cdp_Developer and cdp_Integration, matching what CodeGen grants on the Task entity's own
-- CRUD procedures. Deliberately NOT cdp_UI: the Task entity gives UI read-only access, and the
-- dispatcher is server-side. The watchdog's procs include cdp_UI because AIAgentRun's permissions
-- do; following the entity's permissions is the rule, not the specific role list.

-- A procedure bakes in the QUOTED_IDENTIFIER / ANSI_NULLS settings active when CREATE PROCEDURE
-- runs. These procedures use JSON functions and Task carries filtered indexes, both of which
-- require QUOTED_IDENTIFIER ON — set explicitly so they are created correctly regardless of the
-- applying tool's connection defaults.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Claim protocol
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Claim one task. The Status='Pending' predicate is the whole contract: a task another instance
-- already moved to 'In Progress' fails it and yields rowcount 0. The ClaimedBy/ClaimExpiresAt arm
-- additionally lets an expired claim be taken over without waiting for a reconciliation pass.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphClaimTask];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphClaimTask]
    @TaskID UNIQUEIDENTIFIER,
    @ClaimedBy NVARCHAR(100),
    @ClaimTTLSeconds INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [Status] = 'In Progress',
        [ClaimedBy] = @ClaimedBy,
        [ClaimExpiresAt] = DATEADD(SECOND, @ClaimTTLSeconds, SYSUTCDATETIME()),
        [StartedAt] = SYSUTCDATETIME()
    WHERE [ID] = @TaskID
      AND [Status] = 'Pending'
      AND ([ClaimedBy] IS NULL
           OR [ClaimExpiresAt] IS NULL
           OR [ClaimExpiresAt] < SYSUTCDATETIME());
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphClaimTask] TO [cdp_Developer], [cdp_Integration];
GO

-- Extend this instance's claim on a task it is actively running. Guarded on ClaimedBy=@me so a
-- heartbeat can never resurrect a claim reconciliation already released.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphHeartbeat];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphHeartbeat]
    @TaskID UNIQUEIDENTIFIER,
    @ClaimedBy NVARCHAR(100),
    @ClaimTTLSeconds INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [ClaimExpiresAt] = DATEADD(SECOND, @ClaimTTLSeconds, SYSUTCDATETIME())
    WHERE [ID] = @TaskID
      AND [ClaimedBy] = @ClaimedBy
      AND [Status] = 'In Progress';
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphHeartbeat] TO [cdp_Developer], [cdp_Integration];
GO

-- Record a terminal outcome and release the claim in one guarded statement. Guarded on both
-- Status='In Progress' and ClaimedBy=@me, so a task cancelled or reassigned while running fails the
-- predicate rather than having the newer decision overwritten.
--
-- @SetConfiguration separates "write NULL" from "leave alone": a step whose run produced no runtime
-- artefacts must not have its authored configuration blanked as a side effect of finishing.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphCompleteClaimed];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphCompleteClaimed]
    @TaskID UNIQUEIDENTIFIER,
    @ClaimedBy NVARCHAR(100),
    @Status NVARCHAR(50),
    @OutputPayload NVARCHAR(MAX),
    @ErrorMessage NVARCHAR(MAX),
    @AgentRunID UNIQUEIDENTIFIER,
    @Configuration NVARCHAR(MAX),
    @SetConfiguration BIT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [Status] = @Status,
        [CompletedAt] = SYSUTCDATETIME(),
        [PercentComplete] = CASE WHEN @Status = 'Complete' THEN 100 ELSE 0 END,
        -- Released in the same atomic write: a separate release could be interrupted, leaving a
        -- terminal task holding a claim the sweep would then flag.
        [ClaimedBy] = NULL,
        [ClaimExpiresAt] = NULL,
        [OutputPayload] = @OutputPayload,
        [ErrorMessage] = @ErrorMessage,
        [AgentRunID] = @AgentRunID,
        [Configuration] = CASE WHEN @SetConfiguration = 1 THEN @Configuration ELSE [Configuration] END
    WHERE [ID] = @TaskID
      AND [Status] = 'In Progress'
      AND [ClaimedBy] = @ClaimedBy;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphCompleteClaimed] TO [cdp_Developer], [cdp_Integration];
GO

-- Return lapsed claims to Pending so any instance can pick them up.
--
-- @TaskIDs is the candidate set the caller just read, as a JSON array. Scoping by id rather than by
-- re-stating "a dispatcher completes this task" keeps that definition in ONE place — the
-- `task-predicates` module, which exists because the predicate had been written four different ways
-- and a Prompt step fell through every one of them. The lease predicate IS restated here, because
-- that is the part that must be evaluated at write time: a claim refreshed between the read and this
-- statement is correctly skipped.
--
-- OUTPUT ... INTO a table variable rather than a bare OUTPUT clause: Task carries an update trigger,
-- and SQL Server refuses a bare OUTPUT on a table with triggers. Returning the released ids (rather
-- than a count) also lets the caller name exactly which tasks it reclaimed.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphReleaseExpiredClaims];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphReleaseExpiredClaims]
    @TaskIDs NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Released TABLE ([ID] UNIQUEIDENTIFIER);

    UPDATE t
    SET [Status] = 'Pending',
        [ClaimedBy] = NULL,
        [ClaimExpiresAt] = NULL
    OUTPUT INSERTED.[ID] INTO @Released
    FROM [${flyway:defaultSchema}].[Task] t
    INNER JOIN OPENJSON(@TaskIDs) ids ON t.[ID] = CAST(ids.[value] AS UNIQUEIDENTIFIER)
    WHERE t.[Status] = 'In Progress'
      AND t.[ClaimedBy] IS NOT NULL
      AND t.[ClaimExpiresAt] IS NOT NULL
      AND t.[ClaimExpiresAt] < SYSUTCDATETIME();

    SELECT [ID] FROM @Released;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphReleaseExpiredClaims] TO [cdp_Developer], [cdp_Integration];
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Graph parent lifecycle
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Settle a graph parent, and only if it is not already terminal. The terminal list is
-- TERMINAL_TASK_GRAPH_STATUSES in ai-core-plus; a unit test pins this literal against it, because
-- two lists that must agree is how a graph becomes invisible to the machinery meant to rescue it.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphSettleParent];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphSettleParent]
    @ParentTaskID UNIQUEIDENTIFIER,
    @Status NVARCHAR(50),
    @PercentComplete INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [Status] = @Status,
        [PercentComplete] = @PercentComplete,
        [CompletedAt] = SYSUTCDATETIME()
    WHERE [ID] = @ParentTaskID
      AND [Status] NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked');
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphSettleParent] TO [cdp_Developer], [cdp_Integration];
GO

-- Progress-only write. Separate from settling on purpose: settling is a once-only transition that
-- stamps CompletedAt, and handing a terminal status to this one is a compile error on the caller.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphUpdateParentProgress];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphUpdateParentProgress]
    @ParentTaskID UNIQUEIDENTIFIER,
    @Status NVARCHAR(50),
    @PercentComplete INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [Status] = @Status,
        [PercentComplete] = @PercentComplete
    WHERE [ID] = @ParentTaskID
      AND [Status] NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked');
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphUpdateParentProgress] TO [cdp_Developer], [cdp_Integration];
GO

-- Stamp the graph's start once. Guarded on StartedAt IS NULL so the first writer wins and a later
-- pass cannot move the graph's start time forward.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphStampParentStart];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphStampParentStart]
    @ParentTaskID UNIQUEIDENTIFIER,
    @StartedAt DATETIMEOFFSET
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [StartedAt] = @StartedAt
    WHERE [ID] = @ParentTaskID
      AND [StartedAt] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphStampParentStart] TO [cdp_Developer], [cdp_Integration];
GO

-- Cancel a task that has not already settled.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphCancelTask];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphCancelTask]
    @TaskID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [Status] = 'Cancelled'
    WHERE [ID] = @TaskID
      AND [Status] NOT IN ('Complete','Failed','Cancelled','Skipped','Blocked');
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphCancelTask] TO [cdp_Developer], [cdp_Integration];
GO

-- Skip a task that has not started. Type-guarded so a graph verb can never touch a row outside the
-- workflow substrate.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphSkipPending];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphSkipPending]
    @TaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [Status] = 'Skipped'
    WHERE [ID] = @TaskID
      AND [TypeID] = @TaskTypeID
      AND [Status] = 'Pending';
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphSkipPending] TO [cdp_Developer], [cdp_Integration];
GO

-- Mark a human task as notified, once. ClaimedBy doubles as the notification marker for human tasks,
-- and the IS NULL guard is what makes the notification exactly-once across instances.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphMarkHumanNotified];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphMarkHumanNotified]
    @TaskID UNIQUEIDENTIFIER,
    @Marker NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [ClaimedBy] = @Marker
    WHERE [ID] = @TaskID
      AND [Status] = 'Pending'
      AND [ClaimedBy] IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphMarkHumanNotified] TO [cdp_Developer], [cdp_Integration];
GO

-- Write the graph's output payload.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphSetParentOutput];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphSetParentOutput]
    @ParentTaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER,
    @OutputPayload NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [OutputPayload] = @OutputPayload
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphSetParentOutput] TO [cdp_Developer], [cdp_Integration];
GO

-- Replace a task's input payload before it runs (the debugger's edit-input verb). Status-guarded so
-- an edit cannot land on a task that has already started.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphUpdateInputPayload];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphUpdateInputPayload]
    @TaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER,
    @InputPayload NVARCHAR(MAX),
    @ExpectedStatus NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [InputPayload] = @InputPayload
    WHERE [ID] = @TaskID
      AND [TypeID] = @TaskTypeID
      AND [Status] = @ExpectedStatus;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphUpdateInputPayload] TO [cdp_Developer], [cdp_Integration];
GO

-- Force a task complete (the debugger's force-complete verb). Refuses a LIVE claim — an executor
-- holding an unexpired lease is still running, and completing underneath it would attribute its work
-- to a decision it never made.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphForceComplete];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphForceComplete]
    @TaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER,
    @OutputPayload NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [Status] = 'Complete',
        [OutputPayload] = @OutputPayload,
        [ErrorMessage] = NULL,
        [CompletedAt] = SYSUTCDATETIME(),
        [PercentComplete] = 100,
        [ClaimedBy] = NULL,
        [ClaimExpiresAt] = NULL
    WHERE [ID] = @TaskID
      AND [TypeID] = @TaskTypeID
      AND ([Status] IN ('Pending','Failed','Blocked')
           OR ([Status] = 'In Progress'
               AND ([ClaimExpiresAt] IS NULL
                    OR [ClaimExpiresAt] < SYSUTCDATETIME())));
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphForceComplete] TO [cdp_Developer], [cdp_Integration];
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Graph payload markers (JSON)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Claim the right to deliver a graph's continuation, exactly once. Delivery is at-least-once by
-- nature, so the marker is claimed BEFORE delivery: the worst case becomes a missed notification
-- that shows in the record as delivered, rather than a reinvoke loop that bills a fresh agent turn
-- on every reconciliation sweep, forever.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphClaimContinuation];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphClaimContinuation]
    @ParentTaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER,
    @DeliveredAs NVARCHAR(50),
    @DeliveredAt NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [InputPayload] = JSON_MODIFY(
            JSON_MODIFY([InputPayload], '$.continuationDeliveredAt', @DeliveredAt),
            '$.continuationDeliveredAs', @DeliveredAs)
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID
      AND ISJSON([InputPayload]) = 1
      AND JSON_VALUE([InputPayload], '$.continuationDeliveredAt') IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphClaimContinuation] TO [cdp_Developer], [cdp_Integration];
GO

-- Declare a graph finished early (every remaining node unreachable), once.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphDeclareEarlyFinish];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphDeclareEarlyFinish]
    @ParentTaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER,
    @FinishedAt NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [InputPayload] = JSON_MODIFY([InputPayload], '$.earlyFinishedAt', @FinishedAt)
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID
      AND ISJSON([InputPayload]) = 1
      AND JSON_VALUE([InputPayload], '$.earlyFinishedAt') IS NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphDeclareEarlyFinish] TO [cdp_Developer], [cdp_Integration];
GO

-- Drop the whole debug bag (leaving a debug session).
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphClearDebugState];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphClearDebugState]
    @ParentTaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [InputPayload] = JSON_MODIFY([InputPayload], '$.debug', NULL)
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID
      AND ISJSON([InputPayload]) = 1;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphClearDebugState] TO [cdp_Developer], [cdp_Integration];
GO

-- Consume the single-step allowance, exactly once. This is the CAS that stops one press of Step
-- releasing two waves.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphConsumeStepMarker];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphConsumeStepMarker]
    @ParentTaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [InputPayload] = JSON_MODIFY([InputPayload], '$.debug.step', NULL)
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID
      AND ISJSON([InputPayload]) = 1
      AND JSON_VALUE([InputPayload], '$.debug.step') IS NOT NULL;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphConsumeStepMarker] TO [cdp_Developer], [cdp_Integration];
GO

-- Pause a graph at a breakpoint, once. Guarded on "not already paused" so the first dispatcher to
-- reach the breakpoint owns the pause and a second cannot rewrite why it paused.
--
-- `$.debug` is created first when absent: JSON_MODIFY does not create intermediate objects, so
-- writing '$.debug.paused' into a payload without a `debug` object is silently a no-op.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphPauseAtBreakpoint];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphPauseAtBreakpoint]
    @ParentTaskID UNIQUEIDENTIFIER,
    @BreakpointTaskID NVARCHAR(100),
    @TaskTypeID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[Task]
    SET [InputPayload] = JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(
            CASE WHEN JSON_QUERY([InputPayload], '$.debug') IS NULL
                 THEN JSON_MODIFY([InputPayload], '$.debug', JSON_QUERY('{}'))
                 ELSE [InputPayload] END,
            '$.debug.paused', CAST(1 AS BIT)),
            '$.debug.pausedReason', 'breakpoint'),
            '$.debug.pausedAtTaskID', @BreakpointTaskID)
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID
      AND ISJSON([InputPayload]) = 1
      AND (JSON_VALUE([InputPayload], '$.debug.paused') IS NULL
           OR JSON_VALUE([InputPayload], '$.debug.paused') = 'false');
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphPauseAtBreakpoint] TO [cdp_Developer], [cdp_Integration];
GO

-- Write named fields of the debug bag, leaving every other field alone.
--
-- FIELD-SCOPED, NOT A BAG REWRITE. A verb that reads the bag, merges its change and writes the whole
-- thing back puts back whatever the fields it does NOT own held at read time. The sharp case is the
-- step allowance: if the dispatcher consumes it between a SetBreakpoints read and its write, the
-- rewrite RESURRECTS the consumed allowance and one press of Step releases two waves.
--
-- WHY THIS ONE IS A LOOP AND NOT ONE STATEMENT. The number of fields is decided by the caller, and
-- nesting a variable number of JSON_MODIFY calls needs either dynamic SQL (which breaks ownership
-- chaining — see the header) or an exponential CASE expansion. So the read and the write are wrapped
-- in a transaction and the row is taken with UPDLOCK, HOLDLOCK: any concurrent writer to the same row
-- blocks on that lock instead of interleaving, which gives the same no-lost-update guarantee the
-- single statement had. The lock covers one row and is held for microseconds.
--
-- @Containers are the object paths that must exist first, computed by the caller (ContainingPaths).
-- @Fields is [{Path, Kind, Value}] with Kind in (null|bool|string|json) — the Kind decides the JSON
-- type written, because a boolean stored as the string "true" reads back as truthy-but-wrong.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphWriteDebugFields];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphWriteDebugFields]
    @ParentTaskID UNIQUEIDENTIFIER,
    @TaskTypeID UNIQUEIDENTIFIER,
    @Containers NVARCHAR(MAX),
    @Fields NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Payload NVARCHAR(MAX);
    DECLARE @Affected INT = 0;

    BEGIN TRANSACTION;

    SELECT @Payload = [InputPayload]
    FROM [${flyway:defaultSchema}].[Task] WITH (UPDLOCK, HOLDLOCK)
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID
      AND ISJSON([InputPayload]) = 1;

    IF @Payload IS NULL
    BEGIN
        COMMIT TRANSACTION;
        SELECT 0 AS [AffectedRows];
        RETURN;
    END

    DECLARE @i INT = 0;
    DECLARE @n INT = (SELECT COUNT(*) FROM OPENJSON(@Containers));
    DECLARE @Path NVARCHAR(400);

    WHILE @i < @n
    BEGIN
        SELECT @Path = c.[value] FROM OPENJSON(@Containers) c WHERE c.[key] = @i;
        IF JSON_QUERY(@Payload, @Path) IS NULL
            SET @Payload = JSON_MODIFY(@Payload, @Path, JSON_QUERY('{}'));
        SET @i = @i + 1;
    END

    DECLARE @Kind NVARCHAR(20), @TextValue NVARCHAR(MAX), @JsonValue NVARCHAR(MAX);
    SET @i = 0;
    SET @n = (SELECT COUNT(*) FROM OPENJSON(@Fields));

    WHILE @i < @n
    BEGIN
        SELECT @Path = JSON_VALUE(f.[value], '$.Path'),
               @Kind = JSON_VALUE(f.[value], '$.Kind'),
               @TextValue = JSON_VALUE(f.[value], '$.Value'),
               @JsonValue = JSON_QUERY(f.[value], '$.Value')
        FROM OPENJSON(@Fields) f
        WHERE f.[key] = @i;

        -- NULL in lax mode DELETES the key, which is what "this verb cleared it" means.
        IF @Kind = 'null'   SET @Payload = JSON_MODIFY(@Payload, @Path, NULL);
        IF @Kind = 'bool'   SET @Payload = JSON_MODIFY(@Payload, @Path, CAST(CASE WHEN @TextValue = 'true' THEN 1 ELSE 0 END AS BIT));
        IF @Kind = 'string' SET @Payload = JSON_MODIFY(@Payload, @Path, @TextValue);
        -- JSON_QUERY keeps objects and arrays as JSON rather than storing them as a string.
        IF @Kind = 'json'   SET @Payload = JSON_MODIFY(@Payload, @Path, JSON_QUERY(@JsonValue));

        SET @i = @i + 1;
    END

    UPDATE [${flyway:defaultSchema}].[Task]
    SET [InputPayload] = @Payload
    WHERE [ID] = @ParentTaskID
      AND [TypeID] = @TaskTypeID;
    SET @Affected = @@ROWCOUNT;

    COMMIT TRANSACTION;
    SELECT @Affected AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphWriteDebugFields] TO [cdp_Developer], [cdp_Integration];
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Submitting agent run
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Credit a settled graph's cost back to the run that submitted it — those four columns and no
-- others. The full-row Save() this replaces could revert a peer's settle: instance B's rollup, loaded
-- before A settled the run, would write Paused back over A's Completed along with every other column
-- it had read.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphSetRunCostRollup];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphSetRunCostRollup]
    @AgentRunID UNIQUEIDENTIFIER,
    @TotalCostRollup DECIMAL(19, 8),
    @TotalTokensUsedRollup INT,
    @TotalPromptTokensUsedRollup INT,
    @TotalCompletionTokensUsedRollup INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun]
    SET [TotalCostRollup] = @TotalCostRollup,
        [TotalTokensUsedRollup] = @TotalTokensUsedRollup,
        [TotalPromptTokensUsedRollup] = @TotalPromptTokensUsedRollup,
        [TotalCompletionTokensUsedRollup] = @TotalCompletionTokensUsedRollup
    WHERE [ID] = @AgentRunID;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphSetRunCostRollup] TO [cdp_Developer], [cdp_Integration];
GO

-- Complete the run that parked on this graph, guarded on it still being parked. A run already
-- Completed, Failed or Cancelled is left exactly as it is.
--
-- The error message APPENDS rather than replaces: a run that parked with a warning and then failed
-- for a second reason should carry both.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spTaskGraphSettleRun];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spTaskGraphSettleRun]
    @AgentRunID UNIQUEIDENTIFIER,
    @Succeeded BIT,
    @ErrorMessage NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun]
    SET [Status] = CASE WHEN @Succeeded = 1 THEN 'Completed' ELSE 'Failed' END,
        [Success] = @Succeeded,
        [CompletedAt] = SYSUTCDATETIME(),
        [ErrorMessage] = CASE
            WHEN @ErrorMessage IS NULL THEN [ErrorMessage]
            ELSE CONCAT(COALESCE([ErrorMessage] + CHAR(10) + CHAR(10), ''), @ErrorMessage)
        END
    WHERE [ID] = @AgentRunID
      AND [Status] = 'Paused';
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spTaskGraphSettleRun] TO [cdp_Developer], [cdp_Integration];
GO
