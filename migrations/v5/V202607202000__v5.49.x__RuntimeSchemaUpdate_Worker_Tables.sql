-- Runtime Schema Update (RSU) worker-mode foundation tables (SQL Server).
--
-- These are PLAIN infrastructure tables for the RSU machinery itself — NOT CodeGen'd MJ entities.
-- RSU must not depend on entity metadata for its own bookkeeping (it runs to CHANGE that metadata),
-- so these are hand-authored and carry their own timestamps. They are created here so the optional
-- out-of-process RSU worker (RSU_MODE=worker) has a durable job queue, a fleet schema-generation
-- signal, a database-backed pending-work store, and a database-backed additionalSchemaInfo document.
-- In the default in-process mode nothing reads these tables; behavior is unchanged.
--
-- Idempotent (IF NOT EXISTS): the RSU runtime also creates some of its bookkeeping tables ad-hoc, and
-- a fresh install may re-run cleanly, so every CREATE is guarded.

-- ── RSUJob: the durable job queue claimed by the worker (or executed in-process) ──────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'RSUJob')
CREATE TABLE ${flyway:defaultSchema}.RSUJob (
    ID              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    Status          NVARCHAR(20)        NOT NULL DEFAULT 'Pending',
    InputJSON       NVARCHAR(MAX)       NULL,
    RequestedByUserID UNIQUEIDENTIFIER  NULL,
    Priority        INT                 NOT NULL DEFAULT 0,
    CreatedAt       DATETIMEOFFSET      NOT NULL DEFAULT SYSUTCDATETIME(),
    ClaimedBy       NVARCHAR(200)       NULL,
    ClaimedAt       DATETIMEOFFSET      NULL,
    HeartbeatAt     DATETIMEOFFSET      NULL,
    StartedAt       DATETIMEOFFSET      NULL,
    CompletedAt     DATETIMEOFFSET      NULL,
    CurrentStepName NVARCHAR(100)       NULL,
    StepIndex       INT                 NULL,
    StepTotal       INT                 NULL,
    StepsJSON       NVARCHAR(MAX)       NULL,
    ResultJSON      NVARCHAR(MAX)       NULL,
    ErrorMessage    NVARCHAR(MAX)       NULL,
    ErrorStep       NVARCHAR(100)       NULL,
    CONSTRAINT PK_RSUJob PRIMARY KEY (ID),
    CONSTRAINT CK_RSUJob_Status CHECK (Status IN ('Pending','Claimed','Running','Succeeded','Failed','Cancelled'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RSUJob_Status_CreatedAt'
               AND object_id = OBJECT_ID('${flyway:defaultSchema}.RSUJob'))
CREATE INDEX IX_RSUJob_Status_CreatedAt ON ${flyway:defaultSchema}.RSUJob (Status, CreatedAt);
GO

-- ── RSUSchemaState: single-row fleet schema-generation counter ────────────────────────────────────
-- Bumped by the worker after a successful codegen+compile; each MJAPI replica watches it and
-- self-restarts on a change so it reloads the regenerated schema.
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'RSUSchemaState')
CREATE TABLE ${flyway:defaultSchema}.RSUSchemaState (
    ID          INT                 NOT NULL DEFAULT 1,
    Generation  INT                 NOT NULL DEFAULT 0,
    LastJobID   UNIQUEIDENTIFIER    NULL,
    MJVersion   NVARCHAR(50)        NULL,
    SchemaHash  NVARCHAR(128)       NULL,
    UpdatedAt   DATETIMEOFFSET      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_RSUSchemaState PRIMARY KEY (ID),
    CONSTRAINT CK_RSUSchemaState_Singleton CHECK (ID = 1)
);
GO
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.RSUSchemaState WHERE ID = 1)
INSERT INTO ${flyway:defaultSchema}.RSUSchemaState (ID, Generation) VALUES (1, 0);
GO

-- ── RSUPendingWork: durable post-restart work, claimed atomically by exactly one replica ──────────
-- Replaces the on-disk .rsu_pending store in worker/fleet mode (the file store remains the default
-- in in-process mode).
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'RSUPendingWork')
CREATE TABLE ${flyway:defaultSchema}.RSUPendingWork (
    ID          UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(),
    JobID       UNIQUEIDENTIFIER    NULL,
    PayloadJSON NVARCHAR(MAX)       NOT NULL,
    Status      NVARCHAR(20)        NOT NULL DEFAULT 'Pending',
    ClaimedBy   NVARCHAR(200)       NULL,
    ClaimedAt   DATETIMEOFFSET      NULL,
    CreatedAt   DATETIMEOFFSET      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_RSUPendingWork PRIMARY KEY (ID),
    CONSTRAINT CK_RSUPendingWork_Status CHECK (Status IN ('Pending','Claimed','Done'))
);
GO

-- ── RSUAdditionalSchemaInfo: single-row durable soft-PK/FK document ────────────────────────────────
-- The write-through source of truth for additionalSchemaInfo.json, so a serving container that
-- regenerates code at boot can materialize the file from the DB (rather than depending on an
-- ephemeral filesystem written by a different process).
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
               WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'RSUAdditionalSchemaInfo')
CREATE TABLE ${flyway:defaultSchema}.RSUAdditionalSchemaInfo (
    ID              INT             NOT NULL DEFAULT 1,
    ContentJSON     NVARCHAR(MAX)   NULL,
    UpdatedByJobID  UNIQUEIDENTIFIER NULL,
    UpdatedAt       DATETIMEOFFSET  NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_RSUAdditionalSchemaInfo PRIMARY KEY (ID),
    CONSTRAINT CK_RSUAdditionalSchemaInfo_Singleton CHECK (ID = 1)
);
GO
