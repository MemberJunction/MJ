-- Runtime Schema Update (RSU) worker-mode foundation tables (PostgreSQL twin of the SQL Server migration).
--
-- Plain infrastructure tables for the RSU machinery itself — NOT CodeGen'd MJ entities. See the SQL
-- Server migration header for the full rationale. In the default in-process mode nothing reads these
-- tables; behavior is unchanged. Idempotent via CREATE TABLE IF NOT EXISTS.

CREATE SCHEMA IF NOT EXISTS __mj;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── RSUJob: the durable job queue claimed by the worker (or executed in-process) ──────────────────
CREATE TABLE IF NOT EXISTS __mj."RSUJob"
(
    "ID"                UUID            NOT NULL DEFAULT gen_random_uuid(),
    "Status"            VARCHAR(20)     NOT NULL DEFAULT 'Pending',
    "InputJSON"         TEXT            NULL,
    "RequestedByUserID" UUID            NULL,
    "Priority"          INTEGER         NOT NULL DEFAULT 0,
    "CreatedAt"         TIMESTAMPTZ     NOT NULL DEFAULT now(),
    "ClaimedBy"         VARCHAR(200)    NULL,
    "ClaimedAt"         TIMESTAMPTZ     NULL,
    "HeartbeatAt"       TIMESTAMPTZ     NULL,
    "StartedAt"         TIMESTAMPTZ     NULL,
    "CompletedAt"       TIMESTAMPTZ     NULL,
    "CurrentStepName"   VARCHAR(100)    NULL,
    "StepIndex"         INTEGER         NULL,
    "StepTotal"         INTEGER         NULL,
    "StepsJSON"         TEXT            NULL,
    "ResultJSON"        TEXT            NULL,
    "ErrorMessage"      TEXT            NULL,
    "ErrorStep"         VARCHAR(100)    NULL,
    CONSTRAINT "PK_RSUJob" PRIMARY KEY ("ID"),
    CONSTRAINT "CK_RSUJob_Status" CHECK ("Status" IN ('Pending','Claimed','Running','Succeeded','Failed','Cancelled'))
);
CREATE INDEX IF NOT EXISTS "IX_RSUJob_Status_CreatedAt" ON __mj."RSUJob" ("Status", "CreatedAt");

-- ── RSUSchemaState: single-row fleet schema-generation counter ────────────────────────────────────
CREATE TABLE IF NOT EXISTS __mj."RSUSchemaState"
(
    "ID"          INTEGER       NOT NULL DEFAULT 1,
    "Generation"  INTEGER       NOT NULL DEFAULT 0,
    "LastJobID"   UUID          NULL,
    "MJVersion"   VARCHAR(50)   NULL,
    "SchemaHash"  VARCHAR(128)  NULL,
    "UpdatedAt"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT "PK_RSUSchemaState" PRIMARY KEY ("ID"),
    CONSTRAINT "CK_RSUSchemaState_Singleton" CHECK ("ID" = 1)
);
INSERT INTO __mj."RSUSchemaState" ("ID", "Generation")
VALUES (1, 0)
ON CONFLICT ("ID") DO NOTHING;

-- ── RSUPendingWork: durable post-restart work, claimed atomically by exactly one replica ──────────
CREATE TABLE IF NOT EXISTS __mj."RSUPendingWork"
(
    "ID"          UUID          NOT NULL DEFAULT gen_random_uuid(),
    "JobID"       UUID          NULL,
    "PayloadJSON" TEXT          NOT NULL,
    "Status"      VARCHAR(20)   NOT NULL DEFAULT 'Pending',
    "ClaimedBy"   VARCHAR(200)  NULL,
    "ClaimedAt"   TIMESTAMPTZ   NULL,
    "CreatedAt"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT "PK_RSUPendingWork" PRIMARY KEY ("ID"),
    CONSTRAINT "CK_RSUPendingWork_Status" CHECK ("Status" IN ('Pending','Claimed','Done'))
);

-- ── RSUAdditionalSchemaInfo: single-row durable soft-PK/FK document ────────────────────────────────
CREATE TABLE IF NOT EXISTS __mj."RSUAdditionalSchemaInfo"
(
    "ID"             INTEGER       NOT NULL DEFAULT 1,
    "ContentJSON"    TEXT          NULL,
    "UpdatedByJobID" UUID          NULL,
    "UpdatedAt"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT "PK_RSUAdditionalSchemaInfo" PRIMARY KEY ("ID"),
    CONSTRAINT "CK_RSUAdditionalSchemaInfo_Singleton" CHECK ("ID" = 1)
);
