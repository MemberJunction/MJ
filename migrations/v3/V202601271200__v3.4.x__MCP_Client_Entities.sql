/*************************************************************
 * MCP Client Entities Migration
 *
 * Creates entities for MemberJunction to act as an MCP Client,
 * enabling connections to external MCP servers and tool invocation.
 *
 * Entities created:
 *   1. MJ: MCP Servers - Server definitions (templates)
 *   2. MJ: MCP Server Tools - Cached tool definitions
 *   3. MJ: MCP Server Connections - Configured use cases
 *   4. MJ: MCP Server Connection Tools - Enabled tools per connection
 *   5. MJ: MCP Server Connection Permissions - User/role access
 *   6. MJ: MCP Tool Execution Logs - Granular call logging
 *************************************************************/

-- ============================================================
-- 1. MJ: MCP Servers (Server Definitions)
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.[MCPServer] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [ServerURL] NVARCHAR(1000) NULL,
    [Command] NVARCHAR(500) NULL,
    [CommandArgs] NVARCHAR(MAX) NULL,
    [TransportType] NVARCHAR(50) NOT NULL,
    [DefaultAuthType] NVARCHAR(50) NOT NULL,
    [CredentialTypeID] UNIQUEIDENTIFIER NULL,
    [Status] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [LastSyncAt] DATETIMEOFFSET NULL,
    [RateLimitPerMinute] INT NULL,
    [RateLimitPerHour] INT NULL,
    [ConnectionTimeoutMs] INT NULL DEFAULT 30000,
    [RequestTimeoutMs] INT NULL DEFAULT 60000,
    [DocumentationURL] NVARCHAR(1000) NULL,
    [IconClass] NVARCHAR(100) NULL,
    CONSTRAINT [PK_MCPServer] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MCPServer_Name] UNIQUE ([Name]),
    CONSTRAINT [FK_MCPServer_CredentialType] FOREIGN KEY ([CredentialTypeID])
        REFERENCES ${flyway:defaultSchema}.[CredentialType]([ID])
);
GO

-- Extended properties for MCPServer
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique display name for the MCP server', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Server endpoint URL for HTTP/SSE/WebSocket transports', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'ServerURL';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Executable path for Stdio transport', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'Command';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of command arguments for Stdio transport', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'CommandArgs';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transport type: StreamableHTTP, SSE, Stdio, or WebSocket', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'TransportType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default auth type: None, Bearer, APIKey, OAuth2, Basic, or Custom', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'DefaultAuthType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Expected credential type for this server', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'CredentialTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Server status: Active, Inactive, or Deprecated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServer', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- ============================================================
-- 2. MJ: MCP Server Tools (Cached Tool Definitions)
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.[MCPServerTool] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MCPServerID] UNIQUEIDENTIFIER NOT NULL,
    [ToolName] NVARCHAR(255) NOT NULL,
    [ToolTitle] NVARCHAR(255) NULL,
    [ToolDescription] NVARCHAR(MAX) NULL,
    [InputSchema] NVARCHAR(MAX) NOT NULL,
    [OutputSchema] NVARCHAR(MAX) NULL,
    [Annotations] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [DiscoveredAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [LastSeenAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [GeneratedActionID] UNIQUEIDENTIFIER NULL,
    [GeneratedActionCategoryID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_MCPServerTool] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MCPServerTool_ServerTool] UNIQUE ([MCPServerID], [ToolName]),
    CONSTRAINT [FK_MCPServerTool_MCPServer] FOREIGN KEY ([MCPServerID])
        REFERENCES ${flyway:defaultSchema}.[MCPServer]([ID]),
    CONSTRAINT [FK_MCPServerTool_Action] FOREIGN KEY ([GeneratedActionID])
        REFERENCES ${flyway:defaultSchema}.[Action]([ID]),
    CONSTRAINT [FK_MCPServerTool_ActionCategory] FOREIGN KEY ([GeneratedActionCategoryID])
        REFERENCES ${flyway:defaultSchema}.[ActionCategory]([ID])
);
GO

-- Extended properties for MCPServerTool
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tool identifier from the MCP server', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerTool', @level2type=N'COLUMN', @level2name=N'ToolName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable title for the tool', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerTool', @level2type=N'COLUMN', @level2name=N'ToolTitle';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON Schema for tool input parameters', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerTool', @level2type=N'COLUMN', @level2name=N'InputSchema';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON Schema for tool output (if provided)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerTool', @level2type=N'COLUMN', @level2name=N'OutputSchema';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON with tool hints (readOnlyHint, destructiveHint, etc.)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerTool', @level2type=N'COLUMN', @level2name=N'Annotations';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tool status: Active, Inactive, or Deprecated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerTool', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to auto-generated Action (if promoted)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerTool', @level2type=N'COLUMN', @level2name=N'GeneratedActionID';
GO

-- ============================================================
-- 3. MJ: MCP Server Connections (Configured Use Cases)
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.[MCPServerConnection] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MCPServerID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [CredentialID] UNIQUEIDENTIFIER NULL,
    [CustomHeaderName] NVARCHAR(100) NULL,
    [CompanyID] UNIQUEIDENTIFIER NOT NULL,
    [Status] NVARCHAR(50) NOT NULL DEFAULT 'Active',
    [AutoSyncTools] BIT NOT NULL DEFAULT 1,
    [AutoGenerateActions] BIT NOT NULL DEFAULT 0,
    [LogToolCalls] BIT NOT NULL DEFAULT 1,
    [LogInputParameters] BIT NOT NULL DEFAULT 1,
    [LogOutputContent] BIT NOT NULL DEFAULT 1,
    [MaxOutputLogSize] INT NULL DEFAULT 102400,
    [LastConnectedAt] DATETIMEOFFSET NULL,
    [LastErrorMessage] NVARCHAR(MAX) NULL,
    [EnvironmentVars] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_MCPServerConnection] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MCPServerConnection_CompanyName] UNIQUE ([CompanyID], [Name]),
    CONSTRAINT [FK_MCPServerConnection_MCPServer] FOREIGN KEY ([MCPServerID])
        REFERENCES ${flyway:defaultSchema}.[MCPServer]([ID]),
    CONSTRAINT [FK_MCPServerConnection_Credential] FOREIGN KEY ([CredentialID])
        REFERENCES ${flyway:defaultSchema}.[Credential]([ID]),
    CONSTRAINT [FK_MCPServerConnection_Company] FOREIGN KEY ([CompanyID])
        REFERENCES ${flyway:defaultSchema}.[Company]([ID])
);
GO

-- Extended properties for MCPServerConnection
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Connection name (unique per company)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to Credential entity (uses existing credential types)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'CredentialID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Custom header name for API key auth (default: X-API-Key)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'CustomHeaderName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to Company for multi-tenancy', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'CompanyID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Auto-sync tools when connecting', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'AutoSyncTools';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Auto-generate MJ Actions for discovered tools', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'AutoGenerateActions';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Log all tool calls to execution log', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'LogToolCalls';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Include input parameters in logs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'LogInputParameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Include output content in logs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'LogOutputContent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Max output size to log in bytes (default: 100KB)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'MaxOutputLogSize';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object of environment variables for Stdio transport', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnection', @level2type=N'COLUMN', @level2name=N'EnvironmentVars';
GO

-- ============================================================
-- 4. MJ: MCP Server Connection Tools (Enabled Tools Per Connection)
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.[MCPServerConnectionTool] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MCPServerConnectionID] UNIQUEIDENTIFIER NOT NULL,
    [MCPServerToolID] UNIQUEIDENTIFIER NOT NULL,
    [IsEnabled] BIT NOT NULL DEFAULT 1,
    [DefaultInputValues] NVARCHAR(MAX) NULL,
    [MaxCallsPerMinute] INT NULL,
    CONSTRAINT [PK_MCPServerConnectionTool] PRIMARY KEY ([ID]),
    CONSTRAINT [UQ_MCPServerConnectionTool_ConnectionTool] UNIQUE ([MCPServerConnectionID], [MCPServerToolID]),
    CONSTRAINT [FK_MCPServerConnectionTool_Connection] FOREIGN KEY ([MCPServerConnectionID])
        REFERENCES ${flyway:defaultSchema}.[MCPServerConnection]([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_MCPServerConnectionTool_Tool] FOREIGN KEY ([MCPServerToolID])
        REFERENCES ${flyway:defaultSchema}.[MCPServerTool]([ID])
);
GO

-- Extended properties for MCPServerConnectionTool
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this tool is enabled for the connection', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionTool', @level2type=N'COLUMN', @level2name=N'IsEnabled';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON default values for tool inputs', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionTool', @level2type=N'COLUMN', @level2name=N'DefaultInputValues';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Override rate limit for this specific tool', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionTool', @level2type=N'COLUMN', @level2name=N'MaxCallsPerMinute';
GO

-- ============================================================
-- 5. MJ: MCP Server Connection Permissions (User/Role Access)
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.[MCPServerConnectionPermission] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MCPServerConnectionID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NULL,
    [RoleID] UNIQUEIDENTIFIER NULL,
    [CanExecute] BIT NOT NULL DEFAULT 1,
    [CanModify] BIT NOT NULL DEFAULT 0,
    [CanViewCredentials] BIT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_MCPServerConnectionPermission] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MCPServerConnectionPermission_Connection] FOREIGN KEY ([MCPServerConnectionID])
        REFERENCES ${flyway:defaultSchema}.[MCPServerConnection]([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_MCPServerConnectionPermission_User] FOREIGN KEY ([UserID])
        REFERENCES ${flyway:defaultSchema}.[User]([ID]),
    CONSTRAINT [FK_MCPServerConnectionPermission_Role] FOREIGN KEY ([RoleID])
        REFERENCES ${flyway:defaultSchema}.[Role]([ID]),
    -- Either UserID or RoleID must be set, but not both
    CONSTRAINT [CK_MCPServerConnectionPermission_UserOrRole] CHECK (
        ([UserID] IS NOT NULL AND [RoleID] IS NULL) OR
        ([UserID] IS NULL AND [RoleID] IS NOT NULL)
    )
);
GO

-- Create unique indexes for permission uniqueness
CREATE UNIQUE NONCLUSTERED INDEX [IX_MCPServerConnectionPermission_User]
    ON ${flyway:defaultSchema}.[MCPServerConnectionPermission]([MCPServerConnectionID], [UserID])
    WHERE [UserID] IS NOT NULL;
GO

CREATE UNIQUE NONCLUSTERED INDEX [IX_MCPServerConnectionPermission_Role]
    ON ${flyway:defaultSchema}.[MCPServerConnectionPermission]([MCPServerConnectionID], [RoleID])
    WHERE [RoleID] IS NOT NULL;
GO

-- Extended properties for MCPServerConnectionPermission
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to User (mutually exclusive with RoleID)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionPermission', @level2type=N'COLUMN', @level2name=N'UserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to Role (mutually exclusive with UserID)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionPermission', @level2type=N'COLUMN', @level2name=N'RoleID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Can invoke tools via this connection', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionPermission', @level2type=N'COLUMN', @level2name=N'CanExecute';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Can modify connection settings', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionPermission', @level2type=N'COLUMN', @level2name=N'CanModify';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Can see credential info (but not decrypt)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPServerConnectionPermission', @level2type=N'COLUMN', @level2name=N'CanViewCredentials';
GO

-- ============================================================
-- 6. MJ: MCP Tool Execution Logs (Granular Logging)
-- ============================================================
CREATE TABLE ${flyway:defaultSchema}.[MCPToolExecutionLog] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [MCPServerConnectionID] UNIQUEIDENTIFIER NOT NULL,
    [MCPServerToolID] UNIQUEIDENTIFIER NULL,
    [ToolName] NVARCHAR(255) NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [StartedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [EndedAt] DATETIMEOFFSET NULL,
    [DurationMs] INT NULL,
    [Success] BIT NOT NULL DEFAULT 0,
    [ErrorMessage] NVARCHAR(MAX) NULL,
    [InputParameters] NVARCHAR(MAX) NULL,
    [OutputContent] NVARCHAR(MAX) NULL,
    [OutputTruncated] BIT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_MCPToolExecutionLog] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MCPToolExecutionLog_Connection] FOREIGN KEY ([MCPServerConnectionID])
        REFERENCES ${flyway:defaultSchema}.[MCPServerConnection]([ID]),
    CONSTRAINT [FK_MCPToolExecutionLog_Tool] FOREIGN KEY ([MCPServerToolID])
        REFERENCES ${flyway:defaultSchema}.[MCPServerTool]([ID]),
    CONSTRAINT [FK_MCPToolExecutionLog_User] FOREIGN KEY ([UserID])
        REFERENCES ${flyway:defaultSchema}.[User]([ID])
);
GO

-- Index for querying logs
CREATE NONCLUSTERED INDEX [IX_MCPToolExecutionLog_Connection_StartedAt]
    ON ${flyway:defaultSchema}.[MCPToolExecutionLog]([MCPServerConnectionID], [StartedAt] DESC);
GO

CREATE NONCLUSTERED INDEX [IX_MCPToolExecutionLog_User_StartedAt]
    ON ${flyway:defaultSchema}.[MCPToolExecutionLog]([UserID], [StartedAt] DESC);
GO

-- Extended properties for MCPToolExecutionLog
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to MCP Server Tool (null if tool not cached)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPToolExecutionLog', @level2type=N'COLUMN', @level2name=N'MCPServerToolID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tool name (stored directly for resilience)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPToolExecutionLog', @level2type=N'COLUMN', @level2name=N'ToolName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'FK to User who initiated the call', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPToolExecutionLog', @level2type=N'COLUMN', @level2name=N'UserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Execution duration in milliseconds', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPToolExecutionLog', @level2type=N'COLUMN', @level2name=N'DurationMs';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON of input parameters (if logging enabled)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPToolExecutionLog', @level2type=N'COLUMN', @level2name=N'InputParameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON of output content (if logging enabled)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPToolExecutionLog', @level2type=N'COLUMN', @level2name=N'OutputContent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether output was truncated due to size', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'MCPToolExecutionLog', @level2type=N'COLUMN', @level2name=N'OutputTruncated';
GO
 













































-- CODE GEN OUTPUT
/* SQL generated to create new entity MJ: MCP Servers */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'a159b8c9-4941-4ad3-9fc3-a9bc07299206',
         'MJ: MCP Servers',
         'MCP Servers',
         NULL,
         NULL,
         'MCPServer',
         'vwMCPServers',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: MCP Servers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a159b8c9-4941-4ad3-9fc3-a9bc07299206', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: MCP Servers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a159b8c9-4941-4ad3-9fc3-a9bc07299206', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: MCP Servers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a159b8c9-4941-4ad3-9fc3-a9bc07299206', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: MCP Servers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a159b8c9-4941-4ad3-9fc3-a9bc07299206', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: MCP Server Tools */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '36ecee63-1edd-4bf0-8ef1-dcfdf2794f4d',
         'MJ: MCP Server Tools',
         'MCP Server Tools',
         NULL,
         NULL,
         'MCPServerTool',
         'vwMCPServerTools',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: MCP Server Tools to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '36ecee63-1edd-4bf0-8ef1-dcfdf2794f4d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: MCP Server Tools for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('36ecee63-1edd-4bf0-8ef1-dcfdf2794f4d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Tools for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('36ecee63-1edd-4bf0-8ef1-dcfdf2794f4d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Tools for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('36ecee63-1edd-4bf0-8ef1-dcfdf2794f4d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: MCP Server Connections */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '3c4e0e5f-5ff1-4918-9a28-cf21e48e532e',
         'MJ: MCP Server Connections',
         'MCP Server Connections',
         NULL,
         NULL,
         'MCPServerConnection',
         'vwMCPServerConnections',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: MCP Server Connections to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3c4e0e5f-5ff1-4918-9a28-cf21e48e532e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: MCP Server Connections for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3c4e0e5f-5ff1-4918-9a28-cf21e48e532e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Connections for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3c4e0e5f-5ff1-4918-9a28-cf21e48e532e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Connections for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3c4e0e5f-5ff1-4918-9a28-cf21e48e532e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: MCP Server Connection Tools */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'a75f1dd8-2146-4d03-aa7f-50d048e44d11',
         'MJ: MCP Server Connection Tools',
         'MCP Server Connection Tools',
         NULL,
         NULL,
         'MCPServerConnectionTool',
         'vwMCPServerConnectionTools',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: MCP Server Connection Tools to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'a75f1dd8-2146-4d03-aa7f-50d048e44d11', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: MCP Server Connection Tools for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a75f1dd8-2146-4d03-aa7f-50d048e44d11', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Connection Tools for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a75f1dd8-2146-4d03-aa7f-50d048e44d11', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Connection Tools for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a75f1dd8-2146-4d03-aa7f-50d048e44d11', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: MCP Server Connection Permissions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'b931bf66-bb79-4e82-8324-5be7c1d65e12',
         'MJ: MCP Server Connection Permissions',
         'MCP Server Connection Permissions',
         NULL,
         NULL,
         'MCPServerConnectionPermission',
         'vwMCPServerConnectionPermissions',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: MCP Server Connection Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b931bf66-bb79-4e82-8324-5be7c1d65e12', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: MCP Server Connection Permissions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b931bf66-bb79-4e82-8324-5be7c1d65e12', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Connection Permissions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b931bf66-bb79-4e82-8324-5be7c1d65e12', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: MCP Server Connection Permissions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b931bf66-bb79-4e82-8324-5be7c1d65e12', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: MCP Tool Execution Logs */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'ba51038b-121f-48dc-8b9b-d75e61fd91ca',
         'MJ: MCP Tool Execution Logs',
         'MCP Tool Execution Logs',
         NULL,
         NULL,
         'MCPToolExecutionLog',
         'vwMCPToolExecutionLogs',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: MCP Tool Execution Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ba51038b-121f-48dc-8b9b-d75e61fd91ca', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: MCP Tool Execution Logs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba51038b-121f-48dc-8b9b-d75e61fd91ca', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: MCP Tool Execution Logs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba51038b-121f-48dc-8b9b-d75e61fd91ca', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: MCP Tool Execution Logs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba51038b-121f-48dc-8b9b-d75e61fd91ca', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPServerConnectionTool */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerConnectionTool] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPServerConnectionTool */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerConnectionTool] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPServerConnectionPermission */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerConnectionPermission] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPServerConnectionPermission */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerConnectionPermission] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPServer */
ALTER TABLE [${flyway:defaultSchema}].[MCPServer] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPServer */
ALTER TABLE [${flyway:defaultSchema}].[MCPServer] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPServerConnection */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerConnection] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPServerConnection */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerConnection] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPToolExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolExecutionLog] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPToolExecutionLog */
ALTER TABLE [${flyway:defaultSchema}].[MCPToolExecutionLog] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MCPServerTool */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerTool] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MCPServerTool */
ALTER TABLE [${flyway:defaultSchema}].[MCPServerTool] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5b0e0446-427c-4bf0-8562-5152265cfe1a'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5b0e0446-427c-4bf0-8562-5152265cfe1a',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b5ee3d38-8573-4170-bee5-a3ef5d51dd4c'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MCPServerConnectionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b5ee3d38-8573-4170-bee5-a3ef5d51dd4c',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100002,
            'MCPServerConnectionID',
            'MCP Server Connection ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '019ffee0-0763-48e0-9862-d429a4cdab3c'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MCPServerToolID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '019ffee0-0763-48e0-9862-d429a4cdab3c',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100003,
            'MCPServerToolID',
            'MCP Server Tool ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd2431785-0203-430c-a267-6a0eeb22a4c5'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'IsEnabled')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd2431785-0203-430c-a267-6a0eeb22a4c5',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100004,
            'IsEnabled',
            'Is Enabled',
            'Whether this tool is enabled for the connection',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b114689e-036b-428f-b179-0b68371cf237'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'DefaultInputValues')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b114689e-036b-428f-b179-0b68371cf237',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100005,
            'DefaultInputValues',
            'Default Input Values',
            'JSON default values for tool inputs',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd5d4f701-dd24-41f4-b62c-c5efd4676b92'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MaxCallsPerMinute')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd5d4f701-dd24-41f4-b62c-c5efd4676b92',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100006,
            'MaxCallsPerMinute',
            'Max Calls Per Minute',
            'Override rate limit for this specific tool',
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3dc2dcec-6f1e-421a-be51-578f7d2f091e'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3dc2dcec-6f1e-421a-be51-578f7d2f091e',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100007,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '95e2b969-4f03-4efe-b519-d6dac1272c3d'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '95e2b969-4f03-4efe-b519-d6dac1272c3d',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100008,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9f18738f-3969-47df-8901-f13919233d4e'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9f18738f-3969-47df-8901-f13919233d4e',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3ec5281c-a01c-48b5-aa60-0b17622937d3'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'MCPServerConnectionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3ec5281c-a01c-48b5-aa60-0b17622937d3',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100002,
            'MCPServerConnectionID',
            'MCP Server Connection ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8c012fa3-94ca-46f8-8aff-370de8a61fa5'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8c012fa3-94ca-46f8-8aff-370de8a61fa5',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100003,
            'UserID',
            'User ID',
            'FK to User (mutually exclusive with RoleID)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '638bd3a9-ee28-4abf-a9e0-53a0a33eef29'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'RoleID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '638bd3a9-ee28-4abf-a9e0-53a0a33eef29',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100004,
            'RoleID',
            'Role ID',
            'FK to Role (mutually exclusive with UserID)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '704fd670-d984-47e0-b07c-ec7c1c35bf63'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'CanExecute')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '704fd670-d984-47e0-b07c-ec7c1c35bf63',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100005,
            'CanExecute',
            'Can Execute',
            'Can invoke tools via this connection',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a9896af6-bb5a-47e7-b2dc-1dcda391de05'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'CanModify')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a9896af6-bb5a-47e7-b2dc-1dcda391de05',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100006,
            'CanModify',
            'Can Modify',
            'Can modify connection settings',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '66fb1461-11b2-494d-99d6-92060a43df68'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'CanViewCredentials')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '66fb1461-11b2-494d-99d6-92060a43df68',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100007,
            'CanViewCredentials',
            'Can View Credentials',
            'Can see credential info (but not decrypt)',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '16e4d9ec-b0ce-40a4-981b-c862fd079d2d'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '16e4d9ec-b0ce-40a4-981b-c862fd079d2d',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100008,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9de772ab-bc37-478c-81b2-c0a725aec6ef'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9de772ab-bc37-478c-81b2-c0a725aec6ef',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100009,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '976d3c56-9f84-464b-bf4f-42390dea0e0a'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '976d3c56-9f84-464b-bf4f-42390dea0e0a',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d982bde-f324-45c4-be0c-898b53ca7e53'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d982bde-f324-45c4-be0c-898b53ca7e53',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100002,
            'Name',
            'Name',
            'Unique display name for the MCP server',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd1c5ada-e7bd-4cf4-a6ba-124a7a5fcad5'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd1c5ada-e7bd-4cf4-a6ba-124a7a5fcad5',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100003,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '75ad081e-a48a-4a80-8afb-875ce466ef93'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'ServerURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '75ad081e-a48a-4a80-8afb-875ce466ef93',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100004,
            'ServerURL',
            'Server URL',
            'Server endpoint URL for HTTP/SSE/WebSocket transports',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e4325737-d49d-44d8-a1e3-8562f6bd8636'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'Command')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4325737-d49d-44d8-a1e3-8562f6bd8636',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100005,
            'Command',
            'Command',
            'Executable path for Stdio transport',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5c2a5582-fe06-4cca-8946-642b57717fca'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'CommandArgs')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5c2a5582-fe06-4cca-8946-642b57717fca',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100006,
            'CommandArgs',
            'Command Args',
            'JSON array of command arguments for Stdio transport',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4f931f86-fc44-4f1c-a700-9a4c45f74960'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'TransportType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4f931f86-fc44-4f1c-a700-9a4c45f74960',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100007,
            'TransportType',
            'Transport Type',
            'Transport type: StreamableHTTP, SSE, Stdio, or WebSocket',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3e0736e5-ecbf-4dd8-9182-00693cc1f542'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'DefaultAuthType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3e0736e5-ecbf-4dd8-9182-00693cc1f542',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100008,
            'DefaultAuthType',
            'Default Auth Type',
            'Default auth type: None, Bearer, APIKey, OAuth2, Basic, or Custom',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d747dc2-aeb7-4b53-8548-d0d398a4fd98'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'CredentialTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d747dc2-aeb7-4b53-8548-d0d398a4fd98',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100009,
            'CredentialTypeID',
            'Credential Type ID',
            'Expected credential type for this server',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'D512FF2E-A140-45A2-979A-20657AB77137',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '92328d0c-deb5-4094-b8ed-a282d3698060'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '92328d0c-deb5-4094-b8ed-a282d3698060',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100010,
            'Status',
            'Status',
            'Server status: Active, Inactive, or Deprecated',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'db080321-31c3-40d3-badd-d75f72b39893'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'LastSyncAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'db080321-31c3-40d3-badd-d75f72b39893',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100011,
            'LastSyncAt',
            'Last Sync At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ff80c789-9a03-4b4c-9afe-db0f17ca895e'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'RateLimitPerMinute')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ff80c789-9a03-4b4c-9afe-db0f17ca895e',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100012,
            'RateLimitPerMinute',
            'Rate Limit Per Minute',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '57385732-769f-4b72-9b97-5340f0a1a361'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'RateLimitPerHour')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '57385732-769f-4b72-9b97-5340f0a1a361',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100013,
            'RateLimitPerHour',
            'Rate Limit Per Hour',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b1d48731-dda2-4ddd-bebe-92dfe2a75c78'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'ConnectionTimeoutMs')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b1d48731-dda2-4ddd-bebe-92dfe2a75c78',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100014,
            'ConnectionTimeoutMs',
            'Connection Timeout Ms',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            '(30000)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '97db2c2e-ec6b-4393-bfa9-ed8a57ec8ff5'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'RequestTimeoutMs')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '97db2c2e-ec6b-4393-bfa9-ed8a57ec8ff5',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100015,
            'RequestTimeoutMs',
            'Request Timeout Ms',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            '(60000)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0e281e3b-b4c2-4ea9-8b6f-caeb080b8eeb'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'DocumentationURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0e281e3b-b4c2-4ea9-8b6f-caeb080b8eeb',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100016,
            'DocumentationURL',
            'Documentation URL',
            NULL,
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a0a92790-fa38-42c6-9dbf-631728ff340c'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'IconClass')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a0a92790-fa38-42c6-9dbf-631728ff340c',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100017,
            'IconClass',
            'Icon Class',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5fc268a7-ad61-4576-b647-9cf7c3326f23'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5fc268a7-ad61-4576-b647-9cf7c3326f23',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100018,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '393d3b2e-4da2-4b87-a2d5-a18409d50049'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '393d3b2e-4da2-4b87-a2d5-a18409d50049',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100019,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8e03c4ed-7241-45f5-a137-804a3587ae97'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8e03c4ed-7241-45f5-a137-804a3587ae97',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a6fb5009-4ad9-46e3-b065-89c65c960eca'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'MCPServerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a6fb5009-4ad9-46e3-b065-89c65c960eca',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100002,
            'MCPServerID',
            'MCP Server ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5c3060fb-4452-49ab-9676-b04d70984ebf'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5c3060fb-4452-49ab-9676-b04d70984ebf',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100003,
            'Name',
            'Name',
            'Connection name (unique per company)',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9b7b1708-0d1f-4709-b7ee-590f767ff00f'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9b7b1708-0d1f-4709-b7ee-590f767ff00f',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100004,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ea1449b1-8c00-47c8-bea2-6ac5d3577d93'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'CredentialID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ea1449b1-8c00-47c8-bea2-6ac5d3577d93',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100005,
            'CredentialID',
            'Credential ID',
            'FK to Credential entity (uses existing credential types)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1d268066-6033-4e98-9301-7730e4d9411f'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'CustomHeaderName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1d268066-6033-4e98-9301-7730e4d9411f',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100006,
            'CustomHeaderName',
            'Custom Header Name',
            'Custom header name for API key auth (default: X-API-Key)',
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a9c55b4e-f9f7-462b-8a5c-4057ee1cb045'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'CompanyID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a9c55b4e-f9f7-462b-8a5c-4057ee1cb045',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100007,
            'CompanyID',
            'Company ID',
            'FK to Company for multi-tenancy',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '186b11df-17c4-42d6-b2f6-e43487676cbb'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '186b11df-17c4-42d6-b2f6-e43487676cbb',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100008,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '75e1303b-7259-424a-91b0-9b0e61ef79af'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'AutoSyncTools')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '75e1303b-7259-424a-91b0-9b0e61ef79af',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100009,
            'AutoSyncTools',
            'Auto Sync Tools',
            'Auto-sync tools when connecting',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '24afd7b6-e8a0-4382-ba9b-7fac3524926b'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'AutoGenerateActions')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24afd7b6-e8a0-4382-ba9b-7fac3524926b',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100010,
            'AutoGenerateActions',
            'Auto Generate Actions',
            'Auto-generate MJ Actions for discovered tools',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7f1d2d0b-c3eb-404b-8897-0ca88aea71f4'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'LogToolCalls')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7f1d2d0b-c3eb-404b-8897-0ca88aea71f4',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100011,
            'LogToolCalls',
            'Log Tool Calls',
            'Log all tool calls to execution log',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'aba1e592-3ebf-410c-8570-8151f625db0b'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'LogInputParameters')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aba1e592-3ebf-410c-8570-8151f625db0b',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100012,
            'LogInputParameters',
            'Log Input Parameters',
            'Include input parameters in logs',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b7597c16-071c-492a-abeb-2e995294e19e'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'LogOutputContent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b7597c16-071c-492a-abeb-2e995294e19e',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100013,
            'LogOutputContent',
            'Log Output Content',
            'Include output content in logs',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c95bb71f-e892-46a2-8391-90da9de7467b'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'MaxOutputLogSize')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c95bb71f-e892-46a2-8391-90da9de7467b',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100014,
            'MaxOutputLogSize',
            'Max Output Log Size',
            'Max output size to log in bytes (default: 100KB)',
            'int',
            4,
            10,
            0,
            1,
            '(102400)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d0be912-9199-454d-9b38-ef8d9bc263eb'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'LastConnectedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d0be912-9199-454d-9b38-ef8d9bc263eb',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100015,
            'LastConnectedAt',
            'Last Connected At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '987ca39c-8b2c-4514-978d-e82d28443d73'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'LastErrorMessage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '987ca39c-8b2c-4514-978d-e82d28443d73',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100016,
            'LastErrorMessage',
            'Last Error Message',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '84963b3b-afab-4439-a157-ad92e789cb5f'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'EnvironmentVars')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '84963b3b-afab-4439-a157-ad92e789cb5f',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100017,
            'EnvironmentVars',
            'Environment Vars',
            'JSON object of environment variables for Stdio transport',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e3e4cd06-8dba-4b1a-8f2a-34c2ccb97005'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e3e4cd06-8dba-4b1a-8f2a-34c2ccb97005',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100018,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6c132d9a-5241-47d6-a57d-67a398d20d80'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6c132d9a-5241-47d6-a57d-67a398d20d80',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100019,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3b26460b-b434-41e8-98d6-6e8973a1998f'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3b26460b-b434-41e8-98d6-6e8973a1998f',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f402bb2f-2bdb-458a-ba98-58c95c41fe03'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'MCPServerConnectionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f402bb2f-2bdb-458a-ba98-58c95c41fe03',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100002,
            'MCPServerConnectionID',
            'MCP Server Connection ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9bef8a97-4002-4707-a73c-2a679ace8f96'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'MCPServerToolID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9bef8a97-4002-4707-a73c-2a679ace8f96',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100003,
            'MCPServerToolID',
            'MCP Server Tool ID',
            'FK to MCP Server Tool (null if tool not cached)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3c7797aa-f939-4bc2-bbbc-0f69fa7b585e'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'ToolName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3c7797aa-f939-4bc2-bbbc-0f69fa7b585e',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100004,
            'ToolName',
            'Tool Name',
            'Tool name (stored directly for resilience)',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '68cb9a34-65c2-4546-abae-1a616d5f93a6'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '68cb9a34-65c2-4546-abae-1a616d5f93a6',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100005,
            'UserID',
            'User ID',
            'FK to User who initiated the call',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e7f6fe9b-d064-4c71-aa91-66d1e81fcd52'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'StartedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e7f6fe9b-d064-4c71-aa91-66d1e81fcd52',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100006,
            'StartedAt',
            'Started At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1b8a92db-cff9-400d-b88f-41131c0480c6'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'EndedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1b8a92db-cff9-400d-b88f-41131c0480c6',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100007,
            'EndedAt',
            'Ended At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '32ed9c3d-9f06-49ea-8165-4c78c41128f0'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'DurationMs')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '32ed9c3d-9f06-49ea-8165-4c78c41128f0',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100008,
            'DurationMs',
            'Duration Ms',
            'Execution duration in milliseconds',
            'int',
            4,
            10,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a765705a-2032-49a5-8fe5-4e5b7254240b'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'Success')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a765705a-2032-49a5-8fe5-4e5b7254240b',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100009,
            'Success',
            'Success',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cef515f8-77d6-4981-9f31-378ed7baf0a2'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'ErrorMessage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cef515f8-77d6-4981-9f31-378ed7baf0a2',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100010,
            'ErrorMessage',
            'Error Message',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c584fb9f-d0a0-48d8-9e0e-dab449769f44'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'InputParameters')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c584fb9f-d0a0-48d8-9e0e-dab449769f44',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100011,
            'InputParameters',
            'Input Parameters',
            'JSON of input parameters (if logging enabled)',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f92f2ed5-628e-4222-b66c-f5b4139f3309'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'OutputContent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f92f2ed5-628e-4222-b66c-f5b4139f3309',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100012,
            'OutputContent',
            'Output Content',
            'JSON of output content (if logging enabled)',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b0be70a8-d2e8-46a6-b746-57528e095f81'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'OutputTruncated')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b0be70a8-d2e8-46a6-b746-57528e095f81',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100013,
            'OutputTruncated',
            'Output Truncated',
            'Whether output was truncated due to size',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '78a09c32-7fe6-408a-862a-71bd7e0042f7'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '78a09c32-7fe6-408a-862a-71bd7e0042f7',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100014,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '73c2b5a4-9f4f-4195-9794-bce839db8b70'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '73c2b5a4-9f4f-4195-9794-bce839db8b70',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100015,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '39e392ba-ede6-4027-800c-f1134267b78f'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '39e392ba-ede6-4027-800c-f1134267b78f',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1a12ee15-94af-4a78-94a0-fc44fddb4b5d'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'MCPServerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1a12ee15-94af-4a78-94a0-fc44fddb4b5d',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100002,
            'MCPServerID',
            'MCP Server ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2351d1c2-dbce-4695-85a9-364d6b76021c'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'ToolName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2351d1c2-dbce-4695-85a9-364d6b76021c',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100003,
            'ToolName',
            'Tool Name',
            'Tool identifier from the MCP server',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b6d4666e-88cf-4334-a7f5-8a24d1b9c726'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'ToolTitle')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b6d4666e-88cf-4334-a7f5-8a24d1b9c726',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100004,
            'ToolTitle',
            'Tool Title',
            'Human-readable title for the tool',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e207fa54-4fcc-415f-972c-d5aed4e69d8e'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'ToolDescription')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e207fa54-4fcc-415f-972c-d5aed4e69d8e',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100005,
            'ToolDescription',
            'Tool Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '484a1f30-83f9-4db1-bd9a-d45ab5526aa9'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'InputSchema')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '484a1f30-83f9-4db1-bd9a-d45ab5526aa9',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100006,
            'InputSchema',
            'Input Schema',
            'JSON Schema for tool input parameters',
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'da252449-eaa9-4f4a-8f30-003cc544df1d'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'OutputSchema')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'da252449-eaa9-4f4a-8f30-003cc544df1d',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100007,
            'OutputSchema',
            'Output Schema',
            'JSON Schema for tool output (if provided)',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '95696a5a-e259-44dc-a3aa-0da7aebbb185'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'Annotations')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '95696a5a-e259-44dc-a3aa-0da7aebbb185',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100008,
            'Annotations',
            'Annotations',
            'JSON with tool hints (readOnlyHint, destructiveHint, etc.)',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c411e387-34b6-474e-94e1-9d8d72851057'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c411e387-34b6-474e-94e1-9d8d72851057',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100009,
            'Status',
            'Status',
            'Tool status: Active, Inactive, or Deprecated',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e8abe8a4-8cc3-4ad2-bc67-fe7b437971e9'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'DiscoveredAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e8abe8a4-8cc3-4ad2-bc67-fe7b437971e9',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100010,
            'DiscoveredAt',
            'Discovered At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '28a27e5e-356d-4869-b95f-fc26c51b9e40'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'LastSeenAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '28a27e5e-356d-4869-b95f-fc26c51b9e40',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100011,
            'LastSeenAt',
            'Last Seen At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '06795dd7-5c53-4315-93cd-0d47c41259b8'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'GeneratedActionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '06795dd7-5c53-4315-93cd-0d47c41259b8',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100012,
            'GeneratedActionID',
            'Generated Action ID',
            'FK to auto-generated Action (if promoted)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '38248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '578077c8-a12d-43bf-8b26-880697c6635e'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'GeneratedActionCategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '578077c8-a12d-43bf-8b26-880697c6635e',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100013,
            'GeneratedActionCategoryID',
            'Generated Action Category ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '33248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5840b03b-1e9a-40e9-b04a-12604191458d'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5840b03b-1e9a-40e9-b04a-12604191458d',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100014,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'da5547b8-7b2e-48ee-9494-eb0b4df29959'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'da5547b8-7b2e-48ee-9494-eb0b4df29959',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100015,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '303802ea-4d60-446a-b5d5-0dd7524fd51d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('303802ea-4d60-446a-b5d5-0dd7524fd51d', 'D512FF2E-A140-45A2-979A-20657AB77137', 'A159B8C9-4941-4AD3-9FC3-A9BC07299206', 'CredentialTypeID', 'One To Many', 1, 1, 'MJ: MCP Servers', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'dfaf0efd-1d5f-4607-9135-2b196822dd83'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('dfaf0efd-1d5f-4607-9135-2b196822dd83', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'CompanyID', 'One To Many', 1, 1, 'MJ: MCP Server Connections', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4db90b63-69f6-438e-b2b8-f64984d8b2fb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4db90b63-69f6-438e-b2b8-f64984d8b2fb', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12', 'RoleID', 'One To Many', 1, 1, 'MJ: MCP Server Connection Permissions', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c8b827e3-57de-4bb3-a13c-11fe426b39ee'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c8b827e3-57de-4bb3-a13c-11fe426b39ee', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BA51038B-121F-48DC-8B9B-D75E61FD91CA', 'UserID', 'One To Many', 1, 1, 'MJ: MCP Tool Execution Logs', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'adf75290-f90a-41d8-b0c6-332ae22e6e7a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('adf75290-f90a-41d8-b0c6-332ae22e6e7a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12', 'UserID', 'One To Many', 1, 1, 'MJ: MCP Server Connection Permissions', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a538f089-3671-44af-b5ab-7e8daea592a2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a538f089-3671-44af-b5ab-7e8daea592a2', '33248F34-2837-EF11-86D4-6045BDEE16E6', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'GeneratedActionCategoryID', 'One To Many', 1, 1, 'MJ: MCP Server Tools', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ac769c94-4e03-4682-80f6-4062e27d2c65'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ac769c94-4e03-4682-80f6-4062e27d2c65', '38248F34-2837-EF11-86D4-6045BDEE16E6', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'GeneratedActionID', 'One To Many', 1, 1, 'MJ: MCP Server Tools', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '113da00f-f5d6-49f2-bc86-0a6ee603b87b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('113da00f-f5d6-49f2-bc86-0a6ee603b87b', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'CredentialID', 'One To Many', 1, 1, 'MJ: MCP Server Connections', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1a1d0a2b-ddb3-4edc-be95-ee2c89584ddf'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1a1d0a2b-ddb3-4edc-be95-ee2c89584ddf', 'A159B8C9-4941-4AD3-9FC3-A9BC07299206', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'MCPServerID', 'One To Many', 1, 1, 'MJ: MCP Server Connections', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '7691a0d5-bad3-4f98-a737-0acb1b7cdc55'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('7691a0d5-bad3-4f98-a737-0acb1b7cdc55', 'A159B8C9-4941-4AD3-9FC3-A9BC07299206', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'MCPServerID', 'One To Many', 1, 1, 'MJ: MCP Server Tools', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2b8fdfa8-b824-4ac3-b6fb-0c15e28c95b9'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2b8fdfa8-b824-4ac3-b6fb-0c15e28c95b9', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12', 'MCPServerConnectionID', 'One To Many', 1, 1, 'MJ: MCP Server Connection Permissions', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a9ece5f9-89a1-4b94-8e2a-590e1ce5fb12'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a9ece5f9-89a1-4b94-8e2a-590e1ce5fb12', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'A75F1DD8-2146-4D03-AA7F-50D048E44D11', 'MCPServerConnectionID', 'One To Many', 1, 1, 'MJ: MCP Server Connection Tools', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '60b673ea-1533-4714-b464-12ed638fefbd'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('60b673ea-1533-4714-b464-12ed638fefbd', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'BA51038B-121F-48DC-8B9B-D75E61FD91CA', 'MCPServerConnectionID', 'One To Many', 1, 1, 'MJ: MCP Tool Execution Logs', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a05846e3-505d-4e1f-9001-75295c53a13f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a05846e3-505d-4e1f-9001-75295c53a13f', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'BA51038B-121F-48DC-8B9B-D75E61FD91CA', 'MCPServerToolID', 'One To Many', 1, 1, 'MJ: MCP Tool Execution Logs', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'bd405064-546b-467e-9a48-a38493bc83d6'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('bd405064-546b-467e-9a48-a38493bc83d6', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'A75F1DD8-2146-4D03-AA7F-50D048E44D11', 'MCPServerToolID', 'One To Many', 1, 1, 'MJ: MCP Server Connection Tools', 2);
   END
                              

/* Index for Foreign Keys for MCPServerConnectionPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerConnectionID in table MCPServerConnectionPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnectionPermission_MCPServerConnectionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnectionPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnectionPermission_MCPServerConnectionID ON [${flyway:defaultSchema}].[MCPServerConnectionPermission] ([MCPServerConnectionID]);

-- Index for foreign key UserID in table MCPServerConnectionPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnectionPermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnectionPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnectionPermission_UserID ON [${flyway:defaultSchema}].[MCPServerConnectionPermission] ([UserID]);

-- Index for foreign key RoleID in table MCPServerConnectionPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnectionPermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnectionPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnectionPermission_RoleID ON [${flyway:defaultSchema}].[MCPServerConnectionPermission] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 3EC5281C-A01C-48B5-AA60-0B17622937D3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3EC5281C-A01C-48B5-AA60-0B17622937D3',
         @RelatedEntityNameFieldMap='MCPServerConnection'

/* Index for Foreign Keys for MCPServerConnectionTool */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Tools
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerConnectionID in table MCPServerConnectionTool
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnectionTool_MCPServerConnectionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnectionTool]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnectionTool_MCPServerConnectionID ON [${flyway:defaultSchema}].[MCPServerConnectionTool] ([MCPServerConnectionID]);

-- Index for foreign key MCPServerToolID in table MCPServerConnectionTool
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnectionTool_MCPServerToolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnectionTool]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnectionTool_MCPServerToolID ON [${flyway:defaultSchema}].[MCPServerConnectionTool] ([MCPServerToolID]);

/* SQL text to update entity field related entity name field map for entity field ID B5EE3D38-8573-4170-BEE5-A3EF5D51DD4C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B5EE3D38-8573-4170-BEE5-A3EF5D51DD4C',
         @RelatedEntityNameFieldMap='MCPServerConnection'

/* Index for Foreign Keys for MCPServerConnection */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connections
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerID in table MCPServerConnection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnection_MCPServerID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnection_MCPServerID ON [${flyway:defaultSchema}].[MCPServerConnection] ([MCPServerID]);

-- Index for foreign key CredentialID in table MCPServerConnection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnection_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnection_CredentialID ON [${flyway:defaultSchema}].[MCPServerConnection] ([CredentialID]);

-- Index for foreign key CompanyID in table MCPServerConnection
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerConnection_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerConnection]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerConnection_CompanyID ON [${flyway:defaultSchema}].[MCPServerConnection] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID A6FB5009-4AD9-46E3-B065-89C65C960ECA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A6FB5009-4AD9-46E3-B065-89C65C960ECA',
         @RelatedEntityNameFieldMap='MCPServer'

/* Index for Foreign Keys for MCPServerTool */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Tools
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerID in table MCPServerTool
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerTool_MCPServerID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerTool]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerTool_MCPServerID ON [${flyway:defaultSchema}].[MCPServerTool] ([MCPServerID]);

-- Index for foreign key GeneratedActionID in table MCPServerTool
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerTool_GeneratedActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerTool]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerTool_GeneratedActionID ON [${flyway:defaultSchema}].[MCPServerTool] ([GeneratedActionID]);

-- Index for foreign key GeneratedActionCategoryID in table MCPServerTool
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServerTool_GeneratedActionCategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServerTool]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServerTool_GeneratedActionCategoryID ON [${flyway:defaultSchema}].[MCPServerTool] ([GeneratedActionCategoryID]);

/* SQL text to update entity field related entity name field map for entity field ID 1A12EE15-94AF-4A78-94A0-FC44FDDB4B5D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1A12EE15-94AF-4A78-94A0-FC44FDDB4B5D',
         @RelatedEntityNameFieldMap='MCPServer'

/* Index for Foreign Keys for MCPServer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialTypeID in table MCPServer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPServer_CredentialTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPServer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPServer_CredentialTypeID ON [${flyway:defaultSchema}].[MCPServer] ([CredentialTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 0D747DC2-AEB7-4B53-8548-D0D398A4FD98 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0D747DC2-AEB7-4B53-8548-D0D398A4FD98',
         @RelatedEntityNameFieldMap='CredentialType'

/* Base View SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: vwMCPServers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Servers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPServer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPServers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPServers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPServers]
AS
SELECT
    m.*,
    CredentialType_CredentialTypeID.[Name] AS [CredentialType]
FROM
    [${flyway:defaultSchema}].[MCPServer] AS m
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialType] AS CredentialType_CredentialTypeID
  ON
    [m].[CredentialTypeID] = CredentialType_CredentialTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: Permissions for vwMCPServers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: spCreateMCPServer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPServer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPServer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServer]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ServerURL nvarchar(1000),
    @Command nvarchar(500),
    @CommandArgs nvarchar(MAX),
    @TransportType nvarchar(50),
    @DefaultAuthType nvarchar(50),
    @CredentialTypeID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @LastSyncAt datetimeoffset,
    @RateLimitPerMinute int,
    @RateLimitPerHour int,
    @ConnectionTimeoutMs int,
    @RequestTimeoutMs int,
    @DocumentationURL nvarchar(1000),
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPServer]
            (
                [ID],
                [Name],
                [Description],
                [ServerURL],
                [Command],
                [CommandArgs],
                [TransportType],
                [DefaultAuthType],
                [CredentialTypeID],
                [Status],
                [LastSyncAt],
                [RateLimitPerMinute],
                [RateLimitPerHour],
                [ConnectionTimeoutMs],
                [RequestTimeoutMs],
                [DocumentationURL],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ServerURL,
                @Command,
                @CommandArgs,
                @TransportType,
                @DefaultAuthType,
                @CredentialTypeID,
                ISNULL(@Status, 'Active'),
                @LastSyncAt,
                @RateLimitPerMinute,
                @RateLimitPerHour,
                @ConnectionTimeoutMs,
                @RequestTimeoutMs,
                @DocumentationURL,
                @IconClass
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPServer]
            (
                [Name],
                [Description],
                [ServerURL],
                [Command],
                [CommandArgs],
                [TransportType],
                [DefaultAuthType],
                [CredentialTypeID],
                [Status],
                [LastSyncAt],
                [RateLimitPerMinute],
                [RateLimitPerHour],
                [ConnectionTimeoutMs],
                [RequestTimeoutMs],
                [DocumentationURL],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ServerURL,
                @Command,
                @CommandArgs,
                @TransportType,
                @DefaultAuthType,
                @CredentialTypeID,
                ISNULL(@Status, 'Active'),
                @LastSyncAt,
                @RateLimitPerMinute,
                @RateLimitPerHour,
                @ConnectionTimeoutMs,
                @RequestTimeoutMs,
                @DocumentationURL,
                @IconClass
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPServers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServer] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: MCP Servers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServer] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: spUpdateMCPServer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPServer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPServer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServer]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ServerURL nvarchar(1000),
    @Command nvarchar(500),
    @CommandArgs nvarchar(MAX),
    @TransportType nvarchar(50),
    @DefaultAuthType nvarchar(50),
    @CredentialTypeID uniqueidentifier,
    @Status nvarchar(50),
    @LastSyncAt datetimeoffset,
    @RateLimitPerMinute int,
    @RateLimitPerHour int,
    @ConnectionTimeoutMs int,
    @RequestTimeoutMs int,
    @DocumentationURL nvarchar(1000),
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServer]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ServerURL] = @ServerURL,
        [Command] = @Command,
        [CommandArgs] = @CommandArgs,
        [TransportType] = @TransportType,
        [DefaultAuthType] = @DefaultAuthType,
        [CredentialTypeID] = @CredentialTypeID,
        [Status] = @Status,
        [LastSyncAt] = @LastSyncAt,
        [RateLimitPerMinute] = @RateLimitPerMinute,
        [RateLimitPerHour] = @RateLimitPerHour,
        [ConnectionTimeoutMs] = @ConnectionTimeoutMs,
        [RequestTimeoutMs] = @RequestTimeoutMs,
        [DocumentationURL] = @DocumentationURL,
        [IconClass] = @IconClass
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPServers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPServers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPServer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPServer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPServer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPServer
ON [${flyway:defaultSchema}].[MCPServer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPServer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: MCP Servers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServer] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Servers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Servers
-- Item: spDeleteMCPServer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPServer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPServer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServer] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: MCP Servers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServer] TO [cdp_Integration]



/* Base View SQL for MJ: MCP Server Connection Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Tools
-- Item: vwMCPServerConnectionTools
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Server Connection Tools
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPServerConnectionTool
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPServerConnectionTools]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPServerConnectionTools];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPServerConnectionTools]
AS
SELECT
    m.*,
    MCPServerConnection_MCPServerConnectionID.[Name] AS [MCPServerConnection]
FROM
    [${flyway:defaultSchema}].[MCPServerConnectionTool] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MCPServerConnection] AS MCPServerConnection_MCPServerConnectionID
  ON
    [m].[MCPServerConnectionID] = MCPServerConnection_MCPServerConnectionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerConnectionTools] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: MCP Server Connection Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Tools
-- Item: Permissions for vwMCPServerConnectionTools
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerConnectionTools] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Server Connection Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Tools
-- Item: spCreateMCPServerConnectionTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPServerConnectionTool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPServerConnectionTool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerConnectionTool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerConnectionTool]
    @ID uniqueidentifier = NULL,
    @MCPServerConnectionID uniqueidentifier,
    @MCPServerToolID uniqueidentifier,
    @IsEnabled bit = NULL,
    @DefaultInputValues nvarchar(MAX),
    @MaxCallsPerMinute int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPServerConnectionTool]
            (
                [ID],
                [MCPServerConnectionID],
                [MCPServerToolID],
                [IsEnabled],
                [DefaultInputValues],
                [MaxCallsPerMinute]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerConnectionID,
                @MCPServerToolID,
                ISNULL(@IsEnabled, 1),
                @DefaultInputValues,
                @MaxCallsPerMinute
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPServerConnectionTool]
            (
                [MCPServerConnectionID],
                [MCPServerToolID],
                [IsEnabled],
                [DefaultInputValues],
                [MaxCallsPerMinute]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerConnectionID,
                @MCPServerToolID,
                ISNULL(@IsEnabled, 1),
                @DefaultInputValues,
                @MaxCallsPerMinute
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPServerConnectionTools] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerConnectionTool] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: MCP Server Connection Tools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerConnectionTool] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Server Connection Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Tools
-- Item: spUpdateMCPServerConnectionTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPServerConnectionTool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPServerConnectionTool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerConnectionTool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerConnectionTool]
    @ID uniqueidentifier,
    @MCPServerConnectionID uniqueidentifier,
    @MCPServerToolID uniqueidentifier,
    @IsEnabled bit,
    @DefaultInputValues nvarchar(MAX),
    @MaxCallsPerMinute int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerConnectionTool]
    SET
        [MCPServerConnectionID] = @MCPServerConnectionID,
        [MCPServerToolID] = @MCPServerToolID,
        [IsEnabled] = @IsEnabled,
        [DefaultInputValues] = @DefaultInputValues,
        [MaxCallsPerMinute] = @MaxCallsPerMinute
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPServerConnectionTools] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPServerConnectionTools]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerConnectionTool] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPServerConnectionTool table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPServerConnectionTool]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPServerConnectionTool];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPServerConnectionTool
ON [${flyway:defaultSchema}].[MCPServerConnectionTool]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerConnectionTool]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPServerConnectionTool] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: MCP Server Connection Tools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerConnectionTool] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Server Connection Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Tools
-- Item: spDeleteMCPServerConnectionTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerConnectionTool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPServerConnectionTool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerConnectionTool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerConnectionTool]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPServerConnectionTool]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerConnectionTool] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: MCP Server Connection Tools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerConnectionTool] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 8C012FA3-94CA-46F8-8AFF-370DE8A61FA5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8C012FA3-94CA-46F8-8AFF-370DE8A61FA5',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID EA1449B1-8C00-47C8-BEA2-6AC5D3577D93 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EA1449B1-8C00-47C8-BEA2-6AC5D3577D93',
         @RelatedEntityNameFieldMap='Credential'

/* SQL text to update entity field related entity name field map for entity field ID 06795DD7-5C53-4315-93CD-0D47C41259B8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='06795DD7-5C53-4315-93CD-0D47C41259B8',
         @RelatedEntityNameFieldMap='GeneratedAction'

/* SQL text to update entity field related entity name field map for entity field ID 638BD3A9-EE28-4ABF-A9E0-53A0A33EEF29 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='638BD3A9-EE28-4ABF-A9E0-53A0A33EEF29',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID A9C55B4E-F9F7-462B-8A5C-4057EE1CB045 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A9C55B4E-F9F7-462B-8A5C-4057EE1CB045',
         @RelatedEntityNameFieldMap='Company'

/* SQL text to update entity field related entity name field map for entity field ID 578077C8-A12D-43BF-8B26-880697C6635E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='578077C8-A12D-43BF-8B26-880697C6635E',
         @RelatedEntityNameFieldMap='GeneratedActionCategory'

/* Base View SQL for MJ: MCP Server Connection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Permissions
-- Item: vwMCPServerConnectionPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Server Connection Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPServerConnectionPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPServerConnectionPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPServerConnectionPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPServerConnectionPermissions]
AS
SELECT
    m.*,
    MCPServerConnection_MCPServerConnectionID.[Name] AS [MCPServerConnection],
    User_UserID.[Name] AS [User],
    Role_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[MCPServerConnectionPermission] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MCPServerConnection] AS MCPServerConnection_MCPServerConnectionID
  ON
    [m].[MCPServerConnectionID] = MCPServerConnection_MCPServerConnectionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [m].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS Role_RoleID
  ON
    [m].[RoleID] = Role_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerConnectionPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: MCP Server Connection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Permissions
-- Item: Permissions for vwMCPServerConnectionPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerConnectionPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Server Connection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Permissions
-- Item: spCreateMCPServerConnectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPServerConnectionPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPServerConnectionPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerConnectionPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerConnectionPermission]
    @ID uniqueidentifier = NULL,
    @MCPServerConnectionID uniqueidentifier,
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanExecute bit = NULL,
    @CanModify bit = NULL,
    @CanViewCredentials bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPServerConnectionPermission]
            (
                [ID],
                [MCPServerConnectionID],
                [UserID],
                [RoleID],
                [CanExecute],
                [CanModify],
                [CanViewCredentials]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerConnectionID,
                @UserID,
                @RoleID,
                ISNULL(@CanExecute, 1),
                ISNULL(@CanModify, 0),
                ISNULL(@CanViewCredentials, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPServerConnectionPermission]
            (
                [MCPServerConnectionID],
                [UserID],
                [RoleID],
                [CanExecute],
                [CanModify],
                [CanViewCredentials]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerConnectionID,
                @UserID,
                @RoleID,
                ISNULL(@CanExecute, 1),
                ISNULL(@CanModify, 0),
                ISNULL(@CanViewCredentials, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPServerConnectionPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerConnectionPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: MCP Server Connection Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerConnectionPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Server Connection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Permissions
-- Item: spUpdateMCPServerConnectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPServerConnectionPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPServerConnectionPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerConnectionPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerConnectionPermission]
    @ID uniqueidentifier,
    @MCPServerConnectionID uniqueidentifier,
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanExecute bit,
    @CanModify bit,
    @CanViewCredentials bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerConnectionPermission]
    SET
        [MCPServerConnectionID] = @MCPServerConnectionID,
        [UserID] = @UserID,
        [RoleID] = @RoleID,
        [CanExecute] = @CanExecute,
        [CanModify] = @CanModify,
        [CanViewCredentials] = @CanViewCredentials
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPServerConnectionPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPServerConnectionPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerConnectionPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPServerConnectionPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPServerConnectionPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPServerConnectionPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPServerConnectionPermission
ON [${flyway:defaultSchema}].[MCPServerConnectionPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerConnectionPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPServerConnectionPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: MCP Server Connection Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerConnectionPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Server Connection Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connection Permissions
-- Item: spDeleteMCPServerConnectionPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerConnectionPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPServerConnectionPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerConnectionPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerConnectionPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPServerConnectionPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerConnectionPermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: MCP Server Connection Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerConnectionPermission] TO [cdp_Integration]



/* Base View SQL for MJ: MCP Server Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connections
-- Item: vwMCPServerConnections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Server Connections
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPServerConnection
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPServerConnections]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPServerConnections];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPServerConnections]
AS
SELECT
    m.*,
    MCPServer_MCPServerID.[Name] AS [MCPServer],
    Credential_CredentialID.[Name] AS [Credential],
    Company_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[MCPServerConnection] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MCPServer] AS MCPServer_MCPServerID
  ON
    [m].[MCPServerID] = MCPServer_MCPServerID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS Credential_CredentialID
  ON
    [m].[CredentialID] = Credential_CredentialID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Company] AS Company_CompanyID
  ON
    [m].[CompanyID] = Company_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerConnections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: MCP Server Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connections
-- Item: Permissions for vwMCPServerConnections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerConnections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Server Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connections
-- Item: spCreateMCPServerConnection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPServerConnection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPServerConnection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerConnection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerConnection]
    @ID uniqueidentifier = NULL,
    @MCPServerID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @CustomHeaderName nvarchar(100),
    @CompanyID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @AutoSyncTools bit = NULL,
    @AutoGenerateActions bit = NULL,
    @LogToolCalls bit = NULL,
    @LogInputParameters bit = NULL,
    @LogOutputContent bit = NULL,
    @MaxOutputLogSize int,
    @LastConnectedAt datetimeoffset,
    @LastErrorMessage nvarchar(MAX),
    @EnvironmentVars nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPServerConnection]
            (
                [ID],
                [MCPServerID],
                [Name],
                [Description],
                [CredentialID],
                [CustomHeaderName],
                [CompanyID],
                [Status],
                [AutoSyncTools],
                [AutoGenerateActions],
                [LogToolCalls],
                [LogInputParameters],
                [LogOutputContent],
                [MaxOutputLogSize],
                [LastConnectedAt],
                [LastErrorMessage],
                [EnvironmentVars]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerID,
                @Name,
                @Description,
                @CredentialID,
                @CustomHeaderName,
                @CompanyID,
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoSyncTools, 1),
                ISNULL(@AutoGenerateActions, 0),
                ISNULL(@LogToolCalls, 1),
                ISNULL(@LogInputParameters, 1),
                ISNULL(@LogOutputContent, 1),
                @MaxOutputLogSize,
                @LastConnectedAt,
                @LastErrorMessage,
                @EnvironmentVars
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPServerConnection]
            (
                [MCPServerID],
                [Name],
                [Description],
                [CredentialID],
                [CustomHeaderName],
                [CompanyID],
                [Status],
                [AutoSyncTools],
                [AutoGenerateActions],
                [LogToolCalls],
                [LogInputParameters],
                [LogOutputContent],
                [MaxOutputLogSize],
                [LastConnectedAt],
                [LastErrorMessage],
                [EnvironmentVars]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerID,
                @Name,
                @Description,
                @CredentialID,
                @CustomHeaderName,
                @CompanyID,
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoSyncTools, 1),
                ISNULL(@AutoGenerateActions, 0),
                ISNULL(@LogToolCalls, 1),
                ISNULL(@LogInputParameters, 1),
                ISNULL(@LogOutputContent, 1),
                @MaxOutputLogSize,
                @LastConnectedAt,
                @LastErrorMessage,
                @EnvironmentVars
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPServerConnections] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerConnection] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: MCP Server Connections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerConnection] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Server Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connections
-- Item: spUpdateMCPServerConnection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPServerConnection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPServerConnection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerConnection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerConnection]
    @ID uniqueidentifier,
    @MCPServerID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @CustomHeaderName nvarchar(100),
    @CompanyID uniqueidentifier,
    @Status nvarchar(50),
    @AutoSyncTools bit,
    @AutoGenerateActions bit,
    @LogToolCalls bit,
    @LogInputParameters bit,
    @LogOutputContent bit,
    @MaxOutputLogSize int,
    @LastConnectedAt datetimeoffset,
    @LastErrorMessage nvarchar(MAX),
    @EnvironmentVars nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerConnection]
    SET
        [MCPServerID] = @MCPServerID,
        [Name] = @Name,
        [Description] = @Description,
        [CredentialID] = @CredentialID,
        [CustomHeaderName] = @CustomHeaderName,
        [CompanyID] = @CompanyID,
        [Status] = @Status,
        [AutoSyncTools] = @AutoSyncTools,
        [AutoGenerateActions] = @AutoGenerateActions,
        [LogToolCalls] = @LogToolCalls,
        [LogInputParameters] = @LogInputParameters,
        [LogOutputContent] = @LogOutputContent,
        [MaxOutputLogSize] = @MaxOutputLogSize,
        [LastConnectedAt] = @LastConnectedAt,
        [LastErrorMessage] = @LastErrorMessage,
        [EnvironmentVars] = @EnvironmentVars
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPServerConnections] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPServerConnections]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerConnection] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPServerConnection table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPServerConnection]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPServerConnection];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPServerConnection
ON [${flyway:defaultSchema}].[MCPServerConnection]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerConnection]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPServerConnection] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: MCP Server Connections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerConnection] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Server Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Connections
-- Item: spDeleteMCPServerConnection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerConnection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPServerConnection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerConnection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerConnection]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPServerConnection]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerConnection] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: MCP Server Connections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerConnection] TO [cdp_Integration]



/* Base View SQL for MJ: MCP Server Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Tools
-- Item: vwMCPServerTools
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Server Tools
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPServerTool
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPServerTools]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPServerTools];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPServerTools]
AS
SELECT
    m.*,
    MCPServer_MCPServerID.[Name] AS [MCPServer],
    Action_GeneratedActionID.[Name] AS [GeneratedAction],
    ActionCategory_GeneratedActionCategoryID.[Name] AS [GeneratedActionCategory]
FROM
    [${flyway:defaultSchema}].[MCPServerTool] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MCPServer] AS MCPServer_MCPServerID
  ON
    [m].[MCPServerID] = MCPServer_MCPServerID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_GeneratedActionID
  ON
    [m].[GeneratedActionID] = Action_GeneratedActionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ActionCategory] AS ActionCategory_GeneratedActionCategoryID
  ON
    [m].[GeneratedActionCategoryID] = ActionCategory_GeneratedActionCategoryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerTools] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: MCP Server Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Tools
-- Item: Permissions for vwMCPServerTools
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPServerTools] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Server Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Tools
-- Item: spCreateMCPServerTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPServerTool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPServerTool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerTool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPServerTool]
    @ID uniqueidentifier = NULL,
    @MCPServerID uniqueidentifier,
    @ToolName nvarchar(255),
    @ToolTitle nvarchar(255),
    @ToolDescription nvarchar(MAX),
    @InputSchema nvarchar(MAX),
    @OutputSchema nvarchar(MAX),
    @Annotations nvarchar(MAX),
    @Status nvarchar(50) = NULL,
    @DiscoveredAt datetimeoffset = NULL,
    @LastSeenAt datetimeoffset = NULL,
    @GeneratedActionID uniqueidentifier,
    @GeneratedActionCategoryID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPServerTool]
            (
                [ID],
                [MCPServerID],
                [ToolName],
                [ToolTitle],
                [ToolDescription],
                [InputSchema],
                [OutputSchema],
                [Annotations],
                [Status],
                [DiscoveredAt],
                [LastSeenAt],
                [GeneratedActionID],
                [GeneratedActionCategoryID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerID,
                @ToolName,
                @ToolTitle,
                @ToolDescription,
                @InputSchema,
                @OutputSchema,
                @Annotations,
                ISNULL(@Status, 'Active'),
                ISNULL(@DiscoveredAt, getutcdate()),
                ISNULL(@LastSeenAt, getutcdate()),
                @GeneratedActionID,
                @GeneratedActionCategoryID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPServerTool]
            (
                [MCPServerID],
                [ToolName],
                [ToolTitle],
                [ToolDescription],
                [InputSchema],
                [OutputSchema],
                [Annotations],
                [Status],
                [DiscoveredAt],
                [LastSeenAt],
                [GeneratedActionID],
                [GeneratedActionCategoryID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerID,
                @ToolName,
                @ToolTitle,
                @ToolDescription,
                @InputSchema,
                @OutputSchema,
                @Annotations,
                ISNULL(@Status, 'Active'),
                ISNULL(@DiscoveredAt, getutcdate()),
                ISNULL(@LastSeenAt, getutcdate()),
                @GeneratedActionID,
                @GeneratedActionCategoryID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPServerTools] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerTool] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: MCP Server Tools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPServerTool] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Server Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Tools
-- Item: spUpdateMCPServerTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPServerTool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPServerTool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerTool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPServerTool]
    @ID uniqueidentifier,
    @MCPServerID uniqueidentifier,
    @ToolName nvarchar(255),
    @ToolTitle nvarchar(255),
    @ToolDescription nvarchar(MAX),
    @InputSchema nvarchar(MAX),
    @OutputSchema nvarchar(MAX),
    @Annotations nvarchar(MAX),
    @Status nvarchar(50),
    @DiscoveredAt datetimeoffset,
    @LastSeenAt datetimeoffset,
    @GeneratedActionID uniqueidentifier,
    @GeneratedActionCategoryID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerTool]
    SET
        [MCPServerID] = @MCPServerID,
        [ToolName] = @ToolName,
        [ToolTitle] = @ToolTitle,
        [ToolDescription] = @ToolDescription,
        [InputSchema] = @InputSchema,
        [OutputSchema] = @OutputSchema,
        [Annotations] = @Annotations,
        [Status] = @Status,
        [DiscoveredAt] = @DiscoveredAt,
        [LastSeenAt] = @LastSeenAt,
        [GeneratedActionID] = @GeneratedActionID,
        [GeneratedActionCategoryID] = @GeneratedActionCategoryID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPServerTools] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPServerTools]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerTool] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPServerTool table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPServerTool]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPServerTool];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPServerTool
ON [${flyway:defaultSchema}].[MCPServerTool]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPServerTool]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPServerTool] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: MCP Server Tools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPServerTool] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Server Tools */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Server Tools
-- Item: spDeleteMCPServerTool
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPServerTool
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPServerTool]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerTool];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPServerTool]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPServerTool]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerTool] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: MCP Server Tools */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPServerTool] TO [cdp_Integration]



/* Index for Foreign Keys for MCPToolExecutionLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MCPServerConnectionID in table MCPToolExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPToolExecutionLog_MCPServerConnectionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPToolExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPToolExecutionLog_MCPServerConnectionID ON [${flyway:defaultSchema}].[MCPToolExecutionLog] ([MCPServerConnectionID]);

-- Index for foreign key MCPServerToolID in table MCPToolExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPToolExecutionLog_MCPServerToolID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPToolExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPToolExecutionLog_MCPServerToolID ON [${flyway:defaultSchema}].[MCPToolExecutionLog] ([MCPServerToolID]);

-- Index for foreign key UserID in table MCPToolExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MCPToolExecutionLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MCPToolExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MCPToolExecutionLog_UserID ON [${flyway:defaultSchema}].[MCPToolExecutionLog] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID F402BB2F-2BDB-458A-BA98-58C95C41FE03 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F402BB2F-2BDB-458A-BA98-58C95C41FE03',
         @RelatedEntityNameFieldMap='MCPServerConnection'

/* SQL text to update entity field related entity name field map for entity field ID 68CB9A34-65C2-4546-ABAE-1A616D5F93A6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='68CB9A34-65C2-4546-ABAE-1A616D5F93A6',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: vwMCPToolExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Tool Execution Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MCPToolExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMCPToolExecutionLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMCPToolExecutionLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMCPToolExecutionLogs]
AS
SELECT
    m.*,
    MCPServerConnection_MCPServerConnectionID.[Name] AS [MCPServerConnection],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[MCPToolExecutionLog] AS m
INNER JOIN
    [${flyway:defaultSchema}].[MCPServerConnection] AS MCPServerConnection_MCPServerConnectionID
  ON
    [m].[MCPServerConnectionID] = MCPServerConnection_MCPServerConnectionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [m].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPToolExecutionLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: Permissions for vwMCPToolExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMCPToolExecutionLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: spCreateMCPToolExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPToolExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPToolExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog]
    @ID uniqueidentifier = NULL,
    @MCPServerConnectionID uniqueidentifier,
    @MCPServerToolID uniqueidentifier,
    @ToolName nvarchar(255),
    @UserID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt datetimeoffset,
    @DurationMs int,
    @Success bit = NULL,
    @ErrorMessage nvarchar(MAX),
    @InputParameters nvarchar(MAX),
    @OutputContent nvarchar(MAX),
    @OutputTruncated bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPToolExecutionLog]
            (
                [ID],
                [MCPServerConnectionID],
                [MCPServerToolID],
                [ToolName],
                [UserID],
                [StartedAt],
                [EndedAt],
                [DurationMs],
                [Success],
                [ErrorMessage],
                [InputParameters],
                [OutputContent],
                [OutputTruncated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerConnectionID,
                @MCPServerToolID,
                @ToolName,
                @UserID,
                ISNULL(@StartedAt, getutcdate()),
                @EndedAt,
                @DurationMs,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @InputParameters,
                @OutputContent,
                ISNULL(@OutputTruncated, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPToolExecutionLog]
            (
                [MCPServerConnectionID],
                [MCPServerToolID],
                [ToolName],
                [UserID],
                [StartedAt],
                [EndedAt],
                [DurationMs],
                [Success],
                [ErrorMessage],
                [InputParameters],
                [OutputContent],
                [OutputTruncated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerConnectionID,
                @MCPServerToolID,
                @ToolName,
                @UserID,
                ISNULL(@StartedAt, getutcdate()),
                @EndedAt,
                @DurationMs,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @InputParameters,
                @OutputContent,
                ISNULL(@OutputTruncated, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMCPToolExecutionLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: MCP Tool Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: spUpdateMCPToolExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPToolExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog]
    @ID uniqueidentifier,
    @MCPServerConnectionID uniqueidentifier,
    @MCPServerToolID uniqueidentifier,
    @ToolName nvarchar(255),
    @UserID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @DurationMs int,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @InputParameters nvarchar(MAX),
    @OutputContent nvarchar(MAX),
    @OutputTruncated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPToolExecutionLog]
    SET
        [MCPServerConnectionID] = @MCPServerConnectionID,
        [MCPServerToolID] = @MCPServerToolID,
        [ToolName] = @ToolName,
        [UserID] = @UserID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [DurationMs] = @DurationMs,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [InputParameters] = @InputParameters,
        [OutputContent] = @OutputContent,
        [OutputTruncated] = @OutputTruncated
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMCPToolExecutionLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMCPToolExecutionLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPToolExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPToolExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPToolExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPToolExecutionLog
ON [${flyway:defaultSchema}].[MCPToolExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPToolExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPToolExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: MCP Tool Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: spDeleteMCPToolExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MCPToolExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMCPToolExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPToolExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMCPToolExecutionLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MCPToolExecutionLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPToolExecutionLog] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: MCP Tool Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMCPToolExecutionLog] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dfa67ce0-b4dc-4327-b7c3-5e4ce5a88817'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MCPServerConnection')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dfa67ce0-b4dc-4327-b7c3-5e4ce5a88817',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100017,
            'MCPServerConnection',
            'MCP Server Connection',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3fda7d76-2b2c-4585-b6e3-6ba03b1bbd36'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'MCPServerConnection')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3fda7d76-2b2c-4585-b6e3-6ba03b1bbd36',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100019,
            'MCPServerConnection',
            'MCP Server Connection',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4703d5e8-4b4e-41ed-8e6d-5da5ae79f7a3'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4703d5e8-4b4e-41ed-8e6d-5da5ae79f7a3',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100020,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd6f8fbc7-bdf7-4dcc-a9e2-74bdecf943d8'  OR 
               (EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12' AND Name = 'Role')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd6f8fbc7-bdf7-4dcc-a9e2-74bdecf943d8',
            'B931BF66-BB79-4E82-8324-5BE7C1D65E12', -- Entity: MJ: MCP Server Connection Permissions
            100021,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e529cef6-0821-4557-9839-e8027f41e2b4'  OR 
               (EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206' AND Name = 'CredentialType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e529cef6-0821-4557-9839-e8027f41e2b4',
            'A159B8C9-4941-4AD3-9FC3-A9BC07299206', -- Entity: MJ: MCP Servers
            100039,
            'CredentialType',
            'Credential Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5775abe3-b2a0-481d-abf1-d9cdae02a47c'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'MCPServer')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5775abe3-b2a0-481d-abf1-d9cdae02a47c',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100039,
            'MCPServer',
            'MCP Server',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd531c558-1373-4ee6-9e95-b23ce1874e39'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'Credential')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd531c558-1373-4ee6-9e95-b23ce1874e39',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100040,
            'Credential',
            'Credential',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '329b7d4a-90d1-448b-b038-06336ef17430'  OR 
               (EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E' AND Name = 'Company')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '329b7d4a-90d1-448b-b038-06336ef17430',
            '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', -- Entity: MJ: MCP Server Connections
            100041,
            'Company',
            'Company',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6053fb8c-5f7a-4579-b8d1-5c046fb17627'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'MCPServerConnection')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6053fb8c-5f7a-4579-b8d1-5c046fb17627',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100031,
            'MCPServerConnection',
            'MCP Server Connection',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5ebb437a-0705-4143-81da-cc23587916fc'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5ebb437a-0705-4143-81da-cc23587916fc',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100032,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e343ca91-5526-45a5-bef1-df2b68bf41f5'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'MCPServer')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e343ca91-5526-45a5-bef1-df2b68bf41f5',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100031,
            'MCPServer',
            'MCP Server',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0b15eced-2a1d-45b8-b103-2d43be396849'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'GeneratedAction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0b15eced-2a1d-45b8-b103-2d43be396849',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100032,
            'GeneratedAction',
            'Generated Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'aa504696-4a97-4671-8d29-4b02f61aab5a'  OR 
               (EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D' AND Name = 'GeneratedActionCategory')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aa504696-4a97-4671-8d29-4b02f61aab5a',
            '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', -- Entity: MJ: MCP Server Tools
            100033,
            'GeneratedActionCategory',
            'Generated Action Category',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3FDA7D76-2B2C-4585-B6E3-6BA03B1BBD36'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '704FD670-D984-47E0-B07C-EC7C1C35BF63'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A9896AF6-BB5A-47E7-B2DC-1DCDA391DE05'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '66FB1461-11B2-494D-99D6-92060A43DF68'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3FDA7D76-2B2C-4585-B6E3-6BA03B1BBD36'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4703D5E8-4B4E-41ED-8E6D-5DA5AE79F7A3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D6F8FBC7-BDF7-4DCC-A9E2-74BDECF943D8'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3FDA7D76-2B2C-4585-B6E3-6BA03B1BBD36'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4703D5E8-4B4E-41ED-8E6D-5DA5AE79F7A3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D6F8FBC7-BDF7-4DCC-A9E2-74BDECF943D8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B6D4666E-88CF-4334-A7F5-8A24D1B9C726'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2351D1C2-DBCE-4695-85A9-364D6B76021C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B6D4666E-88CF-4334-A7F5-8A24D1B9C726'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C411E387-34B6-474E-94E1-9D8D72851057'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '28A27E5E-356D-4869-B95F-FC26C51B9E40'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E343CA91-5526-45A5-BEF1-DF2B68BF41F5'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2351D1C2-DBCE-4695-85A9-364D6B76021C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B6D4666E-88CF-4334-A7F5-8A24D1B9C726'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E343CA91-5526-45A5-BEF1-DF2B68BF41F5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5C3060FB-4452-49AB-9676-B04D70984EBF'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C3060FB-4452-49AB-9676-B04D70984EBF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '186B11DF-17C4-42D6-B2F6-E43487676CBB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0D0BE912-9199-454D-9B38-EF8D9BC263EB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5775ABE3-B2A0-481D-ABF1-D9CDAE02A47C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '329B7D4A-90D1-448B-B038-06336EF17430'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5C3060FB-4452-49AB-9676-B04D70984EBF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '186B11DF-17C4-42D6-B2F6-E43487676CBB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5775ABE3-B2A0-481D-ABF1-D9CDAE02A47C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D531C558-1373-4EE6-9E95-B23CE1874E39'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '329B7D4A-90D1-448B-B038-06336EF17430'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '0D982BDE-F324-45C4-BE0C-898B53CA7E53'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0D982BDE-F324-45C4-BE0C-898B53CA7E53'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4F931F86-FC44-4F1C-A700-9A4C45F74960'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3E0736E5-ECBF-4DD8-9182-00693CC1F542'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '92328D0C-DEB5-4094-B8ED-A282D3698060'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E529CEF6-0821-4557-9839-E8027F41E2B4'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0D982BDE-F324-45C4-BE0C-898B53CA7E53'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '75AD081E-A48A-4A80-8AFB-875CE466EF93'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4F931F86-FC44-4F1C-A700-9A4C45F74960'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3E0736E5-ECBF-4DD8-9182-00693CC1F542'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '92328D0C-DEB5-4094-B8ED-A282D3698060'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E529CEF6-0821-4557-9839-E8027F41E2B4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F18738F-3969-47DF-8901-F13919233D4E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '16E4D9EC-B0CE-40A4-981B-C862FD079D2D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9DE772AB-BC37-478C-81B2-C0A725AEC6EF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Permissions',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3EC5281C-A01C-48B5-AA60-0B17622937D3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Permissions',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3FDA7D76-2B2C-4585-B6E3-6BA03B1BBD36'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Permissions',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Execute',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '704FD670-D984-47E0-B07C-EC7C1C35BF63'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Permissions',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Modify',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A9896AF6-BB5A-47E7-B2DC-1DCDA391DE05'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Permissions',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can View Credentials',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '66FB1461-11B2-494D-99D6-92060A43DF68'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8C012FA3-94CA-46F8-8AFF-370DE8A61FA5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4703D5E8-4B4E-41ED-8E6D-5DA5AE79F7A3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '638BD3A9-EE28-4ABF-A9E0-53A0A33EEF29'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D6F8FBC7-BDF7-4DCC-A9E2-74BDECF943D8'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-server */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-server',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6a1db781-2942-4df7-8580-ca195f4bd000', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12', 'FieldCategoryInfo', '{"Connection Permissions":{"icon":"fa fa-lock","description":"Defines the MCP server connection and the actions allowed for the assigned entity."},"Access Assignment":{"icon":"fa fa-user","description":"Specifies which user or role the permission set applies to."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking record creation and modification."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('84c2508c-c5b9-4608-aeef-33f559bc3a04', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12', 'FieldCategoryIcons', '{"Connection Permissions":"fa fa-lock","Access Assignment":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'B931BF66-BB79-4E82-8324-5BE7C1D65E12'
         

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B0E0446-427C-4BF0-8562-5152265CFE1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B5EE3D38-8573-4170-BEE5-A3EF5D51DD4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '019FFEE0-0763-48E0-9862-D429A4CDAB3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Input Values',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B114689E-036B-428F-B179-0B68371CF237'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Calls Per Minute',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3DC2DCEC-6F1E-421A-BE51-578F7D2F091E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95E2B969-4F03-4EFE-B519-D6DAC1272C3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Connection Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-cogs */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-cogs',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7f4b3d56-936e-469b-84ed-bde468034a05', 'A75F1DD8-2146-4D03-AA7F-50D048E44D11', 'FieldCategoryInfo', '{"Connection Mapping":{"icon":"fa fa-link","description":"Links server connections to specific tools and includes connection identifiers"},"Execution Settings":{"icon":"fa fa-sliders-h","description":"Controls enablement, rate limits, and default input values for each tool"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5c0f2b86-505b-43ec-b1fd-49971bd40d3d', 'A75F1DD8-2146-4D03-AA7F-50D048E44D11', 'FieldCategoryIcons', '{"Connection Mapping":"fa fa-link","Execution Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11'
         

/* Set categories for 20 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '976D3C56-9F84-464B-BF4F-42390DEA0E0A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5FC268A7-AD61-4576-B647-9CF7C3326F23'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '393D3B2E-4DA2-4B87-A2D5-A18409D50049'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Server Identification & Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D982BDE-F324-45C4-BE0C-898B53CA7E53'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Server Identification & Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD1C5ADA-E7BD-4CF4-A6BA-124A7A5FCAD5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Server Identification & Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A0A92790-FA38-42C6-9DBF-631728FF340C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Server Identification & Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Documentation URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '0E281E3B-B4C2-4EA9-8B6F-CAEB080B8EEB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '75AD081E-A48A-4A80-8AFB-875CE466EF93'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Transport Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4F931F86-FC44-4F1C-A700-9A4C45F74960'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Command',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E4325737-D49D-44D8-A1E3-8562F6BD8636'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Command Arguments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C2A5582-FE06-4CCA-8946-642B57717FCA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection Timeout (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B1D48731-DDA2-4DDD-BEBE-92DFE2A75C78'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Request Timeout (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '97DB2C2E-EC6B-4393-BFA9-ED8A57EC8FF5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authentication & Credentials',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Auth Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E0736E5-ECBF-4DD8-9182-00693CC1F542'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authentication & Credentials',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D747DC2-AEB7-4B53-8548-D0D398A4FD98'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authentication & Credentials',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E529CEF6-0821-4557-9839-E8027F41E2B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Limits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '92328D0C-DEB5-4094-B8ED-A282D3698060'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Limits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Sync At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB080321-31C3-40D3-BADD-D75F72B39893'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Limits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rate Limit Per Minute',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF80C789-9A03-4B4C-9AFE-DB0F17CA895E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Performance & Limits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rate Limit Per Hour',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '57385732-769F-4B72-9B97-5340F0A1A361'
   AND AutoUpdateCategory = 1

/* Set categories for 22 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C3060FB-4452-49AB-9676-B04D70984EBF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B7B1708-0D1F-4709-B7EE-590F767FF00F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5775ABE3-B2A0-481D-ABF1-D9CDAE02A47C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Custom Header Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D268066-6033-4E98-9301-7730E4D9411F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Environment Variables',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84963B3B-AFAB-4439-A157-AD92E789CB5F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D531C558-1373-4EE6-9E95-B23CE1874E39'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '329B7D4A-90D1-448B-B038-06336EF17430'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Automation Controls',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '186B11DF-17C4-42D6-B2F6-E43487676CBB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Automation Controls',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Sync Tools',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '75E1303B-7259-424A-91B0-9B0E61EF79AF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Automation Controls',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Generate Actions',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24AFD7B6-E8A0-4382-BA9B-7FAC3524926B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Logging & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Log Tool Calls',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F1D2D0B-C3EB-404B-8897-0CA88AEA71F4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Logging & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Log Input Parameters',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ABA1E592-3EBF-410C-8570-8151F625DB0B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Logging & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Log Output Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7597C16-071C-492A-ABEB-2E995294E19E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Logging & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Output Log Size',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C95BB71F-E892-46A2-8391-90DA9DE7467B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Logging & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Connected At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D0BE912-9199-454D-9B38-EF8D9BC263EB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Logging & Diagnostics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '987CA39C-8B2C-4514-978D-E82D28443D73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E03C4ED-7241-45F5-A137-804A3587AE97'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A6FB5009-4AD9-46E3-B065-89C65C960ECA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3E4CD06-8DBA-4B1A-8F2A-34C2CCB97005'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C132D9A-5241-47D6-A57D-67A398D20D80'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA1449B1-8C00-47C8-BEA2-6AC5D3577D93'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A9C55B4E-F9F7-462B-8A5C-4057EE1CB045'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-server */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-server',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206'
               

/* Set entity icon to fa fa-server */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-server',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('854a8e22-9843-479e-a4d4-766a133e7190', 'A159B8C9-4941-4AD3-9FC3-A9BC07299206', 'FieldCategoryInfo', '{"Server Identification & Details":{"icon":"fa fa-server","description":"Core descriptive information about the server, including name, description, icon, and documentation link."},"Connection Settings":{"icon":"fa fa-plug","description":"Configuration for how the system connects to the server, covering URL, transport, command paths, and timeout values."},"Authentication & Credentials":{"icon":"fa fa-lock","description":"Authentication method and credential type required to access the server."},"Performance & Limits":{"icon":"fa fa-tachometer-alt","description":"Operational limits and status indicators such as rate limits, sync timestamps, and overall server status."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('03063023-a60f-4952-b721-29fce85f7d1d', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'FieldCategoryInfo', '{"Connection Settings":{"icon":"fa fa-plug","description":"Core configuration of the MCP connection, including name, server address, credentials, and environment variables."},"Automation Controls":{"icon":"fa fa-robot","description":"Settings that control automatic synchronization and action generation for the connection."},"Logging & Diagnostics":{"icon":"fa fa-file-alt","description":"Options and information for logging tool activity, parameters, output, and connection health."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields such as IDs and timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('2e06ef5f-687a-4c34-9bc2-5b22d4deed75', 'A159B8C9-4941-4AD3-9FC3-A9BC07299206', 'FieldCategoryIcons', '{"Server Identification & Details":"fa fa-server","Connection Settings":"fa fa-plug","Authentication & Credentials":"fa fa-lock","Performance & Limits":"fa fa-tachometer-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'A159B8C9-4941-4AD3-9FC3-A9BC07299206'
         

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('896bd278-ceba-402c-bd22-21052a1abe7b', '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E', 'FieldCategoryIcons', '{"Connection Settings":"fa fa-plug","Automation Controls":"fa fa-robot","Logging & Diagnostics":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '3C4E0E5F-5FF1-4918-9A28-CF21E48E532E'
         

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2351D1C2-DBCE-4695-85A9-364D6B76021C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B6D4666E-88CF-4334-A7F5-8A24D1B9C726'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E207FA54-4FCC-415F-972C-D5AED4E69D8E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C411E387-34B6-474E-94E1-9D8D72851057'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Discovered At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E8ABE8A4-8CC3-4AD2-BC67-FE7B437971E9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Seen At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '28A27E5E-356D-4869-B95F-FC26C51B9E40'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1A12EE15-94AF-4A78-94A0-FC44FDDB4B5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tool Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E343CA91-5526-45A5-BEF1-DF2B68BF41F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schemas & Annotations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Schema',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '484A1F30-83F9-4DB1-BD9A-D45AB5526AA9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schemas & Annotations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Schema',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA252449-EAA9-4F4A-8F30-003CC544DF1D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schemas & Annotations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Annotations',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95696A5A-E259-44DC-A3AA-0DA7AEBBB185'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Automation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Generated Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '06795DD7-5C53-4315-93CD-0D47C41259B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Automation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Generated Action Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '578077C8-A12D-43BF-8B26-880697C6635E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Automation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Generated Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B15ECED-2A1D-45B8-B103-2D43BE396849'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Automation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Generated Action Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA504696-4A97-4671-8D29-4B02F61AAB5A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '39E392BA-EDE6-4027-800C-F1134267B78F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5840B03B-1E9A-40E9-B04A-12604191458D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA5547B8-7B2E-48EE-9494-EB0B4DF29959'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-server */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-server',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c5bb9e22-5f6f-484c-ad00-2bc7a5060b87', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'FieldCategoryInfo', '{"Tool Overview":{"icon":"fa fa-tools","description":"Core identification, status, server association and activity timestamps for the MCP tool."},"Schemas & Annotations":{"icon":"fa fa-code","description":"JSON schemas defining tool inputs/outputs and additional annotation hints."},"Automation":{"icon":"fa fa-robot","description":"Configuration linking the tool to generated actions and their categories."},"System Metadata":{"icon":"fa fa-cog","description":"Audit fields and primary identifier managed by the system."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('73fe029c-461d-464c-a178-d74330df86d6', '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D', 'FieldCategoryIcons', '{"Tool Overview":"fa fa-tools","Schemas & Annotations":"fa fa-code","Automation":"fa fa-robot","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '36ECEE63-1EDD-4BF0-8EF1-DCFDF2794F4D'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B26460B-B434-41E8-98D6-6E8973A1998F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F402BB2F-2BDB-458A-BA98-58C95C41FE03'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9BEF8A97-4002-4707-A73C-2A679ACE8F96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Connection Details',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68CB9A34-65C2-4546-ABAE-1A616D5F93A6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B8A92DB-CFF9-400D-B88F-41131C0480C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Truncated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0BE70A8-D2E8-46A6-B746-57528E095F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Parameters',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C584FB9F-D0A0-48D8-9E0E-DAB449769F44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F92F2ED5-628E-4222-B66C-F5B4139F3309'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CEF515F8-77D6-4981-9F31-378ED7BAF0A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '78A09C32-7FE6-408A-862A-71BD7E0042F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73C2B5A4-9F4F-4195-9794-BCE839DB8B70'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-history */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-history',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3bf0917b-cd2f-4d77-943e-3ba432c0704d', 'BA51038B-121F-48DC-8B9B-D75E61FD91CA', 'FieldCategoryInfo', '{"Execution Details":{"icon":"fa fa-tachometer-alt","description":"Core information about the execution timing, outcome, and tool used."},"Connection Context":{"icon":"fa fa-plug","description":"Details of the server connection and tool identifiers involved in the execution."},"User Context":{"icon":"fa fa-user","description":"Information about the user who initiated the tool execution."},"Payload & Errors":{"icon":"fa fa-file-alt","description":"Logged input parameters, output data, and any error messages from the execution."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields such as IDs and timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('51a4a367-06ef-4b73-b12a-68c975484961', 'BA51038B-121F-48DC-8B9B-D75E61FD91CA', 'FieldCategoryIcons', '{"Execution Details":"fa fa-tachometer-alt","Connection Context":"fa fa-plug","User Context":"fa fa-user","Payload & Errors":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA'
         

/* Generated Validation Functions for MJ: MCP Server Connection Permissions */
-- CHECK constraint for MJ: MCP Server Connection Permissions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([UserID] IS NOT NULL AND [RoleID] IS NULL OR [UserID] IS NULL AND [RoleID] IS NOT NULL)', 'public ValidateUserIDOrRoleIDExclusive(result: ValidationResult) {
	// Ensure that exactly one of UserID or RoleID is set
	if ((this.UserID != null && this.RoleID != null) || (this.UserID == null && this.RoleID == null)) {
		result.Errors.push(new ValidationErrorInfo(
			"UserID",
			"Either a specific user or a role must be assigned, but not both and not neither.",
			this.UserID,
			ValidationErrorType.Failure
		));
	}
}', 'Either a specific user or a role must be assigned to the permission record, but you cannot assign both at the same time and you cannot leave both empty. This ensures that each permission is linked to exactly one entity, maintaining clear ownership and preventing ambiguous access settings.', 'ValidateUserIDOrRoleIDExclusive', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B931BF66-BB79-4E82-8324-5BE7C1D65E12');
  
            

/* Generated Validation Functions for Enrollments */
-- CHECK constraint for Enrollments: Field: ProgressPercentage was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([ProgressPercentage]>=(0) AND [ProgressPercentage]<=(100))', 'public ValidateProgressPercentageRange(result: ValidationResult) {
	// ProgressPercentage is optional; only validate when a value is provided
	if (this.ProgressPercentage != null && (this.ProgressPercentage < 0 || this.ProgressPercentage > 100)) {
		result.Errors.push(new ValidationErrorInfo(
			"ProgressPercentage",
			"Progress percentage must be between 0 and 100.",
			this.ProgressPercentage,
			ValidationErrorType.Failure
		));
	}
}', 'Progress percentage must be a value between 0 and 100 inclusive whenever it is recorded. This ensures that progress tracking stays within the valid percentage range and prevents impossible or out‑of‑range values.', 'ValidateProgressPercentageRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'DC916596-FB29-4191-AF04-08B9D1D63B91');
  
            

/* Generated Validation Functions for Resource Ratings */
-- CHECK constraint for Resource Ratings: Field: Rating was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([Rating]>=(1) AND [Rating]<=(5))', 'public ValidateRatingRange(result: ValidationResult) {
	// Rating must be between 1 and 5 inclusive
	if (this.Rating < 1 || this.Rating > 5) {
		result.Errors.push(new ValidationErrorInfo(
			"Rating",
			"Rating must be between 1 and 5.",
			this.Rating,
			ValidationErrorType.Failure
		));
	}
}', 'Rating must be a whole number between 1 and 5. This ensures that every review records a valid rating within the allowed scale and prevents out‑of‑range values from being stored.', 'ValidateRatingRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '56F73213-B919-4FAD-ACEE-E035C0A2C6B4');
  
            











































-- CODE GEN RUN 2
/* SQL text to update entity field related entity name field map for entity field ID 019FFEE0-0763-48E0-9862-D429A4CDAB3C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='019FFEE0-0763-48E0-9862-D429A4CDAB3C',
         @RelatedEntityNameFieldMap='MCPServerTool'

/* SQL text to update entity field related entity name field map for entity field ID 9BEF8A97-4002-4707-A73C-2A679ACE8F96 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9BEF8A97-4002-4707-A73C-2A679ACE8F96',
         @RelatedEntityNameFieldMap='MCPServerTool'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '64d8566b-1850-4328-9e8f-cab6c4cad99f'  OR 
               (EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'MCPServerTool')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64d8566b-1850-4328-9e8f-cab6c4cad99f',
            'A75F1DD8-2146-4D03-AA7F-50D048E44D11', -- Entity: MJ: MCP Server Connection Tools
            100019,
            'MCPServerTool',
            'MCP Server Tool',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3c9fcc5c-7d1b-4b6d-88ca-9632e5d32b1f'  OR 
               (EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'MCPServerTool')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3c9fcc5c-7d1b-4b6d-88ca-9632e5d32b1f',
            'BA51038B-121F-48DC-8B9B-D75E61FD91CA', -- Entity: MJ: MCP Tool Execution Logs
            100034,
            'MCPServerTool',
            'MCP Server Tool',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9E6007C4-587D-4744-A802-A34BDEB52848'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4BDDB437-47AD-4713-9E82-EDF2D24E21BF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8B1D0961-5D50-4B99-969B-752BA62F2C51'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A98DD546-4FC7-4A41-A80D-F172889BAA65'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E049578E-A22B-47B6-A6D1-42BA38873ABE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9E6007C4-587D-4744-A802-A34BDEB52848'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E049578E-A22B-47B6-A6D1-42BA38873ABE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '08B13346-A70C-43CA-AF79-2ABEBAD87B13'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9E6007C4-587D-4744-A802-A34BDEB52848'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64D8566B-1850-4328-9E8F-CAB6C4CAD99F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '64D8566B-1850-4328-9E8F-CAB6C4CAD99F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '7C88DF30-0510-4880-8527-91F61899D047'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7C88DF30-0510-4880-8527-91F61899D047'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3B395032-5176-4D11-9D25-049EA24C819F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8FE291BD-D18B-4B0E-8A3D-43B6A317579F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A4884F56-DF96-4F00-A0E3-2898C2AD1366'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2BDE2BC6-0ECB-4A18-A9F6-62CFA3616CBF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7C88DF30-0510-4880-8527-91F61899D047'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AD488C19-966F-4D04-9108-99B3FCE3EBA5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B395032-5176-4D11-9D25-049EA24C819F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '46AFA502-59D6-40D4-9DA9-CAB6644716BC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4E11DD5E-2376-42E4-A036-6EAA6B147009'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 14 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '540488F4-1A75-483E-A869-9A774D1EB9B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renewal Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Certification',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C434186-B6C7-4FBC-BA95-69A493E6E17A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renewal Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Renewal Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BDDB437-47AD-4713-9E82-EDF2D24E21BF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renewal Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expiration Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B1D0961-5D50-4B99-969B-752BA62F2C51'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Financial Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'CE Credits Applied',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1DFD4D28-78EF-4E6D-A579-36440D155F40'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Financial Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Fee Paid',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A98DD546-4FC7-4A41-A80D-F172889BAA65'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Financial Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payment Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9CC6095E-2C5C-4393-BC67-855433A4A73C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renewal Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E049578E-A22B-47B6-A6D1-42BA38873ABE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F40CEE2-BC38-4060-867D-E6A91B19E5FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processed By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '08B13346-A70C-43CA-AF79-2ABEBAD87B13'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Processing Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processed Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F8703D2-B2FE-49C7-8519-B15784F20CA0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '890EB787-B80A-4C98-813C-703A1CE7C2B7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '293523B1-D68B-4741-8C71-10B6E4E44360'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renewal Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Certification',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E6007C4-587D-4744-A802-A34BDEB52848'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Renewal Overview":{"icon":"fa fa-calendar","description":"Key dates and status linking the renewal to its certification"},"Financial Details":{"icon":"fa fa-dollar-sign","description":"Monetary and credit information related to the renewal"},"Processing Information":{"icon":"fa fa-user-check","description":"Administrative data about who processed the renewal and any notes"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and primary identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'FB44F279-EB8A-4A7A-9840-2B769BC606D7' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Renewal Overview":"fa fa-calendar","Financial Details":"fa fa-dollar-sign","Processing Information":"fa fa-user-check","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'FB44F279-EB8A-4A7A-9840-2B769BC606D7' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B0E0446-427C-4BF0-8562-5152265CFE1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3DC2DCEC-6F1E-421A-BE51-578F7D2F091E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '95E2B969-4F03-4EFE-B519-D6DAC1272C3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B5EE3D38-8573-4170-BEE5-A3EF5D51DD4C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '019FFEE0-0763-48E0-9862-D429A4CDAB3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFA67CE0-B4DC-4327-B7C3-5E4CE5A88817'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64D8566B-1850-4328-9E8F-CAB6C4CAD99F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2431785-0203-430C-A267-6A0EEB22A4C5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Input Values',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B114689E-036B-428F-B179-0B68371CF237'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Calls Per Minute',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5D4F701-DD24-41F4-B62C-C5EFD4676B92'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Connection Mapping":{"icon":"fa fa-link","description":"Links server connections to specific tools and includes connection identifiers"},"Execution Settings":{"icon":"fa fa-sliders-h","description":"Controls enablement, rate limits, and default input values for each tool"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Connection Mapping":"fa fa-link","Execution Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'A75F1DD8-2146-4D03-AA7F-50D048E44D11' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '31209CFB-5214-493C-876D-A2E1A1B95E8A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C81C5124-B91E-4250-9178-54514904E018'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A224EBD-D1B1-4E5C-BC7E-A424102469CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant & Activity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '90C67F3A-3954-44C6-AAD9-3A74217C18B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant & Activity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Certification',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D464DFE0-39BB-4D8B-937F-EF3DA296B61C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant & Activity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C88DF30-0510-4880-8527-91F61899D047'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant & Activity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD488C19-966F-4D04-9108-99B3FCE3EBA5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant & Activity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B395032-5176-4D11-9D25-049EA24C819F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant & Activity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '46AFA502-59D6-40D4-9DA9-CAB6644716BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant & Activity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Certification Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4E11DD5E-2376-42E4-A036-6EAA6B147009'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Completion & Credits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Completion Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8FE291BD-D18B-4B0E-8A3D-43B6A317579F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Completion & Credits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credits Earned',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A4884F56-DF96-4F00-A0E3-2898C2AD1366'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Completion & Credits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credits Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E2EA45B3-AE22-449E-89A7-DA04F6829971'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Completion & Credits',
       GeneratedFormSection = 'Category',
       DisplayName = 'Hours Spent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F660C294-DD32-44C4-828C-EB0F4CD8B4F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Verification & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Verification Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '87EAF2A8-102F-47F1-B4B3-3454DE0BCD53'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Verification & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2BDE2BC6-0ECB-4A18-A9F6-62CFA3616CBF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Verification & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4ABAD2B5-E742-4282-B3F3-61146ACD1DD5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Verification & Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Document URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '27E43F50-D3F9-43BB-8BAB-FC726FA235B9'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Participant & Activity":{"icon":"fa fa-user-friends","description":"Member and activity information including who participated, the activity title, type, and provider."},"Completion & Credits":{"icon":"fa fa-calendar-check","description":"Details about when the activity was completed and the credits or hours awarded."},"Verification & Status":{"icon":"fa fa-clipboard-check","description":"Verification code, current status, notes, and document links for the education record."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and technical identifier fields."}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '18BFC1F1-74DC-4CB7-8CF9-436ECEE99ED2' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Participant & Activity":"fa fa-user-friends","Completion & Credits":"fa fa-calendar-check","Verification & Status":"fa fa-clipboard-check","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '18BFC1F1-74DC-4CB7-8CF9-436ECEE99ED2' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B26460B-B434-41E8-98D6-6E8973A1998F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F402BB2F-2BDB-458A-BA98-58C95C41FE03'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9BEF8A97-4002-4707-A73C-2A679ACE8F96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C7797AA-F939-4BC2-BBBC-0F69FA7B585E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68CB9A34-65C2-4546-ABAE-1A616D5F93A6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Started At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7F6FE9B-D064-4C71-AA91-66D1E81FCD52'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Ended At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B8A92DB-CFF9-400D-B88F-41131C0480C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32ED9C3D-9F06-49EA-8165-4C78C41128F0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Success',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A765705A-2032-49A5-8FE5-4E5B7254240B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Error Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CEF515F8-77D6-4981-9F31-378ED7BAF0A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Input Parameters',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C584FB9F-D0A0-48D8-9E0E-DAB449769F44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Errors',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F92F2ED5-628E-4222-B66C-F5B4139F3309'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Execution Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Output Truncated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0BE70A8-D2E8-46A6-B746-57528E095F81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '78A09C32-7FE6-408A-862A-71BD7E0042F7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73C2B5A4-9F4F-4195-9794-BCE839DB8B70'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Connection Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6053FB8C-5F7A-4579-B8D1-5C046FB17627'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'MCP Server Tool Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C9FCC5C-7D1B-4B6D-88CA-9632E5D32B1F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EBB437A-0705-4143-81DA-CC23587916FC'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Execution Details":{"icon":"fa fa-tachometer-alt","description":"Core information about the execution timing, outcome, and tool used."},"Connection Context":{"icon":"fa fa-plug","description":"Details of the server connection and tool identifiers involved in the execution."},"User Context":{"icon":"fa fa-user","description":"Information about the user who initiated the tool execution."},"Payload & Errors":{"icon":"fa fa-file-alt","description":"Logged input parameters, output data, and any error messages from the execution."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields such as IDs and timestamps."}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Execution Details":"fa fa-tachometer-alt","Connection Context":"fa fa-plug","User Context":"fa fa-user","Payload & Errors":"fa fa-file-alt","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'BA51038B-121F-48DC-8B9B-D75E61FD91CA' AND Name = 'FieldCategoryIcons'
            

