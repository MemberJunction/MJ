-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611030307__v6.2.x__Diagnostic_Bundles.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ===================================================================================== */
/* Diagnostic Bundles & Flight Recorder Schema (MJ 6.2) */
/* Introduces four core tables: */
/*   1. DiagnosticSession: bounded server and client diagnostic recording sessions with */
/*      tenant isolation, scope targeting, and byte-budget controls. */
/*   2. DiagnosticSessionChunk: compressed NDJSON capture chunks flushed by server */
/*      instances and client browsers during a diagnostic session. */
/*   3. DiagnosticBundle: assembled .mjdiag diagnostic bundles (both locally built */
/*      bundles and external bundles received via MJAPI intake) with manifest, */
/*      scrubbing report, automated findings, and MJStorage link. */
/*   4. DiagnosticSenderRegistration: an installation that is allowed to send diagnostic */
/*      bundles to this collector, with its enrollment state, signing public key, */
/*      one-time registration code hash, and daily bundle quota. */
/* Conventions (migrations/CLAUDE.md): */
/*   - Plain DDL + sp_addextendedproperty only (no existence guards). */
/*   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted; */
/*     CodeGen generates them. */
/*   - PostgreSQL counterpart is deferred to the release build engineer. */
/* ===================================================================================== */
/* ------------------------------------------------------------------------------------- */
/* 1. DiagnosticSession */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."DiagnosticSession" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(255) NOT NULL,
  "Reason" TEXT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "ScopeType" VARCHAR(30) NOT NULL DEFAULT (
    'Users'
  ),
  "ScopeJSON" TEXT NULL,
  "Level" VARCHAR(20) NOT NULL DEFAULT (
    'Standard'
  ),
  "CategoriesJSON" TEXT NULL,
  "ScrubLiterals" BOOLEAN NOT NULL DEFAULT FALSE,
  "StartedAt" TIMESTAMPTZ NOT NULL DEFAULT (
    NOW()
  ),
  "EndsAt" TIMESTAMPTZ NOT NULL,
  "StoppedAt" TIMESTAMPTZ NULL,
  "MaxBytes" BIGINT NOT NULL DEFAULT (
    52428800
  ),
  "CreatedByUserID" UUID NOT NULL,
  "CompanyID" UUID NULL,
  CONSTRAINT "PK_DiagnosticSession" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_DiagnosticSession_CreatedByUser" FOREIGN KEY ("CreatedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_DiagnosticSession_Company" FOREIGN KEY ("CompanyID") REFERENCES __mj."Company" (
    "ID"
  ),
  CONSTRAINT "CK_DiagnosticSession_Status" CHECK ("Status" IN ('Active', 'Stopped', 'Expired')),
  CONSTRAINT "CK_DiagnosticSession_ScopeType" CHECK ("ScopeType" IN ('Users', 'APIKeys', 'Operations', 'BrowserSession', 'Instance')),
  CONSTRAINT "CK_DiagnosticSession_Level" CHECK ("Level" IN ('Standard', 'Verbose', 'Debug'))
);

/* ------------------------------------------------------------------------------------- */
/* 2. DiagnosticSessionChunk */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."DiagnosticSessionChunk" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "DiagnosticSessionID" UUID NOT NULL,
  "Source" VARCHAR(20) NOT NULL,
  "HostInstanceLabel" VARCHAR(255) NOT NULL,
  "Sequence" INT NOT NULL,
  "ContentKind" VARCHAR(30) NOT NULL,
  "Data" BYTEA NOT NULL,
  "EntryCount" INT NOT NULL DEFAULT (
    0
  ),
  "FirstEntryAt" TIMESTAMPTZ NULL,
  "LastEntryAt" TIMESTAMPTZ NULL,
  CONSTRAINT "PK_DiagnosticSessionChunk" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_DiagnosticSessionChunk_DiagnosticSession" FOREIGN KEY ("DiagnosticSessionID") REFERENCES __mj."DiagnosticSession" (
    "ID"
  ) ON DELETE CASCADE,
  CONSTRAINT "UQ_DiagnosticSessionChunk_Session_Source_Host_Kind_Seq" UNIQUE (
    "DiagnosticSessionID",
    "Source",
    "HostInstanceLabel",
    "ContentKind",
    "Sequence"
  ),
  CONSTRAINT "CK_DiagnosticSessionChunk_Source" CHECK ("Source" IN ('Server', 'Client')),
  CONSTRAINT "CK_DiagnosticSessionChunk_ContentKind" CHECK ("ContentKind" IN (
    'Logs',
    'Errors',
    'Spans',
    'SQL',
    'Network',
    'Timeline',
    'Telemetry',
    'Health',
    'App'
  ))
);

/* ------------------------------------------------------------------------------------- */
/* 3. DiagnosticBundle */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."DiagnosticBundle" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "Direction" VARCHAR(20) NOT NULL DEFAULT (
    'Local'
  ),
  "DiagnosticSessionID" UUID NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Building'
  ),
  "ScrubLiterals" BOOLEAN NOT NULL DEFAULT FALSE,
  "WindowStart" TIMESTAMPTZ NULL,
  "WindowEnd" TIMESTAMPTZ NULL,
  "FileID" UUID NULL,
  "Data" BYTEA NULL,
  "SizeBytes" BIGINT NOT NULL DEFAULT (
    0
  ),
  "SHA256" CHAR(64) NULL,
  "ManifestJSON" TEXT NULL,
  "ScrubReportJSON" TEXT NULL,
  "FindingsJSON" TEXT NULL,
  "FailureReason" TEXT NULL,
  "CreatedByUserID" UUID NULL,
  "ApprovedByUserID" UUID NULL,
  "ApprovedAt" TIMESTAMPTZ NULL,
  "Destination" VARCHAR(30) NULL,
  "SentAt" TIMESTAMPTZ NULL,
  "ExternalReferenceID" VARCHAR(255) NULL,
  "SenderInstallID" UUID NULL,
  "SenderMJVersion" VARCHAR(50) NULL,
  "ContactInfo" VARCHAR(500) NULL,
  "ExpiresAt" TIMESTAMPTZ NULL,
  "CompanyID" UUID NULL,
  CONSTRAINT "PK_DiagnosticBundle" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_DiagnosticBundle_DiagnosticSession" FOREIGN KEY ("DiagnosticSessionID") REFERENCES __mj."DiagnosticSession" (
    "ID"
  ) ON DELETE SET NULL,
  CONSTRAINT "FK_DiagnosticBundle_File" FOREIGN KEY ("FileID") REFERENCES __mj."File" (
    "ID"
  ) ON DELETE SET NULL,
  CONSTRAINT "FK_DiagnosticBundle_CreatedByUser" FOREIGN KEY ("CreatedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_DiagnosticBundle_ApprovedByUser" FOREIGN KEY ("ApprovedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_DiagnosticBundle_Company" FOREIGN KEY ("CompanyID") REFERENCES __mj."Company" (
    "ID"
  ),
  CONSTRAINT "CK_DiagnosticBundle_Direction" CHECK ("Direction" IN ('Local', 'Received')),
  CONSTRAINT "CK_DiagnosticBundle_Status" CHECK ("Status" IN ('Building', 'Receiving', 'Ready', 'Sending', 'Sent', 'Failed', 'Expired')),
  CONSTRAINT "CK_DiagnosticBundle_Destination" CHECK ("Destination" IN ('MJC', 'CustomerCollector', 'StorageAccount'))
);

/* ------------------------------------------------------------------------------------- */
/* 4. DiagnosticSenderRegistration */
/* ------------------------------------------------------------------------------------- */
CREATE TABLE __mj."DiagnosticSenderRegistration" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "InstallID" VARCHAR(100) NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Pending'
  ),
  "KeyAlgorithm" VARCHAR(20) NOT NULL DEFAULT (
    'Ed25519'
  ),
  "KeyID" VARCHAR(100) NULL,
  "PublicKeyBase64" VARCHAR(255) NULL,
  "RegistrationCodeHash" VARCHAR(128) NULL,
  "RegistrationCodeExpiresAt" TIMESTAMPTZ NULL,
  "EnrolledAt" TIMESTAMPTZ NULL,
  "RevokedAt" TIMESTAMPTZ NULL,
  "LastSeenAt" TIMESTAMPTZ NULL,
  "MaxBundlesPerDay" INT NOT NULL DEFAULT (
    20
  ),
  "Comments" TEXT NULL,
  CONSTRAINT "PK_DiagnosticSenderRegistration" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_DiagnosticSenderRegistration_InstallID" UNIQUE (
    "InstallID"
  ),
  CONSTRAINT "CK_DiagnosticSenderRegistration_Status" CHECK ("Status" IN ('Pending', 'Active', 'Revoked')),
  CONSTRAINT "CK_DiagnosticSenderRegistration_KeyAlgorithm" CHECK ("KeyAlgorithm" IN ('Ed25519'))
);

COMMENT ON TABLE __mj."DiagnosticSession" IS 'Bounded server and client diagnostic recording sessions with tenant isolation, scope targeting, and byte-budget controls.';

COMMENT ON COLUMN __mj."DiagnosticSession"."Name" IS 'Human-readable label for the diagnostic session.';

COMMENT ON COLUMN __mj."DiagnosticSession"."Reason" IS 'Optional explanation of why this diagnostic session was started (such as a ticket number or reproduction notes).';

COMMENT ON COLUMN __mj."DiagnosticSession"."Status" IS 'Current lifecycle status of the diagnostic session.';

COMMENT ON COLUMN __mj."DiagnosticSession"."ScopeType" IS 'Determines which incoming requests are matched and captured by this session.';

COMMENT ON COLUMN __mj."DiagnosticSession"."ScopeJSON" IS 'JSON specification of targeted UserIDs, APIKeyIDs, GraphQL/RemoteOperation names, or BrowserSessionID.';

COMMENT ON COLUMN __mj."DiagnosticSession"."Level" IS 'Capture verbosity level applied to requests matched by this session.';

COMMENT ON COLUMN __mj."DiagnosticSession"."CategoriesJSON" IS 'JSON array of diagnostic categories enabled for this session (e.g., Logs, SQL, Spans, Network, Telemetry).';

COMMENT ON COLUMN __mj."DiagnosticSession"."ScrubLiterals" IS 'When true, replaces inline SQL and filter string/number/UUID literals with ? placeholders in addition to mandatory credential scrubbing.';

COMMENT ON COLUMN __mj."DiagnosticSession"."StartedAt" IS 'UTC timestamp when the diagnostic session became active.';

COMMENT ON COLUMN __mj."DiagnosticSession"."EndsAt" IS 'UTC timestamp when the diagnostic session automatically expires.';

COMMENT ON COLUMN __mj."DiagnosticSession"."StoppedAt" IS 'UTC timestamp when the diagnostic session was manually stopped.';

COMMENT ON COLUMN __mj."DiagnosticSession"."MaxBytes" IS 'Maximum total compressed chunk bytes allowed for this session before capture stops (defaults to 50 MB).';

COMMENT ON COLUMN __mj."DiagnosticSession"."CreatedByUserID" IS 'User who initiated the diagnostic session.';

COMMENT ON COLUMN __mj."DiagnosticSession"."CompanyID" IS 'Optional tenant CompanyID isolating session capture in multi-tenant deployments.';

COMMENT ON TABLE __mj."DiagnosticSessionChunk" IS 'Compressed NDJSON capture chunks flushed by server instances and client browsers during a diagnostic session.';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."DiagnosticSessionID" IS 'Owning diagnostic session for this chunk.';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."Source" IS 'Origin tier that produced the chunk (Server or Client).';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."HostInstanceLabel" IS 'Process UUID, hostname, or browser tab identifier that flushed this chunk.';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."Sequence" IS 'Monotonically increasing sequence number per (DiagnosticSessionID, Source, HostInstanceLabel, ContentKind).';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."ContentKind" IS 'Type of diagnostic data stored in this chunk.';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."Data" IS 'DEFLATE/gzip compressed NDJSON or JSON payload (~256 KB max per chunk).';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."EntryCount" IS 'Number of records or events contained in this chunk.';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."FirstEntryAt" IS 'Timestamp of the earliest event in this chunk.';

COMMENT ON COLUMN __mj."DiagnosticSessionChunk"."LastEntryAt" IS 'Timestamp of the latest event in this chunk.';

COMMENT ON TABLE __mj."DiagnosticBundle" IS 'Assembled .mjdiag diagnostic bundles (both locally built bundles and external bundles received via MJAPI intake) with manifest, scrubbing report, automated findings, and MJStorage link.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."Name" IS 'Display name of the diagnostic bundle.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."Description" IS 'Optional description or summary notes attached to the bundle.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."Direction" IS 'Indicates whether this bundle was built locally on this instance (Local) or ingested via the MJAPI intake endpoint (Received).';

COMMENT ON COLUMN __mj."DiagnosticBundle"."DiagnosticSessionID" IS 'Source diagnostic session when built from a server session; NULL for client-only or received bundles.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."Status" IS 'Current lifecycle status of the diagnostic bundle.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ScrubLiterals" IS 'True when inline SQL and filter literals were normalized to ? placeholders in this bundle.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."WindowStart" IS 'Start of the time window covered by this bundle.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."WindowEnd" IS 'End of the time window covered by this bundle.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."FileID" IS 'Reference to MJ: Files when the bundle archive is persisted in MJStorage.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."Data" IS 'Fallback binary storage for the .mjdiag archive when no MJStorage account is configured.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."SizeBytes" IS 'Total size of the .mjdiag archive in bytes.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."SHA256" IS 'Hex-encoded SHA-256 digest of the unencrypted .mjdiag archive.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ManifestJSON" IS 'Parsed manifest.json contents including file inventory and SHA-256 digests.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ScrubReportJSON" IS 'Summary counts of credential tokens scrubbed and literals normalized across all bundle entries.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."FindingsJSON" IS 'Automated rules-engine diagnostic findings extracted from this bundle.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."FailureReason" IS 'Error details when Status is Failed (e.g., build error, send failure, or malware/structural verification rejection).';

COMMENT ON COLUMN __mj."DiagnosticBundle"."CreatedByUserID" IS 'User who built or uploaded this bundle; NULL for remotely ingested bundles.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ApprovedByUserID" IS 'Administrator who approved sending this bundle externally.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ApprovedAt" IS 'UTC timestamp when external transmission was approved.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."Destination" IS 'Target external destination when sending a bundle (MJC, CustomerCollector, or StorageAccount).';

COMMENT ON COLUMN __mj."DiagnosticBundle"."SentAt" IS 'UTC timestamp when the bundle was transmitted to Destination.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ExternalReferenceID" IS 'Reference ID returned by the receiving collector intake endpoint.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."SenderInstallID" IS 'InstallID of the sender instance when Direction = Received.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."SenderMJVersion" IS 'MemberJunction version reported by the sender instance when Direction = Received.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ContactInfo" IS 'Optional reporter or administrator contact information on received bundles.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."ExpiresAt" IS 'UTC timestamp when this bundle becomes eligible for automatic retention purge.';

COMMENT ON COLUMN __mj."DiagnosticBundle"."CompanyID" IS 'Optional tenant CompanyID scoping this diagnostic bundle.';

COMMENT ON TABLE __mj."DiagnosticSenderRegistration" IS 'An installation that is allowed to send diagnostic bundles to this collector. Holds its enrollment state, the public key that verifies its signed requests, the hash of its one-time registration code, and its daily bundle quota.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."ID" IS 'Unique identifier of the sender registration.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."InstallID" IS 'Installation ID of the sending MemberJunction instance. Unique per registration.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."Name" IS 'Display name of the customer or installation that sends the bundles.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."Status" IS 'Lifecycle status of the registration. Pending: created, waiting for the sender to enroll with its registration code. Active: enrolled, bundles are accepted. Revoked: bundles are refused.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."KeyAlgorithm" IS 'Signature algorithm of the sender public key.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."KeyID" IS 'Identifier of the sender signing key. Set at enrollment; a key rotation replaces it.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."PublicKeyBase64" IS 'Base64-encoded public key that verifies the sender signed requests. Set at enrollment.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."RegistrationCodeHash" IS 'SHA-256 hex digest of the one-time registration code. The plain code is never stored.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."RegistrationCodeExpiresAt" IS 'Time after which the one-time registration code can no longer be used to enroll.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."EnrolledAt" IS 'Time the sender enrolled its public key.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."RevokedAt" IS 'Time the registration was revoked.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."LastSeenAt" IS 'Time of the last authenticated request from the sender.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."MaxBundlesPerDay" IS 'Maximum number of bundles the collector accepts from this sender per day.';

COMMENT ON COLUMN __mj."DiagnosticSenderRegistration"."Comments" IS 'Free-form administrator notes about the registration.';

/* ============================================================================= */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND */
/* Output of `mj codegen` for DiagnosticSession, DiagnosticSessionChunk, */
/* DiagnosticBundle and DiagnosticSenderRegistration: Entity / EntityField / */
/* EntityFieldValue / EntityPermission / ApplicationEntity / EntityRelationship */
/* inserts, the __mj_CreatedAt / __mj_UpdatedAt columns and update triggers, */
/* FK indexes, base views, spCreate / spUpdate / spDelete procedures, permission */
/* grants, and field and entity settings. */
/* If the hand-written DDL above changes, re-run CodeGen and replace this section. */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Diagnostic Sessions */
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
    '133bf1fd-e4c0-410d-b847-39b3fd6fbc11',
    'MJ: Diagnostic Sessions',
    'Diagnostic Sessions',
    'Bounded server and client diagnostic recording sessions with tenant isolation, scope targeting, and byte-budget controls.',
    NULL,
    'DiagnosticSession',
    'vwDiagnosticSessions',
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
/* SQL generated to add entity MJ: Diagnostic Sessions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '133bf1fd-e4c0-410d-b847-39b3fd6fbc11',
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
/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role UI */
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
  CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS UUID),
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
      "EntityID" = CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Developer */
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
  CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS UUID),
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
      "EntityID" = CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Sessions for role Integration */
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
  CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS UUID),
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
      "EntityID" = CAST('133bf1fd-e4c0-410d-b847-39b3fd6fbc11' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Diagnostic Session Chunks */
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
    '95ae4a10-7d58-4d55-be27-5b934a958411',
    'MJ: Diagnostic Session Chunks',
    'Diagnostic Session Chunks',
    'Compressed NDJSON capture chunks flushed by server instances and client browsers during a diagnostic session.',
    NULL,
    'DiagnosticSessionChunk',
    'vwDiagnosticSessionChunks',
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
/* SQL generated to add entity MJ: Diagnostic Session Chunks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '95ae4a10-7d58-4d55-be27-5b934a958411',
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
/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role UI */
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
  CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS UUID),
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
      "EntityID" = CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Developer */
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
  CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS UUID),
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
      "EntityID" = CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Session Chunks for role Integration */
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
  CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS UUID),
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
      "EntityID" = CAST('95ae4a10-7d58-4d55-be27-5b934a958411' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Diagnostic Bundles */
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
    'a385086e-1147-4042-ae36-d808ce850ef9',
    'MJ: Diagnostic Bundles',
    'Diagnostic Bundles',
    'Assembled .mjdiag diagnostic bundles (both locally built bundles and external bundles received via MJAPI intake) with manifest, scrubbing report, automated findings, and MJStorage link.',
    NULL,
    'DiagnosticBundle',
    'vwDiagnosticBundles',
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
/* SQL generated to add entity MJ: Diagnostic Bundles to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'a385086e-1147-4042-ae36-d808ce850ef9',
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
/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role UI */
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
  CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS UUID),
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
      "EntityID" = CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Developer */
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
  CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS UUID),
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
      "EntityID" = CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Bundles for role Integration */
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
  CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS UUID),
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
      "EntityID" = CAST('a385086e-1147-4042-ae36-d808ce850ef9' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Diagnostic Sender Registrations */
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
    '0a75d64d-9396-4b77-871a-d88577f2ac4f',
    'MJ: Diagnostic Sender Registrations',
    'Diagnostic Sender Registrations',
    'An installation that is allowed to send diagnostic bundles to this collector. Holds its enrollment state, the public key that verifies its signed requests, the hash of its one-time registration code, and its daily bundle quota.',
    NULL,
    'DiagnosticSenderRegistration',
    'vwDiagnosticSenderRegistrations',
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
/* SQL generated to add entity MJ: Diagnostic Sender Registrations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '0a75d64d-9396-4b77-871a-d88577f2ac4f',
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
/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role UI */
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
  CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS UUID),
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
      "EntityID" = CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Developer */
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
  CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS UUID),
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
      "EntityID" = CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Diagnostic Sender Registrations for role Integration */
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
  CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS UUID),
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
      "EntityID" = CAST('0a75d64d-9396-4b77-871a-d88577f2ac4f' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."DiagnosticSession"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticSession */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticSession */
UPDATE __mj."DiagnosticSession" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticSession' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticSession" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticSession" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."DiagnosticSession"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticSession */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticSession */
UPDATE __mj."DiagnosticSession" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticSession' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticSession" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticSession" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."DiagnosticSessionChunk"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticSessionChunk */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticSessionChunk */
UPDATE __mj."DiagnosticSessionChunk" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticSessionChunk' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticSessionChunk" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticSessionChunk" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."DiagnosticSessionChunk"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticSessionChunk */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticSessionChunk */
UPDATE __mj."DiagnosticSessionChunk" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticSessionChunk' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticSessionChunk" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticSessionChunk" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."DiagnosticBundle"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticBundle */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticBundle */
UPDATE __mj."DiagnosticBundle" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticBundle' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticBundle" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticBundle" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."DiagnosticBundle"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticBundle */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticBundle */
UPDATE __mj."DiagnosticBundle" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticBundle' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticBundle" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticBundle" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."DiagnosticSenderRegistration"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticSenderRegistration */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.DiagnosticSenderRegistration */
UPDATE __mj."DiagnosticSenderRegistration" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticSenderRegistration' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticSenderRegistration" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticSenderRegistration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."DiagnosticSenderRegistration"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticSenderRegistration */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.DiagnosticSenderRegistration */
UPDATE __mj."DiagnosticSenderRegistration" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'DiagnosticSenderRegistration' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."DiagnosticSenderRegistration" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."DiagnosticSenderRegistration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d73cd9a-ebd5-4c84-ad04-730de04bcee4' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6d73cd9a-ebd5-4c84-ad04-730de04bcee4', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '10bacf04-9a95-4b35-8f0b-34d70fb2fc19' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('10bacf04-9a95-4b35-8f0b-34d70fb2fc19', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'Name', 'Name', 'Human-readable label for the diagnostic session.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ed4bec44-fd27-4123-9596-febd77edae75' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'Reason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ed4bec44-fd27-4123-9596-febd77edae75', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'Reason', 'Reason', 'Optional explanation of why this diagnostic session was started (such as a ticket number or reproduction notes).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '14b54bf3-b16f-477e-aa04-f88e58a6b6f3' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('14b54bf3-b16f-477e-aa04-f88e58a6b6f3', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'Status', 'Status', 'Current lifecycle status of the diagnostic session.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0906db6-1d69-4c67-b552-812e12345344' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'ScopeType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0906db6-1d69-4c67-b552-812e12345344', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'ScopeType', 'Scope Type', 'Determines which incoming requests are matched and captured by this session.', 'nvarchar', 60, 0, 0, FALSE, 'Users', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '35265cae-ec4b-4a65-974b-a55af93e3a9f' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'ScopeJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('35265cae-ec4b-4a65-974b-a55af93e3a9f', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'ScopeJSON', 'Scope JSON', 'JSON specification of targeted UserIDs, APIKeyIDs, GraphQL/RemoteOperation names, or BrowserSessionID.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83f35dfd-93ed-412a-83c1-66ce415c1e50' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'Level')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('83f35dfd-93ed-412a-83c1-66ce415c1e50', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'Level', 'Level', 'Capture verbosity level applied to requests matched by this session.', 'nvarchar', 40, 0, 0, FALSE, 'Standard', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cfecff5d-2dc3-4155-8033-4b8da1292598' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'CategoriesJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cfecff5d-2dc3-4155-8033-4b8da1292598', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'CategoriesJSON', 'Categories JSON', 'JSON array of diagnostic categories enabled for this session (e.g., Logs, SQL, Spans, Network, Telemetry).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9dd51870-8edf-441d-91a4-fcedd9d0612b' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'ScrubLiterals')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9dd51870-8edf-441d-91a4-fcedd9d0612b', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'ScrubLiterals', 'Scrub Literals', 'When true, replaces inline SQL and filter string/number/UUID literals with ? placeholders in addition to mandatory credential scrubbing.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1811ddd3-1e6c-4338-8148-21ac96f09bc3' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'StartedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1811ddd3-1e6c-4338-8148-21ac96f09bc3', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'StartedAt', 'Started At', 'UTC timestamp when the diagnostic session became active.', 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f377b211-e2e0-4ce7-9069-9620f2d48e05' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'EndsAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f377b211-e2e0-4ce7-9069-9620f2d48e05', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'EndsAt', 'Ends At', 'UTC timestamp when the diagnostic session automatically expires.', 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '433ad27e-71a6-4f6b-854d-55a8789599c1' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'StoppedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('433ad27e-71a6-4f6b-854d-55a8789599c1', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'StoppedAt', 'Stopped At', 'UTC timestamp when the diagnostic session was manually stopped.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a13aeb63-1d12-4275-8140-e9d31a13b882' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'MaxBytes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a13aeb63-1d12-4275-8140-e9d31a13b882', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'MaxBytes', 'Max Bytes', 'Maximum total compressed chunk bytes allowed for this session before capture stops (defaults to 50 MB).', 'bigint', 8, 19, 0, FALSE, '(52428800)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8cf0e0d5-f3d2-4f64-b7a4-01f66e1333f7' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'CreatedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8cf0e0d5-f3d2-4f64-b7a4-01f66e1333f7', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'CreatedByUserID', 'Created By User ID', 'User who initiated the diagnostic session.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4edf3600-acea-410d-8014-294ced366562' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'CompanyID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4edf3600-acea-410d-8014-294ced366562', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'CompanyID', 'Company ID', 'Optional tenant CompanyID isolating session capture in multi-tenant deployments.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0720a793-474d-463f-ab4d-7e9a6a2ff9f9' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0720a793-474d-463f-ab4d-7e9a6a2ff9f9', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '720a573e-634c-4a6e-8915-3d41716cffd9' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('720a573e-634c-4a6e-8915-3d41716cffd9', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3e60710-4797-459e-8f8e-7ac8b18e1e3d' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3e60710-4797-459e-8f8e-7ac8b18e1e3d', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c9534e2-bf0c-4062-a9c5-462a98d688a5' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'DiagnosticSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3c9534e2-bf0c-4062-a9c5-462a98d688a5', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'DiagnosticSessionID', 'Diagnostic Session ID', 'Owning diagnostic session for this chunk.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '65f25294-38fe-4962-ae82-e79654deb7ab' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'Source')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('65f25294-38fe-4962-ae82-e79654deb7ab', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'Source', 'Source', 'Origin tier that produced the chunk (Server or Client).', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1829e0ec-705c-4b0a-aeaa-6229a57d18a9' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'HostInstanceLabel')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1829e0ec-705c-4b0a-aeaa-6229a57d18a9', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'HostInstanceLabel', 'Host Instance Label', 'Process UUID, hostname, or browser tab identifier that flushed this chunk.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ff87845-c451-4511-837b-3a4571fd4889' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ff87845-c451-4511-837b-3a4571fd4889', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'Sequence', 'Sequence', 'Monotonically increasing sequence number per (DiagnosticSessionID, Source, HostInstanceLabel, ContentKind).', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd78c8c45-20c6-461a-a5f9-89f1538caa0f' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'ContentKind')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d78c8c45-20c6-461a-a5f9-89f1538caa0f', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'ContentKind', 'Content Kind', 'Type of diagnostic data stored in this chunk.', 'nvarchar', 60, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '583d39d5-8db1-4367-a310-9ad3efa46332' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'Data')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('583d39d5-8db1-4367-a310-9ad3efa46332', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'Data', 'Data', 'DEFLATE/gzip compressed NDJSON or JSON payload (~256 KB max per chunk).', 'varbinary', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '79ad6a5b-7fd9-44cd-adf9-619c0d5c8c7d' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'EntryCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('79ad6a5b-7fd9-44cd-adf9-619c0d5c8c7d', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'EntryCount', 'Entry Count', 'Number of records or events contained in this chunk.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '66aee3db-eb2f-48d1-b3e9-22a23ac77fcb' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'FirstEntryAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('66aee3db-eb2f-48d1-b3e9-22a23ac77fcb', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'FirstEntryAt', 'First Entry At', 'Timestamp of the earliest event in this chunk.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d54251c-1f94-492b-9d41-165ec8fa607c' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'LastEntryAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9d54251c-1f94-492b-9d41-165ec8fa607c', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'LastEntryAt', 'Last Entry At', 'Timestamp of the latest event in this chunk.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b8051f5e-d175-4a1b-b838-902bca34700d' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b8051f5e-d175-4a1b-b838-902bca34700d', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '84d272e8-9cee-4bc2-91d0-e07959e3b5ba' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('84d272e8-9cee-4bc2-91d0-e07959e3b5ba', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'edd96485-ab7f-4b90-b8b0-0ff89f5ce083' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('edd96485-ab7f-4b90-b8b0-0ff89f5ce083', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0b1302d6-9ec4-44d1-a37a-990917da383d' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b1302d6-9ec4-44d1-a37a-990917da383d', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'Name', 'Name', 'Display name of the diagnostic bundle.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8bb008bf-de67-444d-9c70-f6ca72ce1e5f' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8bb008bf-de67-444d-9c70-f6ca72ce1e5f', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'Description', 'Description', 'Optional description or summary notes attached to the bundle.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '329f06fc-164a-44ca-9a37-6db686e80dc9' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'Direction')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('329f06fc-164a-44ca-9a37-6db686e80dc9', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'Direction', 'Direction', 'Indicates whether this bundle was built locally on this instance (Local) or ingested via the MJAPI intake endpoint (Received).', 'nvarchar', 40, 0, 0, FALSE, 'Local', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1b866d87-8bd5-4797-8bd6-a7b82208960e' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'DiagnosticSessionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1b866d87-8bd5-4797-8bd6-a7b82208960e', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'DiagnosticSessionID', 'Diagnostic Session ID', 'Source diagnostic session when built from a server session; NULL for client-only or received bundles.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b3e39419-3f28-487f-8e96-b787a316ae23' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3e39419-3f28-487f-8e96-b787a316ae23', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'Status', 'Status', 'Current lifecycle status of the diagnostic bundle.', 'nvarchar', 40, 0, 0, FALSE, 'Building', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03f204c7-74b8-4567-b4e7-8daad2ae52f6' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ScrubLiterals')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03f204c7-74b8-4567-b4e7-8daad2ae52f6', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ScrubLiterals', 'Scrub Literals', 'True when inline SQL and filter literals were normalized to ? placeholders in this bundle.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5e30689f-da96-490f-8d50-19e9ce98ea06' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'WindowStart')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5e30689f-da96-490f-8d50-19e9ce98ea06', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'WindowStart', 'Window Start', 'Start of the time window covered by this bundle.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b0845fb-9964-49e8-b814-134de5842026' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'WindowEnd')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b0845fb-9964-49e8-b814-134de5842026', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'WindowEnd', 'Window End', 'End of the time window covered by this bundle.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9aa2c46a-16e0-4233-871e-9ffcce400acb' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'FileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9aa2c46a-16e0-4233-871e-9ffcce400acb', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'FileID', 'File ID', 'Reference to MJ: Files when the bundle archive is persisted in MJStorage.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c66bbb4a-991e-448a-83b0-c977d59ddced' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'Data')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c66bbb4a-991e-448a-83b0-c977d59ddced', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'Data', 'Data', 'Fallback binary storage for the .mjdiag archive when no MJStorage account is configured.', 'varbinary', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '008be4d2-d5da-4d58-9c59-c2d0ea75c1a2' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'SizeBytes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('008be4d2-d5da-4d58-9c59-c2d0ea75c1a2', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'SizeBytes', 'Size Bytes', 'Total size of the .mjdiag archive in bytes.', 'bigint', 8, 19, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1103f8ce-c48c-4fe3-ae05-ead4e4516347' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'SHA256')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1103f8ce-c48c-4fe3-ae05-ead4e4516347', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'SHA256', 'Sha 256', 'Hex-encoded SHA-256 digest of the unencrypted .mjdiag archive.', 'nchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '12ddb9b2-bb41-4a3b-8bb8-cea9fc7d6e68' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ManifestJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('12ddb9b2-bb41-4a3b-8bb8-cea9fc7d6e68', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ManifestJSON', 'Manifest JSON', 'Parsed manifest.json contents including file inventory and SHA-256 digests.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'be34ef65-dd3f-4631-944f-18126e0dec06' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ScrubReportJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('be34ef65-dd3f-4631-944f-18126e0dec06', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ScrubReportJSON', 'Scrub Report JSON', 'Summary counts of credential tokens scrubbed and literals normalized across all bundle entries.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad7dd548-3a48-40b8-843e-16dafe4af6c4' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'FindingsJSON')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad7dd548-3a48-40b8-843e-16dafe4af6c4', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'FindingsJSON', 'Findings JSON', 'Automated rules-engine diagnostic findings extracted from this bundle.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '058765e6-dd09-484f-822e-b466d681e801' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'FailureReason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('058765e6-dd09-484f-822e-b466d681e801', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'FailureReason', 'Failure Reason', 'Error details when Status is Failed (e.g., build error, send failure, or malware/structural verification rejection).', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '601f1c45-a56c-4ccd-9a29-efc6a7fee5c4' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'CreatedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('601f1c45-a56c-4ccd-9a29-efc6a7fee5c4', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'CreatedByUserID', 'Created By User ID', 'User who built or uploaded this bundle; NULL for remotely ingested bundles.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '999005e6-4821-443f-bb77-e06fe89d87d6' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ApprovedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('999005e6-4821-443f-bb77-e06fe89d87d6', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ApprovedByUserID', 'Approved By User ID', 'Administrator who approved sending this bundle externally.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '374efb56-ca0c-464c-b67f-f63bf4fc71b8' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ApprovedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('374efb56-ca0c-464c-b67f-f63bf4fc71b8', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ApprovedAt', 'Approved At', 'UTC timestamp when external transmission was approved.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5486f090-0c0f-4312-ab17-2109820f6866' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'Destination')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5486f090-0c0f-4312-ab17-2109820f6866', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'Destination', 'Destination', 'Target external destination when sending a bundle (MJC, CustomerCollector, or StorageAccount).', 'nvarchar', 60, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c6a6729a-6922-4977-97f5-2eb4b9471308' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'SentAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c6a6729a-6922-4977-97f5-2eb4b9471308', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'SentAt', 'Sent At', 'UTC timestamp when the bundle was transmitted to Destination.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6c7bdfed-2462-45fd-9022-6ffe9b9369ba' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ExternalReferenceID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6c7bdfed-2462-45fd-9022-6ffe9b9369ba', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ExternalReferenceID', 'External Reference ID', 'Reference ID returned by the receiving collector intake endpoint.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e864c1fe-6e5b-4fd7-982a-6d0ec2083c49' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'SenderInstallID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e864c1fe-6e5b-4fd7-982a-6d0ec2083c49', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'SenderInstallID', 'Sender Install ID', 'InstallID of the sender instance when Direction = Received.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c10c0183-8895-4cea-aff0-c2b993772bd0' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'SenderMJVersion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c10c0183-8895-4cea-aff0-c2b993772bd0', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'SenderMJVersion', 'Sender MJ Version', 'MemberJunction version reported by the sender instance when Direction = Received.', 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0d61de7d-c46e-45fc-bf04-29d295d55aec' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ContactInfo')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0d61de7d-c46e-45fc-bf04-29d295d55aec', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ContactInfo', 'Contact Info', 'Optional reporter or administrator contact information on received bundles.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bc31da3a-499b-4c7c-b0c9-bf8cf37c25de' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ExpiresAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bc31da3a-499b-4c7c-b0c9-bf8cf37c25de', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ExpiresAt', 'Expires At', 'UTC timestamp when this bundle becomes eligible for automatic retention purge.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '928b0221-2753-412e-97c8-58998662fb3b' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'CompanyID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('928b0221-2753-412e-97c8-58998662fb3b', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'CompanyID', 'Company ID', 'Optional tenant CompanyID scoping this diagnostic bundle.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c987f153-54f3-492f-bd74-8b1851199237' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c987f153-54f3-492f-bd74-8b1851199237', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '23d783e5-25d1-48f6-9960-2802038ae3fb' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('23d783e5-25d1-48f6-9960-2802038ae3fb', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9ba99562-5bcc-4f2a-a4c5-29f35efbd7fc' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9ba99562-5bcc-4f2a-a4c5-29f35efbd7fc', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'ID', 'ID', 'Unique identifier of the sender registration.', 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f6e61a2e-1d12-4f53-bf96-f610f619baf4' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'InstallID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f6e61a2e-1d12-4f53-bf96-f610f619baf4', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'InstallID', 'Install ID', 'Installation ID of the sending MemberJunction instance. Unique per registration.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3ac7ba3c-7bba-4fd2-8ae0-a60b8d1eb1c6' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3ac7ba3c-7bba-4fd2-8ae0-a60b8d1eb1c6', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'Name', 'Name', 'Display name of the customer or installation that sends the bundles.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7d1b5770-11ed-494b-8014-9940ccb6930f' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7d1b5770-11ed-494b-8014-9940ccb6930f', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'Status', 'Status', 'Lifecycle status of the registration. Pending: created, waiting for the sender to enroll with its registration code. Active: enrolled, bundles are accepted. Revoked: bundles are refused.', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ca639f48-0665-4b2d-ab83-6709ff9057a3' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'KeyAlgorithm')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ca639f48-0665-4b2d-ab83-6709ff9057a3', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'KeyAlgorithm', 'Key Algorithm', 'Signature algorithm of the sender public key.', 'nvarchar', 40, 0, 0, FALSE, 'Ed25519', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c25ba215-389e-46e8-9050-a44bfc676de5' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'KeyID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c25ba215-389e-46e8-9050-a44bfc676de5', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'KeyID', 'Key ID', 'Identifier of the sender signing key. Set at enrollment; a key rotation replaces it.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b796135f-273b-45bf-8329-65fc9de0ff2e' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'PublicKeyBase64')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b796135f-273b-45bf-8329-65fc9de0ff2e', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'PublicKeyBase64', 'Public Key Base 64', 'Base64-encoded public key that verifies the sender signed requests. Set at enrollment.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e9c4c14e-11ca-494e-a2b4-6513b2b3881c' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'RegistrationCodeHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e9c4c14e-11ca-494e-a2b4-6513b2b3881c', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'RegistrationCodeHash', 'Registration Code Hash', 'SHA-256 hex digest of the one-time registration code. The plain code is never stored.', 'nvarchar', 256, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3fc72eb4-086c-4219-a913-6dfe9f8cf7ec' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'RegistrationCodeExpiresAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3fc72eb4-086c-4219-a913-6dfe9f8cf7ec', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'RegistrationCodeExpiresAt', 'Registration Code Expires At', 'Time after which the one-time registration code can no longer be used to enroll.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7263a223-577a-4f6e-a3a4-36ba4770152a' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'EnrolledAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7263a223-577a-4f6e-a3a4-36ba4770152a', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'EnrolledAt', 'Enrolled At', 'Time the sender enrolled its public key.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ad087aed-aebf-48bc-9182-fac5db00b418' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'RevokedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ad087aed-aebf-48bc-9182-fac5db00b418', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'RevokedAt', 'Revoked At', 'Time the registration was revoked.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b2d6fa3e-a824-4b66-b34c-fbdd2d9e60ae' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'LastSeenAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b2d6fa3e-a824-4b66-b34c-fbdd2d9e60ae', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'LastSeenAt', 'Last Seen At', 'Time of the last authenticated request from the sender.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3b129ac5-3331-4388-8d98-ae433a401f7a' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'MaxBundlesPerDay')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3b129ac5-3331-4388-8d98-ae433a401f7a', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'MaxBundlesPerDay', 'Max Bundles Per Day', 'Maximum number of bundles the collector accepts from this sender per day.', 'int', 4, 10, 0, FALSE, '(20)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58b59bb2-ba98-44da-a5ad-fea5aa67a9f2' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'Comments')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58b59bb2-ba98-44da-a5ad-fea5aa67a9f2', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), 'Comments', 'Comments', 'Free-form administrator notes about the registration.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8616eaba-06ea-4daa-a3f8-4e4b053bc0e9' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8616eaba-06ea-4daa-a3f8-4e4b053bc0e9', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '95972272-7d48-47b5-9c16-0b37d36c85aa' OR ("EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('95972272-7d48-47b5-9c16-0b37d36c85aa', '0A75D64D-9396-4B77-871A-D88577F2AC4F' /* Entity: MJ: Diagnostic Sender Registrations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID fa9b4f3d-3b7f-4d42-9c9c-b2cc4fa8206a */
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
    'fa9b4f3d-3b7f-4d42-9c9c-b2cc4fa8206a',
    '14B54BF3-B16F-477E-AA04-F88E58A6B6F3',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c334c9c8-a008-4303-884a-91c949ad51de */
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
    'c334c9c8-a008-4303-884a-91c949ad51de',
    '14B54BF3-B16F-477E-AA04-F88E58A6B6F3',
    2,
    'Expired',
    'Expired',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b8bd7d4b-a79a-4ae1-b670-4696c51facd7 */
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
    'b8bd7d4b-a79a-4ae1-b670-4696c51facd7',
    '14B54BF3-B16F-477E-AA04-F88E58A6B6F3',
    3,
    'Stopped',
    'Stopped',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 14B54BF3-B16F-477E-AA04-F88E58A6B6F3 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '14B54BF3-B16F-477E-AA04-F88E58A6B6F3';
/* SQL text to insert entity field value with ID 08196d40-2772-417a-a3e2-50eae4be3ab8 */
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
    '08196d40-2772-417a-a3e2-50eae4be3ab8',
    'A0906DB6-1D69-4C67-B552-812E12345344',
    1,
    'APIKeys',
    'APIKeys',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 866bf4b6-e741-44f9-a478-63d62cda05e2 */
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
    '866bf4b6-e741-44f9-a478-63d62cda05e2',
    'A0906DB6-1D69-4C67-B552-812E12345344',
    2,
    'BrowserSession',
    'BrowserSession',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f382726b-e420-47b7-9eae-36f11df6ba3d */
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
    'f382726b-e420-47b7-9eae-36f11df6ba3d',
    'A0906DB6-1D69-4C67-B552-812E12345344',
    3,
    'Instance',
    'Instance',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID d11d88e3-1685-42ad-915b-fe86d9f2c3ce */
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
    'd11d88e3-1685-42ad-915b-fe86d9f2c3ce',
    'A0906DB6-1D69-4C67-B552-812E12345344',
    4,
    'Operations',
    'Operations',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 43e07a67-40ee-45df-9f4b-0bdb7c9220c1 */
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
    '43e07a67-40ee-45df-9f4b-0bdb7c9220c1',
    'A0906DB6-1D69-4C67-B552-812E12345344',
    5,
    'Users',
    'Users',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID A0906DB6-1D69-4C67-B552-812E12345344 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'A0906DB6-1D69-4C67-B552-812E12345344';
/* SQL text to insert entity field value with ID 36356b74-9150-4629-bb58-b707ba60e0b9 */
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
    '36356b74-9150-4629-bb58-b707ba60e0b9',
    '83F35DFD-93ED-412A-83C1-66CE415C1E50',
    1,
    'Debug',
    'Debug',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a2a90b3c-cd9c-4a9a-9b6c-0dfd28286775 */
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
    'a2a90b3c-cd9c-4a9a-9b6c-0dfd28286775',
    '83F35DFD-93ED-412A-83C1-66CE415C1E50',
    2,
    'Standard',
    'Standard',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 57f808ed-4e86-4ac4-a647-98c2f931c1a8 */
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
    '57f808ed-4e86-4ac4-a647-98c2f931c1a8',
    '83F35DFD-93ED-412A-83C1-66CE415C1E50',
    3,
    'Verbose',
    'Verbose',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 83F35DFD-93ED-412A-83C1-66CE415C1E50 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '83F35DFD-93ED-412A-83C1-66CE415C1E50';
/* SQL text to insert entity field value with ID 2a008b14-d412-431f-8837-1aac64c67814 */
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
    '2a008b14-d412-431f-8837-1aac64c67814',
    '65F25294-38FE-4962-AE82-E79654DEB7AB',
    1,
    'Client',
    'Client',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b6b86892-e802-460c-98bf-389ccee20140 */
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
    'b6b86892-e802-460c-98bf-389ccee20140',
    '65F25294-38FE-4962-AE82-E79654DEB7AB',
    2,
    'Server',
    'Server',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 65F25294-38FE-4962-AE82-E79654DEB7AB */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '65F25294-38FE-4962-AE82-E79654DEB7AB';
/* SQL text to insert entity field value with ID 928f9c34-eef0-4e50-86b8-4d200fa9fb52 */
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
    '928f9c34-eef0-4e50-86b8-4d200fa9fb52',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    1,
    'App',
    'App',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 865b8c18-4038-47d5-bb7b-effcda6646c7 */
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
    '865b8c18-4038-47d5-bb7b-effcda6646c7',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    2,
    'Errors',
    'Errors',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bdec08a6-9e7e-4fec-a322-751b4472a990 */
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
    'bdec08a6-9e7e-4fec-a322-751b4472a990',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    3,
    'Health',
    'Health',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5b53e7e2-70a4-4917-8daf-de5c83f5a2c2 */
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
    '5b53e7e2-70a4-4917-8daf-de5c83f5a2c2',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    4,
    'Logs',
    'Logs',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 496d2fee-cf2f-493b-8e51-cc46a4902ec1 */
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
    '496d2fee-cf2f-493b-8e51-cc46a4902ec1',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    5,
    'Network',
    'Network',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 929eff0d-fba9-45ff-b7df-35f618845df6 */
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
    '929eff0d-fba9-45ff-b7df-35f618845df6',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    6,
    'SQL',
    'SQL',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 37244f1d-91d9-4be1-8685-07fcc4fd6123 */
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
    '37244f1d-91d9-4be1-8685-07fcc4fd6123',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    7,
    'Spans',
    'Spans',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 911be4fb-2614-42fd-b61b-799bb16d22a9 */
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
    '911be4fb-2614-42fd-b61b-799bb16d22a9',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    8,
    'Telemetry',
    'Telemetry',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 43d71475-ee3e-405e-8718-09f9b60b7416 */
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
    '43d71475-ee3e-405e-8718-09f9b60b7416',
    'D78C8C45-20C6-461A-A5F9-89F1538CAA0F',
    9,
    'Timeline',
    'Timeline',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID D78C8C45-20C6-461A-A5F9-89F1538CAA0F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F';
/* SQL text to insert entity field value with ID 65edb92c-4f63-40d2-919d-22b6beaabb48 */
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
    '65edb92c-4f63-40d2-919d-22b6beaabb48',
    '329F06FC-164A-44CA-9A37-6DB686E80DC9',
    1,
    'Local',
    'Local',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5077c25c-5f66-44f2-9e72-1d212801605f */
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
    '5077c25c-5f66-44f2-9e72-1d212801605f',
    '329F06FC-164A-44CA-9A37-6DB686E80DC9',
    2,
    'Received',
    'Received',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 329F06FC-164A-44CA-9A37-6DB686E80DC9 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '329F06FC-164A-44CA-9A37-6DB686E80DC9';
/* SQL text to insert entity field value with ID 1e025bc8-7a89-4de1-b607-5df2b2c69416 */
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
    '1e025bc8-7a89-4de1-b607-5df2b2c69416',
    'B3E39419-3F28-487F-8E96-B787A316AE23',
    1,
    'Building',
    'Building',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 038f8158-6566-4a22-a7f0-cfc46757474b */
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
    '038f8158-6566-4a22-a7f0-cfc46757474b',
    'B3E39419-3F28-487F-8E96-B787A316AE23',
    2,
    'Expired',
    'Expired',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8d1a72ee-f84a-4819-8b34-c4ec156725e0 */
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
    '8d1a72ee-f84a-4819-8b34-c4ec156725e0',
    'B3E39419-3F28-487F-8E96-B787A316AE23',
    3,
    'Failed',
    'Failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 299b18f0-4208-4662-999a-6583e84a19ed */
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
    '299b18f0-4208-4662-999a-6583e84a19ed',
    'B3E39419-3F28-487F-8E96-B787A316AE23',
    4,
    'Ready',
    'Ready',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 77aca5e3-79f1-4ede-81a4-7b5c9a3145cb */
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
    '77aca5e3-79f1-4ede-81a4-7b5c9a3145cb',
    'B3E39419-3F28-487F-8E96-B787A316AE23',
    5,
    'Receiving',
    'Receiving',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 58a49e58-7b31-4256-bfc7-f49770f5dbf6 */
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
    '58a49e58-7b31-4256-bfc7-f49770f5dbf6',
    'B3E39419-3F28-487F-8E96-B787A316AE23',
    6,
    'Sending',
    'Sending',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a95cd2f7-cc5d-44ce-8ded-e1ebb0a7dda1 */
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
    'a95cd2f7-cc5d-44ce-8ded-e1ebb0a7dda1',
    'B3E39419-3F28-487F-8E96-B787A316AE23',
    7,
    'Sent',
    'Sent',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B3E39419-3F28-487F-8E96-B787A316AE23 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B3E39419-3F28-487F-8E96-B787A316AE23';
/* SQL text to insert entity field value with ID 26554521-cdb8-4096-af82-3b6ab8fc8dd1 */
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
    '26554521-cdb8-4096-af82-3b6ab8fc8dd1',
    '5486F090-0C0F-4312-AB17-2109820F6866',
    1,
    'CustomerCollector',
    'CustomerCollector',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e419aa4e-e490-4523-a298-04a4b3ef90f7 */
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
    'e419aa4e-e490-4523-a298-04a4b3ef90f7',
    '5486F090-0C0F-4312-AB17-2109820F6866',
    2,
    'MJC',
    'MJC',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 34e4da0d-e1b4-4567-9197-94e42ea407ac */
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
    '34e4da0d-e1b4-4567-9197-94e42ea407ac',
    '5486F090-0C0F-4312-AB17-2109820F6866',
    3,
    'StorageAccount',
    'StorageAccount',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 5486F090-0C0F-4312-AB17-2109820F6866 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '5486F090-0C0F-4312-AB17-2109820F6866';
/* SQL text to insert entity field value with ID b7d78e1c-bb00-4dbd-80f6-dde17c5d7263 */
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
    'b7d78e1c-bb00-4dbd-80f6-dde17c5d7263',
    '7D1B5770-11ED-494B-8014-9940CCB6930F',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a9d2768c-e40a-4c2d-8219-89e6ed4cc138 */
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
    'a9d2768c-e40a-4c2d-8219-89e6ed4cc138',
    '7D1B5770-11ED-494B-8014-9940CCB6930F',
    2,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6c179a01-3c58-4e96-97c7-23c64b6154ae */
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
    '6c179a01-3c58-4e96-97c7-23c64b6154ae',
    '7D1B5770-11ED-494B-8014-9940CCB6930F',
    3,
    'Revoked',
    'Revoked',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 7D1B5770-11ED-494B-8014-9940CCB6930F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '7D1B5770-11ED-494B-8014-9940CCB6930F';
/* SQL text to insert entity field value with ID c1bc046b-87a6-446b-a1b9-8a516bfab54f */
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
    'c1bc046b-87a6-446b-a1b9-8a516bfab54f',
    'CA639F48-0665-4B2D-AB83-6709FF9057A3',
    1,
    'Ed25519',
    'Ed25519',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID CA639F48-0665-4B2D-AB83-6709FF9057A3 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CA639F48-0665-4B2D-AB83-6709FF9057A3';
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
/* Create Entity Relationship: MJ: Diagnostic Sessions -> MJ: Diagnostic Session Chunks (One To Many via DiagnosticSessionID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1f166381-8193-47c0-9d78-0dcfcfa489f9' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "RelatedEntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "RelatedEntityJoinField" = 'DiagnosticSessionID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1f166381-8193-47c0-9d78-0dcfcfa489f9', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', '95AE4A10-7D58-4D55-BE27-5B934A958411', 'DiagnosticSessionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a273816d-ed8f-4b7a-b226-5a3e0469443b' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "RelatedEntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "RelatedEntityJoinField" = 'DiagnosticSessionID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a273816d-ed8f-4b7a-b226-5a3e0469443b', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'A385086E-1147-4042-AE36-D808CE850EF9', 'DiagnosticSessionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '02efd5f2-2a23-44d5-97df-74c2d552a2ea' OR ("EntityID" = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "RelatedEntityJoinField" = 'CompanyID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('02efd5f2-2a23-44d5-97df-74c2d552a2ea', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'CompanyID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4f5b987e-18cd-426e-be73-a53fb987042f' OR ("EntityID" = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "RelatedEntityJoinField" = 'CompanyID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4f5b987e-18cd-426e-be73-a53fb987042f', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'CompanyID', 'One To Many', TRUE, TRUE, 10, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '32f1656d-e417-45f5-a62e-6079ea182784' OR ("EntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "RelatedEntityJoinField" = 'CreatedByUserID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('32f1656d-e417-45f5-a62e-6079ea182784', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'CreatedByUserID', 'One To Many', TRUE, TRUE, 127, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ec738767-0c8d-4a00-8e43-1cc558c355e0' OR ("EntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "RelatedEntityJoinField" = 'CreatedByUserID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ec738767-0c8d-4a00-8e43-1cc558c355e0', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'CreatedByUserID', 'One To Many', TRUE, TRUE, 128, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6d0f56a8-6eda-4400-93e2-116a89930fa1' OR ("EntityID" = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "RelatedEntityJoinField" = 'ApprovedByUserID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6d0f56a8-6eda-4400-93e2-116a89930fa1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'ApprovedByUserID', 'One To Many', TRUE, TRUE, 129, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '860d2b1e-efce-4e19-a6a1-0bf3a8888426' OR ("EntityID" = '29248F34-2837-EF11-86D4-6045BDEE16E6' AND "RelatedEntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "RelatedEntityJoinField" = 'FileID')) THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('860d2b1e-efce-4e19-a6a1-0bf3a8888426', '29248F34-2837-EF11-86D4-6045BDEE16E6', 'A385086E-1147-4042-AE36-D808CE850EF9', 'FileID', 'One To Many', TRUE, TRUE, 11, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c08293ba-fada-4548-8130-bdbaadb414d8' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'CreatedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c08293ba-fada-4548-8130-bdbaadb414d8', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'CreatedByUser', 'Created By User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18e874fa-5763-445c-add1-340b1d943e8f' OR ("EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'Company')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18e874fa-5763-445c-add1-340b1d943e8f', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' /* Entity: MJ: Diagnostic Sessions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11'), 'Company', 'Company', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ffa316b-8d2e-4b06-8302-ecf87de6bf38' OR ("EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'DiagnosticSession')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ffa316b-8d2e-4b06-8302-ecf87de6bf38', '95AE4A10-7D58-4D55-BE27-5B934A958411' /* Entity: MJ: Diagnostic Session Chunks */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411'), 'DiagnosticSession', 'Diagnostic Session', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eedc374e-540d-4bfe-8df1-6298fc76eb30' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'DiagnosticSession')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eedc374e-540d-4bfe-8df1-6298fc76eb30', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'DiagnosticSession', 'Diagnostic Session', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd922872f-06a0-43dd-8054-c7eb3a26e69f' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'File')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d922872f-06a0-43dd-8054-c7eb3a26e69f', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'File', 'File', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '225f88a3-f9a2-4b13-a5a1-93c058f7fcd2' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'CreatedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('225f88a3-f9a2-4b13-a5a1-93c058f7fcd2', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'CreatedByUser', 'Created By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c60f4895-1b9f-4d4f-9028-402f46622b3d' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'ApprovedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c60f4895-1b9f-4d4f-9028-402f46622b3d', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'ApprovedByUser', 'Approved By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '90d490a2-af3b-4909-b17e-b55c3f013f09' OR ("EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'Company')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('90d490a2-af3b-4909-b17e-b55c3f013f09', 'A385086E-1147-4042-AE36-D808CE850EF9' /* Entity: MJ: Diagnostic Bundles */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9'), 'Company', 'Company', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '83F35DFD-93ED-412A-83C1-66CE415C1E50'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '1811DDD3-1E6C-4338-8148-21AC96F09BC3'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '10BACF04-9A95-4B35-8F0B-34D70FB2FC19'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B2D6FA3E-A824-4B66-B34C-FBDD2D9E60AE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '3B129AC5-3331-4388-8D98-AE433A401F7A'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE
WHERE
  "ID" = 'F6E61A2E-1D12-4F53-BF96-F610F619BAF4'
  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '3AC7BA3C-7BBA-4FD2-8AE0-A60B8D1EB1C6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = 'F6E61A2E-1D12-4F53-BF96-F610F619BAF4'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '79AD6A5B-7FD9-44CD-ADF9-619C0D5C8C7D'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '66AEE3DB-EB2F-48D1-B3E9-22A23AC77FCB'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8FFA316B-8D2E-4B06-8302-ECF87DE6BF38'
  AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 16 fields */
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9BA99562-5BCC-4F2A-A4C5-29F35EFBD7FC';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.InstallID */
UPDATE __mj."EntityField" SET "Category" = 'Registration Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F6E61A2E-1D12-4F53-BF96-F610F619BAF4';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Name */
UPDATE __mj."EntityField" SET "Category" = 'Registration Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3AC7BA3C-7BBA-4FD2-8AE0-A60B8D1EB1C6';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Status */
UPDATE __mj."EntityField" SET "Category" = 'Registration Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7D1B5770-11ED-494B-8014-9940CCB6930F';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.MaxBundlesPerDay */
UPDATE __mj."EntityField" SET "Category" = 'Registration Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3B129AC5-3331-4388-8D98-AE433A401F7A';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.Comments */
UPDATE __mj."EntityField" SET "Category" = 'Registration Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '58B59BB2-BA98-44DA-A5AD-FEA5AA67A9F2';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyAlgorithm */
UPDATE __mj."EntityField" SET "Category" = 'Security and Keys', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CA639F48-0665-4B2D-AB83-6709FF9057A3';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.KeyID */
UPDATE __mj."EntityField" SET "Category" = 'Security and Keys', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C25BA215-389E-46E8-9050-A44BFC676DE5';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.PublicKeyBase64 */
UPDATE __mj."EntityField" SET "Category" = 'Security and Keys', "GeneratedFormSection" = 'Category', "DisplayName" = 'Public Key (Base64)'
WHERE
  "ID" = 'B796135F-273B-45BF-8329-65FC9DE0FF2E';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeHash */
UPDATE __mj."EntityField" SET "Category" = 'Security and Keys', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E9C4C14E-11CA-494E-A2B4-6513B2B3881C';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RegistrationCodeExpiresAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Activity', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3FC72EB4-086C-4219-A913-6DFE9F8CF7EC';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.EnrolledAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Activity', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '7263A223-577A-4F6E-A3A4-36BA4770152A';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.RevokedAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Activity', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AD087AED-AEBF-48BC-9182-FAC5DB00B418';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.LastSeenAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Activity', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B2D6FA3E-A824-4B66-B34C-FBDD2D9E60AE';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8616EABA-06EA-4DAA-A3F8-4E4B053BC0E9';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sender Registrations.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '95972272-7D48-47B5-9C16-0B37D36C85AA';

/* Set entity icon to fa fa-server */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-server', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e98990f-0ffd-5dbb-90f0-7a8cb4335d24', '0A75D64D-9396-4B77-871A-D88577F2AC4F', 'FieldCategoryInfo', '{
  "Registration Details": {
    "description": "Core installation identity, status, quotas, and administrator notes",
    "icon": "fa fa-info-circle"
  },
  "Security and Keys": {
    "description": "Cryptographic keys, algorithms, and enrollment authentication codes",
    "icon": "fa fa-shield-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline and Activity": {
    "description": "Enrollment, expiration, revocation, and last activity timestamps",
    "icon": "fa fa-clock"
  }
}', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'B3E39419-3F28-487F-8E96-B787A316AE23'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '008BE4D2-D5DA-4D58-9C59-C2D0EA75C1A2'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'C987F153-54F3-492F-BD74-8B1851199237'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '0B1302D6-9EC4-44D1-A37A-990917DA383D'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('33cec053-9d46-500b-a35c-03a4208d6ddc', '0A75D64D-9396-4B77-871A-D88577F2AC4F', 'FieldCategoryIcons', '{
  "Registration Details": "fa fa-info-circle",
  "Security and Keys": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog",
  "Timeline and Activity": "fa fa-clock"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '0A75D64D-9396-4B77-871A-D88577F2AC4F';

/* Set categories for 19 fields */
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6D73CD9A-EBD5-4C84-AD04-730DE04BCEE4';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Name */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '10BACF04-9A95-4B35-8F0B-34D70FB2FC19';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Reason */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'ED4BEC44-FD27-4123-9596-FEBD77EDAE75';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Status */
UPDATE __mj."EntityField" SET "Category" = 'Session Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '14B54BF3-B16F-477E-AA04-F88E58A6B6F3';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScopeType */
UPDATE __mj."EntityField" SET "Category" = 'Scope and Targeting', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A0906DB6-1D69-4C67-B552-812E12345344';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScopeJSON */
UPDATE __mj."EntityField" SET "Category" = 'Scope and Targeting', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '35265CAE-EC4B-4A65-974B-A55AF93E3A9F';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Level */
UPDATE __mj."EntityField" SET "Category" = 'Capture Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '83F35DFD-93ED-412A-83C1-66CE415C1E50';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CategoriesJSON */
UPDATE __mj."EntityField" SET "Category" = 'Capture Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'CFECFF5D-2DC3-4155-8033-4B8DA1292598';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.ScrubLiterals */
UPDATE __mj."EntityField" SET "Category" = 'Capture Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9DD51870-8EDF-441D-91A4-FCEDD9D0612B';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.MaxBytes */
UPDATE __mj."EntityField" SET "Category" = 'Capture Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'A13AEB63-1D12-4275-8140-E9D31A13B882';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.StartedAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Lifespan', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1811DDD3-1E6C-4338-8148-21AC96F09BC3';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.EndsAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Lifespan', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F377B211-E2E0-4CE7-9069-9620F2D48E05';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.StoppedAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline and Lifespan', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '433AD27E-71A6-4F6B-854D-55A8789599C1';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CreatedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Tenant', "GeneratedFormSection" = 'Category', "DisplayName" = 'Created By User'
WHERE
  "ID" = '8CF0E0D5-F3D2-4F64-B7A4-01F66E1333F7';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CompanyID */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Tenant', "GeneratedFormSection" = 'Category', "DisplayName" = 'Company'
WHERE
  "ID" = '4EDF3600-ACEA-410D-8014-294CED366562';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.CreatedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Tenant', "GeneratedFormSection" = 'Category', "DisplayName" = 'Created By User Name'
WHERE
  "ID" = 'C08293BA-FADA-4548-8130-BDBAADB414D8';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.Company */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Tenant', "GeneratedFormSection" = 'Category', "DisplayName" = 'Company Name'
WHERE
  "ID" = '18E874FA-5763-445C-ADD1-340B1D943E8F';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0720A793-474D-463F-AB4D-7E9A6A2FF9F9';
/* UPDATE Entity Field Category Info MJ: Diagnostic Sessions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '720A573E-634C-4A6E-8915-3D41716CFFD9';

/* Set entity icon to fa fa-stethoscope */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-stethoscope', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8d81dac6-3d8b-530e-b8ca-90e28a4cea1f', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'FieldCategoryInfo', '{
  "Capture Configuration": {
    "description": "Verbosity levels, categories, scrubbing, and budget limits",
    "icon": "fa fa-sliders-h"
  },
  "Ownership and Tenant": {
    "description": "User and tenant isolation details",
    "icon": "fa fa-building"
  },
  "Scope and Targeting": {
    "description": "Targeting rules and scope configuration for request capture",
    "icon": "fa fa-bullseye"
  },
  "Session Details": {
    "description": "Core identifying details and status of the diagnostic session",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline and Lifespan": {
    "description": "Start, expiration, and stop timestamps for the session",
    "icon": "fa fa-clock"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f324aeda-7e14-58a7-850b-6b1f7f375dbf', '133BF1FD-E4C0-410D-B847-39B3FD6FBC11', 'FieldCategoryIcons', '{
  "Capture Configuration": "fa fa-sliders-h",
  "Ownership and Tenant": "fa fa-building",
  "Scope and Targeting": "fa fa-bullseye",
  "Session Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog",
  "Timeline and Lifespan": "fa fa-clock"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '133BF1FD-E4C0-410D-B847-39B3FD6FBC11';

/* Set categories for 13 fields */
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F3E60710-4797-459E-8F8E-7AC8B18E1E3D';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.DiagnosticSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Session Information', "GeneratedFormSection" = 'Category', "DisplayName" = 'Diagnostic Session'
WHERE
  "ID" = '3C9534E2-BF0C-4062-A9C5-462A98D688A5';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Source */
UPDATE __mj."EntityField" SET "Category" = 'Session Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '65F25294-38FE-4962-AE82-E79654DEB7AB';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.HostInstanceLabel */
UPDATE __mj."EntityField" SET "Category" = 'Session Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1829E0EC-705C-4B0A-AEAA-6229A57D18A9';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Sequence */
UPDATE __mj."EntityField" SET "Category" = 'Session Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '1FF87845-C451-4511-837B-3A4571FD4889';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.ContentKind */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'D78C8C45-20C6-461A-A5F9-89F1538CAA0F';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.Data */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Payload', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '583D39D5-8DB1-4367-A310-9AD3EFA46332';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.EntryCount */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Payload', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '79AD6A5B-7FD9-44CD-ADF9-619C0D5C8C7D';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.FirstEntryAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '66AEE3DB-EB2F-48D1-B3E9-22A23AC77FCB';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.LastEntryAt */
UPDATE __mj."EntityField" SET "Category" = 'Timeline', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9D54251C-1F94-492B-9D41-165EC8FA607C';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.DiagnosticSession */
UPDATE __mj."EntityField" SET "Category" = 'Session Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8FFA316B-8D2E-4B06-8302-ECF87DE6BF38';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B8051F5E-D175-4A1B-B838-902BCA34700D';
/* UPDATE Entity Field Category Info MJ: Diagnostic Session Chunks.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '84D272E8-9CEE-4BC2-91D0-E07959E3B5BA';

/* Set entity icon to fa fa-database */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-database', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '95AE4A10-7D58-4D55-BE27-5B934A958411';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8a15bc51-369d-5b46-a254-d5b6be9e4ebe', '95AE4A10-7D58-4D55-BE27-5B934A958411', 'FieldCategoryInfo', '{
  "Chunk Payload": {
    "description": "Diagnostic payload content, entry counts, and data format details",
    "icon": "fa fa-file-code"
  },
  "Session Information": {
    "description": "Session context, origin tier, and instance identifiers",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Timeline": {
    "description": "Timestamps for the earliest and latest events in the chunk",
    "icon": "fa fa-clock"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0a0b277-b222-5ec4-a6b5-4b3b8d204f08', '95AE4A10-7D58-4D55-BE27-5B934A958411', 'FieldCategoryIcons', '{
  "Chunk Payload": "fa fa-file-code",
  "Session Information": "fa fa-info-circle",
  "System Metadata": "fa fa-cog",
  "Timeline": "fa fa-clock"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '95AE4A10-7D58-4D55-BE27-5B934A958411';

/* Set categories for 35 fields */
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'EDD96485-AB7F-4B90-B8B0-0FF89F5CE083';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Name */
UPDATE __mj."EntityField" SET "Category" = 'Bundle Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0B1302D6-9EC4-44D1-A37A-990917DA383D';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Description */
UPDATE __mj."EntityField" SET "Category" = 'Bundle Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8BB008BF-DE67-444D-9C70-F6CA72CE1E5F';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Direction */
UPDATE __mj."EntityField" SET "Category" = 'Bundle Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '329F06FC-164A-44CA-9A37-6DB686E80DC9';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.DiagnosticSessionID */
UPDATE __mj."EntityField" SET "Category" = 'Source and References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Diagnostic Session'
WHERE
  "ID" = '1B866D87-8BD5-4797-8BD6-A7B82208960E';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.DiagnosticSession */
UPDATE __mj."EntityField" SET "Category" = 'Source and References', "GeneratedFormSection" = 'Category', "DisplayName" = 'Diagnostic Session Name'
WHERE
  "ID" = 'EEDC374E-540D-4BFE-8DF1-6298FC76EB30';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Status */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B3E39419-3F28-487F-8E96-B787A316AE23';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FailureReason */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '058765E6-DD09-484F-822E-B466D681E801';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ScrubLiterals */
UPDATE __mj."EntityField" SET "Category" = 'Content and Findings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '03F204C7-74B8-4567-B4E7-8DAAD2AE52F6';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.WindowStart */
UPDATE __mj."EntityField" SET "Category" = 'Content and Findings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5E30689F-DA96-490F-8D50-19E9CE98EA06';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.WindowEnd */
UPDATE __mj."EntityField" SET "Category" = 'Content and Findings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '9B0845FB-9964-49E8-B814-134DE5842026';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ManifestJSON */
UPDATE __mj."EntityField" SET "Category" = 'Content and Findings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '12DDB9B2-BB41-4A3B-8BB8-CEA9FC7D6E68';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ScrubReportJSON */
UPDATE __mj."EntityField" SET "Category" = 'Content and Findings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'BE34EF65-DD3F-4631-944F-18126E0DEC06';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FindingsJSON */
UPDATE __mj."EntityField" SET "Category" = 'Content and Findings', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = 'AD7DD548-3A48-40B8-843E-16DAFE4AF6C4';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.FileID */
UPDATE __mj."EntityField" SET "Category" = 'Storage and File Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'File'
WHERE
  "ID" = '9AA2C46A-16E0-4233-871E-9FFCCE400ACB';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.File */
UPDATE __mj."EntityField" SET "Category" = 'Storage and File Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'File Name'
WHERE
  "ID" = 'D922872F-06A0-43DD-8054-C7EB3A26E69F';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Data */
UPDATE __mj."EntityField" SET "Category" = 'Storage and File Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C66BBB4A-991E-448A-83B0-C977D59DDCED';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SizeBytes */
UPDATE __mj."EntityField" SET "Category" = 'Storage and File Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Size (Bytes)'
WHERE
  "ID" = '008BE4D2-D5DA-4D58-9C59-C2D0EA75C1A2';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SHA256 */
UPDATE __mj."EntityField" SET "Category" = 'Storage and File Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'SHA256'
WHERE
  "ID" = '1103F8CE-C48C-4FE3-AE05-EAD4E4516347';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CreatedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Approval', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '601F1C45-A56C-4CCD-9A29-EFC6A7FEE5C4';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CreatedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Approval', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '225F88A3-F9A2-4B13-A5A1-93C058F7FCD2';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedByUserID */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Approval', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '999005E6-4821-443F-BB77-E06FE89D87D6';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedByUser */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Approval', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C60F4895-1B9F-4D4F-9028-402F46622B3D';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ApprovedAt */
UPDATE __mj."EntityField" SET "Category" = 'Ownership and Approval', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '374EFB56-CA0C-464C-B67F-F63BF4FC71B8';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Destination */
UPDATE __mj."EntityField" SET "Category" = 'Transmission Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '5486F090-0C0F-4312-AB17-2109820F6866';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SentAt */
UPDATE __mj."EntityField" SET "Category" = 'Transmission Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C6A6729A-6922-4977-97F5-2EB4B9471308';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ExternalReferenceID */
UPDATE __mj."EntityField" SET "Category" = 'Transmission Details', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6C7BDFED-2462-45FD-9022-6FFE9B9369BA';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SenderInstallID */
UPDATE __mj."EntityField" SET "Category" = 'Intake and Source Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'E864C1FE-6E5B-4FD7-982A-6D0EC2083C49';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.SenderMJVersion */
UPDATE __mj."EntityField" SET "Category" = 'Intake and Source Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C10C0183-8895-4CEA-AFF0-C2B993772BD0';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ContactInfo */
UPDATE __mj."EntityField" SET "Category" = 'Intake and Source Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0D61DE7D-C46E-45FC-BF04-29D295D55AEC';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.ExpiresAt */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle and Status', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BC31DA3A-499B-4C7C-B0C9-BF8CF37C25DE';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.CompanyID */
UPDATE __mj."EntityField" SET "Category" = 'Source and References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '928B0221-2753-412E-97C8-58998662FB3B';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.Company */
UPDATE __mj."EntityField" SET "Category" = 'Source and References', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '90D490A2-AF3B-4909-B17E-B55C3F013F09';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'C987F153-54F3-492F-BD74-8B1851199237';
/* UPDATE Entity Field Category Info MJ: Diagnostic Bundles.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '23D783E5-25D1-48F6-9960-2802038AE3FB';

/* Set entity icon to fa fa-stethoscope */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-stethoscope', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'A385086E-1147-4042-AE36-D808CE850EF9';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ea0c70cd-20f1-5e92-b7a5-bc679fa64d2b', 'A385086E-1147-4042-AE36-D808CE850EF9', 'FieldCategoryInfo', '{
  "Bundle Information": {
    "description": "General identification and descriptive details of the diagnostic bundle",
    "icon": "fa fa-info-circle"
  },
  "Content and Findings": {
    "description": "Manifests, scrubbing reports, automated findings, and time windows",
    "icon": "fa fa-file-alt"
  },
  "Intake and Source Context": {
    "description": "Remote sender metadata and contact information for ingested bundles",
    "icon": "fa fa-network-wired"
  },
  "Lifecycle and Status": {
    "description": "Current status, failure reasons, and retention expiration",
    "icon": "fa fa-tasks"
  },
  "Ownership and Approval": {
    "description": "Creators, approvers, and approval timestamps",
    "icon": "fa fa-user-shield"
  },
  "Source and References": {
    "description": "Originating diagnostic session, company scoping, and relationships",
    "icon": "fa fa-link"
  },
  "Storage and File Details": {
    "description": "File storage references, binary data, size, and checksums",
    "icon": "fa fa-database"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Transmission Details": {
    "description": "External destination, transmission timestamps, and reference IDs",
    "icon": "fa fa-paper-plane"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29625ba2-5469-58a3-82bf-a07404eba192', 'A385086E-1147-4042-AE36-D808CE850EF9', 'FieldCategoryIcons', '{
  "Bundle Information": "fa fa-info-circle",
  "Content and Findings": "fa fa-file-alt",
  "Intake and Source Context": "fa fa-network-wired",
  "Lifecycle and Status": "fa fa-tasks",
  "Ownership and Approval": "fa fa-user-shield",
  "Source and References": "fa fa-link",
  "Storage and File Details": "fa fa-database",
  "System Metadata": "fa fa-cog",
  "Transmission Details": "fa fa-paper-plane"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = TRUE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'A385086E-1147-4042-AE36-D808CE850EF9';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Bundles
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_bundle_diagnostic_session_id"
    ON "__mj"."DiagnosticBundle" ("DiagnosticSessionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_bundle_file_id"
    ON "__mj"."DiagnosticBundle" ("FileID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_bundle_created_by_user_id"
    ON "__mj"."DiagnosticBundle" ("CreatedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_bundle_approved_by_user_id"
    ON "__mj"."DiagnosticBundle" ("ApprovedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_bundle_company_id"
    ON "__mj"."DiagnosticBundle" ("CompanyID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Bundles
-- Item: vwDiagnosticBundles
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Bundles
-----               SCHEMA:      __mj
-----               BASE TABLE:  DiagnosticBundle
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwDiagnosticBundles"
AS
SELECT
    d.*,
    MJDiagnosticSession_DiagnosticSessionID."Name" AS "DiagnosticSession",
    MJFile_FileID."Name" AS "File",
    MJUser_CreatedByUserID."Name" AS "CreatedByUser",
    MJUser_ApprovedByUserID."Name" AS "ApprovedByUser",
    MJCompany_CompanyID."Name" AS "Company"
FROM
    "__mj"."DiagnosticBundle" AS d
LEFT OUTER JOIN
    "__mj"."DiagnosticSession" AS MJDiagnosticSession_DiagnosticSessionID
  ON
    "d"."DiagnosticSessionID" = MJDiagnosticSession_DiagnosticSessionID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_FileID
  ON
    "d"."FileID" = MJFile_FileID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_CreatedByUserID
  ON
    "d"."CreatedByUserID" = MJUser_CreatedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ApprovedByUserID
  ON
    "d"."ApprovedByUserID" = MJUser_ApprovedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."Company" AS MJCompany_CompanyID
  ON
    "d"."CompanyID" = MJCompany_CompanyID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwDiagnosticBundles'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwDiagnosticBundles'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwDiagnosticBundles" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwDiagnosticBundles" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwDiagnosticBundles" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwDiagnosticBundles" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Bundles
-- Item: spCreateDiagnosticBundle
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR DiagnosticBundle
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateDiagnosticBundle'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateDiagnosticBundle"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_direction varchar(20) DEFAULT NULL,
    p_diagnosticsessionid_clear boolean DEFAULT false,
    p_diagnosticsessionid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scrubliterals BOOLEAN DEFAULT NULL,
    p_windowstart_clear boolean DEFAULT false,
    p_windowstart TIMESTAMPTZ DEFAULT NULL,
    p_windowend_clear boolean DEFAULT false,
    p_windowend TIMESTAMPTZ DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data BYTEA DEFAULT NULL,
    p_sizebytes bigint DEFAULT NULL,
    p_sha256_clear boolean DEFAULT false,
    p_sha256 char(64) DEFAULT NULL,
    p_manifestjson_clear boolean DEFAULT false,
    p_manifestjson TEXT DEFAULT NULL,
    p_scrubreportjson_clear boolean DEFAULT false,
    p_scrubreportjson TEXT DEFAULT NULL,
    p_findingsjson_clear boolean DEFAULT false,
    p_findingsjson TEXT DEFAULT NULL,
    p_failurereason_clear boolean DEFAULT false,
    p_failurereason TEXT DEFAULT NULL,
    p_createdbyuserid_clear boolean DEFAULT false,
    p_createdbyuserid UUID DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_destination_clear boolean DEFAULT false,
    p_destination varchar(30) DEFAULT NULL,
    p_sentat_clear boolean DEFAULT false,
    p_sentat TIMESTAMPTZ DEFAULT NULL,
    p_externalreferenceid_clear boolean DEFAULT false,
    p_externalreferenceid varchar(255) DEFAULT NULL,
    p_senderinstallid_clear boolean DEFAULT false,
    p_senderinstallid UUID DEFAULT NULL,
    p_sendermjversion_clear boolean DEFAULT false,
    p_sendermjversion varchar(50) DEFAULT NULL,
    p_contactinfo_clear boolean DEFAULT false,
    p_contactinfo varchar(500) DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticBundles" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."DiagnosticBundle"
        (
            "ID",
            "Name",
                "Description",
                "Direction",
                "DiagnosticSessionID",
                "Status",
                "ScrubLiterals",
                "WindowStart",
                "WindowEnd",
                "FileID",
                "Data",
                "SizeBytes",
                "SHA256",
                "ManifestJSON",
                "ScrubReportJSON",
                "FindingsJSON",
                "FailureReason",
                "CreatedByUserID",
                "ApprovedByUserID",
                "ApprovedAt",
                "Destination",
                "SentAt",
                "ExternalReferenceID",
                "SenderInstallID",
                "SenderMJVersion",
                "ContactInfo",
                "ExpiresAt",
                "CompanyID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_direction, 'Local'),
                CASE WHEN p_diagnosticsessionid_clear = true THEN NULL ELSE COALESCE(p_diagnosticsessionid, NULL) END,
                COALESCE(p_status, 'Building'),
                COALESCE(p_scrubliterals, FALSE),
                CASE WHEN p_windowstart_clear = true THEN NULL ELSE COALESCE(p_windowstart, NULL) END,
                CASE WHEN p_windowend_clear = true THEN NULL ELSE COALESCE(p_windowend, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, NULL) END,
                COALESCE(p_sizebytes, 0),
                CASE WHEN p_sha256_clear = true THEN NULL ELSE COALESCE(p_sha256, NULL) END,
                CASE WHEN p_manifestjson_clear = true THEN NULL ELSE COALESCE(p_manifestjson, NULL) END,
                CASE WHEN p_scrubreportjson_clear = true THEN NULL ELSE COALESCE(p_scrubreportjson, NULL) END,
                CASE WHEN p_findingsjson_clear = true THEN NULL ELSE COALESCE(p_findingsjson, NULL) END,
                CASE WHEN p_failurereason_clear = true THEN NULL ELSE COALESCE(p_failurereason, NULL) END,
                CASE WHEN p_createdbyuserid_clear = true THEN NULL ELSE COALESCE(p_createdbyuserid, NULL) END,
                CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, NULL) END,
                CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, NULL) END,
                CASE WHEN p_destination_clear = true THEN NULL ELSE COALESCE(p_destination, NULL) END,
                CASE WHEN p_sentat_clear = true THEN NULL ELSE COALESCE(p_sentat, NULL) END,
                CASE WHEN p_externalreferenceid_clear = true THEN NULL ELSE COALESCE(p_externalreferenceid, NULL) END,
                CASE WHEN p_senderinstallid_clear = true THEN NULL ELSE COALESCE(p_senderinstallid, NULL) END,
                CASE WHEN p_sendermjversion_clear = true THEN NULL ELSE COALESCE(p_sendermjversion, NULL) END,
                CASE WHEN p_contactinfo_clear = true THEN NULL ELSE COALESCE(p_contactinfo, NULL) END,
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticBundles"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticBundle" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticBundle" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Bundles
-- Item: spUpdateDiagnosticBundle
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR DiagnosticBundle
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateDiagnosticBundle'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateDiagnosticBundle"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_direction varchar(20) DEFAULT NULL,
    p_diagnosticsessionid_clear boolean DEFAULT false,
    p_diagnosticsessionid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scrubliterals BOOLEAN DEFAULT NULL,
    p_windowstart_clear boolean DEFAULT false,
    p_windowstart TIMESTAMPTZ DEFAULT NULL,
    p_windowend_clear boolean DEFAULT false,
    p_windowend TIMESTAMPTZ DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data BYTEA DEFAULT NULL,
    p_sizebytes bigint DEFAULT NULL,
    p_sha256_clear boolean DEFAULT false,
    p_sha256 char(64) DEFAULT NULL,
    p_manifestjson_clear boolean DEFAULT false,
    p_manifestjson TEXT DEFAULT NULL,
    p_scrubreportjson_clear boolean DEFAULT false,
    p_scrubreportjson TEXT DEFAULT NULL,
    p_findingsjson_clear boolean DEFAULT false,
    p_findingsjson TEXT DEFAULT NULL,
    p_failurereason_clear boolean DEFAULT false,
    p_failurereason TEXT DEFAULT NULL,
    p_createdbyuserid_clear boolean DEFAULT false,
    p_createdbyuserid UUID DEFAULT NULL,
    p_approvedbyuserid_clear boolean DEFAULT false,
    p_approvedbyuserid UUID DEFAULT NULL,
    p_approvedat_clear boolean DEFAULT false,
    p_approvedat TIMESTAMPTZ DEFAULT NULL,
    p_destination_clear boolean DEFAULT false,
    p_destination varchar(30) DEFAULT NULL,
    p_sentat_clear boolean DEFAULT false,
    p_sentat TIMESTAMPTZ DEFAULT NULL,
    p_externalreferenceid_clear boolean DEFAULT false,
    p_externalreferenceid varchar(255) DEFAULT NULL,
    p_senderinstallid_clear boolean DEFAULT false,
    p_senderinstallid UUID DEFAULT NULL,
    p_sendermjversion_clear boolean DEFAULT false,
    p_sendermjversion varchar(50) DEFAULT NULL,
    p_contactinfo_clear boolean DEFAULT false,
    p_contactinfo varchar(500) DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticBundles" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."DiagnosticBundle"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Direction" = COALESCE(p_direction, "Direction"),
        "DiagnosticSessionID" = CASE WHEN p_diagnosticsessionid_clear = true THEN NULL ELSE COALESCE(p_diagnosticsessionid, "DiagnosticSessionID") END,
        "Status" = COALESCE(p_status, "Status"),
        "ScrubLiterals" = COALESCE(p_scrubliterals, "ScrubLiterals"),
        "WindowStart" = CASE WHEN p_windowstart_clear = true THEN NULL ELSE COALESCE(p_windowstart, "WindowStart") END,
        "WindowEnd" = CASE WHEN p_windowend_clear = true THEN NULL ELSE COALESCE(p_windowend, "WindowEnd") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "Data" = CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, "Data") END,
        "SizeBytes" = COALESCE(p_sizebytes, "SizeBytes"),
        "SHA256" = CASE WHEN p_sha256_clear = true THEN NULL ELSE COALESCE(p_sha256, "SHA256") END,
        "ManifestJSON" = CASE WHEN p_manifestjson_clear = true THEN NULL ELSE COALESCE(p_manifestjson, "ManifestJSON") END,
        "ScrubReportJSON" = CASE WHEN p_scrubreportjson_clear = true THEN NULL ELSE COALESCE(p_scrubreportjson, "ScrubReportJSON") END,
        "FindingsJSON" = CASE WHEN p_findingsjson_clear = true THEN NULL ELSE COALESCE(p_findingsjson, "FindingsJSON") END,
        "FailureReason" = CASE WHEN p_failurereason_clear = true THEN NULL ELSE COALESCE(p_failurereason, "FailureReason") END,
        "CreatedByUserID" = CASE WHEN p_createdbyuserid_clear = true THEN NULL ELSE COALESCE(p_createdbyuserid, "CreatedByUserID") END,
        "ApprovedByUserID" = CASE WHEN p_approvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_approvedbyuserid, "ApprovedByUserID") END,
        "ApprovedAt" = CASE WHEN p_approvedat_clear = true THEN NULL ELSE COALESCE(p_approvedat, "ApprovedAt") END,
        "Destination" = CASE WHEN p_destination_clear = true THEN NULL ELSE COALESCE(p_destination, "Destination") END,
        "SentAt" = CASE WHEN p_sentat_clear = true THEN NULL ELSE COALESCE(p_sentat, "SentAt") END,
        "ExternalReferenceID" = CASE WHEN p_externalreferenceid_clear = true THEN NULL ELSE COALESCE(p_externalreferenceid, "ExternalReferenceID") END,
        "SenderInstallID" = CASE WHEN p_senderinstallid_clear = true THEN NULL ELSE COALESCE(p_senderinstallid, "SenderInstallID") END,
        "SenderMJVersion" = CASE WHEN p_sendermjversion_clear = true THEN NULL ELSE COALESCE(p_sendermjversion, "SenderMJVersion") END,
        "ContactInfo" = CASE WHEN p_contactinfo_clear = true THEN NULL ELSE COALESCE(p_contactinfo, "ContactInfo") END,
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticBundles"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticBundle" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticBundle" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticBundle table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_diagnostic_bundle"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_diagnostic_bundle" ON "__mj"."DiagnosticBundle";

CREATE TRIGGER "trg_update_diagnostic_bundle"
BEFORE UPDATE ON "__mj"."DiagnosticBundle"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_diagnostic_bundle"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Bundles
-- Item: spDeleteDiagnosticBundle
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR DiagnosticBundle
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteDiagnosticBundle'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteDiagnosticBundle"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."DiagnosticBundle"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticBundle" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticBundle" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sender Registrations
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sender Registrations
-- Item: vwDiagnosticSenderRegistrations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Sender Registrations
-----               SCHEMA:      __mj
-----               BASE TABLE:  DiagnosticSenderRegistration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwDiagnosticSenderRegistrations"
AS
SELECT
    d.*
FROM
    "__mj"."DiagnosticSenderRegistration" AS d
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwDiagnosticSenderRegistrations'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwDiagnosticSenderRegistrations'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwDiagnosticSenderRegistrations" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwDiagnosticSenderRegistrations" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwDiagnosticSenderRegistrations" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwDiagnosticSenderRegistrations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sender Registrations
-- Item: spCreateDiagnosticSenderRegistration
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR DiagnosticSenderRegistration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateDiagnosticSenderRegistration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateDiagnosticSenderRegistration"(
    p_id UUID DEFAULT NULL,
    p_installid varchar(100) DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_keyalgorithm varchar(20) DEFAULT NULL,
    p_keyid_clear boolean DEFAULT false,
    p_keyid varchar(100) DEFAULT NULL,
    p_publickeybase64_clear boolean DEFAULT false,
    p_publickeybase64 varchar(255) DEFAULT NULL,
    p_registrationcodehash_clear boolean DEFAULT false,
    p_registrationcodehash varchar(128) DEFAULT NULL,
    p_registrationcodeexpiresat_clear boolean DEFAULT false,
    p_registrationcodeexpiresat TIMESTAMPTZ DEFAULT NULL,
    p_enrolledat_clear boolean DEFAULT false,
    p_enrolledat TIMESTAMPTZ DEFAULT NULL,
    p_revokedat_clear boolean DEFAULT false,
    p_revokedat TIMESTAMPTZ DEFAULT NULL,
    p_lastseenat_clear boolean DEFAULT false,
    p_lastseenat TIMESTAMPTZ DEFAULT NULL,
    p_maxbundlesperday int DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticSenderRegistrations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."DiagnosticSenderRegistration"
        (
            "ID",
            "InstallID",
                "Name",
                "Status",
                "KeyAlgorithm",
                "KeyID",
                "PublicKeyBase64",
                "RegistrationCodeHash",
                "RegistrationCodeExpiresAt",
                "EnrolledAt",
                "RevokedAt",
                "LastSeenAt",
                "MaxBundlesPerDay",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_installid,
                p_name,
                COALESCE(p_status, 'Pending'),
                COALESCE(p_keyalgorithm, 'Ed25519'),
                CASE WHEN p_keyid_clear = true THEN NULL ELSE COALESCE(p_keyid, NULL) END,
                CASE WHEN p_publickeybase64_clear = true THEN NULL ELSE COALESCE(p_publickeybase64, NULL) END,
                CASE WHEN p_registrationcodehash_clear = true THEN NULL ELSE COALESCE(p_registrationcodehash, NULL) END,
                CASE WHEN p_registrationcodeexpiresat_clear = true THEN NULL ELSE COALESCE(p_registrationcodeexpiresat, NULL) END,
                CASE WHEN p_enrolledat_clear = true THEN NULL ELSE COALESCE(p_enrolledat, NULL) END,
                CASE WHEN p_revokedat_clear = true THEN NULL ELSE COALESCE(p_revokedat, NULL) END,
                CASE WHEN p_lastseenat_clear = true THEN NULL ELSE COALESCE(p_lastseenat, NULL) END,
                COALESCE(p_maxbundlesperday, 20),
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticSenderRegistrations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticSenderRegistration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticSenderRegistration" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sender Registrations
-- Item: spUpdateDiagnosticSenderRegistration
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR DiagnosticSenderRegistration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateDiagnosticSenderRegistration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateDiagnosticSenderRegistration"(
    p_id UUID,
    p_installid varchar(100) DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_keyalgorithm varchar(20) DEFAULT NULL,
    p_keyid_clear boolean DEFAULT false,
    p_keyid varchar(100) DEFAULT NULL,
    p_publickeybase64_clear boolean DEFAULT false,
    p_publickeybase64 varchar(255) DEFAULT NULL,
    p_registrationcodehash_clear boolean DEFAULT false,
    p_registrationcodehash varchar(128) DEFAULT NULL,
    p_registrationcodeexpiresat_clear boolean DEFAULT false,
    p_registrationcodeexpiresat TIMESTAMPTZ DEFAULT NULL,
    p_enrolledat_clear boolean DEFAULT false,
    p_enrolledat TIMESTAMPTZ DEFAULT NULL,
    p_revokedat_clear boolean DEFAULT false,
    p_revokedat TIMESTAMPTZ DEFAULT NULL,
    p_lastseenat_clear boolean DEFAULT false,
    p_lastseenat TIMESTAMPTZ DEFAULT NULL,
    p_maxbundlesperday int DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticSenderRegistrations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."DiagnosticSenderRegistration"
    SET
        "InstallID" = COALESCE(p_installid, "InstallID"),
        "Name" = COALESCE(p_name, "Name"),
        "Status" = COALESCE(p_status, "Status"),
        "KeyAlgorithm" = COALESCE(p_keyalgorithm, "KeyAlgorithm"),
        "KeyID" = CASE WHEN p_keyid_clear = true THEN NULL ELSE COALESCE(p_keyid, "KeyID") END,
        "PublicKeyBase64" = CASE WHEN p_publickeybase64_clear = true THEN NULL ELSE COALESCE(p_publickeybase64, "PublicKeyBase64") END,
        "RegistrationCodeHash" = CASE WHEN p_registrationcodehash_clear = true THEN NULL ELSE COALESCE(p_registrationcodehash, "RegistrationCodeHash") END,
        "RegistrationCodeExpiresAt" = CASE WHEN p_registrationcodeexpiresat_clear = true THEN NULL ELSE COALESCE(p_registrationcodeexpiresat, "RegistrationCodeExpiresAt") END,
        "EnrolledAt" = CASE WHEN p_enrolledat_clear = true THEN NULL ELSE COALESCE(p_enrolledat, "EnrolledAt") END,
        "RevokedAt" = CASE WHEN p_revokedat_clear = true THEN NULL ELSE COALESCE(p_revokedat, "RevokedAt") END,
        "LastSeenAt" = CASE WHEN p_lastseenat_clear = true THEN NULL ELSE COALESCE(p_lastseenat, "LastSeenAt") END,
        "MaxBundlesPerDay" = COALESCE(p_maxbundlesperday, "MaxBundlesPerDay"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticSenderRegistrations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticSenderRegistration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticSenderRegistration" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSenderRegistration table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_diagnostic_sender_registration"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_diagnostic_sender_registration" ON "__mj"."DiagnosticSenderRegistration";

CREATE TRIGGER "trg_update_diagnostic_sender_registration"
BEFORE UPDATE ON "__mj"."DiagnosticSenderRegistration"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_diagnostic_sender_registration"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sender Registrations
-- Item: spDeleteDiagnosticSenderRegistration
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR DiagnosticSenderRegistration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteDiagnosticSenderRegistration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteDiagnosticSenderRegistration"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."DiagnosticSenderRegistration"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticSenderRegistration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticSenderRegistration" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Session Chunks
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_session_chunk_diagnostic_session_id"
    ON "__mj"."DiagnosticSessionChunk" ("DiagnosticSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Session Chunks
-- Item: vwDiagnosticSessionChunks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Session Chunks
-----               SCHEMA:      __mj
-----               BASE TABLE:  DiagnosticSessionChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwDiagnosticSessionChunks"
AS
SELECT
    d.*,
    MJDiagnosticSession_DiagnosticSessionID."Name" AS "DiagnosticSession"
FROM
    "__mj"."DiagnosticSessionChunk" AS d
INNER JOIN
    "__mj"."DiagnosticSession" AS MJDiagnosticSession_DiagnosticSessionID
  ON
    "d"."DiagnosticSessionID" = MJDiagnosticSession_DiagnosticSessionID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwDiagnosticSessionChunks'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwDiagnosticSessionChunks'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwDiagnosticSessionChunks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwDiagnosticSessionChunks" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwDiagnosticSessionChunks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwDiagnosticSessionChunks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Session Chunks
-- Item: spCreateDiagnosticSessionChunk
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR DiagnosticSessionChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateDiagnosticSessionChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateDiagnosticSessionChunk"(
    p_id UUID DEFAULT NULL,
    p_diagnosticsessionid UUID DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_hostinstancelabel varchar(255) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_contentkind varchar(30) DEFAULT NULL,
    p_data BYTEA DEFAULT NULL,
    p_entrycount int DEFAULT NULL,
    p_firstentryat_clear boolean DEFAULT false,
    p_firstentryat TIMESTAMPTZ DEFAULT NULL,
    p_lastentryat_clear boolean DEFAULT false,
    p_lastentryat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticSessionChunks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."DiagnosticSessionChunk"
        (
            "ID",
            "DiagnosticSessionID",
                "Source",
                "HostInstanceLabel",
                "Sequence",
                "ContentKind",
                "Data",
                "EntryCount",
                "FirstEntryAt",
                "LastEntryAt"
        )
    VALUES
        (
            v_new_id,
            p_diagnosticsessionid,
                p_source,
                p_hostinstancelabel,
                p_sequence,
                p_contentkind,
                p_data,
                COALESCE(p_entrycount, 0),
                CASE WHEN p_firstentryat_clear = true THEN NULL ELSE COALESCE(p_firstentryat, NULL) END,
                CASE WHEN p_lastentryat_clear = true THEN NULL ELSE COALESCE(p_lastentryat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticSessionChunks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticSessionChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticSessionChunk" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Session Chunks
-- Item: spUpdateDiagnosticSessionChunk
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR DiagnosticSessionChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateDiagnosticSessionChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateDiagnosticSessionChunk"(
    p_id UUID,
    p_diagnosticsessionid UUID DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_hostinstancelabel varchar(255) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_contentkind varchar(30) DEFAULT NULL,
    p_data BYTEA DEFAULT NULL,
    p_entrycount int DEFAULT NULL,
    p_firstentryat_clear boolean DEFAULT false,
    p_firstentryat TIMESTAMPTZ DEFAULT NULL,
    p_lastentryat_clear boolean DEFAULT false,
    p_lastentryat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticSessionChunks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."DiagnosticSessionChunk"
    SET
        "DiagnosticSessionID" = COALESCE(p_diagnosticsessionid, "DiagnosticSessionID"),
        "Source" = COALESCE(p_source, "Source"),
        "HostInstanceLabel" = COALESCE(p_hostinstancelabel, "HostInstanceLabel"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "ContentKind" = COALESCE(p_contentkind, "ContentKind"),
        "Data" = COALESCE(p_data, "Data"),
        "EntryCount" = COALESCE(p_entrycount, "EntryCount"),
        "FirstEntryAt" = CASE WHEN p_firstentryat_clear = true THEN NULL ELSE COALESCE(p_firstentryat, "FirstEntryAt") END,
        "LastEntryAt" = CASE WHEN p_lastentryat_clear = true THEN NULL ELSE COALESCE(p_lastentryat, "LastEntryAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticSessionChunks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticSessionChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticSessionChunk" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSessionChunk table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_diagnostic_session_chunk"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_diagnostic_session_chunk" ON "__mj"."DiagnosticSessionChunk";

CREATE TRIGGER "trg_update_diagnostic_session_chunk"
BEFORE UPDATE ON "__mj"."DiagnosticSessionChunk"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_diagnostic_session_chunk"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Session Chunks
-- Item: spDeleteDiagnosticSessionChunk
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR DiagnosticSessionChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteDiagnosticSessionChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteDiagnosticSessionChunk"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."DiagnosticSessionChunk"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticSessionChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticSessionChunk" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sessions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_session_created_by_user_id"
    ON "__mj"."DiagnosticSession" ("CreatedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_diagnostic_session_company_id"
    ON "__mj"."DiagnosticSession" ("CompanyID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sessions
-- Item: vwDiagnosticSessions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Diagnostic Sessions
-----               SCHEMA:      __mj
-----               BASE TABLE:  DiagnosticSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwDiagnosticSessions"
AS
SELECT
    d.*,
    MJUser_CreatedByUserID."Name" AS "CreatedByUser",
    MJCompany_CompanyID."Name" AS "Company"
FROM
    "__mj"."DiagnosticSession" AS d
INNER JOIN
    "__mj"."User" AS MJUser_CreatedByUserID
  ON
    "d"."CreatedByUserID" = MJUser_CreatedByUserID."ID"
LEFT OUTER JOIN
    "__mj"."Company" AS MJCompany_CompanyID
  ON
    "d"."CompanyID" = MJCompany_CompanyID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwDiagnosticSessions'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwDiagnosticSessions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwDiagnosticSessions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwDiagnosticSessions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwDiagnosticSessions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwDiagnosticSessions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sessions
-- Item: spCreateDiagnosticSession
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR DiagnosticSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateDiagnosticSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateDiagnosticSession"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scopetype varchar(30) DEFAULT NULL,
    p_scopejson_clear boolean DEFAULT false,
    p_scopejson TEXT DEFAULT NULL,
    p_level varchar(20) DEFAULT NULL,
    p_categoriesjson_clear boolean DEFAULT false,
    p_categoriesjson TEXT DEFAULT NULL,
    p_scrubliterals BOOLEAN DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endsat TIMESTAMPTZ DEFAULT NULL,
    p_stoppedat_clear boolean DEFAULT false,
    p_stoppedat TIMESTAMPTZ DEFAULT NULL,
    p_maxbytes bigint DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticSessions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."DiagnosticSession"
        (
            "ID",
            "Name",
                "Reason",
                "Status",
                "ScopeType",
                "ScopeJSON",
                "Level",
                "CategoriesJSON",
                "ScrubLiterals",
                "StartedAt",
                "EndsAt",
                "StoppedAt",
                "MaxBytes",
                "CreatedByUserID",
                "CompanyID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_scopetype, 'Users'),
                CASE WHEN p_scopejson_clear = true THEN NULL ELSE COALESCE(p_scopejson, NULL) END,
                COALESCE(p_level, 'Standard'),
                CASE WHEN p_categoriesjson_clear = true THEN NULL ELSE COALESCE(p_categoriesjson, NULL) END,
                COALESCE(p_scrubliterals, FALSE),
                COALESCE(p_startedat, NOW() AT TIME ZONE 'UTC'),
                p_endsat,
                CASE WHEN p_stoppedat_clear = true THEN NULL ELSE COALESCE(p_stoppedat, NULL) END,
                COALESCE(p_maxbytes, 52428800),
                p_createdbyuserid,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticSessions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateDiagnosticSession" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sessions
-- Item: spUpdateDiagnosticSession
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR DiagnosticSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateDiagnosticSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateDiagnosticSession"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_scopetype varchar(30) DEFAULT NULL,
    p_scopejson_clear boolean DEFAULT false,
    p_scopejson TEXT DEFAULT NULL,
    p_level varchar(20) DEFAULT NULL,
    p_categoriesjson_clear boolean DEFAULT false,
    p_categoriesjson TEXT DEFAULT NULL,
    p_scrubliterals BOOLEAN DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endsat TIMESTAMPTZ DEFAULT NULL,
    p_stoppedat_clear boolean DEFAULT false,
    p_stoppedat TIMESTAMPTZ DEFAULT NULL,
    p_maxbytes bigint DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwDiagnosticSessions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."DiagnosticSession"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Reason" = CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, "Reason") END,
        "Status" = COALESCE(p_status, "Status"),
        "ScopeType" = COALESCE(p_scopetype, "ScopeType"),
        "ScopeJSON" = CASE WHEN p_scopejson_clear = true THEN NULL ELSE COALESCE(p_scopejson, "ScopeJSON") END,
        "Level" = COALESCE(p_level, "Level"),
        "CategoriesJSON" = CASE WHEN p_categoriesjson_clear = true THEN NULL ELSE COALESCE(p_categoriesjson, "CategoriesJSON") END,
        "ScrubLiterals" = COALESCE(p_scrubliterals, "ScrubLiterals"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndsAt" = COALESCE(p_endsat, "EndsAt"),
        "StoppedAt" = CASE WHEN p_stoppedat_clear = true THEN NULL ELSE COALESCE(p_stoppedat, "StoppedAt") END,
        "MaxBytes" = COALESCE(p_maxbytes, "MaxBytes"),
        "CreatedByUserID" = COALESCE(p_createdbyuserid, "CreatedByUserID"),
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwDiagnosticSessions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateDiagnosticSession" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DiagnosticSession table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_diagnostic_session"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_diagnostic_session" ON "__mj"."DiagnosticSession";

CREATE TRIGGER "trg_update_diagnostic_session"
BEFORE UPDATE ON "__mj"."DiagnosticSession"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_diagnostic_session"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Diagnostic Sessions
-- Item: spDeleteDiagnosticSession
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR DiagnosticSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteDiagnosticSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteDiagnosticSession"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."DiagnosticSession"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteDiagnosticSession" TO "cdp_Integration";
