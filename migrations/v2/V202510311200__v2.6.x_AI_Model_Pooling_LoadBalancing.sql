/*
 * AI Model Pooling and Load Balancing System
 *
 * This migration adds support for:
 * - Global server-level pooling of AI model executions
 * - Load balancing across multiple vendors
 * - Multiple API keys per vendor for scale
 * - Intelligent queueing when at capacity
 * - Rate limit tracking and management
 *
 * New Tables:
 * - AIModelVendorPool: Defines pools of vendors for specific models
 * - AIModelVendorPoolMember: Associates vendors with pools
 * - AIVendorAPIKey: Stores multiple API keys per vendor with rate limits
 * - AIVendorHealthEvent: Logs health events for observability
 *
 * Modified Tables:
 * - AIPromptModel: Add PoolID for opt-in pooling
 */

-- =============================================================================
-- Table: AIModelVendorPool
-- Purpose: Defines a pool of vendors for load balancing model requests
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIModelVendorPool]') AND type in (N'U'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[AIModelVendorPool] (
        [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [ModelID] UNIQUEIDENTIFIER NOT NULL,
        [Name] NVARCHAR(255) NOT NULL,
        [Description] NVARCHAR(MAX) NULL,
        [MaxWaitTimeMS] INT NOT NULL DEFAULT 60000,
        [MaxParallelRequests] INT NULL,
        [LoadBalancingStrategy] NVARCHAR(50) NOT NULL DEFAULT 'Priority',
        [IsActive] BIT NOT NULL DEFAULT 1,
        [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
        [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT [FK_AIModelVendorPool_Model]
            FOREIGN KEY ([ModelID]) REFERENCES [${flyway:defaultSchema}].[AIModel]([ID])
    );

    -- Indexes
    CREATE INDEX [IX_AIModelVendorPool_ModelID]
        ON [${flyway:defaultSchema}].[AIModelVendorPool]([ModelID])
        WHERE [IsActive] = 1;

    CREATE INDEX [IX_AIModelVendorPool_IsActive]
        ON [${flyway:defaultSchema}].[AIModelVendorPool]([IsActive])
        WHERE [IsActive] = 1;

    -- Extended properties
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Defines a pool of vendors for load balancing and queueing AI model requests. Enables proactive distribution of load across multiple vendors and API keys.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPool';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Maximum time in milliseconds a request will wait in queue before timing out',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPool',
        @level2type = N'COLUMN', @level2name = N'MaxWaitTimeMS';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Maximum parallel requests allowed across all vendors in pool. NULL = unlimited.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPool',
        @level2type = N'COLUMN', @level2name = N'MaxParallelRequests';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Strategy for distributing load: Priority, RoundRobin, LeastBusy, Weighted, Random',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPool',
        @level2type = N'COLUMN', @level2name = N'LoadBalancingStrategy';

    -- Add CHECK constraint for LoadBalancingStrategy
    ALTER TABLE [${flyway:defaultSchema}].[AIModelVendorPool]
    ADD CONSTRAINT [CK_AIModelVendorPool_LoadBalancingStrategy]
        CHECK ([LoadBalancingStrategy] IN ('Priority', 'RoundRobin', 'LeastBusy', 'Weighted', 'Random'));

    PRINT 'Created table: AIModelVendorPool';
END
ELSE
    PRINT 'Table AIModelVendorPool already exists, skipping creation';
GO

-- =============================================================================
-- Table: AIModelVendorPoolMember
-- Purpose: Associates vendors with pools and defines their participation settings
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIModelVendorPoolMember]') AND type in (N'U'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[AIModelVendorPoolMember] (
        [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [PoolID] UNIQUEIDENTIFIER NOT NULL,
        [VendorID] UNIQUEIDENTIFIER NOT NULL,
        [Priority] INT NOT NULL DEFAULT 100,
        [Weight] INT NULL,
        [MaxParallelRequests] INT NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
        [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT [FK_AIModelVendorPoolMember_Pool]
            FOREIGN KEY ([PoolID]) REFERENCES [${flyway:defaultSchema}].[AIModelVendorPool]([ID]) ON DELETE CASCADE,
        CONSTRAINT [FK_AIModelVendorPoolMember_Vendor]
            FOREIGN KEY ([VendorID]) REFERENCES [${flyway:defaultSchema}].[AIVendor]([ID]),
        CONSTRAINT [UQ_AIModelVendorPoolMember_PoolVendor]
            UNIQUE ([PoolID], [VendorID])
    );

    -- Indexes
    CREATE INDEX [IX_AIModelVendorPoolMember_PoolID]
        ON [${flyway:defaultSchema}].[AIModelVendorPoolMember]([PoolID])
        WHERE [IsActive] = 1;

    CREATE INDEX [IX_AIModelVendorPoolMember_VendorID]
        ON [${flyway:defaultSchema}].[AIModelVendorPoolMember]([VendorID])
        WHERE [IsActive] = 1;

    -- Extended properties
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Associates vendors with pools. Defines priority, weight, and capacity limits for each vendor within a pool.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPoolMember';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Priority order within pool. Lower number = higher priority. Used by Priority and RoundRobin strategies.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPoolMember',
        @level2type = N'COLUMN', @level2name = N'Priority';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Relative weight for Weighted load balancing strategy (1-100). Higher weight = more traffic.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPoolMember',
        @level2type = N'COLUMN', @level2name = N'Weight';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Maximum parallel requests for this vendor within the pool. NULL = use pool default.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIModelVendorPoolMember',
        @level2type = N'COLUMN', @level2name = N'MaxParallelRequests';

    -- Add CHECK constraint for Weight
    ALTER TABLE [${flyway:defaultSchema}].[AIModelVendorPoolMember]
    ADD CONSTRAINT [CK_AIModelVendorPoolMember_Weight]
        CHECK ([Weight] IS NULL OR ([Weight] >= 1 AND [Weight] <= 100));

    PRINT 'Created table: AIModelVendorPoolMember';
END
ELSE
    PRINT 'Table AIModelVendorPoolMember already exists, skipping creation';
GO

-- =============================================================================
-- Table: AIVendorAPIKey
-- Purpose: Stores multiple API keys per vendor with rate limit configurations
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIVendorAPIKey]') AND type in (N'U'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[AIVendorAPIKey] (
        [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [VendorID] UNIQUEIDENTIFIER NOT NULL,
        [KeyName] NVARCHAR(255) NOT NULL,
        [APIKeyValue] NVARCHAR(MAX) NOT NULL,
        [RateLimitTPM] INT NULL,
        [RateLimitRPM] INT NULL,
        [RateLimitScope] NVARCHAR(50) NOT NULL DEFAULT 'ModelSpecific',
        [Priority] INT NOT NULL DEFAULT 100,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [Notes] NVARCHAR(MAX) NULL,
        [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
        [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT [FK_AIVendorAPIKey_Vendor]
            FOREIGN KEY ([VendorID]) REFERENCES [${flyway:defaultSchema}].[AIVendor]([ID]) ON DELETE CASCADE,
        CONSTRAINT [UQ_AIVendorAPIKey_VendorName]
            UNIQUE ([VendorID], [KeyName])
    );

    -- Indexes
    CREATE INDEX [IX_AIVendorAPIKey_VendorID]
        ON [${flyway:defaultSchema}].[AIVendorAPIKey]([VendorID])
        WHERE [IsActive] = 1;

    CREATE INDEX [IX_AIVendorAPIKey_IsActive]
        ON [${flyway:defaultSchema}].[AIVendorAPIKey]([IsActive])
        WHERE [IsActive] = 1;

    -- Extended properties
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Stores multiple API keys per vendor with rate limit tracking. Enables scaling beyond single API key limits.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorAPIKey';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Descriptive name for this API key (e.g., "Production Plan 1", "Development Account")',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorAPIKey',
        @level2type = N'COLUMN', @level2name = N'KeyName';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'The actual API key value. Should be encrypted at rest.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorAPIKey',
        @level2type = N'COLUMN', @level2name = N'APIKeyValue';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Rate limit in tokens per minute. NULL = no limit or unknown.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorAPIKey',
        @level2type = N'COLUMN', @level2name = N'RateLimitTPM';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Rate limit in requests per minute. NULL = no limit or unknown.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorAPIKey',
        @level2type = N'COLUMN', @level2name = N'RateLimitRPM';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Whether rate limits apply per model or across all models for this vendor',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorAPIKey',
        @level2type = N'COLUMN', @level2name = N'RateLimitScope';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Priority order for key selection within vendor. Lower number = higher priority.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorAPIKey',
        @level2type = N'COLUMN', @level2name = N'Priority';

    -- Add CHECK constraint for RateLimitScope
    ALTER TABLE [${flyway:defaultSchema}].[AIVendorAPIKey]
    ADD CONSTRAINT [CK_AIVendorAPIKey_RateLimitScope]
        CHECK ([RateLimitScope] IN ('ModelSpecific', 'AllModels'));

    PRINT 'Created table: AIVendorAPIKey';
END
ELSE
    PRINT 'Table AIVendorAPIKey already exists, skipping creation';
GO

-- =============================================================================
-- Table: AIVendorHealthEvent
-- Purpose: Logs health events for observability and debugging
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIVendorHealthEvent]') AND type in (N'U'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[AIVendorHealthEvent] (
        [ID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [VendorID] UNIQUEIDENTIFIER NOT NULL,
        [APIKeyID] UNIQUEIDENTIFIER NULL,
        [EventType] NVARCHAR(50) NOT NULL,
        [EventDetails] NVARCHAR(MAX) NULL,
        [Timestamp] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),

        CONSTRAINT [FK_AIVendorHealthEvent_Vendor]
            FOREIGN KEY ([VendorID]) REFERENCES [${flyway:defaultSchema}].[AIVendor]([ID]),
        CONSTRAINT [FK_AIVendorHealthEvent_APIKey]
            FOREIGN KEY ([APIKeyID]) REFERENCES [${flyway:defaultSchema}].[AIVendorAPIKey]([ID])
    );

    -- Indexes
    CREATE INDEX [IX_AIVendorHealthEvent_VendorID]
        ON [${flyway:defaultSchema}].[AIVendorHealthEvent]([VendorID]);

    CREATE INDEX [IX_AIVendorHealthEvent_APIKeyID]
        ON [${flyway:defaultSchema}].[AIVendorHealthEvent]([APIKeyID])
        WHERE [APIKeyID] IS NOT NULL;

    CREATE INDEX [IX_AIVendorHealthEvent_Timestamp]
        ON [${flyway:defaultSchema}].[AIVendorHealthEvent]([Timestamp] DESC);

    CREATE INDEX [IX_AIVendorHealthEvent_EventType]
        ON [${flyway:defaultSchema}].[AIVendorHealthEvent]([EventType]);

    -- Extended properties
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Logs significant health events for observability. Write-only, not used for runtime decisions.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorHealthEvent';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Type of health event: CircuitOpened, CircuitClosed, NetworkUnreachable, Recovered, RateLimitHit, ServiceError, AuthFailure',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorHealthEvent',
        @level2type = N'COLUMN', @level2name = N'EventType';

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'JSON-encoded details about the event including error messages, recovery attempts, etc.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIVendorHealthEvent',
        @level2type = N'COLUMN', @level2name = N'EventDetails';

    -- Add CHECK constraint for EventType
    ALTER TABLE [${flyway:defaultSchema}].[AIVendorHealthEvent]
    ADD CONSTRAINT [CK_AIVendorHealthEvent_EventType]
        CHECK ([EventType] IN ('CircuitOpened', 'CircuitClosed', 'NetworkUnreachable', 'Recovered',
                               'RateLimitHit', 'ServiceError', 'AuthFailure', 'HealthCheckStarted',
                               'HealthCheckFailed', 'HealthCheckSucceeded'));

    PRINT 'Created table: AIVendorHealthEvent';
END
ELSE
    PRINT 'Table AIVendorHealthEvent already exists, skipping creation';
GO

-- =============================================================================
-- Modify Table: AIPromptModel
-- Purpose: Add optional PoolID for opt-in pooling
-- =============================================================================

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIPromptModel]')
    AND name = 'PoolID'
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIPromptModel]
    ADD [PoolID] UNIQUEIDENTIFIER NULL,
        CONSTRAINT [FK_AIPromptModel_Pool]
            FOREIGN KEY ([PoolID]) REFERENCES [${flyway:defaultSchema}].[AIModelVendorPool]([ID]);

    CREATE INDEX [IX_AIPromptModel_PoolID]
        ON [${flyway:defaultSchema}].[AIPromptModel]([PoolID])
        WHERE [PoolID] IS NOT NULL;

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Optional pool configuration for load balancing and queueing. NULL = use direct execution (legacy behavior).',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIPromptModel',
        @level2type = N'COLUMN', @level2name = N'PoolID';

    PRINT 'Added PoolID column to AIPromptModel';
END
ELSE
    PRINT 'Column PoolID already exists in AIPromptModel, skipping addition';
GO

-- =============================================================================
-- Summary
-- =============================================================================
PRINT '';
PRINT '============================================================';
PRINT 'AI Model Pooling and Load Balancing Migration Complete';
PRINT '============================================================';
PRINT 'Created 4 new tables:';
PRINT '  - AIModelVendorPool';
PRINT '  - AIModelVendorPoolMember';
PRINT '  - AIVendorAPIKey';
PRINT '  - AIVendorHealthEvent';
PRINT '';
PRINT 'Modified 1 table:';
PRINT '  - AIPromptModel (added PoolID column)';
PRINT '';
PRINT 'All existing prompts have PoolID = NULL (no pooling).';
PRINT 'Pooling is opt-in via explicit configuration.';
PRINT '============================================================';
GO
