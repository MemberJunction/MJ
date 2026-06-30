-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606201145__v5.42.x__Record_Set_Processing.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* *************************************************************************************************
 * Migration: Record Set Processing, Record Processes & Remote Operations (full PR DDL)
 *
 * One migration for the entire PR's schema, so it can be run once and CodeGen run once.
 *
 * Tables created (FK order):
 *   1. RecordProcessCategory  (MJ: Record Process Categories)  - hierarchical folder for processes
 *   2. RecordProcess          (MJ: Record Processes)           - the declarative job definition
 *   3. ProcessRun             (MJ: Process Runs)                - source-agnostic run header (generic)
 *   4. ProcessRunDetail       (MJ: Process Run Details)         - generic per-record audit/resume
 *   5. RecordProcessWatermark (MJ: Record Process Watermarks)   - per-record checksum change-detection
 *   6. RemoteOperationCategory(MJ: Remote Operation Categories) - hierarchical folder for operations
 *   7. RemoteOperation        (MJ: Remote Operations)           - typed provider-routed operation defn
 *
 * Schema/DDL only. CodeGen generates the Entity/EntityField metadata, __mj_CreatedAt/__mj_UpdatedAt
 * columns, foreign-key indexes (IDX_AUTO_MJ_FKEY_*), views, and CRUD stored procedures after this
 * migration runs. Lookup ROWS (categories, scheduled-job type, API scopes, remote-operation rows)
 * are seeded later via metadata sync (mj sync), not here.
 *
 * Version: 5.43.x
 ************************************************************************************************* */ /* ##############################################################################################
  #                                                                                            #
  #   PART 1 of 2 — RECORD SET PROCESSING & RECORD PROCESSES                                    #
  #                                                                                            #
  #   The declarative job-definition facade (RecordProcess) plus the generic run/detail        #
  #   audit-and-resume substrate (ProcessRun / ProcessRunDetail), a category folder, and the   #
  #   checksum watermark table. Tables 1-5 below.                                               #
  #                                                                                            #
  ############################################################################################## */ /* ============================================================================ */ /* 1. RecordProcessCategory (MJ: Record Process Categories) */ /* ============================================================================ */
CREATE TABLE __mj."RecordProcessCategory" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ParentID" UUID NULL,
  CONSTRAINT "PK_RecordProcessCategory" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RecordProcessCategory_Parent" FOREIGN KEY ("ParentID") REFERENCES __mj."RecordProcessCategory" (
    "ID"
  )
);

COMMENT ON TABLE __mj."RecordProcessCategory" IS 'Hierarchical folder for organizing Record Processes in the UI. Example: "Customer Lifecycle" with a child category "Retention".';

COMMENT ON COLUMN __mj."RecordProcessCategory"."Name" IS 'Display name of the category';

COMMENT ON COLUMN __mj."RecordProcessCategory"."Description" IS 'Optional description of what belongs in this category';

COMMENT ON COLUMN __mj."RecordProcessCategory"."ParentID" IS 'Self-referencing foreign key to the parent category, enabling a nested folder hierarchy (NULL for a top-level category)';

/* ============================================================================ */ /* 2. RecordProcess (MJ: Record Processes) — the declarative job definition */ /* ============================================================================ */
CREATE TABLE __mj."RecordProcess" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "CategoryID" UUID NULL,
  "EntityID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
  "WorkType" VARCHAR(20) NOT NULL,
  "ActionID" UUID NULL,
  "AgentID" UUID NULL,
  "PromptID" UUID NULL,
  "ScopeType" VARCHAR(20) NOT NULL,
  "ScopeViewID" UUID NULL,
  "ScopeListID" UUID NULL,
  "ScopeFilter" TEXT NULL,
  "OnChangeEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "OnChangeInvocationType" VARCHAR(30) NULL,
  "OnChangeFilter" TEXT NULL,
  "ScheduleEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "CronExpression" VARCHAR(120) NULL,
  "Timezone" VARCHAR(100) NULL DEFAULT 'UTC',
  "OnDemandEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "InputMapping" TEXT NULL,
  "OutputMapping" TEXT NULL,
  "SkipUnchanged" BOOLEAN NOT NULL DEFAULT TRUE,
  "WatermarkStrategy" VARCHAR(20) NULL,
  "BatchSize" INT NULL DEFAULT 100,
  "MaxConcurrency" INT NULL DEFAULT 1,
  CONSTRAINT "PK_RecordProcess" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_RecordProcess_Status" CHECK ("Status" IN ('Draft', 'Active', 'Disabled')),
  CONSTRAINT "CK_RecordProcess_WorkType" CHECK ("WorkType" IN ('Action', 'Agent', 'Infer')),
  CONSTRAINT "CK_RecordProcess_ScopeType" CHECK ("ScopeType" IN ('SingleRecord', 'View', 'List', 'Filter')),
  CONSTRAINT "CK_RecordProcess_OnChangeInvocationType" CHECK ("OnChangeInvocationType" IN ('AfterCreate', 'AfterUpdate', 'AfterDelete', 'Validate')),
  CONSTRAINT "CK_RecordProcess_WatermarkStrategy" CHECK ("WatermarkStrategy" IN ('Checksum', 'UpdatedAt', 'None')),
  CONSTRAINT "FK_RecordProcess_Category" FOREIGN KEY ("CategoryID") REFERENCES __mj."RecordProcessCategory" (
    "ID"
  ),
  CONSTRAINT "FK_RecordProcess_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_RecordProcess_Action" FOREIGN KEY ("ActionID") REFERENCES __mj."Action" (
    "ID"
  ),
  CONSTRAINT "FK_RecordProcess_Agent" FOREIGN KEY ("AgentID") REFERENCES __mj."AIAgent" (
    "ID"
  ),
  CONSTRAINT "FK_RecordProcess_Prompt" FOREIGN KEY ("PromptID") REFERENCES __mj."AIPrompt" (
    "ID"
  ),
  CONSTRAINT "FK_RecordProcess_ScopeView" FOREIGN KEY ("ScopeViewID") REFERENCES __mj."UserView" (
    "ID"
  ),
  CONSTRAINT "FK_RecordProcess_ScopeList" FOREIGN KEY ("ScopeListID") REFERENCES __mj."List" (
    "ID"
  )
);

COMMENT ON TABLE __mj."RecordProcess" IS 'A declarative, reusable job definition that binds three axes of a business process: WORK (an Action or an Agent) x SCOPE (a single record, a User View, a List, or an ad-hoc Filter) x TRIGGER (on-change save hooks, a cron schedule, and/or on demand). One row is one configured process; each execution of it produces a Process Run with per-record Process Run Details. EXAMPLE: a "Weekly Customer Health Summary" row runs the "Customer Summarizer" agent over the "Active Customers" view every Saturday 2am, also whenever a customer''s NPS/support fields change, and on demand; for each customer it infers {satisfaction, sentiment, personalityStyle, summary} and writes satisfaction/sentiment back onto the Customer plus a summary into a Customer Insights child row, skipping customers unchanged since the last run.';

COMMENT ON COLUMN __mj."RecordProcess"."Name" IS 'Human-readable name of the process definition (e.g., "Weekly Customer Health Summary")';

COMMENT ON COLUMN __mj."RecordProcess"."Description" IS 'Optional description of what this process does';

COMMENT ON COLUMN __mj."RecordProcess"."CategoryID" IS 'Optional hierarchical category for organizing this process in the UI';

COMMENT ON COLUMN __mj."RecordProcess"."EntityID" IS 'Foreign key to the target entity whose records this process operates on';

COMMENT ON COLUMN __mj."RecordProcess"."Status" IS 'Lifecycle status: Draft (not yet wired), Active (triggers live), or Disabled';

COMMENT ON COLUMN __mj."RecordProcess"."WorkType" IS 'Whether the work is an Action, an Agent, or an Infer (per-record AI Prompt). Agents are dispatched through the Execute Agent action and must be top-level + ExposeAsAction; Infer runs the AI Prompt named by PromptID for each record and writes its structured output back via OutputMapping.';

COMMENT ON COLUMN __mj."RecordProcess"."ActionID" IS 'Foreign key to the Action to run, when WorkType=Action';

COMMENT ON COLUMN __mj."RecordProcess"."AgentID" IS 'Foreign key to the AI Agent to run, when WorkType=Agent';

COMMENT ON COLUMN __mj."RecordProcess"."PromptID" IS 'Foreign key to the AI Prompt to run for each record, when WorkType=Infer. The prompt''s structured output is written back to the data model via OutputMapping.';

COMMENT ON COLUMN __mj."RecordProcess"."ScopeType" IS 'How the record set is scoped for the Schedule and On-Demand triggers: SingleRecord, View, List, or Filter. The On-Change trigger is always single-record and ignores this.';

COMMENT ON COLUMN __mj."RecordProcess"."ScopeViewID" IS 'Foreign key to the User View defining the scope, when ScopeType=View';

COMMENT ON COLUMN __mj."RecordProcess"."ScopeListID" IS 'Foreign key to the List defining the scope, when ScopeType=List';

COMMENT ON COLUMN __mj."RecordProcess"."ScopeFilter" IS 'Ad-hoc WHERE clause used to resolve the record set, when ScopeType=Filter';

COMMENT ON COLUMN __mj."RecordProcess"."OnChangeEnabled" IS 'When 1, the process runs per-record on save via an owned Entity Action';

COMMENT ON COLUMN __mj."RecordProcess"."OnChangeInvocationType" IS 'Which save event fires the on-change trigger: AfterCreate, AfterUpdate, AfterDelete, or Validate';

COMMENT ON COLUMN __mj."RecordProcess"."OnChangeFilter" IS 'Gating expression evaluated against the changed record (with changed-fields context) that compiles into the owned Entity Action Filter; only when it passes does the on-change trigger fire';

COMMENT ON COLUMN __mj."RecordProcess"."ScheduleEnabled" IS 'When 1, the process runs on a cron schedule via an owned Scheduled Job';

COMMENT ON COLUMN __mj."RecordProcess"."CronExpression" IS 'Cron expression for the schedule trigger, when ScheduleEnabled=1';

COMMENT ON COLUMN __mj."RecordProcess"."Timezone" IS 'IANA timezone for evaluating the cron expression (default UTC)';

COMMENT ON COLUMN __mj."RecordProcess"."OnDemandEnabled" IS 'When 1, the process can be run on demand (button / resolver)';

COMMENT ON COLUMN __mj."RecordProcess"."InputMapping" IS 'JSON mapping describing how a record maps to the work inputs (optionally including an EntityDocumentID for render-to-text)';

COMMENT ON COLUMN __mj."RecordProcess"."OutputMapping" IS 'JSON mapping describing how the structured output payload writes back (to fields, a child record, or tags)';

COMMENT ON COLUMN __mj."RecordProcess"."SkipUnchanged" IS 'When 1, records whose watermark indicates no change since the last run are skipped';

COMMENT ON COLUMN __mj."RecordProcess"."WatermarkStrategy" IS 'How unchanged records are detected for SkipUnchanged: Checksum (per-record content hash, stored in RecordProcessWatermark), UpdatedAt (compares __mj_UpdatedAt, stores nothing), or None';

COMMENT ON COLUMN __mj."RecordProcess"."BatchSize" IS 'Number of records processed per batch (default 100)';

COMMENT ON COLUMN __mj."RecordProcess"."MaxConcurrency" IS 'Maximum number of records processed concurrently within a batch (default 1)';

/* ============================================================================ */ /* 3. ProcessRun (MJ: Process Runs) — generic, source-agnostic run header */ /* ============================================================================ */
CREATE TABLE __mj."ProcessRun" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "RecordProcessID" UUID NULL,
  "EntityID" UUID NULL,
  "TriggeredBy" VARCHAR(20) NOT NULL,
  "SourceType" VARCHAR(20) NOT NULL,
  "SourceID" UUID NULL,
  "SourceFilter" TEXT NULL,
  "ScheduledJobRunID" UUID NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "StartTime" TIMESTAMPTZ NULL,
  "EndTime" TIMESTAMPTZ NULL,
  "TotalItemCount" INT NULL,
  "ProcessedItems" INT NOT NULL DEFAULT 0,
  "SuccessCount" INT NOT NULL DEFAULT 0,
  "ErrorCount" INT NOT NULL DEFAULT 0,
  "SkippedCount" INT NOT NULL DEFAULT 0,
  "LastProcessedOffset" INT NULL,
  "LastProcessedKey" VARCHAR(450) NULL,
  "BatchSize" INT NULL,
  "CancellationRequested" BOOLEAN NOT NULL DEFAULT FALSE,
  "Configuration" TEXT NULL,
  "ErrorMessage" TEXT NULL,
  "StartedByUserID" UUID NULL,
  CONSTRAINT "PK_ProcessRun" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_ProcessRun_TriggeredBy" CHECK ("TriggeredBy" IN ('OnChange', 'Schedule', 'OnDemand', 'Manual')),
  CONSTRAINT "CK_ProcessRun_SourceType" CHECK ("SourceType" IN ('View', 'List', 'Filter', 'Array', 'Keyset', 'SingleRecord')),
  CONSTRAINT "CK_ProcessRun_Status" CHECK ("Status" IN ('Pending', 'Running', 'Paused', 'Completed', 'Failed', 'Cancelled')),
  CONSTRAINT "FK_ProcessRun_RecordProcess" FOREIGN KEY ("RecordProcessID") REFERENCES __mj."RecordProcess" (
    "ID"
  ),
  CONSTRAINT "FK_ProcessRun_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_ProcessRun_ScheduledJobRun" FOREIGN KEY ("ScheduledJobRunID") REFERENCES __mj."ScheduledJobRun" (
    "ID"
  ),
  CONSTRAINT "FK_ProcessRun_StartedByUser" FOREIGN KEY ("StartedByUserID") REFERENCES __mj."User" (
    "ID"
  )
);

COMMENT ON TABLE __mj."ProcessRun" IS 'Source-agnostic header for one execution of any set-processing job. Deliberately generic: a Record Process run sets RecordProcessID, but legacy/engine-driven jobs (e.g., a geocoding sweep or vector sync) keep their own source tables and still record a run here with RecordProcessID = NULL, giving every batch a uniform audit + resume trail. EXAMPLE: the Saturday 2am run of "Weekly Customer Health Summary" over 1,284 active customers (RecordProcessID set, TriggeredBy=Schedule); or a nightly geocoding sweep (RecordProcessID NULL).';

COMMENT ON COLUMN __mj."ProcessRun"."RecordProcessID" IS 'Foreign key to the Record Process that spawned this run; NULL for ad-hoc / engine-driven runs not tied to a saved definition';

COMMENT ON COLUMN __mj."ProcessRun"."EntityID" IS 'Foreign key to the entity processed by this run, when the run is entity-scoped';

COMMENT ON COLUMN __mj."ProcessRun"."TriggeredBy" IS 'What triggered this run: OnChange, Schedule, OnDemand, or Manual';

COMMENT ON COLUMN __mj."ProcessRun"."SourceType" IS 'The kind of record-set source resolved for this run: View, List, Filter, Array, Keyset, or SingleRecord';

COMMENT ON COLUMN __mj."ProcessRun"."SourceID" IS 'Polymorphic source identifier (e.g., ViewID or ListID) when applicable; no FK because it spans entities';

COMMENT ON COLUMN __mj."ProcessRun"."SourceFilter" IS 'Resolved filter snapshot used to materialize the record set for this run';

COMMENT ON COLUMN __mj."ProcessRun"."ScheduledJobRunID" IS 'Foreign key to the Scheduled Job Run that launched this run, when scheduler-launched';

COMMENT ON COLUMN __mj."ProcessRun"."Status" IS 'Run status: Pending, Running, Paused, Completed, Failed, or Cancelled';

COMMENT ON COLUMN __mj."ProcessRun"."StartTime" IS 'When the run started';

COMMENT ON COLUMN __mj."ProcessRun"."EndTime" IS 'When the run ended';

COMMENT ON COLUMN __mj."ProcessRun"."TotalItemCount" IS 'Estimated or known total number of records to process';

COMMENT ON COLUMN __mj."ProcessRun"."ProcessedItems" IS 'Count of records processed so far';

COMMENT ON COLUMN __mj."ProcessRun"."SuccessCount" IS 'Count of records processed successfully';

COMMENT ON COLUMN __mj."ProcessRun"."ErrorCount" IS 'Count of records that failed processing';

COMMENT ON COLUMN __mj."ProcessRun"."SkippedCount" IS 'Count of records skipped (e.g., unchanged per watermark)';

COMMENT ON COLUMN __mj."ProcessRun"."LastProcessedOffset" IS 'Offset-based resume cursor (StartRow) for sources that paginate by offset';

COMMENT ON COLUMN __mj."ProcessRun"."LastProcessedKey" IS 'Keyset-based resume cursor (AfterKey) for sources that paginate by seek';

COMMENT ON COLUMN __mj."ProcessRun"."BatchSize" IS 'Effective batch size for this run';

COMMENT ON COLUMN __mj."ProcessRun"."CancellationRequested" IS 'Pause/cancel handshake flag honored by the processor between batches';

COMMENT ON COLUMN __mj."ProcessRun"."Configuration" IS 'JSON snapshot of the effective configuration for this run';

COMMENT ON COLUMN __mj."ProcessRun"."ErrorMessage" IS 'Run-level error message when Status=Failed';

COMMENT ON COLUMN __mj."ProcessRun"."StartedByUserID" IS 'Foreign key to the user who started the run';

/* ============================================================================ */ /* 4. ProcessRunDetail (MJ: Process Run Details) — generic per-record detail */ /* ============================================================================ */
CREATE TABLE __mj."ProcessRunDetail" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "ProcessRunID" UUID NOT NULL,
  "EntityID" UUID NOT NULL,
  "RecordID" VARCHAR(450) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "StartedAt" TIMESTAMPTZ NULL,
  "CompletedAt" TIMESTAMPTZ NULL,
  "DurationMs" INT NULL,
  "AttemptCount" INT NOT NULL DEFAULT 0,
  "ResultPayload" TEXT NULL,
  "ErrorMessage" TEXT NULL,
  "ActionExecutionLogID" UUID NULL,
  "AIAgentRunID" UUID NULL,
  CONSTRAINT "PK_ProcessRunDetail" PRIMARY KEY ("ID"),
  CONSTRAINT "CK_ProcessRunDetail_Status" CHECK ("Status" IN ('Pending', 'Succeeded', 'Failed', 'Skipped')),
  CONSTRAINT "FK_ProcessRunDetail_ProcessRun" FOREIGN KEY ("ProcessRunID") REFERENCES __mj."ProcessRun" (
    "ID"
  ),
  CONSTRAINT "FK_ProcessRunDetail_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_ProcessRunDetail_ActionExecutionLog" FOREIGN KEY ("ActionExecutionLogID") REFERENCES __mj."ActionExecutionLog" (
    "ID"
  ),
  CONSTRAINT "FK_ProcessRunDetail_AIAgentRun" FOREIGN KEY ("AIAgentRunID") REFERENCES __mj."AIAgentRun" (
    "ID"
  )
);

COMMENT ON TABLE __mj."ProcessRunDetail" IS 'Per-record result within a Process Run: powers audit, resume (skip already-done records), and the run-viewer UX. One row per processed record. EXAMPLE: customer CUST-00417 -> Succeeded with ResultPayload {"satisfaction":"High","sentiment":0.82} and a link to its AI Agent Run; customer CUST-00418 -> Failed with ErrorMessage "Model timeout".';

COMMENT ON COLUMN __mj."ProcessRunDetail"."ProcessRunID" IS 'Foreign key to the parent Process Run';

COMMENT ON COLUMN __mj."ProcessRunDetail"."EntityID" IS 'Foreign key to the entity of the processed record. Stored (not inherited) because a single run may span entities for ad-hoc / engine-driven runs.';

COMMENT ON COLUMN __mj."ProcessRunDetail"."RecordID" IS 'Primary key of the processed record, stored as text to remain composite-key safe';

COMMENT ON COLUMN __mj."ProcessRunDetail"."Status" IS 'Per-record status: Pending, Succeeded, Failed, or Skipped';

COMMENT ON COLUMN __mj."ProcessRunDetail"."StartedAt" IS 'When processing of this record started';

COMMENT ON COLUMN __mj."ProcessRunDetail"."CompletedAt" IS 'When processing of this record completed';

COMMENT ON COLUMN __mj."ProcessRunDetail"."DurationMs" IS 'Processing duration for this record in milliseconds';

COMMENT ON COLUMN __mj."ProcessRunDetail"."AttemptCount" IS 'Number of processing attempts for this record (supports retry)';

COMMENT ON COLUMN __mj."ProcessRunDetail"."ResultPayload" IS 'Structured output payload (JSON) produced for this record';

COMMENT ON COLUMN __mj."ProcessRunDetail"."ErrorMessage" IS 'Per-record error message when Status=Failed';

COMMENT ON COLUMN __mj."ProcessRunDetail"."ActionExecutionLogID" IS 'Foreign key to the Action Execution Log for deep tracing, when the work was an Action';

COMMENT ON COLUMN __mj."ProcessRunDetail"."AIAgentRunID" IS 'Foreign key to the AI Agent Run for deep tracing, when the work was an Agent';

/* ============================================================================ */ /* 5. RecordProcessWatermark (MJ: Record Process Watermarks) — checksum change detection */ /* ============================================================================ */
CREATE TABLE __mj."RecordProcessWatermark" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "RecordProcessID" UUID NOT NULL,
  "EntityID" UUID NOT NULL,
  "RecordID" VARCHAR(450) NOT NULL,
  "Hash" VARCHAR(128) NOT NULL,
  "LastProcessedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "PK_RecordProcessWatermark" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_RecordProcessWatermark_Record" UNIQUE (
    "RecordProcessID",
    "EntityID",
    "RecordID"
  ),
  CONSTRAINT "FK_RecordProcessWatermark_RecordProcess" FOREIGN KEY ("RecordProcessID") REFERENCES __mj."RecordProcess" (
    "ID"
  ),
  CONSTRAINT "FK_RecordProcessWatermark_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  )
);

COMMENT ON TABLE __mj."RecordProcessWatermark" IS 'Per-record change-detection watermark backing WatermarkStrategy=Checksum. Stores the last content hash a Record Process processed for a given record so unchanged records are skipped on the next run. Only used by Checksum mode; UpdatedAt mode compares __mj_UpdatedAt and stores nothing here.';

COMMENT ON COLUMN __mj."RecordProcessWatermark"."RecordProcessID" IS 'Foreign key to the Record Process this watermark belongs to';

COMMENT ON COLUMN __mj."RecordProcessWatermark"."EntityID" IS 'Foreign key to the entity of the watermarked record';

COMMENT ON COLUMN __mj."RecordProcessWatermark"."RecordID" IS 'Primary key of the watermarked record, stored as text to remain composite-key safe';

COMMENT ON COLUMN __mj."RecordProcessWatermark"."Hash" IS 'Content hash of the record as of the last time it was processed by this Record Process';

COMMENT ON COLUMN __mj."RecordProcessWatermark"."LastProcessedAt" IS 'When this record was last processed by this Record Process';

/* ##############################################################################################
  #                                                                                            #
  #   PART 2 of 2 — REMOTE OPERATIONS                                                           #
  #                                                                                            #
  #   A SEPARATE, FRAMEWORK-LEVEL PRIMITIVE (not specific to Record Processes).                 #
  #   Typed, provider-routed server operations -- the typed peer of BaseEntity (CRUD) and       #
  #   RunView (set reads) -- invoked identically from client (over GraphQL) and server          #
  #   (in-process). Consumed by the Record Process facade above (RunNow / GetRunStatus /        #
  #   Pause / Resume / Cancel) but reusable by ANY subsystem. Tables 6-7 below.                 #
  #                                                                                            #
  ############################################################################################## */ /* ============================================================================ */ /* 6. RemoteOperationCategory (MJ: Remote Operation Categories) */ /* ============================================================================ */
CREATE TABLE __mj."RemoteOperationCategory" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "ParentID" UUID NULL,
  CONSTRAINT "PK_RemoteOperationCategory" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_RemoteOperationCategory_Parent" FOREIGN KEY ("ParentID") REFERENCES __mj."RemoteOperationCategory" (
    "ID"
  )
);

COMMENT ON TABLE __mj."RemoteOperationCategory" IS 'Hierarchical folder for organizing Remote Operations in the UI. Example: "Record Processes" with a child category "Control" holding RunNow / Pause / Cancel.';

COMMENT ON COLUMN __mj."RemoteOperationCategory"."Name" IS 'Display name of the category';

COMMENT ON COLUMN __mj."RemoteOperationCategory"."Description" IS 'Optional description of what belongs in this category';

COMMENT ON COLUMN __mj."RemoteOperationCategory"."ParentID" IS 'Self-referencing foreign key to the parent category, enabling a nested folder hierarchy (NULL for a top-level category)';

/* ============================================================================ */ /* 7. RemoteOperation (MJ: Remote Operations) — typed provider-routed operation definition */ /* ============================================================================ */
CREATE TABLE __mj."RemoteOperation" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(255) NOT NULL,
  "OperationKey" VARCHAR(255) NOT NULL,
  "CategoryID" UUID NULL,
  "Description" TEXT NULL,
  "InputTypeName" VARCHAR(255) NULL,
  "InputTypeDefinition" TEXT NULL,
  "InputTypeIsArray" BOOLEAN NOT NULL DEFAULT FALSE,
  "OutputTypeName" VARCHAR(255) NULL,
  "OutputTypeDefinition" TEXT NULL,
  "OutputTypeIsArray" BOOLEAN NOT NULL DEFAULT FALSE,
  "ExecutionMode" VARCHAR(20) NOT NULL DEFAULT 'Sync',
  "RequiredScope" VARCHAR(255) NULL,
  "RequiresSystemUser" BOOLEAN NOT NULL DEFAULT FALSE,
  "GenerationType" VARCHAR(20) NOT NULL DEFAULT 'Manual',
  "Code" TEXT NULL,
  "CodeApprovalStatus" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "CodeApprovedByUserID" UUID NULL,
  "CodeApprovedAt" TIMESTAMPTZ NULL,
  "ContractFingerprint" VARCHAR(100) NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "CacheTTLSeconds" INT NULL,
  "TimeoutMS" INT NULL,
  "MaxConcurrency" INT NULL,
  CONSTRAINT "PK_RemoteOperation" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_RemoteOperation_OperationKey" UNIQUE (
    "OperationKey"
  ),
  CONSTRAINT "CK_RemoteOperation_ExecutionMode" CHECK ("ExecutionMode" IN ('Sync', 'LongRunning')),
  CONSTRAINT "CK_RemoteOperation_GenerationType" CHECK ("GenerationType" IN ('Manual', 'AI', 'Default')),
  CONSTRAINT "CK_RemoteOperation_CodeApprovalStatus" CHECK ("CodeApprovalStatus" IN ('Pending', 'Approved', 'Rejected')),
  CONSTRAINT "CK_RemoteOperation_Status" CHECK ("Status" IN ('Active', 'Disabled', 'Pending')),
  CONSTRAINT "FK_RemoteOperation_Category" FOREIGN KEY ("CategoryID") REFERENCES __mj."RemoteOperationCategory" (
    "ID"
  ),
  CONSTRAINT "FK_RemoteOperation_CodeApprovedByUser" FOREIGN KEY ("CodeApprovedByUserID") REFERENCES __mj."User" (
    "ID"
  )
);

COMMENT ON TABLE __mj."RemoteOperation" IS 'Definition of a typed, provider-routed server operation invoked identically from the client (marshalled over GraphQL) and the server (dispatched in-process) - the typed peer of BaseEntity (CRUD) and RunView (set reads) for arbitrary capabilities. Input/output types are declared here and emitted by CodeGen into a typed base class; the body may be hand-written or AI-authored from Description. EXAMPLE: "RecordProcess.RunNow" (ExecutionMode=LongRunning) takes {recordProcessID} and returns {processRunID}, authorized by the recordprocess:execute scope plus the caller''s entity permissions.';

COMMENT ON COLUMN __mj."RemoteOperation"."Name" IS 'Human-readable name of the operation';

COMMENT ON COLUMN __mj."RemoteOperation"."OperationKey" IS 'Stable, unique registry key and wire token used to dispatch the operation (e.g., "RecordProcess.RunNow"). Namespaced by convention.';

COMMENT ON COLUMN __mj."RemoteOperation"."CategoryID" IS 'Optional hierarchical category for organizing this operation in the UI';

COMMENT ON COLUMN __mj."RemoteOperation"."Description" IS 'Human description of the operation; also the seed for AI-generated implementation code when GenerationType=AI';

COMMENT ON COLUMN __mj."RemoteOperation"."InputTypeName" IS 'TypeScript type name for the operation input (emitted by CodeGen as the TInput interface)';

COMMENT ON COLUMN __mj."RemoteOperation"."InputTypeDefinition" IS 'Raw TypeScript interface/type source defining the input shape (same mechanism as EntityField JSON-type definitions)';

COMMENT ON COLUMN __mj."RemoteOperation"."InputTypeIsArray" IS 'When 1, the input type is emitted as an array (TInput[])';

COMMENT ON COLUMN __mj."RemoteOperation"."OutputTypeName" IS 'TypeScript type name for the operation output (emitted by CodeGen as the TOutput interface)';

COMMENT ON COLUMN __mj."RemoteOperation"."OutputTypeDefinition" IS 'Raw TypeScript interface/type source defining the output shape';

COMMENT ON COLUMN __mj."RemoteOperation"."OutputTypeIsArray" IS 'When 1, the output type is emitted as an array (TOutput[])';

COMMENT ON COLUMN __mj."RemoteOperation"."ExecutionMode" IS 'Sync (request/response) or LongRunning (returns a handle; supports detached and attached consumption)';

COMMENT ON COLUMN __mj."RemoteOperation"."RequiredScope" IS 'Optional API-key scope string (e.g., recordprocess:execute) enforced for API-key/MCP callers; NULL means no scope gate (interactive users are still bounded by their entity permissions)';

COMMENT ON COLUMN __mj."RemoteOperation"."RequiresSystemUser" IS 'When 1, only the system user may invoke this operation';

COMMENT ON COLUMN __mj."RemoteOperation"."GenerationType" IS 'How the server implementation is provided: Manual (hand-written subclass), AI (generated from Description), or Default (standard generated plumbing)';

COMMENT ON COLUMN __mj."RemoteOperation"."Code" IS 'The AI-generated implementation body (when GenerationType=AI); regenerated only when Description changes';

COMMENT ON COLUMN __mj."RemoteOperation"."CodeApprovalStatus" IS 'Human approval gate for AI-generated code: Pending, Approved, or Rejected. Only Approved AI code is emitted and routable.';

COMMENT ON COLUMN __mj."RemoteOperation"."CodeApprovedByUserID" IS 'Foreign key to the user who approved the generated code';

COMMENT ON COLUMN __mj."RemoteOperation"."CodeApprovedAt" IS 'When the generated code was approved';

COMMENT ON COLUMN __mj."RemoteOperation"."ContractFingerprint" IS 'Fingerprint of the input/output contract; carried in the wire envelope so the server can reject a stale client loudly instead of mis-deserializing';

COMMENT ON COLUMN __mj."RemoteOperation"."Status" IS 'Lifecycle status: Active (routable), Disabled, or Pending. Only Active operations can be invoked.';

COMMENT ON COLUMN __mj."RemoteOperation"."CacheTTLSeconds" IS 'Optional result cache TTL in seconds (NULL = no caching)';

COMMENT ON COLUMN __mj."RemoteOperation"."TimeoutMS" IS 'Optional execution timeout in milliseconds';

COMMENT ON COLUMN __mj."RemoteOperation"."MaxConcurrency" IS 'Optional cap on concurrent executions of this operation';

/* SQL generated to create new entity MJ: Record Process Categories */
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
    'ecaff493-a864-4d15-bea0-2f5051efcf00',
    'MJ: Record Process Categories',
    'Record Process Categories',
    'Hierarchical folder for organizing Record Processes in the UI. Example: "Customer Lifecycle" with a child category "Retention".',
    NULL,
    'RecordProcessCategory',
    'vwRecordProcessCategories',
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

/* SQL generated to add new entity MJ: Record Process Categories to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'ecaff493-a864-4d15-bea0-2f5051efcf00',
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

/* SQL generated to add new permission for entity MJ: Record Process Categories for role UI */
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
    'ecaff493-a864-4d15-bea0-2f5051efcf00',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Record Process Categories for role Developer */
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
    'ecaff493-a864-4d15-bea0-2f5051efcf00',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Record Process Categories for role Integration */
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
    'ecaff493-a864-4d15-bea0-2f5051efcf00',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: Record Processes */
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
    'bde34df9-7b59-4921-9b80-e94bc013a5bb',
    'MJ: Record Processes',
    'Record Processes',
    'A declarative, reusable job definition that binds three axes of a business process: WORK (an Action or an Agent) x SCOPE (a single record, a User View, a List, or an ad-hoc Filter) x TRIGGER (on-change save hooks, a cron schedule, and/or on demand). One row is one configured process; each execution of it produces a Process Run with per-record Process Run Details. EXAMPLE: a "Weekly Customer Health Summary" row runs the "Customer Summarizer" agent over the "Active Customers" view every Saturday 2am, also whenever a customer''s NPS/support fields change, and on demand; for each customer it infers {satisfaction, sentiment, personalityStyle, summary} and writes satisfaction/sentiment back onto the Customer plus a summary into a Customer Insights child row, skipping customers unchanged since the last run.',
    NULL,
    'RecordProcess',
    'vwRecordProcesses',
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

/* SQL generated to add new entity MJ: Record Processes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'bde34df9-7b59-4921-9b80-e94bc013a5bb',
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

/* SQL generated to add new permission for entity MJ: Record Processes for role UI */
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
    'bde34df9-7b59-4921-9b80-e94bc013a5bb',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Record Processes for role Developer */
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
    'bde34df9-7b59-4921-9b80-e94bc013a5bb',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Record Processes for role Integration */
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
    'bde34df9-7b59-4921-9b80-e94bc013a5bb',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: Process Runs */
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
    '9989a9a4-5546-4552-a765-b27ee399bfea',
    'MJ: Process Runs',
    'Process Runs',
    'Source-agnostic header for one execution of any set-processing job. Deliberately generic: a Record Process run sets RecordProcessID, but legacy/engine-driven jobs (e.g., a geocoding sweep or vector sync) keep their own source tables and still record a run here with RecordProcessID = NULL, giving every batch a uniform audit + resume trail. EXAMPLE: the Saturday 2am run of "Weekly Customer Health Summary" over 1,284 active customers (RecordProcessID set, TriggeredBy=Schedule); or a nightly geocoding sweep (RecordProcessID NULL).',
    NULL,
    'ProcessRun',
    'vwProcessRuns',
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

/* SQL generated to add new entity MJ: Process Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '9989a9a4-5546-4552-a765-b27ee399bfea',
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

/* SQL generated to add new permission for entity MJ: Process Runs for role UI */
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
    '9989a9a4-5546-4552-a765-b27ee399bfea',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Process Runs for role Developer */
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
    '9989a9a4-5546-4552-a765-b27ee399bfea',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Process Runs for role Integration */
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
    '9989a9a4-5546-4552-a765-b27ee399bfea',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: Process Run Details */
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
    '32aa9c83-d4d5-4e7a-aa99-4a9869bb3f3f',
    'MJ: Process Run Details',
    'Process Run Details',
    'Per-record result within a Process Run: powers audit, resume (skip already-done records), and the run-viewer UX. One row per processed record. EXAMPLE: customer CUST-00417 -> Succeeded with ResultPayload {"satisfaction":"High","sentiment":0.82} and a link to its AI Agent Run; customer CUST-00418 -> Failed with ErrorMessage "Model timeout".',
    NULL,
    'ProcessRunDetail',
    'vwProcessRunDetails',
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

/* SQL generated to add new entity MJ: Process Run Details to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '32aa9c83-d4d5-4e7a-aa99-4a9869bb3f3f',
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

/* SQL generated to add new permission for entity MJ: Process Run Details for role UI */
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
    '32aa9c83-d4d5-4e7a-aa99-4a9869bb3f3f',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Process Run Details for role Developer */
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
    '32aa9c83-d4d5-4e7a-aa99-4a9869bb3f3f',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Process Run Details for role Integration */
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
    '32aa9c83-d4d5-4e7a-aa99-4a9869bb3f3f',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: Record Process Watermarks */
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
    '4d68e78e-64f7-4959-b18b-72159df95a98',
    'MJ: Record Process Watermarks',
    'Record Process Watermarks',
    'Per-record change-detection watermark backing WatermarkStrategy=Checksum. Stores the last content hash a Record Process processed for a given record so unchanged records are skipped on the next run. Only used by Checksum mode; UpdatedAt mode compares __mj_UpdatedAt and stores nothing here.',
    NULL,
    'RecordProcessWatermark',
    'vwRecordProcessWatermarks',
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

/* SQL generated to add new entity MJ: Record Process Watermarks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '4d68e78e-64f7-4959-b18b-72159df95a98',
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

/* SQL generated to add new permission for entity MJ: Record Process Watermarks for role UI */
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
    '4d68e78e-64f7-4959-b18b-72159df95a98',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Record Process Watermarks for role Developer */
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
    '4d68e78e-64f7-4959-b18b-72159df95a98',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Record Process Watermarks for role Integration */
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
    '4d68e78e-64f7-4959-b18b-72159df95a98',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: Remote Operation Categories */
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
    '65e0bdfb-b7fa-4ba3-a17f-be997ce45eab',
    'MJ: Remote Operation Categories',
    'Remote Operation Categories',
    'Hierarchical folder for organizing Remote Operations in the UI. Example: "Record Processes" with a child category "Control" holding RunNow / Pause / Cancel.',
    NULL,
    'RemoteOperationCategory',
    'vwRemoteOperationCategories',
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

/* SQL generated to add new entity MJ: Remote Operation Categories to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '65e0bdfb-b7fa-4ba3-a17f-be997ce45eab',
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

/* SQL generated to add new permission for entity MJ: Remote Operation Categories for role UI */
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
    '65e0bdfb-b7fa-4ba3-a17f-be997ce45eab',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Remote Operation Categories for role Developer */
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
    '65e0bdfb-b7fa-4ba3-a17f-be997ce45eab',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Remote Operation Categories for role Integration */
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
    '65e0bdfb-b7fa-4ba3-a17f-be997ce45eab',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to create new entity MJ: Remote Operations */
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
    '2758d216-c4d2-4fc4-8348-781372736159',
    'MJ: Remote Operations',
    'Remote Operations',
    'Definition of a typed, provider-routed server operation invoked identically from the client (marshalled over GraphQL) and the server (dispatched in-process) - the typed peer of BaseEntity (CRUD) and RunView (set reads) for arbitrary capabilities. Input/output types are declared here and emitted by CodeGen into a typed base class; the body may be hand-written or AI-authored from Description. EXAMPLE: "RecordProcess.RunNow" (ExecutionMode=LongRunning) takes {recordProcessID} and returns {processRunID}, authorized by the recordprocess:execute scope plus the caller''s entity permissions.',
    NULL,
    'RemoteOperation',
    'vwRemoteOperations',
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

/* SQL generated to add new entity MJ: Remote Operations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '2758d216-c4d2-4fc4-8348-781372736159',
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

/* SQL generated to add new permission for entity MJ: Remote Operations for role UI */
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
    '2758d216-c4d2-4fc4-8348-781372736159',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Remote Operations for role Developer */
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
    '2758d216-c4d2-4fc4-8348-781372736159',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

/* SQL generated to add new permission for entity MJ: Remote Operations for role Integration */
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
    '2758d216-c4d2-4fc4-8348-781372736159',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );

ALTER TABLE __mj."RecordProcessCategory"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordProcessCategory */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordProcessCategory */
UPDATE __mj."RecordProcessCategory" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RecordProcessCategory' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordProcessCategory" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordProcessCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordProcessCategory"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordProcessCategory */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordProcessCategory */
UPDATE __mj."RecordProcessCategory" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RecordProcessCategory' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordProcessCategory" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordProcessCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ProcessRunDetail"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ProcessRunDetail */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ProcessRunDetail */
UPDATE __mj."ProcessRunDetail" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ProcessRunDetail' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ProcessRunDetail" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ProcessRunDetail" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ProcessRunDetail"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ProcessRunDetail */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ProcessRunDetail */
UPDATE __mj."ProcessRunDetail" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ProcessRunDetail' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ProcessRunDetail" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ProcessRunDetail" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordProcessWatermark"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordProcessWatermark */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordProcessWatermark */
UPDATE __mj."RecordProcessWatermark" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RecordProcessWatermark' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordProcessWatermark" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordProcessWatermark" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordProcessWatermark"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordProcessWatermark */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordProcessWatermark */
UPDATE __mj."RecordProcessWatermark" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RecordProcessWatermark' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordProcessWatermark" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordProcessWatermark" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RemoteOperation"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RemoteOperation */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RemoteOperation */
UPDATE __mj."RemoteOperation" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RemoteOperation' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RemoteOperation" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RemoteOperation" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RemoteOperation"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RemoteOperation */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RemoteOperation */
UPDATE __mj."RemoteOperation" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RemoteOperation' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RemoteOperation" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RemoteOperation" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ProcessRun"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.ProcessRun */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.ProcessRun */
UPDATE __mj."ProcessRun" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'ProcessRun' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ProcessRun" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."ProcessRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."ProcessRun"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.ProcessRun */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.ProcessRun */
UPDATE __mj."ProcessRun" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'ProcessRun' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."ProcessRun" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."ProcessRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RemoteOperationCategory"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RemoteOperationCategory */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RemoteOperationCategory */
UPDATE __mj."RemoteOperationCategory" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RemoteOperationCategory' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RemoteOperationCategory" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RemoteOperationCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RemoteOperationCategory"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RemoteOperationCategory */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RemoteOperationCategory */
UPDATE __mj."RemoteOperationCategory" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RemoteOperationCategory' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RemoteOperationCategory" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RemoteOperationCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordProcess"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordProcess */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RecordProcess */
UPDATE __mj."RecordProcess" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'RecordProcess' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordProcess" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordProcess" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."RecordProcess"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordProcess */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RecordProcess */
UPDATE __mj."RecordProcess" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'RecordProcess' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."RecordProcess" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."RecordProcess" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0983d210-82b5-48be-93fe-214ea26a867d' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0983d210-82b5-48be-93fe-214ea26a867d', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '913536c2-2a22-403a-b26a-303dd667758a' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('913536c2-2a22-403a-b26a-303dd667758a', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100002, 'Name', 'Name', 'Display name of the category', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3cd1c19c-5d37-4f9f-8792-35a8f69231bd' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3cd1c19c-5d37-4f9f-8792-35a8f69231bd', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100003, 'Description', 'Description', 'Optional description of what belongs in this category', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '351cdbe3-1178-47cb-8363-4c8ec08de442' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = 'ParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('351cdbe3-1178-47cb-8363-4c8ec08de442', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100004, 'ParentID', 'Parent ID', 'Self-referencing foreign key to the parent category, enabling a nested folder hierarchy (NULL for a top-level category)', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c9f9ad04-62e4-4557-b2a3-f61c6e9ee04e' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c9f9ad04-62e4-4557-b2a3-f61c6e9ee04e', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100005, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e440e6f-1095-47e0-8510-d51e6677b026' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e440e6f-1095-47e0-8510-d51e6677b026', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100006, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e44462e2-5183-4f71-94f2-43f3ed047687' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e44462e2-5183-4f71-94f2-43f3ed047687', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e87b2327-55e7-4561-956c-d66e169ffb77' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'ProcessRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e87b2327-55e7-4561-956c-d66e169ffb77', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100002, 'ProcessRunID', 'Process Run ID', 'Foreign key to the parent Process Run', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '9989A9A4-5546-4552-A765-B27EE399BFEA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '31862007-cf7b-45b2-8a4a-41dd70b7fe64' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('31862007-cf7b-45b2-8a4a-41dd70b7fe64', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100003, 'EntityID', 'Entity ID', 'Foreign key to the entity of the processed record. Stored (not inherited) because a single run may span entities for ad-hoc / engine-driven runs.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '875bc3b1-cd0f-47e3-920c-361a25781e2d' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'RecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('875bc3b1-cd0f-47e3-920c-361a25781e2d', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100004, 'RecordID', 'Record ID', 'Primary key of the processed record, stored as text to remain composite-key safe', 'nvarchar', 900, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4c1e18ff-49c9-405b-9f5c-285b449b464c' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4c1e18ff-49c9-405b-9f5c-285b449b464c', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100005, 'Status', 'Status', 'Per-record status: Pending, Succeeded, Failed, or Skipped', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e43a16d0-78d6-4b4c-b9dd-5a91cfe83489' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e43a16d0-78d6-4b4c-b9dd-5a91cfe83489', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100006, 'StartedAt', 'Started At', 'When processing of this record started', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '84cf9e11-bb3d-4f0c-a932-d9bcc5977fba' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'CompletedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('84cf9e11-bb3d-4f0c-a932-d9bcc5977fba', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100007, 'CompletedAt', 'Completed At', 'When processing of this record completed', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa07d584-d6da-434d-b5ba-45ef59ad8c81' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'DurationMs')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa07d584-d6da-434d-b5ba-45ef59ad8c81', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100008, 'DurationMs', 'Duration Ms', 'Processing duration for this record in milliseconds', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd5f1a73f-5907-4ea0-9909-6a04a3fee563' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'AttemptCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d5f1a73f-5907-4ea0-9909-6a04a3fee563', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100009, 'AttemptCount', 'Attempt Count', 'Number of processing attempts for this record (supports retry)', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6831ed3-2e25-49ad-baed-9112e80e2323' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'ResultPayload')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6831ed3-2e25-49ad-baed-9112e80e2323', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100010, 'ResultPayload', 'Result Payload', 'Structured output payload (JSON) produced for this record', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0e1d1655-25db-489f-979f-995d7bac441a' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'ErrorMessage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0e1d1655-25db-489f-979f-995d7bac441a', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100011, 'ErrorMessage', 'Error Message', 'Per-record error message when Status=Failed', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '564b0887-5bd1-4731-a377-69ae0f05b18c' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'ActionExecutionLogID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('564b0887-5bd1-4731-a377-69ae0f05b18c', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100012, 'ActionExecutionLogID', 'Action Execution Log ID', 'Foreign key to the Action Execution Log for deep tracing, when the work was an Action', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d48e08d-1f3a-4201-a430-596b7f4742d4' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'AIAgentRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d48e08d-1f3a-4201-a430-596b7f4742d4', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100013, 'AIAgentRunID', 'AI Agent Run ID', 'Foreign key to the AI Agent Run for deep tracing, when the work was an Agent', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '70f4506a-0ba2-4620-8aa2-5c243ec6619e' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('70f4506a-0ba2-4620-8aa2-5c243ec6619e', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100014, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb9c9df6-06af-4336-b3ae-7ba055c83b27' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb9c9df6-06af-4336-b3ae-7ba055c83b27', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100015, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b84cf2d7-7643-46b1-9d82-094e54320f99' OR ("EntityID" = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b84cf2d7-7643-46b1-9d82-094e54320f99', 'DD238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Integrations */, 100027, 'Configuration', 'Configuration', 'Integration-level connector configuration JSON (e.g. out-of-scope object families, vendor-specific tuning). Free-form JSON the connector reads at runtime.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa9dd38b-c4fa-4dbb-a533-d0653c879bcf' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa9dd38b-c4fa-4dbb-a533-d0653c879bcf', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '04f6e672-c647-4d16-a822-6f722db16d0f' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'RecordProcessID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('04f6e672-c647-4d16-a822-6f722db16d0f', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100002, 'RecordProcessID', 'Record Process ID', 'Foreign key to the Record Process this watermark belongs to', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29703404-fbd8-493f-b1a8-b3c25266da22' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29703404-fbd8-493f-b1a8-b3c25266da22', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100003, 'EntityID', 'Entity ID', 'Foreign key to the entity of the watermarked record', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '132687cc-6f60-45ee-a301-752c75af1da6' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'RecordID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('132687cc-6f60-45ee-a301-752c75af1da6', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100004, 'RecordID', 'Record ID', 'Primary key of the watermarked record, stored as text to remain composite-key safe', 'nvarchar', 900, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '64e0ed6b-8d3a-4874-a62c-40b249d7cf49' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'Hash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('64e0ed6b-8d3a-4874-a62c-40b249d7cf49', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100005, 'Hash', 'Hash', 'Content hash of the record as of the last time it was processed by this Record Process', 'nvarchar', 256, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd24ba01-5a08-468a-a478-1c23a3aa8d38' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'LastProcessedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd24ba01-5a08-468a-a478-1c23a3aa8d38', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100006, 'LastProcessedAt', 'Last Processed At', 'When this record was last processed by this Record Process', 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c3d67610-d28d-42e3-b2e6-df6967d9f068' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c3d67610-d28d-42e3-b2e6-df6967d9f068', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100007, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4d26e94-a81e-486a-a2e0-92928e149ac2' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4d26e94-a81e-486a-a2e0-92928e149ac2', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100008, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a1b3d99b-a135-43fa-bc27-97809aa1be6b' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a1b3d99b-a135-43fa-bc27-97809aa1be6b', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd282a96b-d93f-46be-a966-39aabf607537' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d282a96b-d93f-46be-a966-39aabf607537', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100002, 'Name', 'Name', 'Human-readable name of the operation', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4dc009d7-a719-4aca-bd04-bffaba9ac432' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'OperationKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4dc009d7-a719-4aca-bd04-bffaba9ac432', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100003, 'OperationKey', 'Operation Key', 'Stable, unique registry key and wire token used to dispatch the operation (e.g., "RecordProcess.RunNow"). Namespaced by convention.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e614810b-d58b-49d3-8bb6-875fd70f17fa' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CategoryID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e614810b-d58b-49d3-8bb6-875fd70f17fa', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100004, 'CategoryID', 'Category ID', 'Optional hierarchical category for organizing this operation in the UI', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4bde9929-8999-490c-aab7-33755d18fd31' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4bde9929-8999-490c-aab7-33755d18fd31', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100005, 'Description', 'Description', 'Human description of the operation; also the seed for AI-generated implementation code when GenerationType=AI', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3261c71d-480f-431f-949b-a654b19ea426' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'InputTypeName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3261c71d-480f-431f-949b-a654b19ea426', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100006, 'InputTypeName', 'Input Type Name', 'TypeScript type name for the operation input (emitted by CodeGen as the TInput interface)', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b9141d93-64b2-4903-b550-5cfca72637cb' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'InputTypeDefinition')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b9141d93-64b2-4903-b550-5cfca72637cb', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100007, 'InputTypeDefinition', 'Input Type Definition', 'Raw TypeScript interface/type source defining the input shape (same mechanism as EntityField JSON-type definitions)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5ae69d4c-5b11-4df3-98b3-4940c76611f3' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'InputTypeIsArray')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5ae69d4c-5b11-4df3-98b3-4940c76611f3', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100008, 'InputTypeIsArray', 'Input Type Is Array', 'When 1, the input type is emitted as an array (TInput[])', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2adff8a2-ed60-4a3e-973a-cfe5b4a6ed99' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'OutputTypeName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2adff8a2-ed60-4a3e-973a-cfe5b4a6ed99', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100009, 'OutputTypeName', 'Output Type Name', 'TypeScript type name for the operation output (emitted by CodeGen as the TOutput interface)', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7acb3f9f-1163-4614-98aa-6a343e878aad' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'OutputTypeDefinition')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7acb3f9f-1163-4614-98aa-6a343e878aad', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100010, 'OutputTypeDefinition', 'Output Type Definition', 'Raw TypeScript interface/type source defining the output shape', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4390d029-d795-4007-8ee9-f501df1a7f65' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'OutputTypeIsArray')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4390d029-d795-4007-8ee9-f501df1a7f65', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100011, 'OutputTypeIsArray', 'Output Type Is Array', 'When 1, the output type is emitted as an array (TOutput[])', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c34e9634-b464-4297-89d7-c7120bd1fb78' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'ExecutionMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c34e9634-b464-4297-89d7-c7120bd1fb78', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100012, 'ExecutionMode', 'Execution Mode', 'Sync (request/response) or LongRunning (returns a handle; supports detached and attached consumption)', 'nvarchar', 40, 0, 0, FALSE, 'Sync', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58125cd2-4955-4088-b3bd-cc4034da597a' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'RequiredScope')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58125cd2-4955-4088-b3bd-cc4034da597a', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100013, 'RequiredScope', 'Required Scope', 'Optional API-key scope string (e.g., recordprocess:execute) enforced for API-key/MCP callers; NULL means no scope gate (interactive users are still bounded by their entity permissions)', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5f825817-3679-41b6-86fa-747065d9825e' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'RequiresSystemUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5f825817-3679-41b6-86fa-747065d9825e', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100014, 'RequiresSystemUser', 'Requires System User', 'When 1, only the system user may invoke this operation', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd6662178-7c96-48be-9eee-1cee960277c4' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'GenerationType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6662178-7c96-48be-9eee-1cee960277c4', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100015, 'GenerationType', 'Generation Type', 'How the server implementation is provided: Manual (hand-written subclass), AI (generated from Description), or Default (standard generated plumbing)', 'nvarchar', 40, 0, 0, FALSE, 'Manual', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '759aa844-3c64-45cf-a014-94ca7e8e1989' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'Code')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('759aa844-3c64-45cf-a014-94ca7e8e1989', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100016, 'Code', 'Code', 'The AI-generated implementation body (when GenerationType=AI); regenerated only when Description changes', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0fe0ffc-fd02-4064-9c2a-bb903adf7296' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CodeApprovalStatus')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0fe0ffc-fd02-4064-9c2a-bb903adf7296', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100017, 'CodeApprovalStatus', 'Code Approval Status', 'Human approval gate for AI-generated code: Pending, Approved, or Rejected. Only Approved AI code is emitted and routable.', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c62bc997-b1b4-49af-83c8-5b0a2e9f66e6' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CodeApprovedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c62bc997-b1b4-49af-83c8-5b0a2e9f66e6', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100018, 'CodeApprovedByUserID', 'Code Approved By User ID', 'Foreign key to the user who approved the generated code', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b7640e68-0ed9-4223-8bcb-60145d6088af' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CodeApprovedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b7640e68-0ed9-4223-8bcb-60145d6088af', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100019, 'CodeApprovedAt', 'Code Approved At', 'When the generated code was approved', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '80c6b5d2-7567-4a63-9a1a-17677a34bfa5' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'ContractFingerprint')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('80c6b5d2-7567-4a63-9a1a-17677a34bfa5', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100020, 'ContractFingerprint', 'Contract Fingerprint', 'Fingerprint of the input/output contract; carried in the wire envelope so the server can reject a stale client loudly instead of mis-deserializing', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39380d84-086b-4f99-ae8c-bb59c7e608a9' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39380d84-086b-4f99-ae8c-bb59c7e608a9', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100021, 'Status', 'Status', 'Lifecycle status: Active (routable), Disabled, or Pending. Only Active operations can be invoked.', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '814591ab-4b99-4b4e-bfd0-24cabcabbd78' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CacheTTLSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('814591ab-4b99-4b4e-bfd0-24cabcabbd78', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100022, 'CacheTTLSeconds', 'Cache TTL Seconds', 'Optional result cache TTL in seconds (NULL = no caching)', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b61afde6-ba4a-40b9-9c88-469bc568591f' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'TimeoutMS')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b61afde6-ba4a-40b9-9c88-469bc568591f', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100023, 'TimeoutMS', 'Timeout MS', 'Optional execution timeout in milliseconds', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ea3ff7ae-094c-470a-a653-219d56fb6ed3' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'MaxConcurrency')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ea3ff7ae-094c-470a-a653-219d56fb6ed3', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100024, 'MaxConcurrency', 'Max Concurrency', 'Optional cap on concurrent executions of this operation', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b2e73f0-d95d-4b80-b3ef-d2570d9ce87a' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b2e73f0-d95d-4b80-b3ef-d2570d9ce87a', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100025, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '077e22cf-092c-4b46-aae1-ff2fc99a5abd' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('077e22cf-092c-4b46-aae1-ff2fc99a5abd', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100026, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a9ffca8a-1099-4f8f-a325-cd624b51bb66' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a9ffca8a-1099-4f8f-a325-cd624b51bb66', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1eca5e38-bebc-43a8-b33b-9f5cfbd0fb3e' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'RecordProcessID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1eca5e38-bebc-43a8-b33b-9f5cfbd0fb3e', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100002, 'RecordProcessID', 'Record Process ID', 'Foreign key to the Record Process that spawned this run; NULL for ad-hoc / engine-driven runs not tied to a saved definition', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9170b1e1-ff8b-4eac-8226-e2d15b1a76e2' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9170b1e1-ff8b-4eac-8226-e2d15b1a76e2', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100003, 'EntityID', 'Entity ID', 'Foreign key to the entity processed by this run, when the run is entity-scoped', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b670820c-79d7-498f-8d38-0ad9d03c3a28' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'TriggeredBy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b670820c-79d7-498f-8d38-0ad9d03c3a28', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100004, 'TriggeredBy', 'Triggered By', 'What triggered this run: OnChange, Schedule, OnDemand, or Manual', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ff84a6e8-620e-4ab1-844d-90d5f8a6be40' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'SourceType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ff84a6e8-620e-4ab1-844d-90d5f8a6be40', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100005, 'SourceType', 'Source Type', 'The kind of record-set source resolved for this run: View, List, Filter, Array, Keyset, or SingleRecord', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bec4ba25-2cba-4808-aa71-4da546a95f0c' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'SourceID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bec4ba25-2cba-4808-aa71-4da546a95f0c', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100006, 'SourceID', 'Source ID', 'Polymorphic source identifier (e.g., ViewID or ListID) when applicable; no FK because it spans entities', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e849e10d-69bb-48b7-b504-f931d4c6d302' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'SourceFilter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e849e10d-69bb-48b7-b504-f931d4c6d302', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100007, 'SourceFilter', 'Source Filter', 'Resolved filter snapshot used to materialize the record set for this run', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc7d5571-b22c-4fd6-a36d-790b190adbbc' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'ScheduledJobRunID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dc7d5571-b22c-4fd6-a36d-790b190adbbc', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100008, 'ScheduledJobRunID', 'Scheduled Job Run ID', 'Foreign key to the Scheduled Job Run that launched this run, when scheduler-launched', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '05853432-5E13-4F2A-8618-77857ADF17FA', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '11e29273-d8a3-4f91-9064-1bb488f36d74' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('11e29273-d8a3-4f91-9064-1bb488f36d74', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100009, 'Status', 'Status', 'Run status: Pending, Running, Paused, Completed, Failed, or Cancelled', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c78eb8b6-294c-4b33-8956-3825da34a4cf' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'StartTime')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c78eb8b6-294c-4b33-8956-3825da34a4cf', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100010, 'StartTime', 'Start Time', 'When the run started', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7a7c3157-7f98-46b4-a475-125aa7e7f760' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'EndTime')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7a7c3157-7f98-46b4-a475-125aa7e7f760', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100011, 'EndTime', 'End Time', 'When the run ended', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2cf14960-a8de-4c6f-ba3a-4294acd26512' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'TotalItemCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2cf14960-a8de-4c6f-ba3a-4294acd26512', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100012, 'TotalItemCount', 'Total Item Count', 'Estimated or known total number of records to process', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '23e3932f-567f-440f-b2e1-e6e9b61a8be1' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'ProcessedItems')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('23e3932f-567f-440f-b2e1-e6e9b61a8be1', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100013, 'ProcessedItems', 'Processed Items', 'Count of records processed so far', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8f03bd3c-6433-4b40-8da3-3f4c1261c722' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'SuccessCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f03bd3c-6433-4b40-8da3-3f4c1261c722', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100014, 'SuccessCount', 'Success Count', 'Count of records processed successfully', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '57d01d43-e27f-41a8-96ee-0a2e0fa65f8e' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'ErrorCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('57d01d43-e27f-41a8-96ee-0a2e0fa65f8e', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100015, 'ErrorCount', 'Error Count', 'Count of records that failed processing', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '33e09621-2188-486b-8ab0-2228ffeb3334' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'SkippedCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('33e09621-2188-486b-8ab0-2228ffeb3334', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100016, 'SkippedCount', 'Skipped Count', 'Count of records skipped (e.g., unchanged per watermark)', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5dc6b4a5-37cb-4a27-aaac-74418d608358' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'LastProcessedOffset')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5dc6b4a5-37cb-4a27-aaac-74418d608358', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100017, 'LastProcessedOffset', 'Last Processed Offset', 'Offset-based resume cursor (StartRow) for sources that paginate by offset', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83849077-7bcb-4551-bf0f-f616950c1631' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'LastProcessedKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('83849077-7bcb-4551-bf0f-f616950c1631', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100018, 'LastProcessedKey', 'Last Processed Key', 'Keyset-based resume cursor (AfterKey) for sources that paginate by seek', 'nvarchar', 900, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '452e04a8-adef-4b51-a7f4-0734a7c14b0b' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'BatchSize')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('452e04a8-adef-4b51-a7f4-0734a7c14b0b', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100019, 'BatchSize', 'Batch Size', 'Effective batch size for this run', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4f3e0043-532a-4d58-a4d3-da02e000512e' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'CancellationRequested')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4f3e0043-532a-4d58-a4d3-da02e000512e', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100020, 'CancellationRequested', 'Cancellation Requested', 'Pause/cancel handshake flag honored by the processor between batches', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e55c4ba-7f21-44d7-99a3-c32567525104' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7e55c4ba-7f21-44d7-99a3-c32567525104', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100021, 'Configuration', 'Configuration', 'JSON snapshot of the effective configuration for this run', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c9877c8c-ccc0-4c18-925f-a4dbb9253928' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'ErrorMessage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c9877c8c-ccc0-4c18-925f-a4dbb9253928', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100022, 'ErrorMessage', 'Error Message', 'Run-level error message when Status=Failed', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6241c397-a80e-49bc-8612-ed10e14dc1c9' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'StartedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6241c397-a80e-49bc-8612-ed10e14dc1c9', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100023, 'StartedByUserID', 'Started By User ID', 'Foreign key to the user who started the run', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '177cae5f-fc07-45cf-b350-dcbbcd8ad401' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('177cae5f-fc07-45cf-b350-dcbbcd8ad401', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100024, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '63f725a3-d543-4ce7-b874-c3e5a36aba95' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('63f725a3-d543-4ce7-b874-c3e5a36aba95', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100025, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2ce84fde-e332-45f0-bf18-e34d09ecadf5' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2ce84fde-e332-45f0-bf18-e34d09ecadf5', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ad86a5b-33cd-4e82-842f-3678208dd8f5' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ad86a5b-33cd-4e82-842f-3678208dd8f5', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100002, 'Name', 'Name', 'Display name of the category', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b054e7b8-1459-4d2c-83bb-38334f238194' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b054e7b8-1459-4d2c-83bb-38334f238194', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100003, 'Description', 'Description', 'Optional description of what belongs in this category', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ebb8e5ba-a1e4-45aa-b8c6-a90a9b50aaef' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = 'ParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ebb8e5ba-a1e4-45aa-b8c6-a90a9b50aaef', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100004, 'ParentID', 'Parent ID', 'Self-referencing foreign key to the parent category, enabling a nested folder hierarchy (NULL for a top-level category)', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6154303-42f0-4523-bfce-da5f5d252de8' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e6154303-42f0-4523-bfce-da5f5d252de8', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100005, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd7a985fb-4dd3-42aa-b64c-5f93a3305c27' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d7a985fb-4dd3-42aa-b64c-5f93a3305c27', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100006, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '107cc4d4-6287-4e3e-8cad-ff043cf1d836' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('107cc4d4-6287-4e3e-8cad-ff043cf1d836', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ff9b001-2863-4b76-8254-eea9ed8d9c19' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9ff9b001-2863-4b76-8254-eea9ed8d9c19', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100002, 'Name', 'Name', 'Human-readable name of the process definition (e.g., "Weekly Customer Health Summary")', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '540f4489-76cf-4941-a776-1d2c1ea862a2' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('540f4489-76cf-4941-a776-1d2c1ea862a2', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100003, 'Description', 'Description', 'Optional description of what this process does', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dfe28c7d-7ccd-4007-acdb-39b8cdc542f5' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'CategoryID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dfe28c7d-7ccd-4007-acdb-39b8cdc542f5', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100004, 'CategoryID', 'Category ID', 'Optional hierarchical category for organizing this process in the UI', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94d871b8-c8d6-4bcb-be0f-726caa10d46b' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94d871b8-c8d6-4bcb-be0f-726caa10d46b', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100005, 'EntityID', 'Entity ID', 'Foreign key to the target entity whose records this process operates on', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd81c7aea-d8c3-4bff-aa45-d16f0ba74a0c' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d81c7aea-d8c3-4bff-aa45-d16f0ba74a0c', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100006, 'Status', 'Status', 'Lifecycle status: Draft (not yet wired), Active (triggers live), or Disabled', 'nvarchar', 40, 0, 0, FALSE, 'Draft', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58345d95-711e-470f-bd28-1aa4ad8214d2' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'WorkType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58345d95-711e-470f-bd28-1aa4ad8214d2', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100007, 'WorkType', 'Work Type', 'Whether the work is an Action, an Agent, or an Infer (per-record AI Prompt). Agents are dispatched through the Execute Agent action and must be top-level + ExposeAsAction; Infer runs the AI Prompt named by PromptID for each record and writes its structured output back via OutputMapping.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f783ae0-0480-400b-bafb-aff50ea10dde' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ActionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1f783ae0-0480-400b-bafb-aff50ea10dde', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100008, 'ActionID', 'Action ID', 'Foreign key to the Action to run, when WorkType=Action', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '38248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4c15036f-a2c0-4e68-b31d-fe4c393cf288' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'AgentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4c15036f-a2c0-4e68-b31d-fe4c393cf288', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100009, 'AgentID', 'Agent ID', 'Foreign key to the AI Agent to run, when WorkType=Agent', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4071179-a1a0-41ee-bd99-e90cd79483aa' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'PromptID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4071179-a1a0-41ee-bd99-e90cd79483aa', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100010, 'PromptID', 'Prompt ID', 'Foreign key to the AI Prompt to run for each record, when WorkType=Infer. The prompt''s structured output is written back to the data model via OutputMapping.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '73AD0238-8B56-EF11-991A-6045BDEBA539', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3870e096-3fac-4aed-b341-873ad9f69336' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ScopeType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3870e096-3fac-4aed-b341-873ad9f69336', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100011, 'ScopeType', 'Scope Type', 'How the record set is scoped for the Schedule and On-Demand triggers: SingleRecord, View, List, or Filter. The On-Change trigger is always single-record and ignores this.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e294259-20ab-4c51-997f-398bb863c6a4' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ScopeViewID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7e294259-20ab-4c51-997f-398bb863c6a4', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100012, 'ScopeViewID', 'Scope View ID', 'Foreign key to the User View defining the scope, when ScopeType=View', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E4238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '494d4d38-9510-4fc2-93d3-e1acddecbc86' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ScopeListID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('494d4d38-9510-4fc2-93d3-e1acddecbc86', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100013, 'ScopeListID', 'Scope List ID', 'Foreign key to the List defining the scope, when ScopeType=List', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c17fb9b-f49b-4ba2-b450-270955bce58a' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ScopeFilter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3c17fb9b-f49b-4ba2-b450-270955bce58a', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100014, 'ScopeFilter', 'Scope Filter', 'Ad-hoc WHERE clause used to resolve the record set, when ScopeType=Filter', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1de8d37a-c71f-437f-bae9-5268d5b8dbb8' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'OnChangeEnabled')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1de8d37a-c71f-437f-bae9-5268d5b8dbb8', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100015, 'OnChangeEnabled', 'On Change Enabled', 'When 1, the process runs per-record on save via an owned Entity Action', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '851d7356-eefa-4cc4-9202-139a99ea4b22' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'OnChangeInvocationType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('851d7356-eefa-4cc4-9202-139a99ea4b22', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100016, 'OnChangeInvocationType', 'On Change Invocation Type', 'Which save event fires the on-change trigger: AfterCreate, AfterUpdate, AfterDelete, or Validate', 'nvarchar', 60, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8520bf95-e0f2-456e-9816-bf7ba9458289' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'OnChangeFilter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8520bf95-e0f2-456e-9816-bf7ba9458289', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100017, 'OnChangeFilter', 'On Change Filter', 'Gating expression evaluated against the changed record (with changed-fields context) that compiles into the owned Entity Action Filter; only when it passes does the on-change trigger fire', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39a27b5b-1d40-49c5-9a3b-0e6fb81ee0aa' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ScheduleEnabled')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39a27b5b-1d40-49c5-9a3b-0e6fb81ee0aa', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100018, 'ScheduleEnabled', 'Schedule Enabled', 'When 1, the process runs on a cron schedule via an owned Scheduled Job', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '34c3f3ef-91be-4259-bfe9-9d0e0a80f959' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'CronExpression')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('34c3f3ef-91be-4259-bfe9-9d0e0a80f959', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100019, 'CronExpression', 'Cron Expression', 'Cron expression for the schedule trigger, when ScheduleEnabled=1', 'nvarchar', 240, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5ad86d1d-6370-4ed3-94ee-53c2dca3ec8c' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Timezone')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5ad86d1d-6370-4ed3-94ee-53c2dca3ec8c', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100020, 'Timezone', 'Timezone', 'IANA timezone for evaluating the cron expression (default UTC)', 'nvarchar', 200, 0, 0, TRUE, 'UTC', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '648afe09-c3e4-44cf-9402-6498835b16ce' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'OnDemandEnabled')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('648afe09-c3e4-44cf-9402-6498835b16ce', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100021, 'OnDemandEnabled', 'On Demand Enabled', 'When 1, the process can be run on demand (button / resolver)', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '026fca08-619e-4482-8e47-864e47574405' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'InputMapping')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('026fca08-619e-4482-8e47-864e47574405', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100022, 'InputMapping', 'Input Mapping', 'JSON mapping describing how a record maps to the work inputs (optionally including an EntityDocumentID for render-to-text)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f72765d0-7f99-45b4-8b9a-365ef3971e72' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'OutputMapping')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f72765d0-7f99-45b4-8b9a-365ef3971e72', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100023, 'OutputMapping', 'Output Mapping', 'JSON mapping describing how the structured output payload writes back (to fields, a child record, or tags)', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb9da9dd-eb62-4d7d-8f58-6edc8b8580c5' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'SkipUnchanged')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fb9da9dd-eb62-4d7d-8f58-6edc8b8580c5', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100024, 'SkipUnchanged', 'Skip Unchanged', 'When 1, records whose watermark indicates no change since the last run are skipped', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b88ebe16-ad08-4d04-9da6-a1bcd016cb01' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'WatermarkStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b88ebe16-ad08-4d04-9da6-a1bcd016cb01', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100025, 'WatermarkStrategy', 'Watermark Strategy', 'How unchanged records are detected for SkipUnchanged: Checksum (per-record content hash, stored in RecordProcessWatermark), UpdatedAt (compares __mj_UpdatedAt, stores nothing), or None', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '82230a4a-9b9a-4d14-a5ef-337443094510' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'BatchSize')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('82230a4a-9b9a-4d14-a5ef-337443094510', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100026, 'BatchSize', 'Batch Size', 'Number of records processed per batch (default 100)', 'int', 4, 10, 0, TRUE, '(100)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1fc0f26a-b10f-44d3-8c75-8154c72a5078' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'MaxConcurrency')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1fc0f26a-b10f-44d3-8c75-8154c72a5078', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100027, 'MaxConcurrency', 'Max Concurrency', 'Maximum number of records processed concurrently within a batch (default 1)', 'int', 4, 10, 0, TRUE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b7d32f5c-e153-4cc3-b63d-8e76980334bf' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b7d32f5c-e153-4cc3-b63d-8e76980334bf', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100028, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ada0be9-fcf3-46f6-aa1c-0c400167860f' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ada0be9-fcf3-46f6-aa1c-0c400167860f', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100029, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5d5684ec-6c36-4819-ae89-d0a80d0d2a7d' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'SupportsCreate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5d5684ec-6c36-4819-ae89-d0a80d0d2a7d', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' /* Entity: MJ: Integration Objects */, 100082, 'SupportsCreate', 'Supports Create', 'Whether this object supports record creation in the external system (per-operation granularity beyond SupportsWrite). Drives whether the generic CreateRecord path is wired and whether the object is offered for write-back create.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c620f72e-e006-4910-85f1-af325c7f9a84' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'SupportsUpdate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c620f72e-e006-4910-85f1-af325c7f9a84', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' /* Entity: MJ: Integration Objects */, 100083, 'SupportsUpdate', 'Supports Update', 'Whether this object supports record updates in the external system (per-operation granularity beyond SupportsWrite).', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '57e9e4a5-0cae-4fbb-913a-d60ecba2ed4e' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'SupportsDelete')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('57e9e4a5-0cae-4fbb-913a-d60ecba2ed4e', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' /* Entity: MJ: Integration Objects */, 100084, 'SupportsDelete', 'Supports Delete', 'Whether this object supports record deletion/tombstoning in the external system (per-operation granularity beyond SupportsWrite).', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b642688-f4d2-42c4-bab0-a9b5987aa704' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'SyncStrategy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b642688-f4d2-42c4-bab0-a9b5987aa704', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' /* Entity: MJ: Integration Objects */, 100085, 'SyncStrategy', 'Sync Strategy', 'Declared incremental sync strategy for this object (e.g. WatermarkIncremental, ContentHash, FullSnapshot). Informs how the engine narrows subsequent syncs.', 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14da7a81-4a5a-402b-ab5b-4d28b7a96205' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'ContentHashApplicable')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14da7a81-4a5a-402b-ab5b-4d28b7a96205', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' /* Entity: MJ: Integration Objects */, 100086, 'ContentHashApplicable', 'Content Hash Applicable', 'Whether per-record content hashing is meaningful for this object (false for append-only/event streams where every row is new). Controls whether the engine uses content-hash to skip unchanged-row writes.', 'bit', 1, 1, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '05f9c2dd-1157-4b13-bd5c-9ba99b44ab30' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'StableOrderingKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('05f9c2dd-1157-4b13-bd5c-9ba99b44ab30', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' /* Entity: MJ: Integration Objects */, 100087, 'StableOrderingKey', 'Stable Ordering Key', 'Stable, monotonic ordering column (usually the PK) used for keyset/no-watermark resume of a scan. Null when the object has no stable key.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID c5cd4acf-90ad-4b0d-a840-e1eaf136b636 */
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
    'c5cd4acf-90ad-4b0d-a840-e1eaf136b636',
    'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 7b9bf1ca-ac77-497e-bb68-46c8ae605c58 */
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
    '7b9bf1ca-ac77-497e-bb68-46c8ae605c58',
    'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 02b0b962-8c98-4991-8cc2-e14190da6045 */
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
    '02b0b962-8c98-4991-8cc2-e14190da6045',
    'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C',
    3,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C';

/* SQL text to insert entity field value with ID f0084680-133e-463a-8b36-ed3d9afbce5f */
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
    'f0084680-133e-463a-8b36-ed3d9afbce5f',
    '58345D95-711E-470F-BD28-1AA4AD8214D2',
    1,
    'Action',
    'Action',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID ae91cb8f-a444-4b10-a4a1-775e8ab27678 */
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
    'ae91cb8f-a444-4b10-a4a1-775e8ab27678',
    '58345D95-711E-470F-BD28-1AA4AD8214D2',
    2,
    'Agent',
    'Agent',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 17b04c7f-47ed-49ed-b92e-c069f2ed620e */
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
    '17b04c7f-47ed-49ed-b92e-c069f2ed620e',
    '58345D95-711E-470F-BD28-1AA4AD8214D2',
    3,
    'Infer',
    'Infer',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 58345D95-711E-470F-BD28-1AA4AD8214D2 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '58345D95-711E-470F-BD28-1AA4AD8214D2';

/* SQL text to insert entity field value with ID 2ca358fb-2a4c-4a8c-aa0d-775a678c641e */
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
    '2ca358fb-2a4c-4a8c-aa0d-775a678c641e',
    '3870E096-3FAC-4AED-B341-873AD9F69336',
    1,
    'Filter',
    'Filter',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 769fe893-83c1-42d3-898e-b200bb6f1e0d */
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
    '769fe893-83c1-42d3-898e-b200bb6f1e0d',
    '3870E096-3FAC-4AED-B341-873AD9F69336',
    2,
    'List',
    'List',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9aa4df2e-2460-4acb-be7a-48928b4a54b4 */
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
    '9aa4df2e-2460-4acb-be7a-48928b4a54b4',
    '3870E096-3FAC-4AED-B341-873AD9F69336',
    3,
    'SingleRecord',
    'SingleRecord',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID d495a82b-f312-436e-859a-dc39ce2e54a0 */
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
    'd495a82b-f312-436e-859a-dc39ce2e54a0',
    '3870E096-3FAC-4AED-B341-873AD9F69336',
    4,
    'View',
    'View',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 3870E096-3FAC-4AED-B341-873AD9F69336 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '3870E096-3FAC-4AED-B341-873AD9F69336';

/* SQL text to insert entity field value with ID 1bf843b0-6fb2-48ca-a038-b68203b791b8 */
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
    '1bf843b0-6fb2-48ca-a038-b68203b791b8',
    '851D7356-EEFA-4CC4-9202-139A99EA4B22',
    1,
    'AfterCreate',
    'AfterCreate',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 62e3b58d-f775-44db-ad24-04719be8ecfc */
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
    '62e3b58d-f775-44db-ad24-04719be8ecfc',
    '851D7356-EEFA-4CC4-9202-139A99EA4B22',
    2,
    'AfterDelete',
    'AfterDelete',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 3c5a873b-070a-419c-9208-934d49af4e8f */
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
    '3c5a873b-070a-419c-9208-934d49af4e8f',
    '851D7356-EEFA-4CC4-9202-139A99EA4B22',
    3,
    'AfterUpdate',
    'AfterUpdate',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID a132b7c1-c0e4-4de6-8640-b222ea936b59 */
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
    'a132b7c1-c0e4-4de6-8640-b222ea936b59',
    '851D7356-EEFA-4CC4-9202-139A99EA4B22',
    4,
    'Validate',
    'Validate',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 851D7356-EEFA-4CC4-9202-139A99EA4B22 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '851D7356-EEFA-4CC4-9202-139A99EA4B22';

/* SQL text to insert entity field value with ID 877efd22-6a95-47d6-a746-aa0b2dd33837 */
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
    '877efd22-6a95-47d6-a746-aa0b2dd33837',
    'B88EBE16-AD08-4D04-9DA6-A1BCD016CB01',
    1,
    'Checksum',
    'Checksum',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 8bfeff73-4d2b-4e49-8e98-2c5673eb3513 */
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
    '8bfeff73-4d2b-4e49-8e98-2c5673eb3513',
    'B88EBE16-AD08-4D04-9DA6-A1BCD016CB01',
    2,
    'None',
    'None',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 552d9b30-7e6d-4f9f-8b1b-3f7a1d77dcac */
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
    '552d9b30-7e6d-4f9f-8b1b-3f7a1d77dcac',
    'B88EBE16-AD08-4D04-9DA6-A1BCD016CB01',
    3,
    'UpdatedAt',
    'UpdatedAt',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID B88EBE16-AD08-4D04-9DA6-A1BCD016CB01 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B88EBE16-AD08-4D04-9DA6-A1BCD016CB01';

/* SQL text to insert entity field value with ID 6576eee4-235c-44cf-ae7a-6285e6dafeb8 */
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
    '6576eee4-235c-44cf-ae7a-6285e6dafeb8',
    'B670820C-79D7-498F-8D38-0AD9D03C3A28',
    1,
    'Manual',
    'Manual',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 0da393a7-8ddc-46e0-80fb-83b5c3659d24 */
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
    '0da393a7-8ddc-46e0-80fb-83b5c3659d24',
    'B670820C-79D7-498F-8D38-0AD9D03C3A28',
    2,
    'OnChange',
    'OnChange',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 86c9f493-74c0-4519-ac79-ddd87c5fcdb0 */
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
    '86c9f493-74c0-4519-ac79-ddd87c5fcdb0',
    'B670820C-79D7-498F-8D38-0AD9D03C3A28',
    3,
    'OnDemand',
    'OnDemand',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID ed9fa22f-31de-4345-91db-339aaa238ffc */
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
    'ed9fa22f-31de-4345-91db-339aaa238ffc',
    'B670820C-79D7-498F-8D38-0AD9D03C3A28',
    4,
    'Schedule',
    'Schedule',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID B670820C-79D7-498F-8D38-0AD9D03C3A28 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B670820C-79D7-498F-8D38-0AD9D03C3A28';

/* SQL text to insert entity field value with ID 72647458-c5c8-41c5-99b9-910b5c5f2d1d */
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
    '72647458-c5c8-41c5-99b9-910b5c5f2d1d',
    'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40',
    1,
    'Array',
    'Array',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 779ff7fe-9990-42f2-91c7-1cf09b7eb601 */
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
    '779ff7fe-9990-42f2-91c7-1cf09b7eb601',
    'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40',
    2,
    'Filter',
    'Filter',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID d21e8339-a96e-472d-9c06-80a7fc1a6e6a */
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
    'd21e8339-a96e-472d-9c06-80a7fc1a6e6a',
    'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40',
    3,
    'Keyset',
    'Keyset',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 18c17cd5-7baf-4951-9990-7cbfd6709082 */
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
    '18c17cd5-7baf-4951-9990-7cbfd6709082',
    'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40',
    4,
    'List',
    'List',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 77a7617b-b3e9-4330-911c-2959fb29db18 */
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
    '77a7617b-b3e9-4330-911c-2959fb29db18',
    'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40',
    5,
    'SingleRecord',
    'SingleRecord',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 04c87753-bf1b-4ac9-b255-eeb39e204a45 */
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
    '04c87753-bf1b-4ac9-b255-eeb39e204a45',
    'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40',
    6,
    'View',
    'View',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID FF84A6E8-620E-4AB1-844D-90D5F8A6BE40 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40';

/* SQL text to insert entity field value with ID 638486f3-0758-49af-8e91-d000acd0bda0 */
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
    '638486f3-0758-49af-8e91-d000acd0bda0',
    '11E29273-D8A3-4F91-9064-1BB488F36D74',
    1,
    'Cancelled',
    'Cancelled',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID eb1172c9-f685-4370-8c8e-d56da11eb009 */
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
    'eb1172c9-f685-4370-8c8e-d56da11eb009',
    '11E29273-D8A3-4F91-9064-1BB488F36D74',
    2,
    'Completed',
    'Completed',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID c715503b-6bf8-439a-a2df-06d3157abdb9 */
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
    'c715503b-6bf8-439a-a2df-06d3157abdb9',
    '11E29273-D8A3-4F91-9064-1BB488F36D74',
    3,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 95eeb24b-25f8-4591-800b-ac870b7a1896 */
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
    '95eeb24b-25f8-4591-800b-ac870b7a1896',
    '11E29273-D8A3-4F91-9064-1BB488F36D74',
    4,
    'Paused',
    'Paused',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 7edfd10f-1bb3-4428-986e-d2124ff35f34 */
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
    '7edfd10f-1bb3-4428-986e-d2124ff35f34',
    '11E29273-D8A3-4F91-9064-1BB488F36D74',
    5,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID ecc2b80b-0612-4054-8c29-358378657440 */
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
    'ecc2b80b-0612-4054-8c29-358378657440',
    '11E29273-D8A3-4F91-9064-1BB488F36D74',
    6,
    'Running',
    'Running',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 11E29273-D8A3-4F91-9064-1BB488F36D74 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '11E29273-D8A3-4F91-9064-1BB488F36D74';

/* SQL text to insert entity field value with ID 657630cb-911a-41a2-9318-65e5707d94f6 */
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
    '657630cb-911a-41a2-9318-65e5707d94f6',
    '4C1E18FF-49C9-405B-9F5C-285B449B464C',
    1,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 1e7319cc-ae07-494a-a743-15afd7fb0101 */
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
    '1e7319cc-ae07-494a-a743-15afd7fb0101',
    '4C1E18FF-49C9-405B-9F5C-285B449B464C',
    2,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 39346fa6-6a5f-4542-b4bd-8bf9b3885b2c */
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
    '39346fa6-6a5f-4542-b4bd-8bf9b3885b2c',
    '4C1E18FF-49C9-405B-9F5C-285B449B464C',
    3,
    'Skipped',
    'Skipped',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 38a1abc3-eb5f-4535-abcd-2e0cdd97f176 */
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
    '38a1abc3-eb5f-4535-abcd-2e0cdd97f176',
    '4C1E18FF-49C9-405B-9F5C-285B449B464C',
    4,
    'Succeeded',
    'Succeeded',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 4C1E18FF-49C9-405B-9F5C-285B449B464C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4C1E18FF-49C9-405B-9F5C-285B449B464C';

/* SQL text to insert entity field value with ID 5f69fa24-6788-48b1-8eb6-5d5c119b047e */
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
    '5f69fa24-6788-48b1-8eb6-5d5c119b047e',
    'C34E9634-B464-4297-89D7-C7120BD1FB78',
    1,
    'LongRunning',
    'LongRunning',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9789e7e4-c2b5-424f-b27f-0253a9183d82 */
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
    '9789e7e4-c2b5-424f-b27f-0253a9183d82',
    'C34E9634-B464-4297-89D7-C7120BD1FB78',
    2,
    'Sync',
    'Sync',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID C34E9634-B464-4297-89D7-C7120BD1FB78 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'C34E9634-B464-4297-89D7-C7120BD1FB78';

/* SQL text to insert entity field value with ID a2174751-6bc1-4223-8b1a-2a90567741b6 */
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
    'a2174751-6bc1-4223-8b1a-2a90567741b6',
    'D6662178-7C96-48BE-9EEE-1CEE960277C4',
    1,
    'AI',
    'AI',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 7279c2ad-d4c5-4b54-abcb-07260f21a181 */
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
    '7279c2ad-d4c5-4b54-abcb-07260f21a181',
    'D6662178-7C96-48BE-9EEE-1CEE960277C4',
    2,
    'Default',
    'Default',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9870b882-6f64-4bc1-88bf-e40454119f8c */
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
    '9870b882-6f64-4bc1-88bf-e40454119f8c',
    'D6662178-7C96-48BE-9EEE-1CEE960277C4',
    3,
    'Manual',
    'Manual',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID D6662178-7C96-48BE-9EEE-1CEE960277C4 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D6662178-7C96-48BE-9EEE-1CEE960277C4';

/* SQL text to insert entity field value with ID 707cd962-3c4f-421e-90f9-806af65679c5 */
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
    '707cd962-3c4f-421e-90f9-806af65679c5',
    'A0FE0FFC-FD02-4064-9C2A-BB903ADF7296',
    1,
    'Approved',
    'Approved',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID acf01892-fc6c-4bac-8def-5f8f7559264c */
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
    'acf01892-fc6c-4bac-8def-5f8f7559264c',
    'A0FE0FFC-FD02-4064-9C2A-BB903ADF7296',
    2,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 29fa516d-1f27-45f4-b381-6be81c196ac5 */
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
    '29fa516d-1f27-45f4-b381-6be81c196ac5',
    'A0FE0FFC-FD02-4064-9C2A-BB903ADF7296',
    3,
    'Rejected',
    'Rejected',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID A0FE0FFC-FD02-4064-9C2A-BB903ADF7296 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'A0FE0FFC-FD02-4064-9C2A-BB903ADF7296';

/* SQL text to insert entity field value with ID b5e894d3-47cb-41c2-84a0-7268d35dce7a */
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
    'b5e894d3-47cb-41c2-84a0-7268d35dce7a',
    '39380D84-086B-4F99-AE8C-BB59C7E608A9',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID 9e417965-239f-4513-a4e0-8348b1ac1706 */
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
    '9e417965-239f-4513-a4e0-8348b1ac1706',
    '39380D84-086B-4F99-AE8C-BB59C7E608A9',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );

/* SQL text to insert entity field value with ID efe7ccc0-9992-4a51-964e-d216640b0a00 */
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
    'efe7ccc0-9992-4a51-964e-d216640b0a00',
    '39380D84-086B-4F99-AE8C-BB59C7E608A9',
    3,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );

/* SQL text to update ValueListType for entity field ID 39380D84-086B-4F99-AE8C-BB59C7E608A9 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '39380D84-086B-4F99-AE8C-BB59C7E608A9';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd58d7a54-72c6-40f7-88e5-bdfab0223786') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d58d7a54-72c6-40f7-88e5-bdfab0223786', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F', 'AIAgentRunID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '19922adb-e3d1-4c08-ba25-e09c9dd3aead') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('19922adb-e3d1-4c08-ba25-e09c9dd3aead', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'AgentID', 'One To Many', TRUE, TRUE, 33, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '356165cd-060a-4491-aa82-50422b2f3374') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('356165cd-060a-4491-aa82-50422b2f3374', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00', 'ParentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0d13f981-c226-45cd-8600-1c8a16c92471') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0d13f981-c226-45cd-8600-1c8a16c92471', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'CategoryID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '21461797-b687-4157-9f43-fce45a37bbf3') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('21461797-b687-4157-9f43-fce45a37bbf3', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'PromptID', 'One To Many', TRUE, TRUE, 15, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '565567a9-1bed-4860-8e5e-87adfc87c630') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('565567a9-1bed-4860-8e5e-87adfc87c630', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F', 'EntityID', 'One To Many', TRUE, TRUE, 63, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f3a0e7c3-9cd3-41d2-af72-59d3ffac186c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3a0e7c3-9cd3-41d2-af72-59d3ffac186c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'EntityID', 'One To Many', TRUE, TRUE, 64, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e732e13c-64bb-4f82-81f1-4a1922fadced') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e732e13c-64bb-4f82-81f1-4a1922fadced', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '4D68E78E-64F7-4959-B18B-72159DF95A98', 'EntityID', 'One To Many', TRUE, TRUE, 65, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c0a41144-c359-43b1-8233-fd00a0c133f3') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c0a41144-c359-43b1-8233-fd00a0c133f3', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'EntityID', 'One To Many', TRUE, TRUE, 66, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '54b25e45-baec-4dae-91e7-7b7e931972ae') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('54b25e45-baec-4dae-91e7-7b7e931972ae', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '2758D216-C4D2-4FC4-8348-781372736159', 'CodeApprovedByUserID', 'One To Many', TRUE, TRUE, 104, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd1e1c972-6ec7-4ada-b6a3-16dc809287d6') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d1e1c972-6ec7-4ada-b6a3-16dc809287d6', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'StartedByUserID', 'One To Many', TRUE, TRUE, 105, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ad3fb445-38be-4edc-8e93-57cd5110a7cc') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad3fb445-38be-4edc-8e93-57cd5110a7cc', 'E4238F34-2837-EF11-86D4-6045BDEE16E6', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ScopeViewID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4ccdab2e-8bd3-48ca-82e5-c00550e2e786') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4ccdab2e-8bd3-48ca-82e5-c00550e2e786', 'EE238F34-2837-EF11-86D4-6045BDEE16E6', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ScopeListID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '372acfc8-a52f-44c4-a75b-c31797f7d1fe') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('372acfc8-a52f-44c4-a75b-c31797f7d1fe', '38248F34-2837-EF11-86D4-6045BDEE16E6', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', 'ActionID', 'One To Many', TRUE, TRUE, 13, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '486db300-fc8b-4708-ab41-b88f19d61ac1') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('486db300-fc8b-4708-ab41-b88f19d61ac1', '3E248F34-2837-EF11-86D4-6045BDEE16E6', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F', 'ActionExecutionLogID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8f84c96a-ed94-4ce4-8ec7-937ad6cace75') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f84c96a-ed94-4ce4-8ec7-937ad6cace75', '05853432-5E13-4F2A-8618-77857ADF17FA', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'ScheduledJobRunID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '75c587ef-074e-447e-94b3-4534c3dce8ca') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('75c587ef-074e-447e-94b3-4534c3dce8ca', '9989A9A4-5546-4552-A765-B27EE399BFEA', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F', 'ProcessRunID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '84fcbfe7-667e-419f-9d0a-87f2b62d1bc2') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('84fcbfe7-667e-419f-9d0a-87f2b62d1bc2', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB', 'ParentID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '772bbaf2-8033-4811-a862-b067a93ef9fd') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('772bbaf2-8033-4811-a862-b067a93ef9fd', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB', '2758D216-C4D2-4FC4-8348-781372736159', 'CategoryID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '0ccebc91-c51e-4983-a2f6-fe39d35b4cfa') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ccebc91-c51e-4983-a2f6-fe39d35b4cfa', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', '4D68E78E-64F7-4959-B18B-72159DF95A98', 'RecordProcessID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c425576e-ff23-4463-af51-92b8aa668fe1') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c425576e-ff23-4463-af51-92b8aa668fe1', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB', '9989A9A4-5546-4552-A765-B27EE399BFEA', 'RecordProcessID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '815ec410-7673-4cf2-ba4f-4982102358d4' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = 'Parent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('815ec410-7673-4cf2-ba4f-4982102358d4', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100013, 'Parent', 'Parent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1baebe69-5d23-4b94-a45d-d0f59bc18923' OR ("EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' AND "Name" = 'RootParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1baebe69-5d23-4b94-a45d-d0f59bc18923', 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00' /* Entity: MJ: Record Process Categories */, 100014, 'RootParentID', 'Root Parent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '013ddcb3-c03a-496f-8c0a-4d2f6b978915' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('013ddcb3-c03a-496f-8c0a-4d2f6b978915', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100031, 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f1ab8ef6-4c7f-4098-acd3-75c5397271c2' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'ActionExecutionLog')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f1ab8ef6-4c7f-4098-acd3-75c5397271c2', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100032, 'ActionExecutionLog', 'Action Execution Log', NULL, 'nvarchar', 850, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26e84059-9407-49b7-94c8-52280abeff18' OR ("EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' AND "Name" = 'AIAgentRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('26e84059-9407-49b7-94c8-52280abeff18', '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F' /* Entity: MJ: Process Run Details */, 100033, 'AIAgentRun', 'AI Agent Run', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9f2c99d8-8687-46d9-a1f1-c4e9b967c177' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'RecordProcess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9f2c99d8-8687-46d9-a1f1-c4e9b967c177', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100017, 'RecordProcess', 'Record Process', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5f08ec0-a3cf-4698-854d-a6c5b3b98246' OR ("EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5f08ec0-a3cf-4698-854d-a6c5b3b98246', '4D68E78E-64F7-4959-B18B-72159DF95A98' /* Entity: MJ: Record Process Watermarks */, 100018, 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d944e8f-a2f0-426e-9531-bfe8bec27549' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'Category')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d944e8f-a2f0-426e-9531-bfe8bec27549', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100053, 'Category', 'Category', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b3dd7a6d-995a-4e4e-a9e3-a0395c0337a1' OR ("EntityID" = '2758D216-C4D2-4FC4-8348-781372736159' AND "Name" = 'CodeApprovedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3dd7a6d-995a-4e4e-a9e3-a0395c0337a1', '2758D216-C4D2-4FC4-8348-781372736159' /* Entity: MJ: Remote Operations */, 100054, 'CodeApprovedByUser', 'Code Approved By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4916c4a0-ecb1-4738-8141-e8da4e6c651d' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'RecordProcess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4916c4a0-ecb1-4738-8141-e8da4e6c651d', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100051, 'RecordProcess', 'Record Process', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6267a92f-1921-46c0-963b-ae041390c4bd' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6267a92f-1921-46c0-963b-ae041390c4bd', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100052, 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '998e51f3-f9a5-4981-92fd-05b87aabd197' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'ScheduledJobRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('998e51f3-f9a5-4981-92fd-05b87aabd197', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100053, 'ScheduledJobRun', 'Scheduled Job Run', NULL, 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94624b23-bb5a-4b7c-9f62-234aab9c246e' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'StartedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('94624b23-bb5a-4b7c-9f62-234aab9c246e', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100054, 'StartedByUser', 'Started By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0278d48e-6c0a-4464-b5dc-95abe9b19c81' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = 'Parent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0278d48e-6c0a-4464-b5dc-95abe9b19c81', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100013, 'Parent', 'Parent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8daefd25-bf8e-4d6a-ada2-813a013f03c5' OR ("EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' AND "Name" = 'RootParentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8daefd25-bf8e-4d6a-ada2-813a013f03c5', '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB' /* Entity: MJ: Remote Operation Categories */, 100014, 'RootParentID', 'Root Parent ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8f54bad-543b-4082-8db9-2bf0f34ce993' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Category')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8f54bad-543b-4082-8db9-2bf0f34ce993', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100059, 'Category', 'Category', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5ce09bf2-dbb4-49b3-97cd-8c20cf448da1' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5ce09bf2-dbb4-49b3-97cd-8c20cf448da1', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100060, 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ffab4fd7-af59-42b4-b7c5-2bbe2e6b8f35' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Action')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ffab4fd7-af59-42b4-b7c5-2bbe2e6b8f35', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100061, 'Action', 'Action', NULL, 'nvarchar', 850, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '15b95e88-8bd4-49d5-b04f-90c9173351a9' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Agent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('15b95e88-8bd4-49d5-b04f-90c9173351a9', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100062, 'Agent', 'Agent', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '85590616-2d31-4b15-be84-5175ebaa9777' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'Prompt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('85590616-2d31-4b15-be84-5175ebaa9777', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100063, 'Prompt', 'Prompt', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '035b67e3-1504-438a-82e9-178bb5092919' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ScopeView')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('035b67e3-1504-438a-82e9-178bb5092919', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100064, 'ScopeView', 'Scope View', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '85a81719-b926-406c-b48f-0455e41d6143' OR ("EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' AND "Name" = 'ScopeList')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('85a81719-b926-406c-b48f-0455e41d6143', 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB' /* Entity: MJ: Record Processes */, 100065, 'ScopeList', 'Scope List', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3CD1C19C-5D37-4F9F-8792-35A8F69231BD'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3CD1C19C-5D37-4F9F-8792-35A8F69231BD'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '913536C2-2A22-403A-B26A-303DD667758A'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C34E9634-B464-4297-89D7-C7120BD1FB78'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '39380D84-086B-4F99-AE8C-BB59C7E608A9'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '0278D48E-6C0A-4464-B5DC-95ABE9B19C81'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '1AD86A5B-33CD-4E82-842F-3678208DD8F5'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E' AND "AutoUpdateIsNameField" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B670820C-79D7-498F-8D38-0AD9D03C3A28'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '11E29273-D8A3-4F91-9064-1BB488F36D74'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C78EB8B6-294C-4B33-8956-3825DA34A4CF'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '2CF14960-A8DE-4C6F-BA3A-4294ACD26512'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8F03BD3C-6433-4B40-8DA3-3F4C1261C722'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '57D01D43-E27F-41A8-96EE-0A2E0FA65F8E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4916C4A0-ECB1-4738-8141-E8DA4E6C651D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'B670820C-79D7-498F-8D38-0AD9D03C3A28'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '11E29273-D8A3-4F91-9064-1BB488F36D74'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '4916C4A0-ECB1-4738-8141-E8DA4E6C651D'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'B670820C-79D7-498F-8D38-0AD9D03C3A28'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '11E29273-D8A3-4F91-9064-1BB488F36D74'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '132687CC-6F60-45EE-A301-752C75AF1DA6' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '132687CC-6F60-45EE-A301-752C75AF1DA6'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'FD24BA01-5A08-468A-A478-1C23A3AA8D38'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '9F2C99D8-8687-46D9-A1F1-C4E9B967C177'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B5F08EC0-A3CF-4698-854D-A6C5B3B98246'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '132687CC-6F60-45EE-A301-752C75AF1DA6'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '9F2C99D8-8687-46D9-A1F1-C4E9B967C177'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'B5F08EC0-A3CF-4698-854D-A6C5B3B98246'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '0E5817F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = 'DD238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '875BC3B1-CD0F-47E3-920C-361A25781E2D' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '875BC3B1-CD0F-47E3-920C-361A25781E2D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4C1E18FF-49C9-405B-9F5C-285B449B464C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'E43A16D0-78D6-4B4C-B9DD-5A91CFE83489'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'AA07D584-D6DA-434D-B5BA-45EF59AD8C81'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D5F1A73F-5907-4EA0-9909-6A04A3FEE563'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '875BC3B1-CD0F-47E3-920C-361A25781E2D'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '4C1E18FF-49C9-405B-9F5C-285B449B464C'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '0E1D1655-25DB-489F-979F-995D7BAC441A'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '875BC3B1-CD0F-47E3-920C-361A25781E2D'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '4C1E18FF-49C9-405B-9F5C-285B449B464C'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '58345D95-711E-470F-BD28-1AA4AD8214D2'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3870E096-3FAC-4AED-B341-873AD9F69336'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '5CE09BF2-DBB4-49B3-97CD-8C20CF448DA1'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '58345D95-711E-470F-BD28-1AA4AD8214D2'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '3870E096-3FAC-4AED-B341-873AD9F69336'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = '5CE09BF2-DBB4-49B3-97CD-8C20CF448DA1'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '9FF9B001-2863-4B76-8254-EEA9ED8D9C19'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '58345D95-711E-470F-BD28-1AA4AD8214D2'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '3870E096-3FAC-4AED-B341-873AD9F69336'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '5CE09BF2-DBB4-49B3-97CD-8C20CF448DA1'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 8 fields */ /* UPDATE Entity Field Category Info MJ: Record Process Categories.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0983D210-82B5-48BE-93FE-214EA26A867D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Categories.Name */
UPDATE __mj."EntityField" SET "Category" = 'Category Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '913536C2-2A22-403A-B26A-303DD667758A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Categories.Description */
UPDATE __mj."EntityField" SET "Category" = 'Category Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3CD1C19C-5D37-4F9F-8792-35A8F69231BD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Categories.ParentID */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '351CDBE3-1178-47CB-8363-4C8EC08DE442' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Categories.Parent */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '815EC410-7673-4CF2-BA4F-4982102358D4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Categories.RootParentID */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Parent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1BAEBE69-5D23-4B94-A45D-D0F59BC18923' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Categories.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C9F9AD04-62E4-4557-B2A3-F61C6E9EE04E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Categories.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1E440E6F-1095-47E0-8510-D51E6677B026' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 8 fields */ /* UPDATE Entity Field Category Info MJ: Remote Operation Categories.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2CE84FDE-E332-45F0-BF18-E34D09ECADF5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operation Categories.Name */
UPDATE __mj."EntityField" SET "Category" = 'Category Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1AD86A5B-33CD-4E82-842F-3678208DD8F5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operation Categories.Description */
UPDATE __mj."EntityField" SET "Category" = 'Category Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B054E7B8-1459-4D2C-83BB-38334F238194' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operation Categories.ParentID */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EBB8E5BA-A1E4-45AA-B8C6-A90A9B50AAEF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operation Categories.Parent */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0278D48E-6C0A-4464-B5DC-95ABE9B19C81' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operation Categories.RootParentID */
UPDATE __mj."EntityField" SET "Category" = 'Hierarchy', "GeneratedFormSection" = 'Category', "DisplayName" = 'Root Parent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8DAEFD25-BF8E-4D6A-ADA2-813A013F03C5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operation Categories.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E6154303-42F0-4523-BFCE-DA5F5D252DE8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operation Categories.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D7A985FB-4DD3-42AA-B64C-5F93A3305C27' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-folder-tree */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-folder-tree', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00';

/* Set entity icon to fa fa-folder-tree */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-folder-tree', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB';

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
    'c03cc269-4db8-455c-bdc2-a8e261c5cf76',
    'ECAFF493-A864-4D15-BEA0-2F5051EFCF00',
    'FieldCategoryInfo',
    '{"Category Details":{"icon":"fa fa-info-circle","description":"Basic information and descriptive labels for the category"},"Hierarchy":{"icon":"fa fa-sitemap","description":"Structural relationships defining the category folder tree"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

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
    'b1de27fd-a5ba-4b9a-ab59-2c513331c907',
    '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB',
    'FieldCategoryInfo',
    '{"Category Details":{"icon":"fa fa-info-circle","description":"Primary identification and descriptive information for the category"},"Hierarchy":{"icon":"fa fa-sitemap","description":"Configuration for folder nesting and organizational structure"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
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
    'b9fad7cd-92cd-4ea5-b788-737528c59bf8',
    'ECAFF493-A864-4D15-BEA0-2F5051EFCF00',
    'FieldCategoryIcons',
    '{"Category Details":"fa fa-info-circle","Hierarchy":"fa fa-sitemap","System Metadata":"fa fa-cog"}',
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
    '7a04cf7d-f5de-41cb-b23c-4ae7f5b3060b',
    '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB',
    'FieldCategoryIcons',
    '{"Category Details":"fa fa-info-circle","Hierarchy":"fa fa-sitemap","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '65E0BDFB-B7FA-4BA3-A17F-BE997CE45EAB';

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'ECAFF493-A864-4D15-BEA0-2F5051EFCF00';

/* Set categories for 10 fields */ /* UPDATE Entity Field Category Info MJ: Record Process Watermarks.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AA9DD38B-C4FA-4DBB-A533-D0653C879BCF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.RecordProcessID */
UPDATE __mj."EntityField" SET "Category" = 'Process Tracking', "GeneratedFormSection" = 'Category', "DisplayName" = 'Record Process', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '04F6E672-C647-4D16-A822-6F722DB16D0F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Process Tracking', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '29703404-FBD8-493F-B1A8-B3C25266DA22' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.RecordID */
UPDATE __mj."EntityField" SET "Category" = 'Process Tracking', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '132687CC-6F60-45EE-A301-752C75AF1DA6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.Hash */
UPDATE __mj."EntityField" SET "Category" = 'Checksum Data', "GeneratedFormSection" = 'Category', "DisplayName" = 'Content Hash', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '64E0ED6B-8D3A-4874-A62C-40B249D7CF49' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.LastProcessedAt */
UPDATE __mj."EntityField" SET "Category" = 'Checksum Data', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FD24BA01-5A08-468A-A478-1C23A3AA8D38' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.RecordProcess */
UPDATE __mj."EntityField" SET "Category" = 'Process Tracking', "GeneratedFormSection" = 'Category', "DisplayName" = 'Record Process Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9F2C99D8-8687-46D9-A1F1-C4E9B967C177' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.Entity */
UPDATE __mj."EntityField" SET "Category" = 'Process Tracking', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B5F08EC0-A3CF-4698-854D-A6C5B3B98246' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C3D67610-D28D-42E3-B2E6-DF6967D9F068' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Process Watermarks.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E4D26E94-A81E-486A-A2E0-92928E149AC2' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 14 fields */ /* UPDATE Entity Field Category Info MJ: Integrations.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.NavigationBaseURL */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = '105817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.Icon */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C2A2F579-8A45-4EEB-AA3D-06B479DE0EDD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Integration Overview', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'B84CF2D7-7643-46B1-9D82-094E54320F99' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.ClassName */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '345817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.ImportPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '355817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.BatchMaxRequestCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B04217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.BatchRequestWaitTime */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B14217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.CredentialTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9A4502A9-0E22-4038-8341-01B9A9211E44' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.CredentialType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '495817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integrations.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-water */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-water', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '4D68E78E-64F7-4959-B18B-72159DF95A98';

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
    'f6ee7476-19d0-4f0f-96c1-247a4423f137',
    '4D68E78E-64F7-4959-B18B-72159DF95A98',
    'FieldCategoryInfo',
    '{"Process Tracking":{"icon":"fa fa-tasks","description":"Information linking the watermark to specific processes and records"},"Checksum Data":{"icon":"fa fa-fingerprint","description":"Technical data used for change detection and processing status"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
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
    '7e725ade-a326-40b5-8d01-24245de7f854',
    '4D68E78E-64F7-4959-B18B-72159DF95A98',
    'FieldCategoryIcons',
    '{"Process Tracking":"fa fa-tasks","Checksum Data":"fa fa-fingerprint","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '4D68E78E-64F7-4959-B18B-72159DF95A98';

/* Set categories for 18 fields */ /* UPDATE Entity Field Category Info MJ: Process Run Details.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E44462E2-5183-4F71-94F2-43F3ED047687' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.ProcessRunID */
UPDATE __mj."EntityField" SET "Category" = 'Process Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Process Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E87B2327-55E7-4561-956C-D66E169FFB77' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Process Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '31862007-CF7B-45B2-8A4A-41DD70B7FE64' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.Entity */
UPDATE __mj."EntityField" SET "Category" = 'Process Context', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '013DDCB3-C03A-496F-8C0A-4D2F6B978915' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.RecordID */
UPDATE __mj."EntityField" SET "Category" = 'Process Context', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '875BC3B1-CD0F-47E3-920C-361A25781E2D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.Status */
UPDATE __mj."EntityField" SET "Category" = 'Execution Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4C1E18FF-49C9-405B-9F5C-285B449B464C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.StartedAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E43A16D0-78D6-4B4C-B9DD-5A91CFE83489' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.CompletedAt */
UPDATE __mj."EntityField" SET "Category" = 'Execution Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '84CF9E11-BB3D-4F0C-A932-D9BCC5977FBA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.DurationMs */
UPDATE __mj."EntityField" SET "Category" = 'Execution Status', "GeneratedFormSection" = 'Category', "DisplayName" = 'Duration (ms)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'AA07D584-D6DA-434D-B5BA-45EF59AD8C81' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.AttemptCount */
UPDATE __mj."EntityField" SET "Category" = 'Execution Status', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D5F1A73F-5907-4EA0-9909-6A04A3FEE563' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.ResultPayload */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'A6831ED3-2E25-49AD-BAED-9112E80E2323' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.ErrorMessage */
UPDATE __mj."EntityField" SET "Category" = 'Execution Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0E1D1655-25DB-489F-979F-995D7BAC441A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.ActionExecutionLogID */
UPDATE __mj."EntityField" SET "Category" = 'Tracing and Logs', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '564B0887-5BD1-4731-A377-69AE0F05B18C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.ActionExecutionLog */
UPDATE __mj."EntityField" SET "Category" = 'Tracing and Logs', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F1AB8EF6-4C7F-4098-ACD3-75C5397271C2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.AIAgentRunID */
UPDATE __mj."EntityField" SET "Category" = 'Tracing and Logs', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7D48E08D-1F3A-4201-A430-596B7F4742D4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.AIAgentRun */
UPDATE __mj."EntityField" SET "Category" = 'Tracing and Logs', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '26E84059-9407-49B7-94C8-52280ABEFF18' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '70F4506A-0BA2-4620-8AA2-5C243EC6619E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Run Details.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EB9C9DF6-06AF-4336-B3AE-7BA055C83B27' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-tasks */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-tasks', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F';

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
    'f1b0b542-ea9b-420d-b2f6-f0178392f9af',
    '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F',
    'FieldCategoryInfo',
    '{"Process Context":{"icon":"fa fa-database","description":"Information identifying the specific record and process run context."},"Execution Status":{"icon":"fa fa-clock","description":"Timing, status, and retry metrics for the record processing."},"Execution Results":{"icon":"fa fa-file-alt","description":"Output data and error diagnostics from the process run."},"Tracing and Logs":{"icon":"fa fa-search","description":"Deep tracing references for action logs and AI agent runs."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}',
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
    'e4a27fcd-6f2e-4ee0-b35c-31f53f7993af',
    '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F',
    'FieldCategoryIcons',
    '{"Process Context":"fa fa-database","Execution Status":"fa fa-clock","Execution Results":"fa fa-file-alt","Tracing and Logs":"fa fa-search","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '32AA9C83-D4D5-4E7A-AA99-4A9869BB3F3F';

/* Set categories for 28 fields */ /* UPDATE Entity Field Category Info MJ: Remote Operations.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A1B3D99B-A135-43FA-BC27-97809AA1BE6B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Name */
UPDATE __mj."EntityField" SET "Category" = 'Operation Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D282A96B-D93F-46BE-A966-39AABF607537' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OperationKey */
UPDATE __mj."EntityField" SET "Category" = 'Operation Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4DC009D7-A719-4ACA-BD04-BFFABA9AC432' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CategoryID */
UPDATE __mj."EntityField" SET "Category" = 'Operation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E614810B-D58B-49D3-8BB6-875FD70F17FA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Description */
UPDATE __mj."EntityField" SET "Category" = 'Operation Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4BDE9929-8999-490C-AAB7-33755D18FD31' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Category */
UPDATE __mj."EntityField" SET "Category" = 'Operation Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Category Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7D944E8F-A2F0-426E-9531-BFE8BEC27549' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeName */
UPDATE __mj."EntityField" SET "Category" = 'Contract Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3261C71D-480F-431F-949B-A654B19EA426' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeDefinition */
UPDATE __mj."EntityField" SET "Category" = 'Contract Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'TypeScript'
WHERE
  "ID" = 'B9141D93-64B2-4903-B550-5CFCA72637CB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.InputTypeIsArray */
UPDATE __mj."EntityField" SET "Category" = 'Contract Definition', "GeneratedFormSection" = 'Category', "DisplayName" = 'Is Input Array', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5AE69D4C-5B11-4DF3-98B3-4940C76611F3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeName */
UPDATE __mj."EntityField" SET "Category" = 'Contract Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2ADFF8A2-ED60-4A3E-973A-CFE5B4A6ED99' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeDefinition */
UPDATE __mj."EntityField" SET "Category" = 'Contract Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'TypeScript'
WHERE
  "ID" = '7ACB3F9F-1163-4614-98AA-6A343E878AAD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.OutputTypeIsArray */
UPDATE __mj."EntityField" SET "Category" = 'Contract Definition', "GeneratedFormSection" = 'Category', "DisplayName" = 'Is Output Array', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4390D029-D795-4007-8EE9-F501DF1A7F65' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.ContractFingerprint */
UPDATE __mj."EntityField" SET "Category" = 'Contract Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '80C6B5D2-7567-4A63-9A1A-17677A34BFA5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.ExecutionMode */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C34E9634-B464-4297-89D7-C7120BD1FB78' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.RequiredScope */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '58125CD2-4955-4088-B3BD-CC4034DA597A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.RequiresSystemUser */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5F825817-3679-41B6-86FA-747065D9825E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CacheTTLSeconds */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Cache TTL (Seconds)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '814591AB-4B99-4B4E-BFD0-24CABCABBD78' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.TimeoutMS */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "DisplayName" = 'Timeout (MS)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B61AFDE6-BA4A-40B9-9C88-469BC568591F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.MaxConcurrency */
UPDATE __mj."EntityField" SET "Category" = 'Execution Settings', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EA3FF7AE-094C-470A-A653-219D56FB6ED3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.GenerationType */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D6662178-7C96-48BE-9EEE-1CEE960277C4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Code */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "DisplayName" = 'Implementation Code', "ExtendedType" = 'Code', "CodeType" = 'TypeScript'
WHERE
  "ID" = '759AA844-3C64-45CF-A014-94CA7E8E1989' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovalStatus */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "DisplayName" = 'Approval Status', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A0FE0FFC-FD02-4064-9C2A-BB903ADF7296' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "DisplayName" = 'Approved By User ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C62BC997-B1B4-49AF-83C8-5B0A2E9F66E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "DisplayName" = 'Approved By User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B3DD7A6D-995A-4E4E-A9E3-A0395C0337A1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.CodeApprovedAt */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "DisplayName" = 'Approved At', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B7640E68-0ED9-4223-8BCB-60145D6088AF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.Status */
UPDATE __mj."EntityField" SET "Category" = 'Implementation and Approval', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '39380D84-086B-4F99-AE8C-BB59C7E608A9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9B2E73F0-D95D-4B80-B3EF-D2570D9CE87A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Remote Operations.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '077E22CF-092C-4B46-AAE1-FF2FC99A5ABD' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-terminal */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-terminal', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '2758D216-C4D2-4FC4-8348-781372736159';

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
    'a5632913-d065-483d-bd56-c2ba65931d43',
    '2758D216-C4D2-4FC4-8348-781372736159',
    'FieldCategoryInfo',
    '{"Operation Details":{"icon":"fa fa-info-circle","description":"General identification and descriptive information for the operation."},"Contract Definition":{"icon":"fa fa-file-code","description":"Input and output data structures and typing definitions."},"Execution Settings":{"icon":"fa fa-sliders-h","description":"Performance, security, and runtime configuration settings."},"Implementation and Approval":{"icon":"fa fa-check-double","description":"Governance, code generation status, and implementation lifecycle."},"System Metadata":{"icon":"fa fa-cog","description":"Internal system tracking and audit fields."}}',
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
    '5a280a33-0e65-441f-91a1-451b7efe9138',
    '2758D216-C4D2-4FC4-8348-781372736159',
    'FieldCategoryIcons',
    '{"Operation Details":"fa fa-info-circle","Contract Definition":"fa fa-file-code","Execution Settings":"fa fa-sliders-h","Implementation and Approval":"fa fa-check-double","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '2758D216-C4D2-4FC4-8348-781372736159';

/* Set categories for 29 fields */ /* UPDATE Entity Field Category Info MJ: Process Runs.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A9FFCA8A-1099-4F8F-A325-CD624B51BB66' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.RecordProcessID */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Record Process', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1ECA5E38-BEBC-43A8-B33B-9F5CFBD0FB3E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9170B1E1-FF8B-4EAC-8226-E2D15B1A76E2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.TriggeredBy */
UPDATE __mj."EntityField" SET "Category" = 'Execution Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B670820C-79D7-498F-8D38-0AD9D03C3A28' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SourceType */
UPDATE __mj."EntityField" SET "Category" = 'Execution Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SourceID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BEC4BA25-2CBA-4808-AA71-4DA546A95F0C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SourceFilter */
UPDATE __mj."EntityField" SET "Category" = 'Execution Details', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E849E10D-69BB-48B7-B504-F931D4C6D302' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ScheduledJobRunID */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled Job Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DC7D5571-B22C-4FD6-A36D-790B190ADBBC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.Status */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '11E29273-D8A3-4F91-9064-1BB488F36D74' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.StartTime */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C78EB8B6-294C-4B33-8956-3825DA34A4CF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.EndTime */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7A7C3157-7F98-46B4-A475-125AA7E7F760' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.TotalItemCount */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2CF14960-A8DE-4C6F-BA3A-4294ACD26512' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ProcessedItems */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '23E3932F-567F-440F-B2E1-E6E9B61A8BE1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SuccessCount */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8F03BD3C-6433-4B40-8DA3-3F4C1261C722' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ErrorCount */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '57D01D43-E27F-41A8-96EE-0A2E0FA65F8E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SkippedCount */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '33E09621-2188-486B-8AB0-2228FFEB3334' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.LastProcessedOffset */
UPDATE __mj."EntityField" SET "Category" = 'Resume and Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5DC6B4A5-37CB-4A27-AAAC-74418D608358' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.LastProcessedKey */
UPDATE __mj."EntityField" SET "Category" = 'Resume and Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '83849077-7BCB-4551-BF0F-F616950C1631' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.BatchSize */
UPDATE __mj."EntityField" SET "Category" = 'Resume and Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '452E04A8-ADEF-4B51-A7F4-0734A7C14B0B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.CancellationRequested */
UPDATE __mj."EntityField" SET "Category" = 'Resume and Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4F3E0043-532A-4D58-A4D3-DA02E000512E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Resume and Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '7E55C4BA-7F21-44D7-99A3-C32567525104' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ErrorMessage */
UPDATE __mj."EntityField" SET "Category" = 'Progress and Results', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C9877C8C-CCC0-4C18-925F-A4DBB9253928' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.StartedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Started By User', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6241C397-A80E-49BC-8612-ED10E14DC1C9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '177CAE5F-FC07-45CF-B350-DCBBCD8AD401' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '63F725A3-D543-4CE7-B874-C3E5A36ABA95' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.RecordProcess */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Record Process Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4916C4A0-ECB1-4738-8141-E8DA4E6C651D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.Entity */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6267A92F-1921-46C0-963B-AE041390C4BD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ScheduledJobRun */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scheduled Job Run Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '998E51F3-F9A5-4981-92FD-05B87AABD197' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.StartedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Context and Relationships', "GeneratedFormSection" = 'Category', "DisplayName" = 'Started By User Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '94624B23-BB5A-4B7C-9F62-234AAB9C246E' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-tasks */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-tasks', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '9989A9A4-5546-4552-A765-B27EE399BFEA';

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
    '9d746216-c479-4e85-a803-86e50ec3ceea',
    '9989A9A4-5546-4552-A765-B27EE399BFEA',
    'FieldCategoryInfo',
    '{"Context and Relationships":{"icon":"fa fa-link","description":"Links to parent processes, entities, schedules, and users."},"Execution Details":{"icon":"fa fa-cogs","description":"Technical parameters, sources, and triggers for the process run."},"Progress and Results":{"icon":"fa fa-chart-line","description":"Operational metrics, status, and outcome reporting."},"Resume and Configuration":{"icon":"fa fa-sliders-h","description":"Settings and cursors to manage run persistence and interruptions."},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields."}}',
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
    '93da1664-09ca-48fc-956e-bd3c39b0e041',
    '9989A9A4-5546-4552-A765-B27EE399BFEA',
    'FieldCategoryIcons',
    '{"Context and Relationships":"fa fa-link","Execution Details":"fa fa-cogs","Progress and Results":"fa fa-chart-line","Resume and Configuration":"fa fa-sliders-h","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA';

/* Set categories for 36 fields */ /* UPDATE Entity Field Category Info MJ: Record Processes.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '107CC4D4-6287-4E3E-8CAD-FF043CF1D836' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Name */
UPDATE __mj."EntityField" SET "Category" = 'Process Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9FF9B001-2863-4B76-8254-EEA9ED8D9C19' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Description */
UPDATE __mj."EntityField" SET "Category" = 'Process Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '540F4489-76CF-4941-A776-1D2C1EA862A2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.CategoryID */
UPDATE __mj."EntityField" SET "Category" = 'Process Definition', "GeneratedFormSection" = 'Category', "DisplayName" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DFE28C7D-7CCD-4007-ACDB-39B8CDC542F5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Process Definition', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '94D871B8-C8D6-4BCB-BE0F-726CAA10D46B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Status */
UPDATE __mj."EntityField" SET "Category" = 'Process Definition', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D81C7AEA-D8C3-4BFF-AA45-D16F0BA74A0C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.WorkType */
UPDATE __mj."EntityField" SET "Category" = 'Execution Logic', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '58345D95-711E-470F-BD28-1AA4AD8214D2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ActionID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Logic', "GeneratedFormSection" = 'Category', "DisplayName" = 'Action', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1F783AE0-0480-400B-BAFB-AFF50EA10DDE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.AgentID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Logic', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4C15036F-A2C0-4E68-B31D-FE4C393CF288' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.PromptID */
UPDATE __mj."EntityField" SET "Category" = 'Execution Logic', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E4071179-A1A0-41EE-BD99-E90CD79483AA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.InputMapping */
UPDATE __mj."EntityField" SET "Category" = 'Execution Logic', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '026FCA08-619E-4482-8E47-864E47574405' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.OutputMapping */
UPDATE __mj."EntityField" SET "Category" = 'Execution Logic', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = 'F72765D0-7F99-45B4-8B9A-365EF3971E72' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ScopeType */
UPDATE __mj."EntityField" SET "Category" = 'Scope Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3870E096-3FAC-4AED-B341-873AD9F69336' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ScopeViewID */
UPDATE __mj."EntityField" SET "Category" = 'Scope Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scope View', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7E294259-20AB-4C51-997F-398BB863C6A4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ScopeListID */
UPDATE __mj."EntityField" SET "Category" = 'Scope Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scope List', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '494D4D38-9510-4FC2-93D3-E1ACDDECBC86' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ScopeFilter */
UPDATE __mj."EntityField" SET "Category" = 'Scope Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'SQL'
WHERE
  "ID" = '3C17FB9B-F49B-4BA2-B450-270955BCE58A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.OnChangeEnabled */
UPDATE __mj."EntityField" SET "Category" = 'Triggers', "GeneratedFormSection" = 'Category', "DisplayName" = 'On-Change Enabled', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1DE8D37A-C71F-437F-BAE9-5268D5B8DBB8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.OnChangeInvocationType */
UPDATE __mj."EntityField" SET "Category" = 'Triggers', "GeneratedFormSection" = 'Category', "DisplayName" = 'On-Change Invocation Type', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '851D7356-EEFA-4CC4-9202-139A99EA4B22' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.OnChangeFilter */
UPDATE __mj."EntityField" SET "Category" = 'Triggers', "GeneratedFormSection" = 'Category', "DisplayName" = 'On-Change Filter', "ExtendedType" = 'Code', "CodeType" = 'SQL'
WHERE
  "ID" = '8520BF95-E0F2-456E-9816-BF7BA9458289' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ScheduleEnabled */
UPDATE __mj."EntityField" SET "Category" = 'Triggers', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '39A27B5B-1D40-49C5-9A3B-0E6FB81EE0AA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.CronExpression */
UPDATE __mj."EntityField" SET "Category" = 'Triggers', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '34C3F3EF-91BE-4259-BFE9-9D0E0A80F959' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Timezone */
UPDATE __mj."EntityField" SET "Category" = 'Triggers', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5AD86D1D-6370-4ED3-94EE-53C2DCA3EC8C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.OnDemandEnabled */
UPDATE __mj."EntityField" SET "Category" = 'Triggers', "GeneratedFormSection" = 'Category', "DisplayName" = 'On-Demand Enabled', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '648AFE09-C3E4-44CF-9402-6498835B16CE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.SkipUnchanged */
UPDATE __mj."EntityField" SET "Category" = 'Performance and Optimization', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FB9DA9DD-EB62-4D7D-8F58-6EDC8B8580C5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.WatermarkStrategy */
UPDATE __mj."EntityField" SET "Category" = 'Performance and Optimization', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B88EBE16-AD08-4D04-9DA6-A1BCD016CB01' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.BatchSize */
UPDATE __mj."EntityField" SET "Category" = 'Performance and Optimization', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '82230A4A-9B9A-4D14-A5EF-337443094510' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.MaxConcurrency */
UPDATE __mj."EntityField" SET "Category" = 'Performance and Optimization', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1FC0F26A-B10F-44D3-8C75-8154C72A5078' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B7D32F5C-E153-4CC3-B63D-8E76980334BF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8ADA0BE9-FCF3-46F6-AA1C-0C400167860F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Category */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Category (Display)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D8F54BAD-543B-4082-8DB9-2BF0F34CE993' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Entity */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity (Display)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5CE09BF2-DBB4-49B3-97CD-8C20CF448DA1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Action */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Action (Display)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FFAB4FD7-AF59-42B4-B7C5-2BBE2E6B8F35' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Agent */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Agent (Display)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '15B95E88-8BD4-49D5-B04F-90C9173351A9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.Prompt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Prompt (Display)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '85590616-2D31-4B15-BE84-5175EBAA9777' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ScopeView */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scope View (Display)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '035B67E3-1504-438A-82E9-178BB5092919' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Record Processes.ScopeList */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "DisplayName" = 'Scope List (Display)', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '85A81719-B926-406C-B48F-0455E41D6143' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 44 fields */ /* UPDATE Entity Field Category Info MJ: Integration Objects.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F5F7651F-56E2-4E92-A9FE-CFCD61B58B25' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4C7B2511-B32A-4E05-AD8F-71A8D7438E96' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '17416191-6BA9-4D7D-B38D-5D32220C994E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.IntegrationID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Integration ID', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A0EAB738-4BB1-499F-80FC-AA8A0B46B389' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.Integration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Integration', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.Name */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7F19F87B-4609-4738-97D6-8627DE23AF4B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.DisplayName */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DBFED2A5-355D-4617-B4F8-237B4D3B2365' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.Category */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0F0F0147-386F-45C8-AA9F-021C26B634A5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.Sequence */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9057E47C-7633-4B86-8ADF-F09044FE4470' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '027BC6FB-AC73-41C5-8856-981FB0031897' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.IsCustom */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4A4675F9-36F6-4EDF-83C0-29DFFEE0B61E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.MetadataSource */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0E920E25-6359-47DD-8A31-C0196742E2BC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.APIPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1CFA6C37-9057-4662-8C40-F835AA972EDF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.ResponseDataKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ADE52A5E-ADBA-4414-AAE2-12B535F85AC3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.DefaultQueryParams */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '38708EAC-BEC9-4BD1-AFA5-AF93A00F0FEA' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.Configuration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'ED9326F4-6377-4FB3-84FA-EBCC9859FC07' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.WriteAPIPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D0BEDA5A-9F7B-4611-867D-59AA8EF8B849' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.WriteMethod */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F0FC7DA1-9649-427C-AEE2-DF31700F7512' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.DeleteMethod */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3006B046-676A-4DF8-B861-2A9A8EFE059D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.CreateAPIPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F6C8AB31-990B-465F-9DDB-2100BCDFE9FC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.CreateMethod */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '982985B8-FA52-4AAA-8E0D-D13D02F3043F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.UpdateAPIPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '56708F15-2CBA-4E41-AE0D-E8E7FB09EA0C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.UpdateMethod */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D48250B7-4106-4978-8AA3-0CD4CD3081D9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.DeleteAPIPath */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '328CA7CD-8257-4583-9E5E-07E597CA7927' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.DefaultPageSize */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '85D95D3F-DAD6-492D-90AF-5207D16780EE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.SupportsPagination */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '27719863-6129-44D5-A77C-7827DB58BD91' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.PaginationType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '248DBCEF-E551-4913-8579-200B33459E16' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.SupportsIncrementalSync */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C73A053E-44E2-40A8-9A0A-899E6E28AF4D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.SupportsWrite */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E48963CB-3027-4554-BF48-52ECA282D983' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.IncrementalWatermarkField */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0AF8BA65-0D29-4B03-8720-AD7AEF6ADB1C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.SupportsCreate */
UPDATE __mj."EntityField" SET "Category" = 'Sync and Pagination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5D5684EC-6C36-4819-AE89-D0A80D0D2A7D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.SupportsUpdate */
UPDATE __mj."EntityField" SET "Category" = 'Sync and Pagination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C620F72E-E006-4910-85F1-AF325C7F9A84' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.SupportsDelete */
UPDATE __mj."EntityField" SET "Category" = 'Sync and Pagination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '57E9E4A5-0CAE-4FBB-913A-D60ECBA2ED4E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.SyncStrategy */
UPDATE __mj."EntityField" SET "Category" = 'Sync and Pagination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9B642688-F4D2-42C4-BAB0-A9B5987AA704' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.ContentHashApplicable */
UPDATE __mj."EntityField" SET "Category" = 'Sync and Pagination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '14DA7A81-4A5A-402B-AB5B-4D28B7A96205' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.StableOrderingKey */
UPDATE __mj."EntityField" SET "Category" = 'Sync and Pagination', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '05F9C2DD-1157-4B13-BD5C-9BA99B44AB30' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.CreateBodyShape */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E74D8690-07E5-4678-BEEF-FAD65E453941' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.CreateBodyKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3081B789-FA40-41BA-836A-AFA9BAE50CBC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.CreateIDLocation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '71FE9BAD-9BEF-4078-A376-54784F72149C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.UpdateBodyShape */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B07F5316-77FE-4E2A-A92C-896BB5F1BBAC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.UpdateBodyKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F1AC0557-8D3E-4234-B61A-24A306CA38EE' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.UpdateIDLocation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9A958C8D-688C-48CE-AFFE-5B7C8213D801' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Integration Objects.DeleteIDLocation */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E76A6A30-2540-402A-84CC-7B68C629F8F4' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-cogs */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-cogs', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB';

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
    'b0086083-0700-401c-96ce-d36df2a75273',
    'BDE34DF9-7B59-4921-9B80-E94BC013A5BB',
    'FieldCategoryInfo',
    '{"Process Definition":{"icon":"fa fa-info-circle","description":"Core identity, status, and target entity for the process definition."},"Execution Logic":{"icon":"fa fa-play","description":"Configuration for the work to be performed, including AI prompts and data mapping."},"Scope Configuration":{"icon":"fa fa-filter","description":"Defines the set of records to be processed via views, lists, or ad-hoc filters."},"Triggers":{"icon":"fa fa-bolt","description":"Settings for how and when the process is invoked: on-change, scheduled, or manual."},"Performance and Optimization":{"icon":"fa fa-tachometer-alt","description":"Controls for batching, concurrency, and change detection to optimize execution."},"System Metadata":{"icon":"fa fa-database","description":"Internal audit, system timestamps, and denormalized display fields."}}',
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
    '38f148d4-fbb4-4784-a9f4-5dc40312fd7b',
    'BDE34DF9-7B59-4921-9B80-E94BC013A5BB',
    'FieldCategoryIcons',
    '{"Process Definition":"fa fa-info-circle","Execution Logic":"fa fa-play","Scope Configuration":"fa fa-filter","Triggers":"fa fa-bolt","Performance and Optimization":"fa fa-tachometer-alt","System Metadata":"fa fa-database"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'BDE34DF9-7B59-4921-9B80-E94BC013A5BB';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integration Objects
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_integration_object_integration_id"
    ON __mj."IntegrationObject" ("IntegrationID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integration Objects
-- Item: vwIntegrationObjects
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Objects
-----               SCHEMA:      __mj
-----               BASE TABLE:  IntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrationObjects"
AS
SELECT
    i.*,
    MJIntegration_IntegrationID."Name" AS "Integration"
FROM
    __mj."IntegrationObject" AS i
INNER JOIN
    __mj."Integration" AS MJIntegration_IntegrationID
  ON
    "i"."IntegrationID" = MJIntegration_IntegrationID."ID"
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
    AND tc.relname = 'vwIntegrationObjects'
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
    AND tc.relname = 'vwIntegrationObjects'
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
        AND tc.relname = 'vwIntegrationObjects'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwIntegrationObjects" CASCADE;
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
GRANT SELECT ON __mj."vwIntegrationObjects" TO "cdp_UI";
GRANT SELECT ON __mj."vwIntegrationObjects" TO "cdp_Developer";
GRANT SELECT ON __mj."vwIntegrationObjects" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integration Objects
-- Item: spCreateIntegrationObject
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR IntegrationObject
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateIntegrationObject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationObject"(
    p_id UUID DEFAULT NULL,
    p_integrationid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_apipath varchar(500) DEFAULT NULL,
    p_responsedatakey_clear boolean DEFAULT false,
    p_responsedatakey varchar(255) DEFAULT NULL,
    p_defaultpagesize int DEFAULT NULL,
    p_supportspagination BOOLEAN DEFAULT NULL,
    p_paginationtype varchar(20) DEFAULT NULL,
    p_supportsincrementalsync BOOLEAN DEFAULT NULL,
    p_supportswrite BOOLEAN DEFAULT NULL,
    p_defaultqueryparams_clear boolean DEFAULT false,
    p_defaultqueryparams TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_writeapipath_clear boolean DEFAULT false,
    p_writeapipath varchar(500) DEFAULT NULL,
    p_writemethod_clear boolean DEFAULT false,
    p_writemethod varchar(10) DEFAULT NULL,
    p_deletemethod_clear boolean DEFAULT false,
    p_deletemethod varchar(10) DEFAULT NULL,
    p_iscustom BOOLEAN DEFAULT NULL,
    p_createapipath_clear boolean DEFAULT false,
    p_createapipath TEXT DEFAULT NULL,
    p_createmethod_clear boolean DEFAULT false,
    p_createmethod varchar(20) DEFAULT NULL,
    p_createbodyshape_clear boolean DEFAULT false,
    p_createbodyshape varchar(50) DEFAULT NULL,
    p_createbodykey_clear boolean DEFAULT false,
    p_createbodykey varchar(100) DEFAULT NULL,
    p_createidlocation_clear boolean DEFAULT false,
    p_createidlocation varchar(20) DEFAULT NULL,
    p_updateapipath_clear boolean DEFAULT false,
    p_updateapipath TEXT DEFAULT NULL,
    p_updatemethod_clear boolean DEFAULT false,
    p_updatemethod varchar(20) DEFAULT NULL,
    p_updatebodyshape_clear boolean DEFAULT false,
    p_updatebodyshape varchar(50) DEFAULT NULL,
    p_updatebodykey_clear boolean DEFAULT false,
    p_updatebodykey varchar(100) DEFAULT NULL,
    p_updateidlocation_clear boolean DEFAULT false,
    p_updateidlocation varchar(20) DEFAULT NULL,
    p_deleteapipath_clear boolean DEFAULT false,
    p_deleteapipath TEXT DEFAULT NULL,
    p_deleteidlocation_clear boolean DEFAULT false,
    p_deleteidlocation varchar(20) DEFAULT NULL,
    p_incrementalwatermarkfield_clear boolean DEFAULT false,
    p_incrementalwatermarkfield varchar(255) DEFAULT NULL,
    p_metadatasource varchar(20) DEFAULT NULL,
    p_supportscreate BOOLEAN DEFAULT NULL,
    p_supportsupdate BOOLEAN DEFAULT NULL,
    p_supportsdelete BOOLEAN DEFAULT NULL,
    p_syncstrategy_clear boolean DEFAULT false,
    p_syncstrategy varchar(50) DEFAULT NULL,
    p_contenthashapplicable BOOLEAN DEFAULT NULL,
    p_stableorderingkey_clear boolean DEFAULT false,
    p_stableorderingkey varchar(255) DEFAULT NULL
) RETURNS SETOF __mj."vwIntegrationObjects" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."IntegrationObject"
        (
            "ID",
            "IntegrationID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "APIPath",
                "ResponseDataKey",
                "DefaultPageSize",
                "SupportsPagination",
                "PaginationType",
                "SupportsIncrementalSync",
                "SupportsWrite",
                "DefaultQueryParams",
                "Configuration",
                "Sequence",
                "Status",
                "WriteAPIPath",
                "WriteMethod",
                "DeleteMethod",
                "IsCustom",
                "CreateAPIPath",
                "CreateMethod",
                "CreateBodyShape",
                "CreateBodyKey",
                "CreateIDLocation",
                "UpdateAPIPath",
                "UpdateMethod",
                "UpdateBodyShape",
                "UpdateBodyKey",
                "UpdateIDLocation",
                "DeleteAPIPath",
                "DeleteIDLocation",
                "IncrementalWatermarkField",
                "MetadataSource",
                "SupportsCreate",
                "SupportsUpdate",
                "SupportsDelete",
                "SyncStrategy",
                "ContentHashApplicable",
                "StableOrderingKey"
        )
    VALUES
        (
            v_new_id,
            p_integrationid,
                p_name,
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                p_apipath,
                CASE WHEN p_responsedatakey_clear = true THEN NULL ELSE COALESCE(p_responsedatakey, NULL) END,
                COALESCE(p_defaultpagesize, 100),
                COALESCE(p_supportspagination, TRUE),
                COALESCE(p_paginationtype, 'PageNumber'),
                COALESCE(p_supportsincrementalsync, FALSE),
                COALESCE(p_supportswrite, FALSE),
                CASE WHEN p_defaultqueryparams_clear = true THEN NULL ELSE COALESCE(p_defaultqueryparams, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                COALESCE(p_sequence, 0),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_writeapipath_clear = true THEN NULL ELSE COALESCE(p_writeapipath, NULL) END,
                CASE WHEN p_writemethod_clear = true THEN NULL ELSE COALESCE(p_writemethod, 'POST') END,
                CASE WHEN p_deletemethod_clear = true THEN NULL ELSE COALESCE(p_deletemethod, 'DELETE') END,
                COALESCE(p_iscustom, FALSE),
                CASE WHEN p_createapipath_clear = true THEN NULL ELSE COALESCE(p_createapipath, NULL) END,
                CASE WHEN p_createmethod_clear = true THEN NULL ELSE COALESCE(p_createmethod, NULL) END,
                CASE WHEN p_createbodyshape_clear = true THEN NULL ELSE COALESCE(p_createbodyshape, NULL) END,
                CASE WHEN p_createbodykey_clear = true THEN NULL ELSE COALESCE(p_createbodykey, NULL) END,
                CASE WHEN p_createidlocation_clear = true THEN NULL ELSE COALESCE(p_createidlocation, NULL) END,
                CASE WHEN p_updateapipath_clear = true THEN NULL ELSE COALESCE(p_updateapipath, NULL) END,
                CASE WHEN p_updatemethod_clear = true THEN NULL ELSE COALESCE(p_updatemethod, NULL) END,
                CASE WHEN p_updatebodyshape_clear = true THEN NULL ELSE COALESCE(p_updatebodyshape, NULL) END,
                CASE WHEN p_updatebodykey_clear = true THEN NULL ELSE COALESCE(p_updatebodykey, NULL) END,
                CASE WHEN p_updateidlocation_clear = true THEN NULL ELSE COALESCE(p_updateidlocation, NULL) END,
                CASE WHEN p_deleteapipath_clear = true THEN NULL ELSE COALESCE(p_deleteapipath, NULL) END,
                CASE WHEN p_deleteidlocation_clear = true THEN NULL ELSE COALESCE(p_deleteidlocation, NULL) END,
                CASE WHEN p_incrementalwatermarkfield_clear = true THEN NULL ELSE COALESCE(p_incrementalwatermarkfield, NULL) END,
                COALESCE(p_metadatasource, 'Declared'),
                COALESCE(p_supportscreate, FALSE),
                COALESCE(p_supportsupdate, FALSE),
                COALESCE(p_supportsdelete, FALSE),
                CASE WHEN p_syncstrategy_clear = true THEN NULL ELSE COALESCE(p_syncstrategy, NULL) END,
                COALESCE(p_contenthashapplicable, TRUE),
                CASE WHEN p_stableorderingkey_clear = true THEN NULL ELSE COALESCE(p_stableorderingkey, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwIntegrationObjects"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObject" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integration Objects
-- Item: spUpdateIntegrationObject
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR IntegrationObject
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateIntegrationObject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationObject"(
    p_id UUID,
    p_integrationid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(100) DEFAULT NULL,
    p_apipath varchar(500) DEFAULT NULL,
    p_responsedatakey_clear boolean DEFAULT false,
    p_responsedatakey varchar(255) DEFAULT NULL,
    p_defaultpagesize int DEFAULT NULL,
    p_supportspagination BOOLEAN DEFAULT NULL,
    p_paginationtype varchar(20) DEFAULT NULL,
    p_supportsincrementalsync BOOLEAN DEFAULT NULL,
    p_supportswrite BOOLEAN DEFAULT NULL,
    p_defaultqueryparams_clear boolean DEFAULT false,
    p_defaultqueryparams TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_writeapipath_clear boolean DEFAULT false,
    p_writeapipath varchar(500) DEFAULT NULL,
    p_writemethod_clear boolean DEFAULT false,
    p_writemethod varchar(10) DEFAULT NULL,
    p_deletemethod_clear boolean DEFAULT false,
    p_deletemethod varchar(10) DEFAULT NULL,
    p_iscustom BOOLEAN DEFAULT NULL,
    p_createapipath_clear boolean DEFAULT false,
    p_createapipath TEXT DEFAULT NULL,
    p_createmethod_clear boolean DEFAULT false,
    p_createmethod varchar(20) DEFAULT NULL,
    p_createbodyshape_clear boolean DEFAULT false,
    p_createbodyshape varchar(50) DEFAULT NULL,
    p_createbodykey_clear boolean DEFAULT false,
    p_createbodykey varchar(100) DEFAULT NULL,
    p_createidlocation_clear boolean DEFAULT false,
    p_createidlocation varchar(20) DEFAULT NULL,
    p_updateapipath_clear boolean DEFAULT false,
    p_updateapipath TEXT DEFAULT NULL,
    p_updatemethod_clear boolean DEFAULT false,
    p_updatemethod varchar(20) DEFAULT NULL,
    p_updatebodyshape_clear boolean DEFAULT false,
    p_updatebodyshape varchar(50) DEFAULT NULL,
    p_updatebodykey_clear boolean DEFAULT false,
    p_updatebodykey varchar(100) DEFAULT NULL,
    p_updateidlocation_clear boolean DEFAULT false,
    p_updateidlocation varchar(20) DEFAULT NULL,
    p_deleteapipath_clear boolean DEFAULT false,
    p_deleteapipath TEXT DEFAULT NULL,
    p_deleteidlocation_clear boolean DEFAULT false,
    p_deleteidlocation varchar(20) DEFAULT NULL,
    p_incrementalwatermarkfield_clear boolean DEFAULT false,
    p_incrementalwatermarkfield varchar(255) DEFAULT NULL,
    p_metadatasource varchar(20) DEFAULT NULL,
    p_supportscreate BOOLEAN DEFAULT NULL,
    p_supportsupdate BOOLEAN DEFAULT NULL,
    p_supportsdelete BOOLEAN DEFAULT NULL,
    p_syncstrategy_clear boolean DEFAULT false,
    p_syncstrategy varchar(50) DEFAULT NULL,
    p_contenthashapplicable BOOLEAN DEFAULT NULL,
    p_stableorderingkey_clear boolean DEFAULT false,
    p_stableorderingkey varchar(255) DEFAULT NULL
) RETURNS SETOF __mj."vwIntegrationObjects" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."IntegrationObject"
    SET
        "IntegrationID" = COALESCE(p_integrationid, "IntegrationID"),
        "Name" = COALESCE(p_name, "Name"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "APIPath" = COALESCE(p_apipath, "APIPath"),
        "ResponseDataKey" = CASE WHEN p_responsedatakey_clear = true THEN NULL ELSE COALESCE(p_responsedatakey, "ResponseDataKey") END,
        "DefaultPageSize" = COALESCE(p_defaultpagesize, "DefaultPageSize"),
        "SupportsPagination" = COALESCE(p_supportspagination, "SupportsPagination"),
        "PaginationType" = COALESCE(p_paginationtype, "PaginationType"),
        "SupportsIncrementalSync" = COALESCE(p_supportsincrementalsync, "SupportsIncrementalSync"),
        "SupportsWrite" = COALESCE(p_supportswrite, "SupportsWrite"),
        "DefaultQueryParams" = CASE WHEN p_defaultqueryparams_clear = true THEN NULL ELSE COALESCE(p_defaultqueryparams, "DefaultQueryParams") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Status" = COALESCE(p_status, "Status"),
        "WriteAPIPath" = CASE WHEN p_writeapipath_clear = true THEN NULL ELSE COALESCE(p_writeapipath, "WriteAPIPath") END,
        "WriteMethod" = CASE WHEN p_writemethod_clear = true THEN NULL ELSE COALESCE(p_writemethod, "WriteMethod") END,
        "DeleteMethod" = CASE WHEN p_deletemethod_clear = true THEN NULL ELSE COALESCE(p_deletemethod, "DeleteMethod") END,
        "IsCustom" = COALESCE(p_iscustom, "IsCustom"),
        "CreateAPIPath" = CASE WHEN p_createapipath_clear = true THEN NULL ELSE COALESCE(p_createapipath, "CreateAPIPath") END,
        "CreateMethod" = CASE WHEN p_createmethod_clear = true THEN NULL ELSE COALESCE(p_createmethod, "CreateMethod") END,
        "CreateBodyShape" = CASE WHEN p_createbodyshape_clear = true THEN NULL ELSE COALESCE(p_createbodyshape, "CreateBodyShape") END,
        "CreateBodyKey" = CASE WHEN p_createbodykey_clear = true THEN NULL ELSE COALESCE(p_createbodykey, "CreateBodyKey") END,
        "CreateIDLocation" = CASE WHEN p_createidlocation_clear = true THEN NULL ELSE COALESCE(p_createidlocation, "CreateIDLocation") END,
        "UpdateAPIPath" = CASE WHEN p_updateapipath_clear = true THEN NULL ELSE COALESCE(p_updateapipath, "UpdateAPIPath") END,
        "UpdateMethod" = CASE WHEN p_updatemethod_clear = true THEN NULL ELSE COALESCE(p_updatemethod, "UpdateMethod") END,
        "UpdateBodyShape" = CASE WHEN p_updatebodyshape_clear = true THEN NULL ELSE COALESCE(p_updatebodyshape, "UpdateBodyShape") END,
        "UpdateBodyKey" = CASE WHEN p_updatebodykey_clear = true THEN NULL ELSE COALESCE(p_updatebodykey, "UpdateBodyKey") END,
        "UpdateIDLocation" = CASE WHEN p_updateidlocation_clear = true THEN NULL ELSE COALESCE(p_updateidlocation, "UpdateIDLocation") END,
        "DeleteAPIPath" = CASE WHEN p_deleteapipath_clear = true THEN NULL ELSE COALESCE(p_deleteapipath, "DeleteAPIPath") END,
        "DeleteIDLocation" = CASE WHEN p_deleteidlocation_clear = true THEN NULL ELSE COALESCE(p_deleteidlocation, "DeleteIDLocation") END,
        "IncrementalWatermarkField" = CASE WHEN p_incrementalwatermarkfield_clear = true THEN NULL ELSE COALESCE(p_incrementalwatermarkfield, "IncrementalWatermarkField") END,
        "MetadataSource" = COALESCE(p_metadatasource, "MetadataSource"),
        "SupportsCreate" = COALESCE(p_supportscreate, "SupportsCreate"),
        "SupportsUpdate" = COALESCE(p_supportsupdate, "SupportsUpdate"),
        "SupportsDelete" = COALESCE(p_supportsdelete, "SupportsDelete"),
        "SyncStrategy" = CASE WHEN p_syncstrategy_clear = true THEN NULL ELSE COALESCE(p_syncstrategy, "SyncStrategy") END,
        "ContentHashApplicable" = COALESCE(p_contenthashapplicable, "ContentHashApplicable"),
        "StableOrderingKey" = CASE WHEN p_stableorderingkey_clear = true THEN NULL ELSE COALESCE(p_stableorderingkey, "StableOrderingKey") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwIntegrationObjects"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObject" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationObject table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_integration_object"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_integration_object" ON __mj."IntegrationObject";

CREATE TRIGGER "trg_update_integration_object"
BEFORE UPDATE ON __mj."IntegrationObject"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_integration_object"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integration Objects
-- Item: spDeleteIntegrationObject
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR IntegrationObject
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteIntegrationObject'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationObject"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."IntegrationObject"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObject" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObject" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integrations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_integration_credential_type_id"
    ON __mj."Integration" ("CredentialTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integrations
-- Item: vwIntegrations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integrations
-----               SCHEMA:      __mj
-----               BASE TABLE:  Integration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrations"
AS
SELECT
    i.*,
    MJCredentialType_CredentialTypeID."Name" AS "CredentialType"
FROM
    __mj."Integration" AS i
LEFT OUTER JOIN
    __mj."CredentialType" AS MJCredentialType_CredentialTypeID
  ON
    "i"."CredentialTypeID" = MJCredentialType_CredentialTypeID."ID"
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
    AND tc.relname = 'vwIntegrations'
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
    AND tc.relname = 'vwIntegrations'
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
        AND tc.relname = 'vwIntegrations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwIntegrations" CASCADE;
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
GRANT SELECT ON __mj."vwIntegrations" TO "cdp_UI";
GRANT SELECT ON __mj."vwIntegrations" TO "cdp_Developer";
GRANT SELECT ON __mj."vwIntegrations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integrations
-- Item: spCreateIntegration
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Integration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateIntegration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegration"(
    p_name varchar(100),
    p_description_clear boolean DEFAULT false,
    p_description varchar(255) DEFAULT NULL,
    p_navigationbaseurl_clear boolean DEFAULT false,
    p_navigationbaseurl varchar(500) DEFAULT NULL,
    p_classname_clear boolean DEFAULT false,
    p_classname varchar(100) DEFAULT NULL,
    p_importpath_clear boolean DEFAULT false,
    p_importpath varchar(100) DEFAULT NULL,
    p_batchmaxrequestcount int DEFAULT NULL,
    p_batchrequestwaittime int DEFAULT NULL,
    p_id UUID DEFAULT NULL,
    p_credentialtypeid_clear boolean DEFAULT false,
    p_credentialtypeid UUID DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwIntegrations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Integration"
        (
            "ID",
            "Name",
                "Description",
                "NavigationBaseURL",
                "ClassName",
                "ImportPath",
                "BatchMaxRequestCount",
                "BatchRequestWaitTime",
                "CredentialTypeID",
                "Icon",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_navigationbaseurl_clear = true THEN NULL ELSE COALESCE(p_navigationbaseurl, NULL) END,
                CASE WHEN p_classname_clear = true THEN NULL ELSE COALESCE(p_classname, NULL) END,
                CASE WHEN p_importpath_clear = true THEN NULL ELSE COALESCE(p_importpath, NULL) END,
                COALESCE(p_batchmaxrequestcount, -1),
                COALESCE(p_batchrequestwaittime, -1),
                CASE WHEN p_credentialtypeid_clear = true THEN NULL ELSE COALESCE(p_credentialtypeid, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwIntegrations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateIntegration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateIntegration" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integrations
-- Item: spUpdateIntegration
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Integration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateIntegration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegration"(
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description varchar(255) DEFAULT NULL,
    p_navigationbaseurl_clear boolean DEFAULT false,
    p_navigationbaseurl varchar(500) DEFAULT NULL,
    p_classname_clear boolean DEFAULT false,
    p_classname varchar(100) DEFAULT NULL,
    p_importpath_clear boolean DEFAULT false,
    p_importpath varchar(100) DEFAULT NULL,
    p_batchmaxrequestcount int DEFAULT NULL,
    p_batchrequestwaittime int DEFAULT NULL,
    p_id UUID DEFAULT NULL,
    p_credentialtypeid_clear boolean DEFAULT false,
    p_credentialtypeid UUID DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon TEXT DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwIntegrations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Integration"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "NavigationBaseURL" = CASE WHEN p_navigationbaseurl_clear = true THEN NULL ELSE COALESCE(p_navigationbaseurl, "NavigationBaseURL") END,
        "ClassName" = CASE WHEN p_classname_clear = true THEN NULL ELSE COALESCE(p_classname, "ClassName") END,
        "ImportPath" = CASE WHEN p_importpath_clear = true THEN NULL ELSE COALESCE(p_importpath, "ImportPath") END,
        "BatchMaxRequestCount" = COALESCE(p_batchmaxrequestcount, "BatchMaxRequestCount"),
        "BatchRequestWaitTime" = COALESCE(p_batchrequestwaittime, "BatchRequestWaitTime"),
        "CredentialTypeID" = CASE WHEN p_credentialtypeid_clear = true THEN NULL ELSE COALESCE(p_credentialtypeid, "CredentialTypeID") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwIntegrations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegration" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Integration table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_integration"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_integration" ON __mj."Integration";

CREATE TRIGGER "trg_update_integration"
BEFORE UPDATE ON __mj."Integration"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_integration"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Integrations
-- Item: spDeleteIntegration
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Integration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteIntegration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegration"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."Integration"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegration" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_process_run_id"
    ON __mj."ProcessRunDetail" ("ProcessRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_entity_id"
    ON __mj."ProcessRunDetail" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_action_execution_log_id"
    ON __mj."ProcessRunDetail" ("ActionExecutionLogID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_ai_agent_run_id"
    ON __mj."ProcessRunDetail" ("AIAgentRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: vwProcessRunDetails
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Run Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ProcessRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwProcessRunDetails"
AS
SELECT
    p.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJActionExecutionLog_ActionExecutionLogID."Action" AS "ActionExecutionLog",
    MJAIAgentRun_AIAgentRunID."RunName" AS "AIAgentRun"
FROM
    __mj."ProcessRunDetail" AS p
INNER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "p"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    __mj."vwActionExecutionLogs" AS MJActionExecutionLog_ActionExecutionLogID
  ON
    "p"."ActionExecutionLogID" = MJActionExecutionLog_ActionExecutionLogID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_AIAgentRunID
  ON
    "p"."AIAgentRunID" = MJAIAgentRun_AIAgentRunID."ID"
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
    AND tc.relname = 'vwProcessRunDetails'
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
    AND tc.relname = 'vwProcessRunDetails'
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
        AND tc.relname = 'vwProcessRunDetails'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwProcessRunDetails" CASCADE;
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
GRANT SELECT ON __mj."vwProcessRunDetails" TO "cdp_UI";
GRANT SELECT ON __mj."vwProcessRunDetails" TO "cdp_Developer";
GRANT SELECT ON __mj."vwProcessRunDetails" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spCreateProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateProcessRunDetail"(
    p_id UUID DEFAULT NULL,
    p_processrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_resultpayload_clear boolean DEFAULT false,
    p_resultpayload TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwProcessRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ProcessRunDetail"
        (
            "ID",
            "ProcessRunID",
                "EntityID",
                "RecordID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "DurationMs",
                "AttemptCount",
                "ResultPayload",
                "ErrorMessage",
                "ActionExecutionLogID",
                "AIAgentRunID"
        )
    VALUES
        (
            v_new_id,
            p_processrunid,
                p_entityid,
                p_recordid,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, NULL) END,
                COALESCE(p_attemptcount, 0),
                CASE WHEN p_resultpayload_clear = true THEN NULL ELSE COALESCE(p_resultpayload, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, NULL) END,
                CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwProcessRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateProcessRunDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spUpdateProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateProcessRunDetail"(
    p_id UUID,
    p_processrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_resultpayload_clear boolean DEFAULT false,
    p_resultpayload TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwProcessRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ProcessRunDetail"
    SET
        "ProcessRunID" = COALESCE(p_processrunid, "ProcessRunID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "DurationMs" = CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, "DurationMs") END,
        "AttemptCount" = COALESCE(p_attemptcount, "AttemptCount"),
        "ResultPayload" = CASE WHEN p_resultpayload_clear = true THEN NULL ELSE COALESCE(p_resultpayload, "ResultPayload") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ActionExecutionLogID" = CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, "ActionExecutionLogID") END,
        "AIAgentRunID" = CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, "AIAgentRunID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwProcessRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateProcessRunDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRunDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_process_run_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_process_run_detail" ON __mj."ProcessRunDetail";

CREATE TRIGGER "trg_update_process_run_detail"
BEFORE UPDATE ON __mj."ProcessRunDetail"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_process_run_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spDeleteProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteProcessRunDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ProcessRunDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteProcessRunDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_record_process_id"
    ON __mj."ProcessRun" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_entity_id"
    ON __mj."ProcessRun" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_scheduled_job_run_id"
    ON __mj."ProcessRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_started_by_user_id"
    ON __mj."ProcessRun" ("StartedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: vwProcessRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwProcessRuns"
AS
SELECT
    p.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_EntityID."Name" AS "Entity",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJUser_StartedByUserID."Name" AS "StartedByUser"
FROM
    __mj."ProcessRun" AS p
LEFT OUTER JOIN
    __mj."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "p"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "p"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "p"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_StartedByUserID
  ON
    "p"."StartedByUserID" = MJUser_StartedByUserID."ID"
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
    AND tc.relname = 'vwProcessRuns'
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
    AND tc.relname = 'vwProcessRuns'
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
        AND tc.relname = 'vwProcessRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwProcessRuns" CASCADE;
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
GRANT SELECT ON __mj."vwProcessRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwProcessRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwProcessRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spCreateProcessRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateProcessRun"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_triggeredby varchar(20) DEFAULT NULL,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceid_clear boolean DEFAULT false,
    p_sourceid UUID DEFAULT NULL,
    p_sourcefilter_clear boolean DEFAULT false,
    p_sourcefilter TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditems int DEFAULT NULL,
    p_successcount int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_lastprocessedkey_clear boolean DEFAULT false,
    p_lastprocessedkey varchar(450) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_startedbyuserid_clear boolean DEFAULT false,
    p_startedbyuserid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwProcessRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ProcessRun"
        (
            "ID",
            "RecordProcessID",
                "EntityID",
                "TriggeredBy",
                "SourceType",
                "SourceID",
                "SourceFilter",
                "ScheduledJobRunID",
                "Status",
                "StartTime",
                "EndTime",
                "TotalItemCount",
                "ProcessedItems",
                "SuccessCount",
                "ErrorCount",
                "SkippedCount",
                "LastProcessedOffset",
                "LastProcessedKey",
                "BatchSize",
                "CancellationRequested",
                "Configuration",
                "ErrorMessage",
                "StartedByUserID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                p_triggeredby,
                p_sourcetype,
                CASE WHEN p_sourceid_clear = true THEN NULL ELSE COALESCE(p_sourceid, NULL) END,
                CASE WHEN p_sourcefilter_clear = true THEN NULL ELSE COALESCE(p_sourcefilter, NULL) END,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, NULL) END,
                CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, NULL) END,
                CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, NULL) END,
                COALESCE(p_processeditems, 0),
                COALESCE(p_successcount, 0),
                COALESCE(p_errorcount, 0),
                COALESCE(p_skippedcount, 0),
                CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, NULL) END,
                CASE WHEN p_lastprocessedkey_clear = true THEN NULL ELSE COALESCE(p_lastprocessedkey, NULL) END,
                CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, NULL) END,
                COALESCE(p_cancellationrequested, FALSE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_startedbyuserid_clear = true THEN NULL ELSE COALESCE(p_startedbyuserid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwProcessRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateProcessRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spUpdateProcessRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateProcessRun"(
    p_id UUID,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_triggeredby varchar(20) DEFAULT NULL,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceid_clear boolean DEFAULT false,
    p_sourceid UUID DEFAULT NULL,
    p_sourcefilter_clear boolean DEFAULT false,
    p_sourcefilter TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditems int DEFAULT NULL,
    p_successcount int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_lastprocessedkey_clear boolean DEFAULT false,
    p_lastprocessedkey varchar(450) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_startedbyuserid_clear boolean DEFAULT false,
    p_startedbyuserid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwProcessRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ProcessRun"
    SET
        "RecordProcessID" = CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, "RecordProcessID") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "TriggeredBy" = COALESCE(p_triggeredby, "TriggeredBy"),
        "SourceType" = COALESCE(p_sourcetype, "SourceType"),
        "SourceID" = CASE WHEN p_sourceid_clear = true THEN NULL ELSE COALESCE(p_sourceid, "SourceID") END,
        "SourceFilter" = CASE WHEN p_sourcefilter_clear = true THEN NULL ELSE COALESCE(p_sourcefilter, "SourceFilter") END,
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartTime" = CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, "StartTime") END,
        "EndTime" = CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, "EndTime") END,
        "TotalItemCount" = CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, "TotalItemCount") END,
        "ProcessedItems" = COALESCE(p_processeditems, "ProcessedItems"),
        "SuccessCount" = COALESCE(p_successcount, "SuccessCount"),
        "ErrorCount" = COALESCE(p_errorcount, "ErrorCount"),
        "SkippedCount" = COALESCE(p_skippedcount, "SkippedCount"),
        "LastProcessedOffset" = CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, "LastProcessedOffset") END,
        "LastProcessedKey" = CASE WHEN p_lastprocessedkey_clear = true THEN NULL ELSE COALESCE(p_lastprocessedkey, "LastProcessedKey") END,
        "BatchSize" = CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, "BatchSize") END,
        "CancellationRequested" = COALESCE(p_cancellationrequested, "CancellationRequested"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "StartedByUserID" = CASE WHEN p_startedbyuserid_clear = true THEN NULL ELSE COALESCE(p_startedbyuserid, "StartedByUserID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwProcessRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateProcessRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_process_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_process_run" ON __mj."ProcessRun";

CREATE TRIGGER "trg_update_process_run"
BEFORE UPDATE ON __mj."ProcessRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_process_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spDeleteProcessRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteProcessRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ProcessRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteProcessRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Categories
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_category_parent_id"
    ON __mj."RecordProcessCategory" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Categories
-- Item: fnRecordProcessCategoryParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: RecordProcessCategory.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_record_process_category_parent_id_get_root_id"(
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
            __mj."RecordProcessCategory"
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
            __mj."RecordProcessCategory" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Categories
-- Item: vwRecordProcessCategories
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Process Categories
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordProcessCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRecordProcessCategories"
AS
SELECT
    r.*,
    MJRecordProcessCategory_ParentID."Name" AS "Parent",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."RecordProcessCategory" AS r
LEFT OUTER JOIN
    __mj."RecordProcessCategory" AS MJRecordProcessCategory_ParentID
  ON
    "r"."ParentID" = MJRecordProcessCategory_ParentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_record_process_category_parent_id_get_root_id"(r."ID", r."ParentID") AS root_id
) AS root_ParentID ON true
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
    AND tc.relname = 'vwRecordProcessCategories'
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
    AND tc.relname = 'vwRecordProcessCategories'
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
        AND tc.relname = 'vwRecordProcessCategories'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwRecordProcessCategories" CASCADE;
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
GRANT SELECT ON __mj."vwRecordProcessCategories" TO "cdp_UI";
GRANT SELECT ON __mj."vwRecordProcessCategories" TO "cdp_Developer";
GRANT SELECT ON __mj."vwRecordProcessCategories" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Categories
-- Item: spCreateRecordProcessCategory
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordProcessCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordProcessCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordProcessCategory"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwRecordProcessCategories" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."RecordProcessCategory"
        (
            "ID",
            "Name",
                "Description",
                "ParentID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwRecordProcessCategories"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateRecordProcessCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateRecordProcessCategory" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Categories
-- Item: spUpdateRecordProcessCategory
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordProcessCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordProcessCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordProcessCategory"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwRecordProcessCategories" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."RecordProcessCategory"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwRecordProcessCategories"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordProcessCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordProcessCategory" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordProcessCategory table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_record_process_category"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_record_process_category" ON __mj."RecordProcessCategory";

CREATE TRIGGER "trg_update_record_process_category"
BEFORE UPDATE ON __mj."RecordProcessCategory"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_record_process_category"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Categories
-- Item: spDeleteRecordProcessCategory
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordProcessCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordProcessCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordProcessCategory"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."RecordProcessCategory"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordProcessCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordProcessCategory" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Watermarks
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_watermark_record_process_id"
    ON __mj."RecordProcessWatermark" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_watermark_entity_id"
    ON __mj."RecordProcessWatermark" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Watermarks
-- Item: vwRecordProcessWatermarks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Process Watermarks
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordProcessWatermark
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRecordProcessWatermarks"
AS
SELECT
    r.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_EntityID."Name" AS "Entity"
FROM
    __mj."RecordProcessWatermark" AS r
INNER JOIN
    __mj."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "r"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
INNER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "r"."EntityID" = MJEntity_EntityID."ID"
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
    AND tc.relname = 'vwRecordProcessWatermarks'
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
    AND tc.relname = 'vwRecordProcessWatermarks'
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
        AND tc.relname = 'vwRecordProcessWatermarks'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwRecordProcessWatermarks" CASCADE;
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
GRANT SELECT ON __mj."vwRecordProcessWatermarks" TO "cdp_UI";
GRANT SELECT ON __mj."vwRecordProcessWatermarks" TO "cdp_Developer";
GRANT SELECT ON __mj."vwRecordProcessWatermarks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Watermarks
-- Item: spCreateRecordProcessWatermark
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordProcessWatermark
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordProcessWatermark'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordProcessWatermark"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_hash varchar(128) DEFAULT NULL,
    p_lastprocessedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwRecordProcessWatermarks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."RecordProcessWatermark"
        (
            "ID",
            "RecordProcessID",
                "EntityID",
                "RecordID",
                "Hash",
                "LastProcessedAt"
        )
    VALUES
        (
            v_new_id,
            p_recordprocessid,
                p_entityid,
                p_recordid,
                p_hash,
                p_lastprocessedat
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwRecordProcessWatermarks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateRecordProcessWatermark" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateRecordProcessWatermark" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Watermarks
-- Item: spUpdateRecordProcessWatermark
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordProcessWatermark
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordProcessWatermark'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordProcessWatermark"(
    p_id UUID,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_hash varchar(128) DEFAULT NULL,
    p_lastprocessedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF __mj."vwRecordProcessWatermarks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."RecordProcessWatermark"
    SET
        "RecordProcessID" = COALESCE(p_recordprocessid, "RecordProcessID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Hash" = COALESCE(p_hash, "Hash"),
        "LastProcessedAt" = COALESCE(p_lastprocessedat, "LastProcessedAt")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwRecordProcessWatermarks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordProcessWatermark" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordProcessWatermark" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordProcessWatermark table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_record_process_watermark"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_record_process_watermark" ON __mj."RecordProcessWatermark";

CREATE TRIGGER "trg_update_record_process_watermark"
BEFORE UPDATE ON __mj."RecordProcessWatermark"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_record_process_watermark"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Process Watermarks
-- Item: spDeleteRecordProcessWatermark
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordProcessWatermark
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordProcessWatermark'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordProcessWatermark"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."RecordProcessWatermark"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordProcessWatermark" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordProcessWatermark" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Processes
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_category_id"
    ON __mj."RecordProcess" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_entity_id"
    ON __mj."RecordProcess" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_action_id"
    ON __mj."RecordProcess" ("ActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_agent_id"
    ON __mj."RecordProcess" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_prompt_id"
    ON __mj."RecordProcess" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_scope_view_id"
    ON __mj."RecordProcess" ("ScopeViewID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_process_scope_list_id"
    ON __mj."RecordProcess" ("ScopeListID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Processes
-- Item: vwRecordProcesses
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Processes
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordProcess
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRecordProcesses"
AS
SELECT
    r.*,
    MJRecordProcessCategory_CategoryID."Name" AS "Category",
    MJEntity_EntityID."Name" AS "Entity",
    MJAction_ActionID."Name" AS "Action",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJUserView_ScopeViewID."Name" AS "ScopeView",
    MJList_ScopeListID."Name" AS "ScopeList"
FROM
    __mj."RecordProcess" AS r
LEFT OUTER JOIN
    __mj."RecordProcessCategory" AS MJRecordProcessCategory_CategoryID
  ON
    "r"."CategoryID" = MJRecordProcessCategory_CategoryID."ID"
INNER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "r"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    __mj."Action" AS MJAction_ActionID
  ON
    "r"."ActionID" = MJAction_ActionID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "r"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "r"."PromptID" = MJAIPrompt_PromptID."ID"
LEFT OUTER JOIN
    __mj."UserView" AS MJUserView_ScopeViewID
  ON
    "r"."ScopeViewID" = MJUserView_ScopeViewID."ID"
LEFT OUTER JOIN
    __mj."List" AS MJList_ScopeListID
  ON
    "r"."ScopeListID" = MJList_ScopeListID."ID"
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
    AND tc.relname = 'vwRecordProcesses'
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
    AND tc.relname = 'vwRecordProcesses'
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
        AND tc.relname = 'vwRecordProcesses'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwRecordProcesses" CASCADE;
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
GRANT SELECT ON __mj."vwRecordProcesses" TO "cdp_UI";
GRANT SELECT ON __mj."vwRecordProcesses" TO "cdp_Developer";
GRANT SELECT ON __mj."vwRecordProcesses" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Processes
-- Item: spCreateRecordProcess
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordProcess
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordProcess'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateRecordProcess"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_worktype varchar(20) DEFAULT NULL,
    p_actionid_clear boolean DEFAULT false,
    p_actionid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_scopetype varchar(20) DEFAULT NULL,
    p_scopeviewid_clear boolean DEFAULT false,
    p_scopeviewid UUID DEFAULT NULL,
    p_scopelistid_clear boolean DEFAULT false,
    p_scopelistid UUID DEFAULT NULL,
    p_scopefilter_clear boolean DEFAULT false,
    p_scopefilter TEXT DEFAULT NULL,
    p_onchangeenabled BOOLEAN DEFAULT NULL,
    p_onchangeinvocationtype_clear boolean DEFAULT false,
    p_onchangeinvocationtype varchar(30) DEFAULT NULL,
    p_onchangefilter_clear boolean DEFAULT false,
    p_onchangefilter TEXT DEFAULT NULL,
    p_scheduleenabled BOOLEAN DEFAULT NULL,
    p_cronexpression_clear boolean DEFAULT false,
    p_cronexpression varchar(120) DEFAULT NULL,
    p_timezone_clear boolean DEFAULT false,
    p_timezone varchar(100) DEFAULT NULL,
    p_ondemandenabled BOOLEAN DEFAULT NULL,
    p_inputmapping_clear boolean DEFAULT false,
    p_inputmapping TEXT DEFAULT NULL,
    p_outputmapping_clear boolean DEFAULT false,
    p_outputmapping TEXT DEFAULT NULL,
    p_skipunchanged BOOLEAN DEFAULT NULL,
    p_watermarkstrategy_clear boolean DEFAULT false,
    p_watermarkstrategy varchar(20) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_maxconcurrency_clear boolean DEFAULT false,
    p_maxconcurrency int DEFAULT NULL
) RETURNS SETOF __mj."vwRecordProcesses" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."RecordProcess"
        (
            "ID",
            "Name",
                "Description",
                "CategoryID",
                "EntityID",
                "Status",
                "WorkType",
                "ActionID",
                "AgentID",
                "PromptID",
                "ScopeType",
                "ScopeViewID",
                "ScopeListID",
                "ScopeFilter",
                "OnChangeEnabled",
                "OnChangeInvocationType",
                "OnChangeFilter",
                "ScheduleEnabled",
                "CronExpression",
                "Timezone",
                "OnDemandEnabled",
                "InputMapping",
                "OutputMapping",
                "SkipUnchanged",
                "WatermarkStrategy",
                "BatchSize",
                "MaxConcurrency"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_entityid,
                COALESCE(p_status, 'Draft'),
                p_worktype,
                CASE WHEN p_actionid_clear = true THEN NULL ELSE COALESCE(p_actionid, NULL) END,
                CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, NULL) END,
                p_scopetype,
                CASE WHEN p_scopeviewid_clear = true THEN NULL ELSE COALESCE(p_scopeviewid, NULL) END,
                CASE WHEN p_scopelistid_clear = true THEN NULL ELSE COALESCE(p_scopelistid, NULL) END,
                CASE WHEN p_scopefilter_clear = true THEN NULL ELSE COALESCE(p_scopefilter, NULL) END,
                COALESCE(p_onchangeenabled, FALSE),
                CASE WHEN p_onchangeinvocationtype_clear = true THEN NULL ELSE COALESCE(p_onchangeinvocationtype, NULL) END,
                CASE WHEN p_onchangefilter_clear = true THEN NULL ELSE COALESCE(p_onchangefilter, NULL) END,
                COALESCE(p_scheduleenabled, FALSE),
                CASE WHEN p_cronexpression_clear = true THEN NULL ELSE COALESCE(p_cronexpression, NULL) END,
                CASE WHEN p_timezone_clear = true THEN NULL ELSE COALESCE(p_timezone, 'UTC') END,
                COALESCE(p_ondemandenabled, TRUE),
                CASE WHEN p_inputmapping_clear = true THEN NULL ELSE COALESCE(p_inputmapping, NULL) END,
                CASE WHEN p_outputmapping_clear = true THEN NULL ELSE COALESCE(p_outputmapping, NULL) END,
                COALESCE(p_skipunchanged, TRUE),
                CASE WHEN p_watermarkstrategy_clear = true THEN NULL ELSE COALESCE(p_watermarkstrategy, NULL) END,
                CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, 100) END,
                CASE WHEN p_maxconcurrency_clear = true THEN NULL ELSE COALESCE(p_maxconcurrency, 1) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwRecordProcesses"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateRecordProcess" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateRecordProcess" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Processes
-- Item: spUpdateRecordProcess
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordProcess
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordProcess'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateRecordProcess"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_worktype varchar(20) DEFAULT NULL,
    p_actionid_clear boolean DEFAULT false,
    p_actionid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_scopetype varchar(20) DEFAULT NULL,
    p_scopeviewid_clear boolean DEFAULT false,
    p_scopeviewid UUID DEFAULT NULL,
    p_scopelistid_clear boolean DEFAULT false,
    p_scopelistid UUID DEFAULT NULL,
    p_scopefilter_clear boolean DEFAULT false,
    p_scopefilter TEXT DEFAULT NULL,
    p_onchangeenabled BOOLEAN DEFAULT NULL,
    p_onchangeinvocationtype_clear boolean DEFAULT false,
    p_onchangeinvocationtype varchar(30) DEFAULT NULL,
    p_onchangefilter_clear boolean DEFAULT false,
    p_onchangefilter TEXT DEFAULT NULL,
    p_scheduleenabled BOOLEAN DEFAULT NULL,
    p_cronexpression_clear boolean DEFAULT false,
    p_cronexpression varchar(120) DEFAULT NULL,
    p_timezone_clear boolean DEFAULT false,
    p_timezone varchar(100) DEFAULT NULL,
    p_ondemandenabled BOOLEAN DEFAULT NULL,
    p_inputmapping_clear boolean DEFAULT false,
    p_inputmapping TEXT DEFAULT NULL,
    p_outputmapping_clear boolean DEFAULT false,
    p_outputmapping TEXT DEFAULT NULL,
    p_skipunchanged BOOLEAN DEFAULT NULL,
    p_watermarkstrategy_clear boolean DEFAULT false,
    p_watermarkstrategy varchar(20) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_maxconcurrency_clear boolean DEFAULT false,
    p_maxconcurrency int DEFAULT NULL
) RETURNS SETOF __mj."vwRecordProcesses" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."RecordProcess"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "Status" = COALESCE(p_status, "Status"),
        "WorkType" = COALESCE(p_worktype, "WorkType"),
        "ActionID" = CASE WHEN p_actionid_clear = true THEN NULL ELSE COALESCE(p_actionid, "ActionID") END,
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "PromptID" = CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, "PromptID") END,
        "ScopeType" = COALESCE(p_scopetype, "ScopeType"),
        "ScopeViewID" = CASE WHEN p_scopeviewid_clear = true THEN NULL ELSE COALESCE(p_scopeviewid, "ScopeViewID") END,
        "ScopeListID" = CASE WHEN p_scopelistid_clear = true THEN NULL ELSE COALESCE(p_scopelistid, "ScopeListID") END,
        "ScopeFilter" = CASE WHEN p_scopefilter_clear = true THEN NULL ELSE COALESCE(p_scopefilter, "ScopeFilter") END,
        "OnChangeEnabled" = COALESCE(p_onchangeenabled, "OnChangeEnabled"),
        "OnChangeInvocationType" = CASE WHEN p_onchangeinvocationtype_clear = true THEN NULL ELSE COALESCE(p_onchangeinvocationtype, "OnChangeInvocationType") END,
        "OnChangeFilter" = CASE WHEN p_onchangefilter_clear = true THEN NULL ELSE COALESCE(p_onchangefilter, "OnChangeFilter") END,
        "ScheduleEnabled" = COALESCE(p_scheduleenabled, "ScheduleEnabled"),
        "CronExpression" = CASE WHEN p_cronexpression_clear = true THEN NULL ELSE COALESCE(p_cronexpression, "CronExpression") END,
        "Timezone" = CASE WHEN p_timezone_clear = true THEN NULL ELSE COALESCE(p_timezone, "Timezone") END,
        "OnDemandEnabled" = COALESCE(p_ondemandenabled, "OnDemandEnabled"),
        "InputMapping" = CASE WHEN p_inputmapping_clear = true THEN NULL ELSE COALESCE(p_inputmapping, "InputMapping") END,
        "OutputMapping" = CASE WHEN p_outputmapping_clear = true THEN NULL ELSE COALESCE(p_outputmapping, "OutputMapping") END,
        "SkipUnchanged" = COALESCE(p_skipunchanged, "SkipUnchanged"),
        "WatermarkStrategy" = CASE WHEN p_watermarkstrategy_clear = true THEN NULL ELSE COALESCE(p_watermarkstrategy, "WatermarkStrategy") END,
        "BatchSize" = CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, "BatchSize") END,
        "MaxConcurrency" = CASE WHEN p_maxconcurrency_clear = true THEN NULL ELSE COALESCE(p_maxconcurrency, "MaxConcurrency") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwRecordProcesses"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordProcess" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateRecordProcess" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordProcess table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_record_process"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_record_process" ON __mj."RecordProcess";

CREATE TRIGGER "trg_update_record_process"
BEFORE UPDATE ON __mj."RecordProcess"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_record_process"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Processes
-- Item: spDeleteRecordProcess
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordProcess
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordProcess'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteRecordProcess"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."RecordProcess"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordProcess" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteRecordProcess" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operation Categories
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_remote_operation_category_parent_id"
    ON __mj."RemoteOperationCategory" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operation Categories
-- Item: fnRemoteOperationCategoryParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: RemoteOperationCategory.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_remote_operation_category_parent_id_get_root_id"(
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
            __mj."RemoteOperationCategory"
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
            __mj."RemoteOperationCategory" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operation Categories
-- Item: vwRemoteOperationCategories
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Remote Operation Categories
-----               SCHEMA:      __mj
-----               BASE TABLE:  RemoteOperationCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRemoteOperationCategories"
AS
SELECT
    r.*,
    MJRemoteOperationCategory_ParentID."Name" AS "Parent",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."RemoteOperationCategory" AS r
LEFT OUTER JOIN
    __mj."RemoteOperationCategory" AS MJRemoteOperationCategory_ParentID
  ON
    "r"."ParentID" = MJRemoteOperationCategory_ParentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_remote_operation_category_parent_id_get_root_id"(r."ID", r."ParentID") AS root_id
) AS root_ParentID ON true
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
    AND tc.relname = 'vwRemoteOperationCategories'
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
    AND tc.relname = 'vwRemoteOperationCategories'
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
        AND tc.relname = 'vwRemoteOperationCategories'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwRemoteOperationCategories" CASCADE;
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
GRANT SELECT ON __mj."vwRemoteOperationCategories" TO "cdp_UI";
GRANT SELECT ON __mj."vwRemoteOperationCategories" TO "cdp_Developer";
GRANT SELECT ON __mj."vwRemoteOperationCategories" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operation Categories
-- Item: spCreateRemoteOperationCategory
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RemoteOperationCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRemoteOperationCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateRemoteOperationCategory"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwRemoteOperationCategories" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."RemoteOperationCategory"
        (
            "ID",
            "Name",
                "Description",
                "ParentID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwRemoteOperationCategories"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateRemoteOperationCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateRemoteOperationCategory" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operation Categories
-- Item: spUpdateRemoteOperationCategory
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RemoteOperationCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRemoteOperationCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateRemoteOperationCategory"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwRemoteOperationCategories" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."RemoteOperationCategory"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwRemoteOperationCategories"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateRemoteOperationCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateRemoteOperationCategory" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RemoteOperationCategory table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_remote_operation_category"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_remote_operation_category" ON __mj."RemoteOperationCategory";

CREATE TRIGGER "trg_update_remote_operation_category"
BEFORE UPDATE ON __mj."RemoteOperationCategory"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_remote_operation_category"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operation Categories
-- Item: spDeleteRemoteOperationCategory
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RemoteOperationCategory
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRemoteOperationCategory'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteRemoteOperationCategory"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."RemoteOperationCategory"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteRemoteOperationCategory" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteRemoteOperationCategory" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_remote_operation_category_id"
    ON __mj."RemoteOperation" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_remote_operation_code_approved_by_user_id"
    ON __mj."RemoteOperation" ("CodeApprovedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: vwRemoteOperations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Remote Operations
-----               SCHEMA:      __mj
-----               BASE TABLE:  RemoteOperation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwRemoteOperations"
AS
SELECT
    r.*,
    MJRemoteOperationCategory_CategoryID."Name" AS "Category",
    MJUser_CodeApprovedByUserID."Name" AS "CodeApprovedByUser"
FROM
    __mj."RemoteOperation" AS r
LEFT OUTER JOIN
    __mj."RemoteOperationCategory" AS MJRemoteOperationCategory_CategoryID
  ON
    "r"."CategoryID" = MJRemoteOperationCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_CodeApprovedByUserID
  ON
    "r"."CodeApprovedByUserID" = MJUser_CodeApprovedByUserID."ID"
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
    AND tc.relname = 'vwRemoteOperations'
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
    AND tc.relname = 'vwRemoteOperations'
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
        AND tc.relname = 'vwRemoteOperations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwRemoteOperations" CASCADE;
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
GRANT SELECT ON __mj."vwRemoteOperations" TO "cdp_UI";
GRANT SELECT ON __mj."vwRemoteOperations" TO "cdp_Developer";
GRANT SELECT ON __mj."vwRemoteOperations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: spCreateRemoteOperation
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RemoteOperation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRemoteOperation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateRemoteOperation"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_operationkey varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_inputtypename_clear boolean DEFAULT false,
    p_inputtypename varchar(255) DEFAULT NULL,
    p_inputtypedefinition_clear boolean DEFAULT false,
    p_inputtypedefinition TEXT DEFAULT NULL,
    p_inputtypeisarray BOOLEAN DEFAULT NULL,
    p_outputtypename_clear boolean DEFAULT false,
    p_outputtypename varchar(255) DEFAULT NULL,
    p_outputtypedefinition_clear boolean DEFAULT false,
    p_outputtypedefinition TEXT DEFAULT NULL,
    p_outputtypeisarray BOOLEAN DEFAULT NULL,
    p_executionmode varchar(20) DEFAULT NULL,
    p_requiredscope_clear boolean DEFAULT false,
    p_requiredscope varchar(255) DEFAULT NULL,
    p_requiressystemuser BOOLEAN DEFAULT NULL,
    p_generationtype varchar(20) DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_contractfingerprint_clear boolean DEFAULT false,
    p_contractfingerprint varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_timeoutms_clear boolean DEFAULT false,
    p_timeoutms int DEFAULT NULL,
    p_maxconcurrency_clear boolean DEFAULT false,
    p_maxconcurrency int DEFAULT NULL
) RETURNS SETOF __mj."vwRemoteOperations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."RemoteOperation"
        (
            "ID",
            "Name",
                "OperationKey",
                "CategoryID",
                "Description",
                "InputTypeName",
                "InputTypeDefinition",
                "InputTypeIsArray",
                "OutputTypeName",
                "OutputTypeDefinition",
                "OutputTypeIsArray",
                "ExecutionMode",
                "RequiredScope",
                "RequiresSystemUser",
                "GenerationType",
                "Code",
                "CodeApprovalStatus",
                "CodeApprovedByUserID",
                "CodeApprovedAt",
                "ContractFingerprint",
                "Status",
                "CacheTTLSeconds",
                "TimeoutMS",
                "MaxConcurrency"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_operationkey,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_inputtypename_clear = true THEN NULL ELSE COALESCE(p_inputtypename, NULL) END,
                CASE WHEN p_inputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_inputtypedefinition, NULL) END,
                COALESCE(p_inputtypeisarray, FALSE),
                CASE WHEN p_outputtypename_clear = true THEN NULL ELSE COALESCE(p_outputtypename, NULL) END,
                CASE WHEN p_outputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_outputtypedefinition, NULL) END,
                COALESCE(p_outputtypeisarray, FALSE),
                COALESCE(p_executionmode, 'Sync'),
                CASE WHEN p_requiredscope_clear = true THEN NULL ELSE COALESCE(p_requiredscope, NULL) END,
                COALESCE(p_requiressystemuser, FALSE),
                COALESCE(p_generationtype, 'Manual'),
                CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, NULL) END,
                COALESCE(p_codeapprovalstatus, 'Pending'),
                CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, NULL) END,
                CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, NULL) END,
                CASE WHEN p_contractfingerprint_clear = true THEN NULL ELSE COALESCE(p_contractfingerprint, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, NULL) END,
                CASE WHEN p_timeoutms_clear = true THEN NULL ELSE COALESCE(p_timeoutms, NULL) END,
                CASE WHEN p_maxconcurrency_clear = true THEN NULL ELSE COALESCE(p_maxconcurrency, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwRemoteOperations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateRemoteOperation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateRemoteOperation" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: spUpdateRemoteOperation
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RemoteOperation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRemoteOperation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateRemoteOperation"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_operationkey varchar(255) DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_inputtypename_clear boolean DEFAULT false,
    p_inputtypename varchar(255) DEFAULT NULL,
    p_inputtypedefinition_clear boolean DEFAULT false,
    p_inputtypedefinition TEXT DEFAULT NULL,
    p_inputtypeisarray BOOLEAN DEFAULT NULL,
    p_outputtypename_clear boolean DEFAULT false,
    p_outputtypename varchar(255) DEFAULT NULL,
    p_outputtypedefinition_clear boolean DEFAULT false,
    p_outputtypedefinition TEXT DEFAULT NULL,
    p_outputtypeisarray BOOLEAN DEFAULT NULL,
    p_executionmode varchar(20) DEFAULT NULL,
    p_requiredscope_clear boolean DEFAULT false,
    p_requiredscope varchar(255) DEFAULT NULL,
    p_requiressystemuser BOOLEAN DEFAULT NULL,
    p_generationtype varchar(20) DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_contractfingerprint_clear boolean DEFAULT false,
    p_contractfingerprint varchar(100) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_timeoutms_clear boolean DEFAULT false,
    p_timeoutms int DEFAULT NULL,
    p_maxconcurrency_clear boolean DEFAULT false,
    p_maxconcurrency int DEFAULT NULL
) RETURNS SETOF __mj."vwRemoteOperations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."RemoteOperation"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "OperationKey" = COALESCE(p_operationkey, "OperationKey"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "InputTypeName" = CASE WHEN p_inputtypename_clear = true THEN NULL ELSE COALESCE(p_inputtypename, "InputTypeName") END,
        "InputTypeDefinition" = CASE WHEN p_inputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_inputtypedefinition, "InputTypeDefinition") END,
        "InputTypeIsArray" = COALESCE(p_inputtypeisarray, "InputTypeIsArray"),
        "OutputTypeName" = CASE WHEN p_outputtypename_clear = true THEN NULL ELSE COALESCE(p_outputtypename, "OutputTypeName") END,
        "OutputTypeDefinition" = CASE WHEN p_outputtypedefinition_clear = true THEN NULL ELSE COALESCE(p_outputtypedefinition, "OutputTypeDefinition") END,
        "OutputTypeIsArray" = COALESCE(p_outputtypeisarray, "OutputTypeIsArray"),
        "ExecutionMode" = COALESCE(p_executionmode, "ExecutionMode"),
        "RequiredScope" = CASE WHEN p_requiredscope_clear = true THEN NULL ELSE COALESCE(p_requiredscope, "RequiredScope") END,
        "RequiresSystemUser" = COALESCE(p_requiressystemuser, "RequiresSystemUser"),
        "GenerationType" = COALESCE(p_generationtype, "GenerationType"),
        "Code" = CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, "Code") END,
        "CodeApprovalStatus" = COALESCE(p_codeapprovalstatus, "CodeApprovalStatus"),
        "CodeApprovedByUserID" = CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, "CodeApprovedByUserID") END,
        "CodeApprovedAt" = CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, "CodeApprovedAt") END,
        "ContractFingerprint" = CASE WHEN p_contractfingerprint_clear = true THEN NULL ELSE COALESCE(p_contractfingerprint, "ContractFingerprint") END,
        "Status" = COALESCE(p_status, "Status"),
        "CacheTTLSeconds" = CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, "CacheTTLSeconds") END,
        "TimeoutMS" = CASE WHEN p_timeoutms_clear = true THEN NULL ELSE COALESCE(p_timeoutms, "TimeoutMS") END,
        "MaxConcurrency" = CASE WHEN p_maxconcurrency_clear = true THEN NULL ELSE COALESCE(p_maxconcurrency, "MaxConcurrency") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwRemoteOperations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateRemoteOperation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateRemoteOperation" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RemoteOperation table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_remote_operation"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_remote_operation" ON __mj."RemoteOperation";

CREATE TRIGGER "trg_update_remote_operation"
BEFORE UPDATE ON __mj."RemoteOperation"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_remote_operation"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Remote Operations
-- Item: spDeleteRemoteOperation
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RemoteOperation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRemoteOperation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteRemoteOperation"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."RemoteOperation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteRemoteOperation" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteRemoteOperation" TO "cdp_Integration";

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
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID']
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

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_category_id"
    ON __mj."Action" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_code_approved_by_user_id"
    ON __mj."Action" ("CodeApprovedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_parent_id"
    ON __mj."Action" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_default_compact_prompt_id"
    ON __mj."Action" ("DefaultCompactPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_created_by_agent_id"
    ON __mj."Action" ("CreatedByAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: fnActionParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: Action.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_action_parent_id_get_root_id"(
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
            __mj."Action"
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
            __mj."Action" c
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
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: vwActions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Actions
-----               SCHEMA:      __mj
-----               BASE TABLE:  Action
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwActions"
AS
SELECT
    a.*,
    MJActionCategory_CategoryID."Name" AS "Category",
    MJUser_CodeApprovedByUserID."Name" AS "CodeApprovedByUser",
    MJAction_ParentID."Name" AS "Parent",
    MJAIPrompt_DefaultCompactPromptID."Name" AS "DefaultCompactPrompt",
    MJAIAgent_CreatedByAgentID."Name" AS "CreatedByAgent",
    root_ParentID.root_id AS "RootParentID"
FROM
    __mj."Action" AS a
LEFT OUTER JOIN
    __mj."ActionCategory" AS MJActionCategory_CategoryID
  ON
    "a"."CategoryID" = MJActionCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_CodeApprovedByUserID
  ON
    "a"."CodeApprovedByUserID" = MJUser_CodeApprovedByUserID."ID"
LEFT OUTER JOIN
    __mj."Action" AS MJAction_ParentID
  ON
    "a"."ParentID" = MJAction_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_DefaultCompactPromptID
  ON
    "a"."DefaultCompactPromptID" = MJAIPrompt_DefaultCompactPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_CreatedByAgentID
  ON
    "a"."CreatedByAgentID" = MJAIAgent_CreatedByAgentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_action_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
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
    AND tc.relname = 'vwActions'
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
    AND tc.relname = 'vwActions'
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
        AND tc.relname = 'vwActions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwActions" CASCADE;
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
GRANT SELECT ON __mj."vwActions" TO "cdp_UI";
GRANT SELECT ON __mj."vwActions" TO "cdp_Integration";
GRANT SELECT ON __mj."vwActions" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: spCreateAction
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Action
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAction"(
    p_id UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_name varchar(425) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_userprompt_clear boolean DEFAULT false,
    p_userprompt TEXT DEFAULT NULL,
    p_usercomments_clear boolean DEFAULT false,
    p_usercomments TEXT DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codecomments_clear boolean DEFAULT false,
    p_codecomments TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovalcomments_clear boolean DEFAULT false,
    p_codeapprovalcomments TEXT DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_codelocked BOOLEAN DEFAULT NULL,
    p_forcecodegeneration BOOLEAN DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_defaultcompactpromptid_clear boolean DEFAULT false,
    p_defaultcompactpromptid UUID DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_runtimeactionconfiguration_clear boolean DEFAULT false,
    p_runtimeactionconfiguration TEXT DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_createdbyagentid_clear boolean DEFAULT false,
    p_createdbyagentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwActions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Action"
        (
            "ID",
            "CategoryID",
                "Name",
                "Description",
                "Type",
                "UserPrompt",
                "UserComments",
                "Code",
                "CodeComments",
                "CodeApprovalStatus",
                "CodeApprovalComments",
                "CodeApprovedByUserID",
                "CodeApprovedAt",
                "CodeLocked",
                "ForceCodeGeneration",
                "RetentionPeriod",
                "Status",
                "DriverClass",
                "ParentID",
                "IconClass",
                "DefaultCompactPromptID",
                "Config",
                "RuntimeActionConfiguration",
                "MaxExecutionTimeMS",
                "CreatedByAgentID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_type, 'Generated'),
                CASE WHEN p_userprompt_clear = true THEN NULL ELSE COALESCE(p_userprompt, NULL) END,
                CASE WHEN p_usercomments_clear = true THEN NULL ELSE COALESCE(p_usercomments, NULL) END,
                CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, NULL) END,
                CASE WHEN p_codecomments_clear = true THEN NULL ELSE COALESCE(p_codecomments, NULL) END,
                COALESCE(p_codeapprovalstatus, 'Pending'),
                CASE WHEN p_codeapprovalcomments_clear = true THEN NULL ELSE COALESCE(p_codeapprovalcomments, NULL) END,
                CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, NULL) END,
                CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, NULL) END,
                COALESCE(p_codelocked, FALSE),
                COALESCE(p_forcecodegeneration, FALSE),
                CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, NULL) END,
                CASE WHEN p_defaultcompactpromptid_clear = true THEN NULL ELSE COALESCE(p_defaultcompactpromptid, NULL) END,
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END,
                CASE WHEN p_runtimeactionconfiguration_clear = true THEN NULL ELSE COALESCE(p_runtimeactionconfiguration, NULL) END,
                CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, NULL) END,
                CASE WHEN p_createdbyagentid_clear = true THEN NULL ELSE COALESCE(p_createdbyagentid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwActions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateAction" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: spUpdateAction
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Action
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAction"(
    p_id UUID,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_name varchar(425) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_userprompt_clear boolean DEFAULT false,
    p_userprompt TEXT DEFAULT NULL,
    p_usercomments_clear boolean DEFAULT false,
    p_usercomments TEXT DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code TEXT DEFAULT NULL,
    p_codecomments_clear boolean DEFAULT false,
    p_codecomments TEXT DEFAULT NULL,
    p_codeapprovalstatus varchar(20) DEFAULT NULL,
    p_codeapprovalcomments_clear boolean DEFAULT false,
    p_codeapprovalcomments TEXT DEFAULT NULL,
    p_codeapprovedbyuserid_clear boolean DEFAULT false,
    p_codeapprovedbyuserid UUID DEFAULT NULL,
    p_codeapprovedat_clear boolean DEFAULT false,
    p_codeapprovedat TIMESTAMPTZ DEFAULT NULL,
    p_codelocked BOOLEAN DEFAULT NULL,
    p_forcecodegeneration BOOLEAN DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(255) DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_iconclass_clear boolean DEFAULT false,
    p_iconclass varchar(100) DEFAULT NULL,
    p_defaultcompactpromptid_clear boolean DEFAULT false,
    p_defaultcompactpromptid UUID DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_runtimeactionconfiguration_clear boolean DEFAULT false,
    p_runtimeactionconfiguration TEXT DEFAULT NULL,
    p_maxexecutiontimems_clear boolean DEFAULT false,
    p_maxexecutiontimems int DEFAULT NULL,
    p_createdbyagentid_clear boolean DEFAULT false,
    p_createdbyagentid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwActions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Action"
    SET
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Type" = COALESCE(p_type, "Type"),
        "UserPrompt" = CASE WHEN p_userprompt_clear = true THEN NULL ELSE COALESCE(p_userprompt, "UserPrompt") END,
        "UserComments" = CASE WHEN p_usercomments_clear = true THEN NULL ELSE COALESCE(p_usercomments, "UserComments") END,
        "Code" = CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, "Code") END,
        "CodeComments" = CASE WHEN p_codecomments_clear = true THEN NULL ELSE COALESCE(p_codecomments, "CodeComments") END,
        "CodeApprovalStatus" = COALESCE(p_codeapprovalstatus, "CodeApprovalStatus"),
        "CodeApprovalComments" = CASE WHEN p_codeapprovalcomments_clear = true THEN NULL ELSE COALESCE(p_codeapprovalcomments, "CodeApprovalComments") END,
        "CodeApprovedByUserID" = CASE WHEN p_codeapprovedbyuserid_clear = true THEN NULL ELSE COALESCE(p_codeapprovedbyuserid, "CodeApprovedByUserID") END,
        "CodeApprovedAt" = CASE WHEN p_codeapprovedat_clear = true THEN NULL ELSE COALESCE(p_codeapprovedat, "CodeApprovedAt") END,
        "CodeLocked" = COALESCE(p_codelocked, "CodeLocked"),
        "ForceCodeGeneration" = COALESCE(p_forcecodegeneration, "ForceCodeGeneration"),
        "RetentionPeriod" = CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, "RetentionPeriod") END,
        "Status" = COALESCE(p_status, "Status"),
        "DriverClass" = CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, "DriverClass") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "IconClass" = CASE WHEN p_iconclass_clear = true THEN NULL ELSE COALESCE(p_iconclass, "IconClass") END,
        "DefaultCompactPromptID" = CASE WHEN p_defaultcompactpromptid_clear = true THEN NULL ELSE COALESCE(p_defaultcompactpromptid, "DefaultCompactPromptID") END,
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END,
        "RuntimeActionConfiguration" = CASE WHEN p_runtimeactionconfiguration_clear = true THEN NULL ELSE COALESCE(p_runtimeactionconfiguration, "RuntimeActionConfiguration") END,
        "MaxExecutionTimeMS" = CASE WHEN p_maxexecutiontimems_clear = true THEN NULL ELSE COALESCE(p_maxexecutiontimems, "MaxExecutionTimeMS") END,
        "CreatedByAgentID" = CASE WHEN p_createdbyagentid_clear = true THEN NULL ELSE COALESCE(p_createdbyagentid, "CreatedByAgentID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwActions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAction" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Action table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_action"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_action" ON __mj."Action";

CREATE TRIGGER "trg_update_action"
BEFORE UPDATE ON __mj."Action"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_action"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Actions
-- Item: spDeleteAction
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Action
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAction'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Action Authorizations records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionAuthorization"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionAuthorization"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Contexts records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionContext"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionContext"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Execution Logs records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionExecutionLog"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionExecutionLog"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Libraries records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionLibrary"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionLibrary"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Params records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionParam"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionParam"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Action Result Codes records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ActionResultCode"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteActionResultCode"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Actions records via ParentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "ParentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Entity Actions records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityAction"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityAction"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: MCP Server Tools.GeneratedActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MCPServerTool"
        WHERE "GeneratedActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."MCPServerTool"
        SET "GeneratedActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.ActionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "ActionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "ActionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Scheduled Actions records via ActionID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ScheduledAction"
        WHERE "ActionID" = p_id
    LOOP
        PERFORM __mj."spDeleteScheduledAction"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."Action"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_parent_id"
    ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_context_compression_prompt_id"
    ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_type_id"
    ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_artifact_type_id"
    ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_owner_user_id"
    ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_attachment_storage_provider_id"
    ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_category_id"
    ON __mj."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_storage_account_id"
    ON __mj."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_default_co_agent_id"
    ON __mj."AIAgent" ("DefaultCoAgentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fnAIAgentParentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_parent_id_get_root_id"(
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
            __mj."AIAgent"
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
            __mj."AIAgent" c
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
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: fnAIAgentDefaultCoAgentID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgent.DefaultCoAgentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_default_co_agent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "DefaultCoAgentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."DefaultCoAgentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgent" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."DefaultCoAgentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "DefaultCoAgentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: vwAIAgents
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
AS
SELECT
    a.*,
    MJAIAgent_ParentID."Name" AS "Parent",
    MJAIPrompt_ContextCompressionPromptID."Name" AS "ContextCompressionPrompt",
    MJAIAgentType_TypeID."Name" AS "Type",
    MJArtifactType_DefaultArtifactTypeID."Name" AS "DefaultArtifactType",
    MJUser_OwnerUserID."Name" AS "OwnerUser",
    MJFileStorageProvider_AttachmentStorageProviderID."Name" AS "AttachmentStorageProvider",
    MJAIAgentCategory_CategoryID."Name" AS "Category",
    MJFileStorageAccount_DefaultStorageAccountID."Name" AS "DefaultStorageAccount",
    MJAIAgent_DefaultCoAgentID."Name" AS "DefaultCoAgent",
    root_ParentID.root_id AS "RootParentID",
    root_DefaultCoAgentID.root_id AS "RootDefaultCoAgentID"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_ParentID
  ON
    "a"."ParentID" = MJAIAgent_ParentID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ContextCompressionPromptID
  ON
    "a"."ContextCompressionPromptID" = MJAIPrompt_ContextCompressionPromptID."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS MJAIAgentType_TypeID
  ON
    "a"."TypeID" = MJAIAgentType_TypeID."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS MJArtifactType_DefaultArtifactTypeID
  ON
    "a"."DefaultArtifactTypeID" = MJArtifactType_DefaultArtifactTypeID."ID"
INNER JOIN
    __mj."User" AS MJUser_OwnerUserID
  ON
    "a"."OwnerUserID" = MJUser_OwnerUserID."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    "a"."AttachmentStorageProviderID" = MJFileStorageProvider_AttachmentStorageProviderID."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS MJAIAgentCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIAgentCategory_CategoryID."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    "a"."DefaultStorageAccountID" = MJFileStorageAccount_DefaultStorageAccountID."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS MJAIAgent_DefaultCoAgentID
  ON
    "a"."DefaultCoAgentID" = MJAIAgent_DefaultCoAgentID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_parent_id_get_root_id"(a."ID", a."ParentID") AS root_id
) AS root_ParentID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_default_co_agent_id_get_root_id"(a."ID", a."DefaultCoAgentID") AS root_id
) AS root_DefaultCoAgentID ON true
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
    AND tc.relname = 'vwAIAgents'
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
    AND tc.relname = 'vwAIAgents'
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
        AND tc.relname = 'vwAIAgents'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgents" CASCADE;
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
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgents" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spCreateAIAgent
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
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
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'ExposeAsAction' THEN 'COALESCE(($1->>''ExposeAsAction'')::BOOLEAN, FALSE)'
        WHEN 'ExecutionOrder' THEN 'COALESCE(($1->>''ExecutionOrder'')::INT, 0)'
        WHEN 'ExecutionMode' THEN 'COALESCE(($1->>''ExecutionMode''), ''Sequential'')'
        WHEN 'EnableContextCompression' THEN 'COALESCE(($1->>''EnableContextCompression'')::BOOLEAN, FALSE)'
        WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INT'
        WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
        WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INT'
        WHEN 'TypeID' THEN '($1->>''TypeID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'DriverClass' THEN '($1->>''DriverClass'')'
        WHEN 'IconClass' THEN '($1->>''IconClass'')'
        WHEN 'ModelSelectionMode' THEN 'COALESCE(($1->>''ModelSelectionMode''), ''Agent Type'')'
        WHEN 'PayloadDownstreamPaths' THEN 'COALESCE(($1->>''PayloadDownstreamPaths''), ''["*"]'')'
        WHEN 'PayloadUpstreamPaths' THEN 'COALESCE(($1->>''PayloadUpstreamPaths''), ''["*"]'')'
        WHEN 'PayloadSelfReadPaths' THEN '($1->>''PayloadSelfReadPaths'')'
        WHEN 'PayloadSelfWritePaths' THEN '($1->>''PayloadSelfWritePaths'')'
        WHEN 'PayloadScope' THEN '($1->>''PayloadScope'')'
        WHEN 'FinalPayloadValidation' THEN '($1->>''FinalPayloadValidation'')'
        WHEN 'FinalPayloadValidationMode' THEN 'COALESCE(($1->>''FinalPayloadValidationMode''), ''Retry'')'
        WHEN 'FinalPayloadValidationMaxRetries' THEN 'COALESCE(($1->>''FinalPayloadValidationMaxRetries'')::INT, 3)'
        WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::DECIMAL(10, 4)'
        WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INT'
        WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INT'
        WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INT'
        WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INT'
        WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INT'
        WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
        WHEN 'StartingPayloadValidationMode' THEN 'COALESCE(($1->>''StartingPayloadValidationMode''), ''Fail'')'
        WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INT'
        WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
        WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
        WHEN 'OwnerUserID' THEN 'CASE WHEN ($1->>''OwnerUserID'')::UUID = ''00000000-0000-0000-0000-000000000000''::uuid THEN ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'' ELSE COALESCE(($1->>''OwnerUserID'')::UUID, ''ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'') END'
        WHEN 'InvocationMode' THEN 'COALESCE(($1->>''InvocationMode''), ''Any'')'
        WHEN 'ArtifactCreationMode' THEN 'COALESCE(($1->>''ArtifactCreationMode''), ''Always'')'
        WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
        WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
        WHEN 'InjectNotes' THEN 'COALESCE(($1->>''InjectNotes'')::BOOLEAN, TRUE)'
        WHEN 'MaxNotesToInject' THEN 'COALESCE(($1->>''MaxNotesToInject'')::INT, 5)'
        WHEN 'NoteInjectionStrategy' THEN 'COALESCE(($1->>''NoteInjectionStrategy''), ''Relevant'')'
        WHEN 'InjectExamples' THEN 'COALESCE(($1->>''InjectExamples'')::BOOLEAN, FALSE)'
        WHEN 'MaxExamplesToInject' THEN 'COALESCE(($1->>''MaxExamplesToInject'')::INT, 3)'
        WHEN 'ExampleInjectionStrategy' THEN 'COALESCE(($1->>''ExampleInjectionStrategy''), ''Semantic'')'
        WHEN 'IsRestricted' THEN 'COALESCE(($1->>''IsRestricted'')::BOOLEAN, FALSE)'
        WHEN 'MessageMode' THEN 'COALESCE(($1->>''MessageMode''), ''None'')'
        WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INT'
        WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
        WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
        WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INT'
        WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
        WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
        WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INT'
        WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INT'
        WHEN 'AutoArchiveEnabled' THEN 'COALESCE(($1->>''AutoArchiveEnabled'')::BOOLEAN, TRUE)'
        WHEN 'RerankerConfiguration' THEN '($1->>''RerankerConfiguration'')'
        WHEN 'CategoryID' THEN '($1->>''CategoryID'')::UUID'
        WHEN 'AllowEphemeralClientTools' THEN 'COALESCE(($1->>''AllowEphemeralClientTools'')::BOOLEAN, TRUE)'
        WHEN 'DefaultStorageAccountID' THEN '($1->>''DefaultStorageAccountID'')::UUID'
        WHEN 'SearchScopeAccess' THEN 'COALESCE(($1->>''SearchScopeAccess''), ''None'')'
        WHEN 'AcceptUnregisteredFiles' THEN 'COALESCE(($1->>''AcceptUnregisteredFiles'')::BOOLEAN, FALSE)'
        WHEN 'DefaultCoAgentID' THEN '($1->>''DefaultCoAgentID'')::UUID'
        WHEN 'TypeConfiguration' THEN '($1->>''TypeConfiguration'')'
        WHEN 'AllowMemoryWrite' THEN 'COALESCE(($1->>''AllowMemoryWrite'')::BOOLEAN, TRUE)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO __mj."AIAgent" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgent (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgent"
    SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INT ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INT ELSE "ContextCompressionMessageRetentionCount" END,
        "TypeID" = CASE WHEN p_data ? 'TypeID' THEN (p_data->>'TypeID')::UUID ELSE "TypeID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DriverClass" = CASE WHEN p_data ? 'DriverClass' THEN (p_data->>'DriverClass') ELSE "DriverClass" END,
        "IconClass" = CASE WHEN p_data ? 'IconClass' THEN (p_data->>'IconClass') ELSE "IconClass" END,
        "ModelSelectionMode" = CASE WHEN p_data ? 'ModelSelectionMode' THEN (p_data->>'ModelSelectionMode') ELSE "ModelSelectionMode" END,
        "PayloadDownstreamPaths" = CASE WHEN p_data ? 'PayloadDownstreamPaths' THEN (p_data->>'PayloadDownstreamPaths') ELSE "PayloadDownstreamPaths" END,
        "PayloadUpstreamPaths" = CASE WHEN p_data ? 'PayloadUpstreamPaths' THEN (p_data->>'PayloadUpstreamPaths') ELSE "PayloadUpstreamPaths" END,
        "PayloadSelfReadPaths" = CASE WHEN p_data ? 'PayloadSelfReadPaths' THEN (p_data->>'PayloadSelfReadPaths') ELSE "PayloadSelfReadPaths" END,
        "PayloadSelfWritePaths" = CASE WHEN p_data ? 'PayloadSelfWritePaths' THEN (p_data->>'PayloadSelfWritePaths') ELSE "PayloadSelfWritePaths" END,
        "PayloadScope" = CASE WHEN p_data ? 'PayloadScope' THEN (p_data->>'PayloadScope') ELSE "PayloadScope" END,
        "FinalPayloadValidation" = CASE WHEN p_data ? 'FinalPayloadValidation' THEN (p_data->>'FinalPayloadValidation') ELSE "FinalPayloadValidation" END,
        "FinalPayloadValidationMode" = CASE WHEN p_data ? 'FinalPayloadValidationMode' THEN (p_data->>'FinalPayloadValidationMode') ELSE "FinalPayloadValidationMode" END,
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INT ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::DECIMAL(10, 4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INT ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INT ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INT ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INT ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INT ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INT ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INT ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INT ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INT ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INT ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INT ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INT ELSE "ExampleRetentionDays" END,
        "AutoArchiveEnabled" = CASE WHEN p_data ? 'AutoArchiveEnabled' THEN (p_data->>'AutoArchiveEnabled')::BOOLEAN ELSE "AutoArchiveEnabled" END,
        "RerankerConfiguration" = CASE WHEN p_data ? 'RerankerConfiguration' THEN (p_data->>'RerankerConfiguration') ELSE "RerankerConfiguration" END,
        "CategoryID" = CASE WHEN p_data ? 'CategoryID' THEN (p_data->>'CategoryID')::UUID ELSE "CategoryID" END,
        "AllowEphemeralClientTools" = CASE WHEN p_data ? 'AllowEphemeralClientTools' THEN (p_data->>'AllowEphemeralClientTools')::BOOLEAN ELSE "AllowEphemeralClientTools" END,
        "DefaultStorageAccountID" = CASE WHEN p_data ? 'DefaultStorageAccountID' THEN (p_data->>'DefaultStorageAccountID')::UUID ELSE "DefaultStorageAccountID" END,
        "SearchScopeAccess" = CASE WHEN p_data ? 'SearchScopeAccess' THEN (p_data->>'SearchScopeAccess') ELSE "SearchScopeAccess" END,
        "AcceptUnregisteredFiles" = CASE WHEN p_data ? 'AcceptUnregisteredFiles' THEN (p_data->>'AcceptUnregisteredFiles')::BOOLEAN ELSE "AcceptUnregisteredFiles" END,
        "DefaultCoAgentID" = CASE WHEN p_data ? 'DefaultCoAgentID' THEN (p_data->>'DefaultCoAgentID')::UUID ELSE "DefaultCoAgentID" END,
        "TypeConfiguration" = CASE WHEN p_data ? 'TypeConfiguration' THEN (p_data->>'TypeConfiguration') ELSE "TypeConfiguration" END,
        "AllowMemoryWrite" = CASE WHEN p_data ? 'AllowMemoryWrite' THEN (p_data->>'AllowMemoryWrite')::BOOLEAN ELSE "AllowMemoryWrite" END,
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
    SELECT * FROM __mj."vwAIAgents"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent" ON __mj."AIAgent";

CREATE TRIGGER "trg_update_ai_agent"
BEFORE UPDATE ON __mj."AIAgent"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgent
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgent'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Actions.CreatedByAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "CreatedByAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "CreatedByAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Artifact Types records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentArtifactType"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentArtifactType"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Client Tools records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentClientTool"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentClientTool"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Co Agents records via CoAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "CoAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentCoAgent"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Co Agents.TargetAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentCoAgent"
        WHERE "TargetAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentCoAgent"
        SET "TargetAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Configurations records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentConfiguration"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentConfiguration"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Data Sources records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentDataSource"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentDataSource"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Examples records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentExample"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Learning Cycles records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentLearningCycle"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentLearningCycle"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Modalities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModality"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentModality"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Models.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentModel"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentModel"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Permissions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPermission"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPermission"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Relationships records via SubAgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRelationship"
        WHERE "SubAgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRelationship"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Requests records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRequest"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Runs records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Search Scopes records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSearchScope"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSearchScope"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Sessions records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentSession"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentSession"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Steps records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.SubAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "SubAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "SubAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.DefaultCoAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "DefaultCoAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "DefaultCoAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Bridge Agent Identities records via AgentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIBridgeAgentIdentity"
        WHERE "AgentID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIBridgeAgentIdentity"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIResultCache"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Details.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ConversationDetail"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ConversationDetail"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversations.DefaultAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Conversation"
        WHERE "DefaultAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Conversation"
        SET "DefaultAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Record Processes.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Search Execution Logs.AIAgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."SearchExecutionLog"
        WHERE "AIAgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."SearchExecutionLog"
        SET "AIAgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Task"
        WHERE "AgentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Task"
        SET "AgentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgent"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_template_id"
    ON __mj."AIPrompt" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_category_id"
    ON __mj."AIPrompt" ("CategoryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_type_id"
    ON __mj."AIPrompt" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_ai_model_type_id"
    ON __mj."AIPrompt" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_result_selector_prompt_id"
    ON __mj."AIPrompt" ("ResultSelectorPromptID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: fnAIPromptResultSelectorPromptID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPrompt.ResultSelectorPromptID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_prompt_result_selector_prompt_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ResultSelectorPromptID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIPrompt"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ResultSelectorPromptID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIPrompt" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ResultSelectorPromptID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ResultSelectorPromptID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: vwAIPrompts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompts
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIPrompts"
AS
SELECT
    a.*,
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIPromptCategory_CategoryID."Name" AS "Category",
    MJAIPromptType_TypeID."Name" AS "Type",
    MJAIModelType_AIModelTypeID."Name" AS "AIModelType",
    MJAIPrompt_ResultSelectorPromptID."Name" AS "ResultSelectorPrompt",
    root_ResultSelectorPromptID.root_id AS "RootResultSelectorPromptID"
FROM
    __mj."AIPrompt" AS a
INNER JOIN
    __mj."Template" AS MJTemplate_TemplateID
  ON
    "a"."TemplateID" = MJTemplate_TemplateID."ID"
LEFT OUTER JOIN
    __mj."AIPromptCategory" AS MJAIPromptCategory_CategoryID
  ON
    "a"."CategoryID" = MJAIPromptCategory_CategoryID."ID"
INNER JOIN
    __mj."AIPromptType" AS MJAIPromptType_TypeID
  ON
    "a"."TypeID" = MJAIPromptType_TypeID."ID"
LEFT OUTER JOIN
    __mj."AIModelType" AS MJAIModelType_AIModelTypeID
  ON
    "a"."AIModelTypeID" = MJAIModelType_AIModelTypeID."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS MJAIPrompt_ResultSelectorPromptID
  ON
    "a"."ResultSelectorPromptID" = MJAIPrompt_ResultSelectorPromptID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_prompt_result_selector_prompt_id_get_root_id"(a."ID", a."ResultSelectorPromptID") AS root_id
) AS root_ResultSelectorPromptID ON true
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
    AND tc.relname = 'vwAIPrompts'
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
    AND tc.relname = 'vwAIPrompts'
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
        AND tc.relname = 'vwAIPrompts'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIPrompts" CASCADE;
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
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_Integration";
GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAIPrompt"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwAIPrompts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIPrompt"
        (
            "ID",
            "Name",
                "Description",
                "TemplateID",
                "CategoryID",
                "TypeID",
                "Status",
                "ResponseFormat",
                "ModelSpecificResponseFormat",
                "AIModelTypeID",
                "MinPowerRank",
                "SelectionStrategy",
                "PowerPreference",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "OutputType",
                "OutputExample",
                "ValidationBehavior",
                "MaxRetries",
                "RetryDelayMS",
                "RetryStrategy",
                "ResultSelectorPromptID",
                "EnableCaching",
                "CacheTTLSeconds",
                "CacheMatchType",
                "CacheSimilarityThreshold",
                "CacheMustMatchModel",
                "CacheMustMatchVendor",
                "CacheMustMatchAgent",
                "CacheMustMatchConfig",
                "PromptRole",
                "PromptPosition",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "IncludeLogProbs",
                "TopLogProbs",
                "FailoverStrategy",
                "FailoverMaxAttempts",
                "FailoverDelaySeconds",
                "FailoverModelStrategy",
                "FailoverErrorScope",
                "EffortLevel",
                "AssistantPrefill",
                "PrefillFallbackMode",
                "RequireSpecificModels"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_templateid,
                CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, NULL) END,
                p_typeid,
                p_status,
                COALESCE(p_responseformat, 'Any'),
                CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, NULL) END,
                CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, NULL) END,
                CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, 0) END,
                COALESCE(p_selectionstrategy, 'Default'),
                COALESCE(p_powerpreference, 'Highest'),
                COALESCE(p_parallelizationmode, 'None'),
                CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, NULL) END,
                CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, NULL) END,
                COALESCE(p_outputtype, 'string'),
                CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, NULL) END,
                COALESCE(p_validationbehavior, 'Warn'),
                COALESCE(p_maxretries, 0),
                COALESCE(p_retrydelayms, 0),
                COALESCE(p_retrystrategy, 'Fixed'),
                CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, NULL) END,
                COALESCE(p_enablecaching, FALSE),
                CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, NULL) END,
                COALESCE(p_cachematchtype, 'Exact'),
                CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, NULL) END,
                COALESCE(p_cachemustmatchmodel, TRUE),
                COALESCE(p_cachemustmatchvendor, TRUE),
                COALESCE(p_cachemustmatchagent, FALSE),
                COALESCE(p_cachemustmatchconfig, FALSE),
                COALESCE(p_promptrole, 'System'),
                COALESCE(p_promptposition, 'First'),
                CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, NULL) END,
                CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, NULL) END,
                CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, NULL) END,
                CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, NULL) END,
                CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, NULL) END,
                CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, NULL) END,
                CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, NULL) END,
                CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, NULL) END,
                CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, FALSE) END,
                CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, NULL) END,
                COALESCE(p_failoverstrategy, 'SameModelDifferentVendor'),
                CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, 3) END,
                CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, 5) END,
                COALESCE(p_failovermodelstrategy, 'PreferSameModel'),
                COALESCE(p_failovererrorscope, 'All'),
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, NULL) END,
                COALESCE(p_prefillfallbackmode, 'Ignore'),
                COALESCE(p_requirespecificmodels, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIPrompts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIPrompt" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPrompt"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_templateid UUID DEFAULT NULL,
    p_categoryid_clear boolean DEFAULT false,
    p_categoryid UUID DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_responseformat varchar(20) DEFAULT NULL,
    p_modelspecificresponseformat_clear boolean DEFAULT false,
    p_modelspecificresponseformat TEXT DEFAULT NULL,
    p_aimodeltypeid_clear boolean DEFAULT false,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_minpowerrank_clear boolean DEFAULT false,
    p_minpowerrank int DEFAULT NULL,
    p_selectionstrategy varchar(20) DEFAULT NULL,
    p_powerpreference varchar(20) DEFAULT NULL,
    p_parallelizationmode varchar(20) DEFAULT NULL,
    p_parallelcount_clear boolean DEFAULT false,
    p_parallelcount int DEFAULT NULL,
    p_parallelconfigparam_clear boolean DEFAULT false,
    p_parallelconfigparam varchar(100) DEFAULT NULL,
    p_outputtype varchar(50) DEFAULT NULL,
    p_outputexample_clear boolean DEFAULT false,
    p_outputexample TEXT DEFAULT NULL,
    p_validationbehavior varchar(50) DEFAULT NULL,
    p_maxretries int DEFAULT NULL,
    p_retrydelayms int DEFAULT NULL,
    p_retrystrategy varchar(20) DEFAULT NULL,
    p_resultselectorpromptid_clear boolean DEFAULT false,
    p_resultselectorpromptid UUID DEFAULT NULL,
    p_enablecaching BOOLEAN DEFAULT NULL,
    p_cachettlseconds_clear boolean DEFAULT false,
    p_cachettlseconds int DEFAULT NULL,
    p_cachematchtype varchar(20) DEFAULT NULL,
    p_cachesimilaritythreshold_clear boolean DEFAULT false,
    p_cachesimilaritythreshold float(53) DEFAULT NULL,
    p_cachemustmatchmodel BOOLEAN DEFAULT NULL,
    p_cachemustmatchvendor BOOLEAN DEFAULT NULL,
    p_cachemustmatchagent BOOLEAN DEFAULT NULL,
    p_cachemustmatchconfig BOOLEAN DEFAULT NULL,
    p_promptrole varchar(20) DEFAULT NULL,
    p_promptposition varchar(20) DEFAULT NULL,
    p_temperature_clear boolean DEFAULT false,
    p_temperature decimal(3, 2) DEFAULT NULL,
    p_topp_clear boolean DEFAULT false,
    p_topp decimal(3, 2) DEFAULT NULL,
    p_topk_clear boolean DEFAULT false,
    p_topk int DEFAULT NULL,
    p_minp_clear boolean DEFAULT false,
    p_minp decimal(3, 2) DEFAULT NULL,
    p_frequencypenalty_clear boolean DEFAULT false,
    p_frequencypenalty decimal(3, 2) DEFAULT NULL,
    p_presencepenalty_clear boolean DEFAULT false,
    p_presencepenalty decimal(3, 2) DEFAULT NULL,
    p_seed_clear boolean DEFAULT false,
    p_seed int DEFAULT NULL,
    p_stopsequences_clear boolean DEFAULT false,
    p_stopsequences varchar(1000) DEFAULT NULL,
    p_includelogprobs_clear boolean DEFAULT false,
    p_includelogprobs BOOLEAN DEFAULT NULL,
    p_toplogprobs_clear boolean DEFAULT false,
    p_toplogprobs int DEFAULT NULL,
    p_failoverstrategy varchar(50) DEFAULT NULL,
    p_failovermaxattempts_clear boolean DEFAULT false,
    p_failovermaxattempts int DEFAULT NULL,
    p_failoverdelayseconds_clear boolean DEFAULT false,
    p_failoverdelayseconds int DEFAULT NULL,
    p_failovermodelstrategy varchar(50) DEFAULT NULL,
    p_failovererrorscope varchar(50) DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel int DEFAULT NULL,
    p_assistantprefill_clear boolean DEFAULT false,
    p_assistantprefill TEXT DEFAULT NULL,
    p_prefillfallbackmode varchar(20) DEFAULT NULL,
    p_requirespecificmodels BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwAIPrompts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIPrompt"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "CategoryID" = CASE WHEN p_categoryid_clear = true THEN NULL ELSE COALESCE(p_categoryid, "CategoryID") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "Status" = COALESCE(p_status, "Status"),
        "ResponseFormat" = COALESCE(p_responseformat, "ResponseFormat"),
        "ModelSpecificResponseFormat" = CASE WHEN p_modelspecificresponseformat_clear = true THEN NULL ELSE COALESCE(p_modelspecificresponseformat, "ModelSpecificResponseFormat") END,
        "AIModelTypeID" = CASE WHEN p_aimodeltypeid_clear = true THEN NULL ELSE COALESCE(p_aimodeltypeid, "AIModelTypeID") END,
        "MinPowerRank" = CASE WHEN p_minpowerrank_clear = true THEN NULL ELSE COALESCE(p_minpowerrank, "MinPowerRank") END,
        "SelectionStrategy" = COALESCE(p_selectionstrategy, "SelectionStrategy"),
        "PowerPreference" = COALESCE(p_powerpreference, "PowerPreference"),
        "ParallelizationMode" = COALESCE(p_parallelizationmode, "ParallelizationMode"),
        "ParallelCount" = CASE WHEN p_parallelcount_clear = true THEN NULL ELSE COALESCE(p_parallelcount, "ParallelCount") END,
        "ParallelConfigParam" = CASE WHEN p_parallelconfigparam_clear = true THEN NULL ELSE COALESCE(p_parallelconfigparam, "ParallelConfigParam") END,
        "OutputType" = COALESCE(p_outputtype, "OutputType"),
        "OutputExample" = CASE WHEN p_outputexample_clear = true THEN NULL ELSE COALESCE(p_outputexample, "OutputExample") END,
        "ValidationBehavior" = COALESCE(p_validationbehavior, "ValidationBehavior"),
        "MaxRetries" = COALESCE(p_maxretries, "MaxRetries"),
        "RetryDelayMS" = COALESCE(p_retrydelayms, "RetryDelayMS"),
        "RetryStrategy" = COALESCE(p_retrystrategy, "RetryStrategy"),
        "ResultSelectorPromptID" = CASE WHEN p_resultselectorpromptid_clear = true THEN NULL ELSE COALESCE(p_resultselectorpromptid, "ResultSelectorPromptID") END,
        "EnableCaching" = COALESCE(p_enablecaching, "EnableCaching"),
        "CacheTTLSeconds" = CASE WHEN p_cachettlseconds_clear = true THEN NULL ELSE COALESCE(p_cachettlseconds, "CacheTTLSeconds") END,
        "CacheMatchType" = COALESCE(p_cachematchtype, "CacheMatchType"),
        "CacheSimilarityThreshold" = CASE WHEN p_cachesimilaritythreshold_clear = true THEN NULL ELSE COALESCE(p_cachesimilaritythreshold, "CacheSimilarityThreshold") END,
        "CacheMustMatchModel" = COALESCE(p_cachemustmatchmodel, "CacheMustMatchModel"),
        "CacheMustMatchVendor" = COALESCE(p_cachemustmatchvendor, "CacheMustMatchVendor"),
        "CacheMustMatchAgent" = COALESCE(p_cachemustmatchagent, "CacheMustMatchAgent"),
        "CacheMustMatchConfig" = COALESCE(p_cachemustmatchconfig, "CacheMustMatchConfig"),
        "PromptRole" = COALESCE(p_promptrole, "PromptRole"),
        "PromptPosition" = COALESCE(p_promptposition, "PromptPosition"),
        "Temperature" = CASE WHEN p_temperature_clear = true THEN NULL ELSE COALESCE(p_temperature, "Temperature") END,
        "TopP" = CASE WHEN p_topp_clear = true THEN NULL ELSE COALESCE(p_topp, "TopP") END,
        "TopK" = CASE WHEN p_topk_clear = true THEN NULL ELSE COALESCE(p_topk, "TopK") END,
        "MinP" = CASE WHEN p_minp_clear = true THEN NULL ELSE COALESCE(p_minp, "MinP") END,
        "FrequencyPenalty" = CASE WHEN p_frequencypenalty_clear = true THEN NULL ELSE COALESCE(p_frequencypenalty, "FrequencyPenalty") END,
        "PresencePenalty" = CASE WHEN p_presencepenalty_clear = true THEN NULL ELSE COALESCE(p_presencepenalty, "PresencePenalty") END,
        "Seed" = CASE WHEN p_seed_clear = true THEN NULL ELSE COALESCE(p_seed, "Seed") END,
        "StopSequences" = CASE WHEN p_stopsequences_clear = true THEN NULL ELSE COALESCE(p_stopsequences, "StopSequences") END,
        "IncludeLogProbs" = CASE WHEN p_includelogprobs_clear = true THEN NULL ELSE COALESCE(p_includelogprobs, "IncludeLogProbs") END,
        "TopLogProbs" = CASE WHEN p_toplogprobs_clear = true THEN NULL ELSE COALESCE(p_toplogprobs, "TopLogProbs") END,
        "FailoverStrategy" = COALESCE(p_failoverstrategy, "FailoverStrategy"),
        "FailoverMaxAttempts" = CASE WHEN p_failovermaxattempts_clear = true THEN NULL ELSE COALESCE(p_failovermaxattempts, "FailoverMaxAttempts") END,
        "FailoverDelaySeconds" = CASE WHEN p_failoverdelayseconds_clear = true THEN NULL ELSE COALESCE(p_failoverdelayseconds, "FailoverDelaySeconds") END,
        "FailoverModelStrategy" = COALESCE(p_failovermodelstrategy, "FailoverModelStrategy"),
        "FailoverErrorScope" = COALESCE(p_failovererrorscope, "FailoverErrorScope"),
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "AssistantPrefill" = CASE WHEN p_assistantprefill_clear = true THEN NULL ELSE COALESCE(p_assistantprefill, "AssistantPrefill") END,
        "PrefillFallbackMode" = COALESCE(p_prefillfallbackmode, "PrefillFallbackMode"),
        "RequireSpecificModels" = COALESCE(p_requirespecificmodels, "RequireSpecificModels")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIPrompts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPrompt" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_prompt"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt" ON __mj."AIPrompt";

CREATE TRIGGER "trg_update_ai_prompt"
BEFORE UPDATE ON __mj."AIPrompt"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_prompt"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPrompt
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPrompt'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Actions.DefaultCompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Action"
        WHERE "DefaultCompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Action"
        SET "DefaultCompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Actions.CompactPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentAction"
        WHERE "CompactPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentAction"
        SET "CompactPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Prompts records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentPrompt"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentPrompt"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Steps.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentStep"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentStep"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Types.SystemPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentType"
        WHERE "SystemPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentType"
        SET "SystemPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agents.ContextCompressionPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgent"
        WHERE "ContextCompressionPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgent"
        SET "ContextCompressionPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextCompressionID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextCompressionID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextCompressionID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Configurations.DefaultPromptForContextSummarizationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIConfiguration"
        WHERE "DefaultPromptForContextSummarizationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIConfiguration"
        SET "DefaultPromptForContextSummarizationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Models records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptModel"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptModel"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Prompt Runs records via PromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "PromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.JudgeID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "JudgeID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "JudgeID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ChildPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "ChildPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "ChildPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompts.ResultSelectorPromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPrompt"
        WHERE "ResultSelectorPromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPrompt"
        SET "ResultSelectorPromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Result Cache records via AIPromptID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIResultCache"
        WHERE "AIPromptID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIResultCache"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Record Processes.PromptID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."RecordProcess"
        WHERE "PromptID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."RecordProcess"
        SET "PromptID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIPrompt"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer";
