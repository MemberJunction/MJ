-- =====================================================================================
-- COMPLETE MCP AUTHENTICATION MIGRATION
-- Run this entire script as a database administrator
--
-- This script combines:
-- 1. Permission grants for MJ_Connect user
-- 2. Table creation (APIScope, APIKey, APIKeyScope, APIKeyUsageLog)
-- 3. Seed data (5 default scopes)
-- 4. Verification queries
-- =====================================================================================

USE MJ_Local;
GO

PRINT '========================================================================';
PRINT 'MCP Authentication Migration - Starting';
PRINT '========================================================================';
PRINT '';

-- =====================================================================================
-- PART 1: Grant Permissions
-- =====================================================================================
PRINT 'PART 1: Granting permissions to MJ_Connect...';
PRINT '';

GRANT CREATE TABLE TO [MJ_Connect];
GRANT ALTER ON SCHEMA::__mj TO [MJ_Connect];
GRANT REFERENCES ON SCHEMA::__mj TO [MJ_Connect];
GRANT INSERT ON SCHEMA::__mj TO [MJ_Connect];
GRANT SELECT ON SCHEMA::__mj TO [MJ_Connect];
GRANT UPDATE ON SCHEMA::__mj TO [MJ_Connect];
GRANT DELETE ON SCHEMA::__mj TO [MJ_Connect];

-- sp_addextendedproperty needs to be granted from master database
USE master;
GRANT EXECUTE ON sys.sp_addextendedproperty TO [MJ_Connect];
USE MJ_Local;

PRINT '✓ Permissions granted to MJ_Connect';
PRINT '';

-- =====================================================================================
-- PART 2: Create Tables
-- =====================================================================================
PRINT 'PART 2: Creating authentication tables...';
PRINT '';

-- Table 1: APIScope
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '__mj' AND TABLE_NAME = 'APIScope')
BEGIN
    CREATE TABLE [__mj].[APIScope] (
        ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        Category NVARCHAR(50) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
        __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
        CONSTRAINT UQ_APIScope_Name UNIQUE (Name)
    );

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Defines reusable permission categories for API keys.',
        @level0type = N'SCHEMA', @level0name = '__mj',
        @level1type = N'TABLE',  @level1name = 'APIScope';

    CREATE NONCLUSTERED INDEX IX_APIScope_Category ON [__mj].[APIScope](Category);
    CREATE NONCLUSTERED INDEX IX_APIScope_Name ON [__mj].[APIScope](Name);

    PRINT '✓ Created table: APIScope';
END
ELSE
    PRINT '⏭️  Table already exists: APIScope';

-- Table 2: APIKey
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '__mj' AND TABLE_NAME = 'APIKey')
BEGIN
    CREATE TABLE [__mj].[APIKey] (
        ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
        Hash NVARCHAR(64) NOT NULL,
        UserID UNIQUEIDENTIFIER NOT NULL,
        Name NVARCHAR(100) NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
        ExpiresAt DATETIMEOFFSET NULL,
        LastUsedAt DATETIMEOFFSET NULL,
        CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
        __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
        __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
        CONSTRAINT FK_APIKey_UserID FOREIGN KEY (UserID)
            REFERENCES [__mj].[User](ID),
        CONSTRAINT FK_APIKey_CreatedByUserID FOREIGN KEY (CreatedByUserID)
            REFERENCES [__mj].[User](ID),
        CONSTRAINT CK_APIKey_Status CHECK (Status IN ('Active', 'Revoked')),
        CONSTRAINT CK_APIKey_Hash_Length CHECK (LEN(Hash) = 64),
        CONSTRAINT UQ_APIKey_Hash UNIQUE (Hash)
    );

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Stores API keys for MCP server authentication (SHA-256 hashes only).',
        @level0type = N'SCHEMA', @level0name = '__mj',
        @level1type = N'TABLE',  @level1name = 'APIKey';

    CREATE UNIQUE NONCLUSTERED INDEX IX_APIKey_Hash_Active
        ON [__mj].[APIKey](Hash) WHERE Status = 'Active';
    CREATE NONCLUSTERED INDEX IX_APIKey_UserID ON [__mj].[APIKey](UserID);
    CREATE NONCLUSTERED INDEX IX_APIKey_Status ON [__mj].[APIKey](Status);
    CREATE NONCLUSTERED INDEX IX_APIKey_LastUsedAt ON [__mj].[APIKey](LastUsedAt);
    CREATE NONCLUSTERED INDEX IX_APIKey_ExpiresAt ON [__mj].[APIKey](ExpiresAt) WHERE ExpiresAt IS NOT NULL;

    PRINT '✓ Created table: APIKey';
END
ELSE
    PRINT '⏭️  Table already exists: APIKey';

-- Table 3: APIKeyScope
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '__mj' AND TABLE_NAME = 'APIKeyScope')
BEGIN
    CREATE TABLE [__mj].[APIKeyScope] (
        ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
        APIKeyID UNIQUEIDENTIFIER NOT NULL,
        APIScopeID UNIQUEIDENTIFIER NOT NULL,
        __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
        __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
        CONSTRAINT FK_APIKeyScope_APIKeyID FOREIGN KEY (APIKeyID)
            REFERENCES [__mj].[APIKey](ID) ON DELETE CASCADE,
        CONSTRAINT FK_APIKeyScope_APIScopeID FOREIGN KEY (APIScopeID)
            REFERENCES [__mj].[APIScope](ID),
        CONSTRAINT UQ_APIKeyScope_Key_Scope UNIQUE (APIKeyID, APIScopeID)
    );

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Associates API keys with permission scopes.',
        @level0type = N'SCHEMA', @level0name = '__mj',
        @level1type = N'TABLE',  @level1name = 'APIKeyScope';

    CREATE NONCLUSTERED INDEX IX_APIKeyScope_APIKeyID ON [__mj].[APIKeyScope](APIKeyID);
    CREATE NONCLUSTERED INDEX IX_APIKeyScope_APIScopeID ON [__mj].[APIKeyScope](APIScopeID);

    PRINT '✓ Created table: APIKeyScope';
END
ELSE
    PRINT '⏭️  Table already exists: APIKeyScope';

-- Table 4: APIKeyUsageLog
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '__mj' AND TABLE_NAME = 'APIKeyUsageLog')
BEGIN
    CREATE TABLE [__mj].[APIKeyUsageLog] (
        ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
        APIKeyID UNIQUEIDENTIFIER NOT NULL,
        Endpoint NVARCHAR(500) NULL,
        OperationName NVARCHAR(200) NULL,
        HTTPMethod NVARCHAR(10) NULL,
        StatusCode INT NULL,
        ResponseTimeMS INT NULL,
        ClientIP NVARCHAR(45) NULL,
        UserAgent NVARCHAR(MAX) NULL,
        ErrorMessage NVARCHAR(MAX) NULL,
        __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
        CONSTRAINT FK_APIKeyUsageLog_APIKeyID FOREIGN KEY (APIKeyID)
            REFERENCES [__mj].[APIKey](ID)
    );

    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Immutable audit log of all API key usage.',
        @level0type = N'SCHEMA', @level0name = '__mj',
        @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog';

    CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_APIKeyID ON [__mj].[APIKeyUsageLog](APIKeyID);
    CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_CreatedAt ON [__mj].[APIKeyUsageLog](__mj_CreatedAt DESC);
    CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_StatusCode ON [__mj].[APIKeyUsageLog](StatusCode);
    CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_OperationName ON [__mj].[APIKeyUsageLog](OperationName);
    CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_Key_Time ON [__mj].[APIKeyUsageLog](APIKeyID, __mj_CreatedAt DESC);

    PRINT '✓ Created table: APIKeyUsageLog';
END
ELSE
    PRINT '⏭️  Table already exists: APIKeyUsageLog';

PRINT '';

-- =====================================================================================
-- PART 3: Seed Data
-- =====================================================================================
PRINT 'PART 3: Inserting seed data...';
PRINT '';

-- Insert default scopes if they don't exist
IF NOT EXISTS (SELECT * FROM [__mj].[APIScope] WHERE Name = 'entities:read')
BEGIN
    INSERT INTO [__mj].[APIScope] (ID, Name, Category, Description)
    VALUES
        ('A1B2C3D4-E5F6-4A5B-8C7D-000000000001', 'entities:read', 'Entities',
         'Read access to entity data via Get and RunView operations.'),
        ('A1B2C3D4-E5F6-4A5B-8C7D-000000000002', 'entities:write', 'Entities',
         'Write access to entity data via Create, Update, and Delete operations.'),
        ('A1B2C3D4-E5F6-4A5B-8C7D-000000000003', 'agents:discover', 'Agents',
         'Permission to list and discover available AI agents.'),
        ('A1B2C3D4-E5F6-4A5B-8C7D-000000000004', 'agents:execute', 'Agents',
         'Permission to execute AI agents and view run status.'),
        ('A1B2C3D4-E5F6-4A5B-8C7D-000000000005', 'admin:*', 'Admin',
         'Full administrative access to all MCP server operations.');

    PRINT '✓ Inserted 5 default scopes';
END
ELSE
    PRINT '⏭️  Scopes already exist (skipping insert)';

PRINT '';

-- =====================================================================================
-- PART 4: Verification
-- =====================================================================================
PRINT '========================================================================';
PRINT 'Verification';
PRINT '========================================================================';
PRINT '';

-- Count tables
DECLARE @TableCount INT;
SELECT @TableCount = COUNT(*)
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '__mj'
AND TABLE_NAME IN ('APIScope', 'APIKey', 'APIKeyScope', 'APIKeyUsageLog');

PRINT 'Tables created: ' + CAST(@TableCount AS VARCHAR) + '/4';

-- Count scopes
DECLARE @ScopeCount INT;
SELECT @ScopeCount = COUNT(*) FROM [__mj].[APIScope];

PRINT 'Default scopes: ' + CAST(@ScopeCount AS VARCHAR) + '/5';
PRINT '';

-- List scopes
PRINT 'Available scopes:';
SELECT '  • ' + Name + ' [' + Category + ']' AS Scope
FROM [__mj].[APIScope]
ORDER BY Name;

PRINT '';
PRINT '========================================================================';
PRINT '🎉 Migration Complete!';
PRINT '========================================================================';
PRINT '';
PRINT 'Next steps:';
PRINT '  1. Run CodeGen to generate entity classes';
PRINT '  2. Verify with: node verify_mcp_auth_tables.mjs';
PRINT '';

GO
