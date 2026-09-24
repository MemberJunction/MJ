-- Least-privilege identity for an external autoscaler (KEDA / ACA job scale rules).
-- Grants SELECT on the two work-queue tables the scaler query reads, and nothing else.
--
-- SQL Server (on-premises / VM / Managed Instance) — run in the MJ database:
--   sqlcmd -S <server> -d <database> -v Schema="__mj" Password="<strong-password>" -i scripts/work-queue-scaler-login.sql
-- The schema is a sqlcmd variable: pass the MJ core schema of YOUR installation (mj.config.cjs → mjCoreSchema).
--
-- Azure SQL Database: CREATE LOGIN is only valid in the master database. Use a CONTAINED user instead — comment out
-- the CREATE LOGIN / CREATE USER ... FOR LOGIN pair below and run, in the MJ database:
--   CREATE USER mj_workqueue_scaler WITH PASSWORD = '$(Password)';
CREATE LOGIN mj_workqueue_scaler WITH PASSWORD = '$(Password)';
GO
CREATE USER mj_workqueue_scaler FOR LOGIN mj_workqueue_scaler;
GO
GRANT SELECT ON OBJECT::[$(Schema)].WorkQueueDelivery TO mj_workqueue_scaler;
GRANT SELECT ON OBJECT::[$(Schema)].WorkQueueSubscription TO mj_workqueue_scaler;
GO

-- PostgreSQL equivalent (replace <schema> and the password):
-- CREATE ROLE mj_workqueue_scaler LOGIN PASSWORD '<strong-password>';
-- GRANT USAGE ON SCHEMA <schema> TO mj_workqueue_scaler;
-- GRANT SELECT ON <schema>."WorkQueueDelivery", <schema>."WorkQueueSubscription" TO mj_workqueue_scaler;

-- ----------------------------------------------------------------------------------------------------------------
-- The scaler query this login exists for (plans/work-queue-1/05 Task 5; plan 06's runbook must use THIS query).
-- One SELECT, no MJ code in the loop, parameterised by subscription name. It counts claimable Pending AND InFlight:
-- scalers subtract running executions from the metric, so a Pending-only count stops new workers starting while a
-- backlog drains. Each half stops at 1000 (no autoscaler needs more than maxReplicas × target), walks an index in
-- order, and needs READ_COMMITTED_SNAPSHOT so it never blocks behind writers. A Paused/Disabled subscription reports
-- only its InFlight rows; a blocked Ordered key contributes nothing because its waiting rows are not heads. For
-- Exclusive subscriptions this counts rows, not distinct keys, so it can overcount: a container that starts and
-- claims nothing exits 0 in seconds. Prefer WorkQueue.GetBacklog (plan 06) where the scaler can call an API.
--
-- SELECT
--     (SELECT COUNT(*) FROM (
--         SELECT TOP (1000) 1 AS x
--         FROM __mj.WorkQueueDelivery d
--         INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
--         WHERE s.Name = @SubscriptionName AND s.Status = 'Active'
--           AND d.Status = 'Pending' AND d.VisibleAt <= SYSDATETIMEOFFSET()
--           AND (d.PartitionKey IS NULL
--                OR (NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery f
--                                WHERE f.SubscriptionID = d.SubscriptionID AND f.PartitionKey = d.PartitionKey AND f.Status = 'InFlight')
--                    AND (s.PartitionMode <> 'Ordered'
--                         OR NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery e
--                                        WHERE e.SubscriptionID = d.SubscriptionID AND e.PartitionKey = d.PartitionKey
--                                          AND e.OrderKey < d.OrderKey AND e.Status IN ('Pending', 'InFlight', 'DeadLettered')))))
--      ) claimable)
--   + (SELECT COUNT(*) FROM (
--         SELECT TOP (1000) 1 AS x
--         FROM __mj.WorkQueueDelivery d
--         INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
--         WHERE s.Name = @SubscriptionName AND d.Status = 'InFlight'
--      ) inflight) AS Backlog;
--
-- PostgreSQL form: replace SYSDATETIMEOFFSET() with now(), quote identifiers ("__mj"."WorkQueueDelivery", d."Status" …),
-- drop TOP (1000) and end each inner SELECT with LIMIT 1000.
-- ----------------------------------------------------------------------------------------------------------------
