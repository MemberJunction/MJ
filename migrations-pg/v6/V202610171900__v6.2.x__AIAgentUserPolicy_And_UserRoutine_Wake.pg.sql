-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610171900__v6.2.x__AIAgentUserPolicy_And_UserRoutine_Wake.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED ══╗
-- PG-OMITTED-BY-DESIGN: the CodeGen metadata-refresh EXECUTE block.
--
-- The SS original's CodeGen tail calls spUpdateExistingEntitiesFromSchema,
-- spUpdateExistingEntityFieldsFromSchema, spSetDefaultColumnWidthWhereNeeded and
-- spUpdateSchemaInfoFromDatabase. Absent here by design, not lost: PostgreSQL maintains those routines
-- in TypeScript (CodeGenLib's postgresql metadataSupportObjects.ts), the Entity / EntityField inserts
-- below carry the metadata, and `convert --bake-codegen` / `rebake` bake the generated objects in.
-- Same treatment as V202608082250__v6.1.x__TaskGraph_Skipped_And_Exclusive_Groups.pg.sql.
--
-- The two IF EXISTS (sys.extended_properties …) sp_dropextendedproperty guards in the SS original need
-- no counterpart: COMMENT ON replaces a comment in place, and the new UserRoutine comments are below.
-- ╚════════════════════════════════╝

/* ===================================================================================== */
/* AI Agent User Policies, Communication Provider Governance & User Routine Wake (v6.2.x) */
/* ===================================================================================== */
/* 1. Creates [AIAgentUserPolicy] ("MJ: AI Agent User Policies") to store per-(Agent, User) */
/*    personalization, permission-narrowing rules (CRUD, RLS, FLS, and time windows that */
/*    narrow below the invoking user's ceiling), channel modes (Email, Phone, Messaging, */
/*    Calendar), and approval policy gates. */
/* 2. Extends [UserRoutine] ("MJ: User Routines") to serve as the unified scheduling and */
/*    autonomous wake primitive for agents: */
/*    - Widens RoutineType CHECK constraint to ('Scheduled', 'Monitoring', 'AgentWake') */
/*    - Adds ScheduleMode ('Recurring', 'OneShot', 'Adaptive') and makes CronExpression */
/*      nullable when ScheduleMode = 'OneShot' */
/*    - Adds WakeConfiguration (JSON configuration for watched entities and the 3-tier */
/*      wake gate: Tier 0 hash/watermark, Tier 1 SafeExpressionEvaluator, Tier 2 */
/*      AIDecisionRunner, Tier 3 AIPromptRunner) and LastCheckedAt watermark */
/* 3. Extends [AIBridgeAgentIdentity] ("MJ: AI Bridge Agent Identities") with nullable */
/*    UserID so an email address or phone DID can be bound to a specific user's personal */
/*    agent instance (such as their Chief of Staff). */
/* 4. Extends [CommunicationProvider] ("MJ: Communication Providers") with calendar & */
/*    free/busy capability flags (SupportsCalendar, SupportsFreeBusy) and enterprise */
/*    mailbox governance settings (EnterpriseScopeMode, AllowedEmailDomains, */
/*    DefaultCredentialID). */
/* ===================================================================================== */
/* ===================================================================================== */
/* 1. DDL Operations */
/* ===================================================================================== */
CREATE TABLE __mj."AIAgentUserPolicy" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "AgentID" UUID NOT NULL,
  "UserID" UUID NOT NULL,
  "DisplayNameOverride" /* Personalization & Lifecycle */ VARCHAR(100) NULL,
  "PreferredPersonaID" UUID NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "OnboardingStatus" VARCHAR(20) NOT NULL DEFAULT (
    'NotStarted'
  ),
  "OnboardedAt" TIMESTAMPTZ NULL,
  "CoordinationMode" VARCHAR(20) NOT NULL DEFAULT (
    'Observer'
  ),
  "DefaultDataAccessMode" /* Permission Narrowing (Subset of User's MJ Permissions Ceiling) */ VARCHAR(20) NOT NULL DEFAULT (
    'UserCeiling'
  ),
  "EmailChannelMode" VARCHAR(20) NOT NULL DEFAULT (
    'DraftOnly'
  ),
  "PhoneChannelMode" VARCHAR(20) NOT NULL DEFAULT (
    'InboundOnly'
  ),
  "MessagingChannelMode" VARCHAR(20) NOT NULL DEFAULT (
    'Enabled'
  ),
  "CalendarChannelMode" VARCHAR(30) NOT NULL DEFAULT (
    'ReadOnly'
  ),
  "AllowInterAgentCoordination" BOOLEAN NOT NULL DEFAULT TRUE,
  "RequireApprovalForExternalComms" /* Approval Policy Gates (Enforced by BaseAgent before Action / Tool Execution) */ BOOLEAN NOT NULL DEFAULT TRUE,
  "RequireApprovalForFinancials" BOOLEAN NOT NULL DEFAULT TRUE,
  "RequireApprovalForDestructiveActions" BOOLEAN NOT NULL DEFAULT TRUE,
  "AutoApproveAmountThreshold" DECIMAL(18, 2) NULL,
  "EntityAccessRules" /* Granular Entity (CRUD/RLS/FLS/Time) & Action (Param/Time) Rules (JSONType interfaces) */ TEXT NULL,
  "ActionPolicyRules" TEXT NULL,
  "InstructionsOverride" TEXT NULL,
  CONSTRAINT "PK_AIAgentUserPolicy" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_AIAgentUserPolicy_Agent_User" UNIQUE (
    "AgentID",
    "UserID"
  ),
  CONSTRAINT "FK_AIAgentUserPolicy_Agent" FOREIGN KEY ("AgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentUserPolicy_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_AIAgentUserPolicy_Persona" FOREIGN KEY ("PreferredPersonaID") REFERENCES __mj."AIPersona" (
    "ID"
  ),
  CONSTRAINT "CK_AIAgentUserPolicy_Status" CHECK ("Status" IN ('Active', 'Paused', 'Disabled')),
  CONSTRAINT "CK_AIAgentUserPolicy_OnboardingStatus" CHECK ("OnboardingStatus" IN ('NotStarted', 'InProgress', 'Completed')),
  CONSTRAINT "CK_AIAgentUserPolicy_CoordinationMode" CHECK ("CoordinationMode" IN ('Observer', 'Coordinator', 'Autonomous')),
  CONSTRAINT "CK_AIAgentUserPolicy_DefaultDataAccessMode" CHECK ("DefaultDataAccessMode" IN ('UserCeiling', 'ReadOnly', 'AllowListOnly')),
  CONSTRAINT "CK_AIAgentUserPolicy_EmailChannelMode" CHECK ("EmailChannelMode" IN ('Disabled', 'ReadOnly', 'DraftOnly', 'SendAsAgent', 'SendAsUser')),
  CONSTRAINT "CK_AIAgentUserPolicy_PhoneChannelMode" CHECK ("PhoneChannelMode" IN ('Disabled', 'InboundOnly', 'OutboundWithApproval', 'OutboundAutonomous')),
  CONSTRAINT "CK_AIAgentUserPolicy_MessagingChannelMode" CHECK ("MessagingChannelMode" IN ('Disabled', 'Enabled')),
  CONSTRAINT "CK_AIAgentUserPolicy_CalendarChannelMode" CHECK ("CalendarChannelMode" IN ('Disabled', 'ReadOnly', 'ProposeWithApproval', 'Autonomous')),
  CONSTRAINT "CK_AIAgentUserPolicy_AutoApproveThreshold" CHECK ("AutoApproveAmountThreshold" IS NULL OR "AutoApproveAmountThreshold" >= 0)
);

ALTER TABLE __mj."UserRoutine"
DROP CONSTRAINT "CK_UserRoutine_RoutineType";

ALTER TABLE __mj."UserRoutine"
  ADD CONSTRAINT "CK_UserRoutine_RoutineType" CHECK ("RoutineType" IN ('Scheduled', 'Monitoring', 'AgentWake'));

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
    WHERE tc.relname = 'UserRoutine' AND a.attname = 'CronExpression'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."UserRoutine" ALTER COLUMN "CronExpression" TYPE VARCHAR(100), ALTER COLUMN "CronExpression" DROP NOT NULL;

ALTER TABLE __mj."UserRoutine"
  ADD COLUMN "ScheduleMode" VARCHAR(20) NOT NULL DEFAULT (
    'Recurring'
  ),
  ADD COLUMN "WakeConfiguration" TEXT NULL,
  ADD COLUMN "LastCheckedAt" TIMESTAMPTZ NULL;

ALTER TABLE __mj."UserRoutine"
  ADD CONSTRAINT "CK_UserRoutine_ScheduleMode" CHECK ("ScheduleMode" IN ('Recurring', 'OneShot', 'Adaptive'));

ALTER TABLE __mj."UserRoutine"
  ADD CONSTRAINT "CK_UserRoutine_CronOrOneShot" CHECK ("ScheduleMode" = 'OneShot' OR NOT "CronExpression" IS NULL);

ALTER TABLE __mj."AIBridgeAgentIdentity"
  ADD COLUMN "UserID" UUID NULL,
  ADD CONSTRAINT "FK_AIBridgeAgentIdentity_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  );

ALTER TABLE __mj."CommunicationProvider"
  ADD COLUMN "SupportsCalendar" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "SupportsFreeBusy" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "EnterpriseScopeMode" VARCHAR(40) NOT NULL DEFAULT (
    'UtilityMailboxesOnly'
  ),
  ADD COLUMN "AllowedEmailDomains" VARCHAR(500) NULL,
  ADD COLUMN "DefaultCredentialID" UUID NULL;

ALTER TABLE __mj."CommunicationProvider"
  ADD CONSTRAINT "CK_CommunicationProvider_EnterpriseScopeMode" CHECK ("EnterpriseScopeMode" IN ('UtilityMailboxesOnly', 'SecurityGroupScoped', 'TenantWide'));

ALTER TABLE __mj."CommunicationProvider"
  ADD CONSTRAINT "FK_CommunicationProvider_DefaultCredential" FOREIGN KEY ("DefaultCredentialID") REFERENCES __mj."Credential" (
    "ID"
  );

UPDATE __mj."CommunicationProvider" SET "SupportsCalendar" = TRUE, "SupportsFreeBusy" = TRUE
WHERE
  "Name" IN ('Microsoft Graph', 'Gmail');

COMMENT ON TABLE __mj."AIAgentUserPolicy" IS 'Per-(Agent, User) policy and personalization record. The owning user''s MJ permissions (Entity CRUD, Role RLS, Role FLS) form the hard ceiling; this table defines strict narrowing rules, channel modes, time windows, and approval gates.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."AgentID" IS 'The AI Agent governed by this user policy.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."UserID" IS 'The MJ User who owns this policy and under whose security principal the agent executes.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."DisplayNameOverride" IS 'Optional user-personalized display name for this agent (e.g., "Maya" for a user''s Chief of Staff).';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."PreferredPersonaID" IS 'Optional AI Persona selected by the user for this agent''s voice and communication style.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."Status" IS 'Policy lifecycle status: Active, Paused (autonomous wakes suspended), or Disabled.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."OnboardingStatus" IS 'Onboarding progression for this user-agent pair: NotStarted, InProgress, or Completed.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."OnboardedAt" IS 'Timestamp when the user completed onboarding for this agent.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."CoordinationMode" IS 'Operating posture: Observer (tracks and reports only; never nudges others), Coordinator (nudges internal task/priority owners and peer CoS agents), or Autonomous (proactively coordinates within approval boundaries).';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."DefaultDataAccessMode" IS 'Default entity access ceiling when no explicit rule in EntityAccessRules matches: UserCeiling (inherit user''s MJ permissions), ReadOnly (read permitted entities, block all writes unless explicitly allowed), or AllowListOnly (deny all entities not listed in EntityAccessRules).';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."EmailChannelMode" IS 'Email channel permission level: Disabled, ReadOnly, DraftOnly, SendAsAgent, or SendAsUser.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."PhoneChannelMode" IS 'Telephony channel permission level: Disabled, InboundOnly, OutboundWithApproval, or OutboundAutonomous.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."MessagingChannelMode" IS 'Messaging channel permission level (Slack/Teams/In-App): Disabled or Enabled.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."CalendarChannelMode" IS 'Calendar channel permission level: Disabled, ReadOnly (check events & free/busy only), ProposeWithApproval (create/modify events or send invites only with explicit user approval), or Autonomous.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."AllowInterAgentCoordination" IS 'Whether this user''s agent may send or respond to structured coordination requests from other users'' Chief of Staff agents.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."RequireApprovalForExternalComms" IS 'When 1, any external email, message, or outbound call to non-internal recipients requires explicit user approval via AIAgentRequest.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."RequireApprovalForFinancials" IS 'When 1, financial commitments, purchases, or accounting/order approvals require explicit user approval.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."RequireApprovalForDestructiveActions" IS 'When 1, deleting records or cancelling active workflows requires explicit user approval.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."AutoApproveAmountThreshold" IS 'Optional monetary threshold below which low-risk financial actions may proceed when RequireApprovalForFinancials is 0. NULL means no automatic monetary threshold.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."EntityAccessRules" IS 'JSON array of IAgentUserEntityAccessRule objects defining per-entity or wildcard CRUD narrowing, additional Row-Level Security (RLS) filters, additional Field-Level Security (FLS) field masks, and allowed time windows.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."ActionPolicyRules" IS 'JSON array of IAgentUserActionPolicyRule objects defining per-action Allow/RequireApproval/Deny policies, SafeExpressionEvaluator parameter conditions, and allowed time windows.';

COMMENT ON COLUMN __mj."AIAgentUserPolicy"."InstructionsOverride" IS 'Optional user-specific standing instructions injected into the agent''s system context on every run.';

COMMENT ON COLUMN __mj."UserRoutine"."RoutineType" IS 'Scheduled (user cron routine), Monitoring (OnChange detection via result hashing), or AgentWake (autonomous agent self-scheduled wake/monitor entry, hidden from the default user cron list).';

COMMENT ON COLUMN __mj."UserRoutine"."CronExpression" IS 'Standard cron expression evaluated by the dispatcher for Recurring and Adaptive routines. NULL when ScheduleMode is OneShot.';

COMMENT ON COLUMN __mj."UserRoutine"."ScheduleMode" IS 'Scheduling mode: Recurring (fixed cron schedule), OneShot (single future wake at NextRunAt, auto-disables after firing unless rescheduled by the agent), or Adaptive (fallback CronExpression combined with agent-set NextRunAt and event/condition wake gates).';

COMMENT ON COLUMN __mj."UserRoutine"."WakeConfiguration" IS 'Optional JSON configuration (IRoutineWakeConfiguration) specifying watchedEntities for durable watermark/RecordChange polling and the 3-tier wake gate (Tier 1 SafeExpressionEvaluator, Tier 2 AIDecisionRunner fast decision model, Tier 3 AIPromptRunner metadata prompt).';

COMMENT ON COLUMN __mj."UserRoutine"."LastCheckedAt" IS 'Timestamp when the dispatcher last evaluated this routine''s watched entities and wake gate conditions.';

COMMENT ON COLUMN __mj."AIBridgeAgentIdentity"."UserID" IS 'Optional owning MJ User when this email address, phone DID, or platform account identity is dedicated to a specific user''s personal agent instance (such as their Chief of Staff). NULL for shared/org-wide agent identities.';

COMMENT ON COLUMN __mj."CommunicationProvider"."SupportsCalendar" IS 'Whether the provider supports calendar event reading, creation, updating, and invitation responses.';

COMMENT ON COLUMN __mj."CommunicationProvider"."SupportsFreeBusy" IS 'Whether the provider supports checking free/busy schedules and finding optimal meeting times.';

COMMENT ON COLUMN __mj."CommunicationProvider"."EnterpriseScopeMode" IS 'Enterprise mailbox scope posture for this provider: UtilityMailboxesOnly (restricted to shared/agent utility mailboxes), SecurityGroupScoped (Exchange RBAC / Workspace group-scoped user mailboxes), or TenantWide.';

COMMENT ON COLUMN __mj."CommunicationProvider"."AllowedEmailDomains" IS 'Optional comma-separated list of corporate email domains permitted for user-scoped mailbox and calendar operations (e.g., "company.com,subsidiary.com").';

COMMENT ON COLUMN __mj."CommunicationProvider"."DefaultCredentialID" IS 'Optional default MJ Credential used by this communication provider when no per-request credential override is supplied.';

/* ===================================================================================== */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* Everything below was produced by `mj codegen` from the hand-written DDL above: */
/* Entity/EntityField/EntityPermission/ApplicationEntity rows, regenerated views, */
/* spCreate/spUpdate/spDelete procedures, FK indexes, grants and extended properties. */
/* If the DDL above changes, re-run CodeGen and replace this whole section. */
/* The PostgreSQL counterpart is deferred to the release build. */
/* ===================================================================================== */
/* SQL generated to create new entity MJ: AI Agent User Policies */
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
    '62925804-d598-45a7-a338-b2604ae96f11',
    'MJ: AI Agent User Policies',
    'AI Agent User Policies',
    'Per-(Agent, User) policy and personalization record. The owning user''s MJ permissions (Entity CRUD, Role RLS, Role FLS) form the hard ceiling; this table defines strict narrowing rules, channel modes, time windows, and approval gates.',
    NULL,
    'AIAgentUserPolicy',
    'vwAIAgentUserPolicies',
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
/* SQL generated to add new entity MJ: AI Agent User Policies to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '62925804-d598-45a7-a338-b2604ae96f11',
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
/* SQL generated to add new permission for entity MJ: AI Agent User Policies for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('62925804-d598-45a7-a338-b2604ae96f11' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('62925804-d598-45a7-a338-b2604ae96f11' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: AI Agent User Policies for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('62925804-d598-45a7-a338-b2604ae96f11' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('62925804-d598-45a7-a338-b2604ae96f11' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: AI Agent User Policies for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('62925804-d598-45a7-a338-b2604ae96f11' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('62925804-d598-45a7-a338-b2604ae96f11' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."AIAgentUserPolicy"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentUserPolicy */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.AIAgentUserPolicy */
UPDATE __mj."AIAgentUserPolicy" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentUserPolicy' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentUserPolicy" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentUserPolicy" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."AIAgentUserPolicy"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentUserPolicy */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.AIAgentUserPolicy */
UPDATE __mj."AIAgentUserPolicy" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'AIAgentUserPolicy' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."AIAgentUserPolicy" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."AIAgentUserPolicy" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3a5a68e7-0e64-4fd3-bc77-202790e665c9' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'ScheduleMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3a5a68e7-0e64-4fd3-bc77-202790e665c9', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'), 'ScheduleMode', 'Schedule Mode', 'Scheduling mode: Recurring (fixed cron schedule), OneShot (single future wake at NextRunAt, auto-disables after firing unless rescheduled by the agent), or Adaptive (fallback CronExpression combined with agent-set NextRunAt and event/condition wake gates).', 'nvarchar', 40, 0, 0, FALSE, 'Recurring', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '992d99e1-1981-48f5-9775-b463da7d5a01' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'WakeConfiguration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('992d99e1-1981-48f5-9775-b463da7d5a01', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'), 'WakeConfiguration', 'Wake Configuration', 'Optional JSON configuration (IRoutineWakeConfiguration) specifying watchedEntities for durable watermark/RecordChange polling and the 3-tier wake gate (Tier 1 SafeExpressionEvaluator, Tier 2 AIDecisionRunner fast decision model, Tier 3 AIPromptRunner metadata prompt).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f2adae80-f66a-4680-91d4-490929a755a5' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'LastCheckedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f2adae80-f66a-4680-91d4-490929a755a5', 'D6CA6018-D288-4F79-B6A9-168C75C3363B' /* Entity: MJ: User Routines */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'), 'LastCheckedAt', 'Last Checked At', 'Timestamp when the dispatcher last evaluated this routine''s watched entities and wake gate conditions.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef8683e5-db2c-4770-893a-5c34319018b8' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ef8683e5-db2c-4770-893a-5c34319018b8', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77'), 'UserID', 'User ID', 'Optional owning MJ User when this email address, phone DID, or platform account identity is dedicated to a specific user''s personal agent instance (such as their Chief of Staff). NULL for shared/org-wide agent identities.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc0d7661-b44e-4b26-979e-c01c0378895d' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cc0d7661-b44e-4b26-979e-c01c0378895d', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1fdc4b8-66d0-4fda-b90b-c22634b19645' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'AgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1fdc4b8-66d0-4fda-b90b-c22634b19645', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'AgentID', 'Agent ID', 'The AI Agent governed by this user policy.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cfa96b9c-36ef-40eb-9d35-fd70d0e31cc3' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cfa96b9c-36ef-40eb-9d35-fd70d0e31cc3', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'UserID', 'User ID', 'The MJ User who owns this policy and under whose security principal the agent executes.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6f489e4-a280-406b-8386-200acfb10313' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'DisplayNameOverride')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6f489e4-a280-406b-8386-200acfb10313', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'DisplayNameOverride', 'Display Name Override', 'Optional user-personalized display name for this agent (e.g., "Maya" for a user''s Chief of Staff).', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '95d689f2-dbee-4840-b5df-d6d24a6351a3' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'PreferredPersonaID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('95d689f2-dbee-4840-b5df-d6d24a6351a3', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'PreferredPersonaID', 'Preferred Persona ID', 'Optional AI Persona selected by the user for this agent''s voice and communication style.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '99F3E501-8443-4C39-9D4C-77F712B1ACA1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '47d94cda-2fa2-4c40-a5eb-b32d1371543e' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('47d94cda-2fa2-4c40-a5eb-b32d1371543e', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'Status', 'Status', 'Policy lifecycle status: Active, Paused (autonomous wakes suspended), or Disabled.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3de526d0-d6b1-4949-ad40-b21527eb3fae' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'OnboardingStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3de526d0-d6b1-4949-ad40-b21527eb3fae', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'OnboardingStatus', 'Onboarding Status', 'Onboarding progression for this user-agent pair: NotStarted, InProgress, or Completed.', 'nvarchar', 40, 0, 0, FALSE, 'NotStarted', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e849cd39-2905-4cb7-99f5-5be8d71152f5' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'OnboardedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e849cd39-2905-4cb7-99f5-5be8d71152f5', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'OnboardedAt', 'Onboarded At', 'Timestamp when the user completed onboarding for this agent.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2588bd34-b6ec-4daa-a21a-c06207a09e2b' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'CoordinationMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2588bd34-b6ec-4daa-a21a-c06207a09e2b', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'CoordinationMode', 'Coordination Mode', 'Operating posture: Observer (tracks and reports only; never nudges others), Coordinator (nudges internal task/priority owners and peer CoS agents), or Autonomous (proactively coordinates within approval boundaries).', 'nvarchar', 40, 0, 0, FALSE, 'Observer', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7769baad-00ee-4ae0-84b9-27dbe533f516' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'DefaultDataAccessMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7769baad-00ee-4ae0-84b9-27dbe533f516', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'DefaultDataAccessMode', 'Default Data Access Mode', 'Default entity access ceiling when no explicit rule in EntityAccessRules matches: UserCeiling (inherit user''s MJ permissions), ReadOnly (read permitted entities, block all writes unless explicitly allowed), or AllowListOnly (deny all entities not listed in EntityAccessRules).', 'nvarchar', 40, 0, 0, FALSE, 'UserCeiling', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eed4bc94-5c87-4cf3-a16c-84330f9f1f5e' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'EmailChannelMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eed4bc94-5c87-4cf3-a16c-84330f9f1f5e', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'EmailChannelMode', 'Email Channel Mode', 'Email channel permission level: Disabled, ReadOnly, DraftOnly, SendAsAgent, or SendAsUser.', 'nvarchar', 40, 0, 0, FALSE, 'DraftOnly', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '150bacbb-fe44-4e80-a70b-61c1f426f584' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'PhoneChannelMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('150bacbb-fe44-4e80-a70b-61c1f426f584', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'PhoneChannelMode', 'Phone Channel Mode', 'Telephony channel permission level: Disabled, InboundOnly, OutboundWithApproval, or OutboundAutonomous.', 'nvarchar', 40, 0, 0, FALSE, 'InboundOnly', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7078dbbf-57c3-4da8-81aa-4c3b85f3e173' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'MessagingChannelMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7078dbbf-57c3-4da8-81aa-4c3b85f3e173', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'MessagingChannelMode', 'Messaging Channel Mode', 'Messaging channel permission level (Slack/Teams/In-App): Disabled or Enabled.', 'nvarchar', 40, 0, 0, FALSE, 'Enabled', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7ce2251d-8771-4d1e-9a5c-f38ddca52a15' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'AllowInterAgentCoordination')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7ce2251d-8771-4d1e-9a5c-f38ddca52a15', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'AllowInterAgentCoordination', 'Allow Inter Agent Coordination', 'Whether this user''s agent may send or respond to structured coordination requests from other users'' Chief of Staff agents.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffff6f77-0d32-461e-8ddc-6a411ee133f9' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'RequireApprovalForExternalComms')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ffff6f77-0d32-461e-8ddc-6a411ee133f9', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'RequireApprovalForExternalComms', 'Require Approval For External Comms', 'When 1, any external email, message, or outbound call to non-internal recipients requires explicit user approval via AIAgentRequest.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86e7e9f3-c1eb-4cc5-bbd2-cb6b4a01f3e9' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'RequireApprovalForFinancials')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86e7e9f3-c1eb-4cc5-bbd2-cb6b4a01f3e9', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'RequireApprovalForFinancials', 'Require Approval For Financials', 'When 1, financial commitments, purchases, or accounting/order approvals require explicit user approval.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd382c36a-24c8-43c9-bd74-aa67ead537f2' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'RequireApprovalForDestructiveActions')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d382c36a-24c8-43c9-bd74-aa67ead537f2', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'RequireApprovalForDestructiveActions', 'Require Approval For Destructive Actions', 'When 1, deleting records or cancelling active workflows requires explicit user approval.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '74497616-64dc-4de8-9d62-ca0ae2c46177' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'AutoApproveAmountThreshold')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('74497616-64dc-4de8-9d62-ca0ae2c46177', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'AutoApproveAmountThreshold', 'Auto Approve Amount Threshold', 'Optional monetary threshold below which low-risk financial actions may proceed when RequireApprovalForFinancials is 0. NULL means no automatic monetary threshold.', 'decimal', 9, 18, 2, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b99e673-8c44-48f8-b041-39c4699bc194' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'EntityAccessRules')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6b99e673-8c44-48f8-b041-39c4699bc194', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'EntityAccessRules', 'Entity Access Rules', 'JSON array of IAgentUserEntityAccessRule objects defining per-entity or wildcard CRUD narrowing, additional Row-Level Security (RLS) filters, additional Field-Level Security (FLS) field masks, and allowed time windows.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '77acde28-89c4-42f9-b34e-cea7695c88b1' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'ActionPolicyRules')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('77acde28-89c4-42f9-b34e-cea7695c88b1', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'ActionPolicyRules', 'Action Policy Rules', 'JSON array of IAgentUserActionPolicyRule objects defining per-action Allow/RequireApproval/Deny policies, SafeExpressionEvaluator parameter conditions, and allowed time windows.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '915ccbaf-6129-4da5-a78e-6aa332ef0dcd' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'InstructionsOverride')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('915ccbaf-6129-4da5-a78e-6aa332ef0dcd', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'InstructionsOverride', 'Instructions Override', 'Optional user-specific standing instructions injected into the agent''s system context on every run.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '019114d7-9be8-415c-990b-9bf0ba067e59' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('019114d7-9be8-415c-990b-9bf0ba067e59', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4e21cc5-c318-469b-a486-5fe0fb11ac41' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d4e21cc5-c318-469b-a486-5fe0fb11ac41', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID e11e8a9a-e31c-4ba6-adb0-eeedd7faee0a */
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
    'e11e8a9a-e31c-4ba6-adb0-eeedd7faee0a',
    '47D94CDA-2FA2-4C40-A5EB-B32D1371543E',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7aa26036-bf9f-485b-b0ae-255e6c2fd481 */
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
    '7aa26036-bf9f-485b-b0ae-255e6c2fd481',
    '47D94CDA-2FA2-4C40-A5EB-B32D1371543E',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5ab55fca-f91e-4556-99e5-44b47f289ac6 */
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
    '5ab55fca-f91e-4556-99e5-44b47f289ac6',
    '47D94CDA-2FA2-4C40-A5EB-B32D1371543E',
    3,
    'Paused',
    'Paused',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 47D94CDA-2FA2-4C40-A5EB-B32D1371543E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '47D94CDA-2FA2-4C40-A5EB-B32D1371543E';
/* SQL text to insert entity field value with ID 8ff96dc7-bbf9-4c39-85bb-bdefe1cc2c51 */
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
    '8ff96dc7-bbf9-4c39-85bb-bdefe1cc2c51',
    '3DE526D0-D6B1-4949-AD40-B21527EB3FAE',
    1,
    'Completed',
    'Completed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b694b2d9-e91b-4719-ab81-c12ac13000d1 */
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
    'b694b2d9-e91b-4719-ab81-c12ac13000d1',
    '3DE526D0-D6B1-4949-AD40-B21527EB3FAE',
    2,
    'InProgress',
    'InProgress',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 998afe34-c3b8-489e-a956-850b760a40ca */
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
    '998afe34-c3b8-489e-a956-850b760a40ca',
    '3DE526D0-D6B1-4949-AD40-B21527EB3FAE',
    3,
    'NotStarted',
    'NotStarted',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 3DE526D0-D6B1-4949-AD40-B21527EB3FAE */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3DE526D0-D6B1-4949-AD40-B21527EB3FAE';
/* SQL text to insert entity field value with ID 4f51f9a6-ede6-49a1-b920-a2482974ef5d */
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
    '4f51f9a6-ede6-49a1-b920-a2482974ef5d',
    '2588BD34-B6EC-4DAA-A21A-C06207A09E2B',
    1,
    'Autonomous',
    'Autonomous',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 79739d82-e160-4a7e-a0b8-2d182349e1e8 */
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
    '79739d82-e160-4a7e-a0b8-2d182349e1e8',
    '2588BD34-B6EC-4DAA-A21A-C06207A09E2B',
    2,
    'Coordinator',
    'Coordinator',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c00d6eb3-10a9-4100-94de-b73086bb3086 */
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
    'c00d6eb3-10a9-4100-94de-b73086bb3086',
    '2588BD34-B6EC-4DAA-A21A-C06207A09E2B',
    3,
    'Observer',
    'Observer',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2588BD34-B6EC-4DAA-A21A-C06207A09E2B */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2588BD34-B6EC-4DAA-A21A-C06207A09E2B';
/* SQL text to insert entity field value with ID 9f2d421a-3712-4b29-840c-dc1027f9ed96 */
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
    '9f2d421a-3712-4b29-840c-dc1027f9ed96',
    '7769BAAD-00EE-4AE0-84B9-27DBE533F516',
    1,
    'AllowListOnly',
    'AllowListOnly',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 299ffe1d-f5ab-43ab-8a5e-b2c0f644ea14 */
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
    '299ffe1d-f5ab-43ab-8a5e-b2c0f644ea14',
    '7769BAAD-00EE-4AE0-84B9-27DBE533F516',
    2,
    'ReadOnly',
    'ReadOnly',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 05cc9a32-15c1-4c9c-97ed-c6ae65ecd191 */
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
    '05cc9a32-15c1-4c9c-97ed-c6ae65ecd191',
    '7769BAAD-00EE-4AE0-84B9-27DBE533F516',
    3,
    'UserCeiling',
    'UserCeiling',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7769BAAD-00EE-4AE0-84B9-27DBE533F516 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7769BAAD-00EE-4AE0-84B9-27DBE533F516';
/* SQL text to insert entity field value with ID 37dcba8b-4c68-426f-82cb-1aabfd40d62e */
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
    '37dcba8b-4c68-426f-82cb-1aabfd40d62e',
    'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E',
    1,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d359447d-715c-4ae9-a3f2-2e70ec8aea49 */
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
    'd359447d-715c-4ae9-a3f2-2e70ec8aea49',
    'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E',
    2,
    'DraftOnly',
    'DraftOnly',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID fe873840-18fc-4636-850f-ed387990446e */
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
    'fe873840-18fc-4636-850f-ed387990446e',
    'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E',
    3,
    'ReadOnly',
    'ReadOnly',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ae5967a2-3e33-4121-8a35-1e0a4318472d */
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
    'ae5967a2-3e33-4121-8a35-1e0a4318472d',
    'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E',
    4,
    'SendAsAgent',
    'SendAsAgent',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 96d25015-999a-4ef9-9a5a-5f1dc049f6b6 */
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
    '96d25015-999a-4ef9-9a5a-5f1dc049f6b6',
    'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E',
    5,
    'SendAsUser',
    'SendAsUser',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID EED4BC94-5C87-4CF3-A16C-84330F9F1F5E */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E';
/* SQL text to insert entity field value with ID 5ced1016-35b9-4ed0-ad87-ef07452cfed2 */
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
    '5ced1016-35b9-4ed0-ad87-ef07452cfed2',
    '150BACBB-FE44-4E80-A70B-61C1F426F584',
    1,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 294b4a1a-e1cc-4fc7-8f14-65b826647e1f */
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
    '294b4a1a-e1cc-4fc7-8f14-65b826647e1f',
    '150BACBB-FE44-4E80-A70B-61C1F426F584',
    2,
    'InboundOnly',
    'InboundOnly',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b9c3c630-f15b-48cd-85ab-00ac9f24a1ee */
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
    'b9c3c630-f15b-48cd-85ab-00ac9f24a1ee',
    '150BACBB-FE44-4E80-A70B-61C1F426F584',
    3,
    'OutboundAutonomous',
    'OutboundAutonomous',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5ddd0f13-f998-479a-ae96-8516e939a5bd */
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
    '5ddd0f13-f998-479a-ae96-8516e939a5bd',
    '150BACBB-FE44-4E80-A70B-61C1F426F584',
    4,
    'OutboundWithApproval',
    'OutboundWithApproval',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 150BACBB-FE44-4E80-A70B-61C1F426F584 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '150BACBB-FE44-4E80-A70B-61C1F426F584';
/* SQL text to insert entity field value with ID 0508b291-9bda-4228-a7f6-07cfa4506b7b */
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
    '0508b291-9bda-4228-a7f6-07cfa4506b7b',
    '7078DBBF-57C3-4DA8-81AA-4C3B85F3E173',
    1,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a3632ec7-7eec-461b-b4c3-3b82a155f70f */
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
    'a3632ec7-7eec-461b-b4c3-3b82a155f70f',
    '7078DBBF-57C3-4DA8-81AA-4C3B85F3E173',
    2,
    'Enabled',
    'Enabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7078DBBF-57C3-4DA8-81AA-4C3B85F3E173 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7078DBBF-57C3-4DA8-81AA-4C3B85F3E173';
/* SQL text to insert entity field value with ID 85ca9ab5-374c-4fb0-a80d-3cda85835a8f */
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
    '85ca9ab5-374c-4fb0-a80d-3cda85835a8f',
    '2644D5FA-E13F-4CCD-8C0F-582A223D6790',
    1,
    'AgentWake',
    'AgentWake',
    NOW(),
    NOW()
  );
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 2
WHERE
  "ID" = '8077C277-68BA-45C6-B9C2-BCBB70710EEB';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 3
WHERE
  "ID" = '6E618ABD-DD66-4C80-BA30-889CC2095EA9';
/* SQL text to insert entity field value with ID 46f16318-d89e-4722-9d68-f8dc0c03380b */
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
    '46f16318-d89e-4722-9d68-f8dc0c03380b',
    '3A5A68E7-0E64-4FD3-BC77-202790E665C9',
    1,
    'Adaptive',
    'Adaptive',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 22033c3d-a3b1-4266-9925-70783375e46b */
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
    '22033c3d-a3b1-4266-9925-70783375e46b',
    '3A5A68E7-0E64-4FD3-BC77-202790E665C9',
    2,
    'OneShot',
    'OneShot',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7c520a85-5c49-4cbf-bad2-9823889b8de4 */
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
    '7c520a85-5c49-4cbf-bad2-9823889b8de4',
    '3A5A68E7-0E64-4FD3-BC77-202790E665C9',
    3,
    'Recurring',
    'Recurring',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 3A5A68E7-0E64-4FD3-BC77-202790E665C9 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3A5A68E7-0E64-4FD3-BC77-202790E665C9';
/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" IN (
    SELECT
      "e"."ID"
    FROM __mj."Entity" AS "e"
    WHERE
      "e"."AllowUserSearchAPI" = TRUE
      AND "e"."AutoUpdateAllowUserSearchAPI" = TRUE
      AND "e"."VirtualEntity" = FALSE
      AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
      AND NOT "e"."SchemaName" IN ('sys', 'staging')
      AND NOT EXISTS(
        SELECT
          1
        FROM __mj."EntityField" AS "f2"
        WHERE
          "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
      )
  );
/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent User Policies (One To Many via AgentID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ca645949-6a87-43d8-a2cc-7bd275a2e759') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ca645949-6a87-43d8-a2cc-7bd275a2e759', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '62925804-D598-45A7-A338-B2604AE96F11', 'AgentID', 'One To Many', TRUE, TRUE, 46, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd2febb8a-12a8-4e4d-8f8a-b7ac90a36c0c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d2febb8a-12a8-4e4d-8f8a-b7ac90a36c0c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77', 'UserID', 'One To Many', TRUE, TRUE, 126, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c9605090-f8ef-4917-9d7d-f9c98f41b6be') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c9605090-f8ef-4917-9d7d-f9c98f41b6be', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '62925804-D598-45A7-A338-B2604AE96F11', 'UserID', 'One To Many', TRUE, TRUE, 127, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '58faf5a5-9351-4535-8539-aea6e710f1ba') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58faf5a5-9351-4535-8539-aea6e710f1ba', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', '62925804-D598-45A7-A338-B2604AE96F11', 'PreferredPersonaID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9048575e-0594-4e71-b338-c4fbd1163a99' OR ("EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9048575e-0594-4e71-b338-c4fbd1163a99', '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77' /* Entity: MJ: AI Bridge Agent Identities */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '7EFB8744-CF96-4C61-8A78-92FAC4FE1B77'), 'User', 'User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c2d186ed-aeda-4eef-a720-86427c3bd81d' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'Agent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c2d186ed-aeda-4eef-a720-86427c3bd81d', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'Agent', 'Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '723b48e3-6b94-451c-a0b9-7570a411eafb' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('723b48e3-6b94-451c-a0b9-7570a411eafb', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'User', 'User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '928d9742-9205-451f-95b1-4272c37a01bf' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'PreferredPersona')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('928d9742-9205-451f-95b1-4272c37a01bf', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'PreferredPersona', 'Preferred Persona', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3A5A68E7-0E64-4FD3-BC77-202790E665C9'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Identity Assignment', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = 'EF8683E5-DB2C-4770-893A-5C34319018B8';
/* UPDATE Entity Field Category Info MJ: AI Bridge Agent Identities.User */
UPDATE __mj."EntityField" SET "Category" = 'Identity Assignment', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name'
WHERE
  "ID" = '9048575E-0594-4E71-B338-C4FBD1163A99';

/* Set categories for 3 fields */
/* UPDATE Entity Field Category Info MJ: User Routines.ScheduleMode */
UPDATE __mj."EntityField" SET "Category" = 'Scheduling and Timing', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3A5A68E7-0E64-4FD3-BC77-202790E665C9';
/* UPDATE Entity Field Category Info MJ: User Routines.WakeConfiguration */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '992D99E1-1981-48F5-9775-B463DA7D5A01';
/* UPDATE Entity Field Category Info MJ: User Routines.LastCheckedAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution History', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F2ADAE80-F66A-4680-91D4-490929A755A5';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '47D94CDA-2FA2-4C40-A5EB-B32D1371543E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3DE526D0-D6B1-4949-AD40-B21527EB3FAE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '2588BD34-B6EC-4DAA-A21A-C06207A09E2B'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C2D186ED-AEDA-4EEF-A720-86427C3BD81D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '723B48E3-6B94-451C-A0B9-7570A411EAFB'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 26 fields */
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CC0D7661-B44E-4B26-979E-C01C0378895D';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.AgentID */
UPDATE __mj."EntityField" SET "Category" = 'Policy Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent'
WHERE
  "ID" = 'F1FDC4B8-66D0-4FDA-B90B-C22634B19645';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Policy Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = 'CFA96B9C-36EF-40EB-9D35-FD70D0E31CC3';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.DisplayNameOverride */
UPDATE __mj."EntityField" SET "Category" = 'Personalization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A6F489E4-A280-406B-8386-200ACFB10313';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.PreferredPersonaID */
UPDATE __mj."EntityField" SET "Category" = 'Personalization', "GeneratedFormSection" = 'Category', "DisplayName" = 'Preferred Persona'
WHERE
  "ID" = '95D689F2-DBEE-4840-B5DF-D6D24A6351A3';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.Status */
UPDATE __mj."EntityField" SET "Category" = 'Policy Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '47D94CDA-2FA2-4C40-A5EB-B32D1371543E';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.OnboardingStatus */
UPDATE __mj."EntityField" SET "Category" = 'Onboarding', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3DE526D0-D6B1-4949-AD40-B21527EB3FAE';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.OnboardedAt */
UPDATE __mj."EntityField" SET "Category" = 'Onboarding', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E849CD39-2905-4CB7-99F5-5BE8D71152F5';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.CoordinationMode */
UPDATE __mj."EntityField" SET "Category" = 'Policy Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2588BD34-B6EC-4DAA-A21A-C06207A09E2B';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.DefaultDataAccessMode */
UPDATE __mj."EntityField" SET "Category" = 'Security and Access Control', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7769BAAD-00EE-4AE0-84B9-27DBE533F516';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.EmailChannelMode */
UPDATE __mj."EntityField" SET "Category" = 'Channel Permissions', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'EED4BC94-5C87-4CF3-A16C-84330F9F1F5E';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.PhoneChannelMode */
UPDATE __mj."EntityField" SET "Category" = 'Channel Permissions', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '150BACBB-FE44-4E80-A70B-61C1F426F584';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.MessagingChannelMode */
UPDATE __mj."EntityField" SET "Category" = 'Channel Permissions', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7078DBBF-57C3-4DA8-81AA-4C3B85F3E173';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.AllowInterAgentCoordination */
UPDATE __mj."EntityField" SET "Category" = 'Channel Permissions', "GeneratedFormSection" = 'Category', "DisplayName" = 'Allow Inter-Agent Coordination'
WHERE
  "ID" = '7CE2251D-8771-4D1E-9A5C-F38DDCA52A15';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.RequireApprovalForExternalComms */
UPDATE __mj."EntityField" SET "Category" = 'Approval Gates', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FFFF6F77-0D32-461E-8DDC-6A411EE133F9';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.RequireApprovalForFinancials */
UPDATE __mj."EntityField" SET "Category" = 'Approval Gates', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '86E7E9F3-C1EB-4CC5-BBD2-CB6B4A01F3E9';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.RequireApprovalForDestructiveActions */
UPDATE __mj."EntityField" SET "Category" = 'Approval Gates', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D382C36A-24C8-43C9-BD74-AA67EAD537F2';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.AutoApproveAmountThreshold */
UPDATE __mj."EntityField" SET "Category" = 'Approval Gates', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '74497616-64DC-4DE8-9D62-CA0AE2C46177';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.EntityAccessRules */
UPDATE __mj."EntityField" SET "Category" = 'Security and Access Control', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '6B99E673-8C44-48F8-B041-39C4699BC194';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.ActionPolicyRules */
UPDATE __mj."EntityField" SET "Category" = 'Security and Access Control', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '77ACDE28-89C4-42F9-B34E-CEA7695C88B1';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.InstructionsOverride */
UPDATE __mj."EntityField" SET "Category" = 'Personalization', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '915CCBAF-6129-4DA5-A78E-6AA332EF0DCD';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '019114D7-9BE8-415C-990B-9BF0BA067E59';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D4E21CC5-C318-469B-A486-5FE0FB11AC41';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.Agent */
UPDATE __mj."EntityField" SET "Category" = 'Policy Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent Name'
WHERE
  "ID" = 'C2D186ED-AEDA-4EEF-A720-86427C3BD81D';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.User */
UPDATE __mj."EntityField" SET "Category" = 'Policy Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'User Name'
WHERE
  "ID" = '723B48E3-6B94-451C-A0B9-7570A411EAFB';
/* UPDATE Entity Field Category Info MJ: AI Agent User Policies.PreferredPersona */
UPDATE __mj."EntityField" SET "Category" = 'Personalization', "GeneratedFormSection" = 'Category', "DisplayName" = 'Preferred Persona Name'
WHERE
  "ID" = '928D9742-9205-451F-95B1-4272C37A01BF';

/* Set entity icon to fa fa-shield-alt */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-shield-alt', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '62925804-D598-45A7-A338-B2604AE96F11';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a4175944-977c-5f43-8bfe-85176500fcae', '62925804-D598-45A7-A338-B2604AE96F11', 'FieldCategoryInfo', '{
  "Approval Gates": {
    "description": "Rules requiring user approval for financials, communications, and destructive actions",
    "icon": "fa fa-user-check"
  },
  "Channel Permissions": {
    "description": "Communication channel modes and inter-agent coordination settings",
    "icon": "fa fa-comments"
  },
  "Onboarding": {
    "description": "Onboarding progression and completion timestamps",
    "icon": "fa fa-clipboard-check"
  },
  "Personalization": {
    "description": "User-specific personas, display names, and standing instructions",
    "icon": "fa fa-user-cog"
  },
  "Policy Configuration": {
    "description": "Core configuration settings, lifecycle status, and agent-user mapping",
    "icon": "fa fa-sliders-h"
  },
  "Security and Access Control": {
    "description": "Data access modes, entity access rules, and action policies",
    "icon": "fa fa-lock"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86ae61e4-8ecb-5205-9036-0a08c2704dd8', '62925804-D598-45A7-A338-B2604AE96F11', 'FieldCategoryIcons', '{
  "Approval Gates": "fa fa-user-check",
  "Channel Permissions": "fa fa-comments",
  "Onboarding": "fa fa-clipboard-check",
  "Personalization": "fa fa-user-cog",
  "Policy Configuration": "fa fa-sliders-h",
  "Security and Access Control": "fa fa-lock",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf2f9acf-fd11-4d00-8520-6679bb62aaa7' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SupportsCalendar')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cf2f9acf-fd11-4d00-8520-6679bb62aaa7', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'SupportsCalendar', 'Supports Calendar', 'Whether the provider supports calendar event reading, creation, updating, and invitation responses.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7f74ce9c-d214-4f3b-9506-e0901387dd8b' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SupportsFreeBusy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7f74ce9c-d214-4f3b-9506-e0901387dd8b', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'SupportsFreeBusy', 'Supports Free Busy', 'Whether the provider supports checking free/busy schedules and finding optimal meeting times.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8eba1516-7bc5-4584-be65-471cbe1a24f2' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EnterpriseScopeMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8eba1516-7bc5-4584-be65-471cbe1a24f2', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'EnterpriseScopeMode', 'Enterprise Scope Mode', 'Enterprise mailbox scope posture for this provider: UtilityMailboxesOnly (restricted to shared/agent utility mailboxes), SecurityGroupScoped (Exchange RBAC / Workspace group-scoped user mailboxes), or TenantWide.', 'nvarchar', 80, 0, 0, FALSE, 'UtilityMailboxesOnly', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4cf9c95e-5d34-4e87-89cc-4f1ae66cb221' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowedEmailDomains')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4cf9c95e-5d34-4e87-89cc-4f1ae66cb221', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'AllowedEmailDomains', 'Allowed Email Domains', 'Optional comma-separated list of corporate email domains permitted for user-scoped mailbox and calendar operations (e.g., "company.com,subsidiary.com").', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'df6d1620-4c4d-4818-ba5a-418961df4ef0' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'DefaultCredentialID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('df6d1620-4c4d-4818-ba5a-418961df4ef0', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'DefaultCredentialID', 'Default Credential ID', 'Optional default MJ Credential used by this communication provider when no per-request credential override is supplied.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae8babc0-f436-4374-a0d9-c69b1819cfcb' OR ("EntityID" = '62925804-D598-45A7-A338-B2604AE96F11' AND "Name" = 'CalendarChannelMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ae8babc0-f436-4374-a0d9-c69b1819cfcb', '62925804-D598-45A7-A338-B2604AE96F11' /* Entity: MJ: AI Agent User Policies */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '62925804-D598-45A7-A338-B2604AE96F11'), 'CalendarChannelMode', 'Calendar Channel Mode', 'Calendar channel permission level: Disabled, ReadOnly (check events & free/busy only), ProposeWithApproval (create/modify events or send invites only with explicit user approval), or Autonomous.', 'nvarchar', 60, 0, 0, FALSE, 'ReadOnly', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field values for CalendarChannelMode & EnterpriseScopeMode */
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
    '8e6e5444-fc74-4453-bf0d-c7d03b9e29a7',
    'AE8BABC0-F436-4374-A0D9-C69B1819CFCB',
    1,
    'Autonomous',
    'Autonomous',
    NOW(),
    NOW()
  ),
  (
    '0e1113ec-36ee-4ea9-9cb6-3de71e0b004f',
    'AE8BABC0-F436-4374-A0D9-C69B1819CFCB',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  ),
  (
    '12942d04-0c78-483f-81df-7b5c4fdfe128',
    'AE8BABC0-F436-4374-A0D9-C69B1819CFCB',
    3,
    'ProposeWithApproval',
    'ProposeWithApproval',
    NOW(),
    NOW()
  ),
  (
    '20a079a3-e6b6-458f-8db7-14ab5e79afa7',
    'AE8BABC0-F436-4374-A0D9-C69B1819CFCB',
    4,
    'ReadOnly',
    'ReadOnly',
    NOW(),
    NOW()
  );
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'AE8BABC0-F436-4374-A0D9-C69B1819CFCB';
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
    '5be04022-60fa-4064-b31d-fb56590d2884',
    '8EBA1516-7BC5-4584-BE65-471CBE1A24F2',
    1,
    'SecurityGroupScoped',
    'SecurityGroupScoped',
    NOW(),
    NOW()
  ),
  (
    '3b34cce1-ffb1-48fc-bed3-edbfc3f9cabf',
    '8EBA1516-7BC5-4584-BE65-471CBE1A24F2',
    2,
    'TenantWide',
    'TenantWide',
    NOW(),
    NOW()
  ),
  (
    'dd19166a-3e2c-4d7b-8938-717ae1631e5a',
    '8EBA1516-7BC5-4584-BE65-471CBE1A24F2',
    3,
    'UtilityMailboxesOnly',
    'UtilityMailboxesOnly',
    NOW(),
    NOW()
  );
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '8EBA1516-7BC5-4584-BE65-471CBE1A24F2';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bd48be92-95bd-4f49-93d4-5b08c63144ab') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bd48be92-95bd-4f49-93d4-5b08c63144ab', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '43248F34-2837-EF11-86D4-6045BDEE16E6', 'DefaultCredentialID', 'One To Many', TRUE, TRUE, 14, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51226919-5a32-4c83-af58-8233add8699e' OR ("EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'DefaultCredential')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('51226919-5a32-4c83-af58-8233add8699e', '43248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Communication Providers */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '43248F34-2837-EF11-86D4-6045BDEE16E6'), 'DefaultCredential', 'Default Credential', NULL, 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Dropdown', NOW(), NOW());
  END IF;
END $$;

/* UPDATE Entity Field Category Info for CalendarChannelMode and CommunicationProvider fields */
UPDATE __mj."EntityField" SET "Category" = 'Channel Permissions', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AE8BABC0-F436-4374-A0D9-C69B1819CFCB';
UPDATE __mj."EntityField" SET "Category" = 'Advanced Capabilities', "GeneratedFormSection" = 'Category'
WHERE
  "ID" IN ('CF2F9ACF-FD11-4D00-8520-6679BB62AAA7', '7F74CE9C-D214-4F3B-9506-E0901387DD8B');
UPDATE __mj."EntityField" SET "Category" = 'Operational Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" IN (
    '8EBA1516-7BC5-4584-BE65-471CBE1A24F2',
    '4CF9C95E-5D34-4E87-89CC-4F1AE66CB221',
    'DF6D1620-4C4D-4818-BA5A-418961DF4EF0',
    '51226919-5A32-4C83-AF58-8233ADD8699E'
  );
