-- Adds a liveness heartbeat column to AIAgentRun so a watchdog can distinguish a
-- run whose owning process is alive and working from one whose process died (restart,
-- crash, OOM) or whose terminal-state write failed. A run proves liveness by beating;
-- a stale heartbeat is what makes a Running run safe to force-fail, which is correct
-- regardless of how many MJAPI instances are running (no blanket "fail all Running").
--
-- Written and compared on the DB clock (GETUTCDATE) by the runtime, never process time,
-- so heartbeats from different instances behind a load balancer can't disagree.

ALTER TABLE ${flyway:defaultSchema}.AIAgentRun ADD
    LastHeartbeatAt DATETIMEOFFSET NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent liveness heartbeat written by the owning process while this run is in progress. Used by the agent-run watchdog to detect runs orphaned by a process restart/crash or a failed terminal-state write: a Running row whose LastHeartbeatAt has gone stale (or is NULL with an old StartedAt) is force-failed. Always stamped on the database clock (GETUTCDATE), never process time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'LastHeartbeatAt';
