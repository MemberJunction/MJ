-- Least-privilege identity for an external autoscaler (KEDA / ACA job scale rules).
-- Grants SELECT on the two work-queue tables the scaler query reads, and nothing else. The bounded scaler query
-- itself (claimable Pending + InFlight, capped at 1000 per half) is in packages/WorkQueue/engine/README.md under
-- "Container-job workers", next to the KEDA / Azure Container Apps recipe that uses it.
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
