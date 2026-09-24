-- ============================================================================
-- Work Queue — schema (plans/work-queue-1/03-interfaces-and-tables.md §6)
-- ============================================================================
-- Additive only: six new tables, CHECK/UNIQUE constraints, eight non-FK indexes
-- (one unique filtered, seven supporting) and column descriptions.
-- PartitionKey and DeduplicationKey use a binary collation so keys compare
-- case-sensitively and byte-exactly, as PostgreSQL does (03 §6, F9).
-- CodeGen owns __mj_CreatedAt/__mj_UpdatedAt, FK indexes, views, procedures, EntityField rows and generated classes.
-- PostgreSQL counterpart is produced by the release build.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- WorkQueueTransport
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueTransport (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueTransport_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(100) NOT NULL,
    Configuration NVARCHAR(MAX) NULL,
    CredentialID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueTransport_Status DEFAULT 'Active',
    CONSTRAINT PK_WorkQueueTransport PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueTransport_Name UNIQUE (Name),
    CONSTRAINT FK_WorkQueueTransport_Credential FOREIGN KEY (CredentialID) REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_WorkQueueTransport_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueTopic
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueTopic (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueTopic_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TransportID UNIQUEIDENTIFIER NOT NULL,
    IsFifo BIT NOT NULL CONSTRAINT DF_WorkQueueTopic_IsFifo DEFAULT 0,
    AllowExternalPublish BIT NOT NULL CONSTRAINT DF_WorkQueueTopic_AllowExternalPublish DEFAULT 0,
    MaxPayloadBytes INT NOT NULL CONSTRAINT DF_WorkQueueTopic_MaxPayloadBytes DEFAULT 262144,
    DefaultDeduplicationTTLSeconds INT NOT NULL CONSTRAINT DF_WorkQueueTopic_DefaultDeduplicationTTLSeconds DEFAULT 86400,
    RetentionDays INT NOT NULL CONSTRAINT DF_WorkQueueTopic_RetentionDays DEFAULT 7,
    BindingConfig NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueTopic_Status DEFAULT 'Active',
    CONSTRAINT PK_WorkQueueTopic PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueTopic_Name UNIQUE (Name),
    CONSTRAINT FK_WorkQueueTopic_Transport FOREIGN KEY (TransportID) REFERENCES ${flyway:defaultSchema}.WorkQueueTransport(ID),
    CONSTRAINT CK_WorkQueueTopic_MaxPayloadBytes CHECK (MaxPayloadBytes > 0 AND MaxPayloadBytes <= 262144),
    CONSTRAINT CK_WorkQueueTopic_DefaultDeduplicationTTLSeconds CHECK (DefaultDeduplicationTTLSeconds >= 60),
    CONSTRAINT CK_WorkQueueTopic_RetentionDays CHECK (RetentionDays >= 1),
    CONSTRAINT CK_WorkQueueTopic_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueSubscription
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueSubscription (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueSubscription_ID DEFAULT NEWSEQUENTIALID(),
    TopicID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Filter NVARCHAR(MAX) NULL,
    PartitionMode NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_PartitionMode DEFAULT 'None',
    MaxAttempts INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_MaxAttempts DEFAULT 5,
    BackoffBaseSeconds INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_BackoffBaseSeconds DEFAULT 10,
    BackoffMaxSeconds INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_BackoffMaxSeconds DEFAULT 900,
    LeaseSeconds INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_LeaseSeconds DEFAULT 60,
    HeartbeatMode NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_HeartbeatMode DEFAULT 'Auto',
    MaxProcessingSeconds INT NULL,
    HostType NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_HostType DEFAULT 'MJWorker',
    HandlerKey NVARCHAR(200) NULL,
    ExternalRef NVARCHAR(500) NULL,
    BindingConfig NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_Status DEFAULT 'Active',
    CONSTRAINT PK_WorkQueueSubscription PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueSubscription_Name UNIQUE (Name),
    CONSTRAINT FK_WorkQueueSubscription_Topic FOREIGN KEY (TopicID) REFERENCES ${flyway:defaultSchema}.WorkQueueTopic(ID),
    CONSTRAINT CK_WorkQueueSubscription_PartitionMode CHECK (PartitionMode IN ('None', 'Exclusive', 'Ordered')),
    CONSTRAINT CK_WorkQueueSubscription_MaxAttempts CHECK (MaxAttempts >= 1),
    CONSTRAINT CK_WorkQueueSubscription_BackoffBaseSeconds CHECK (BackoffBaseSeconds >= 0),
    CONSTRAINT CK_WorkQueueSubscription_BackoffMaxSeconds CHECK (BackoffMaxSeconds >= 0),
    CONSTRAINT CK_WorkQueueSubscription_LeaseSeconds CHECK (LeaseSeconds >= 5),
    CONSTRAINT CK_WorkQueueSubscription_HeartbeatMode CHECK (HeartbeatMode IN ('Auto', 'Manual')),
    CONSTRAINT CK_WorkQueueSubscription_HostType CHECK (HostType IN ('MJWorker', 'External')),
    CONSTRAINT CK_WorkQueueSubscription_Status CHECK (Status IN ('Active', 'Paused', 'Disabled'))
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueMessage
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueMessage (
    ID UNIQUEIDENTIFIER NOT NULL,
    PublishOrdinal BIGINT IDENTITY(1, 1) NOT NULL,
    TopicID UNIQUEIDENTIFIER NOT NULL,
    PartitionKey NVARCHAR(200) COLLATE Latin1_General_100_BIN2 NULL,
    Attributes NVARCHAR(4000) NULL,
    Payload NVARCHAR(MAX) NULL,
    PayloadRef NVARCHAR(2000) NULL,
    CorrelationID NVARCHAR(200) NULL,
    PublishedAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_WorkQueueMessage_PublishedAt DEFAULT SYSDATETIMEOFFSET(),
    PublishedByUserID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_WorkQueueMessage PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueMessage_PublishOrdinal UNIQUE (PublishOrdinal),
    CONSTRAINT FK_WorkQueueMessage_Topic FOREIGN KEY (TopicID) REFERENCES ${flyway:defaultSchema}.WorkQueueTopic(ID),
    CONSTRAINT FK_WorkQueueMessage_PublishedByUser FOREIGN KEY (PublishedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID)
);
GO

-- Retention purge: messages of a topic older than its RetentionDays with no remaining deliveries.
CREATE NONCLUSTERED INDEX IX_WorkQueueMessage_Purge
    ON ${flyway:defaultSchema}.WorkQueueMessage (TopicID, PublishedAt);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueDelivery
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueDelivery (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueDelivery_ID DEFAULT NEWSEQUENTIALID(),
    MessageID UNIQUEIDENTIFIER NOT NULL,
    SubscriptionID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueDelivery_Status DEFAULT 'Pending',
    PartitionKey NVARCHAR(200) COLLATE Latin1_General_100_BIN2 NULL,
    OrderKey BIGINT NOT NULL,
    AttemptCount INT NOT NULL CONSTRAINT DF_WorkQueueDelivery_AttemptCount DEFAULT 0,
    IsReplay BIT NOT NULL CONSTRAINT DF_WorkQueueDelivery_IsReplay DEFAULT 0,
    VisibleAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_WorkQueueDelivery_VisibleAt DEFAULT SYSDATETIMEOFFSET(),
    LeaseOwner NVARCHAR(200) NULL,
    LeaseToken UNIQUEIDENTIFIER NULL,
    LeaseExpiresAt DATETIMEOFFSET(7) NULL,
    LastHeartbeatAt DATETIMEOFFSET(7) NULL,
    Progress NVARCHAR(4000) NULL,
    LastError NVARCHAR(MAX) NULL,
    DeadLetterReason NVARCHAR(100) NULL,
    DeadLetteredAt DATETIMEOFFSET(7) NULL,
    CompletedAt DATETIMEOFFSET(7) NULL,
    CancelRequestedAt DATETIMEOFFSET(7) NULL,
    ResolvedByUserID UNIQUEIDENTIFIER NULL,
    ResolutionNote NVARCHAR(1000) NULL,
    CONSTRAINT PK_WorkQueueDelivery PRIMARY KEY (ID),
    CONSTRAINT FK_WorkQueueDelivery_Message FOREIGN KEY (MessageID) REFERENCES ${flyway:defaultSchema}.WorkQueueMessage(ID),
    CONSTRAINT FK_WorkQueueDelivery_Subscription FOREIGN KEY (SubscriptionID) REFERENCES ${flyway:defaultSchema}.WorkQueueSubscription(ID),
    CONSTRAINT FK_WorkQueueDelivery_ResolvedByUser FOREIGN KEY (ResolvedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT UQ_WorkQueueDelivery_Subscription_Message UNIQUE (SubscriptionID, MessageID),
    CONSTRAINT CK_WorkQueueDelivery_Status CHECK (Status IN ('Pending', 'InFlight', 'Completed', 'DeadLettered', 'Discarded')),
    CONSTRAINT CK_WorkQueueDelivery_AttemptCount CHECK (AttemptCount >= 0)
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_WorkQueueDelivery_InFlightPartition
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, PartitionKey)
    WHERE Status = 'InFlight' AND PartitionKey IS NOT NULL;
GO

-- Filtered to Pending so the claim scan never walks retained terminal rows.
CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Claim
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, VisibleAt)
    INCLUDE (PartitionKey, OrderKey, AttemptCount)
    WHERE Status = 'Pending';
GO

CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_PartitionHead
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, PartitionKey, OrderKey)
    INCLUDE (Status)
    WHERE PartitionKey IS NOT NULL AND Status IN ('Pending', 'InFlight', 'DeadLettered');
GO

CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Lease
    ON ${flyway:defaultSchema}.WorkQueueDelivery (Status, LeaseExpiresAt)
    WHERE Status = 'InFlight';
GO

-- Per-status counts (stats, backlog) and the dead-letter list: seeks, never an aggregate over every row.
CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Open
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, Status)
    WHERE Status IN ('InFlight', 'DeadLettered');
GO

-- Retention purge and CompletedLastHour.
CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Purge
    ON ${flyway:defaultSchema}.WorkQueueDelivery (CompletedAt)
    INCLUDE (SubscriptionID, Status)
    WHERE Status IN ('Completed', 'Discarded');
GO

-- ---------------------------------------------------------------------------
-- WorkQueueDeduplication
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueDeduplication (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueDeduplication_ID DEFAULT NEWSEQUENTIALID(),
    TopicID UNIQUEIDENTIFIER NOT NULL,
    DeduplicationKey NVARCHAR(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
    MessageID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    ExpiresAt DATETIMEOFFSET(7) NOT NULL,
    CONSTRAINT PK_WorkQueueDeduplication PRIMARY KEY (ID),
    CONSTRAINT FK_WorkQueueDeduplication_Topic FOREIGN KEY (TopicID) REFERENCES ${flyway:defaultSchema}.WorkQueueTopic(ID),
    CONSTRAINT UQ_WorkQueueDeduplication_Topic_Key UNIQUE (TopicID, DeduplicationKey),
    CONSTRAINT CK_WorkQueueDeduplication_Status CHECK (Status IN ('Reserved', 'Confirmed'))
);
GO

CREATE NONCLUSTERED INDEX IX_WorkQueueDeduplication_ExpiresAt
    ON ${flyway:defaultSchema}.WorkQueueDeduplication (ExpiresAt);
GO

-- ===========================================================================
-- Descriptions (PK/FK columns are described by CodeGen)
-- ===========================================================================
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A configured backend that stores and delivers work-queue messages (Database, AWS, ...). Topics bind to exactly one transport.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique transport name, for example Database or AWS-prod-us-east-1.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this transport is used for and who operates it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of the BaseTransportDriverFactory registration that builds the driver: Database or AWS.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Driver-specific JSON configuration, for example {"Region":"us-east-1"}. Never holds secrets; use CredentialID.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Configuration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active transports can deliver; Disabled transports reject publishes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A named destination producers publish work to. Each topic is bound to one transport and fans out to its subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique dotted lowercase topic name, for example email.events.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the topic represents and who publishes to it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cloud transports: the topic uses FIFO resources. Required on AWS when any subscription is Exclusive.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'IsFifo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, API callers may publish to this topic through POST /work-queue/topics/{topic}/messages. In-process code may publish to any active topic.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'AllowExternalPublish';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Largest serialized envelope accepted, in bytes (at most 262144).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'MaxPayloadBytes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Window, in seconds, during which a DeduplicationKey suppresses repeat publishes when the publisher does not supply one.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'DefaultDeduplicationTTLSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Days completed and discarded deliveries, and their messages, are kept before the sweeper purges them (Database transport).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'RetentionDays';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transport binding JSON imported after provisioning, for example {"SnsTopicArn":"..."}. Empty for Database topics.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'BindingConfig';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active topics accept publishes; Disabled topics reject them.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A consumer''s standing request for a topic''s messages: filter, partition mode, retry and lease policy, and where the handler runs.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Globally unique subscription name, used in manifests and consumer configuration.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this consumer does and who owns it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional attribute filter as MJ CompositeFilterDescriptor JSON (03 section 4), restricted to the broker-translatable operators eq, neq, startswith, isnull and isnotnull over envelope attribute names. Null matches every message.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Filter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'None: no key constraints. Exclusive: one delivery in flight per partition key, no order promise. Ordered (Database transport only): a key''s deliveries run in publish order, one at a time, and a dead-lettered head blocks its key. Immutable once the subscription has deliveries.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'PartitionMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Attempts allowed per delivery, including lease expiries, before it is dead-lettered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'MaxAttempts';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base retry delay in seconds; full-jitter exponential backoff doubles it per attempt.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BackoffBaseSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Upper bound on the retry delay, in seconds.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BackoffMaxSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Seconds a claim lasts before it expires unless renewed by a heartbeat. Measured on the transport clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'LeaseSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Auto: the runtime renews the lease while the handler runs. Manual: only handler heartbeats renew it, so hung handlers are detected.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HeartbeatMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional cap on handler run time; Auto heartbeats stop and the handler is aborted after it. Above a host''s known ceiling it produces a validation warning.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'MaxProcessingSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJWorker: the handler runs inside an MJ server process. External: the handler runs elsewhere, for example a Lambda (cloud transports only).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HostType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of the BaseWorkHandler registration that processes deliveries. Required for MJWorker subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HandlerKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Informational reference to an external consumer, for example a Lambda ARN.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'ExternalRef';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transport binding JSON imported after provisioning, for example queue and dead-letter queue URLs. Empty for Database subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BindingConfig';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active: deliveries are created and processed. Paused: deliveries are created but nothing is claimed. Disabled: no new deliveries are created.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One published unit of work (the envelope). Immutable. Stored for Database-transport topics only. ID is the globally unique MessageID.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publish order, assigned by the database. Every delivery of the message carries it as its OrderKey.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PublishOrdinal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Producer-supplied key used by Exclusive and Ordered subscriptions. Compared case-sensitively (binary collation).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object of string attributes (at most 10). The only envelope fields subscription filters see.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'Attributes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inline JSON payload. Mutually exclusive with PayloadRef.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'Payload';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON claim-check reference ({"Uri":...}) to data held outside the queue.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PayloadRef';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Caller-supplied identifier for tracing related work.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'CorrelationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When MJ accepted the publish, on the database clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PublishedAt';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One subscription''s processing of one message: status, attempts and lease.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending: awaiting claim. InFlight: leased. Completed: handler succeeded. DeadLettered: exhausted or rejected, needs an operator. Discarded: cancelled or resolved by an operator.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Copy of the message partition key, populated only for Exclusive and Ordered subscriptions. Drives the in-flight uniqueness rule.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Position within the partition key: always the message PublishOrdinal.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'OrderKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Claims so far, including claims whose lease expired. Reset to 0 by replay.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'AttemptCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'1 once an operator has replayed this delivery from the dead-letter state.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'IsReplay';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Earliest time the delivery may be claimed; retry backoff moves it forward.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'VisibleAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Worker instance holding the current lease.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseOwner';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'New value per claim; a cancel leaves it unchanged. Every heartbeat and settle must present it, so a worker that lost its lease cannot overwrite a newer claim.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseToken';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the current lease expires, on the database clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseExpiresAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the lease was last renewed.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LastHeartbeatAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Latest handler progress JSON ({"Percent","Message","Checkpoint"}).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'Progress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Most recent failure text, including LeaseExpired.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LastError';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why the delivery was dead-lettered: a handler reason, MaxAttemptsExceeded, LeaseExpired or HandlerNotRegistered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'DeadLetterReason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the delivery entered DeadLettered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'DeadLetteredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Terminal time for both Completed and Discarded; the retention purge key.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'CompletedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Set when an operator cancels an in-flight delivery. From then on every holder write except AcknowledgeCancel fails; the holder acknowledges and the row becomes Discarded at once, or ExpireLeases discards it when the lease runs out. Never retried.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'CancelRequestedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Operator note recorded with a replay or the reason recorded with a discard.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'ResolutionNote';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publish deduplication ledger for every transport: a key suppresses repeat publishes to a topic until ExpiresAt.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Producer-supplied key identifying one logical message within the topic. Compared case-sensitively (binary collation).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'DeduplicationKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MessageID of the publish that owns the key. Not a foreign key: cloud messages have no row.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'MessageID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reserved: a send is in progress (short expiry) and proves nothing about its outcome. Confirmed: the publish was accepted. Only Confirmed rows make a later publish a Duplicate.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the key stops suppressing duplicates. Expired rows are replaced on publish and purged by the sweeper.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'ExpiresAt';
GO




















































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

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '619f0ce1-795c-4b20-9e08-3c45f179aeb5',
         'MJ: Work Queue Transports',
         'Work Queue Transports',
         'A configured backend that stores and delivers work-queue messages (Database, AWS, ...). Topics bind to exactly one transport.',
         NULL,
         'WorkQueueTransport',
         'vwWorkQueueTransports',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Work Queue Transports to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '619f0ce1-795c-4b20-9e08-3c45f179aeb5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Work Queue Transports for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Transports for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Transports for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('619f0ce1-795c-4b20-9e08-3c45f179aeb5' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Work Queue Topics */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'f4d03836-2513-4e94-9ba4-0cd3d968b849',
         'MJ: Work Queue Topics',
         'Work Queue Topics',
         'A named destination producers publish work to. Each topic is bound to one transport and fans out to its subscriptions.',
         NULL,
         'WorkQueueTopic',
         'vwWorkQueueTopics',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Work Queue Topics to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f4d03836-2513-4e94-9ba4-0cd3d968b849', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Work Queue Topics for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Topics for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Topics for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f4d03836-2513-4e94-9ba4-0cd3d968b849' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Work Queue Subscriptions */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'f75584c0-1bb2-4645-aa4c-24d35b43d45a',
         'MJ: Work Queue Subscriptions',
         'Work Queue Subscriptions',
         'A consumer''s standing request for a topic''s messages: filter, partition mode, retry and lease policy, and where the handler runs.',
         NULL,
         'WorkQueueSubscription',
         'vwWorkQueueSubscriptions',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Work Queue Subscriptions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f75584c0-1bb2-4645-aa4c-24d35b43d45a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Work Queue Subscriptions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Subscriptions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Subscriptions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f75584c0-1bb2-4645-aa4c-24d35b43d45a' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Work Queue Messages */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '2917b8d0-e525-41c0-a8c8-c4f58cd9a09a',
         'MJ: Work Queue Messages',
         'Work Queue Messages',
         'One published unit of work (the envelope). Immutable. Stored for Database-transport topics only. ID is the globally unique MessageID.',
         NULL,
         'WorkQueueMessage',
         'vwWorkQueueMessages',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Work Queue Messages to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2917b8d0-e525-41c0-a8c8-c4f58cd9a09a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Work Queue Messages for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Messages for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Messages for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2917b8d0-e525-41c0-a8c8-c4f58cd9a09a' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Work Queue Deliveries */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'd0a12fdf-8956-419c-81df-37a0127a60d2',
         'MJ: Work Queue Deliveries',
         'Work Queue Deliveries',
         'One subscription''s processing of one message: status, attempts and lease.',
         NULL,
         'WorkQueueDelivery',
         'vwWorkQueueDeliveries',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Work Queue Deliveries to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd0a12fdf-8956-419c-81df-37a0127a60d2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Work Queue Deliveries for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Deliveries for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Deliveries for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d0a12fdf-8956-419c-81df-37a0127a60d2' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Work Queue Deduplications */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '2b559b5c-0e81-4eb8-80d8-26943e0a49be',
         'MJ: Work Queue Deduplications',
         'Work Queue Deduplications',
         'Publish deduplication ledger for every transport: a key suppresses repeat publishes to a topic until ExpiresAt.',
         NULL,
         'WorkQueueDeduplication',
         'vwWorkQueueDeduplications',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Work Queue Deduplications to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2b559b5c-0e81-4eb8-80d8-26943e0a49be', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Work Queue Deduplications for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Deduplications for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Work Queue Deduplications for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2b559b5c-0e81-4eb8-80d8-26943e0a49be' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTopic] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
UPDATE [${flyway:defaultSchema}].[WorkQueueTopic] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTopic] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTopic] ADD CONSTRAINT [DF___mj_WorkQueueTopic___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTopic] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
UPDATE [${flyway:defaultSchema}].[WorkQueueTopic] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTopic] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTopic */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTopic] ADD CONSTRAINT [DF___mj_WorkQueueTopic___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueSubscription] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
UPDATE [${flyway:defaultSchema}].[WorkQueueSubscription] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueSubscription] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueSubscription] ADD CONSTRAINT [DF___mj_WorkQueueSubscription___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueSubscription] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
UPDATE [${flyway:defaultSchema}].[WorkQueueSubscription] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueSubscription] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueSubscription */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueSubscription] ADD CONSTRAINT [DF___mj_WorkQueueSubscription___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDeduplication] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
UPDATE [${flyway:defaultSchema}].[WorkQueueDeduplication] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDeduplication] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDeduplication] ADD CONSTRAINT [DF___mj_WorkQueueDeduplication___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDeduplication] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
UPDATE [${flyway:defaultSchema}].[WorkQueueDeduplication] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDeduplication] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDeduplication */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDeduplication] ADD CONSTRAINT [DF___mj_WorkQueueDeduplication___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDelivery] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDelivery] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDelivery] ADD CONSTRAINT [DF___mj_WorkQueueDelivery___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDelivery] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
UPDATE [${flyway:defaultSchema}].[WorkQueueDelivery] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDelivery] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueDelivery */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueDelivery] ADD CONSTRAINT [DF___mj_WorkQueueDelivery___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTransport] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
UPDATE [${flyway:defaultSchema}].[WorkQueueTransport] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTransport] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTransport] ADD CONSTRAINT [DF___mj_WorkQueueTransport___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTransport] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
UPDATE [${flyway:defaultSchema}].[WorkQueueTransport] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTransport] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueTransport */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueTransport] ADD CONSTRAINT [DF___mj_WorkQueueTransport___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueMessage] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
UPDATE [${flyway:defaultSchema}].[WorkQueueMessage] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueMessage] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueMessage] ADD CONSTRAINT [DF___mj_WorkQueueMessage___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueMessage] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
UPDATE [${flyway:defaultSchema}].[WorkQueueMessage] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueMessage] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WorkQueueMessage */
ALTER TABLE [${flyway:defaultSchema}].[WorkQueueMessage] ADD CONSTRAINT [DF___mj_WorkQueueMessage___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 84 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc622ade-238d-4c9c-bd11-3563d4b11ccd' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cc622ade-238d-4c9c-bd11-3563d4b11ccd',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e24a800b-a1fb-4b99-8864-871bcc1eb64a' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e24a800b-a1fb-4b99-8864-871bcc1eb64a',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'Name',
            'Name',
            'Unique dotted lowercase topic name, for example email.events.',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bff58867-8c6d-4283-beae-85df2a9dea2c' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bff58867-8c6d-4283-beae-85df2a9dea2c',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'Description',
            'Description',
            'What the topic represents and who publishes to it.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fd9da7bb-8d36-41b7-8dfb-45ccd323733a' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'TransportID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fd9da7bb-8d36-41b7-8dfb-45ccd323733a',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'TransportID',
            'Transport ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd20fcaec-b513-42f6-bc18-9a2f157ae68f' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'IsFifo')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd20fcaec-b513-42f6-bc18-9a2f157ae68f',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'IsFifo',
            'Is Fifo',
            'Cloud transports: the topic uses FIFO resources. Required on AWS when any subscription is Exclusive.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '882a6be1-9ca5-41a1-acaa-6f31c78a46a9' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'AllowExternalPublish')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '882a6be1-9ca5-41a1-acaa-6f31c78a46a9',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'AllowExternalPublish',
            'Allow External Publish',
            'When 1, API callers may publish to this topic through POST /work-queue/topics/{topic}/messages. In-process code may publish to any active topic.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08e8dcb4-763d-4344-ba89-e4619862b5e1' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'MaxPayloadBytes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '08e8dcb4-763d-4344-ba89-e4619862b5e1',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'MaxPayloadBytes',
            'Max Payload Bytes',
            'Largest serialized envelope accepted, in bytes (at most 262144).',
            'int',
            4,
            10,
            0,
            0,
            '(262144)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e044d535-6a19-4f15-ab21-9367e5961791' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'DefaultDeduplicationTTLSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e044d535-6a19-4f15-ab21-9367e5961791',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'DefaultDeduplicationTTLSeconds',
            'Default Deduplication TTL Seconds',
            'Window, in seconds, during which a DeduplicationKey suppresses repeat publishes when the publisher does not supply one.',
            'int',
            4,
            10,
            0,
            0,
            '(86400)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f24b7bc-3d12-4d1d-889b-35dd6e0085b3' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'RetentionDays')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7f24b7bc-3d12-4d1d-889b-35dd6e0085b3',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'RetentionDays',
            'Retention Days',
            'Days completed and discarded deliveries, and their messages, are kept before the sweeper purges them (Database transport).',
            'int',
            4,
            10,
            0,
            0,
            '(7)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0a38b96-00da-4539-aab6-1f67f1d0808b' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'BindingConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0a38b96-00da-4539-aab6-1f67f1d0808b',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'BindingConfig',
            'Binding Config',
            'Transport binding JSON imported after provisioning, for example {"SnsTopicArn":"..."}. Empty for Database topics.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4400478c-1407-4eda-80a1-081bfddf6387' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4400478c-1407-4eda-80a1-081bfddf6387',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'Status',
            'Status',
            'Active topics accept publishes; Disabled topics reject them.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24b58011-57bf-4058-8c2b-a3bac668271e' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '24b58011-57bf-4058-8c2b-a3bac668271e',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ddd6860-2938-44b7-a576-91f6e34f138b' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0ddd6860-2938-44b7-a576-91f6e34f138b',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fc61758-4696-4637-af01-7d0e9acdd4a5' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fc61758-4696-4637-af01-7d0e9acdd4a5',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a296d756-5031-430f-b395-f8140f8187a3' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'TopicID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a296d756-5031-430f-b395-f8140f8187a3',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'TopicID',
            'Topic ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F4D03836-2513-4E94-9BA4-0CD3D968B849',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c02cdf44-a243-431a-a6b5-f6e5ebe2b019' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c02cdf44-a243-431a-a6b5-f6e5ebe2b019',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'Name',
            'Name',
            'Globally unique subscription name, used in manifests and consumer configuration.',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ae09fe6-2778-45f6-8e35-60487d22a33c' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1ae09fe6-2778-45f6-8e35-60487d22a33c',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'Description',
            'Description',
            'What this consumer does and who owns it.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b0969a3-ed66-4020-b4ae-c3d277cac58f' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'Filter')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3b0969a3-ed66-4020-b4ae-c3d277cac58f',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'Filter',
            'Filter',
            'Optional attribute filter as MJ CompositeFilterDescriptor JSON (03 section 4), restricted to the broker-translatable operators eq, neq, startswith, isnull and isnotnull over envelope attribute names. Null matches every message.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d642099-5e3e-4107-8f30-9f6fa33c075f' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'PartitionMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d642099-5e3e-4107-8f30-9f6fa33c075f',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'PartitionMode',
            'Partition Mode',
            'None: no key constraints. Exclusive: one delivery in flight per partition key, no order promise. Ordered (Database transport only): a key''s deliveries run in publish order, one at a time, and a dead-lettered head blocks its key. Immutable once the subscription has deliveries.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'None',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed1306a1-ebc7-4d3b-b026-856b8142d2a1' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'MaxAttempts')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ed1306a1-ebc7-4d3b-b026-856b8142d2a1',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'MaxAttempts',
            'Max Attempts',
            'Attempts allowed per delivery, including lease expiries, before it is dead-lettered.',
            'int',
            4,
            10,
            0,
            0,
            '(5)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f62fa35-c0df-4539-bb72-1bb73f7c533e' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'BackoffBaseSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6f62fa35-c0df-4539-bb72-1bb73f7c533e',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'BackoffBaseSeconds',
            'Backoff Base Seconds',
            'Base retry delay in seconds; full-jitter exponential backoff doubles it per attempt.',
            'int',
            4,
            10,
            0,
            0,
            '(10)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f27ac8f-3709-4313-9597-1aa891ab9a54' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'BackoffMaxSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1f27ac8f-3709-4313-9597-1aa891ab9a54',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'BackoffMaxSeconds',
            'Backoff Max Seconds',
            'Upper bound on the retry delay, in seconds.',
            'int',
            4,
            10,
            0,
            0,
            '(900)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ac93faa-a812-44a9-a50d-f614639cea26' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'LeaseSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0ac93faa-a812-44a9-a50d-f614639cea26',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'LeaseSeconds',
            'Lease Seconds',
            'Seconds a claim lasts before it expires unless renewed by a heartbeat. Measured on the transport clock.',
            'int',
            4,
            10,
            0,
            0,
            '(60)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1d0c3b6-93ca-41e0-8e4a-5385d67c2e18' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'HeartbeatMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b1d0c3b6-93ca-41e0-8e4a-5385d67c2e18',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'HeartbeatMode',
            'Heartbeat Mode',
            'Auto: the runtime renews the lease while the handler runs. Manual: only handler heartbeats renew it, so hung handlers are detected.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Auto',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5699162-a9cd-487f-9fc3-8de76f7cc2ac' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'MaxProcessingSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd5699162-a9cd-487f-9fc3-8de76f7cc2ac',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'MaxProcessingSeconds',
            'Max Processing Seconds',
            'Optional cap on handler run time; Auto heartbeats stop and the handler is aborted after it. Above a host''s known ceiling it produces a validation warning.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90b702a1-819f-44e8-acb5-edd7c717af77' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'HostType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90b702a1-819f-44e8-acb5-edd7c717af77',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'HostType',
            'Host Type',
            'MJWorker: the handler runs inside an MJ server process. External: the handler runs elsewhere, for example a Lambda (cloud transports only).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'MJWorker',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef551432-c7f5-4397-aeb2-48632e8d200f' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'HandlerKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ef551432-c7f5-4397-aeb2-48632e8d200f',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'HandlerKey',
            'Handler Key',
            'ClassFactory key of the BaseWorkHandler registration that processes deliveries. Required for MJWorker subscriptions.',
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ad1e4b4-e742-4a0e-b5fd-24b83df23281' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'ExternalRef')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8ad1e4b4-e742-4a0e-b5fd-24b83df23281',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'ExternalRef',
            'External Ref',
            'Informational reference to an external consumer, for example a Lambda ARN.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4acdcbb-d0fb-42be-a99a-f7837724f111' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'BindingConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f4acdcbb-d0fb-42be-a99a-f7837724f111',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'BindingConfig',
            'Binding Config',
            'Transport binding JSON imported after provisioning, for example queue and dead-letter queue URLs. Empty for Database subscriptions.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f57387a0-3683-4b96-8bb5-d3d36f2b4604' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f57387a0-3683-4b96-8bb5-d3d36f2b4604',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'Status',
            'Status',
            'Active: deliveries are created and processed. Paused: deliveries are created but nothing is claimed. Disabled: no new deliveries are created.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9efa1480-8112-413a-b022-bd770a6ea22d' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9efa1480-8112-413a-b022-bd770a6ea22d',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7d1ce1e-dc6e-4bea-bf57-1bc1a7550c49' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b7d1ce1e-dc6e-4bea-bf57-1bc1a7550c49',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88ebea46-f7bd-4bd9-bc48-9a9f75f23e25' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '88ebea46-f7bd-4bd9-bc48-9a9f75f23e25',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c6b2bad-997c-4dcd-b012-559141ae9c86' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = 'TopicID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7c6b2bad-997c-4dcd-b012-559141ae9c86',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            'TopicID',
            'Topic ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F4D03836-2513-4E94-9BA4-0CD3D968B849',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '601cd526-4a66-4673-adae-c70e774d98a8' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = 'DeduplicationKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '601cd526-4a66-4673-adae-c70e774d98a8',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            'DeduplicationKey',
            'Deduplication Key',
            'Producer-supplied key identifying one logical message within the topic. Compared case-sensitively (binary collation).',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d3a7e0e-8f2c-4caf-8879-296881e2bc40' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = 'MessageID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d3a7e0e-8f2c-4caf-8879-296881e2bc40',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            'MessageID',
            'Message ID',
            'MessageID of the publish that owns the key. Not a foreign key: cloud messages have no row.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01b08d72-b840-4944-864c-86aa798725b2' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '01b08d72-b840-4944-864c-86aa798725b2',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            'Status',
            'Status',
            'Reserved: a send is in progress (short expiry) and proves nothing about its outcome. Confirmed: the publish was accepted. Only Confirmed rows make a later publish a Duplicate.',
            'nvarchar',
            40,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0fb12c3f-9e76-41ee-a34f-f409aadb11bc' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = 'ExpiresAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0fb12c3f-9e76-41ee-a34f-f409aadb11bc',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            'ExpiresAt',
            'Expires At',
            'When the key stops suppressing duplicates. Expired rows are replaced on publish and purged by the sweeper.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce3720a0-0bea-40a2-b8b4-1305ed720b95' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ce3720a0-0bea-40a2-b8b4-1305ed720b95',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c81f1b2a-6ab2-4fd0-aa51-de74fd8ccc16' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c81f1b2a-6ab2-4fd0-aa51-de74fd8ccc16',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4928aa0-ce82-4125-814f-718f1a56caa3' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c4928aa0-ce82-4125-814f-718f1a56caa3',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ef3f7ada-162d-4343-8ae2-8ff5be5b9e00' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'MessageID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ef3f7ada-162d-4343-8ae2-8ff5be5b9e00',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'MessageID',
            'Message ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e22c4cbc-d8f2-4268-997b-dacb73734034' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'SubscriptionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e22c4cbc-d8f2-4268-997b-dacb73734034',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'SubscriptionID',
            'Subscription ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae1a3b3e-07d2-4564-860a-9a5bd1735e7c' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae1a3b3e-07d2-4564-860a-9a5bd1735e7c',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'Status',
            'Status',
            'Pending: awaiting claim. InFlight: leased. Completed: handler succeeded. DeadLettered: exhausted or rejected, needs an operator. Discarded: cancelled or resolved by an operator.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a45510e-0876-4e90-9037-e9149c509c9a' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'PartitionKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a45510e-0876-4e90-9037-e9149c509c9a',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'PartitionKey',
            'Partition Key',
            'Copy of the message partition key, populated only for Exclusive and Ordered subscriptions. Drives the in-flight uniqueness rule.',
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa1b6a14-b82c-4434-8f60-027c725c9898' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'OrderKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aa1b6a14-b82c-4434-8f60-027c725c9898',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'OrderKey',
            'Order Key',
            'Position within the partition key: always the message PublishOrdinal.',
            'bigint',
            8,
            19,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68c643eb-19d1-47dd-a6f0-ef7ea9f71267' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'AttemptCount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68c643eb-19d1-47dd-a6f0-ef7ea9f71267',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'AttemptCount',
            'Attempt Count',
            'Claims so far, including claims whose lease expired. Reset to 0 by replay.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0bec42e1-dffb-484a-a1bb-73f5303b0cc3' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'IsReplay')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0bec42e1-dffb-484a-a1bb-73f5303b0cc3',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'IsReplay',
            'Is Replay',
            '1 once an operator has replayed this delivery from the dead-letter state.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5eca4dd4-c610-41e7-9065-a368c071c86b' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'VisibleAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5eca4dd4-c610-41e7-9065-a368c071c86b',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'VisibleAt',
            'Visible At',
            'Earliest time the delivery may be claimed; retry backoff moves it forward.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71b48048-3f24-4be2-b9f6-f9d271efae19' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'LeaseOwner')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '71b48048-3f24-4be2-b9f6-f9d271efae19',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'LeaseOwner',
            'Lease Owner',
            'Worker instance holding the current lease.',
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2680f77-4167-4edb-930d-9b4772ccbfe7' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'LeaseToken')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b2680f77-4167-4edb-930d-9b4772ccbfe7',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'LeaseToken',
            'Lease Token',
            'New value per claim; a cancel leaves it unchanged. Every heartbeat and settle must present it, so a worker that lost its lease cannot overwrite a newer claim.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '164ed4e5-192a-4cb8-a792-28a98d96f38d' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'LeaseExpiresAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '164ed4e5-192a-4cb8-a792-28a98d96f38d',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'LeaseExpiresAt',
            'Lease Expires At',
            'When the current lease expires, on the database clock.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5476187f-b221-4cfc-abb2-e09285232c1c' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'LastHeartbeatAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5476187f-b221-4cfc-abb2-e09285232c1c',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'LastHeartbeatAt',
            'Last Heartbeat At',
            'When the lease was last renewed.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85b349a6-7437-4ef8-b566-6ea9b0abde92' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'Progress')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '85b349a6-7437-4ef8-b566-6ea9b0abde92',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'Progress',
            'Progress',
            'Latest handler progress JSON ({"Percent","Message","Checkpoint"}).',
            'nvarchar',
            8000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3159983-3901-4cc3-9581-3c32f69a0782' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'LastError')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a3159983-3901-4cc3-9581-3c32f69a0782',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'LastError',
            'Last Error',
            'Most recent failure text, including LeaseExpired.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7484fa00-400b-4eb5-92c8-ec1605308b34' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'DeadLetterReason')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7484fa00-400b-4eb5-92c8-ec1605308b34',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'DeadLetterReason',
            'Dead Letter Reason',
            'Why the delivery was dead-lettered: a handler reason, MaxAttemptsExceeded, LeaseExpired or HandlerNotRegistered.',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ac3e8f9a-77d9-450b-b55e-7e0f6703d9e3' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'DeadLetteredAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ac3e8f9a-77d9-450b-b55e-7e0f6703d9e3',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'DeadLetteredAt',
            'Dead Lettered At',
            'When the delivery entered DeadLettered.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2ee4890d-a306-4224-91a2-188422128dc4' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'CompletedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2ee4890d-a306-4224-91a2-188422128dc4',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'CompletedAt',
            'Completed At',
            'Terminal time for both Completed and Discarded; the retention purge key.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb6eeddf-c23f-4cf7-b6f5-d26e347c2946' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'CancelRequestedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eb6eeddf-c23f-4cf7-b6f5-d26e347c2946',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'CancelRequestedAt',
            'Cancel Requested At',
            'Set when an operator cancels an in-flight delivery. From then on every holder write except AcknowledgeCancel fails; the holder acknowledges and the row becomes Discarded at once, or ExpireLeases discards it when the lease runs out. Never retried.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e26cd8f-6b2c-42fa-acbc-301aee97e360' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'ResolvedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4e26cd8f-6b2c-42fa-acbc-301aee97e360',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'ResolvedByUserID',
            'Resolved By User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03bb502b-4cab-4157-8b74-56bb2dde4400' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'ResolutionNote')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03bb502b-4cab-4157-8b74-56bb2dde4400',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'ResolutionNote',
            'Resolution Note',
            'Operator note recorded with a replay or the reason recorded with a discard.',
            'nvarchar',
            2000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4e2a0e6-1fc8-490e-8c51-dbff8cdf4919' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4e2a0e6-1fc8-490e-8c51-dbff8cdf4919',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0719dba-9938-47d7-8b56-c5db1876f847' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0719dba-9938-47d7-8b56-c5db1876f847',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a4f7940-ffd2-439d-8a49-1349d1321083' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a4f7940-ffd2-439d-8a49-1349d1321083',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '016c4343-fa35-4af1-ac3f-8f54949a6592' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '016c4343-fa35-4af1-ac3f-8f54949a6592',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'Name',
            'Name',
            'Unique transport name, for example Database or AWS-prod-us-east-1.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65f509af-7c0c-470c-acf5-1ca9f4ab5553' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '65f509af-7c0c-470c-acf5-1ca9f4ab5553',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'Description',
            'Description',
            'What this transport is used for and who operates it.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16666639-5cf4-4b63-a27b-bd02c7320334' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '16666639-5cf4-4b63-a27b-bd02c7320334',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'DriverClass',
            'Driver Class',
            'ClassFactory key of the BaseTransportDriverFactory registration that builds the driver: Database or AWS.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e11903cd-f43b-435d-bde4-b359b1742150' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e11903cd-f43b-435d-bde4-b359b1742150',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'Configuration',
            'Configuration',
            'Driver-specific JSON configuration, for example {"Region":"us-east-1"}. Never holds secrets; use CredentialID.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff986e0f-d132-4e7f-b3ea-1df2f150b28e' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'CredentialID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ff986e0f-d132-4e7f-b3ea-1df2f150b28e',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'CredentialID',
            'Credential ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e02179b9-e69d-4986-98ee-fb87ecb1bde5' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e02179b9-e69d-4986-98ee-fb87ecb1bde5',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'Status',
            'Status',
            'Active transports can deliver; Disabled transports reject publishes.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '985a335c-68f6-4c55-8400-755aecab5f00' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '985a335c-68f6-4c55-8400-755aecab5f00',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd9ab930-910d-401a-8834-b181d3d82326' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd9ab930-910d-401a-8834-b181d3d82326',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cfc35288-6047-40fa-83a8-a9c60f20ffaf' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cfc35288-6047-40fa-83a8-a9c60f20ffaf',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e6a1469c-6f9d-485b-9037-6634e4757392' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'PublishOrdinal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e6a1469c-6f9d-485b-9037-6634e4757392',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'PublishOrdinal',
            'Publish Ordinal',
            'Publish order, assigned by the database. Every delivery of the message carries it as its OrderKey.',
            'bigint',
            8,
            19,
            0,
            0,
            NULL,
            1,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f1b739b-adc5-45f2-ab6e-877f431884a0' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'TopicID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f1b739b-adc5-45f2-ab6e-877f431884a0',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'TopicID',
            'Topic ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F4D03836-2513-4E94-9BA4-0CD3D968B849',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dcefa061-624f-4cd7-98c5-a8c6becafe6e' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'PartitionKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dcefa061-624f-4cd7-98c5-a8c6becafe6e',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'PartitionKey',
            'Partition Key',
            'Producer-supplied key used by Exclusive and Ordered subscriptions. Compared case-sensitively (binary collation).',
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f75b4d7-ca85-4b71-a038-124be0170493' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'Attributes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3f75b4d7-ca85-4b71-a038-124be0170493',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'Attributes',
            'Attributes',
            'JSON object of string attributes (at most 10). The only envelope fields subscription filters see.',
            'nvarchar',
            8000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88c35806-f57d-411e-8935-fb2094bc554d' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'Payload')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '88c35806-f57d-411e-8935-fb2094bc554d',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'Payload',
            'Payload',
            'Inline JSON payload. Mutually exclusive with PayloadRef.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68cf108c-6d46-4419-9a48-db68fab1eff4' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'PayloadRef')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68cf108c-6d46-4419-9a48-db68fab1eff4',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'PayloadRef',
            'Payload Ref',
            'JSON claim-check reference ({"Uri":...}) to data held outside the queue.',
            'nvarchar',
            4000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5be24ef6-0b0b-4634-b5d6-47045b061c85' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'CorrelationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5be24ef6-0b0b-4634-b5d6-47045b061c85',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'CorrelationID',
            'Correlation ID',
            'Caller-supplied identifier for tracing related work.',
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8bb91f25-6792-4b18-8da5-7cc538075b79' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'PublishedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8bb91f25-6792-4b18-8da5-7cc538075b79',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'PublishedAt',
            'Published At',
            'When MJ accepted the publish, on the database clock.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7db4c98-ec8a-4e52-9053-396dc0eabdf3' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'PublishedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a7db4c98-ec8a-4e52-9053-396dc0eabdf3',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'PublishedByUserID',
            'Published By User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '495d4e78-0938-4dfb-9b41-3d8ce413f940' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '495d4e78-0938-4dfb-9b41-3d8ce413f940',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6a15ca5-1971-4252-a13d-0e1772167fa4' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6a15ca5-1971-4252-a13d-0e1772167fa4',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 758a50a0-30d8-4224-bbfe-616cee8ad3e1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('758a50a0-30d8-4224-bbfe-616cee8ad3e1', 'E02179B9-E69D-4986-98EE-FB87ECB1BDE5', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 450d2f77-d364-4250-8ac7-21ebee15dc95 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('450d2f77-d364-4250-8ac7-21ebee15dc95', 'E02179B9-E69D-4986-98EE-FB87ECB1BDE5', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E02179B9-E69D-4986-98EE-FB87ECB1BDE5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='E02179B9-E69D-4986-98EE-FB87ECB1BDE5';

/* SQL text to insert entity field value with ID be9bd22d-d56c-45a5-9004-4353a525579b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('be9bd22d-d56c-45a5-9004-4353a525579b', '4400478C-1407-4EDA-80A1-081BFDDF6387', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c902503f-52f4-4a04-9a2e-61999af0d631 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c902503f-52f4-4a04-9a2e-61999af0d631', '4400478C-1407-4EDA-80A1-081BFDDF6387', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4400478C-1407-4EDA-80A1-081BFDDF6387 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4400478C-1407-4EDA-80A1-081BFDDF6387';

/* SQL text to insert entity field value with ID e2624244-dcc3-4fa1-b767-eea5182a3d17 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e2624244-dcc3-4fa1-b767-eea5182a3d17', '6D642099-5E3E-4107-8F30-9F6FA33C075F', 1, 'Exclusive', 'Exclusive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4bcf210a-f960-4d8d-95cb-3f05b695edff */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4bcf210a-f960-4d8d-95cb-3f05b695edff', '6D642099-5E3E-4107-8F30-9F6FA33C075F', 2, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b53d10de-4686-4649-b744-99bee8edb6c8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b53d10de-4686-4649-b744-99bee8edb6c8', '6D642099-5E3E-4107-8F30-9F6FA33C075F', 3, 'Ordered', 'Ordered', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6D642099-5E3E-4107-8F30-9F6FA33C075F */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6D642099-5E3E-4107-8F30-9F6FA33C075F';

/* SQL text to insert entity field value with ID a444d3d7-0439-4667-a3e1-7b4b95f7b237 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a444d3d7-0439-4667-a3e1-7b4b95f7b237', 'B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18', 1, 'Auto', 'Auto', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ee3d5a34-e7b3-45ab-a97a-2faadbed3ce6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ee3d5a34-e7b3-45ab-a97a-2faadbed3ce6', 'B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18', 2, 'Manual', 'Manual', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='B1D0C3B6-93CA-41E0-8E4A-5385D67C2E18';

/* SQL text to insert entity field value with ID b87e8e20-32c7-4aef-ba00-039823af993d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b87e8e20-32c7-4aef-ba00-039823af993d', '90B702A1-819F-44E8-ACB5-EDD7C717AF77', 1, 'External', 'External', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f85bd964-63c9-4360-b3ac-333984428493 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f85bd964-63c9-4360-b3ac-333984428493', '90B702A1-819F-44E8-ACB5-EDD7C717AF77', 2, 'MJWorker', 'MJWorker', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 90B702A1-819F-44E8-ACB5-EDD7C717AF77 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='90B702A1-819F-44E8-ACB5-EDD7C717AF77';

/* SQL text to insert entity field value with ID 065413aa-8d2d-409e-9fac-83ae7c1302b2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('065413aa-8d2d-409e-9fac-83ae7c1302b2', 'F57387A0-3683-4B96-8BB5-D3D36F2B4604', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e008d53c-6552-46a7-984d-4ac51a03e7e5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e008d53c-6552-46a7-984d-4ac51a03e7e5', 'F57387A0-3683-4B96-8BB5-D3D36F2B4604', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a127ed05-77da-46b2-9b1c-3eed6564c075 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a127ed05-77da-46b2-9b1c-3eed6564c075', 'F57387A0-3683-4B96-8BB5-D3D36F2B4604', 3, 'Paused', 'Paused', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F57387A0-3683-4B96-8BB5-D3D36F2B4604 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F57387A0-3683-4B96-8BB5-D3D36F2B4604';

/* SQL text to insert entity field value with ID f9ad8261-bfc1-4bf8-9914-93abf6261ed8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f9ad8261-bfc1-4bf8-9914-93abf6261ed8', 'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cbe05aeb-effc-442e-a214-3450618aed17 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cbe05aeb-effc-442e-a214-3450618aed17', 'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C', 2, 'DeadLettered', 'DeadLettered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bf6cd4ac-180c-4891-aa0f-5f79353bfedd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bf6cd4ac-180c-4891-aa0f-5f79353bfedd', 'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C', 3, 'Discarded', 'Discarded', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6c9dd949-0a61-4ae7-9d21-9008c9ab0595 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6c9dd949-0a61-4ae7-9d21-9008c9ab0595', 'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C', 4, 'InFlight', 'InFlight', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 74366eb0-7f8f-4b46-8e3b-45bb37e4051f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('74366eb0-7f8f-4b46-8e3b-45bb37e4051f', 'AE1A3B3E-07D2-4564-860A-9A5BD1735E7C', 5, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID AE1A3B3E-07D2-4564-860A-9A5BD1735E7C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='AE1A3B3E-07D2-4564-860A-9A5BD1735E7C';

/* SQL text to insert entity field value with ID dc03b028-15ac-431e-b5ee-d8c525d95494 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dc03b028-15ac-431e-b5ee-d8c525d95494', '01B08D72-B840-4944-864C-86AA798725B2', 1, 'Confirmed', 'Confirmed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6702e933-ca65-4300-95e4-ee5aac81c89e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6702e933-ca65-4300-95e4-ee5aac81c89e', '01B08D72-B840-4944-864C-86AA798725B2', 2, 'Reserved', 'Reserved', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 01B08D72-B840-4944-864C-86AA798725B2 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='01B08D72-B840-4944-864C-86AA798725B2';

/* Deterministic search-flag hygiene — seed name fields */

         UPDATE [${flyway:defaultSchema}].[EntityField]
         SET [IncludeInUserSearchAPI] = 1,
             [UserSearchPredicateAPI] = 'BeginsWith'
         WHERE [ID] IN (
            SELECT ranked.[ID] FROM (
               SELECT f.[ID],
                      ROW_NUMBER() OVER (
                         PARTITION BY f.[EntityID]
                         ORDER BY f.[Sequence], f.[Name]
                      ) AS rn
               FROM [${flyway:defaultSchema}].[EntityField] f
               INNER JOIN [${flyway:defaultSchema}].[Entity] e ON e.[ID] = f.[EntityID]
               WHERE LOWER(f.[Name]) IN ('name','title','firstname','lastname','middlename','displayname','fullname','label')
                 AND f.[AutoUpdateIncludeInUserSearchAPI] = 1
                 AND f.[IncludeInUserSearchAPI] = 0
                 AND ISNULL(f.[IsPrimaryKey], 0) = 0
                 AND ISNULL(f.[IsVirtual], 0) = 0
                 AND LOWER(f.[Type]) IN ('nvarchar','varchar','char','nchar')
                 AND ISNULL(f.[Length], 0) <> -1
                 AND e.[VirtualEntity] = 0
                 AND e.[AllowUserSearchAPI] = 1
                 AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
                 AND NOT ((e.[Name] = 'Logs' OR e.[Name] LIKE '% Logs') OR (e.[Name] = 'Log' OR e.[Name] LIKE '% Log') OR (e.[Name] = 'Runs' OR e.[Name] LIKE '% Runs') OR (e.[Name] = 'Run' OR e.[Name] LIKE '% Run') OR (e.[Name] = 'Run History' OR e.[Name] LIKE '% Run History') OR (e.[Name] = 'Run Steps' OR e.[Name] LIKE '% Run Steps') OR (e.[Name] = 'Run Messages' OR e.[Name] LIKE '% Run Messages') OR (e.[Name] = 'Execution Logs' OR e.[Name] LIKE '% Execution Logs') OR (e.[Name] = 'Details' OR e.[Name] LIKE '% Details') OR (e.[Name] = 'Detail' OR e.[Name] LIKE '% Detail') OR (e.[Name] = 'Lines' OR e.[Name] LIKE '% Lines') OR (e.[Name] = 'Line' OR e.[Name] LIKE '% Line') OR (e.[Name] = 'Items' OR e.[Name] LIKE '% Items') OR (e.[Name] = 'Item' OR e.[Name] LIKE '% Item') OR (e.[Name] = 'Steps' OR e.[Name] LIKE '% Steps') OR (e.[Name] = 'Step' OR e.[Name] LIKE '% Step') OR (e.[Name] = 'Params' OR e.[Name] LIKE '% Params') OR (e.[Name] = 'Param' OR e.[Name] LIKE '% Param') OR (e.[Name] = 'Mappings' OR e.[Name] LIKE '% Mappings') OR (e.[Name] = 'Mapping' OR e.[Name] LIKE '% Mapping') OR (e.[Name] = 'Audit' OR e.[Name] LIKE 'Audit %' OR e.[Name] LIKE '% Audit' OR e.[Name] LIKE '% Audit %') OR (e.[Name] = 'Record Change' OR e.[Name] LIKE 'Record Change %' OR e.[Name] LIKE '% Record Change' OR e.[Name] LIKE '% Record Change %'))
                 AND e.[SchemaName] NOT IN ('sys','staging')
                 AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
            ) ranked
            WHERE ranked.rn <= 3
         );

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Work Queue Topics -> MJ: Work Queue Subscriptions (One To Many via TopicID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd6f52a25-9ada-4d32-99f7-c3f8223bef00'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d6f52a25-9ada-4d32-99f7-c3f8223bef00', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A', 'TopicID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Work Queue Topics -> MJ: Work Queue Deduplications (One To Many via TopicID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c68a8872-5f71-46fa-90a9-1d3b50ab5538'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c68a8872-5f71-46fa-90a9-1d3b50ab5538', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', 'TopicID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Work Queue Topics -> MJ: Work Queue Messages (One To Many via TopicID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6fdc3bf5-6abb-4607-b6e9-f760844c6156'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6fdc3bf5-6abb-4607-b6e9-f760844c6156', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'TopicID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Work Queue Subscriptions -> MJ: Work Queue Deliveries (One To Many via SubscriptionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4b77fb8b-d8ff-4c5e-bcd2-efc4a48dcede'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4b77fb8b-d8ff-4c5e-bcd2-efc4a48dcede', 'F75584C0-1BB2-4645-AA4C-24D35B43D45A', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'SubscriptionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Work Queue Transports -> MJ: Work Queue Topics (One To Many via TransportID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bffb745a-e647-4590-9bc5-9a58e081a15c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bffb745a-e647-4590-9bc5-9a58e081a15c', '619F0CE1-795C-4B20-9E08-3C45F179AEB5', 'F4D03836-2513-4E94-9BA4-0CD3D968B849', 'TransportID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Work Queue Deliveries (One To Many via ResolvedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd8e1841b-3357-4c91-bbed-601662a9dc34'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d8e1841b-3357-4c91-bbed-601662a9dc34', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'ResolvedByUserID', 'One To Many', 1, 1, 106, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Work Queue Messages (One To Many via PublishedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'db92d232-cd08-475d-a25b-51d7dd449d4e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('db92d232-cd08-475d-a25b-51d7dd449d4e', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'PublishedByUserID', 'One To Many', 1, 1, 107, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Credentials -> MJ: Work Queue Transports (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd38a1e6b-8799-4c05-8c72-7f830fa06ec3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d38a1e6b-8799-4c05-8c72-7f830fa06ec3', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '619F0CE1-795C-4B20-9E08-3C45F179AEB5', 'CredentialID', 'One To Many', 1, 1, 13, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Work Queue Messages -> MJ: Work Queue Deliveries (One To Many via MessageID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fce81e1a-ff9c-4adf-aceb-050196414b76'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fce81e1a-ff9c-4adf-aceb-050196414b76', '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', 'D0A12FDF-8956-419C-81DF-37A0127A60D2', 'MessageID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to update entity field related entity name field map for entity field ID 83E95083-AE41-428B-82BD-787E1262EC89 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='83E95083-AE41-428B-82BD-787E1262EC89', @RelatedEntityNameFieldMap='FeatureValueCache';

/* Index for Foreign Keys for WorkQueueDeduplication */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deduplications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TopicID in table WorkQueueDeduplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueDeduplication_TopicID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueDeduplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueDeduplication_TopicID ON [${flyway:defaultSchema}].[WorkQueueDeduplication] ([TopicID]);

/* SQL text to update entity field related entity name field map for entity field ID 7C6B2BAD-997C-4DCD-B012-559141AE9C86 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7C6B2BAD-997C-4DCD-B012-559141AE9C86', @RelatedEntityNameFieldMap='Topic';

/* Index for Foreign Keys for WorkQueueDelivery */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deliveries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MessageID in table WorkQueueDelivery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueDelivery_MessageID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueDelivery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueDelivery_MessageID ON [${flyway:defaultSchema}].[WorkQueueDelivery] ([MessageID]);

-- Index for foreign key SubscriptionID in table WorkQueueDelivery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueDelivery_SubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueDelivery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueDelivery_SubscriptionID ON [${flyway:defaultSchema}].[WorkQueueDelivery] ([SubscriptionID]);

-- Index for foreign key ResolvedByUserID in table WorkQueueDelivery
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueDelivery_ResolvedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueDelivery]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueDelivery_ResolvedByUserID ON [${flyway:defaultSchema}].[WorkQueueDelivery] ([ResolvedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID E22C4CBC-D8F2-4268-997B-DACB73734034 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E22C4CBC-D8F2-4268-997B-DACB73734034', @RelatedEntityNameFieldMap='Subscription';

/* Index for Foreign Keys for WorkQueueMessage */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Messages
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TopicID in table WorkQueueMessage
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueMessage_TopicID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueMessage]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueMessage_TopicID ON [${flyway:defaultSchema}].[WorkQueueMessage] ([TopicID]);

-- Index for foreign key PublishedByUserID in table WorkQueueMessage
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueMessage_PublishedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueMessage]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueMessage_PublishedByUserID ON [${flyway:defaultSchema}].[WorkQueueMessage] ([PublishedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 8F1B739B-ADC5-45F2-AB6E-877F431884A0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8F1B739B-ADC5-45F2-AB6E-877F431884A0', @RelatedEntityNameFieldMap='Topic';

/* SQL text to update entity field related entity name field map for entity field ID 4E26CD8F-6B2C-42FA-ACBC-301AEE97E360 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4E26CD8F-6B2C-42FA-ACBC-301AEE97E360', @RelatedEntityNameFieldMap='ResolvedByUser';

/* Base View SQL for MJ: Work Queue Deduplications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deduplications
-- Item: vwWorkQueueDeduplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Deduplications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WorkQueueDeduplication
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWorkQueueDeduplications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWorkQueueDeduplications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWorkQueueDeduplications]
AS
SELECT
    w.*,
    MJWorkQueueTopic_TopicID.[Name] AS [Topic]
FROM
    [${flyway:defaultSchema}].[WorkQueueDeduplication] AS w
INNER JOIN
    [${flyway:defaultSchema}].[WorkQueueTopic] AS MJWorkQueueTopic_TopicID
  ON
    [w].[TopicID] = MJWorkQueueTopic_TopicID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueDeduplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Work Queue Deduplications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deduplications
-- Item: Permissions for vwWorkQueueDeduplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueDeduplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Work Queue Deduplications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deduplications
-- Item: spCreateWorkQueueDeduplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkQueueDeduplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkQueueDeduplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueDeduplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueDeduplication]
    @ID uniqueidentifier = NULL,
    @TopicID uniqueidentifier,
    @DeduplicationKey nvarchar(200),
    @MessageID uniqueidentifier,
    @Status nvarchar(20),
    @ExpiresAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueDeduplication]
            (
                [ID],
                [TopicID],
                [DeduplicationKey],
                [MessageID],
                [Status],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TopicID,
                @DeduplicationKey,
                @MessageID,
                @Status,
                @ExpiresAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueDeduplication]
            (
                [TopicID],
                [DeduplicationKey],
                [MessageID],
                [Status],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TopicID,
                @DeduplicationKey,
                @MessageID,
                @Status,
                @ExpiresAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkQueueDeduplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueDeduplication] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Work Queue Deduplications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueDeduplication] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Work Queue Deduplications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deduplications
-- Item: spUpdateWorkQueueDeduplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkQueueDeduplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkQueueDeduplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueDeduplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueDeduplication]
    @ID uniqueidentifier,
    @TopicID uniqueidentifier = NULL,
    @DeduplicationKey nvarchar(200) = NULL,
    @MessageID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueDeduplication]
    SET
        [TopicID] = ISNULL(@TopicID, [TopicID]),
        [DeduplicationKey] = ISNULL(@DeduplicationKey, [DeduplicationKey]),
        [MessageID] = ISNULL(@MessageID, [MessageID]),
        [Status] = ISNULL(@Status, [Status]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkQueueDeduplications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkQueueDeduplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueDeduplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueDeduplication table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkQueueDeduplication]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkQueueDeduplication];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkQueueDeduplication
ON [${flyway:defaultSchema}].[WorkQueueDeduplication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueDeduplication]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkQueueDeduplication] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Work Queue Deduplications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueDeduplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Work Queue Deduplications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deduplications
-- Item: spDeleteWorkQueueDeduplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkQueueDeduplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkQueueDeduplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueDeduplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueDeduplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkQueueDeduplication]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueDeduplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Work Queue Deduplications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueDeduplication] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID A7DB4C98-EC8A-4E52-9053-396DC0EABDF3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A7DB4C98-EC8A-4E52-9053-396DC0EABDF3', @RelatedEntityNameFieldMap='PublishedByUser';

/* Base View SQL for MJ: Work Queue Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Messages
-- Item: vwWorkQueueMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Messages
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WorkQueueMessage
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWorkQueueMessages]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWorkQueueMessages];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWorkQueueMessages]
AS
SELECT
    w.*,
    MJWorkQueueTopic_TopicID.[Name] AS [Topic],
    MJUser_PublishedByUserID.[Name] AS [PublishedByUser]
FROM
    [${flyway:defaultSchema}].[WorkQueueMessage] AS w
INNER JOIN
    [${flyway:defaultSchema}].[WorkQueueTopic] AS MJWorkQueueTopic_TopicID
  ON
    [w].[TopicID] = MJWorkQueueTopic_TopicID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_PublishedByUserID
  ON
    [w].[PublishedByUserID] = MJUser_PublishedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueMessages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Work Queue Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Messages
-- Item: Permissions for vwWorkQueueMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueMessages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Work Queue Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Messages
-- Item: spCreateWorkQueueMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkQueueMessage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkQueueMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueMessage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueMessage]
    @ID uniqueidentifier = NULL,
    @PublishOrdinal bigint,
    @TopicID uniqueidentifier,
    @PartitionKey_Clear bit = 0,
    @PartitionKey nvarchar(200) = NULL,
    @Attributes_Clear bit = 0,
    @Attributes nvarchar(4000) = NULL,
    @Payload_Clear bit = 0,
    @Payload nvarchar(MAX) = NULL,
    @PayloadRef_Clear bit = 0,
    @PayloadRef nvarchar(2000) = NULL,
    @CorrelationID_Clear bit = 0,
    @CorrelationID nvarchar(200) = NULL,
    @PublishedAt datetimeoffset = NULL,
    @PublishedByUserID_Clear bit = 0,
    @PublishedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[WorkQueueMessage]
        (
            [TopicID],
                [PartitionKey],
                [Attributes],
                [Payload],
                [PayloadRef],
                [CorrelationID],
                [PublishedAt],
                [PublishedByUserID],
                [ID]
        )
    VALUES
        (
            @TopicID,
                CASE WHEN @PartitionKey_Clear = 1 THEN NULL ELSE ISNULL(@PartitionKey, NULL) END,
                CASE WHEN @Attributes_Clear = 1 THEN NULL ELSE ISNULL(@Attributes, NULL) END,
                CASE WHEN @Payload_Clear = 1 THEN NULL ELSE ISNULL(@Payload, NULL) END,
                CASE WHEN @PayloadRef_Clear = 1 THEN NULL ELSE ISNULL(@PayloadRef, NULL) END,
                CASE WHEN @CorrelationID_Clear = 1 THEN NULL ELSE ISNULL(@CorrelationID, NULL) END,
                ISNULL(@PublishedAt, sysdatetimeoffset()),
                CASE WHEN @PublishedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PublishedByUserID, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkQueueMessages] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueMessage] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Work Queue Messages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueMessage] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Work Queue Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Messages
-- Item: spUpdateWorkQueueMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkQueueMessage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkQueueMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueMessage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueMessage]
    @ID uniqueidentifier,
    @PublishOrdinal bigint = NULL,
    @TopicID uniqueidentifier = NULL,
    @PartitionKey_Clear bit = 0,
    @PartitionKey nvarchar(200) = NULL,
    @Attributes_Clear bit = 0,
    @Attributes nvarchar(4000) = NULL,
    @Payload_Clear bit = 0,
    @Payload nvarchar(MAX) = NULL,
    @PayloadRef_Clear bit = 0,
    @PayloadRef nvarchar(2000) = NULL,
    @CorrelationID_Clear bit = 0,
    @CorrelationID nvarchar(200) = NULL,
    @PublishedAt datetimeoffset = NULL,
    @PublishedByUserID_Clear bit = 0,
    @PublishedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueMessage]
    SET
        [TopicID] = ISNULL(@TopicID, [TopicID]),
        [PartitionKey] = CASE WHEN @PartitionKey_Clear = 1 THEN NULL ELSE ISNULL(@PartitionKey, [PartitionKey]) END,
        [Attributes] = CASE WHEN @Attributes_Clear = 1 THEN NULL ELSE ISNULL(@Attributes, [Attributes]) END,
        [Payload] = CASE WHEN @Payload_Clear = 1 THEN NULL ELSE ISNULL(@Payload, [Payload]) END,
        [PayloadRef] = CASE WHEN @PayloadRef_Clear = 1 THEN NULL ELSE ISNULL(@PayloadRef, [PayloadRef]) END,
        [CorrelationID] = CASE WHEN @CorrelationID_Clear = 1 THEN NULL ELSE ISNULL(@CorrelationID, [CorrelationID]) END,
        [PublishedAt] = ISNULL(@PublishedAt, [PublishedAt]),
        [PublishedByUserID] = CASE WHEN @PublishedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PublishedByUserID, [PublishedByUserID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkQueueMessages] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkQueueMessages]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueMessage] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueMessage table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkQueueMessage]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkQueueMessage];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkQueueMessage
ON [${flyway:defaultSchema}].[WorkQueueMessage]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueMessage]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkQueueMessage] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Work Queue Messages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueMessage] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Work Queue Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Messages
-- Item: spDeleteWorkQueueMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkQueueMessage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkQueueMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueMessage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueMessage]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkQueueMessage]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueMessage] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Work Queue Messages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueMessage] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Work Queue Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deliveries
-- Item: vwWorkQueueDeliveries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Deliveries
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WorkQueueDelivery
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWorkQueueDeliveries]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWorkQueueDeliveries];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWorkQueueDeliveries]
AS
SELECT
    w.*,
    MJWorkQueueSubscription_SubscriptionID.[Name] AS [Subscription],
    MJUser_ResolvedByUserID.[Name] AS [ResolvedByUser]
FROM
    [${flyway:defaultSchema}].[WorkQueueDelivery] AS w
INNER JOIN
    [${flyway:defaultSchema}].[WorkQueueSubscription] AS MJWorkQueueSubscription_SubscriptionID
  ON
    [w].[SubscriptionID] = MJWorkQueueSubscription_SubscriptionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ResolvedByUserID
  ON
    [w].[ResolvedByUserID] = MJUser_ResolvedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueDeliveries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Work Queue Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deliveries
-- Item: Permissions for vwWorkQueueDeliveries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueDeliveries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Work Queue Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deliveries
-- Item: spCreateWorkQueueDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkQueueDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkQueueDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueDelivery]
    @ID uniqueidentifier = NULL,
    @MessageID uniqueidentifier,
    @SubscriptionID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @PartitionKey_Clear bit = 0,
    @PartitionKey nvarchar(200) = NULL,
    @OrderKey bigint,
    @AttemptCount int = NULL,
    @IsReplay bit = NULL,
    @VisibleAt datetimeoffset = NULL,
    @LeaseOwner_Clear bit = 0,
    @LeaseOwner nvarchar(200) = NULL,
    @LeaseToken_Clear bit = 0,
    @LeaseToken uniqueidentifier = NULL,
    @LeaseExpiresAt_Clear bit = 0,
    @LeaseExpiresAt datetimeoffset = NULL,
    @LastHeartbeatAt_Clear bit = 0,
    @LastHeartbeatAt datetimeoffset = NULL,
    @Progress_Clear bit = 0,
    @Progress nvarchar(4000) = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @DeadLetterReason_Clear bit = 0,
    @DeadLetterReason nvarchar(100) = NULL,
    @DeadLetteredAt_Clear bit = 0,
    @DeadLetteredAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @CancelRequestedAt_Clear bit = 0,
    @CancelRequestedAt datetimeoffset = NULL,
    @ResolvedByUserID_Clear bit = 0,
    @ResolvedByUserID uniqueidentifier = NULL,
    @ResolutionNote_Clear bit = 0,
    @ResolutionNote nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueDelivery]
            (
                [ID],
                [MessageID],
                [SubscriptionID],
                [Status],
                [PartitionKey],
                [OrderKey],
                [AttemptCount],
                [IsReplay],
                [VisibleAt],
                [LeaseOwner],
                [LeaseToken],
                [LeaseExpiresAt],
                [LastHeartbeatAt],
                [Progress],
                [LastError],
                [DeadLetterReason],
                [DeadLetteredAt],
                [CompletedAt],
                [CancelRequestedAt],
                [ResolvedByUserID],
                [ResolutionNote]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MessageID,
                @SubscriptionID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @PartitionKey_Clear = 1 THEN NULL ELSE ISNULL(@PartitionKey, NULL) END,
                @OrderKey,
                ISNULL(@AttemptCount, 0),
                ISNULL(@IsReplay, 0),
                ISNULL(@VisibleAt, sysdatetimeoffset()),
                CASE WHEN @LeaseOwner_Clear = 1 THEN NULL ELSE ISNULL(@LeaseOwner, NULL) END,
                CASE WHEN @LeaseToken_Clear = 1 THEN NULL ELSE ISNULL(@LeaseToken, NULL) END,
                CASE WHEN @LeaseExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@LeaseExpiresAt, NULL) END,
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END,
                CASE WHEN @Progress_Clear = 1 THEN NULL ELSE ISNULL(@Progress, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @DeadLetterReason_Clear = 1 THEN NULL ELSE ISNULL(@DeadLetterReason, NULL) END,
                CASE WHEN @DeadLetteredAt_Clear = 1 THEN NULL ELSE ISNULL(@DeadLetteredAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @CancelRequestedAt_Clear = 1 THEN NULL ELSE ISNULL(@CancelRequestedAt, NULL) END,
                CASE WHEN @ResolvedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedByUserID, NULL) END,
                CASE WHEN @ResolutionNote_Clear = 1 THEN NULL ELSE ISNULL(@ResolutionNote, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueDelivery]
            (
                [MessageID],
                [SubscriptionID],
                [Status],
                [PartitionKey],
                [OrderKey],
                [AttemptCount],
                [IsReplay],
                [VisibleAt],
                [LeaseOwner],
                [LeaseToken],
                [LeaseExpiresAt],
                [LastHeartbeatAt],
                [Progress],
                [LastError],
                [DeadLetterReason],
                [DeadLetteredAt],
                [CompletedAt],
                [CancelRequestedAt],
                [ResolvedByUserID],
                [ResolutionNote]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MessageID,
                @SubscriptionID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @PartitionKey_Clear = 1 THEN NULL ELSE ISNULL(@PartitionKey, NULL) END,
                @OrderKey,
                ISNULL(@AttemptCount, 0),
                ISNULL(@IsReplay, 0),
                ISNULL(@VisibleAt, sysdatetimeoffset()),
                CASE WHEN @LeaseOwner_Clear = 1 THEN NULL ELSE ISNULL(@LeaseOwner, NULL) END,
                CASE WHEN @LeaseToken_Clear = 1 THEN NULL ELSE ISNULL(@LeaseToken, NULL) END,
                CASE WHEN @LeaseExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@LeaseExpiresAt, NULL) END,
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END,
                CASE WHEN @Progress_Clear = 1 THEN NULL ELSE ISNULL(@Progress, NULL) END,
                CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, NULL) END,
                CASE WHEN @DeadLetterReason_Clear = 1 THEN NULL ELSE ISNULL(@DeadLetterReason, NULL) END,
                CASE WHEN @DeadLetteredAt_Clear = 1 THEN NULL ELSE ISNULL(@DeadLetteredAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @CancelRequestedAt_Clear = 1 THEN NULL ELSE ISNULL(@CancelRequestedAt, NULL) END,
                CASE WHEN @ResolvedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedByUserID, NULL) END,
                CASE WHEN @ResolutionNote_Clear = 1 THEN NULL ELSE ISNULL(@ResolutionNote, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkQueueDeliveries] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueDelivery] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Work Queue Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueDelivery] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Work Queue Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deliveries
-- Item: spUpdateWorkQueueDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkQueueDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkQueueDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueDelivery]
    @ID uniqueidentifier,
    @MessageID uniqueidentifier = NULL,
    @SubscriptionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @PartitionKey_Clear bit = 0,
    @PartitionKey nvarchar(200) = NULL,
    @OrderKey bigint = NULL,
    @AttemptCount int = NULL,
    @IsReplay bit = NULL,
    @VisibleAt datetimeoffset = NULL,
    @LeaseOwner_Clear bit = 0,
    @LeaseOwner nvarchar(200) = NULL,
    @LeaseToken_Clear bit = 0,
    @LeaseToken uniqueidentifier = NULL,
    @LeaseExpiresAt_Clear bit = 0,
    @LeaseExpiresAt datetimeoffset = NULL,
    @LastHeartbeatAt_Clear bit = 0,
    @LastHeartbeatAt datetimeoffset = NULL,
    @Progress_Clear bit = 0,
    @Progress nvarchar(4000) = NULL,
    @LastError_Clear bit = 0,
    @LastError nvarchar(MAX) = NULL,
    @DeadLetterReason_Clear bit = 0,
    @DeadLetterReason nvarchar(100) = NULL,
    @DeadLetteredAt_Clear bit = 0,
    @DeadLetteredAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @CancelRequestedAt_Clear bit = 0,
    @CancelRequestedAt datetimeoffset = NULL,
    @ResolvedByUserID_Clear bit = 0,
    @ResolvedByUserID uniqueidentifier = NULL,
    @ResolutionNote_Clear bit = 0,
    @ResolutionNote nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET
        [MessageID] = ISNULL(@MessageID, [MessageID]),
        [SubscriptionID] = ISNULL(@SubscriptionID, [SubscriptionID]),
        [Status] = ISNULL(@Status, [Status]),
        [PartitionKey] = CASE WHEN @PartitionKey_Clear = 1 THEN NULL ELSE ISNULL(@PartitionKey, [PartitionKey]) END,
        [OrderKey] = ISNULL(@OrderKey, [OrderKey]),
        [AttemptCount] = ISNULL(@AttemptCount, [AttemptCount]),
        [IsReplay] = ISNULL(@IsReplay, [IsReplay]),
        [VisibleAt] = ISNULL(@VisibleAt, [VisibleAt]),
        [LeaseOwner] = CASE WHEN @LeaseOwner_Clear = 1 THEN NULL ELSE ISNULL(@LeaseOwner, [LeaseOwner]) END,
        [LeaseToken] = CASE WHEN @LeaseToken_Clear = 1 THEN NULL ELSE ISNULL(@LeaseToken, [LeaseToken]) END,
        [LeaseExpiresAt] = CASE WHEN @LeaseExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@LeaseExpiresAt, [LeaseExpiresAt]) END,
        [LastHeartbeatAt] = CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, [LastHeartbeatAt]) END,
        [Progress] = CASE WHEN @Progress_Clear = 1 THEN NULL ELSE ISNULL(@Progress, [Progress]) END,
        [LastError] = CASE WHEN @LastError_Clear = 1 THEN NULL ELSE ISNULL(@LastError, [LastError]) END,
        [DeadLetterReason] = CASE WHEN @DeadLetterReason_Clear = 1 THEN NULL ELSE ISNULL(@DeadLetterReason, [DeadLetterReason]) END,
        [DeadLetteredAt] = CASE WHEN @DeadLetteredAt_Clear = 1 THEN NULL ELSE ISNULL(@DeadLetteredAt, [DeadLetteredAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [CancelRequestedAt] = CASE WHEN @CancelRequestedAt_Clear = 1 THEN NULL ELSE ISNULL(@CancelRequestedAt, [CancelRequestedAt]) END,
        [ResolvedByUserID] = CASE WHEN @ResolvedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedByUserID, [ResolvedByUserID]) END,
        [ResolutionNote] = CASE WHEN @ResolutionNote_Clear = 1 THEN NULL ELSE ISNULL(@ResolutionNote, [ResolutionNote]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkQueueDeliveries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkQueueDeliveries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueDelivery] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueDelivery table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkQueueDelivery]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkQueueDelivery];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkQueueDelivery
ON [${flyway:defaultSchema}].[WorkQueueDelivery]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueDelivery]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkQueueDelivery] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Work Queue Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueDelivery] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Work Queue Deliveries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Deliveries
-- Item: spDeleteWorkQueueDelivery
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkQueueDelivery
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkQueueDelivery]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueDelivery];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueDelivery]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkQueueDelivery]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueDelivery] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Work Queue Deliveries */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueDelivery] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for WorkQueueSubscription */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Subscriptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TopicID in table WorkQueueSubscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueSubscription_TopicID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueSubscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueSubscription_TopicID ON [${flyway:defaultSchema}].[WorkQueueSubscription] ([TopicID]);

/* SQL text to update entity field related entity name field map for entity field ID A296D756-5031-430F-B395-F8140F8187A3 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A296D756-5031-430F-B395-F8140F8187A3', @RelatedEntityNameFieldMap='Topic';

/* Index for Foreign Keys for WorkQueueTopic */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Topics
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TransportID in table WorkQueueTopic
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueTopic_TransportID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueTopic]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueTopic_TransportID ON [${flyway:defaultSchema}].[WorkQueueTopic] ([TransportID]);

/* SQL text to update entity field related entity name field map for entity field ID FD9DA7BB-8D36-41B7-8DFB-45CCD323733A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FD9DA7BB-8D36-41B7-8DFB-45CCD323733A', @RelatedEntityNameFieldMap='Transport';

/* Index for Foreign Keys for WorkQueueTransport */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Transports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialID in table WorkQueueTransport
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WorkQueueTransport_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WorkQueueTransport]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WorkQueueTransport_CredentialID ON [${flyway:defaultSchema}].[WorkQueueTransport] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID FF986E0F-D132-4E7F-B3EA-1DF2F150B28E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='FF986E0F-D132-4E7F-B3EA-1DF2F150B28E', @RelatedEntityNameFieldMap='Credential';

/* Base View SQL for MJ: Work Queue Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Subscriptions
-- Item: vwWorkQueueSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Subscriptions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WorkQueueSubscription
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWorkQueueSubscriptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWorkQueueSubscriptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWorkQueueSubscriptions]
AS
SELECT
    w.*,
    MJWorkQueueTopic_TopicID.[Name] AS [Topic]
FROM
    [${flyway:defaultSchema}].[WorkQueueSubscription] AS w
INNER JOIN
    [${flyway:defaultSchema}].[WorkQueueTopic] AS MJWorkQueueTopic_TopicID
  ON
    [w].[TopicID] = MJWorkQueueTopic_TopicID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Work Queue Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Subscriptions
-- Item: Permissions for vwWorkQueueSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Work Queue Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Subscriptions
-- Item: spCreateWorkQueueSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkQueueSubscription
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkQueueSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueSubscription];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueSubscription]
    @ID uniqueidentifier = NULL,
    @TopicID uniqueidentifier,
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Filter_Clear bit = 0,
    @Filter nvarchar(MAX) = NULL,
    @PartitionMode nvarchar(20) = NULL,
    @MaxAttempts int = NULL,
    @BackoffBaseSeconds int = NULL,
    @BackoffMaxSeconds int = NULL,
    @LeaseSeconds int = NULL,
    @HeartbeatMode nvarchar(20) = NULL,
    @MaxProcessingSeconds_Clear bit = 0,
    @MaxProcessingSeconds int = NULL,
    @HostType nvarchar(20) = NULL,
    @HandlerKey_Clear bit = 0,
    @HandlerKey nvarchar(200) = NULL,
    @ExternalRef_Clear bit = 0,
    @ExternalRef nvarchar(500) = NULL,
    @BindingConfig_Clear bit = 0,
    @BindingConfig nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueSubscription]
            (
                [ID],
                [TopicID],
                [Name],
                [Description],
                [Filter],
                [PartitionMode],
                [MaxAttempts],
                [BackoffBaseSeconds],
                [BackoffMaxSeconds],
                [LeaseSeconds],
                [HeartbeatMode],
                [MaxProcessingSeconds],
                [HostType],
                [HandlerKey],
                [ExternalRef],
                [BindingConfig],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TopicID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Filter_Clear = 1 THEN NULL ELSE ISNULL(@Filter, NULL) END,
                ISNULL(@PartitionMode, 'None'),
                ISNULL(@MaxAttempts, 5),
                ISNULL(@BackoffBaseSeconds, 10),
                ISNULL(@BackoffMaxSeconds, 900),
                ISNULL(@LeaseSeconds, 60),
                ISNULL(@HeartbeatMode, 'Auto'),
                CASE WHEN @MaxProcessingSeconds_Clear = 1 THEN NULL ELSE ISNULL(@MaxProcessingSeconds, NULL) END,
                ISNULL(@HostType, 'MJWorker'),
                CASE WHEN @HandlerKey_Clear = 1 THEN NULL ELSE ISNULL(@HandlerKey, NULL) END,
                CASE WHEN @ExternalRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalRef, NULL) END,
                CASE WHEN @BindingConfig_Clear = 1 THEN NULL ELSE ISNULL(@BindingConfig, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueSubscription]
            (
                [TopicID],
                [Name],
                [Description],
                [Filter],
                [PartitionMode],
                [MaxAttempts],
                [BackoffBaseSeconds],
                [BackoffMaxSeconds],
                [LeaseSeconds],
                [HeartbeatMode],
                [MaxProcessingSeconds],
                [HostType],
                [HandlerKey],
                [ExternalRef],
                [BindingConfig],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TopicID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Filter_Clear = 1 THEN NULL ELSE ISNULL(@Filter, NULL) END,
                ISNULL(@PartitionMode, 'None'),
                ISNULL(@MaxAttempts, 5),
                ISNULL(@BackoffBaseSeconds, 10),
                ISNULL(@BackoffMaxSeconds, 900),
                ISNULL(@LeaseSeconds, 60),
                ISNULL(@HeartbeatMode, 'Auto'),
                CASE WHEN @MaxProcessingSeconds_Clear = 1 THEN NULL ELSE ISNULL(@MaxProcessingSeconds, NULL) END,
                ISNULL(@HostType, 'MJWorker'),
                CASE WHEN @HandlerKey_Clear = 1 THEN NULL ELSE ISNULL(@HandlerKey, NULL) END,
                CASE WHEN @ExternalRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalRef, NULL) END,
                CASE WHEN @BindingConfig_Clear = 1 THEN NULL ELSE ISNULL(@BindingConfig, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkQueueSubscriptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueSubscription] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Work Queue Subscriptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueSubscription] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Work Queue Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Subscriptions
-- Item: spUpdateWorkQueueSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkQueueSubscription
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkQueueSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueSubscription];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueSubscription]
    @ID uniqueidentifier,
    @TopicID uniqueidentifier = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Filter_Clear bit = 0,
    @Filter nvarchar(MAX) = NULL,
    @PartitionMode nvarchar(20) = NULL,
    @MaxAttempts int = NULL,
    @BackoffBaseSeconds int = NULL,
    @BackoffMaxSeconds int = NULL,
    @LeaseSeconds int = NULL,
    @HeartbeatMode nvarchar(20) = NULL,
    @MaxProcessingSeconds_Clear bit = 0,
    @MaxProcessingSeconds int = NULL,
    @HostType nvarchar(20) = NULL,
    @HandlerKey_Clear bit = 0,
    @HandlerKey nvarchar(200) = NULL,
    @ExternalRef_Clear bit = 0,
    @ExternalRef nvarchar(500) = NULL,
    @BindingConfig_Clear bit = 0,
    @BindingConfig nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueSubscription]
    SET
        [TopicID] = ISNULL(@TopicID, [TopicID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Filter] = CASE WHEN @Filter_Clear = 1 THEN NULL ELSE ISNULL(@Filter, [Filter]) END,
        [PartitionMode] = ISNULL(@PartitionMode, [PartitionMode]),
        [MaxAttempts] = ISNULL(@MaxAttempts, [MaxAttempts]),
        [BackoffBaseSeconds] = ISNULL(@BackoffBaseSeconds, [BackoffBaseSeconds]),
        [BackoffMaxSeconds] = ISNULL(@BackoffMaxSeconds, [BackoffMaxSeconds]),
        [LeaseSeconds] = ISNULL(@LeaseSeconds, [LeaseSeconds]),
        [HeartbeatMode] = ISNULL(@HeartbeatMode, [HeartbeatMode]),
        [MaxProcessingSeconds] = CASE WHEN @MaxProcessingSeconds_Clear = 1 THEN NULL ELSE ISNULL(@MaxProcessingSeconds, [MaxProcessingSeconds]) END,
        [HostType] = ISNULL(@HostType, [HostType]),
        [HandlerKey] = CASE WHEN @HandlerKey_Clear = 1 THEN NULL ELSE ISNULL(@HandlerKey, [HandlerKey]) END,
        [ExternalRef] = CASE WHEN @ExternalRef_Clear = 1 THEN NULL ELSE ISNULL(@ExternalRef, [ExternalRef]) END,
        [BindingConfig] = CASE WHEN @BindingConfig_Clear = 1 THEN NULL ELSE ISNULL(@BindingConfig, [BindingConfig]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkQueueSubscriptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkQueueSubscriptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueSubscription] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueSubscription table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkQueueSubscription]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkQueueSubscription];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkQueueSubscription
ON [${flyway:defaultSchema}].[WorkQueueSubscription]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueSubscription]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkQueueSubscription] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Work Queue Subscriptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueSubscription] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Work Queue Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Subscriptions
-- Item: spDeleteWorkQueueSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkQueueSubscription
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkQueueSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueSubscription];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueSubscription]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkQueueSubscription]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueSubscription] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Work Queue Subscriptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueSubscription] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Work Queue Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Topics
-- Item: vwWorkQueueTopics
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Topics
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WorkQueueTopic
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWorkQueueTopics]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWorkQueueTopics];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWorkQueueTopics]
AS
SELECT
    w.*,
    MJWorkQueueTransport_TransportID.[Name] AS [Transport]
FROM
    [${flyway:defaultSchema}].[WorkQueueTopic] AS w
INNER JOIN
    [${flyway:defaultSchema}].[WorkQueueTransport] AS MJWorkQueueTransport_TransportID
  ON
    [w].[TransportID] = MJWorkQueueTransport_TransportID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueTopics] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Work Queue Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Topics
-- Item: Permissions for vwWorkQueueTopics
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueTopics] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Work Queue Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Topics
-- Item: spCreateWorkQueueTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkQueueTopic
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkQueueTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueTopic];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueTopic]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TransportID uniqueidentifier,
    @IsFifo bit = NULL,
    @AllowExternalPublish bit = NULL,
    @MaxPayloadBytes int = NULL,
    @DefaultDeduplicationTTLSeconds int = NULL,
    @RetentionDays int = NULL,
    @BindingConfig_Clear bit = 0,
    @BindingConfig nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueTopic]
            (
                [ID],
                [Name],
                [Description],
                [TransportID],
                [IsFifo],
                [AllowExternalPublish],
                [MaxPayloadBytes],
                [DefaultDeduplicationTTLSeconds],
                [RetentionDays],
                [BindingConfig],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TransportID,
                ISNULL(@IsFifo, 0),
                ISNULL(@AllowExternalPublish, 0),
                ISNULL(@MaxPayloadBytes, 262144),
                ISNULL(@DefaultDeduplicationTTLSeconds, 86400),
                ISNULL(@RetentionDays, 7),
                CASE WHEN @BindingConfig_Clear = 1 THEN NULL ELSE ISNULL(@BindingConfig, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueTopic]
            (
                [Name],
                [Description],
                [TransportID],
                [IsFifo],
                [AllowExternalPublish],
                [MaxPayloadBytes],
                [DefaultDeduplicationTTLSeconds],
                [RetentionDays],
                [BindingConfig],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @TransportID,
                ISNULL(@IsFifo, 0),
                ISNULL(@AllowExternalPublish, 0),
                ISNULL(@MaxPayloadBytes, 262144),
                ISNULL(@DefaultDeduplicationTTLSeconds, 86400),
                ISNULL(@RetentionDays, 7),
                CASE WHEN @BindingConfig_Clear = 1 THEN NULL ELSE ISNULL(@BindingConfig, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkQueueTopics] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueTopic] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Work Queue Topics */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueTopic] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Work Queue Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Topics
-- Item: spUpdateWorkQueueTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkQueueTopic
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkQueueTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueTopic];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueTopic]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TransportID uniqueidentifier = NULL,
    @IsFifo bit = NULL,
    @AllowExternalPublish bit = NULL,
    @MaxPayloadBytes int = NULL,
    @DefaultDeduplicationTTLSeconds int = NULL,
    @RetentionDays int = NULL,
    @BindingConfig_Clear bit = 0,
    @BindingConfig nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueTopic]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TransportID] = ISNULL(@TransportID, [TransportID]),
        [IsFifo] = ISNULL(@IsFifo, [IsFifo]),
        [AllowExternalPublish] = ISNULL(@AllowExternalPublish, [AllowExternalPublish]),
        [MaxPayloadBytes] = ISNULL(@MaxPayloadBytes, [MaxPayloadBytes]),
        [DefaultDeduplicationTTLSeconds] = ISNULL(@DefaultDeduplicationTTLSeconds, [DefaultDeduplicationTTLSeconds]),
        [RetentionDays] = ISNULL(@RetentionDays, [RetentionDays]),
        [BindingConfig] = CASE WHEN @BindingConfig_Clear = 1 THEN NULL ELSE ISNULL(@BindingConfig, [BindingConfig]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkQueueTopics] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkQueueTopics]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueTopic] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueTopic table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkQueueTopic]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkQueueTopic];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkQueueTopic
ON [${flyway:defaultSchema}].[WorkQueueTopic]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueTopic]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkQueueTopic] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Work Queue Topics */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueTopic] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Work Queue Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Topics
-- Item: spDeleteWorkQueueTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkQueueTopic
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkQueueTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueTopic];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueTopic]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkQueueTopic]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueTopic] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Work Queue Topics */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueTopic] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Work Queue Transports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Transports
-- Item: vwWorkQueueTransports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Work Queue Transports
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WorkQueueTransport
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWorkQueueTransports]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWorkQueueTransports];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWorkQueueTransports]
AS
SELECT
    w.*,
    MJCredential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[WorkQueueTransport] AS w
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_CredentialID
  ON
    [w].[CredentialID] = MJCredential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueTransports] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Work Queue Transports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Transports
-- Item: Permissions for vwWorkQueueTransports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWorkQueueTransports] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Work Queue Transports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Transports
-- Item: spCreateWorkQueueTransport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WorkQueueTransport
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWorkQueueTransport]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueTransport];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWorkQueueTransport]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(100),
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueTransport]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [CredentialID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WorkQueueTransport]
            (
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [CredentialID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWorkQueueTransports] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueTransport] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Work Queue Transports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWorkQueueTransport] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Work Queue Transports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Transports
-- Item: spUpdateWorkQueueTransport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WorkQueueTransport
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWorkQueueTransport]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueTransport];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWorkQueueTransport]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(100) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueTransport]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [CredentialID] = CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, [CredentialID]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWorkQueueTransports] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWorkQueueTransports]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueTransport] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WorkQueueTransport table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWorkQueueTransport]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWorkQueueTransport];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWorkQueueTransport
ON [${flyway:defaultSchema}].[WorkQueueTransport]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WorkQueueTransport]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WorkQueueTransport] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Work Queue Transports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWorkQueueTransport] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Work Queue Transports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Work Queue Transports
-- Item: spDeleteWorkQueueTransport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WorkQueueTransport
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWorkQueueTransport]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueTransport];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWorkQueueTransport]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WorkQueueTransport]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueTransport] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Work Queue Transports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWorkQueueTransport] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fdb65c2e-3771-4247-a855-f9f3fc89b72a' OR (EntityID = 'F4D03836-2513-4E94-9BA4-0CD3D968B849' AND Name = 'Transport')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fdb65c2e-3771-4247-a855-f9f3fc89b72a',
            'F4D03836-2513-4E94-9BA4-0CD3D968B849', -- Entity: MJ: Work Queue Topics
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F4D03836-2513-4E94-9BA4-0CD3D968B849'),
            'Transport',
            'Transport',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '644fde64-a2f0-4883-a86f-704bc9e2708c' OR (EntityID = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A' AND Name = 'Topic')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '644fde64-a2f0-4883-a86f-704bc9e2708c',
            'F75584C0-1BB2-4645-AA4C-24D35B43D45A', -- Entity: MJ: Work Queue Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F75584C0-1BB2-4645-AA4C-24D35B43D45A'),
            'Topic',
            'Topic',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae00f68c-0d0e-474b-b314-bf1fa8dbfd36' OR (EntityID = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE' AND Name = 'Topic')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae00f68c-0d0e-474b-b314-bf1fa8dbfd36',
            '2B559B5C-0E81-4EB8-80D8-26943E0A49BE', -- Entity: MJ: Work Queue Deduplications
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2B559B5C-0E81-4EB8-80D8-26943E0A49BE'),
            'Topic',
            'Topic',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4217eb2-b946-4c35-b587-b9e4aec6d1ff' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'Subscription')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e4217eb2-b946-4c35-b587-b9e4aec6d1ff',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'Subscription',
            'Subscription',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5c916b7-153f-4f28-8ebe-4cbfd31fffa0' OR (EntityID = 'D0A12FDF-8956-419C-81DF-37A0127A60D2' AND Name = 'ResolvedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b5c916b7-153f-4f28-8ebe-4cbfd31fffa0',
            'D0A12FDF-8956-419C-81DF-37A0127A60D2', -- Entity: MJ: Work Queue Deliveries
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D0A12FDF-8956-419C-81DF-37A0127A60D2'),
            'ResolvedByUser',
            'Resolved By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fee94ac-c3dd-4c5a-b214-a7190589bfad' OR (EntityID = '619F0CE1-795C-4B20-9E08-3C45F179AEB5' AND Name = 'Credential')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fee94ac-c3dd-4c5a-b214-a7190589bfad',
            '619F0CE1-795C-4B20-9E08-3C45F179AEB5', -- Entity: MJ: Work Queue Transports
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '619F0CE1-795C-4B20-9E08-3C45F179AEB5'),
            'Credential',
            'Credential',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d336376-b836-4c1b-b7db-4a0a246bbfb0' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'Topic')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9d336376-b836-4c1b-b7db-4a0a246bbfb0',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'Topic',
            'Topic',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5653384e-e191-46b1-91ab-e0612efabd3e' OR (EntityID = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A' AND Name = 'PublishedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5653384e-e191-46b1-91ab-e0612efabd3e',
            '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A', -- Entity: MJ: Work Queue Messages
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2917B8D0-E525-41C0-A8C8-C4F58CD9A09A'),
            'PublishedByUser',
            'Published By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;



/* ---------------------------------------------------------------------------
   CodeGen validator metadata (same run family as the block above): the
   GeneratedCode rows for the eight CHECK-constraint validators emitted into
   the generated entity classes. Without these rows a --no-ai CodeGen run
   against a migrated database regenerates the classes without the validators
   (see V202609211844__v6.2.x__NativeToolCallCount_Validator_Metadata.sql).
   --------------------------------------------------------------------------- */
/* Generated Validation Functions for MJ: Work Queue Deliveries */
-- CHECK constraint for MJ: Work Queue Deliveries: Field: AttemptCount was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '68C643EB-19D1-47DD-A6F0-EF7EA9F71267'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('ad98e0d9-dc62-4a15-8ff9-78b28819ccdf', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([AttemptCount]>=(0))', 'public ValidateAttemptCountNonNegative(result: ValidationResult) {
	if (this.AttemptCount < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"AttemptCount",
			"Attempt count cannot be negative. It must be zero or greater.",
			this.AttemptCount,
			ValidationErrorType.Failure
		));
	}
}', 'Attempt count must be zero or greater. This ensures the system never records a negative number of delivery attempts, maintaining accurate tracking of message processing retries.', 'ValidateAttemptCountNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '68C643EB-19D1-47DD-A6F0-EF7EA9F71267')
   END;

/* Generated Validation Functions for MJ: Work Queue Subscriptions */
-- CHECK constraint for MJ: Work Queue Subscriptions: Field: BackoffBaseSeconds was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '6F62FA35-C0DF-4539-BB72-1BB73F7C533E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('dd3bb2c4-ec9b-4bdc-b890-143c39037329', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([BackoffBaseSeconds]>=(0))', 'public ValidateBackoffBaseSecondsNonNegative(result: ValidationResult) {
	if (this.BackoffBaseSeconds < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"BackoffBaseSeconds",
			"Backoff base seconds must be greater than or equal to zero",
			this.BackoffBaseSeconds,
			ValidationErrorType.Failure
		));
	}
}', 'Backoff base seconds must be greater than or equal to zero. This ensures that retry delays are never negative, maintaining valid backoff timing for subscription processing.', 'ValidateBackoffBaseSecondsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '6F62FA35-C0DF-4539-BB72-1BB73F7C533E')
   END;

-- CHECK constraint for MJ: Work Queue Subscriptions: Field: BackoffMaxSeconds was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '1F27AC8F-3709-4313-9597-1AA891AB9A54'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('f91d0353-b85d-442b-b385-e85dbc8ca08c', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([BackoffMaxSeconds]>=(0))', 'public ValidateBackoffMaxSecondsNonNegative(result: ValidationResult) {
	if (this.BackoffMaxSeconds < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"BackoffMaxSeconds",
			"Maximum backoff seconds must be greater than or equal to 0.",
			this.BackoffMaxSeconds,
			ValidationErrorType.Failure
		));
	}
}', 'The maximum backoff seconds for retry attempts must be a non-negative value (zero or greater). This ensures that the retry delay configuration is valid and prevents negative time values that would be meaningless in a retry mechanism.', 'ValidateBackoffMaxSecondsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1F27AC8F-3709-4313-9597-1AA891AB9A54')
   END;

-- CHECK constraint for MJ: Work Queue Subscriptions: Field: LeaseSeconds was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0AC93FAA-A812-44A9-A50D-F614639CEA26'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('10fde0df-caaa-4124-8a18-f0853c325d35', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([LeaseSeconds]>=(5))', 'public ValidateLeaseSecondsMinimum(result: ValidationResult) {
	if (this.LeaseSeconds < 5) {
		result.Errors.push(new ValidationErrorInfo(
			"LeaseSeconds",
			"Lease duration must be at least 5 seconds.",
			this.LeaseSeconds,
			ValidationErrorType.Failure
		));
	}
}', 'The lease duration for this subscription must be at least 5 seconds to ensure minimum viability of the lease period', 'ValidateLeaseSecondsMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0AC93FAA-A812-44A9-A50D-F614639CEA26')
   END;

-- CHECK constraint for MJ: Work Queue Subscriptions: Field: MaxAttempts was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'ED1306A1-EBC7-4D3B-B026-856B8142D2A1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b119b65f-5858-4e61-9e74-f4ee354f73cb', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([MaxAttempts]>=(1))', 'public ValidateMaxAttemptsMinimum(result: ValidationResult) {
	if (this.MaxAttempts < 1) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxAttempts",
			"Maximum attempts must be at least 1",
			this.MaxAttempts,
			ValidationErrorType.Failure
		));
	}
}', 'The maximum number of retry attempts must be at least 1. This ensures that subscription handlers have a minimum opportunity to attempt processing before giving up, preventing configurations where messages would fail immediately without any retry effort.', 'ValidateMaxAttemptsMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'ED1306A1-EBC7-4D3B-B026-856B8142D2A1')
   END;

/* Generated Validation Functions for MJ: Work Queue Topics */
-- CHECK constraint for MJ: Work Queue Topics: Field: DefaultDeduplicationTTLSeconds was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E044D535-6A19-4F15-AB21-9367E5961791'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('3c7c678a-1a26-418d-b99f-fb5681c61019', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([DefaultDeduplicationTTLSeconds]>=(60))', 'public ValidateDefaultDeduplicationTTLSecondsMinimum(result: ValidationResult) {
	if (this.DefaultDeduplicationTTLSeconds < 60) {
		result.Errors.push(new ValidationErrorInfo(
			"DefaultDeduplicationTTLSeconds",
			"Default deduplication time-to-live must be at least 60 seconds",
			this.DefaultDeduplicationTTLSeconds,
			ValidationErrorType.Failure
		));
	}
}', 'The default deduplication time-to-live setting must be at least 60 seconds to ensure messages have a reasonable minimum window for deduplication processing', 'ValidateDefaultDeduplicationTTLSecondsMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'E044D535-6A19-4F15-AB21-9367E5961791')
   END;

-- CHECK constraint for MJ: Work Queue Topics: Field: MaxPayloadBytes was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '08E8DCB4-763D-4344-BA89-E4619862B5E1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('a0a8f84c-b18a-4502-a645-a6cfbf603316', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([MaxPayloadBytes]>(0) AND [MaxPayloadBytes]<=(262144))', 'public ValidateMaxPayloadBytesRange(result: ValidationResult) {
	if (this.MaxPayloadBytes <= 0 || this.MaxPayloadBytes > 262144) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxPayloadBytes",
			"Maximum payload size must be greater than 0 bytes and cannot exceed 262,144 bytes (256 KB)",
			this.MaxPayloadBytes,
			ValidationErrorType.Failure
		));
	}
}', 'Maximum payload size must be greater than 0 bytes and cannot exceed 262,144 bytes (256 KB) to ensure messages stay within reasonable size limits for transmission and storage', 'ValidateMaxPayloadBytesRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '08E8DCB4-763D-4344-BA89-E4619862B5E1')
   END;

-- CHECK constraint for MJ: Work Queue Topics: Field: RetentionDays was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '7F24B7BC-3D12-4D1D-889B-35DD6E0085B3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('71a4af37-c5a9-483e-ac24-24734cac5ea1', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4FD92457-0BA8-486F-978A-E5947154F4F4', GETUTCDATE(), 'TypeScript', 'Approved', '([RetentionDays]>=(1))', 'public ValidateRetentionDaysMinimum(result: ValidationResult) {
	if (this.RetentionDays < 1) {
		result.Errors.push(new ValidationErrorInfo(
			"RetentionDays",
			"Retention period must be at least 1 day",
			this.RetentionDays,
			ValidationErrorType.Failure
		));
	}
}', 'Retention period must be at least 1 day. This ensures that all message queues maintain a minimum retention window to prevent data loss and allow consumers adequate time to process messages.', 'ValidateRetentionDaysMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7F24B7BC-3D12-4D1D-889B-35DD6E0085B3')
   END;

