-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610061700__v6.2.x__Add_Work_Queue_Schema.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The CodeGen tail of the T-SQL migration calls spUpdateEntityFieldRelatedEntityNameFieldMap nine
-- times. The transpiler reported one and dropped all nine. They are hand-ported at the end of this
-- file, after the EntityField rows they update; see the block headed HAND-PORTED.
-- ╚════════════════════════════════════════╝

/* ============================================================================ */
/* Work Queue — schema (plans/work-queue-1/03-interfaces-and-tables.md §6) */
/* ============================================================================ */
/* Additive only: six new tables, CHECK/UNIQUE constraints, eight non-FK indexes */
/* (one unique filtered, seven supporting) and column descriptions. */
/* PartitionKey and DeduplicationKey use a binary collation so keys compare */
/* case-sensitively and byte-exactly, as PostgreSQL does (03 §6, F9). */
/* CodeGen owns __mj_CreatedAt/__mj_UpdatedAt, FK indexes, views, procedures, EntityField rows and generated classes. */
/* PostgreSQL counterpart is produced by the release build. */
/* ============================================================================ */
/* --------------------------------------------------------------------------- */
/* WorkQueueTransport */
/* --------------------------------------------------------------------------- */
CREATE TABLE __mj."WorkQueueTransport" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(100) NOT NULL,
  "Description" TEXT NULL,
  "DriverClass" VARCHAR(100) NOT NULL,
  "Configuration" TEXT NULL,
  "CredentialID" UUID NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT "PK_WorkQueueTransport" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_WorkQueueTransport_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "FK_WorkQueueTransport_Credential" FOREIGN KEY ("CredentialID") REFERENCES __mj."Credential" (
    "ID"
  ),
  CONSTRAINT "CK_WorkQueueTransport_Status" CHECK ("Status" IN ('Active', 'Disabled'))
);

/* --------------------------------------------------------------------------- */
/* WorkQueueTopic */
/* --------------------------------------------------------------------------- */
CREATE TABLE __mj."WorkQueueTopic" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(200) NOT NULL,
  "Description" TEXT NULL,
  "TransportID" UUID NOT NULL,
  "IsFifo" BOOLEAN NOT NULL DEFAULT FALSE,
  "AllowExternalPublish" BOOLEAN NOT NULL DEFAULT FALSE,
  "MaxPayloadBytes" INT NOT NULL DEFAULT 262144,
  "DefaultDeduplicationTTLSeconds" INT NOT NULL DEFAULT 86400,
  "RetentionDays" INT NOT NULL DEFAULT 7,
  "BindingConfig" TEXT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT "PK_WorkQueueTopic" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_WorkQueueTopic_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "FK_WorkQueueTopic_Transport" FOREIGN KEY ("TransportID") REFERENCES __mj."WorkQueueTransport" (
    "ID"
  ),
  CONSTRAINT "CK_WorkQueueTopic_MaxPayloadBytes" CHECK ("MaxPayloadBytes" > 0 AND "MaxPayloadBytes" <= 262144),
  CONSTRAINT "CK_WorkQueueTopic_DefaultDeduplicationTTLSeconds" CHECK ("DefaultDeduplicationTTLSeconds" >= 60),
  CONSTRAINT "CK_WorkQueueTopic_RetentionDays" CHECK ("RetentionDays" >= 1),
  CONSTRAINT "CK_WorkQueueTopic_Status" CHECK ("Status" IN ('Active', 'Disabled'))
);

/* --------------------------------------------------------------------------- */
/* WorkQueueSubscription */
/* --------------------------------------------------------------------------- */
CREATE TABLE __mj."WorkQueueSubscription" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "TopicID" UUID NOT NULL,
  "Name" VARCHAR(200) NOT NULL,
  "Description" TEXT NULL,
  "Filter" TEXT NULL,
  "PartitionMode" VARCHAR(20) NOT NULL DEFAULT 'None',
  "MaxAttempts" INT NOT NULL DEFAULT 5,
  "BackoffBaseSeconds" INT NOT NULL DEFAULT 10,
  "BackoffMaxSeconds" INT NOT NULL DEFAULT 900,
  "LeaseSeconds" INT NOT NULL DEFAULT 60,
  "HeartbeatMode" VARCHAR(20) NOT NULL DEFAULT 'Auto',
  "MaxProcessingSeconds" INT NULL,
  "HostType" VARCHAR(20) NOT NULL DEFAULT 'MJWorker',
  "HandlerKey" VARCHAR(200) NULL,
  "ExternalRef" VARCHAR(500) NULL,
  "BindingConfig" TEXT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT "PK_WorkQueueSubscription" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_WorkQueueSubscription_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "FK_WorkQueueSubscription_Topic" FOREIGN KEY ("TopicID") REFERENCES __mj."WorkQueueTopic" (
    "ID"
  ),
  CONSTRAINT "CK_WorkQueueSubscription_PartitionMode" CHECK ("PartitionMode" IN ('None', 'Exclusive', 'Ordered')),
  CONSTRAINT "CK_WorkQueueSubscription_MaxAttempts" CHECK ("MaxAttempts" >= 1),
  CONSTRAINT "CK_WorkQueueSubscription_BackoffBaseSeconds" CHECK ("BackoffBaseSeconds" >= 0),
  CONSTRAINT "CK_WorkQueueSubscription_BackoffMaxSeconds" CHECK ("BackoffMaxSeconds" >= 0),
  CONSTRAINT "CK_WorkQueueSubscription_LeaseSeconds" CHECK ("LeaseSeconds" >= 5),
  CONSTRAINT "CK_WorkQueueSubscription_HeartbeatMode" CHECK ("HeartbeatMode" IN ('Auto', 'Manual')),
  CONSTRAINT "CK_WorkQueueSubscription_HostType" CHECK ("HostType" IN ('MJWorker', 'External')),
  CONSTRAINT "CK_WorkQueueSubscription_Status" CHECK ("Status" IN ('Active', 'Paused', 'Disabled'))
);

/* --------------------------------------------------------------------------- */
/* WorkQueueMessage */
/* --------------------------------------------------------------------------- */
CREATE TABLE __mj."WorkQueueMessage" (
  "ID" UUID NOT NULL,
  "PublishOrdinal" BIGINT GENERATED BY DEFAULT AS IDENTITY (START WITH 1 INCREMENT BY 1) NOT NULL,
  "TopicID" UUID NOT NULL,
  "PartitionKey" VARCHAR(200) NULL,
  "Attributes" VARCHAR(4000) NULL,
  "Payload" TEXT NULL,
  "PayloadRef" VARCHAR(2000) NULL,
  "CorrelationID" VARCHAR(200) NULL,
  "PublishedAt" TIMESTAMPTZ(7) NOT NULL DEFAULT NOW(),
  "PublishedByUserID" UUID NULL,
  CONSTRAINT "PK_WorkQueueMessage" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_WorkQueueMessage_PublishOrdinal" UNIQUE (
    "PublishOrdinal"
  ),
  CONSTRAINT "FK_WorkQueueMessage_Topic" FOREIGN KEY ("TopicID") REFERENCES __mj."WorkQueueTopic" (
    "ID"
  ),
  CONSTRAINT "FK_WorkQueueMessage_PublishedByUser" FOREIGN KEY ("PublishedByUserID") REFERENCES __mj."User" (
    "ID"
  )
);

/* Retention purge: messages of a topic older than its RetentionDays with no remaining deliveries. */
CREATE INDEX "IX_WorkQueueMessage_Purge" ON __mj."WorkQueueMessage"("TopicID", "PublishedAt");

/* --------------------------------------------------------------------------- */
/* WorkQueueDelivery */
/* --------------------------------------------------------------------------- */
CREATE TABLE __mj."WorkQueueDelivery" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "MessageID" UUID NOT NULL,
  "SubscriptionID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "PartitionKey" VARCHAR(200) NULL,
  "OrderKey" BIGINT NOT NULL,
  "AttemptCount" INT NOT NULL DEFAULT 0,
  "IsReplay" BOOLEAN NOT NULL DEFAULT FALSE,
  "VisibleAt" TIMESTAMPTZ(7) NOT NULL DEFAULT NOW(),
  "LeaseOwner" VARCHAR(200) NULL,
  "LeaseToken" UUID NULL,
  "LeaseExpiresAt" TIMESTAMPTZ(7) NULL,
  "LastHeartbeatAt" TIMESTAMPTZ(7) NULL,
  "Progress" VARCHAR(4000) NULL,
  "LastError" TEXT NULL,
  "DeadLetterReason" VARCHAR(100) NULL,
  "DeadLetteredAt" TIMESTAMPTZ(7) NULL,
  "CompletedAt" TIMESTAMPTZ(7) NULL,
  "CancelRequestedAt" TIMESTAMPTZ(7) NULL,
  "ResolvedByUserID" UUID NULL,
  "ResolutionNote" VARCHAR(1000) NULL,
  CONSTRAINT "PK_WorkQueueDelivery" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_WorkQueueDelivery_Message" FOREIGN KEY ("MessageID") REFERENCES __mj."WorkQueueMessage" (
    "ID"
  ),
  CONSTRAINT "FK_WorkQueueDelivery_Subscription" FOREIGN KEY ("SubscriptionID") REFERENCES __mj."WorkQueueSubscription" (
    "ID"
  ),
  CONSTRAINT "FK_WorkQueueDelivery_ResolvedByUser" FOREIGN KEY ("ResolvedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "UQ_WorkQueueDelivery_Subscription_Message" UNIQUE (
    "SubscriptionID",
    "MessageID"
  ),
  CONSTRAINT "CK_WorkQueueDelivery_Status" CHECK ("Status" IN ('Pending', 'InFlight', 'Completed', 'DeadLettered', 'Discarded')),
  CONSTRAINT "CK_WorkQueueDelivery_AttemptCount" CHECK ("AttemptCount" >= 0)
);

CREATE UNIQUE INDEX "UQ_WorkQueueDelivery_InFlightPartition" ON __mj."WorkQueueDelivery"("SubscriptionID", "PartitionKey")
WHERE
  "Status" = 'InFlight' AND NOT "PartitionKey" IS NULL;

/* Filtered to Pending so the claim scan never walks retained terminal rows. */
CREATE INDEX "IX_WorkQueueDelivery_Claim" ON __mj."WorkQueueDelivery"("SubscriptionID", "VisibleAt") INCLUDE ("PartitionKey", "OrderKey", "AttemptCount")
WHERE
  "Status" = 'Pending';

CREATE INDEX "IX_WorkQueueDelivery_PartitionHead" ON __mj."WorkQueueDelivery"("SubscriptionID", "PartitionKey", "OrderKey") INCLUDE ("Status")
WHERE
  NOT "PartitionKey" IS NULL
  AND "Status" IN ('Pending', 'InFlight', 'DeadLettered');

CREATE INDEX "IX_WorkQueueDelivery_Lease" ON __mj."WorkQueueDelivery"("Status", "LeaseExpiresAt")
WHERE
  "Status" = 'InFlight';

/* Per-status counts (stats, backlog) and the dead-letter list: seeks, never an aggregate over every row. */
CREATE INDEX "IX_WorkQueueDelivery_Open" ON __mj."WorkQueueDelivery"("SubscriptionID", "Status")
WHERE
  "Status" IN ('InFlight', 'DeadLettered');

/* Retention purge and CompletedLastHour. */
CREATE INDEX "IX_WorkQueueDelivery_Purge" ON __mj."WorkQueueDelivery"("CompletedAt") INCLUDE ("SubscriptionID", "Status")
WHERE
  "Status" IN ('Completed', 'Discarded');

/* --------------------------------------------------------------------------- */
/* WorkQueueDeduplication */
/* --------------------------------------------------------------------------- */
CREATE TABLE __mj."WorkQueueDeduplication" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "TopicID" UUID NOT NULL,
  "DeduplicationKey" VARCHAR(200) NOT NULL,
  "MessageID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL,
  "ExpiresAt" TIMESTAMPTZ(7) NOT NULL,
  CONSTRAINT "PK_WorkQueueDeduplication" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_WorkQueueDeduplication_Topic" FOREIGN KEY ("TopicID") REFERENCES __mj."WorkQueueTopic" (
    "ID"
  ),
  CONSTRAINT "UQ_WorkQueueDeduplication_Topic_Key" UNIQUE (
    "TopicID",
    "DeduplicationKey"
  ),
  CONSTRAINT "CK_WorkQueueDeduplication_Status" CHECK ("Status" IN ('Reserved', 'Confirmed'))
);

CREATE INDEX "IX_WorkQueueDeduplication_ExpiresAt" ON __mj."WorkQueueDeduplication"("ExpiresAt");

COMMENT ON TABLE __mj."WorkQueueTransport" IS 'A configured backend that stores and delivers work-queue messages (Database, AWS, ...). Topics bind to exactly one transport.';

COMMENT ON COLUMN __mj."WorkQueueTransport"."Name" IS 'Unique transport name, for example Database or AWS-prod-us-east-1.';

COMMENT ON COLUMN __mj."WorkQueueTransport"."Description" IS 'What this transport is used for and who operates it.';

COMMENT ON COLUMN __mj."WorkQueueTransport"."DriverClass" IS 'ClassFactory key of the BaseTransportDriverFactory registration that builds the driver: Database or AWS.';

COMMENT ON COLUMN __mj."WorkQueueTransport"."Configuration" IS 'Driver-specific JSON configuration, for example {"Region":"us-east-1"}. Never holds secrets; use CredentialID.';

COMMENT ON COLUMN __mj."WorkQueueTransport"."Status" IS 'Active transports can deliver; Disabled transports reject publishes.';

COMMENT ON TABLE __mj."WorkQueueTopic" IS 'A named destination producers publish work to. Each topic is bound to one transport and fans out to its subscriptions.';

COMMENT ON COLUMN __mj."WorkQueueTopic"."Name" IS 'Unique dotted lowercase topic name, for example email.events.';

COMMENT ON COLUMN __mj."WorkQueueTopic"."Description" IS 'What the topic represents and who publishes to it.';

COMMENT ON COLUMN __mj."WorkQueueTopic"."IsFifo" IS 'Cloud transports: the topic uses FIFO resources. Required on AWS when any subscription is Exclusive.';

COMMENT ON COLUMN __mj."WorkQueueTopic"."AllowExternalPublish" IS 'When 1, API callers may publish to this topic through POST /work-queue/topics/{topic}/messages. In-process code may publish to any active topic.';

COMMENT ON COLUMN __mj."WorkQueueTopic"."MaxPayloadBytes" IS 'Largest serialized envelope accepted, in bytes (at most 262144).';

COMMENT ON COLUMN __mj."WorkQueueTopic"."DefaultDeduplicationTTLSeconds" IS 'Window, in seconds, during which a DeduplicationKey suppresses repeat publishes when the publisher does not supply one.';

COMMENT ON COLUMN __mj."WorkQueueTopic"."RetentionDays" IS 'Days completed and discarded deliveries, and their messages, are kept before the sweeper purges them (Database transport).';

COMMENT ON COLUMN __mj."WorkQueueTopic"."BindingConfig" IS 'Transport binding JSON imported after provisioning, for example {"SnsTopicArn":"..."}. Empty for Database topics.';

COMMENT ON COLUMN __mj."WorkQueueTopic"."Status" IS 'Active topics accept publishes; Disabled topics reject them.';

COMMENT ON TABLE __mj."WorkQueueSubscription" IS 'A consumer''s standing request for a topic''s messages: filter, partition mode, retry and lease policy, and where the handler runs.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."Name" IS 'Globally unique subscription name, used in manifests and consumer configuration.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."Description" IS 'What this consumer does and who owns it.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."Filter" IS 'Optional attribute filter as MJ CompositeFilterDescriptor JSON (03 section 4), restricted to the broker-translatable operators eq, neq, startswith, isnull and isnotnull over envelope attribute names. Null matches every message.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."PartitionMode" IS 'None: no key constraints. Exclusive: one delivery in flight per partition key, no order promise. Ordered (Database transport only): a key''s deliveries run in publish order, one at a time, and a dead-lettered head blocks its key. Immutable once the subscription has deliveries.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."MaxAttempts" IS 'Attempts allowed per delivery, including lease expiries, before it is dead-lettered.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."BackoffBaseSeconds" IS 'Base retry delay in seconds; full-jitter exponential backoff doubles it per attempt.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."BackoffMaxSeconds" IS 'Upper bound on the retry delay, in seconds.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."LeaseSeconds" IS 'Seconds a claim lasts before it expires unless renewed by a heartbeat. Measured on the transport clock.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."HeartbeatMode" IS 'Auto: the runtime renews the lease while the handler runs. Manual: only handler heartbeats renew it, so hung handlers are detected.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."MaxProcessingSeconds" IS 'Optional cap on handler run time; Auto heartbeats stop and the handler is aborted after it. Above a host''s known ceiling it produces a validation warning.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."HostType" IS 'MJWorker: the handler runs inside an MJ server process. External: the handler runs elsewhere, for example a Lambda (cloud transports only).';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."HandlerKey" IS 'ClassFactory key of the BaseWorkHandler registration that processes deliveries. Required for MJWorker subscriptions.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."ExternalRef" IS 'Informational reference to an external consumer, for example a Lambda ARN.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."BindingConfig" IS 'Transport binding JSON imported after provisioning, for example queue and dead-letter queue URLs. Empty for Database subscriptions.';

COMMENT ON COLUMN __mj."WorkQueueSubscription"."Status" IS 'Active: deliveries are created and processed. Paused: deliveries are created but nothing is claimed. Disabled: no new deliveries are created.';

COMMENT ON TABLE __mj."WorkQueueMessage" IS 'One published unit of work (the envelope). Immutable. Stored for Database-transport topics only. ID is the globally unique MessageID.';

COMMENT ON COLUMN __mj."WorkQueueMessage"."PublishOrdinal" IS 'Publish order, assigned by the database. Every delivery of the message carries it as its OrderKey.';

COMMENT ON COLUMN __mj."WorkQueueMessage"."PartitionKey" IS 'Producer-supplied key used by Exclusive and Ordered subscriptions. Compared case-sensitively (binary collation).';

COMMENT ON COLUMN __mj."WorkQueueMessage"."Attributes" IS 'JSON object of string attributes (at most 10). The only envelope fields subscription filters see.';

COMMENT ON COLUMN __mj."WorkQueueMessage"."Payload" IS 'Inline JSON payload. Mutually exclusive with PayloadRef.';

COMMENT ON COLUMN __mj."WorkQueueMessage"."PayloadRef" IS 'JSON claim-check reference ({"Uri":...}) to data held outside the queue.';

COMMENT ON COLUMN __mj."WorkQueueMessage"."CorrelationID" IS 'Caller-supplied identifier for tracing related work.';

COMMENT ON COLUMN __mj."WorkQueueMessage"."PublishedAt" IS 'When MJ accepted the publish, on the database clock.';

COMMENT ON TABLE __mj."WorkQueueDelivery" IS 'One subscription''s processing of one message: status, attempts and lease.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."Status" IS 'Pending: awaiting claim. InFlight: leased. Completed: handler succeeded. DeadLettered: exhausted or rejected, needs an operator. Discarded: cancelled or resolved by an operator.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."PartitionKey" IS 'Copy of the message partition key, populated only for Exclusive and Ordered subscriptions. Drives the in-flight uniqueness rule.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."OrderKey" IS 'Position within the partition key: always the message PublishOrdinal.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."AttemptCount" IS 'Claims so far, including claims whose lease expired. Reset to 0 by replay.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."IsReplay" IS '1 once an operator has replayed this delivery from the dead-letter state.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."VisibleAt" IS 'Earliest time the delivery may be claimed; retry backoff moves it forward.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."LeaseOwner" IS 'Worker instance holding the current lease.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."LeaseToken" IS 'New value per claim; a cancel leaves it unchanged. Every heartbeat and settle must present it, so a worker that lost its lease cannot overwrite a newer claim.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."LeaseExpiresAt" IS 'When the current lease expires, on the database clock.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."LastHeartbeatAt" IS 'When the lease was last renewed.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."Progress" IS 'Latest handler progress JSON ({"Percent","Message","Checkpoint"}).';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."LastError" IS 'Most recent failure text, including LeaseExpired.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."DeadLetterReason" IS 'Why the delivery was dead-lettered: a handler reason, MaxAttemptsExceeded, LeaseExpired or HandlerNotRegistered.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."DeadLetteredAt" IS 'When the delivery entered DeadLettered.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."CompletedAt" IS 'Terminal time for both Completed and Discarded; the retention purge key.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."CancelRequestedAt" IS 'Set when an operator cancels an in-flight delivery. From then on every holder write except AcknowledgeCancel fails; the holder acknowledges and the row becomes Discarded at once, or ExpireLeases discards it when the lease runs out. Never retried.';

COMMENT ON COLUMN __mj."WorkQueueDelivery"."ResolutionNote" IS 'Operator note recorded with a replay or the reason recorded with a discard.';

COMMENT ON TABLE __mj."WorkQueueDeduplication" IS 'Publish deduplication ledger for every transport: a key suppresses repeat publishes to a topic until ExpiresAt.';

COMMENT ON COLUMN __mj."WorkQueueDeduplication"."DeduplicationKey" IS 'Producer-supplied key identifying one logical message within the topic. Compared case-sensitively (binary collation).';

COMMENT ON COLUMN __mj."WorkQueueDeduplication"."MessageID" IS 'MessageID of the publish that owns the key. Not a foreign key: cloud messages have no row.';

COMMENT ON COLUMN __mj."WorkQueueDeduplication"."Status" IS 'Reserved: a send is in progress (short expiry) and proves nothing about its outcome. Confirmed: the publish was accepted. Only Confirmed rows make a later publish a Duplicate.';

COMMENT ON COLUMN __mj."WorkQueueDeduplication"."ExpiresAt" IS 'When the key stops suppressing duplicates. Expired rows are replaced on publish and purged by the sweeper.';

/* ===========================================================================
   EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL
   ---------------------------------------------------------------------------
   Contents: Entity and EntityField inserts, regenerated base views,
   spCreate/spUpdate/spDelete procedures, permission grants, and extended
   properties for the six work-queue tables above. It includes spCreate/spUpdate/
   spDelete for the driver-owned tables too: CodeGen emits them while the entities
   are new. They are never called — the API flags (metadata) and the entity save
   guards (work-queue-engine) are the protection (03 §6.7).
   DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace
   this entire generated section.
   =========================================================================== */
/* SQL generated to create new entity MJ: Work Queue Transports */
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
    '619f0ce1-795c-4b20-9e08-3c45f179aeb5',
    'MJ: Work Queue Transports',
    'Work Queue Transports',
    'A configured backend that stores and delivers work-queue messages (Database, AWS, ...). Topics bind to exactly one transport.',
    NULL,
    'WorkQueueTransport',
    'vwWorkQueueTransports',
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
/* SQL generated to add new entity MJ: Work Queue Transports to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '619f0ce1-795c-4b20-9e08-3c45f179aeb5',
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
/* SQL generated to add new permission for entity MJ: Work Queue Transports for role UI */
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
  CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS UUID),
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
      "EntityID" = CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Transports for role Developer */
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
  CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS UUID),
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
      "EntityID" = CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Transports for role Integration */
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
  CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS UUID),
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
      "EntityID" = CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Work Queue Topics */
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
    'f4d03836-2513-4e94-9ba4-0cd3d968b849',
    'MJ: Work Queue Topics',
    'Work Queue Topics',
    'A named destination producers publish work to. Each topic is bound to one transport and fans out to its subscriptions.',
    NULL,
    'WorkQueueTopic',
    'vwWorkQueueTopics',
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
/* SQL generated to add new entity MJ: Work Queue Topics to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'f4d03836-2513-4e94-9ba4-0cd3d968b849',
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
/* SQL generated to add new permission for entity MJ: Work Queue Topics for role UI */
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
  CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS UUID),
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
      "EntityID" = CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Topics for role Developer */
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
  CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS UUID),
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
      "EntityID" = CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Topics for role Integration */
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
  CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS UUID),
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
      "EntityID" = CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Work Queue Subscriptions */
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
    'f75584c0-1bb2-4645-aa4c-24d35b43d45a',
    'MJ: Work Queue Subscriptions',
    'Work Queue Subscriptions',
    'A consumer''s standing request for a topic''s messages: filter, partition mode, retry and lease policy, and where the handler runs.',
    NULL,
    'WorkQueueSubscription',
    'vwWorkQueueSubscriptions',
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
/* SQL generated to add new entity MJ: Work Queue Subscriptions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'f75584c0-1bb2-4645-aa4c-24d35b43d45a',
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
/* SQL generated to add new permission for entity MJ: Work Queue Subscriptions for role UI */
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
  CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS UUID),
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
      "EntityID" = CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Subscriptions for role Developer */
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
  CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS UUID),
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
      "EntityID" = CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Subscriptions for role Integration */
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
  CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS UUID),
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
      "EntityID" = CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Work Queue Messages */
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
    '2917b8d0-e525-41c0-a8c8-c4f58cd9a09a',
    'MJ: Work Queue Messages',
    'Work Queue Messages',
    'One published unit of work (the envelope). Immutable. Stored for Database-transport topics only. ID is the globally unique MessageID.',
    NULL,
    'WorkQueueMessage',
    'vwWorkQueueMessages',
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
/* SQL generated to add new entity MJ: Work Queue Messages to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '2917b8d0-e525-41c0-a8c8-c4f58cd9a09a',
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
/* SQL generated to add new permission for entity MJ: Work Queue Messages for role UI */
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
  CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS UUID),
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
      "EntityID" = CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Messages for role Developer */
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
  CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS UUID),
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
      "EntityID" = CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Messages for role Integration */
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
  CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS UUID),
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
      "EntityID" = CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Work Queue Deliveries */
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
    'd0a12fdf-8956-419c-81df-37a0127a60d2',
    'MJ: Work Queue Deliveries',
    'Work Queue Deliveries',
    'One subscription''s processing of one message: status, attempts and lease.',
    NULL,
    'WorkQueueDelivery',
    'vwWorkQueueDeliveries',
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
/* SQL generated to add new entity MJ: Work Queue Deliveries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'd0a12fdf-8956-419c-81df-37a0127a60d2',
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
/* SQL generated to add new permission for entity MJ: Work Queue Deliveries for role UI */
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
  CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS UUID),
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
      "EntityID" = CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Deliveries for role Developer */
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
  CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS UUID),
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
      "EntityID" = CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Deliveries for role Integration */
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
  CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS UUID),
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
      "EntityID" = CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Work Queue Deduplications */
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
    '2b559b5c-0e81-4eb8-80d8-26943e0a49be',
    'MJ: Work Queue Deduplications',
    'Work Queue Deduplications',
    'Publish deduplication ledger for every transport: a key suppresses repeat publishes to a topic until ExpiresAt.',
    NULL,
    'WorkQueueDeduplication',
    'vwWorkQueueDeduplications',
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
/* SQL generated to add new entity MJ: Work Queue Deduplications to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '2b559b5c-0e81-4eb8-80d8-26943e0a49be',
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
/* SQL generated to add new permission for entity MJ: Work Queue Deduplications for role UI */
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
  CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS UUID),
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
      "EntityID" = CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Deduplications for role Developer */
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
  CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS UUID),
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
      "EntityID" = CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Work Queue Deduplications for role Integration */
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
  CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS UUID),
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
      "EntityID" = CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."WorkQueueTopic"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueTopic */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueTopic */
UPDATE __mj."WorkQueueTopic" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueTopic' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueTopic" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueTopic" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueTopic"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueTopic */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueTopic */
UPDATE __mj."WorkQueueTopic" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueTopic' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueTopic" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueTopic" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueSubscription"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueSubscription */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueSubscription */
UPDATE __mj."WorkQueueSubscription" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueSubscription' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueSubscription" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueSubscription" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueSubscription"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueSubscription */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueSubscription */
UPDATE __mj."WorkQueueSubscription" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueSubscription' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueSubscription" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueSubscription" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueDeduplication"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueDeduplication */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueDeduplication */
UPDATE __mj."WorkQueueDeduplication" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueDeduplication' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueDeduplication" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueDeduplication" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueDeduplication"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueDeduplication */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueDeduplication */
UPDATE __mj."WorkQueueDeduplication" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueDeduplication' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueDeduplication" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueDeduplication" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueDelivery"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueDelivery */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueDelivery */
UPDATE __mj."WorkQueueDelivery" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueDelivery' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueDelivery" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueDelivery" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueDelivery"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueDelivery */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueDelivery */
UPDATE __mj."WorkQueueDelivery" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueDelivery' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueDelivery" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueDelivery" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueTransport"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueTransport */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueTransport */
UPDATE __mj."WorkQueueTransport" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueTransport' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueTransport" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueTransport" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueTransport"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueTransport */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueTransport */
UPDATE __mj."WorkQueueTransport" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueTransport' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueTransport" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueTransport" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueMessage"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueMessage */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.WorkQueueMessage */
UPDATE __mj."WorkQueueMessage" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueMessage' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueMessage" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueMessage" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."WorkQueueMessage"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueMessage */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.WorkQueueMessage */
UPDATE __mj."WorkQueueMessage" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'WorkQueueMessage' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."WorkQueueMessage" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."WorkQueueMessage" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cc622ade-238d-4c9c-bd11-3563d4b11ccd' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cc622ade-238d-4c9c-bd11-3563d4b11ccd', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e24a800b-a1fb-4b99-8864-871bcc1eb64a' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e24a800b-a1fb-4b99-8864-871bcc1eb64a', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'Name', 'Name', 'Unique dotted lowercase topic name, for example email.events.', 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bff58867-8c6d-4283-beae-85df2a9dea2c' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bff58867-8c6d-4283-beae-85df2a9dea2c', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'Description', 'Description', 'What the topic represents and who publishes to it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd9da7bb-8d36-41b7-8dfb-45ccd323733a' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'TransportID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd9da7bb-8d36-41b7-8dfb-45ccd323733a', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'TransportID', 'Transport ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '619F0CE1-795C-4B20-9E08-3C45F179AEB5', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd20fcaec-b513-42f6-bc18-9a2f157ae68f' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'IsFifo')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d20fcaec-b513-42f6-bc18-9a2f157ae68f', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'IsFifo', 'Is Fifo', 'Cloud transports: the topic uses FIFO resources. Required on AWS when any subscription is Exclusive.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '882a6be1-9ca5-41a1-acaa-6f31c78a46a9' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'AllowExternalPublish')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('882a6be1-9ca5-41a1-acaa-6f31c78a46a9', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'AllowExternalPublish', 'Allow External Publish', 'When 1, API callers may publish to this topic through POST /work-queue/topics/{topic}/messages. In-process code may publish to any active topic.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08e8dcb4-763d-4344-ba89-e4619862b5e1' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'MaxPayloadBytes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('08e8dcb4-763d-4344-ba89-e4619862b5e1', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'MaxPayloadBytes', 'Max Payload Bytes', 'Largest serialized envelope accepted, in bytes (at most 262144).', 'int', 4, 10, 0, FALSE, '(262144)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e044d535-6a19-4f15-ab21-9367e5961791' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'DefaultDeduplicationTTLSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e044d535-6a19-4f15-ab21-9367e5961791', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'DefaultDeduplicationTTLSeconds', 'Default Deduplication TTL Seconds', 'Window, in seconds, during which a DeduplicationKey suppresses repeat publishes when the publisher does not supply one.', 'int', 4, 10, 0, FALSE, '(86400)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7f24b7bc-3d12-4d1d-889b-35dd6e0085b3' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'RetentionDays')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7f24b7bc-3d12-4d1d-889b-35dd6e0085b3', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'RetentionDays', 'Retention Days', 'Days completed and discarded deliveries, and their messages, are kept before the sweeper purges them (Database transport).', 'int', 4, 10, 0, FALSE, '(7)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a0a38b96-00da-4539-aab6-1f67f1d0808b' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'BindingConfig')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a0a38b96-00da-4539-aab6-1f67f1d0808b', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'BindingConfig', 'Binding Config', 'Transport binding JSON imported after provisioning, for example {"SnsTopicArn":"..."}. Empty for Database topics.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4400478c-1407-4eda-80a1-081bfddf6387' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4400478c-1407-4eda-80a1-081bfddf6387', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'Status', 'Status', 'Active topics accept publishes; Disabled topics reject them.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '24b58011-57bf-4058-8c2b-a3bac668271e' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('24b58011-57bf-4058-8c2b-a3bac668271e', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ddd6860-2938-44b7-a576-91f6e34f138b' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ddd6860-2938-44b7-a576-91f6e34f138b', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8fc61758-4696-4637-af01-7d0e9acdd4a5' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8fc61758-4696-4637-af01-7d0e9acdd4a5', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a296d756-5031-430f-b395-f8140f8187a3' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'TopicID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a296d756-5031-430f-b395-f8140f8187a3', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'TopicID', 'Topic ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c02cdf44-a243-431a-a6b5-f6e5ebe2b019' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c02cdf44-a243-431a-a6b5-f6e5ebe2b019', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'Name', 'Name', 'Globally unique subscription name, used in manifests and consumer configuration.', 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1ae09fe6-2778-45f6-8e35-60487d22a33c' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1ae09fe6-2778-45f6-8e35-60487d22a33c', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'Description', 'Description', 'What this consumer does and who owns it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3b0969a3-ed66-4020-b4ae-c3d277cac58f' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'Filter')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3b0969a3-ed66-4020-b4ae-c3d277cac58f', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'Filter', 'Filter', 'Optional attribute filter as MJ CompositeFilterDescriptor JSON (03 section 4), restricted to the broker-translatable operators eq, neq, startswith, isnull and isnotnull over envelope attribute names. Null matches every message.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6d642099-5e3e-4107-8f30-9f6fa33c075f' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'PartitionMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6d642099-5e3e-4107-8f30-9f6fa33c075f', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'PartitionMode', 'Partition Mode', 'None: no key constraints. Exclusive: one delivery in flight per partition key, no order promise. Ordered (Database transport only): a key''s deliveries run in publish order, one at a time, and a dead-lettered head blocks its key. Immutable once the subscription has deliveries.', 'nvarchar', 40, 0, 0, FALSE, 'None', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ed1306a1-ebc7-4d3b-b026-856b8142d2a1' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'MaxAttempts')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ed1306a1-ebc7-4d3b-b026-856b8142d2a1', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'MaxAttempts', 'Max Attempts', 'Attempts allowed per delivery, including lease expiries, before it is dead-lettered.', 'int', 4, 10, 0, FALSE, '(5)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6f62fa35-c0df-4539-bb72-1bb73f7c533e' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'BackoffBaseSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6f62fa35-c0df-4539-bb72-1bb73f7c533e', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'BackoffBaseSeconds', 'Backoff Base Seconds', 'Base retry delay in seconds; full-jitter exponential backoff doubles it per attempt.', 'int', 4, 10, 0, FALSE, '(10)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1f27ac8f-3709-4313-9597-1aa891ab9a54' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'BackoffMaxSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1f27ac8f-3709-4313-9597-1aa891ab9a54', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'BackoffMaxSeconds', 'Backoff Max Seconds', 'Upper bound on the retry delay, in seconds.', 'int', 4, 10, 0, FALSE, '(900)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ac93faa-a812-44a9-a50d-f614639cea26' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'LeaseSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ac93faa-a812-44a9-a50d-f614639cea26', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'LeaseSeconds', 'Lease Seconds', 'Seconds a claim lasts before it expires unless renewed by a heartbeat. Measured on the transport clock.', 'int', 4, 10, 0, FALSE, '(60)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b1d0c3b6-93ca-41e0-8e4a-5385d67c2e18' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'HeartbeatMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b1d0c3b6-93ca-41e0-8e4a-5385d67c2e18', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'HeartbeatMode', 'Heartbeat Mode', 'Auto: the runtime renews the lease while the handler runs. Manual: only handler heartbeats renew it, so hung handlers are detected.', 'nvarchar', 40, 0, 0, FALSE, 'Auto', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd5699162-a9cd-487f-9fc3-8de76f7cc2ac' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'MaxProcessingSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d5699162-a9cd-487f-9fc3-8de76f7cc2ac', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'MaxProcessingSeconds', 'Max Processing Seconds', 'Optional cap on handler run time; Auto heartbeats stop and the handler is aborted after it. Above a host''s known ceiling it produces a validation warning.', 'int', 4, 10, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '90b702a1-819f-44e8-acb5-edd7c717af77' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'HostType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('90b702a1-819f-44e8-acb5-edd7c717af77', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'HostType', 'Host Type', 'MJWorker: the handler runs inside an MJ server process. External: the handler runs elsewhere, for example a Lambda (cloud transports only).', 'nvarchar', 40, 0, 0, FALSE, 'MJWorker', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef551432-c7f5-4397-aeb2-48632e8d200f' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'HandlerKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ef551432-c7f5-4397-aeb2-48632e8d200f', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'HandlerKey', 'Handler Key', 'ClassFactory key of the BaseWorkHandler registration that processes deliveries. Required for MJWorker subscriptions.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8ad1e4b4-e742-4a0e-b5fd-24b83df23281' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'ExternalRef')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8ad1e4b4-e742-4a0e-b5fd-24b83df23281', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'ExternalRef', 'External Ref', 'Informational reference to an external consumer, for example a Lambda ARN.', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f4acdcbb-d0fb-42be-a99a-f7837724f111' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'BindingConfig')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f4acdcbb-d0fb-42be-a99a-f7837724f111', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'BindingConfig', 'Binding Config', 'Transport binding JSON imported after provisioning, for example queue and dead-letter queue URLs. Empty for Database subscriptions.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f57387a0-3683-4b96-8bb5-d3d36f2b4604' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f57387a0-3683-4b96-8bb5-d3d36f2b4604', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'Status', 'Status', 'Active: deliveries are created and processed. Paused: deliveries are created but nothing is claimed. Disabled: no new deliveries are created.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9efa1480-8112-413a-b022-bd770a6ea22d' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9efa1480-8112-413a-b022-bd770a6ea22d', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b7d1ce1e-dc6e-4bea-bf57-1bc1a7550c49' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b7d1ce1e-dc6e-4bea-bf57-1bc1a7550c49', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88ebea46-f7bd-4bd9-bc48-9a9f75f23e25' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88ebea46-f7bd-4bd9-bc48-9a9f75f23e25', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7c6b2bad-997c-4dcd-b012-559141ae9c86' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = 'TopicID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7c6b2bad-997c-4dcd-b012-559141ae9c86', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), 'TopicID', 'Topic ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '601cd526-4a66-4673-adae-c70e774d98a8' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = 'DeduplicationKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('601cd526-4a66-4673-adae-c70e774d98a8', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), 'DeduplicationKey', 'Deduplication Key', 'Producer-supplied key identifying one logical message within the topic. Compared case-sensitively (binary collation).', 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3d3a7e0e-8f2c-4caf-8879-296881e2bc40' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = 'MessageID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3d3a7e0e-8f2c-4caf-8879-296881e2bc40', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), 'MessageID', 'Message ID', 'MessageID of the publish that owns the key. Not a foreign key: cloud messages have no row.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '01b08d72-b840-4944-864c-86aa798725b2' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('01b08d72-b840-4944-864c-86aa798725b2', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), 'Status', 'Status', 'Reserved: a send is in progress (short expiry) and proves nothing about its outcome. Confirmed: the publish was accepted. Only Confirmed rows make a later publish a Duplicate.', 'nvarchar', 40, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0fb12c3f-9e76-41ee-a34f-f409aadb11bc' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = 'ExpiresAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0fb12c3f-9e76-41ee-a34f-f409aadb11bc', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), 'ExpiresAt', 'Expires At', 'When the key stops suppressing duplicates. Expired rows are replaced on publish and purged by the sweeper.', 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce3720a0-0bea-40a2-b8b4-1305ed720b95' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ce3720a0-0bea-40a2-b8b4-1305ed720b95', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c81f1b2a-6ab2-4fd0-aa51-de74fd8ccc16' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c81f1b2a-6ab2-4fd0-aa51-de74fd8ccc16', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c4928aa0-ce82-4125-814f-718f1a56caa3' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c4928aa0-ce82-4125-814f-718f1a56caa3', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ef3f7ada-162d-4343-8ae2-8ff5be5b9e00' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'MessageID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ef3f7ada-162d-4343-8ae2-8ff5be5b9e00', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'MessageID', 'Message ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e22c4cbc-d8f2-4268-997b-dacb73734034' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'SubscriptionID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e22c4cbc-d8f2-4268-997b-dacb73734034', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'SubscriptionID', 'Subscription ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'F75584C0-1BB2-4645-AA4C-24D35B43D45A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae1a3b3e-07d2-4564-860a-9a5bd1735e7c' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ae1a3b3e-07d2-4564-860a-9a5bd1735e7c', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'Status', 'Status', 'Pending: awaiting claim. InFlight: leased. Completed: handler succeeded. DeadLettered: exhausted or rejected, needs an operator. Discarded: cancelled or resolved by an operator.', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8a45510e-0876-4e90-9037-e9149c509c9a' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'PartitionKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8a45510e-0876-4e90-9037-e9149c509c9a', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'PartitionKey', 'Partition Key', 'Copy of the message partition key, populated only for Exclusive and Ordered subscriptions. Drives the in-flight uniqueness rule.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aa1b6a14-b82c-4434-8f60-027c725c9898' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'OrderKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aa1b6a14-b82c-4434-8f60-027c725c9898', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'OrderKey', 'Order Key', 'Position within the partition key: always the message PublishOrdinal.', 'bigint', 8, 19, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '68c643eb-19d1-47dd-a6f0-ef7ea9f71267' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'AttemptCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68c643eb-19d1-47dd-a6f0-ef7ea9f71267', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'AttemptCount', 'Attempt Count', 'Claims so far, including claims whose lease expired. Reset to 0 by replay.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0bec42e1-dffb-484a-a1bb-73f5303b0cc3' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'IsReplay')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0bec42e1-dffb-484a-a1bb-73f5303b0cc3', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'IsReplay', 'Is Replay', '1 once an operator has replayed this delivery from the dead-letter state.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5eca4dd4-c610-41e7-9065-a368c071c86b' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'VisibleAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5eca4dd4-c610-41e7-9065-a368c071c86b', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'VisibleAt', 'Visible At', 'Earliest time the delivery may be claimed; retry backoff moves it forward.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '71b48048-3f24-4be2-b9f6-f9d271efae19' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'LeaseOwner')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('71b48048-3f24-4be2-b9f6-f9d271efae19', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'LeaseOwner', 'Lease Owner', 'Worker instance holding the current lease.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b2680f77-4167-4edb-930d-9b4772ccbfe7' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'LeaseToken')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b2680f77-4167-4edb-930d-9b4772ccbfe7', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'LeaseToken', 'Lease Token', 'New value per claim; a cancel leaves it unchanged. Every heartbeat and settle must present it, so a worker that lost its lease cannot overwrite a newer claim.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '164ed4e5-192a-4cb8-a792-28a98d96f38d' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'LeaseExpiresAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('164ed4e5-192a-4cb8-a792-28a98d96f38d', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'LeaseExpiresAt', 'Lease Expires At', 'When the current lease expires, on the database clock.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5476187f-b221-4cfc-abb2-e09285232c1c' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'LastHeartbeatAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5476187f-b221-4cfc-abb2-e09285232c1c', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'LastHeartbeatAt', 'Last Heartbeat At', 'When the lease was last renewed.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '85b349a6-7437-4ef8-b566-6ea9b0abde92' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'Progress')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('85b349a6-7437-4ef8-b566-6ea9b0abde92', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'Progress', 'Progress', 'Latest handler progress JSON ({"Percent","Message","Checkpoint"}).', 'nvarchar', 8000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a3159983-3901-4cc3-9581-3c32f69a0782' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'LastError')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a3159983-3901-4cc3-9581-3c32f69a0782', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'LastError', 'Last Error', 'Most recent failure text, including LeaseExpired.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7484fa00-400b-4eb5-92c8-ec1605308b34' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'DeadLetterReason')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7484fa00-400b-4eb5-92c8-ec1605308b34', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'DeadLetterReason', 'Dead Letter Reason', 'Why the delivery was dead-lettered: a handler reason, MaxAttemptsExceeded, LeaseExpired or HandlerNotRegistered.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ac3e8f9a-77d9-450b-b55e-7e0f6703d9e3' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'DeadLetteredAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ac3e8f9a-77d9-450b-b55e-7e0f6703d9e3', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'DeadLetteredAt', 'Dead Lettered At', 'When the delivery entered DeadLettered.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2ee4890d-a306-4224-91a2-188422128dc4' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'CompletedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2ee4890d-a306-4224-91a2-188422128dc4', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'CompletedAt', 'Completed At', 'Terminal time for both Completed and Discarded; the retention purge key.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb6eeddf-c23f-4cf7-b6f5-d26e347c2946' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'CancelRequestedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('eb6eeddf-c23f-4cf7-b6f5-d26e347c2946', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'CancelRequestedAt', 'Cancel Requested At', 'Set when an operator cancels an in-flight delivery. From then on every holder write except AcknowledgeCancel fails; the holder acknowledges and the row becomes Discarded at once, or ExpireLeases discards it when the lease runs out. Never retried.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4e26cd8f-6b2c-42fa-acbc-301aee97e360' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'ResolvedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4e26cd8f-6b2c-42fa-acbc-301aee97e360', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'ResolvedByUserID', 'Resolved By User ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03bb502b-4cab-4157-8b74-56bb2dde4400' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'ResolutionNote')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03bb502b-4cab-4157-8b74-56bb2dde4400', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'ResolutionNote', 'Resolution Note', 'Operator note recorded with a replay or the reason recorded with a discard.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4e2a0e6-1fc8-490e-8c51-dbff8cdf4919' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4e2a0e6-1fc8-490e-8c51-dbff8cdf4919', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f0719dba-9938-47d7-8b56-c5db1876f847' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f0719dba-9938-47d7-8b56-c5db1876f847', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3a4f7940-ffd2-439d-8a49-1349d1321083' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3a4f7940-ffd2-439d-8a49-1349d1321083', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '016c4343-fa35-4af1-ac3f-8f54949a6592' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('016c4343-fa35-4af1-ac3f-8f54949a6592', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'Name', 'Name', 'Unique transport name, for example Database or AWS-prod-us-east-1.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '65f509af-7c0c-470c-acf5-1ca9f4ab5553' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('65f509af-7c0c-470c-acf5-1ca9f4ab5553', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'Description', 'Description', 'What this transport is used for and who operates it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '16666639-5cf4-4b63-a27b-bd02c7320334' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'DriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('16666639-5cf4-4b63-a27b-bd02c7320334', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'DriverClass', 'Driver Class', 'ClassFactory key of the BaseTransportDriverFactory registration that builds the driver: Database or AWS.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e11903cd-f43b-435d-bde4-b359b1742150' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e11903cd-f43b-435d-bde4-b359b1742150', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'Configuration', 'Configuration', 'Driver-specific JSON configuration, for example {"Region":"us-east-1"}. Never holds secrets; use CredentialID.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ff986e0f-d132-4e7f-b3ea-1df2f150b28e' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'CredentialID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ff986e0f-d132-4e7f-b3ea-1df2f150b28e', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'CredentialID', 'Credential ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e02179b9-e69d-4986-98ee-fb87ecb1bde5' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e02179b9-e69d-4986-98ee-fb87ecb1bde5', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'Status', 'Status', 'Active transports can deliver; Disabled transports reject publishes.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '985a335c-68f6-4c55-8400-755aecab5f00' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('985a335c-68f6-4c55-8400-755aecab5f00', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd9ab930-910d-401a-8834-b181d3d82326' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd9ab930-910d-401a-8834-b181d3d82326', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cfc35288-6047-40fa-83a8-a9c60f20ffaf' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cfc35288-6047-40fa-83a8-a9c60f20ffaf', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e6a1469c-6f9d-485b-9037-6634e4757392' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'PublishOrdinal')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e6a1469c-6f9d-485b-9037-6634e4757392', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'PublishOrdinal', 'Publish Ordinal', 'Publish order, assigned by the database. Every delivery of the message carries it as its OrderKey.', 'bigint', 8, 19, 0, FALSE, NULL, TRUE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8f1b739b-adc5-45f2-ab6e-877f431884a0' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'TopicID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f1b739b-adc5-45f2-ab6e-877f431884a0', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'TopicID', 'Topic ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dcefa061-624f-4cd7-98c5-a8c6becafe6e' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'PartitionKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('dcefa061-624f-4cd7-98c5-a8c6becafe6e', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'PartitionKey', 'Partition Key', 'Producer-supplied key used by Exclusive and Ordered subscriptions. Compared case-sensitively (binary collation).', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3f75b4d7-ca85-4b71-a038-124be0170493' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'Attributes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3f75b4d7-ca85-4b71-a038-124be0170493', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'Attributes', 'Attributes', 'JSON object of string attributes (at most 10). The only envelope fields subscription filters see.', 'nvarchar', 8000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88c35806-f57d-411e-8935-fb2094bc554d' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'Payload')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88c35806-f57d-411e-8935-fb2094bc554d', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'Payload', 'Payload', 'Inline JSON payload. Mutually exclusive with PayloadRef.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '68cf108c-6d46-4419-9a48-db68fab1eff4' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'PayloadRef')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68cf108c-6d46-4419-9a48-db68fab1eff4', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'PayloadRef', 'Payload Ref', 'JSON claim-check reference ({"Uri":...}) to data held outside the queue.', 'nvarchar', 4000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5be24ef6-0b0b-4634-b5d6-47045b061c85' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'CorrelationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5be24ef6-0b0b-4634-b5d6-47045b061c85', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'CorrelationID', 'Correlation ID', 'Caller-supplied identifier for tracing related work.', 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8bb91f25-6792-4b18-8da5-7cc538075b79' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'PublishedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8bb91f25-6792-4b18-8da5-7cc538075b79', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'PublishedAt', 'Published At', 'When MJ accepted the publish, on the database clock.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysdatetimeoffset()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7db4c98-ec8a-4e52-9053-396dc0eabdf3' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'PublishedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a7db4c98-ec8a-4e52-9053-396dc0eabdf3', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'PublishedByUserID', 'Published By User ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '495d4e78-0938-4dfb-9b41-3d8ce413f940' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('495d4e78-0938-4dfb-9b41-3d8ce413f940', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6a15ca5-1971-4252-a13d-0e1772167fa4' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6a15ca5-1971-4252-a13d-0e1772167fa4', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 758a50a0-30d8-4224-bbfe-616cee8ad3e1 */
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
    '758a50a0-30d8-4224-bbfe-616cee8ad3e1',
    'E02179B9-E69D-4986-98EE-FB87ECB1BDE5',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 450d2f77-d364-4250-8ac7-21ebee15dc95 */
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
    '450d2f77-d364-4250-8ac7-21ebee15dc95',
    'E02179B9-E69D-4986-98EE-FB87ECB1BDE5',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID E02179B9-E69D-4986-98EE-FB87ECB1BDE5 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'E02179B9-E69D-4986-98EE-FB87ECB1BDE5';
/* SQL text to insert entity field value with ID be9bd22d-d56c-45a5-9004-4353a525579b */
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
    'be9bd22d-d56c-45a5-9004-4353a525579b',
    '4400478C-1407-4EDA-80A1-081BFDDF6387',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c902503f-52f4-4a04-9a2e-61999af0d631 */
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
    'c902503f-52f4-4a04-9a2e-61999af0d631',
    '4400478C-1407-4EDA-80A1-081BFDDF6387',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 4400478C-1407-4EDA-80A1-081BFDDF6387 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4400478C-1407-4EDA-80A1-081BFDDF6387';
/* SQL text to insert entity field value with ID e2624244-dcc3-4fa1-b767-eea5182a3d17 */
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
    'e2624244-dcc3-4fa1-b767-eea5182a3d17',
    '6D642099-5E3E-4107-8F30-9F6FA33C075F',
    1,
    'Exclusive',
    'Exclusive',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4bcf210a-f960-4d8d-95cb-3f05b695edff */
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
    '4bcf210a-f960-4d8d-95cb-3f05b695edff',
    '6D642099-5E3E-4107-8F30-9F6FA33C075F',
    2,
    'None',
    'None',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b53d10de-4686-4649-b744-99bee8edb6c8 */
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
    'b53d10de-4686-4649-b744-99bee8edb6c8',
    '6D642099-5E3E-4107-8F30-9F6FA33C075F',
    3,
    'Ordered',
    'Ordered',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 6D642099-5E3E-4107-8F30-9F6FA33C075F */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '6D642099-5E3E-4107-8F30-9F6FA33C075F';
/* SQL text to insert entity field value with ID a444d3d7-0439-4667-a3e1-7b4b95f7b237 */
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
    'a444d3d7-0439-4667-a3e1-7b4b95f7b237',
    'B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18',
    1,
    'Auto',
    'Auto',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ee3d5a34-e7b3-45ab-a97a-2faadbed3ce6 */
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
    'ee3d5a34-e7b3-45ab-a97a-2faadbed3ce6',
    'B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18',
    2,
    'Manual',
    'Manual',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18';
/* SQL text to insert entity field value with ID b87e8e20-32c7-4aef-ba00-039823af993d */
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
    'b87e8e20-32c7-4aef-ba00-039823af993d',
    '90B702A1-819F-44E8-ACB5-EDD7C717AF77',
    1,
    'External',
    'External',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f85bd964-63c9-4360-b3ac-333984428493 */
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
    'f85bd964-63c9-4360-b3ac-333984428493',
    '90B702A1-819F-44E8-ACB5-EDD7C717AF77',
    2,
    'MJWorker',
    'MJWorker',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 90B702A1-819F-44E8-ACB5-EDD7C717AF77 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '90B702A1-819F-44E8-ACB5-EDD7C717AF77';
/* SQL text to insert entity field value with ID 065413aa-8d2d-409e-9fac-83ae7c1302b2 */
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
    '065413aa-8d2d-409e-9fac-83ae7c1302b2',
    'F57387A0-3683-4B96-8BB5-D3D36F2B4604',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e008d53c-6552-46a7-984d-4ac51a03e7e5 */
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
    'e008d53c-6552-46a7-984d-4ac51a03e7e5',
    'F57387A0-3683-4B96-8BB5-D3D36F2B4604',
    2,
    'Disabled',
    'Disabled',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a127ed05-77da-46b2-9b1c-3eed6564c075 */
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
    'a127ed05-77da-46b2-9b1c-3eed6564c075',
    'F57387A0-3683-4B96-8BB5-D3D36F2B4604',
    3,
    'Paused',
    'Paused',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID F57387A0-3683-4B96-8BB5-D3D36F2B4604 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F57387A0-3683-4B96-8BB5-D3D36F2B4604';
/* SQL text to insert entity field value with ID f9ad8261-bfc1-4bf8-9914-93abf6261ed8 */
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
    'f9ad8261-bfc1-4bf8-9914-93abf6261ed8',
    'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C',
    1,
    'Completed',
    'Completed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID cbe05aeb-effc-442e-a214-3450618aed17 */
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
    'cbe05aeb-effc-442e-a214-3450618aed17',
    'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C',
    2,
    'DeadLettered',
    'DeadLettered',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bf6cd4ac-180c-4891-aa0f-5f79353bfedd */
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
    'bf6cd4ac-180c-4891-aa0f-5f79353bfedd',
    'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C',
    3,
    'Discarded',
    'Discarded',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6c9dd949-0a61-4ae7-9d21-9008c9ab0595 */
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
    '6c9dd949-0a61-4ae7-9d21-9008c9ab0595',
    'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C',
    4,
    'InFlight',
    'InFlight',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 74366eb0-7f8f-4b46-8e3b-45bb37e4051f */
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
    '74366eb0-7f8f-4b46-8e3b-45bb37e4051f',
    'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C',
    5,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID AE1A3B3E-07D2-4564-860A-9A5BD1735E7C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C';
/* SQL text to insert entity field value with ID dc03b028-15ac-431e-b5ee-d8c525d95494 */
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
    'dc03b028-15ac-431e-b5ee-d8c525d95494',
    '01B08D72-B840-4944-864C-86AA798725B2',
    1,
    'Confirmed',
    'Confirmed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6702e933-ca65-4300-95e4-ee5aac81c89e */
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
    '6702e933-ca65-4300-95e4-ee5aac81c89e',
    '01B08D72-B840-4944-864C-86AA798725B2',
    2,
    'Reserved',
    'Reserved',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 01B08D72-B840-4944-864C-86AA798725B2 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '01B08D72-B840-4944-864C-86AA798725B2';
/* Deterministic search-flag hygiene — seed name fields */
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = TRUE, "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" IN (
    SELECT
      "ranked"."ID"
    FROM (
      SELECT
        "f"."ID",
        ROW_NUMBER() OVER (PARTITION BY "f"."EntityID" ORDER BY "f"."Sequence", "f"."Name") AS "rn"
      FROM __mj."EntityField" AS "f"
      INNER JOIN __mj."Entity" AS "e"
        ON "e"."ID" = "f"."EntityID"
      WHERE
        LOWER("f"."Name") IN (
          'name',
          'title',
          'firstname',
          'lastname',
          'middlename',
          'displayname',
          'fullname',
          'label'
        )
        AND "f"."AutoUpdateIncludeInUserSearchAPI" = TRUE
        AND "f"."IncludeInUserSearchAPI" = FALSE
        AND COALESCE("f"."IsPrimaryKey", FALSE) = FALSE
        AND COALESCE("f"."IsVirtual", FALSE) = FALSE
        AND LOWER("f"."Type") IN ('nvarchar', 'varchar', 'char', 'nchar')
        AND COALESCE("f"."Length", 0) <> -1
        AND "e"."VirtualEntity" = FALSE
        AND "e"."AllowUserSearchAPI" = TRUE
        AND COALESCE("e"."FullTextSearchEnabled", FALSE) = FALSE
        AND NOT (
          (
            "e"."Name" = 'Logs' OR "e"."Name" LIKE '% Logs'
          )
          OR (
            "e"."Name" = 'Log' OR "e"."Name" LIKE '% Log'
          )
          OR (
            "e"."Name" = 'Runs' OR "e"."Name" LIKE '% Runs'
          )
          OR (
            "e"."Name" = 'Run' OR "e"."Name" LIKE '% Run'
          )
          OR (
            "e"."Name" = 'Run History' OR "e"."Name" LIKE '% Run History'
          )
          OR (
            "e"."Name" = 'Run Steps' OR "e"."Name" LIKE '% Run Steps'
          )
          OR (
            "e"."Name" = 'Run Messages' OR "e"."Name" LIKE '% Run Messages'
          )
          OR (
            "e"."Name" = 'Execution Logs' OR "e"."Name" LIKE '% Execution Logs'
          )
          OR (
            "e"."Name" = 'Details' OR "e"."Name" LIKE '% Details'
          )
          OR (
            "e"."Name" = 'Detail' OR "e"."Name" LIKE '% Detail'
          )
          OR (
            "e"."Name" = 'Lines' OR "e"."Name" LIKE '% Lines'
          )
          OR (
            "e"."Name" = 'Line' OR "e"."Name" LIKE '% Line'
          )
          OR (
            "e"."Name" = 'Items' OR "e"."Name" LIKE '% Items'
          )
          OR (
            "e"."Name" = 'Item' OR "e"."Name" LIKE '% Item'
          )
          OR (
            "e"."Name" = 'Steps' OR "e"."Name" LIKE '% Steps'
          )
          OR (
            "e"."Name" = 'Step' OR "e"."Name" LIKE '% Step'
          )
          OR (
            "e"."Name" = 'Params' OR "e"."Name" LIKE '% Params'
          )
          OR (
            "e"."Name" = 'Param' OR "e"."Name" LIKE '% Param'
          )
          OR (
            "e"."Name" = 'Mappings' OR "e"."Name" LIKE '% Mappings'
          )
          OR (
            "e"."Name" = 'Mapping' OR "e"."Name" LIKE '% Mapping'
          )
          OR (
            "e"."Name" = 'Audit'
            OR "e"."Name" LIKE 'Audit %'
            OR "e"."Name" LIKE '% Audit'
            OR "e"."Name" LIKE '% Audit %'
          )
          OR (
            "e"."Name" = 'Record Change'
            OR "e"."Name" LIKE 'Record Change %'
            OR "e"."Name" LIKE '% Record Change'
            OR "e"."Name" LIKE '% Record Change %'
          )
        )
        AND NOT "e"."SchemaName" IN ('sys', 'staging')
        AND NOT EXISTS(
          SELECT
            1
          FROM __mj."EntityField" AS "f2"
          WHERE
            "f2"."EntityID" = "e"."ID" AND "f2"."IncludeInUserSearchAPI" = TRUE
        )
    ) AS "ranked"
    WHERE
      "ranked"."rn" <= 3
  );
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
/* Create Entity Relationship: MJ: Work Queue Topics -> MJ: Work Queue Subscriptions (One To Many via TopicID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd6f52a25-9ada-4d32-99f7-c3f8223bef00') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d6f52a25-9ada-4d32-99f7-c3f8223bef00', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A', 'TopicID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'c68a8872-5f71-46fa-90a9-1d3b50ab5538') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c68a8872-5f71-46fa-90a9-1d3b50ab5538', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', 'TopicID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6fdc3bf5-6abb-4607-b6e9-f760844c6156') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6fdc3bf5-6abb-4607-b6e9-f760844c6156', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'TopicID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4b77fb8b-d8ff-4c5e-bcd2-efc4a48dcede') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b77fb8b-d8ff-4c5e-bcd2-efc4a48dcede', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'SubscriptionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bffb745a-e647-4590-9bc5-9a58e081a15c') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bffb745a-e647-4590-9bc5-9a58e081a15c', '619F0CE1-795C-4B20-9E08-3C45F179AEB5', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'TransportID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd8e1841b-3357-4c91-bbed-601662a9dc34') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d8e1841b-3357-4c91-bbed-601662a9dc34', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'ResolvedByUserID', 'One To Many', TRUE, TRUE, 106, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'db92d232-cd08-475d-a25b-51d7dd449d4e') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('db92d232-cd08-475d-a25b-51d7dd449d4e', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'PublishedByUserID', 'One To Many', TRUE, TRUE, 107, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd38a1e6b-8799-4c05-8c72-7f830fa06ec3') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d38a1e6b-8799-4c05-8c72-7f830fa06ec3', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '619F0CE1-795C-4B20-9E08-3C45F179AEB5', 'CredentialID', 'One To Many', TRUE, TRUE, 13, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'fce81e1a-ff9c-4adf-aceb-050196414b76') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fce81e1a-ff9c-4adf-aceb-050196414b76', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'MessageID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fdb65c2e-3771-4247-a855-f9f3fc89b72a' OR ("EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND "Name" = 'Transport')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fdb65c2e-3771-4247-a855-f9f3fc89b72a', 'F4D03836-2513-4E94-9BA4-0CD3D968B849' /* Entity: MJ: Work Queue Topics */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'), 'Transport', 'Transport', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '644fde64-a2f0-4883-a86f-704bc9e2708c' OR ("EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND "Name" = 'Topic')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('644fde64-a2f0-4883-a86f-704bc9e2708c', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' /* Entity: MJ: Work Queue Subscriptions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'), 'Topic', 'Topic', NULL, 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae00f68c-0d0e-474b-b314-bf1fa8dbfd36' OR ("EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND "Name" = 'Topic')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ae00f68c-0d0e-474b-b314-bf1fa8dbfd36', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' /* Entity: MJ: Work Queue Deduplications */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'), 'Topic', 'Topic', NULL, 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e4217eb2-b946-4c35-b587-b9e4aec6d1ff' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'Subscription')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e4217eb2-b946-4c35-b587-b9e4aec6d1ff', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'Subscription', 'Subscription', NULL, 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b5c916b7-153f-4f28-8ebe-4cbfd31fffa0' OR ("EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND "Name" = 'ResolvedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b5c916b7-153f-4f28-8ebe-4cbfd31fffa0', 'D0A12FDF-8956-419C-81DF-37A0127A60D2' /* Entity: MJ: Work Queue Deliveries */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'), 'ResolvedByUser', 'Resolved By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8fee94ac-c3dd-4c5a-b214-a7190589bfad' OR ("EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND "Name" = 'Credential')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8fee94ac-c3dd-4c5a-b214-a7190589bfad', '619F0CE1-795C-4B20-9E08-3C45F179AEB5' /* Entity: MJ: Work Queue Transports */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'), 'Credential', 'Credential', NULL, 'nvarchar', 400, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d336376-b836-4c1b-b7db-4a0a246bbfb0' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'Topic')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9d336376-b836-4c1b-b7db-4a0a246bbfb0', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'Topic', 'Topic', NULL, 'nvarchar', 400, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5653384e-e191-46b1-91ab-e0612efabd3e' OR ("EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND "Name" = 'PublishedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5653384e-e191-46b1-91ab-e0612efabd3e', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' /* Entity: MJ: Work Queue Messages */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'), 'PublishedByUser', 'Published By User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ============================================================================
-- HAND-PORTED — the 9 spUpdateEntityFieldRelatedEntityNameFieldMap calls from the CodeGen tail.
--
-- Source (SQL Server):
--   EXEC __mj.spUpdateEntityFieldRelatedEntityNameFieldMap
--        @EntityFieldID='…', @RelatedEntityNameFieldMap='…';
--
-- On PostgreSQL this CodeGen-owned routine is a FUNCTION —
--   __mj.spUpdateEntityFieldRelatedEntityNameFieldMap(
--        p_entityfieldid uuid, p_relatedentitynamefieldmap character varying)
-- — so each call is PERFORM with named arguments. Order and values are preserved exactly,
-- as in V202609091200__v6.1.x__IdentityClaim_Metadata_Tail.pg.sql.
-- ============================================================================

/* related entity name field map for entity field 83E95083-AE41-428B-82BD-787E1262EC89 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '83E95083-AE41-428B-82BD-787E1262EC89'::uuid,
    p_relatedentitynamefieldmap := 'FeatureValueCache'
  );
END $$;

/* related entity name field map for entity field 7C6B2BAD-997C-4DCD-B012-559141AE9C86 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '7C6B2BAD-997C-4DCD-B012-559141AE9C86'::uuid,
    p_relatedentitynamefieldmap := 'Topic'
  );
END $$;

/* related entity name field map for entity field E22C4CBC-D8F2-4268-997B-DACB73734034 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'E22C4CBC-D8F2-4268-997B-DACB73734034'::uuid,
    p_relatedentitynamefieldmap := 'Subscription'
  );
END $$;

/* related entity name field map for entity field 8F1B739B-ADC5-45F2-AB6E-877F431884A0 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '8F1B739B-ADC5-45F2-AB6E-877F431884A0'::uuid,
    p_relatedentitynamefieldmap := 'Topic'
  );
END $$;

/* related entity name field map for entity field 4E26CD8F-6B2C-42FA-ACBC-301AEE97E360 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := '4E26CD8F-6B2C-42FA-ACBC-301AEE97E360'::uuid,
    p_relatedentitynamefieldmap := 'ResolvedByUser'
  );
END $$;

/* related entity name field map for entity field A7DB4C98-EC8A-4E52-9053-396DC0EABDF3 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'A7DB4C98-EC8A-4E52-9053-396DC0EABDF3'::uuid,
    p_relatedentitynamefieldmap := 'PublishedByUser'
  );
END $$;

/* related entity name field map for entity field A296D756-5031-430F-B395-F8140F8187A3 */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'A296D756-5031-430F-B395-F8140F8187A3'::uuid,
    p_relatedentitynamefieldmap := 'Topic'
  );
END $$;

/* related entity name field map for entity field FD9DA7BB-8D36-41B7-8DFB-45CCD323733A */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'FD9DA7BB-8D36-41B7-8DFB-45CCD323733A'::uuid,
    p_relatedentitynamefieldmap := 'Transport'
  );
END $$;

/* related entity name field map for entity field FF986E0F-D132-4E7F-B3EA-1DF2F150B28E */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_entityfieldid             := 'FF986E0F-D132-4E7F-B3EA-1DF2F150B28E'::uuid,
    p_relatedentitynamefieldmap := 'Credential'
  );
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deduplications
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_deduplication_topic_id"
    ON "__mj"."WorkQueueDeduplication" ("TopicID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deduplications
-- Item: vwWorkQueueDeduplications
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Deduplications
-----               SCHEMA:      __mj
-----               BASE TABLE:  WorkQueueDeduplication
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwWorkQueueDeduplications"
AS
SELECT
    w.*,
    MJWorkQueueTopic_TopicID."Name" AS "Topic"
FROM
    "__mj"."WorkQueueDeduplication" AS w
INNER JOIN
    "__mj"."WorkQueueTopic" AS MJWorkQueueTopic_TopicID
  ON
    "w"."TopicID" = MJWorkQueueTopic_TopicID."ID"
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
        AND tc.relname = 'vwWorkQueueDeduplications'
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
                           AND tc.relname = 'vwWorkQueueDeduplications'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwWorkQueueDeduplications" CASCADE;
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
GRANT SELECT ON "__mj"."vwWorkQueueDeduplications" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwWorkQueueDeduplications" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwWorkQueueDeduplications" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deduplications
-- Item: spCreateWorkQueueDeduplication
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR WorkQueueDeduplication
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateWorkQueueDeduplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateWorkQueueDeduplication"(
    p_id UUID DEFAULT NULL,
    p_topicid UUID DEFAULT NULL,
    p_deduplicationkey varchar(200) DEFAULT NULL,
    p_messageid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueDeduplications" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."WorkQueueDeduplication"
        (
            "ID",
            "TopicID",
                "DeduplicationKey",
                "MessageID",
                "Status",
                "ExpiresAt"
        )
    VALUES
        (
            v_new_id,
            p_topicid,
                p_deduplicationkey,
                p_messageid,
                p_status,
                p_expiresat
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueDeduplications"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueDeduplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueDeduplication" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deduplications
-- Item: spUpdateWorkQueueDeduplication
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR WorkQueueDeduplication
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateWorkQueueDeduplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateWorkQueueDeduplication"(
    p_id UUID,
    p_topicid UUID DEFAULT NULL,
    p_deduplicationkey varchar(200) DEFAULT NULL,
    p_messageid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_expiresat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueDeduplications" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."WorkQueueDeduplication"
    SET
        "TopicID" = COALESCE(p_topicid, "TopicID"),
        "DeduplicationKey" = COALESCE(p_deduplicationkey, "DeduplicationKey"),
        "MessageID" = COALESCE(p_messageid, "MessageID"),
        "Status" = COALESCE(p_status, "Status"),
        "ExpiresAt" = COALESCE(p_expiresat, "ExpiresAt")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueDeduplications"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueDeduplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueDeduplication" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueDeduplication table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_work_queue_deduplication"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_work_queue_deduplication" ON "__mj"."WorkQueueDeduplication";

CREATE TRIGGER "trg_update_work_queue_deduplication"
BEFORE UPDATE ON "__mj"."WorkQueueDeduplication"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_work_queue_deduplication"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deduplications
-- Item: spDeleteWorkQueueDeduplication
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR WorkQueueDeduplication
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteWorkQueueDeduplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteWorkQueueDeduplication"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."WorkQueueDeduplication"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueDeduplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueDeduplication" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deliveries
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_delivery_message_id"
    ON "__mj"."WorkQueueDelivery" ("MessageID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_delivery_subscription_id"
    ON "__mj"."WorkQueueDelivery" ("SubscriptionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_delivery_resolved_by_user_id"
    ON "__mj"."WorkQueueDelivery" ("ResolvedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deliveries
-- Item: vwWorkQueueDeliveries
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Deliveries
-----               SCHEMA:      __mj
-----               BASE TABLE:  WorkQueueDelivery
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwWorkQueueDeliveries"
AS
SELECT
    w.*,
    MJWorkQueueSubscription_SubscriptionID."Name" AS "Subscription",
    MJUser_ResolvedByUserID."Name" AS "ResolvedByUser"
FROM
    "__mj"."WorkQueueDelivery" AS w
INNER JOIN
    "__mj"."WorkQueueSubscription" AS MJWorkQueueSubscription_SubscriptionID
  ON
    "w"."SubscriptionID" = MJWorkQueueSubscription_SubscriptionID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ResolvedByUserID
  ON
    "w"."ResolvedByUserID" = MJUser_ResolvedByUserID."ID"
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
        AND tc.relname = 'vwWorkQueueDeliveries'
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
                           AND tc.relname = 'vwWorkQueueDeliveries'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwWorkQueueDeliveries" CASCADE;
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
GRANT SELECT ON "__mj"."vwWorkQueueDeliveries" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwWorkQueueDeliveries" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwWorkQueueDeliveries" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deliveries
-- Item: spCreateWorkQueueDelivery
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR WorkQueueDelivery
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateWorkQueueDelivery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateWorkQueueDelivery"(
    p_id UUID DEFAULT NULL,
    p_messageid UUID DEFAULT NULL,
    p_subscriptionid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_partitionkey_clear boolean DEFAULT false,
    p_partitionkey varchar(200) DEFAULT NULL,
    p_orderkey bigint DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_isreplay BOOLEAN DEFAULT NULL,
    p_visibleat TIMESTAMPTZ DEFAULT NULL,
    p_leaseowner_clear boolean DEFAULT false,
    p_leaseowner varchar(200) DEFAULT NULL,
    p_leasetoken_clear boolean DEFAULT false,
    p_leasetoken UUID DEFAULT NULL,
    p_leaseexpiresat_clear boolean DEFAULT false,
    p_leaseexpiresat TIMESTAMPTZ DEFAULT NULL,
    p_lastheartbeatat_clear boolean DEFAULT false,
    p_lastheartbeatat TIMESTAMPTZ DEFAULT NULL,
    p_progress_clear boolean DEFAULT false,
    p_progress varchar(4000) DEFAULT NULL,
    p_lasterror_clear boolean DEFAULT false,
    p_lasterror TEXT DEFAULT NULL,
    p_deadletterreason_clear boolean DEFAULT false,
    p_deadletterreason varchar(100) DEFAULT NULL,
    p_deadletteredat_clear boolean DEFAULT false,
    p_deadletteredat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_cancelrequestedat_clear boolean DEFAULT false,
    p_cancelrequestedat TIMESTAMPTZ DEFAULT NULL,
    p_resolvedbyuserid_clear boolean DEFAULT false,
    p_resolvedbyuserid UUID DEFAULT NULL,
    p_resolutionnote_clear boolean DEFAULT false,
    p_resolutionnote varchar(1000) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueDeliveries" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."WorkQueueDelivery"
        (
            "ID",
            "MessageID",
                "SubscriptionID",
                "Status",
                "PartitionKey",
                "OrderKey",
                "AttemptCount",
                "IsReplay",
                "VisibleAt",
                "LeaseOwner",
                "LeaseToken",
                "LeaseExpiresAt",
                "LastHeartbeatAt",
                "Progress",
                "LastError",
                "DeadLetterReason",
                "DeadLetteredAt",
                "CompletedAt",
                "CancelRequestedAt",
                "ResolvedByUserID",
                "ResolutionNote"
        )
    VALUES
        (
            v_new_id,
            p_messageid,
                p_subscriptionid,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_partitionkey_clear = true THEN NULL ELSE COALESCE(p_partitionkey, NULL) END,
                p_orderkey,
                COALESCE(p_attemptcount, 0),
                COALESCE(p_isreplay, FALSE),
                COALESCE(p_visibleat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_leaseowner_clear = true THEN NULL ELSE COALESCE(p_leaseowner, NULL) END,
                CASE WHEN p_leasetoken_clear = true THEN NULL ELSE COALESCE(p_leasetoken, NULL) END,
                CASE WHEN p_leaseexpiresat_clear = true THEN NULL ELSE COALESCE(p_leaseexpiresat, NULL) END,
                CASE WHEN p_lastheartbeatat_clear = true THEN NULL ELSE COALESCE(p_lastheartbeatat, NULL) END,
                CASE WHEN p_progress_clear = true THEN NULL ELSE COALESCE(p_progress, NULL) END,
                CASE WHEN p_lasterror_clear = true THEN NULL ELSE COALESCE(p_lasterror, NULL) END,
                CASE WHEN p_deadletterreason_clear = true THEN NULL ELSE COALESCE(p_deadletterreason, NULL) END,
                CASE WHEN p_deadletteredat_clear = true THEN NULL ELSE COALESCE(p_deadletteredat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_cancelrequestedat_clear = true THEN NULL ELSE COALESCE(p_cancelrequestedat, NULL) END,
                CASE WHEN p_resolvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_resolvedbyuserid, NULL) END,
                CASE WHEN p_resolutionnote_clear = true THEN NULL ELSE COALESCE(p_resolutionnote, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueDeliveries"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueDelivery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueDelivery" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deliveries
-- Item: spUpdateWorkQueueDelivery
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR WorkQueueDelivery
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateWorkQueueDelivery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateWorkQueueDelivery"(
    p_id UUID,
    p_messageid UUID DEFAULT NULL,
    p_subscriptionid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_partitionkey_clear boolean DEFAULT false,
    p_partitionkey varchar(200) DEFAULT NULL,
    p_orderkey bigint DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_isreplay BOOLEAN DEFAULT NULL,
    p_visibleat TIMESTAMPTZ DEFAULT NULL,
    p_leaseowner_clear boolean DEFAULT false,
    p_leaseowner varchar(200) DEFAULT NULL,
    p_leasetoken_clear boolean DEFAULT false,
    p_leasetoken UUID DEFAULT NULL,
    p_leaseexpiresat_clear boolean DEFAULT false,
    p_leaseexpiresat TIMESTAMPTZ DEFAULT NULL,
    p_lastheartbeatat_clear boolean DEFAULT false,
    p_lastheartbeatat TIMESTAMPTZ DEFAULT NULL,
    p_progress_clear boolean DEFAULT false,
    p_progress varchar(4000) DEFAULT NULL,
    p_lasterror_clear boolean DEFAULT false,
    p_lasterror TEXT DEFAULT NULL,
    p_deadletterreason_clear boolean DEFAULT false,
    p_deadletterreason varchar(100) DEFAULT NULL,
    p_deadletteredat_clear boolean DEFAULT false,
    p_deadletteredat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_cancelrequestedat_clear boolean DEFAULT false,
    p_cancelrequestedat TIMESTAMPTZ DEFAULT NULL,
    p_resolvedbyuserid_clear boolean DEFAULT false,
    p_resolvedbyuserid UUID DEFAULT NULL,
    p_resolutionnote_clear boolean DEFAULT false,
    p_resolutionnote varchar(1000) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueDeliveries" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."WorkQueueDelivery"
    SET
        "MessageID" = COALESCE(p_messageid, "MessageID"),
        "SubscriptionID" = COALESCE(p_subscriptionid, "SubscriptionID"),
        "Status" = COALESCE(p_status, "Status"),
        "PartitionKey" = CASE WHEN p_partitionkey_clear = true THEN NULL ELSE COALESCE(p_partitionkey, "PartitionKey") END,
        "OrderKey" = COALESCE(p_orderkey, "OrderKey"),
        "AttemptCount" = COALESCE(p_attemptcount, "AttemptCount"),
        "IsReplay" = COALESCE(p_isreplay, "IsReplay"),
        "VisibleAt" = COALESCE(p_visibleat, "VisibleAt"),
        "LeaseOwner" = CASE WHEN p_leaseowner_clear = true THEN NULL ELSE COALESCE(p_leaseowner, "LeaseOwner") END,
        "LeaseToken" = CASE WHEN p_leasetoken_clear = true THEN NULL ELSE COALESCE(p_leasetoken, "LeaseToken") END,
        "LeaseExpiresAt" = CASE WHEN p_leaseexpiresat_clear = true THEN NULL ELSE COALESCE(p_leaseexpiresat, "LeaseExpiresAt") END,
        "LastHeartbeatAt" = CASE WHEN p_lastheartbeatat_clear = true THEN NULL ELSE COALESCE(p_lastheartbeatat, "LastHeartbeatAt") END,
        "Progress" = CASE WHEN p_progress_clear = true THEN NULL ELSE COALESCE(p_progress, "Progress") END,
        "LastError" = CASE WHEN p_lasterror_clear = true THEN NULL ELSE COALESCE(p_lasterror, "LastError") END,
        "DeadLetterReason" = CASE WHEN p_deadletterreason_clear = true THEN NULL ELSE COALESCE(p_deadletterreason, "DeadLetterReason") END,
        "DeadLetteredAt" = CASE WHEN p_deadletteredat_clear = true THEN NULL ELSE COALESCE(p_deadletteredat, "DeadLetteredAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "CancelRequestedAt" = CASE WHEN p_cancelrequestedat_clear = true THEN NULL ELSE COALESCE(p_cancelrequestedat, "CancelRequestedAt") END,
        "ResolvedByUserID" = CASE WHEN p_resolvedbyuserid_clear = true THEN NULL ELSE COALESCE(p_resolvedbyuserid, "ResolvedByUserID") END,
        "ResolutionNote" = CASE WHEN p_resolutionnote_clear = true THEN NULL ELSE COALESCE(p_resolutionnote, "ResolutionNote") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueDeliveries"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueDelivery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueDelivery" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueDelivery table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_work_queue_delivery"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_work_queue_delivery" ON "__mj"."WorkQueueDelivery";

CREATE TRIGGER "trg_update_work_queue_delivery"
BEFORE UPDATE ON "__mj"."WorkQueueDelivery"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_work_queue_delivery"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Deliveries
-- Item: spDeleteWorkQueueDelivery
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR WorkQueueDelivery
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteWorkQueueDelivery'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteWorkQueueDelivery"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."WorkQueueDelivery"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueDelivery" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueDelivery" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Messages
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_message_topic_id"
    ON "__mj"."WorkQueueMessage" ("TopicID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_message_published_by_user_id"
    ON "__mj"."WorkQueueMessage" ("PublishedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Messages
-- Item: vwWorkQueueMessages
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Messages
-----               SCHEMA:      __mj
-----               BASE TABLE:  WorkQueueMessage
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwWorkQueueMessages"
AS
SELECT
    w.*,
    MJWorkQueueTopic_TopicID."Name" AS "Topic",
    MJUser_PublishedByUserID."Name" AS "PublishedByUser"
FROM
    "__mj"."WorkQueueMessage" AS w
INNER JOIN
    "__mj"."WorkQueueTopic" AS MJWorkQueueTopic_TopicID
  ON
    "w"."TopicID" = MJWorkQueueTopic_TopicID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_PublishedByUserID
  ON
    "w"."PublishedByUserID" = MJUser_PublishedByUserID."ID"
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
        AND tc.relname = 'vwWorkQueueMessages'
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
                           AND tc.relname = 'vwWorkQueueMessages'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwWorkQueueMessages" CASCADE;
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
GRANT SELECT ON "__mj"."vwWorkQueueMessages" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwWorkQueueMessages" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwWorkQueueMessages" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Messages
-- Item: spCreateWorkQueueMessage
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR WorkQueueMessage
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateWorkQueueMessage'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateWorkQueueMessage"(
    p_id UUID DEFAULT NULL,
    p_publishordinal bigint DEFAULT NULL,
    p_topicid UUID DEFAULT NULL,
    p_partitionkey_clear boolean DEFAULT false,
    p_partitionkey varchar(200) DEFAULT NULL,
    p_attributes_clear boolean DEFAULT false,
    p_attributes varchar(4000) DEFAULT NULL,
    p_payload_clear boolean DEFAULT false,
    p_payload TEXT DEFAULT NULL,
    p_payloadref_clear boolean DEFAULT false,
    p_payloadref varchar(2000) DEFAULT NULL,
    p_correlationid_clear boolean DEFAULT false,
    p_correlationid varchar(200) DEFAULT NULL,
    p_publishedat TIMESTAMPTZ DEFAULT NULL,
    p_publishedbyuserid_clear boolean DEFAULT false,
    p_publishedbyuserid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueMessages" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."WorkQueueMessage"
        (
            "ID",
            "TopicID",
                "PartitionKey",
                "Attributes",
                "Payload",
                "PayloadRef",
                "CorrelationID",
                "PublishedAt",
                "PublishedByUserID"
        )
    VALUES
        (
            v_new_id,
            p_topicid,
                CASE WHEN p_partitionkey_clear = true THEN NULL ELSE COALESCE(p_partitionkey, NULL) END,
                CASE WHEN p_attributes_clear = true THEN NULL ELSE COALESCE(p_attributes, NULL) END,
                CASE WHEN p_payload_clear = true THEN NULL ELSE COALESCE(p_payload, NULL) END,
                CASE WHEN p_payloadref_clear = true THEN NULL ELSE COALESCE(p_payloadref, NULL) END,
                CASE WHEN p_correlationid_clear = true THEN NULL ELSE COALESCE(p_correlationid, NULL) END,
                COALESCE(p_publishedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_publishedbyuserid_clear = true THEN NULL ELSE COALESCE(p_publishedbyuserid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueMessages"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueMessage" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueMessage" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Messages
-- Item: spUpdateWorkQueueMessage
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR WorkQueueMessage
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateWorkQueueMessage'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateWorkQueueMessage"(
    p_id UUID,
    p_publishordinal bigint DEFAULT NULL,
    p_topicid UUID DEFAULT NULL,
    p_partitionkey_clear boolean DEFAULT false,
    p_partitionkey varchar(200) DEFAULT NULL,
    p_attributes_clear boolean DEFAULT false,
    p_attributes varchar(4000) DEFAULT NULL,
    p_payload_clear boolean DEFAULT false,
    p_payload TEXT DEFAULT NULL,
    p_payloadref_clear boolean DEFAULT false,
    p_payloadref varchar(2000) DEFAULT NULL,
    p_correlationid_clear boolean DEFAULT false,
    p_correlationid varchar(200) DEFAULT NULL,
    p_publishedat TIMESTAMPTZ DEFAULT NULL,
    p_publishedbyuserid_clear boolean DEFAULT false,
    p_publishedbyuserid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueMessages" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."WorkQueueMessage"
    SET
        "TopicID" = COALESCE(p_topicid, "TopicID"),
        "PartitionKey" = CASE WHEN p_partitionkey_clear = true THEN NULL ELSE COALESCE(p_partitionkey, "PartitionKey") END,
        "Attributes" = CASE WHEN p_attributes_clear = true THEN NULL ELSE COALESCE(p_attributes, "Attributes") END,
        "Payload" = CASE WHEN p_payload_clear = true THEN NULL ELSE COALESCE(p_payload, "Payload") END,
        "PayloadRef" = CASE WHEN p_payloadref_clear = true THEN NULL ELSE COALESCE(p_payloadref, "PayloadRef") END,
        "CorrelationID" = CASE WHEN p_correlationid_clear = true THEN NULL ELSE COALESCE(p_correlationid, "CorrelationID") END,
        "PublishedAt" = COALESCE(p_publishedat, "PublishedAt"),
        "PublishedByUserID" = CASE WHEN p_publishedbyuserid_clear = true THEN NULL ELSE COALESCE(p_publishedbyuserid, "PublishedByUserID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueMessages"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueMessage" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueMessage" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueMessage table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_work_queue_message"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_work_queue_message" ON "__mj"."WorkQueueMessage";

CREATE TRIGGER "trg_update_work_queue_message"
BEFORE UPDATE ON "__mj"."WorkQueueMessage"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_work_queue_message"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Messages
-- Item: spDeleteWorkQueueMessage
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR WorkQueueMessage
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteWorkQueueMessage'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteWorkQueueMessage"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."WorkQueueMessage"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueMessage" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueMessage" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Subscriptions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_subscription_topic_id"
    ON "__mj"."WorkQueueSubscription" ("TopicID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Subscriptions
-- Item: vwWorkQueueSubscriptions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Subscriptions
-----               SCHEMA:      __mj
-----               BASE TABLE:  WorkQueueSubscription
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwWorkQueueSubscriptions"
AS
SELECT
    w.*,
    MJWorkQueueTopic_TopicID."Name" AS "Topic"
FROM
    "__mj"."WorkQueueSubscription" AS w
INNER JOIN
    "__mj"."WorkQueueTopic" AS MJWorkQueueTopic_TopicID
  ON
    "w"."TopicID" = MJWorkQueueTopic_TopicID."ID"
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
        AND tc.relname = 'vwWorkQueueSubscriptions'
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
                           AND tc.relname = 'vwWorkQueueSubscriptions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwWorkQueueSubscriptions" CASCADE;
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
GRANT SELECT ON "__mj"."vwWorkQueueSubscriptions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwWorkQueueSubscriptions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwWorkQueueSubscriptions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Subscriptions
-- Item: spCreateWorkQueueSubscription
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR WorkQueueSubscription
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateWorkQueueSubscription'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateWorkQueueSubscription"(
    p_id UUID DEFAULT NULL,
    p_topicid UUID DEFAULT NULL,
    p_name varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_filter_clear boolean DEFAULT false,
    p_filter TEXT DEFAULT NULL,
    p_partitionmode varchar(20) DEFAULT NULL,
    p_maxattempts int DEFAULT NULL,
    p_backoffbaseseconds int DEFAULT NULL,
    p_backoffmaxseconds int DEFAULT NULL,
    p_leaseseconds int DEFAULT NULL,
    p_heartbeatmode varchar(20) DEFAULT NULL,
    p_maxprocessingseconds_clear boolean DEFAULT false,
    p_maxprocessingseconds int DEFAULT NULL,
    p_hosttype varchar(20) DEFAULT NULL,
    p_handlerkey_clear boolean DEFAULT false,
    p_handlerkey varchar(200) DEFAULT NULL,
    p_externalref_clear boolean DEFAULT false,
    p_externalref varchar(500) DEFAULT NULL,
    p_bindingconfig_clear boolean DEFAULT false,
    p_bindingconfig TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueSubscriptions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."WorkQueueSubscription"
        (
            "ID",
            "TopicID",
                "Name",
                "Description",
                "Filter",
                "PartitionMode",
                "MaxAttempts",
                "BackoffBaseSeconds",
                "BackoffMaxSeconds",
                "LeaseSeconds",
                "HeartbeatMode",
                "MaxProcessingSeconds",
                "HostType",
                "HandlerKey",
                "ExternalRef",
                "BindingConfig",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_topicid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_filter_clear = true THEN NULL ELSE COALESCE(p_filter, NULL) END,
                COALESCE(p_partitionmode, 'None'),
                COALESCE(p_maxattempts, 5),
                COALESCE(p_backoffbaseseconds, 10),
                COALESCE(p_backoffmaxseconds, 900),
                COALESCE(p_leaseseconds, 60),
                COALESCE(p_heartbeatmode, 'Auto'),
                CASE WHEN p_maxprocessingseconds_clear = true THEN NULL ELSE COALESCE(p_maxprocessingseconds, NULL) END,
                COALESCE(p_hosttype, 'MJWorker'),
                CASE WHEN p_handlerkey_clear = true THEN NULL ELSE COALESCE(p_handlerkey, NULL) END,
                CASE WHEN p_externalref_clear = true THEN NULL ELSE COALESCE(p_externalref, NULL) END,
                CASE WHEN p_bindingconfig_clear = true THEN NULL ELSE COALESCE(p_bindingconfig, NULL) END,
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueSubscriptions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueSubscription" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueSubscription" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Subscriptions
-- Item: spUpdateWorkQueueSubscription
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR WorkQueueSubscription
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateWorkQueueSubscription'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateWorkQueueSubscription"(
    p_id UUID,
    p_topicid UUID DEFAULT NULL,
    p_name varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_filter_clear boolean DEFAULT false,
    p_filter TEXT DEFAULT NULL,
    p_partitionmode varchar(20) DEFAULT NULL,
    p_maxattempts int DEFAULT NULL,
    p_backoffbaseseconds int DEFAULT NULL,
    p_backoffmaxseconds int DEFAULT NULL,
    p_leaseseconds int DEFAULT NULL,
    p_heartbeatmode varchar(20) DEFAULT NULL,
    p_maxprocessingseconds_clear boolean DEFAULT false,
    p_maxprocessingseconds int DEFAULT NULL,
    p_hosttype varchar(20) DEFAULT NULL,
    p_handlerkey_clear boolean DEFAULT false,
    p_handlerkey varchar(200) DEFAULT NULL,
    p_externalref_clear boolean DEFAULT false,
    p_externalref varchar(500) DEFAULT NULL,
    p_bindingconfig_clear boolean DEFAULT false,
    p_bindingconfig TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueSubscriptions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."WorkQueueSubscription"
    SET
        "TopicID" = COALESCE(p_topicid, "TopicID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Filter" = CASE WHEN p_filter_clear = true THEN NULL ELSE COALESCE(p_filter, "Filter") END,
        "PartitionMode" = COALESCE(p_partitionmode, "PartitionMode"),
        "MaxAttempts" = COALESCE(p_maxattempts, "MaxAttempts"),
        "BackoffBaseSeconds" = COALESCE(p_backoffbaseseconds, "BackoffBaseSeconds"),
        "BackoffMaxSeconds" = COALESCE(p_backoffmaxseconds, "BackoffMaxSeconds"),
        "LeaseSeconds" = COALESCE(p_leaseseconds, "LeaseSeconds"),
        "HeartbeatMode" = COALESCE(p_heartbeatmode, "HeartbeatMode"),
        "MaxProcessingSeconds" = CASE WHEN p_maxprocessingseconds_clear = true THEN NULL ELSE COALESCE(p_maxprocessingseconds, "MaxProcessingSeconds") END,
        "HostType" = COALESCE(p_hosttype, "HostType"),
        "HandlerKey" = CASE WHEN p_handlerkey_clear = true THEN NULL ELSE COALESCE(p_handlerkey, "HandlerKey") END,
        "ExternalRef" = CASE WHEN p_externalref_clear = true THEN NULL ELSE COALESCE(p_externalref, "ExternalRef") END,
        "BindingConfig" = CASE WHEN p_bindingconfig_clear = true THEN NULL ELSE COALESCE(p_bindingconfig, "BindingConfig") END,
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueSubscriptions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueSubscription" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueSubscription" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueSubscription table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_work_queue_subscription"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_work_queue_subscription" ON "__mj"."WorkQueueSubscription";

CREATE TRIGGER "trg_update_work_queue_subscription"
BEFORE UPDATE ON "__mj"."WorkQueueSubscription"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_work_queue_subscription"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Subscriptions
-- Item: spDeleteWorkQueueSubscription
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR WorkQueueSubscription
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteWorkQueueSubscription'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteWorkQueueSubscription"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."WorkQueueSubscription"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueSubscription" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueSubscription" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Topics
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_topic_transport_id"
    ON "__mj"."WorkQueueTopic" ("TransportID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Topics
-- Item: vwWorkQueueTopics
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Topics
-----               SCHEMA:      __mj
-----               BASE TABLE:  WorkQueueTopic
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwWorkQueueTopics"
AS
SELECT
    w.*,
    MJWorkQueueTransport_TransportID."Name" AS "Transport"
FROM
    "__mj"."WorkQueueTopic" AS w
INNER JOIN
    "__mj"."WorkQueueTransport" AS MJWorkQueueTransport_TransportID
  ON
    "w"."TransportID" = MJWorkQueueTransport_TransportID."ID"
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
        AND tc.relname = 'vwWorkQueueTopics'
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
                           AND tc.relname = 'vwWorkQueueTopics'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwWorkQueueTopics" CASCADE;
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
GRANT SELECT ON "__mj"."vwWorkQueueTopics" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwWorkQueueTopics" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwWorkQueueTopics" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Topics
-- Item: spCreateWorkQueueTopic
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR WorkQueueTopic
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateWorkQueueTopic'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateWorkQueueTopic"(
    p_id UUID DEFAULT NULL,
    p_name varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transportid UUID DEFAULT NULL,
    p_isfifo BOOLEAN DEFAULT NULL,
    p_allowexternalpublish BOOLEAN DEFAULT NULL,
    p_maxpayloadbytes int DEFAULT NULL,
    p_defaultdeduplicationttlseconds int DEFAULT NULL,
    p_retentiondays int DEFAULT NULL,
    p_bindingconfig_clear boolean DEFAULT false,
    p_bindingconfig TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueTopics" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."WorkQueueTopic"
        (
            "ID",
            "Name",
                "Description",
                "TransportID",
                "IsFifo",
                "AllowExternalPublish",
                "MaxPayloadBytes",
                "DefaultDeduplicationTTLSeconds",
                "RetentionDays",
                "BindingConfig",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_transportid,
                COALESCE(p_isfifo, FALSE),
                COALESCE(p_allowexternalpublish, FALSE),
                COALESCE(p_maxpayloadbytes, 262144),
                COALESCE(p_defaultdeduplicationttlseconds, 86400),
                COALESCE(p_retentiondays, 7),
                CASE WHEN p_bindingconfig_clear = true THEN NULL ELSE COALESCE(p_bindingconfig, NULL) END,
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueTopics"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueTopic" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueTopic" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Topics
-- Item: spUpdateWorkQueueTopic
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR WorkQueueTopic
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateWorkQueueTopic'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateWorkQueueTopic"(
    p_id UUID,
    p_name varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transportid UUID DEFAULT NULL,
    p_isfifo BOOLEAN DEFAULT NULL,
    p_allowexternalpublish BOOLEAN DEFAULT NULL,
    p_maxpayloadbytes int DEFAULT NULL,
    p_defaultdeduplicationttlseconds int DEFAULT NULL,
    p_retentiondays int DEFAULT NULL,
    p_bindingconfig_clear boolean DEFAULT false,
    p_bindingconfig TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueTopics" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."WorkQueueTopic"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TransportID" = COALESCE(p_transportid, "TransportID"),
        "IsFifo" = COALESCE(p_isfifo, "IsFifo"),
        "AllowExternalPublish" = COALESCE(p_allowexternalpublish, "AllowExternalPublish"),
        "MaxPayloadBytes" = COALESCE(p_maxpayloadbytes, "MaxPayloadBytes"),
        "DefaultDeduplicationTTLSeconds" = COALESCE(p_defaultdeduplicationttlseconds, "DefaultDeduplicationTTLSeconds"),
        "RetentionDays" = COALESCE(p_retentiondays, "RetentionDays"),
        "BindingConfig" = CASE WHEN p_bindingconfig_clear = true THEN NULL ELSE COALESCE(p_bindingconfig, "BindingConfig") END,
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueTopics"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueTopic" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueTopic" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueTopic table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_work_queue_topic"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_work_queue_topic" ON "__mj"."WorkQueueTopic";

CREATE TRIGGER "trg_update_work_queue_topic"
BEFORE UPDATE ON "__mj"."WorkQueueTopic"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_work_queue_topic"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Topics
-- Item: spDeleteWorkQueueTopic
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR WorkQueueTopic
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteWorkQueueTopic'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteWorkQueueTopic"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."WorkQueueTopic"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueTopic" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueTopic" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Transports
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_work_queue_transport_credential_id"
    ON "__mj"."WorkQueueTransport" ("CredentialID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Transports
-- Item: vwWorkQueueTransports
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Transports
-----               SCHEMA:      __mj
-----               BASE TABLE:  WorkQueueTransport
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwWorkQueueTransports"
AS
SELECT
    w.*,
    MJCredential_CredentialID."Name" AS "Credential"
FROM
    "__mj"."WorkQueueTransport" AS w
LEFT OUTER JOIN
    "__mj"."Credential" AS MJCredential_CredentialID
  ON
    "w"."CredentialID" = MJCredential_CredentialID."ID"
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
        AND tc.relname = 'vwWorkQueueTransports'
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
                           AND tc.relname = 'vwWorkQueueTransports'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwWorkQueueTransports" CASCADE;
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
GRANT SELECT ON "__mj"."vwWorkQueueTransports" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwWorkQueueTransports" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwWorkQueueTransports" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Transports
-- Item: spCreateWorkQueueTransport
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR WorkQueueTransport
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateWorkQueueTransport'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateWorkQueueTransport"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(100) DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueTransports" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."WorkQueueTransport"
        (
            "ID",
            "Name",
                "Description",
                "DriverClass",
                "Configuration",
                "CredentialID",
                "Status"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_driverclass,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, NULL) END,
                COALESCE(p_status, 'Active')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueTransports"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueTransport" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateWorkQueueTransport" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Transports
-- Item: spUpdateWorkQueueTransport
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR WorkQueueTransport
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateWorkQueueTransport'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateWorkQueueTransport"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_driverclass varchar(100) DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_credentialid_clear boolean DEFAULT false,
    p_credentialid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwWorkQueueTransports" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."WorkQueueTransport"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DriverClass" = COALESCE(p_driverclass, "DriverClass"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "CredentialID" = CASE WHEN p_credentialid_clear = true THEN NULL ELSE COALESCE(p_credentialid, "CredentialID") END,
        "Status" = COALESCE(p_status, "Status")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwWorkQueueTransports"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueTransport" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateWorkQueueTransport" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueTransport table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_work_queue_transport"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_work_queue_transport" ON "__mj"."WorkQueueTransport";

CREATE TRIGGER "trg_update_work_queue_transport"
BEFORE UPDATE ON "__mj"."WorkQueueTransport"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_work_queue_transport"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Work Queue Transports
-- Item: spDeleteWorkQueueTransport
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR WorkQueueTransport
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteWorkQueueTransport'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteWorkQueueTransport"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."WorkQueueTransport"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueTransport" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteWorkQueueTransport" TO "cdp_Integration";
