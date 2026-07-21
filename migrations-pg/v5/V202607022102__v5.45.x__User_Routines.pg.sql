-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607022102__v5.45.x__User_Routines.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================= */
/* User Routines (P1.5 of the Conversations Phase 1 plan) — schema */
/* ============================================================================= */
/* Users define routines that run an Agent, Action, or Prompt on a cron */
/* schedule (RoutineType='Scheduled') or watch for result changes */
/* (RoutineType='Monitoring', OnChange via result hashing). A single admin */
/* "User Routine Dispatcher" Scheduled Job (seeded via metadata, not SQL) */
/* claims due routines and executes them with bounded concurrency, recording */
/* each execution in UserRoutineRun and notifying the owner + recipients per */
/* NotifyCondition (in-app and/or email). Realtime agents are not valid */
/* targets (interactive-only); single-step Proxy agents are. */
/* DDL originates from the reviewed Conversations Mega Phase 1 consolidated */
/* migration (PR #2953), carved out here as its own 5.45 migration — the same */
/* pattern used for Skills & Plan Mode. One addition beyond that spec: */
/* UserRoutine.RequestedSkillIDs, which lets a routine pre-activate AI Skills */
/* for its target agent on every run (5.45 skills-framework synergy). */
/* Post-review refinements: StartAt/EndAt activation window; recipient Sequence; */
/* NotificationTemplateID (MJ Template-driven notifications, seeded default); */
/* run telemetry via linkage only (AgentRunID/PromptRunID/ActionExecutionLogID */
/* — no duplicated TokensUsed/Cost columns). */
/* Row-level owner access, the dispatcher job, entity permissions, and the */
/* Routines app metadata are configured via metadata sync in the code phase — */
/* never in this migration. */
/* ============================================================================= */
/* ============================================================================ */
/* 1. UserRoutine  ("MJ: User Routines") */
/* ============================================================================ */
CREATE TABLE __mj."UserRoutine" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "UserID" UUID NOT NULL,
  "EnvironmentID" UUID NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_UserRoutine_Status" DEFAULT (
    'Active'
  ),
  "RoutineType" VARCHAR(20) NOT NULL CONSTRAINT "DF_UserRoutine_RoutineType" DEFAULT (
    'Scheduled'
  ),
  "TargetType" VARCHAR(20) NOT NULL,
  "TargetID" UUID NOT NULL,
  "InitialMessage" TEXT NULL,
  "StartingPayload" TEXT NULL,
  "RequestedSkillIDs" TEXT NULL,
  "CronExpression" VARCHAR(100) NOT NULL,
  "StartAt" TIMESTAMPTZ NULL,
  "EndAt" TIMESTAMPTZ NULL,
  "NotificationTemplateID" UUID NULL,
  "Timezone" VARCHAR(100) NOT NULL CONSTRAINT "DF_UserRoutine_Timezone" DEFAULT (
    'UTC'
  ),
  "NextRunAt" TIMESTAMPTZ NULL,
  "LastRunAt" TIMESTAMPTZ NULL,
  "LastRunStatus" VARCHAR(20) NULL,
  "LastResultHash" VARCHAR(100) NULL,
  "NotifyCondition" VARCHAR(20) NOT NULL CONSTRAINT "DF_UserRoutine_NotifyCondition" DEFAULT (
    'Always'
  ),
  "NotifyViaInApp" BOOLEAN NOT NULL CONSTRAINT "DF_UserRoutine_NotifyViaInApp" DEFAULT TRUE,
  "NotifyViaEmail" BOOLEAN NOT NULL CONSTRAINT "DF_UserRoutine_NotifyViaEmail" DEFAULT FALSE,
  CONSTRAINT "PK_UserRoutine" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_UserRoutine_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_UserRoutine_Environment" FOREIGN KEY ("EnvironmentID") REFERENCES __mj."Environment" (
    "ID"
  ),
  CONSTRAINT "FK_UserRoutine_NotificationTemplate" FOREIGN KEY ("NotificationTemplateID") REFERENCES __mj."Template" (
    "ID"
  ),
  CONSTRAINT "CK_UserRoutine_Status" CHECK ("Status" IN ('Active', 'Paused', 'Disabled')),
  CONSTRAINT "CK_UserRoutine_RoutineType" CHECK ("RoutineType" IN ('Scheduled', 'Monitoring')),
  CONSTRAINT "CK_UserRoutine_TargetType" CHECK ("TargetType" IN ('Agent', 'Action', 'Prompt')),
  CONSTRAINT "CK_UserRoutine_LastRunStatus" CHECK ("LastRunStatus" IN ('Success', 'Failed', 'Running', 'Skipped')),
  CONSTRAINT "CK_UserRoutine_NotifyCondition" CHECK ("NotifyCondition" IN ('Always', 'OnSuccess', 'OnFailure', 'OnChange'))
);

COMMENT ON COLUMN __mj."UserRoutine"."UserID" IS 'Owner of the routine. Routines are private to their owner (row-level access).';

COMMENT ON COLUMN __mj."UserRoutine"."EnvironmentID" IS 'Optional environment scope for the routine.';

COMMENT ON COLUMN __mj."UserRoutine"."Name" IS 'User-facing routine name.';

COMMENT ON COLUMN __mj."UserRoutine"."Description" IS 'Optional description of what the routine does.';

COMMENT ON COLUMN __mj."UserRoutine"."Status" IS 'Lifecycle status: Active (eligible to run), Paused (temporarily off), Disabled (off).';

COMMENT ON COLUMN __mj."UserRoutine"."RoutineType" IS 'Scheduled (always notify per NotifyCondition) or Monitoring (intended for OnChange detection via result hashing).';

COMMENT ON COLUMN __mj."UserRoutine"."TargetType" IS 'What kind of target this routine runs: Agent, Action, or Prompt. Determines how TargetID is interpreted.';

COMMENT ON COLUMN __mj."UserRoutine"."TargetID" IS 'Polymorphic reference resolved by TargetType (AIAgent.ID, Action.ID, or AIPrompt.ID). No FK because the target table varies.';

COMMENT ON COLUMN __mj."UserRoutine"."InitialMessage" IS 'For Agent targets, the user message sent to the agent on each run.';

COMMENT ON COLUMN __mj."UserRoutine"."StartingPayload" IS 'Optional JSON starting payload passed to the target on each run.';

COMMENT ON COLUMN __mj."UserRoutine"."RequestedSkillIDs" IS 'Optional JSON array of MJ: AI Skills IDs to pre-activate when the routine target is an Agent — threaded as ExecuteAgentParams.requestedSkillIDs so the agent starts each scheduled run with the requested skills'' instructions and tools in effect (subject to all availability gates; ActivationMode does not gate this explicit-request path). Ignored for Action/Prompt targets.';

COMMENT ON COLUMN __mj."UserRoutine"."CronExpression" IS 'Standard cron expression evaluated by the dispatcher to determine when the routine is due.';

COMMENT ON COLUMN __mj."UserRoutine"."StartAt" IS 'Optional activation window start. An Active routine does not run before this time; once current time passes StartAt the dispatcher begins scheduling it. NULL = eligible immediately.';

COMMENT ON COLUMN __mj."UserRoutine"."EndAt" IS 'Optional activation window end. An Active routine stops running once current time passes EndAt — automatic sunset without changing Status. NULL = no end.';

COMMENT ON COLUMN __mj."UserRoutine"."NotificationTemplateID" IS 'Optional MJ Template used to render routine notifications from the runs output data (result summary, status, target info) via the standard MJ templating architecture. When NULL, the system default routine-notification template (seeded via metadata, resolvable per instance — not hardcoded) is used.';

COMMENT ON COLUMN __mj."UserRoutine"."Timezone" IS 'IANA timezone used when evaluating CronExpression (e.g. America/Chicago).';

COMMENT ON COLUMN __mj."UserRoutine"."NextRunAt" IS 'Next scheduled run time, computed after each run.';

COMMENT ON COLUMN __mj."UserRoutine"."LastRunAt" IS 'Timestamp of the most recent run.';

COMMENT ON COLUMN __mj."UserRoutine"."LastRunStatus" IS 'Outcome of the most recent run.';

COMMENT ON COLUMN __mj."UserRoutine"."LastResultHash" IS 'Hash of the most recent result, used by Monitoring routines to detect change for OnChange notifications.';

COMMENT ON COLUMN __mj."UserRoutine"."NotifyCondition" IS 'When to notify: Always, OnSuccess, OnFailure, or OnChange (result differs from prior run).';

COMMENT ON COLUMN __mj."UserRoutine"."NotifyViaInApp" IS 'Deliver notifications via in-app notification.';

COMMENT ON COLUMN __mj."UserRoutine"."NotifyViaEmail" IS 'Deliver notifications via email.';

/* ============================================================================ */
/* 2. UserRoutineRecipient  ("MJ: User Routine Recipients") */
/* ============================================================================ */
CREATE TABLE __mj."UserRoutineRecipient" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "RoutineID" UUID NOT NULL,
  "UserID" UUID NULL,
  "Email" VARCHAR(255) NULL,
  "Channel" VARCHAR(20) NOT NULL CONSTRAINT "DF_UserRoutineRecipient_Channel" DEFAULT (
    'InApp'
  ),
  "Sequence" INT NOT NULL CONSTRAINT "DF_UserRoutineRecipient_Sequence" DEFAULT (
    0
  ),
  CONSTRAINT "PK_UserRoutineRecipient" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_UserRoutineRecipient_Routine" FOREIGN KEY ("RoutineID") REFERENCES __mj."UserRoutine" (
    "ID"
  ),
  CONSTRAINT "FK_UserRoutineRecipient_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "CK_UserRoutineRecipient_Channel" CHECK ("Channel" IN ('InApp', 'Email'))
);

COMMENT ON COLUMN __mj."UserRoutineRecipient"."RoutineID" IS 'Routine this recipient belongs to.';

COMMENT ON COLUMN __mj."UserRoutineRecipient"."UserID" IS 'Internal MJ user recipient (when notifying an existing user). Either UserID or Email is set.';

COMMENT ON COLUMN __mj."UserRoutineRecipient"."Email" IS 'External email recipient (when notifying a non-user). Either UserID or Email is set.';

COMMENT ON COLUMN __mj."UserRoutineRecipient"."Channel" IS 'Delivery channel for this recipient: InApp or Email.';

COMMENT ON COLUMN __mj."UserRoutineRecipient"."Sequence" IS 'Explicit display/notification ordering of recipients within a routine (ascending).';

/* ============================================================================ */
/* 3. UserRoutineRun  ("MJ: User Routine Runs") */
/* ============================================================================ */
CREATE TABLE __mj."UserRoutineRun" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "RoutineID" UUID NOT NULL,
  "StartedAt" TIMESTAMPTZ NOT NULL CONSTRAINT "DF_UserRoutineRun_StartedAt" DEFAULT (
    NOW()
  ),
  "CompletedAt" TIMESTAMPTZ NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_UserRoutineRun_Status" DEFAULT (
    'Running'
  ),
  "AgentRunID" UUID NULL,
  "PromptRunID" UUID NULL,
  "ActionExecutionLogID" UUID NULL,
  "ResultSummary" TEXT NULL,
  "ResultHash" VARCHAR(100) NULL,
  "NotificationSent" BOOLEAN NOT NULL CONSTRAINT "DF_UserRoutineRun_NotificationSent" DEFAULT FALSE,
  "ErrorMessage" TEXT NULL,
  CONSTRAINT "PK_UserRoutineRun" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_UserRoutineRun_Routine" FOREIGN KEY ("RoutineID") REFERENCES __mj."UserRoutine" (
    "ID"
  ),
  CONSTRAINT "FK_UserRoutineRun_AgentRun" FOREIGN KEY ("AgentRunID") REFERENCES __mj."AIAgentRun" (
    "ID"
  ),
  CONSTRAINT "FK_UserRoutineRun_PromptRun" FOREIGN KEY ("PromptRunID") REFERENCES __mj."AIPromptRun" (
    "ID"
  ),
  CONSTRAINT "FK_UserRoutineRun_ActionExecutionLog" FOREIGN KEY ("ActionExecutionLogID") REFERENCES __mj."ActionExecutionLog" (
    "ID"
  ),
  CONSTRAINT "CK_UserRoutineRun_Status" CHECK ("Status" IN ('Running', 'Success', 'Failed', 'Skipped'))
);

COMMENT ON COLUMN __mj."UserRoutineRun"."RoutineID" IS 'Routine this run belongs to.';

COMMENT ON COLUMN __mj."UserRoutineRun"."StartedAt" IS 'When the run started.';

COMMENT ON COLUMN __mj."UserRoutineRun"."CompletedAt" IS 'When the run completed (null while running).';

COMMENT ON COLUMN __mj."UserRoutineRun"."Status" IS 'Run outcome.';

COMMENT ON COLUMN __mj."UserRoutineRun"."AgentRunID" IS 'Linked AI Agent Run when the routine target is an agent.';

COMMENT ON COLUMN __mj."UserRoutineRun"."PromptRunID" IS 'For Prompt targets, links to the MJ: AI Prompt Runs record for this execution — tokens, cost, and full telemetry live there (never duplicated here).';

COMMENT ON COLUMN __mj."UserRoutineRun"."ActionExecutionLogID" IS 'For Action targets, links to the MJ: Action Execution Logs record for this execution — params, results, and telemetry live there (never duplicated here).';

COMMENT ON COLUMN __mj."UserRoutineRun"."ResultSummary" IS 'Human-readable summary of the run result.';

COMMENT ON COLUMN __mj."UserRoutineRun"."ResultHash" IS 'Hash of the result, compared against the routine LastResultHash for OnChange detection.';

COMMENT ON COLUMN __mj."UserRoutineRun"."NotificationSent" IS 'Whether a notification was dispatched for this run.';

COMMENT ON COLUMN __mj."UserRoutineRun"."ErrorMessage" IS 'Error detail when Status is Failed.';

/* ============================================================================= */
/* ============================================================================= */
/* ============================================================================= */
/*                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️ */
/* Everything below this block was generated by the MemberJunction CodeGen tool */
/* against a VIRGIN database built by replaying ALL migrations including the */
/* hand-written DDL above — so the EntityField/metadata UUIDs below are the */
/* canonical ones every instance replaying this file will carry. */
/* It contains the framework plumbing for the new tables: EntityField metadata */
/* inserts, base views, stored procedures (spCreate/spUpdate/spDelete), */
/* permission grants, and related sp_addextendedproperty calls. */
/* DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run this */
/* full drop-DB/replay/codegen cycle and replace this entire section. */
/* ============================================================================= */
/* ============================================================================= */
/* ============================================================================= */
/* SQL generated to create new entity MJ: User Routines */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd6ca6018-d288-4f79-b6a9-168c75c3363b',
    'MJ: User Routines',
    'User Routines',
    NULL,
    NULL,
    'UserRoutine',
    'vwUserRoutines',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: User Routines to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'd6ca6018-d288-4f79-b6a9-168c75c3363b',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routines for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd6ca6018-d288-4f79-b6a9-168c75c3363b',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routines for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd6ca6018-d288-4f79-b6a9-168c75c3363b',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routines for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd6ca6018-d288-4f79-b6a9-168c75c3363b',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: User Routine Recipients */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '90dffdea-6ff8-4721-8730-25ce51209a4b',
    'MJ: User Routine Recipients',
    'User Routine Recipients',
    NULL,
    NULL,
    'UserRoutineRecipient',
    'vwUserRoutineRecipients',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: User Routine Recipients to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '90dffdea-6ff8-4721-8730-25ce51209a4b',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routine Recipients for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '90dffdea-6ff8-4721-8730-25ce51209a4b',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routine Recipients for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '90dffdea-6ff8-4721-8730-25ce51209a4b',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routine Recipients for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '90dffdea-6ff8-4721-8730-25ce51209a4b',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: User Routine Runs */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '149a0274-47e7-4aae-a64c-77b9f7d0873e',
    'MJ: User Routine Runs',
    'User Routine Runs',
    NULL,
    NULL,
    'UserRoutineRun',
    'vwUserRoutineRuns',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: User Routine Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '149a0274-47e7-4aae-a64c-77b9f7d0873e',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routine Runs for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '149a0274-47e7-4aae-a64c-77b9f7d0873e',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routine Runs for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '149a0274-47e7-4aae-a64c-77b9f7d0873e',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: User Routine Runs for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '149a0274-47e7-4aae-a64c-77b9f7d0873e',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."UserRoutine"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.UserRoutine */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.UserRoutine */
UPDATE __mj."UserRoutine" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'UserRoutine' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."UserRoutine" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."UserRoutine" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."UserRoutine"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.UserRoutine */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.UserRoutine */
UPDATE __mj."UserRoutine" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'UserRoutine' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."UserRoutine" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."UserRoutine" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."UserRoutineRecipient"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.UserRoutineRecipient */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.UserRoutineRecipient */
UPDATE __mj."UserRoutineRecipient" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'UserRoutineRecipient' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."UserRoutineRecipient" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."UserRoutineRecipient" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."UserRoutineRecipient"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.UserRoutineRecipient */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.UserRoutineRecipient */
UPDATE __mj."UserRoutineRecipient" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'UserRoutineRecipient' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."UserRoutineRecipient" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."UserRoutineRecipient" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."UserRoutineRun"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.UserRoutineRun */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.UserRoutineRun */
UPDATE __mj."UserRoutineRun" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'UserRoutineRun' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."UserRoutineRun" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."UserRoutineRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."UserRoutineRun"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.UserRoutineRun */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.UserRoutineRun */
UPDATE __mj."UserRoutineRun" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'UserRoutineRun' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."UserRoutineRun" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."UserRoutineRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2d1e15ba-591d-4c2f-aadb-88563c71a074' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2d1e15ba-591d-4c2f-aadb-88563c71a074', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0e2528d-3e0c-4d07-97cd-d2a5f2e18e69' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0e2528d-3e0c-4d07-97cd-d2a5f2e18e69', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100002, 'UserID', 'User ID', 'Owner of the routine. Routines are private to their owner (row-level access).', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '584ba54a-84d9-4e76-bf64-b42fb707a171' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'EnvironmentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('584ba54a-84d9-4e76-bf64-b42fb707a171', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100003, 'EnvironmentID', 'Environment ID', 'Optional environment scope for the routine.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '72975471-6AAB-45C6-B58A-3F1115C921C3', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '76d890c2-2cf1-482d-9823-111ff82b1589' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('76d890c2-2cf1-482d-9823-111ff82b1589', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100004, 'Name', 'Name', 'User-facing routine name.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ccb724b-9b32-408c-8d00-82d64fdf9a76' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ccb724b-9b32-408c-8d00-82d64fdf9a76', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100005, 'Description', 'Description', 'Optional description of what the routine does.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8dd8f51d-92c3-4c2e-8c3f-949f281865c0' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8dd8f51d-92c3-4c2e-8c3f-949f281865c0', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100006, 'Status', 'Status', 'Lifecycle status: Active (eligible to run), Paused (temporarily off), Disabled (off).', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2644d5fa-e13f-4ccd-8c0f-582a223d6790' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'RoutineType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2644d5fa-e13f-4ccd-8c0f-582a223d6790', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100007, 'RoutineType', 'Routine Type', 'Scheduled (always notify per NotifyCondition) or Monitoring (intended for OnChange detection via result hashing).', 'nvarchar', 40, 0, 0, FALSE, 'Scheduled', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c773e487-81c6-445f-b1f9-b63922334059' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'TargetType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c773e487-81c6-445f-b1f9-b63922334059', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100008, 'TargetType', 'Target Type', 'What kind of target this routine runs: Agent, Action, or Prompt. Determines how TargetID is interpreted.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'abf830ca-1f2c-4121-8ed7-637003b1bb38' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'TargetID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('abf830ca-1f2c-4121-8ed7-637003b1bb38', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100009, 'TargetID', 'Target ID', 'Polymorphic reference resolved by TargetType (AIAgent.ID, Action.ID, or AIPrompt.ID). No FK because the target table varies.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '712470d0-f60a-4dea-8eb4-03adb363ba91' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'InitialMessage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('712470d0-f60a-4dea-8eb4-03adb363ba91', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100010, 'InitialMessage', 'Initial Message', 'For Agent targets, the user message sent to the agent on each run.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4af3b243-4d7f-415e-a291-153b52409481' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'StartingPayload')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4af3b243-4d7f-415e-a291-153b52409481', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100011, 'StartingPayload', 'Starting Payload', 'Optional JSON starting payload passed to the target on each run.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '202535d1-3e71-488e-ad20-4bf7bb994981' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'RequestedSkillIDs')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('202535d1-3e71-488e-ad20-4bf7bb994981', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100012, 'RequestedSkillIDs', 'Requested Skill I Ds', 'Optional JSON array of MJ: AI Skills IDs to pre-activate when the routine target is an Agent — threaded as ExecuteAgentParams.requestedSkillIDs so the agent starts each scheduled run with the requested skills'' instructions and tools in effect (subject to all availability gates; ActivationMode does not gate this explicit-request path). Ignored for Action/Prompt targets.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '505fb83a-e8f6-4c69-819b-a6777b4aaa4f' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'CronExpression')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('505fb83a-e8f6-4c69-819b-a6777b4aaa4f', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100013, 'CronExpression', 'Cron Expression', 'Standard cron expression evaluated by the dispatcher to determine when the routine is due.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dee9ad88-b7d4-431c-8c89-4d4f6223421d' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'StartAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dee9ad88-b7d4-431c-8c89-4d4f6223421d', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100014, 'StartAt', 'Start At', 'Optional activation window start. An Active routine does not run before this time; once current time passes StartAt the dispatcher begins scheduling it. NULL = eligible immediately.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c8b92bf-5ea8-41bf-be21-c89375d907bf' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'EndAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0c8b92bf-5ea8-41bf-be21-c89375d907bf', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100015, 'EndAt', 'End At', 'Optional activation window end. An Active routine stops running once current time passes EndAt — automatic sunset without changing Status. NULL = no end.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2ec50fb2-b62b-4c11-ab77-f282df8f6c8a' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'NotificationTemplateID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2ec50fb2-b62b-4c11-ab77-f282df8f6c8a', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100016, 'NotificationTemplateID', 'Notification Template ID', 'Optional MJ Template used to render routine notifications from the runs output data (result summary, status, target info) via the standard MJ templating architecture. When NULL, the system default routine-notification template (seeded via metadata, resolvable per instance — not hardcoded) is used.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '48248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd906a039-f1a4-4b29-867a-421f3d0844e2' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'Timezone')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d906a039-f1a4-4b29-867a-421f3d0844e2', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100017, 'Timezone', 'Timezone', 'IANA timezone used when evaluating CronExpression (e.g. America/Chicago).', 'nvarchar', 200, 0, 0, FALSE, 'UTC', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '46977ed9-eb0d-47b3-9cfc-1c51d537512d' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'NextRunAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('46977ed9-eb0d-47b3-9cfc-1c51d537512d', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100018, 'NextRunAt', 'Next Run At', 'Next scheduled run time, computed after each run.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ba45a96e-d80e-410b-b112-499d08aa0a92' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'LastRunAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ba45a96e-d80e-410b-b112-499d08aa0a92', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100019, 'LastRunAt', 'Last Run At', 'Timestamp of the most recent run.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '91598c2c-8f06-4e78-b775-cdb329ceb384' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'LastRunStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('91598c2c-8f06-4e78-b775-cdb329ceb384', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100020, 'LastRunStatus', 'Last Run Status', 'Outcome of the most recent run.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ea37bd4-db55-4ba1-b036-746cfef901de' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'LastResultHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ea37bd4-db55-4ba1-b036-746cfef901de', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100021, 'LastResultHash', 'Last Result Hash', 'Hash of the most recent result, used by Monitoring routines to detect change for OnChange notifications.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad8301a7-a0ad-469c-91d6-30a876b61561' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'NotifyCondition')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad8301a7-a0ad-469c-91d6-30a876b61561', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100022, 'NotifyCondition', 'Notify Condition', 'When to notify: Always, OnSuccess, OnFailure, or OnChange (result differs from prior run).', 'nvarchar', 40, 0, 0, FALSE, 'Always', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'acdad567-0dc5-4732-89ff-4628b20b8a74' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'NotifyViaInApp')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('acdad567-0dc5-4732-89ff-4628b20b8a74', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100023, 'NotifyViaInApp', 'Notify Via In App', 'Deliver notifications via in-app notification.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8c70528-e866-48fa-8be2-d03279431403' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'NotifyViaEmail')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b8c70528-e866-48fa-8be2-d03279431403', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100024, 'NotifyViaEmail', 'Notify Via Email', 'Deliver notifications via email.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '306f503e-b801-4544-90dd-a94993f2f5d7' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('306f503e-b801-4544-90dd-a94993f2f5d7', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100025, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '38b3aab9-0b7b-4cc8-8a96-3b0ba93918b9' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('38b3aab9-0b7b-4cc8-8a96-3b0ba93918b9', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100026, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e455b5b-c101-45b9-bd72-509675c5ea9b' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7e455b5b-c101-45b9-bd72-509675c5ea9b', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7a02cbb-97c8-4f58-b49e-b9d9702f2e6a' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'RoutineID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a7a02cbb-97c8-4f58-b49e-b9d9702f2e6a', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100002, 'RoutineID', 'Routine ID', 'Routine this recipient belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce13e21c-e76b-40ab-8718-0fae9dd1d965' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ce13e21c-e76b-40ab-8718-0fae9dd1d965', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100003, 'UserID', 'User ID', 'Internal MJ user recipient (when notifying an existing user). Either UserID or Email is set.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5eabb901-cb44-4c9a-9fae-4679f58d19bd' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'Email')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5eabb901-cb44-4c9a-9fae-4679f58d19bd', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100004, 'Email', 'Email', 'External email recipient (when notifying a non-user). Either UserID or Email is set.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd0731edd-711c-466c-9a91-cbf587d300aa' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'Channel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d0731edd-711c-466c-9a91-cbf587d300aa', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100005, 'Channel', 'Channel', 'Delivery channel for this recipient: InApp or Email.', 'nvarchar', 40, 0, 0, FALSE, 'InApp', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e188cce7-fb74-4482-9cb4-f65a7b5bf2ff' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e188cce7-fb74-4482-9cb4-f65a7b5bf2ff', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100006, 'Sequence', 'Sequence', 'Explicit display/notification ordering of recipients within a routine (ascending).', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '723018c4-1e60-4622-a02f-8d85d32c6ab0' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('723018c4-1e60-4622-a02f-8d85d32c6ab0', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a35c1721-aa88-4cc4-af8d-88b8969d5423' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a35c1721-aa88-4cc4-af8d-88b8969d5423', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ba7133a2-39bc-4c11-9697-1f2442394c6c' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ba7133a2-39bc-4c11-9697-1f2442394c6c', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e9a8f03-958f-4c17-8493-1a95e097d602' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'RoutineID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e9a8f03-958f-4c17-8493-1a95e097d602', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100002, 'RoutineID', 'Routine ID', 'Routine this run belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '991a9918-ae4b-4c3d-83a1-84c4cff3b4f9' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('991a9918-ae4b-4c3d-83a1-84c4cff3b4f9', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100003, 'StartedAt', 'Started At', 'When the run started.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5bc895d7-72fc-49f0-b68e-de2fa9a53e7e' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'CompletedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5bc895d7-72fc-49f0-b68e-de2fa9a53e7e', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100004, 'CompletedAt', 'Completed At', 'When the run completed (null while running).', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b04e3f1e-d7c8-43ea-8c30-655e9405bd27' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b04e3f1e-d7c8-43ea-8c30-655e9405bd27', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100005, 'Status', 'Status', 'Run outcome.', 'nvarchar', 40, 0, 0, FALSE, 'Running', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63f5317b-ae27-42eb-b3a6-2125e96b7e71' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'AgentRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('63f5317b-ae27-42eb-b3a6-2125e96b7e71', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100006, 'AgentRunID', 'Agent Run ID', 'Linked AI Agent Run when the routine target is an agent.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b71d5eb5-3348-4382-9578-24c6d027b4d8' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'PromptRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b71d5eb5-3348-4382-9578-24c6d027b4d8', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100007, 'PromptRunID', 'Prompt Run ID', 'For Prompt targets, links to the MJ: AI Prompt Runs record for this execution — tokens, cost, and full telemetry live there (never duplicated here).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eedb54cc-1a36-40a7-8a9d-b4426587d197' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'ActionExecutionLogID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eedb54cc-1a36-40a7-8a9d-b4426587d197', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100008, 'ActionExecutionLogID', 'Action Execution Log ID', 'For Action targets, links to the MJ: Action Execution Logs record for this execution — params, results, and telemetry live there (never duplicated here).', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dd9c6f60-0d84-40c4-b8c2-d6abf45f9e16' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'ResultSummary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dd9c6f60-0d84-40c4-b8c2-d6abf45f9e16', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100009, 'ResultSummary', 'Result Summary', 'Human-readable summary of the run result.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e54429e3-0861-4532-801d-286675875682' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'ResultHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e54429e3-0861-4532-801d-286675875682', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100010, 'ResultHash', 'Result Hash', 'Hash of the result, compared against the routine LastResultHash for OnChange detection.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2783a568-f159-4681-b6c3-f693c6987872' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'NotificationSent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2783a568-f159-4681-b6c3-f693c6987872', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100011, 'NotificationSent', 'Notification Sent', 'Whether a notification was dispatched for this run.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a37fda9c-9f40-4e66-82cb-ad5f4a2f441f' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'ErrorMessage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a37fda9c-9f40-4e66-82cb-ad5f4a2f441f', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100012, 'ErrorMessage', 'Error Message', 'Error detail when Status is Failed.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4258725e-c8da-4317-82ff-d3fd29ebdccb' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4258725e-c8da-4317-82ff-d3fd29ebdccb', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100013, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7743d3f3-e760-4153-ab41-576ced757db8' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7743d3f3-e760-4153-ab41-576ced757db8', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100014, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 409bd1f9-e6e5-4f84-aed1-d513084e6326 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '409bd1f9-e6e5-4f84-aed1-d513084e6326',
    '8DD8F51D-92C3-4C2E-8C3F-949F281865C0',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 31987685-6c09-430b-9667-38f71260e592 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '31987685-6c09-430b-9667-38f71260e592',
    '8DD8F51D-92C3-4C2E-8C3F-949F281865C0',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 715e1bc3-fff7-4233-9180-d8c55ebc5544 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '715e1bc3-fff7-4233-9180-d8c55ebc5544',
    '8DD8F51D-92C3-4C2E-8C3F-949F281865C0',
    3,
    'Paused',
    'Paused',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 8DD8F51D-92C3-4C2E-8C3F-949F281865C0 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0';
/* SQL text to insert entity field value with ID 8077c277-68ba-45c6-b9c2-bcbb70710eeb */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8077c277-68ba-45c6-b9c2-bcbb70710eeb',
    '2644D5FA-E13F-4CCD-8C0F-582A223D6790',
    1,
    'Monitoring',
    'Monitoring',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6e618abd-dd66-4c80-ba30-889cc2095ea9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6e618abd-dd66-4c80-ba30-889cc2095ea9',
    '2644D5FA-E13F-4CCD-8C0F-582A223D6790',
    2,
    'Scheduled',
    'Scheduled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2644D5FA-E13F-4CCD-8C0F-582A223D6790 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2644D5FA-E13F-4CCD-8C0F-582A223D6790';
/* SQL text to insert entity field value with ID b4a55e1a-b7e6-44a1-beca-199b3dccf4a8 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b4a55e1a-b7e6-44a1-beca-199b3dccf4a8',
    'C773E487-81C6-445F-B1F9-B63922334059',
    1,
    'Action',
    'Action',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ff9c5f9b-3415-44ca-885f-a4469de22021 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ff9c5f9b-3415-44ca-885f-a4469de22021',
    'C773E487-81C6-445F-B1F9-B63922334059',
    2,
    'Agent',
    'Agent',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 18d9041c-4185-4db2-91cb-4ab9d620d5c5 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '18d9041c-4185-4db2-91cb-4ab9d620d5c5',
    'C773E487-81C6-445F-B1F9-B63922334059',
    3,
    'Prompt',
    'Prompt',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID C773E487-81C6-445F-B1F9-B63922334059 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'C773E487-81C6-445F-B1F9-B63922334059';
/* SQL text to insert entity field value with ID 88291e56-3fd5-4bbb-ba3d-9bd0e1b03850 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '88291e56-3fd5-4bbb-ba3d-9bd0e1b03850',
    '91598C2C-8F06-4E78-B775-CDB329CEB384',
    1,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d44e2ca0-3f12-4658-9148-870772cfed8e */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd44e2ca0-3f12-4658-9148-870772cfed8e',
    '91598C2C-8F06-4E78-B775-CDB329CEB384',
    2,
    'Running',
    'Running',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 71306b9e-5c57-4899-a6df-27698b1bc902 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '71306b9e-5c57-4899-a6df-27698b1bc902',
    '91598C2C-8F06-4E78-B775-CDB329CEB384',
    3,
    'Skipped',
    'Skipped',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b03265e8-e26d-4f88-baec-550422fe7780 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b03265e8-e26d-4f88-baec-550422fe7780',
    '91598C2C-8F06-4E78-B775-CDB329CEB384',
    4,
    'Success',
    'Success',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 91598C2C-8F06-4E78-B775-CDB329CEB384 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '91598C2C-8F06-4E78-B775-CDB329CEB384';
/* SQL text to insert entity field value with ID 182e1a61-6d4f-42fd-9402-572353dc23a9 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '182e1a61-6d4f-42fd-9402-572353dc23a9',
    'AD8301A7-A0AD-469C-91D6-30A876B61561',
    1,
    'Always',
    'Always',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f1d86b0e-95dc-4761-8249-51d47f834a20 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f1d86b0e-95dc-4761-8249-51d47f834a20',
    'AD8301A7-A0AD-469C-91D6-30A876B61561',
    2,
    'OnChange',
    'OnChange',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5767eabb-cc01-42ce-a5b8-af9599402293 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '5767eabb-cc01-42ce-a5b8-af9599402293',
    'AD8301A7-A0AD-469C-91D6-30A876B61561',
    3,
    'OnFailure',
    'OnFailure',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4aa21587-45d1-4476-aecc-1cc9067c24ad */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '4aa21587-45d1-4476-aecc-1cc9067c24ad',
    'AD8301A7-A0AD-469C-91D6-30A876B61561',
    4,
    'OnSuccess',
    'OnSuccess',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID AD8301A7-A0AD-469C-91D6-30A876B61561 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'AD8301A7-A0AD-469C-91D6-30A876B61561';
/* SQL text to insert entity field value with ID ef000609-3375-4385-ace3-a2f4a10f771a */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ef000609-3375-4385-ace3-a2f4a10f771a',
    'D0731EDD-711C-466C-9A91-CBF587D300AA',
    1,
    'Email',
    'Email',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ebd0747c-94b0-4082-bc92-503c491ea682 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ebd0747c-94b0-4082-bc92-503c491ea682',
    'D0731EDD-711C-466C-9A91-CBF587D300AA',
    2,
    'InApp',
    'InApp',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID D0731EDD-711C-466C-9A91-CBF587D300AA */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D0731EDD-711C-466C-9A91-CBF587D300AA';
/* SQL text to insert entity field value with ID 6091ebf0-2421-4a9b-853a-2d58a1f34116 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '6091ebf0-2421-4a9b-853a-2d58a1f34116',
    'B04E3F1E-D7C8-43EA-8C30-655E9405BD27',
    1,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7249b023-eb09-4044-97d2-a51087f04526 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '7249b023-eb09-4044-97d2-a51087f04526',
    'B04E3F1E-D7C8-43EA-8C30-655E9405BD27',
    2,
    'Running',
    'Running',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 97b60f68-6ac6-4ec0-9ec2-219a7d30361a */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '97b60f68-6ac6-4ec0-9ec2-219a7d30361a',
    'B04E3F1E-D7C8-43EA-8C30-655E9405BD27',
    3,
    'Skipped',
    'Skipped',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 31dcfd2f-31fa-43f2-9814-23030b59b762 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '31dcfd2f-31fa-43f2-9814-23030b59b762',
    'B04E3F1E-D7C8-43EA-8C30-655E9405BD27',
    4,
    'Success',
    'Success',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B04E3F1E-D7C8-43EA-8C30-655E9405BD27 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27';
/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: User Routine Runs (One To Many via AgentRunID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a262b970-89e0-4f8d-a4b2-cbdb1213d29a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a262b970-89e0-4f8d-a4b2-cbdb1213d29a', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'AgentRunID', 'One To Many', TRUE, TRUE, 14, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8f55cb00-991a-4fcc-aa12-bedaccdcc1cd') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f55cb00-991a-4fcc-aa12-bedaccdcc1cd', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'RoutineID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e8c27416-8273-4773-adea-b22c52c8c7b9') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e8c27416-8273-4773-adea-b22c52c8c7b9', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', '90DFFDEA-6FF8-4721-8730-25CE51209A4B', 'RoutineID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0a508ea8-d11c-41ff-8c2d-4696b1ca4ea3') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0a508ea8-d11c-41ff-8c2d-4696b1ca4ea3', '72975471-6AAB-45C6-B58A-3F1115C921C3', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'EnvironmentID', 'One To Many', TRUE, TRUE, 8, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '59c4b557-8485-4271-836e-9d9f2219deeb') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('59c4b557-8485-4271-836e-9d9f2219deeb', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'UserID', 'One To Many', TRUE, TRUE, 108, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'aeeab424-5697-459c-ada9-05c4a874b6e4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aeeab424-5697-459c-ada9-05c4a874b6e4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '90DFFDEA-6FF8-4721-8730-25CE51209A4B', 'UserID', 'One To Many', TRUE, TRUE, 109, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd77a2c9f-b6c9-4037-9d92-1dd092791bc6') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d77a2c9f-b6c9-4037-9d92-1dd092791bc6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'ActionExecutionLogID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '67cda9cd-86b7-4bcd-935a-e7ca0a8a6ecd') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('67cda9cd-86b7-4bcd-935a-e7ca0a8a6ecd', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'NotificationTemplateID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1a6ba1ba-b746-47d4-8831-ef18f2766ec4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1a6ba1ba-b746-47d4-8831-ef18f2766ec4', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '149A0274-47E7-4AAE-A64C-77B9F7D0873E', 'PromptRunID', 'One To Many', TRUE, TRUE, 8, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0f1ea682-5f73-44be-8811-9279f12c4e88' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0f1ea682-5f73-44be-8811-9279f12c4e88', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100053, 'User', 'User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a4f5964-b03f-4180-9ec7-63d9b10743ec' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'Environment')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4a4f5964-b03f-4180-9ec7-63d9b10743ec', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100054, 'Environment', 'Environment', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'de64d640-0292-4bc6-bafe-0b0179052af5' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'NotificationTemplate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('de64d640-0292-4bc6-bafe-0b0179052af5', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, 100055, 'NotificationTemplate', 'Notification Template', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fa8aecbd-87a0-4f0c-982e-3380886a3318' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'Routine')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fa8aecbd-87a0-4f0c-982e-3380886a3318', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100017, 'Routine', 'Routine', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5b86c096-1a20-4a07-9a6c-27f1e9c0bf8d' OR ("EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5b86c096-1a20-4a07-9a6c-27f1e9c0bf8d', '90DFFDEA-6FF8-4721-8730-25CE51209A4B' /* Entity: MJ: User Routine Recipients */, 100018, 'User', 'User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dedb4a65-fa5e-4a4f-9ae7-2205a6305f39' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'Routine')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dedb4a65-fa5e-4a4f-9ae7-2205a6305f39', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100029, 'Routine', 'Routine', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '720622fa-875d-41f8-ac33-c87e1dad20a6' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'AgentRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('720622fa-875d-41f8-ac33-c87e1dad20a6', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100030, 'AgentRun', 'Agent Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8f2362d4-f61d-4503-ae18-0db944cfeb71' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'PromptRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f2362d4-f61d-4503-ae18-0db944cfeb71', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100031, 'PromptRun', 'Prompt Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af5ddace-5d3e-4558-9c25-06a7fccb3987' OR ("EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E' AND "Name" = 'ActionExecutionLog')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('af5ddace-5d3e-4558-9c25-06a7fccb3987', '149A0274-47E7-4AAE-A64C-77B9F7D0873E' /* Entity: MJ: User Routine Runs */, 100032, 'ActionExecutionLog', 'Action Execution Log', NULL, 'nvarchar', 850, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D0731EDD-711C-466C-9A91-CBF587D300AA'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'E188CCE7-FB74-4482-9CB4-F65A7B5BF2FF'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'FA8AECBD-87A0-4F0C-982E-3380886A3318'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '2644D5FA-E13F-4CCD-8C0F-582A223D6790'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C773E487-81C6-445F-B1F9-B63922334059'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '46977ED9-EB0D-47B3-9CFC-1C51D537512D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '91598C2C-8F06-4E78-B775-CDB329CEB384'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '2644D5FA-E13F-4CCD-8C0F-582A223D6790'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'C773E487-81C6-445F-B1F9-B63922334059'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '2644D5FA-E13F-4CCD-8C0F-582A223D6790'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'C773E487-81C6-445F-B1F9-B63922334059'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '991A9918-AE4B-4C3D-83A1-84C4CFF3B4F9'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5BC895D7-72FC-49F0-B68E-DE2FA9A53E7E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'DEDB4A65-FA5E-4A4F-9AE7-2205A6305F39'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'DEDB4A65-FA5E-4A4F-9AE7-2205A6305F39'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 10 fields */
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7E455B5B-C101-45B9-BD72-509675C5EA9B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.RoutineID */
UPDATE __mj."EntityField" SET "Category" = 'Routine Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'Routine', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A7A02CBB-97C8-4F58-B49E-B9D9702F2E6A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.Routine */
UPDATE __mj."EntityField" SET "Category" = 'Routine Association', "GeneratedFormSection" = 'Category', "DisplayName" = 'Routine Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FA8AECBD-87A0-4F0C-982E-3380886A3318' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Recipient Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'CE13E21C-E76B-40AB-8718-0FAE9DD1D965' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.User */
UPDATE __mj."EntityField" SET "Category" = 'Recipient Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5B86C096-1A20-4A07-9A6C-27F1E9C0BF8D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.Email */
UPDATE __mj."EntityField" SET "Category" = 'Recipient Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Email Address', "ExtendedType" = 'Email', "CodeType" = NULL
WHERE
  "ID" = '5EABB901-CB44-4C9A-9FAE-4679F58D19BD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.Channel */
UPDATE __mj."EntityField" SET "Category" = 'Notification Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D0731EDD-711C-466C-9A91-CBF587D300AA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.Sequence */
UPDATE __mj."EntityField" SET "Category" = 'Notification Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E188CCE7-FB74-4482-9CB4-F65A7B5BF2FF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '723018C4-1E60-4622-A02F-8D85D32C6AB0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Recipients.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A35C1721-AA88-4CC4-AF8D-88B8969D5423' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-user-clock */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-user-clock', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c8f93057-9630-470b-9a23-616ea15bbabd',
    '90DFFDEA-6FF8-4721-8730-25CE51209A4B',
    'FieldCategoryInfo',
    '{"Routine Association":{"icon":"fa fa-tasks","description":"Links the recipient to the parent routine configuration"},"Recipient Details":{"icon":"fa fa-user","description":"Identification details for internal users or external email contacts"},"Notification Settings":{"icon":"fa fa-bell","description":"Configuration for how and when the recipient receives notifications"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'bb30d721-8efa-4220-8891-9c33ec109d8a',
    '90DFFDEA-6FF8-4721-8730-25CE51209A4B',
    'FieldCategoryIcons',
    '{"Routine Association":"fa fa-tasks","Recipient Details":"fa fa-user","Notification Settings":"fa fa-bell","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '90DFFDEA-6FF8-4721-8730-25CE51209A4B';

/* Set categories for 18 fields */
/* UPDATE Entity Field Category Info MJ: User Routine Runs.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BA7133A2-39BC-4C11-9697-1F2442394C6C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.RoutineID */
UPDATE __mj."EntityField" SET "Category" = 'Routine Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Routine', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6E9A8F03-958F-4C17-8493-1A95E097D602' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.Routine */
UPDATE __mj."EntityField" SET "Category" = 'Routine Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Routine Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DEDB4A65-FA5E-4A4F-9AE7-2205A6305F39' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.StartedAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '991A9918-AE4B-4C3D-83A1-84C4CFF3B4F9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.CompletedAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Timeline', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5BC895D7-72FC-49F0-B68E-DE2FA9A53E7E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.Status */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B04E3F1E-D7C8-43EA-8C30-655E9405BD27' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.ResultSummary */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DD9C6F60-0D84-40C4-B8C2-D6ABF45F9E16' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.ResultHash */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E54429E3-0861-4532-801D-286675875682' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.ErrorMessage */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A37FDA9C-9F40-4E66-82CB-AD5F4A2F441F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.NotificationSent */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2783A568-F159-4681-B6C3-F693C6987872' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.AgentRunID */
UPDATE __mj."EntityField" SET "Category" = 'Linked Executions', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '63F5317B-AE27-42EB-B3A6-2125E96B7E71' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.AgentRun */
UPDATE __mj."EntityField" SET "Category" = 'Linked Executions', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Run Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '720622FA-875D-41F8-AC33-C87E1DAD20A6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.PromptRunID */
UPDATE __mj."EntityField" SET "Category" = 'Linked Executions', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B71D5EB5-3348-4382-9578-24C6D027B4D8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.PromptRun */
UPDATE __mj."EntityField" SET "Category" = 'Linked Executions', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt Run Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8F2362D4-F61D-4503-AE18-0DB944CFEB71' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.ActionExecutionLogID */
UPDATE __mj."EntityField" SET "Category" = 'Linked Executions', "GeneratedFormSection" = 'Category', "DisplayName" = 'Action Execution Log', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EEDB54CC-1A36-40A7-8A9D-B4426587D197' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.ActionExecutionLog */
UPDATE __mj."EntityField" SET "Category" = 'Linked Executions', "GeneratedFormSection" = 'Category', "DisplayName" = 'Action Execution Log Reference', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AF5DDACE-5D3E-4558-9C25-06A7FCCB3987' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4258725E-C8DA-4317-82FF-D3FD29EBDCCB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routine Runs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7743D3F3-E760-4153-AB41-576CED757DB8' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-play-circle */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-play-circle', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '0d52f93a-71ae-41d8-b0c2-0abba6174adc',
    '149A0274-47E7-4AAE-A64C-77B9F7D0873E',
    'FieldCategoryInfo',
    '{"Routine Context":{"icon":"fa fa-tasks","description":"Information regarding the parent routine configuration"},"Execution Timeline":{"icon":"fa fa-clock","description":"Start and completion timestamps for the run"},"Execution Results":{"icon":"fa fa-check-circle","description":"Outcome status, summaries, error logs, and notifications"},"Linked Executions":{"icon":"fa fa-link","description":"References to associated AI agent, prompt, or action execution logs"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9fa76a6b-1bb5-4919-b308-96aa926ddfff',
    '149A0274-47E7-4AAE-A64C-77B9F7D0873E',
    'FieldCategoryIcons',
    '{"Routine Context":"fa fa-tasks","Execution Timeline":"fa fa-clock","Execution Results":"fa fa-check-circle","Linked Executions":"fa fa-link","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '149A0274-47E7-4AAE-A64C-77B9F7D0873E';

/* Set categories for 29 fields */
/* UPDATE Entity Field Category Info MJ: User Routines.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2D1E15BA-591D-4C2F-AADB-88563C71A074' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Routine Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B0E2528D-3E0C-4D07-97CD-D2A5F2E18E69' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.EnvironmentID */
UPDATE __mj."EntityField" SET "Category" = 'Routine Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Environment', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '584BA54A-84D9-4E76-BF64-B42FB707A171' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.Name */
UPDATE __mj."EntityField" SET "Category" = 'Routine Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '76D890C2-2CF1-482D-9823-111FF82B1589' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.Description */
UPDATE __mj."EntityField" SET "Category" = 'Routine Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0CCB724B-9B32-408C-8D00-82D64FDF9A76' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.Status */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8DD8F51D-92C3-4C2E-8C3F-949F281865C0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.RoutineType */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2644D5FA-E13F-4CCD-8C0F-582A223D6790' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.TargetType */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C773E487-81C6-445F-B1F9-B63922334059' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.TargetID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Target', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ABF830CA-1F2C-4121-8ED7-637003B1BB38' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.InitialMessage */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '712470D0-F60A-4DEA-8EB4-03ADB363BA91' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.StartingPayload */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4AF3B243-4D7F-415E-A291-153B52409481' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.RequestedSkillIDs */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Requested Skill IDs', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '202535D1-3E71-488E-AD20-4BF7BB994981' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.CronExpression */
UPDATE __mj."EntityField" SET "Category" = 'Scheduling and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '505FB83A-E8F6-4C69-819B-A6777B4AAA4F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.Timezone */
UPDATE __mj."EntityField" SET "Category" = 'Scheduling and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D906A039-F1A4-4B29-867A-421F3D0844E2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.StartAt */
UPDATE __mj."EntityField" SET "Category" = 'Scheduling and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DEE9AD88-B7D4-431C-8C89-4D4F6223421D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.EndAt */
UPDATE __mj."EntityField" SET "Category" = 'Scheduling and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0C8B92BF-5EA8-41BF-BE21-C89375D907BF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.NextRunAt */
UPDATE __mj."EntityField" SET "Category" = 'Scheduling and Timing', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '46977ED9-EB0D-47B3-9CFC-1C51D537512D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.LastRunAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution History', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BA45A96E-D80E-410B-B112-499D08AA0A92' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.LastRunStatus */
UPDATE __mj."EntityField" SET "Category" = 'Execution History', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '91598C2C-8F06-4E78-B775-CDB329CEB384' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.LastResultHash */
UPDATE __mj."EntityField" SET "Category" = 'Execution History', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1EA37BD4-DB55-4BA1-B036-746CFEF901DE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.NotificationTemplateID */
UPDATE __mj."EntityField" SET "Category" = 'Notifications', "GeneratedFormSection" = 'Category', "DisplayName" = 'Notification Template', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2EC50FB2-B62B-4C11-AB77-F282DF8F6C8A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.NotifyCondition */
UPDATE __mj."EntityField" SET "Category" = 'Notifications', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AD8301A7-A0AD-469C-91D6-30A876B61561' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.NotifyViaInApp */
UPDATE __mj."EntityField" SET "Category" = 'Notifications', "GeneratedFormSection" = 'Category', "DisplayName" = 'Notify Via In-App', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ACDAD567-0DC5-4732-89FF-4628B20B8A74' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.NotifyViaEmail */
UPDATE __mj."EntityField" SET "Category" = 'Notifications', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B8C70528-E866-48FA-8BE2-D03279431403' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '306F503E-B801-4544-90DD-A94993F2F5D7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '38B3AAB9-0B7B-4CC8-8A96-3B0BA93918B9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.User */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0F1EA682-5F73-44BE-8811-9279F12C4E88' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.Environment */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Environment Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4A4F5964-B03F-4180-9EC7-63D9B10743EC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: User Routines.NotificationTemplate */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Notification Template Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DE64D640-0292-4BC6-BAFE-0B0179052AF5' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-sync-alt */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-sync-alt', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B';

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e4388914-e8e6-4dab-81ce-5716275bc8d9',
    'D6CA6018-D288-4F79-B6A9-168C75C3363B',
    'FieldCategoryInfo',
    '{"Routine Configuration":{"icon":"fa fa-cog","description":"General settings and ownership details for the routine."},"Execution Settings":{"icon":"fa fa-play-circle","description":"Configuration for routine targets, payloads, and operational parameters."},"Scheduling and Timing":{"icon":"fa fa-clock","description":"Time-based scheduling logic, cron expressions, and activation windows."},"Execution History":{"icon":"fa fa-history","description":"Audit and state tracking of the most recent routine executions."},"Notifications":{"icon":"fa fa-bell","description":"Notification delivery preferences and templates for routine output."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit fields and display references."}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '49e8299f-3848-4296-bb91-b40b000f9dc7',
    'D6CA6018-D288-4F79-B6A9-168C75C3363B',
    'FieldCategoryIcons',
    '{"Routine Configuration":"fa fa-cog","Execution Settings":"fa fa-play-circle","Scheduling and Timing":"fa fa-clock","Execution History":"fa fa-history","Notifications":"fa fa-bell","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Recipients
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_recipient_routine_id"
    ON __mj."UserRoutineRecipient" ("RoutineID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_recipient_user_id"
    ON __mj."UserRoutineRecipient" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Recipients
-- Item: vwUserRoutineRecipients
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Routine Recipients
-----               SCHEMA:      __mj
-----               BASE TABLE:  UserRoutineRecipient
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwUserRoutineRecipients"
AS
SELECT
    u.*,
    MJUserRoutine_RoutineID."Name" AS "Routine",
    MJUser_UserID."Name" AS "User"
FROM
    __mj."UserRoutineRecipient" AS u
INNER JOIN
    __mj."UserRoutine" AS MJUserRoutine_RoutineID
  ON
    "u"."RoutineID" = MJUserRoutine_RoutineID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "u"."UserID" = MJUser_UserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwUserRoutineRecipients'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwUserRoutineRecipients'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwUserRoutineRecipients'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwUserRoutineRecipients" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwUserRoutineRecipients" TO "cdp_UI";
GRANT SELECT ON __mj."vwUserRoutineRecipients" TO "cdp_Developer";
GRANT SELECT ON __mj."vwUserRoutineRecipients" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Recipients
-- Item: spCreateUserRoutineRecipient
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserRoutineRecipient
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserRoutineRecipient'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateUserRoutineRecipient"(
    p_id UUID DEFAULT NULL,
    p_routineid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_email_clear boolean DEFAULT false,
    p_email varchar(255) DEFAULT NULL,
    p_channel varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF __mj."vwUserRoutineRecipients" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."UserRoutineRecipient"
        (
            "ID",
            "RoutineID",
                "UserID",
                "Email",
                "Channel",
                "Sequence"
        )
    VALUES
        (
            v_new_id,
            p_routineid,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_email_clear = true THEN NULL ELSE COALESCE(p_email, NULL) END,
                COALESCE(p_channel, 'InApp'),
                COALESCE(p_sequence, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwUserRoutineRecipients"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateUserRoutineRecipient" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateUserRoutineRecipient" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Recipients
-- Item: spUpdateUserRoutineRecipient
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserRoutineRecipient
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserRoutineRecipient'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserRoutineRecipient"(
    p_id UUID,
    p_routineid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_email_clear boolean DEFAULT false,
    p_email varchar(255) DEFAULT NULL,
    p_channel varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL
) RETURNS SETOF __mj."vwUserRoutineRecipients" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."UserRoutineRecipient"
    SET
        "RoutineID" = COALESCE(p_routineid, "RoutineID"),
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "Email" = CASE WHEN p_email_clear = true THEN NULL ELSE COALESCE(p_email, "Email") END,
        "Channel" = COALESCE(p_channel, "Channel"),
        "Sequence" = COALESCE(p_sequence, "Sequence")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwUserRoutineRecipients"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserRoutineRecipient" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserRoutineRecipient" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutineRecipient table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_user_routine_recipient"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_routine_recipient" ON __mj."UserRoutineRecipient";

CREATE TRIGGER "trg_update_user_routine_recipient"
BEFORE UPDATE ON __mj."UserRoutineRecipient"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_user_routine_recipient"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Recipients
-- Item: spDeleteUserRoutineRecipient
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR UserRoutineRecipient
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUserRoutineRecipient'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserRoutineRecipient"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."UserRoutineRecipient"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRoutineRecipient" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRoutineRecipient" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_run_routine_id"
    ON __mj."UserRoutineRun" ("RoutineID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_run_agent_run_id"
    ON __mj."UserRoutineRun" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_run_prompt_run_id"
    ON __mj."UserRoutineRun" ("PromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_run_action_execution_log_id"
    ON __mj."UserRoutineRun" ("ActionExecutionLogID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Runs
-- Item: vwUserRoutineRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Routine Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  UserRoutineRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwUserRoutineRuns"
AS
SELECT
    u.*,
    MJUserRoutine_RoutineID."Name" AS "Routine",
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIPromptRun_PromptRunID."RunName" AS "PromptRun",
    MJActionExecutionLog_ActionExecutionLogID."Action" AS "ActionExecutionLog"
FROM
    __mj."UserRoutineRun" AS u
INNER JOIN
    __mj."UserRoutine" AS MJUserRoutine_RoutineID
  ON
    "u"."RoutineID" = MJUserRoutine_RoutineID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "u"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS MJAIPromptRun_PromptRunID
  ON
    "u"."PromptRunID" = MJAIPromptRun_PromptRunID."ID"
LEFT OUTER JOIN
    __mj."vwActionExecutionLogs" AS MJActionExecutionLog_ActionExecutionLogID
  ON
    "u"."ActionExecutionLogID" = MJActionExecutionLog_ActionExecutionLogID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwUserRoutineRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwUserRoutineRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwUserRoutineRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwUserRoutineRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwUserRoutineRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwUserRoutineRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwUserRoutineRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Runs
-- Item: spCreateUserRoutineRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserRoutineRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserRoutineRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateUserRoutineRun"(
    p_id UUID DEFAULT NULL,
    p_routineid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_agentrunid_clear boolean DEFAULT false,
    p_agentrunid UUID DEFAULT NULL,
    p_promptrunid_clear boolean DEFAULT false,
    p_promptrunid UUID DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_resultsummary_clear boolean DEFAULT false,
    p_resultsummary TEXT DEFAULT NULL,
    p_resulthash_clear boolean DEFAULT false,
    p_resulthash varchar(100) DEFAULT NULL,
    p_notificationsent BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwUserRoutineRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."UserRoutineRun"
        (
            "ID",
            "RoutineID",
                "StartedAt",
                "CompletedAt",
                "Status",
                "AgentRunID",
                "PromptRunID",
                "ActionExecutionLogID",
                "ResultSummary",
                "ResultHash",
                "NotificationSent",
                "ErrorMessage"
        )
    VALUES
        (
            v_new_id,
            p_routineid,
                COALESCE(p_startedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                COALESCE(p_status, 'Running'),
                CASE WHEN p_agentrunid_clear = true THEN NULL ELSE COALESCE(p_agentrunid, NULL) END,
                CASE WHEN p_promptrunid_clear = true THEN NULL ELSE COALESCE(p_promptrunid, NULL) END,
                CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, NULL) END,
                CASE WHEN p_resultsummary_clear = true THEN NULL ELSE COALESCE(p_resultsummary, NULL) END,
                CASE WHEN p_resulthash_clear = true THEN NULL ELSE COALESCE(p_resulthash, NULL) END,
                COALESCE(p_notificationsent, FALSE),
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwUserRoutineRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateUserRoutineRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateUserRoutineRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Runs
-- Item: spUpdateUserRoutineRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserRoutineRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserRoutineRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserRoutineRun"(
    p_id UUID,
    p_routineid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_agentrunid_clear boolean DEFAULT false,
    p_agentrunid UUID DEFAULT NULL,
    p_promptrunid_clear boolean DEFAULT false,
    p_promptrunid UUID DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_resultsummary_clear boolean DEFAULT false,
    p_resultsummary TEXT DEFAULT NULL,
    p_resulthash_clear boolean DEFAULT false,
    p_resulthash varchar(100) DEFAULT NULL,
    p_notificationsent BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwUserRoutineRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."UserRoutineRun"
    SET
        "RoutineID" = COALESCE(p_routineid, "RoutineID"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Status" = COALESCE(p_status, "Status"),
        "AgentRunID" = CASE WHEN p_agentrunid_clear = true THEN NULL ELSE COALESCE(p_agentrunid, "AgentRunID") END,
        "PromptRunID" = CASE WHEN p_promptrunid_clear = true THEN NULL ELSE COALESCE(p_promptrunid, "PromptRunID") END,
        "ActionExecutionLogID" = CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, "ActionExecutionLogID") END,
        "ResultSummary" = CASE WHEN p_resultsummary_clear = true THEN NULL ELSE COALESCE(p_resultsummary, "ResultSummary") END,
        "ResultHash" = CASE WHEN p_resulthash_clear = true THEN NULL ELSE COALESCE(p_resulthash, "ResultHash") END,
        "NotificationSent" = COALESCE(p_notificationsent, "NotificationSent"),
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwUserRoutineRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserRoutineRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserRoutineRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutineRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_user_routine_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_routine_run" ON __mj."UserRoutineRun";

CREATE TRIGGER "trg_update_user_routine_run"
BEFORE UPDATE ON __mj."UserRoutineRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_user_routine_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routine Runs
-- Item: spDeleteUserRoutineRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR UserRoutineRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUserRoutineRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserRoutineRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."UserRoutineRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRoutineRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRoutineRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_user_id"
    ON __mj."UserRoutine" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_environment_id"
    ON __mj."UserRoutine" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_routine_notification_template_id"
    ON __mj."UserRoutine" ("NotificationTemplateID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: vwUserRoutines
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Routines
-----               SCHEMA:      __mj
-----               BASE TABLE:  UserRoutine
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwUserRoutines"
AS
SELECT
    u.*,
    MJUser_UserID."Name" AS "User",
    MJEnvironment_EnvironmentID."Name" AS "Environment",
    MJTemplate_NotificationTemplateID."Name" AS "NotificationTemplate"
FROM
    __mj."UserRoutine" AS u
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "u"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."Environment" AS MJEnvironment_EnvironmentID
  ON
    "u"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    __mj."Template" AS MJTemplate_NotificationTemplateID
  ON
    "u"."NotificationTemplateID" = MJTemplate_NotificationTemplateID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwUserRoutines'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwUserRoutines'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwUserRoutines'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwUserRoutines" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwUserRoutines" TO "cdp_UI";
GRANT SELECT ON __mj."vwUserRoutines" TO "cdp_Developer";
GRANT SELECT ON __mj."vwUserRoutines" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spCreateUserRoutine
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateUserRoutine"(
    p_id UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_environmentid_clear boolean DEFAULT false,
    p_environmentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_routinetype varchar(20) DEFAULT NULL,
    p_targettype varchar(20) DEFAULT NULL,
    p_targetid UUID DEFAULT NULL,
    p_initialmessage_clear boolean DEFAULT false,
    p_initialmessage TEXT DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload TEXT DEFAULT NULL,
    p_requestedskillids_clear boolean DEFAULT false,
    p_requestedskillids TEXT DEFAULT NULL,
    p_cronexpression varchar(100) DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_notificationtemplateid_clear boolean DEFAULT false,
    p_notificationtemplateid UUID DEFAULT NULL,
    p_timezone varchar(100) DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunstatus_clear boolean DEFAULT false,
    p_lastrunstatus varchar(20) DEFAULT NULL,
    p_lastresulthash_clear boolean DEFAULT false,
    p_lastresulthash varchar(100) DEFAULT NULL,
    p_notifycondition varchar(20) DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwUserRoutines" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."UserRoutine"
        (
            "ID",
            "UserID",
                "EnvironmentID",
                "Name",
                "Description",
                "Status",
                "RoutineType",
                "TargetType",
                "TargetID",
                "InitialMessage",
                "StartingPayload",
                "RequestedSkillIDs",
                "CronExpression",
                "StartAt",
                "EndAt",
                "NotificationTemplateID",
                "Timezone",
                "NextRunAt",
                "LastRunAt",
                "LastRunStatus",
                "LastResultHash",
                "NotifyCondition",
                "NotifyViaInApp",
                "NotifyViaEmail"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                CASE WHEN p_environmentid_clear = true THEN NULL ELSE COALESCE(p_environmentid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_routinetype, 'Scheduled'),
                p_targettype,
                p_targetid,
                CASE WHEN p_initialmessage_clear = true THEN NULL ELSE COALESCE(p_initialmessage, NULL) END,
                CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, NULL) END,
                CASE WHEN p_requestedskillids_clear = true THEN NULL ELSE COALESCE(p_requestedskillids, NULL) END,
                p_cronexpression,
                CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, NULL) END,
                CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, NULL) END,
                CASE WHEN p_notificationtemplateid_clear = true THEN NULL ELSE COALESCE(p_notificationtemplateid, NULL) END,
                COALESCE(p_timezone, 'UTC'),
                CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, NULL) END,
                CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, NULL) END,
                CASE WHEN p_lastrunstatus_clear = true THEN NULL ELSE COALESCE(p_lastrunstatus, NULL) END,
                CASE WHEN p_lastresulthash_clear = true THEN NULL ELSE COALESCE(p_lastresulthash, NULL) END,
                COALESCE(p_notifycondition, 'Always'),
                COALESCE(p_notifyviainapp, TRUE),
                COALESCE(p_notifyviaemail, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwUserRoutines"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateUserRoutine" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spUpdateUserRoutine
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserRoutine"(
    p_id UUID,
    p_userid UUID DEFAULT NULL,
    p_environmentid_clear boolean DEFAULT false,
    p_environmentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_routinetype varchar(20) DEFAULT NULL,
    p_targettype varchar(20) DEFAULT NULL,
    p_targetid UUID DEFAULT NULL,
    p_initialmessage_clear boolean DEFAULT false,
    p_initialmessage TEXT DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload TEXT DEFAULT NULL,
    p_requestedskillids_clear boolean DEFAULT false,
    p_requestedskillids TEXT DEFAULT NULL,
    p_cronexpression varchar(100) DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_notificationtemplateid_clear boolean DEFAULT false,
    p_notificationtemplateid UUID DEFAULT NULL,
    p_timezone varchar(100) DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunstatus_clear boolean DEFAULT false,
    p_lastrunstatus varchar(20) DEFAULT NULL,
    p_lastresulthash_clear boolean DEFAULT false,
    p_lastresulthash varchar(100) DEFAULT NULL,
    p_notifycondition varchar(20) DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwUserRoutines" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."UserRoutine"
    SET
        "UserID" = COALESCE(p_userid, "UserID"),
        "EnvironmentID" = CASE WHEN p_environmentid_clear = true THEN NULL ELSE COALESCE(p_environmentid, "EnvironmentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "RoutineType" = COALESCE(p_routinetype, "RoutineType"),
        "TargetType" = COALESCE(p_targettype, "TargetType"),
        "TargetID" = COALESCE(p_targetid, "TargetID"),
        "InitialMessage" = CASE WHEN p_initialmessage_clear = true THEN NULL ELSE COALESCE(p_initialmessage, "InitialMessage") END,
        "StartingPayload" = CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, "StartingPayload") END,
        "RequestedSkillIDs" = CASE WHEN p_requestedskillids_clear = true THEN NULL ELSE COALESCE(p_requestedskillids, "RequestedSkillIDs") END,
        "CronExpression" = COALESCE(p_cronexpression, "CronExpression"),
        "StartAt" = CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, "StartAt") END,
        "EndAt" = CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, "EndAt") END,
        "NotificationTemplateID" = CASE WHEN p_notificationtemplateid_clear = true THEN NULL ELSE COALESCE(p_notificationtemplateid, "NotificationTemplateID") END,
        "Timezone" = COALESCE(p_timezone, "Timezone"),
        "NextRunAt" = CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, "NextRunAt") END,
        "LastRunAt" = CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, "LastRunAt") END,
        "LastRunStatus" = CASE WHEN p_lastrunstatus_clear = true THEN NULL ELSE COALESCE(p_lastrunstatus, "LastRunStatus") END,
        "LastResultHash" = CASE WHEN p_lastresulthash_clear = true THEN NULL ELSE COALESCE(p_lastresulthash, "LastResultHash") END,
        "NotifyCondition" = COALESCE(p_notifycondition, "NotifyCondition"),
        "NotifyViaInApp" = COALESCE(p_notifyviainapp, "NotifyViaInApp"),
        "NotifyViaEmail" = COALESCE(p_notifyviaemail, "NotifyViaEmail")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwUserRoutines"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserRoutine" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutine table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_user_routine"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_routine" ON __mj."UserRoutine";

CREATE TRIGGER "trg_update_user_routine"
BEFORE UPDATE ON __mj."UserRoutine"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_user_routine"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spDeleteUserRoutine
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserRoutine"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."UserRoutine"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserRoutine" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_prompt_id"
    ON __mj."AIPromptRun" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_model_id"
    ON __mj."AIPromptRun" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_vendor_id"
    ON __mj."AIPromptRun" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_id"
    ON __mj."AIPromptRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_configuration_id"
    ON __mj."AIPromptRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_parent_id"
    ON __mj."AIPromptRun" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_run_id"
    ON __mj."AIPromptRun" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_original_model_id"
    ON __mj."AIPromptRun" ("OriginalModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_rerun_from_prompt_run_id"
    ON __mj."AIPromptRun" ("RerunFromPromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_judge_id"
    ON __mj."AIPromptRun" ("JudgeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_child_prompt_id"
    ON __mj."AIPromptRun" ("ChildPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_test_run_id"
    ON __mj."AIPromptRun" ("TestRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_prompt_run_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIPromptRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunRerunFromPromptRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.RerunFromPromptRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_prompt_run_rerun_from_prompt_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "RerunFromPromptRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."RerunFromPromptRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIPromptRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."RerunFromPromptRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "RerunFromPromptRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIPromptRuns"
AS
SELECT
    a.*,
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIPromptRun_ParentID."RunName" AS "Parent",
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIModel_OriginalModelID."Name" AS "OriginalModel",
    MJAIPromptRun_RerunFromPromptRunID."RunName" AS "RerunFromPromptRun",
    MJAIPrompt_JudgeID."Name" AS "Judge",
    MJAIPrompt_ChildPromptID."Name" AS "ChildPrompt",
    MJTestRun_TestRunID."Test" AS "TestRun",
    root_ParentID.root_id AS "RootParentID",
    root_RerunFromPromptRunID.root_id AS "RootRerunFromPromptRunID"
FROM
    __mj."AIPromptRun" AS a
INNER JOIN
    __mj."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "a"."PromptID" = MJAIPrompt_PromptID."ID"
INNER JOIN
    __mj."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
INNER JOIN
    __mj."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS MJAIPromptRun_ParentID
  ON
    "a"."ParentID" = MJAIPromptRun_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OriginalModelID
  ON
    "a"."OriginalModelID" = MJAIModel_OriginalModelID."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS MJAIPromptRun_RerunFromPromptRunID
  ON
    "a"."RerunFromPromptRunID" = MJAIPromptRun_RerunFromPromptRunID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_JudgeID
  ON
    "a"."JudgeID" = MJAIPrompt_JudgeID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ChildPromptID
  ON
    "a"."ChildPromptID" = MJAIPrompt_ChildPromptID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_prompt_run_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_prompt_run_rerun_from_prompt_run_id_get_root_id"(a."ID", a."RerunFromPromptRunID") AS root_id
) AS root_RerunFromPromptRunID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPromptRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIPromptRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIPromptRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIPromptRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'AgentRunID', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'PromptID' THEN '($1->>''PromptID'')::UUID'
        WHEN 'ModelID' THEN '($1->>''ModelID'')::UUID'
        WHEN 'VendorID' THEN '($1->>''VendorID'')::UUID'
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'RunAt' THEN 'COALESCE(($1->>''RunAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INT'
        WHEN 'Messages' THEN '($1->>''Messages'')'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INT'
        WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INT'
        WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'Success' THEN 'COALESCE(($1->>''Success'')::BOOLEAN, FALSE)'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'RunType' THEN 'COALESCE(($1->>''RunType''), ''Single'')'
        WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INT'
        WHEN 'AgentRunID' THEN '($1->>''AgentRunID'')::UUID'
        WHEN 'Cost' THEN '($1->>''Cost'')::DECIMAL(19, 8)'
        WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
        WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INT'
        WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INT'
        WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INT'
        WHEN 'Temperature' THEN '($1->>''Temperature'')::DECIMAL(3, 2)'
        WHEN 'TopP' THEN '($1->>''TopP'')::DECIMAL(3, 2)'
        WHEN 'TopK' THEN '($1->>''TopK'')::INT'
        WHEN 'MinP' THEN '($1->>''MinP'')::DECIMAL(3, 2)'
        WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::DECIMAL(3, 2)'
        WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::DECIMAL(3, 2)'
        WHEN 'Seed' THEN '($1->>''Seed'')::INT'
        WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
        WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
        WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
        WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INT'
        WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::DECIMAL(18, 6)'
        WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INT'
        WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INT'
        WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
        WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
        WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
        WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INT'
        WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
        WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INT'
        WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
        WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
        WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
        WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INT'
        WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
        WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
        WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INT'
        WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
        WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
        WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
        WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
        WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INT'
        WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
        WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'Cancelled' THEN 'COALESCE(($1->>''Cancelled'')::BOOLEAN, FALSE)'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INT'
        WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
        WHEN 'CacheHit' THEN 'COALESCE(($1->>''CacheHit'')::BOOLEAN, FALSE)'
        WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
        WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
        WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::FLOAT(53)'
        WHEN 'WasSelectedResult' THEN 'COALESCE(($1->>''WasSelectedResult'')::BOOLEAN, FALSE)'
        WHEN 'StreamingEnabled' THEN 'COALESCE(($1->>''StreamingEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INT'
        WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
        WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
        WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INT'
        WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INT'
        WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INT'
        WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
        WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INT'
        WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INT'
        WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INT'
        WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INT'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIPromptRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIPromptRun"
    SET
        "PromptID" = CASE WHEN p_data ? 'PromptID' THEN (p_data->>'PromptID')::UUID ELSE "PromptID" END,
        "ModelID" = CASE WHEN p_data ? 'ModelID' THEN (p_data->>'ModelID')::UUID ELSE "ModelID" END,
        "VendorID" = CASE WHEN p_data ? 'VendorID' THEN (p_data->>'VendorID')::UUID ELSE "VendorID" END,
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "RunAt" = CASE WHEN p_data ? 'RunAt' THEN (p_data->>'RunAt')::TIMESTAMPTZ ELSE "RunAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INT ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INT ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INT ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INT ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "AgentRunID" = CASE WHEN p_data ? 'AgentRunID' THEN (p_data->>'AgentRunID')::UUID ELSE "AgentRunID" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::DECIMAL(19, 8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INT ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INT ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INT ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::DECIMAL(3, 2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::DECIMAL(3, 2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INT ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::DECIMAL(3, 2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::DECIMAL(3, 2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::DECIMAL(3, 2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INT ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INT ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::DECIMAL(18, 6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INT ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INT ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INT ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INT ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INT ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INT ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INT ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INT ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::FLOAT(53) ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INT ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INT ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INT ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INT ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INT ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INT ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INT ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INT ELSE "TokensCacheWriteRollup" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_prompt_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_run" ON __mj."AIPromptRun";

CREATE TRIGGER "trg_update_ai_prompt_run"
BEFORE UPDATE ON __mj."AIPromptRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_prompt_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: AI Prompt Run Medias records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRunMedia"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.RerunFromPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "RerunFromPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "RerunFromPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Content Item Tags.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ContentItemTag"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ContentItemTag"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Content Process Run Prompt Runs records via AIPromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ContentProcessRunPromptRun"
        WHERE "AIPromptRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteContentProcessRunPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."DuplicateRunDetailMatch"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."DuplicateRunDetailMatch"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."UserRoutineRun"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."UserRoutineRun"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON __mj."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON __mj."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON __mj."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON __mj."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON __mj."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON __mj."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON __mj."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON __mj."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON __mj."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON __mj."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON __mj."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON __mj."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON __mj."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.LastRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_last_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "LastRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."LastRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "LastRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."RunName" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."RunName" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    root_ParentRunID.root_id AS "RootParentRunID",
    root_LastRunID.root_id AS "RootLastRunID"
FROM
    __mj."AIAgentRun" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    __mj."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_parent_run_id_get_root_id"(a."ID", a."ParentRunID") AS root_id
) AS root_ParentRunID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_last_run_id_get_root_id"(a."ID", a."LastRunID") AS root_id
) AS root_LastRunID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID', 'PlanMode']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ParentRunID' THEN '($1->>''ParentRunID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Running'')'
        WHEN 'StartedAt' THEN 'COALESCE(($1->>''StartedAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ConversationID' THEN '($1->>''ConversationID'')::UUID'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'AgentState' THEN '($1->>''AgentState'')'
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INT'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INT'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INT'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INT'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INT'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INT'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INT, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INT'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INT'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
        WHEN 'PlanMode' THEN 'COALESCE(($1->>''PlanMode'')::BOOLEAN, FALSE)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgentRun"
    SET
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ParentRunID" = CASE WHEN p_data ? 'ParentRunID' THEN (p_data->>'ParentRunID')::UUID ELSE "ParentRunID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "StartedAt" = CASE WHEN p_data ? 'StartedAt' THEN (p_data->>'StartedAt')::TIMESTAMPTZ ELSE "StartedAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ConversationID" = CASE WHEN p_data ? 'ConversationID' THEN (p_data->>'ConversationID')::UUID ELSE "ConversationID" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "AgentState" = CASE WHEN p_data ? 'AgentState' THEN (p_data->>'AgentState') ELSE "AgentState" END,
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INT ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INT ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INT ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INT ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INT ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INT ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INT ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INT ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INT ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INT ELSE "TotalCacheWriteTokensUsed" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "PlanMode" = CASE WHEN p_data ? 'PlanMode' THEN (p_data->>'PlanMode')::BOOLEAN ELSE "PlanMode" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON __mj."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON __mj."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."DuplicateRunDetailMatch"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."DuplicateRunDetailMatch"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Session Iterations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ExperimentSessionIteration"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ExperimentSessionIteration"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Sessions.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ExperimentSession"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ExperimentSession"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Process Run Details.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ProcessRunDetail"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ProcessRunDetail"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."UserRoutineRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."UserRoutineRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration";
