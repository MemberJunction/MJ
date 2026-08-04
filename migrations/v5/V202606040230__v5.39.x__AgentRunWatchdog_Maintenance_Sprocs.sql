-- Agent-run watchdog: dedicated maintenance stored procedures.
--
-- Review feedback (PR #2744): the runtime DB user (cdp_Integration / cdp_UI / cdp_Developer)
-- has rights on the base VIEWS and STORED PROCEDURES, never the base TABLES. The watchdog's
-- original direct `UPDATE __mj.AIAgentRun ...` / `SELECT ... FROM __mj.AIAgentRun` would fail
-- outside the CodeGen user. These three dedicated sprocs (granted to the runtime roles, like
-- the generated CRUD procs) replace that direct table access while preserving the watchdog's
-- guarantees:
--   * spSweepStaleAIAgentRuns  — keeps the sweep a SINGLE set-based, atomic statement, so the
--       "never fail a run another healthy instance is still heart-beating" property holds
--       (a per-row spUpdate loop would re-introduce that race).
--   * spStampAIAgentRunHeartbeat / spCancelAIAgentRun — narrow, single-row writes guarded by
--       `Status = 'Running'`, on the DB clock (GETUTCDATE), never process time.
-- The watchdog's SELECTs move to the base view (vwAIAgentRuns) in code.

-- A stored procedure bakes in the QUOTED_IDENTIFIER / ANSI_NULLS settings active when CREATE
-- PROCEDURE runs. AIAgentRun has a filtered index, so these MUST be ON or the procs' UPDATEs
-- fail at runtime (Msg 1934). Set them explicitly so the procs are created correctly regardless
-- of the applying tool's connection defaults; the settings persist across the GO batches below.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- Heartbeat: stamp liveness for one in-flight run. Touches only LastHeartbeatAt, and only while
-- the run is still Running, so it can never disturb a terminal state the agent just wrote.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spStampAIAgentRunHeartbeat];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spStampAIAgentRunHeartbeat]
    @AgentRunID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun]
    SET [LastHeartbeatAt] = GETUTCDATE()
    WHERE [ID] = @AgentRunID AND [Status] = 'Running';
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spStampAIAgentRunHeartbeat] TO [cdp_Integration], [cdp_UI], [cdp_Developer];
GO

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- Sweep: force-fail every Running run whose heartbeat has gone stale (or that never beat and
-- was started long ago). ONE atomic UPDATE — the predicate is re-evaluated at write time, so a
-- run being heart-beaten by its healthy owner can't be caught mid-sweep. Returns the count.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spSweepStaleAIAgentRuns];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spSweepStaleAIAgentRuns]
    @StaleThresholdMinutes INT = 5
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @cutoff DATETIMEOFFSET = DATEADD(MINUTE, -@StaleThresholdMinutes, GETUTCDATE());
    UPDATE [${flyway:defaultSchema}].[AIAgentRun]
    SET [Status] = 'Failed',
        [CompletedAt] = GETUTCDATE(),
        [ErrorMessage] = COALESCE([ErrorMessage],
            CONCAT('[watchdog] Run force-failed: no liveness heartbeat for over ',
                   @StaleThresholdMinutes, ' minute(s) (owning process presumed dead)'))
    WHERE [Status] = 'Running'
      AND ([LastHeartbeatAt] < @cutoff OR ([LastHeartbeatAt] IS NULL AND [StartedAt] < @cutoff));
    SELECT @@ROWCOUNT AS [RunsFailed];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spSweepStaleAIAgentRuns] TO [cdp_Integration], [cdp_UI], [cdp_Developer];
GO

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- Graceful shutdown: cancel one run this process owns, only if it's still Running (so a run that
-- completed in the same instant isn't clobbered). Closes the deploy case without waiting for staleness.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCancelAIAgentRun];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spCancelAIAgentRun]
    @AgentRunID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun]
    SET [Status] = 'Cancelled',
        [CompletedAt] = GETUTCDATE(),
        [ErrorMessage] = COALESCE([ErrorMessage], '[watchdog] Run orphaned by graceful process shutdown')
    WHERE [ID] = @AgentRunID AND [Status] = 'Running';
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCancelAIAgentRun] TO [cdp_Integration], [cdp_UI], [cdp_Developer];
GO
