-- =====================================================================================
-- MCP Server Authentication System - Phase 2
-- GitHub Issue: https://github.com/MemberJunction/MJ/issues/1781
--
-- This migration creates the infrastructure for multi-user API key authentication
-- to replace the hardcoded system user approach in the MCP server.
--
-- Components:
-- 1. APIScope - Permission categories (entities:read, entities:write, etc.)
-- 2. APIKey - API key records (stores SHA-256 hashes, never raw keys)
-- 3. APIKeyScope - Junction table for key-scope associations
-- 4. APIKeyUsageLog - Analytics and audit trail for all API key usage
-- =====================================================================================

-- =====================================================================================
-- Table 1: APIScope
-- Purpose: Define reusable permission categories for API keys
-- =====================================================================================
CREATE TABLE ${flyway:defaultSchema}.APIScope (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Category NVARCHAR(50) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT UQ_APIScope_Name UNIQUE (Name)
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Defines reusable permission categories for API keys. Scopes control what operations an API key can perform (e.g., entities:read, entities:write, agents:execute).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIScope';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Unique scope name following the pattern domain:action (e.g., entities:read, agents:execute, admin:*).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIScope',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Organizational category for UI grouping: Entities, Agents, Admin, etc.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIScope',
    @level2type = N'COLUMN', @level2name = 'Category';

-- Create indexes
CREATE NONCLUSTERED INDEX IX_APIScope_Category ON ${flyway:defaultSchema}.APIScope(Category);
CREATE NONCLUSTERED INDEX IX_APIScope_Name ON ${flyway:defaultSchema}.APIScope(Name);

-- =====================================================================================
-- Table 2: APIKey
-- Purpose: Store API key hashes and associate with users
-- CRITICAL: Only SHA-256 hashes are stored, never raw keys
-- =====================================================================================
CREATE TABLE ${flyway:defaultSchema}.APIKey (
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
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_APIKey_CreatedByUserID FOREIGN KEY (CreatedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_APIKey_Status CHECK (Status IN ('Active', 'Revoked')),
    CONSTRAINT CK_APIKey_Hash_Length CHECK (LEN(Hash) = 64),
    CONSTRAINT UQ_APIKey_Hash UNIQUE (Hash)
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Stores API keys for MCP server authentication. Only SHA-256 hashes are stored for security. Raw keys (format: mj_sk_[64 hex chars]) are shown once at generation and never stored.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'SHA-256 hash of the API key (64 hexadecimal characters). Used for secure key validation without storing the raw key.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey',
    @level2type = N'COLUMN', @level2name = 'Hash';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'The user this API key authenticates as. All operations performed with this key execute under this user''s context and permissions.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey',
    @level2type = N'COLUMN', @level2name = 'UserID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Optional friendly name for the key (e.g., "Claude Desktop - Dev Machine", "Production Integration").',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Key status: Active (can be used) or Revoked (permanently disabled). Revoked keys cannot be reactivated.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Optional expiration timestamp. If set, the key becomes invalid after this date regardless of Status.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey',
    @level2type = N'COLUMN', @level2name = 'ExpiresAt';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Timestamp of the most recent successful authentication with this key. Updated automatically on each valid request.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey',
    @level2type = N'COLUMN', @level2name = 'LastUsedAt';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'User who created this API key. Used for audit trail and accountability.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKey',
    @level2type = N'COLUMN', @level2name = 'CreatedByUserID';

-- Create indexes for performance
CREATE UNIQUE NONCLUSTERED INDEX IX_APIKey_Hash_Active
    ON ${flyway:defaultSchema}.APIKey(Hash)
    WHERE Status = 'Active';

CREATE NONCLUSTERED INDEX IX_APIKey_UserID
    ON ${flyway:defaultSchema}.APIKey(UserID);

CREATE NONCLUSTERED INDEX IX_APIKey_Status
    ON ${flyway:defaultSchema}.APIKey(Status);

CREATE NONCLUSTERED INDEX IX_APIKey_LastUsedAt
    ON ${flyway:defaultSchema}.APIKey(LastUsedAt);

CREATE NONCLUSTERED INDEX IX_APIKey_ExpiresAt
    ON ${flyway:defaultSchema}.APIKey(ExpiresAt)
    WHERE ExpiresAt IS NOT NULL;

-- =====================================================================================
-- Table 3: APIKeyScope
-- Purpose: Junction table for many-to-many relationship between keys and scopes
-- =====================================================================================
CREATE TABLE ${flyway:defaultSchema}.APIKeyScope (
    ID UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    APIKeyID UNIQUEIDENTIFIER NOT NULL,
    APIScopeID UNIQUEIDENTIFIER NOT NULL,
    __mj_CreatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    __mj_UpdatedAt DATETIMEOFFSET DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT FK_APIKeyScope_APIKeyID FOREIGN KEY (APIKeyID)
        REFERENCES ${flyway:defaultSchema}.APIKey(ID) ON DELETE CASCADE,
    CONSTRAINT FK_APIKeyScope_APIScopeID FOREIGN KEY (APIScopeID)
        REFERENCES ${flyway:defaultSchema}.APIScope(ID),
    CONSTRAINT UQ_APIKeyScope_Key_Scope UNIQUE (APIKeyID, APIScopeID)
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Associates API keys with permission scopes. An API key can have multiple scopes, and scopes can be assigned to multiple keys. Cascading delete ensures scope assignments are removed when a key is deleted.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyScope';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Reference to the API key being granted a scope.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyScope',
    @level2type = N'COLUMN', @level2name = 'APIKeyID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Reference to the scope being granted to the API key.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyScope',
    @level2type = N'COLUMN', @level2name = 'APIScopeID';

-- Create indexes
CREATE NONCLUSTERED INDEX IX_APIKeyScope_APIKeyID
    ON ${flyway:defaultSchema}.APIKeyScope(APIKeyID);

CREATE NONCLUSTERED INDEX IX_APIKeyScope_APIScopeID
    ON ${flyway:defaultSchema}.APIKeyScope(APIScopeID);

-- =====================================================================================
-- Table 4: APIKeyUsageLog
-- Purpose: Track every API key authentication event for analytics and rate-limiting
-- =====================================================================================
CREATE TABLE ${flyway:defaultSchema}.APIKeyUsageLog (
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
        REFERENCES ${flyway:defaultSchema}.APIKey(ID)
);

-- Add table description
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Immutable audit log of all API key usage. Records every authentication attempt, successful operation, and failure for analytics, debugging, and rate-limiting. No __mj_UpdatedAt column as logs are never modified.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog';

-- Add column descriptions
EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'The API key used for this request.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'APIKeyID';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'The endpoint path accessed (e.g., /mcp, /graphql).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'Endpoint';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'The specific MCP tool or operation name (e.g., Get_Users_Record, Run_Agent, Create_Entity_Record).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'OperationName';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'HTTP method used (GET, POST, PUT, DELETE, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'HTTPMethod';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'HTTP response status code (200 = success, 401 = unauthorized, 403 = forbidden, 500 = error, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'StatusCode';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Response time in milliseconds. Used for performance monitoring and identifying slow operations.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'ResponseTimeMS';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Client IP address (IPv4 or IPv6). Used for rate-limiting and abuse detection.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'ClientIP';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'HTTP User-Agent header identifying the client software (e.g., Claude Desktop, curl, browser).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'UserAgent';

EXEC sp_addextendedproperty
    @name = N'ms_description',
    @value = N'Error message if the request failed. Used for debugging and monitoring.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'ErrorMessage';

-- Create indexes for common query patterns
CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_APIKeyID
    ON ${flyway:defaultSchema}.APIKeyUsageLog(APIKeyID);

CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_CreatedAt
    ON ${flyway:defaultSchema}.APIKeyUsageLog(__mj_CreatedAt DESC);

CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_StatusCode
    ON ${flyway:defaultSchema}.APIKeyUsageLog(StatusCode);

CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_OperationName
    ON ${flyway:defaultSchema}.APIKeyUsageLog(OperationName);

-- Composite index for rate-limiting queries
CREATE NONCLUSTERED INDEX IX_APIKeyUsageLog_Key_Time
    ON ${flyway:defaultSchema}.APIKeyUsageLog(APIKeyID, __mj_CreatedAt DESC);

-- =====================================================================================
-- Seed Data: Default API Scopes
-- =====================================================================================

-- Seed the 5 default scopes as specified in the requirements
INSERT INTO ${flyway:defaultSchema}.APIScope (ID, Name, Category, Description)
VALUES
    (
        'A1B2C3D4-E5F6-4A5B-8C7D-000000000001',
        'entities:read',
        'Entities',
        'Read access to entity data via Get and RunView operations. Allows querying entity metadata and viewing records but not modifying data.'
    ),
    (
        'A1B2C3D4-E5F6-4A5B-8C7D-000000000002',
        'entities:write',
        'Entities',
        'Write access to entity data via Create, Update, and Delete operations. Includes all read permissions plus the ability to modify data.'
    ),
    (
        'A1B2C3D4-E5F6-4A5B-8C7D-000000000003',
        'agents:discover',
        'Agents',
        'Permission to list and discover available AI agents. Allows viewing agent metadata, descriptions, and capabilities without executing them.'
    ),
    (
        'A1B2C3D4-E5F6-4A5B-8C7D-000000000004',
        'agents:execute',
        'Agents',
        'Permission to execute AI agents and view run status. Includes discovery permissions plus the ability to start agent runs and monitor their progress.'
    ),
    (
        'A1B2C3D4-E5F6-4A5B-8C7D-000000000005',
        'admin:*',
        'Admin',
        'Full administrative access to all MCP server operations. Grants unrestricted access to all entities, agents, and system functions. Should be assigned sparingly.'
    );

-- =====================================================================================
-- Migration Complete
-- =====================================================================================
-- Summary:
-- ✓ Created APIScope table with 5 default scopes
-- ✓ Created APIKey table with SHA-256 hash storage
-- ✓ Created APIKeyScope junction table with cascade delete
-- ✓ Created APIKeyUsageLog for analytics and audit trail
-- ✓ Added all foreign keys and constraints
-- ✓ Created performance indexes for common query patterns
-- ✓ Added comprehensive table and column descriptions
--
-- Next Steps:
-- 1. Run CodeGen to generate entity classes
-- 2. Implement APIKeyService for key generation and validation
-- 3. Add authentication middleware to MCP server
-- 4. Create CLI tool for key management
-- =====================================================================================
