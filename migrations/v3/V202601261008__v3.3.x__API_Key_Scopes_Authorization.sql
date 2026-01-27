-- =============================================================================
-- API KEY SCOPES AUTHORIZATION SYSTEM
-- Adds application binding, hierarchical scopes, and pattern-based access control
-- =============================================================================


-- NEED R Scripts here since we're modifying tables modified in the last migraiton that is
-- also part of 3.3
/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1

GO

-- =============================================================================
-- NEW TABLE: API APPLICATIONS - Register consuming applications
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.APIApplication (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_APIApplication_Name UNIQUE (Name)
);
GO

-- =============================================================================
-- ALTER TABLE: API SCOPES - Add hierarchy and resource type support
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.APIScope ADD
    ParentID UNIQUEIDENTIFIER NULL
        REFERENCES ${flyway:defaultSchema}.APIScope(ID),
    FullPath NVARCHAR(MAX) NULL,
    ResourceType NVARCHAR(50) NULL,
    IsActive BIT NOT NULL DEFAULT 1;
GO

-- Drop the UNIQUE constraint on Name column that started in 3.2 (replaced by FullPath unique constraint)
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = kc.name
FROM sys.key_constraints kc
INNER JOIN sys.index_columns ic ON kc.unique_index_id = ic.index_id AND kc.parent_object_id = ic.object_id
INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE kc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.APIScope')
  AND kc.type = 'UQ'
  AND c.name = 'Name';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE ${flyway:defaultSchema}.APIScope DROP CONSTRAINT ' + @ConstraintName);
END
GO

-- Backfill FullPath from Name for existing scopes
UPDATE ${flyway:defaultSchema}.APIScope SET FullPath = Name WHERE FullPath IS NULL;
GO

-- Make FullPath NOT NULL after backfill
ALTER TABLE ${flyway:defaultSchema}.APIScope ALTER COLUMN FullPath NVARCHAR(500) NOT NULL;
GO

-- Add unique constraints
ALTER TABLE ${flyway:defaultSchema}.APIScope
    ADD CONSTRAINT UQ_APIScope_FullPath UNIQUE (FullPath);
GO

ALTER TABLE ${flyway:defaultSchema}.APIScope
    ADD CONSTRAINT UQ_APIScope_ParentName UNIQUE (ParentID, Name);
GO

-- =============================================================================
-- TRIGGER: Auto-compute FullPath for all scopes on any change
-- Since table is small, recalculates all paths on any insert/update
-- =============================================================================
GO
CREATE TRIGGER ${flyway:defaultSchema}.tr_APIScope_UpdateFullPath
ON ${flyway:defaultSchema}.APIScope
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Prevent recursive trigger firing
    IF TRIGGER_NESTLEVEL() > 1
        RETURN;

    -- Only run if Name or ParentID changed (or new insert)
    IF UPDATE(Name) OR UPDATE(ParentID) OR NOT EXISTS (SELECT 1 FROM deleted)
    BEGIN
        -- Recalculate all FullPath values using recursive CTE
        ;WITH ScopePaths AS (
            -- Base case: root scopes (no parent)
            SELECT
                ID,
                Name,
                ParentID,
                CAST(Name AS NVARCHAR(500)) AS ComputedPath
            FROM ${flyway:defaultSchema}.APIScope
            WHERE ParentID IS NULL

            UNION ALL

            -- Recursive case: child scopes
            SELECT
                s.ID,
                s.Name,
                s.ParentID,
                CAST(sp.ComputedPath + ':' + s.Name AS NVARCHAR(500)) AS ComputedPath
            FROM ${flyway:defaultSchema}.APIScope s
            INNER JOIN ScopePaths sp ON s.ParentID = sp.ID
        )
        UPDATE s
        SET FullPath = sp.ComputedPath
        FROM ${flyway:defaultSchema}.APIScope s
        INNER JOIN ScopePaths sp ON s.ID = sp.ID
        WHERE s.FullPath != sp.ComputedPath OR s.FullPath IS NULL;
    END
END
GO

-- =============================================================================
-- NEW TABLE: API APPLICATION SCOPES - App's scope ceiling with pattern matching
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.APIApplicationScope (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    ApplicationID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIApplication(ID) ON DELETE CASCADE,
    ScopeID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIScope(ID),
    ResourcePattern NVARCHAR(750) NULL,
    PatternType NVARCHAR(20) NOT NULL DEFAULT 'Include'
        CHECK (PatternType IN ('Include', 'Exclude')),
    IsDeny BIT NOT NULL DEFAULT 0,
    Priority INT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_APIApplicationScope UNIQUE (ApplicationID, ScopeID, ResourcePattern)
);
GO

-- =============================================================================
-- NEW TABLE: API KEY APPLICATIONS - Optional key-to-app binding
-- =============================================================================
CREATE TABLE ${flyway:defaultSchema}.APIKeyApplication (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    APIKeyID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIKey(ID) ON DELETE CASCADE,
    ApplicationID UNIQUEIDENTIFIER NOT NULL
        REFERENCES ${flyway:defaultSchema}.APIApplication(ID),
    CONSTRAINT UQ_APIKeyApplication UNIQUE (APIKeyID, ApplicationID)
);
GO

-- =============================================================================
-- ALTER TABLE: API KEY SCOPES - Add pattern matching support
-- =============================================================================

-- Drop existing unique constraint to replace it
ALTER TABLE ${flyway:defaultSchema}.APIKeyScope
    DROP CONSTRAINT IF EXISTS UQ_APIKeyScope;
GO

-- Check for unnamed constraint and drop if exists
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = name
FROM sys.key_constraints
WHERE parent_object_id = OBJECT_ID('${flyway:defaultSchema}.APIKeyScope')
    AND type = 'UQ';
IF @ConstraintName IS NOT NULL
    EXEC('ALTER TABLE ${flyway:defaultSchema}.APIKeyScope DROP CONSTRAINT ' + @ConstraintName);
GO

-- Add new columns
ALTER TABLE ${flyway:defaultSchema}.APIKeyScope ADD
    ResourcePattern NVARCHAR(750) NULL,
    PatternType NVARCHAR(20) NOT NULL DEFAULT 'Include'
        CHECK (PatternType IN ('Include', 'Exclude')),
    IsDeny BIT NOT NULL DEFAULT 0,
    Priority INT NOT NULL DEFAULT 0;
GO

-- Add new unique constraint including ResourcePattern
ALTER TABLE ${flyway:defaultSchema}.APIKeyScope
    ADD CONSTRAINT UQ_APIKeyScope UNIQUE (APIKeyID, ScopeID, ResourcePattern);
GO

-- =============================================================================
-- ALTER TABLE: API KEY USAGE LOG - Add scope evaluation tracking
-- =============================================================================
ALTER TABLE ${flyway:defaultSchema}.APIKeyUsageLog ADD
    ApplicationID UNIQUEIDENTIFIER NULL
        REFERENCES ${flyway:defaultSchema}.APIApplication(ID),
    RequestedResource NVARCHAR(500) NULL,
    ScopesEvaluated NVARCHAR(MAX) NULL,
    AuthorizationResult NVARCHAR(20) NOT NULL DEFAULT 'Allowed'
        CHECK (AuthorizationResult IN ('Allowed', 'Denied', 'NoScopesRequired')),
    DeniedReason NVARCHAR(500) NULL;
GO

-- =============================================================================
-- EXTENDED PROPERTIES - Table Documentation
-- =============================================================================

-- APIApplication Table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registry of applications that can consume MemberJunction APIs. Each application defines a scope ceiling that limits what API keys can access when used with that application.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplication';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name identifying the application (e.g., MJAPI, MCPServer, Portal, CLI).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplication',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable description of the application and its purpose.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplication',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this application is currently active. Inactive applications reject all API key authentication.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplication',
    @level2type = N'COLUMN', @level2name = 'IsActive';

-- APIScope new columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to parent scope for hierarchical organization. NULL indicates a root-level scope.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIScope',
    @level2type = N'COLUMN', @level2name = 'ParentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full hierarchical path of the scope (e.g., entity:runview, agent:execute). Used for matching during authorization.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIScope',
    @level2type = N'COLUMN', @level2name = 'FullPath';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of resource this scope applies to (Entity, Agent, Query, Mutation, or NULL for abstract grouping scopes).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIScope',
    @level2type = N'COLUMN', @level2name = 'ResourceType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this scope is currently active. Inactive scopes are ignored during authorization.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIScope',
    @level2type = N'COLUMN', @level2name = 'IsActive';

-- APIApplicationScope Table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines the scope ceiling for each application with pattern-based rules. Controls which scopes and resource patterns an application can use, regardless of what API keys grant.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplicationScope';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the application this ceiling rule applies to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplicationScope',
    @level2type = N'COLUMN', @level2name = 'ApplicationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the scope this rule applies to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplicationScope',
    @level2type = N'COLUMN', @level2name = 'ScopeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Glob pattern for matching resources (e.g., Users,Accounts or Skip* or *). NULL means match all resources.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplicationScope',
    @level2type = N'COLUMN', @level2name = 'ResourcePattern';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How to interpret the pattern: Include (grant if matches) or Exclude (grant if does NOT match).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplicationScope',
    @level2type = N'COLUMN', @level2name = 'PatternType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, this rule explicitly DENIES access. Deny rules trump allow rules at the same priority level.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplicationScope',
    @level2type = N'COLUMN', @level2name = 'IsDeny';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Rule evaluation order. Higher priority rules are evaluated first. Within same priority, deny rules are evaluated before allow rules.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIApplicationScope',
    @level2type = N'COLUMN', @level2name = 'Priority';

-- APIKeyApplication Table
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional binding of API keys to specific applications. If no records exist for a key, it works with all applications. If records exist, the key only works with those specific applications.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyApplication';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the API key being bound to an application.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyApplication',
    @level2type = N'COLUMN', @level2name = 'APIKeyID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the application this key is authorized to use.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyApplication',
    @level2type = N'COLUMN', @level2name = 'ApplicationID';

-- APIKeyScope new columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Glob pattern for matching resources (e.g., Users,Accounts or Skip* or *). NULL means match all resources under this scope.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyScope',
    @level2type = N'COLUMN', @level2name = 'ResourcePattern';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How to interpret the pattern: Include (grant if matches) or Exclude (grant if does NOT match).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyScope',
    @level2type = N'COLUMN', @level2name = 'PatternType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, this rule explicitly DENIES access. Deny rules trump allow rules at the same priority level.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyScope',
    @level2type = N'COLUMN', @level2name = 'IsDeny';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Rule evaluation order. Higher priority rules are evaluated first. Within same priority, deny rules are evaluated before allow rules.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyScope',
    @level2type = N'COLUMN', @level2name = 'Priority';

-- APIKeyUsageLog new columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The application through which this request was made (MJAPI, MCPServer, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'ApplicationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The specific resource that was requested (e.g., entity name, agent name, query name).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'RequestedResource';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array containing detailed evaluation of each scope rule checked during authorization.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'ScopesEvaluated';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Final authorization result: Allowed, Denied, or NoScopesRequired (for operations that do not require scope checks).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'AuthorizationResult';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When authorization is denied, explains why (e.g., app ceiling blocked, no matching key scope, explicit deny rule).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'APIKeyUsageLog',
    @level2type = N'COLUMN', @level2name = 'DeniedReason';





















































-- CODE GEN RUN
/* SQL generated to create new entity MJ: API Applications */

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
         '7af734b5-579b-4e61-bc1d-38827bb5c465',
         'MJ: API Applications',
         'API Applications',
         NULL,
         NULL,
         'APIApplication',
         'vwAPIApplications',
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
   

/* SQL generated to add new entity MJ: API Applications to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7af734b5-579b-4e61-bc1d-38827bb5c465', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: API Applications for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7af734b5-579b-4e61-bc1d-38827bb5c465', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: API Applications for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7af734b5-579b-4e61-bc1d-38827bb5c465', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: API Applications for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7af734b5-579b-4e61-bc1d-38827bb5c465', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: API Application Scopes */

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
         'f2a7c2ed-008c-41f8-9404-b303e2edbbcf',
         'MJ: API Application Scopes',
         'API Application Scopes',
         NULL,
         NULL,
         'APIApplicationScope',
         'vwAPIApplicationScopes',
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
   

/* SQL generated to add new entity MJ: API Application Scopes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f2a7c2ed-008c-41f8-9404-b303e2edbbcf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: API Application Scopes for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2a7c2ed-008c-41f8-9404-b303e2edbbcf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: API Application Scopes for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2a7c2ed-008c-41f8-9404-b303e2edbbcf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: API Application Scopes for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2a7c2ed-008c-41f8-9404-b303e2edbbcf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: API Key Applications */

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
         '1816303e-6461-4e44-b929-ea467e2703db',
         'MJ: API Key Applications',
         'API Key Applications',
         NULL,
         NULL,
         'APIKeyApplication',
         'vwAPIKeyApplications',
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
   

/* SQL generated to add new entity MJ: API Key Applications to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1816303e-6461-4e44-b929-ea467e2703db', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: API Key Applications for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1816303e-6461-4e44-b929-ea467e2703db', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: API Key Applications for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1816303e-6461-4e44-b929-ea467e2703db', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: API Key Applications for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1816303e-6461-4e44-b929-ea467e2703db', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.APIApplication */
ALTER TABLE [${flyway:defaultSchema}].[APIApplication] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.APIApplication */
ALTER TABLE [${flyway:defaultSchema}].[APIApplication] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.APIApplicationScope */
ALTER TABLE [${flyway:defaultSchema}].[APIApplicationScope] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.APIApplicationScope */
ALTER TABLE [${flyway:defaultSchema}].[APIApplicationScope] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.APIKeyApplication */
ALTER TABLE [${flyway:defaultSchema}].[APIKeyApplication] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.APIKeyApplication */
ALTER TABLE [${flyway:defaultSchema}].[APIKeyApplication] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7a229b80-2d65-44dd-861a-e1cf6fe9d98a'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'ApplicationID')
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
            '7a229b80-2d65-44dd-861a-e1cf6fe9d98a',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100024,
            'ApplicationID',
            'Application ID',
            'The application through which this request was made (MJAPI, MCPServer, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '7AF734B5-579B-4E61-BC1D-38827BB5C465',
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
         WHERE ID = '72efcd20-bd28-408a-88c7-1a91703da172'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'RequestedResource')
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
            '72efcd20-bd28-408a-88c7-1a91703da172',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100025,
            'RequestedResource',
            'Requested Resource',
            'The specific resource that was requested (e.g., entity name, agent name, query name).',
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
         WHERE ID = 'e6afeec9-80d9-4193-9e4f-0b1b7fda310a'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'ScopesEvaluated')
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
            'e6afeec9-80d9-4193-9e4f-0b1b7fda310a',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100026,
            'ScopesEvaluated',
            'Scopes Evaluated',
            'JSON array containing detailed evaluation of each scope rule checked during authorization.',
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
         WHERE ID = '333b3099-1f1c-4034-86f0-40d2c5d86188'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'AuthorizationResult')
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
            '333b3099-1f1c-4034-86f0-40d2c5d86188',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100027,
            'AuthorizationResult',
            'Authorization Result',
            'Final authorization result: Allowed, Denied, or NoScopesRequired (for operations that do not require scope checks).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Allowed',
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
         WHERE ID = 'e456759c-27b8-4197-893c-f44a6015a8e8'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'DeniedReason')
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
            'e456759c-27b8-4197-893c-f44a6015a8e8',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100028,
            'DeniedReason',
            'Denied Reason',
            'When authorization is denied, explains why (e.g., app ceiling blocked, no matching key scope, explicit deny rule).',
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
         WHERE ID = 'f40188da-cc22-4c89-acd4-699a9682c60d'  OR 
               (EntityID = '7AF734B5-579B-4E61-BC1D-38827BB5C465' AND Name = 'ID')
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
            'f40188da-cc22-4c89-acd4-699a9682c60d',
            '7AF734B5-579B-4E61-BC1D-38827BB5C465', -- Entity: MJ: API Applications
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
         WHERE ID = '60261566-7560-4fb6-ac5c-730318887229'  OR 
               (EntityID = '7AF734B5-579B-4E61-BC1D-38827BB5C465' AND Name = 'Name')
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
            '60261566-7560-4fb6-ac5c-730318887229',
            '7AF734B5-579B-4E61-BC1D-38827BB5C465', -- Entity: MJ: API Applications
            100002,
            'Name',
            'Name',
            'Unique name identifying the application (e.g., MJAPI, MCPServer, Portal, CLI).',
            'nvarchar',
            200,
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
         WHERE ID = '70385e3f-3530-4949-b6eb-c8f9986cb031'  OR 
               (EntityID = '7AF734B5-579B-4E61-BC1D-38827BB5C465' AND Name = 'Description')
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
            '70385e3f-3530-4949-b6eb-c8f9986cb031',
            '7AF734B5-579B-4E61-BC1D-38827BB5C465', -- Entity: MJ: API Applications
            100003,
            'Description',
            'Description',
            'Human-readable description of the application and its purpose.',
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
         WHERE ID = 'f10d4d87-0d96-4961-8cb6-9884a151dd96'  OR 
               (EntityID = '7AF734B5-579B-4E61-BC1D-38827BB5C465' AND Name = 'IsActive')
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
            'f10d4d87-0d96-4961-8cb6-9884a151dd96',
            '7AF734B5-579B-4E61-BC1D-38827BB5C465', -- Entity: MJ: API Applications
            100004,
            'IsActive',
            'Is Active',
            'Whether this application is currently active. Inactive applications reject all API key authentication.',
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
         WHERE ID = '12813b1c-2775-4b9d-aeca-6968d2a7dfb5'  OR 
               (EntityID = '7AF734B5-579B-4E61-BC1D-38827BB5C465' AND Name = '__mj_CreatedAt')
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
            '12813b1c-2775-4b9d-aeca-6968d2a7dfb5',
            '7AF734B5-579B-4E61-BC1D-38827BB5C465', -- Entity: MJ: API Applications
            100005,
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
         WHERE ID = 'fcf340d8-9e87-4e57-8f70-109a63900183'  OR 
               (EntityID = '7AF734B5-579B-4E61-BC1D-38827BB5C465' AND Name = '__mj_UpdatedAt')
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
            'fcf340d8-9e87-4e57-8f70-109a63900183',
            '7AF734B5-579B-4E61-BC1D-38827BB5C465', -- Entity: MJ: API Applications
            100006,
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
         WHERE ID = '66cf7d0c-5045-4173-9605-4f5019045f40'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'ResourcePattern')
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
            '66cf7d0c-5045-4173-9605-4f5019045f40',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100013,
            'ResourcePattern',
            'Resource Pattern',
            'Glob pattern for matching resources (e.g., Users,Accounts or Skip* or *). NULL means match all resources under this scope.',
            'nvarchar',
            1500,
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd0b5354c-4fd6-4867-9b00-2dca6f503311'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'PatternType')
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
            'd0b5354c-4fd6-4867-9b00-2dca6f503311',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100014,
            'PatternType',
            'Pattern Type',
            'How to interpret the pattern: Include (grant if matches) or Exclude (grant if does NOT match).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Include',
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
         WHERE ID = '887a096a-6bfa-42bf-949a-69e936e809f2'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'IsDeny')
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
            '887a096a-6bfa-42bf-949a-69e936e809f2',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100015,
            'IsDeny',
            'Is Deny',
            'If true, this rule explicitly DENIES access. Deny rules trump allow rules at the same priority level.',
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
         WHERE ID = '6ff07094-84f7-4095-b677-5d5acdf6c74c'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'Priority')
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
            '6ff07094-84f7-4095-b677-5d5acdf6c74c',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100016,
            'Priority',
            'Priority',
            'Rule evaluation order. Higher priority rules are evaluated first. Within same priority, deny rules are evaluated before allow rules.',
            'int',
            4,
            10,
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
         WHERE ID = '90a4451b-cd13-4f31-98f6-1b1e140fdb9e'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'ID')
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
            '90a4451b-cd13-4f31-98f6-1b1e140fdb9e',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
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
         WHERE ID = '5c6d733a-bc74-4246-bab4-259450e3f73a'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'ApplicationID')
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
            '5c6d733a-bc74-4246-bab4-259450e3f73a',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100002,
            'ApplicationID',
            'Application ID',
            'Reference to the application this ceiling rule applies to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '7AF734B5-579B-4E61-BC1D-38827BB5C465',
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
         WHERE ID = '8b52942b-234e-40d2-abba-57e06c1aca66'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'ScopeID')
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
            '8b52942b-234e-40d2-abba-57e06c1aca66',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100003,
            'ScopeID',
            'Scope ID',
            'Reference to the scope this rule applies to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B',
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
         WHERE ID = '0541b89f-bed5-4f22-98d1-3ebb740d4e5d'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'ResourcePattern')
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
            '0541b89f-bed5-4f22-98d1-3ebb740d4e5d',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100004,
            'ResourcePattern',
            'Resource Pattern',
            'Glob pattern for matching resources (e.g., Users,Accounts or Skip* or *). NULL means match all resources.',
            'nvarchar',
            1500,
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c758ea76-7759-4e50-ad76-702007f237e8'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'PatternType')
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
            'c758ea76-7759-4e50-ad76-702007f237e8',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100005,
            'PatternType',
            'Pattern Type',
            'How to interpret the pattern: Include (grant if matches) or Exclude (grant if does NOT match).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Include',
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
         WHERE ID = 'e52b901e-e069-4a02-bd8a-0ac199308847'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'IsDeny')
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
            'e52b901e-e069-4a02-bd8a-0ac199308847',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100006,
            'IsDeny',
            'Is Deny',
            'If true, this rule explicitly DENIES access. Deny rules trump allow rules at the same priority level.',
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
         WHERE ID = '49feeab6-a5ef-4b98-bae4-405fbbe6700d'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'Priority')
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
            '49feeab6-a5ef-4b98-bae4-405fbbe6700d',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100007,
            'Priority',
            'Priority',
            'Rule evaluation order. Higher priority rules are evaluated first. Within same priority, deny rules are evaluated before allow rules.',
            'int',
            4,
            10,
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
         WHERE ID = '4a1b72d5-ba7c-43b9-bb79-cb2d5baaf88c'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = '__mj_CreatedAt')
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
            '4a1b72d5-ba7c-43b9-bb79-cb2d5baaf88c',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
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
         WHERE ID = '3187bd1e-57f5-4acf-909e-d5c7cde4a23c'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = '__mj_UpdatedAt')
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
            '3187bd1e-57f5-4acf-909e-d5c7cde4a23c',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
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
         WHERE ID = 'f268faaf-e9ca-4467-9621-827edccd71c0'  OR 
               (EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'ParentID')
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
            'f268faaf-e9ca-4467-9621-827edccd71c0',
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', -- Entity: MJ: API Scopes
            100013,
            'ParentID',
            'Parent ID',
            'Reference to parent scope for hierarchical organization. NULL indicates a root-level scope.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B',
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
         WHERE ID = 'a4f7d024-0661-4f4b-99dd-3c121eafa8a2'  OR 
               (EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'FullPath')
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
            'a4f7d024-0661-4f4b-99dd-3c121eafa8a2',
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', -- Entity: MJ: API Scopes
            100014,
            'FullPath',
            'Full Path',
            'Full hierarchical path of the scope (e.g., entity:runview, agent:execute). Used for matching during authorization.',
            'nvarchar',
            1000,
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
         WHERE ID = '7c99f86d-e060-42f4-8fdc-18603b470169'  OR 
               (EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'ResourceType')
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
            '7c99f86d-e060-42f4-8fdc-18603b470169',
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', -- Entity: MJ: API Scopes
            100015,
            'ResourceType',
            'Resource Type',
            'Type of resource this scope applies to (Entity, Agent, Query, Mutation, or NULL for abstract grouping scopes).',
            'nvarchar',
            100,
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
         WHERE ID = 'e82768ca-02ac-4d80-a3be-28ba985a5551'  OR 
               (EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'IsActive')
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
            'e82768ca-02ac-4d80-a3be-28ba985a5551',
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', -- Entity: MJ: API Scopes
            100016,
            'IsActive',
            'Is Active',
            'Whether this scope is currently active. Inactive scopes are ignored during authorization.',
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
         WHERE ID = '188f87ba-9fa0-4129-877e-6db662d5e9d1'  OR 
               (EntityID = '1816303E-6461-4E44-B929-EA467E2703DB' AND Name = 'ID')
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
            '188f87ba-9fa0-4129-877e-6db662d5e9d1',
            '1816303E-6461-4E44-B929-EA467E2703DB', -- Entity: MJ: API Key Applications
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
         WHERE ID = '80332fb7-bb13-4ab9-9ee9-2d3056f63bc0'  OR 
               (EntityID = '1816303E-6461-4E44-B929-EA467E2703DB' AND Name = 'APIKeyID')
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
            '80332fb7-bb13-4ab9-9ee9-2d3056f63bc0',
            '1816303E-6461-4E44-B929-EA467E2703DB', -- Entity: MJ: API Key Applications
            100002,
            'APIKeyID',
            'API Key ID',
            'Reference to the API key being bound to an application.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'B56DB373-2982-4E91-AACB-075CB8BECBBB',
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
         WHERE ID = '9171140b-9106-4863-9580-8327311bc488'  OR 
               (EntityID = '1816303E-6461-4E44-B929-EA467E2703DB' AND Name = 'ApplicationID')
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
            '9171140b-9106-4863-9580-8327311bc488',
            '1816303E-6461-4E44-B929-EA467E2703DB', -- Entity: MJ: API Key Applications
            100003,
            'ApplicationID',
            'Application ID',
            'Reference to the application this key is authorized to use.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '7AF734B5-579B-4E61-BC1D-38827BB5C465',
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
         WHERE ID = 'af92eecb-fb39-4717-9be8-6ee9fcbf21f8'  OR 
               (EntityID = '1816303E-6461-4E44-B929-EA467E2703DB' AND Name = '__mj_CreatedAt')
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
            'af92eecb-fb39-4717-9be8-6ee9fcbf21f8',
            '1816303E-6461-4E44-B929-EA467E2703DB', -- Entity: MJ: API Key Applications
            100004,
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
         WHERE ID = '9b427cf3-ef96-487e-956f-809aad45be43'  OR 
               (EntityID = '1816303E-6461-4E44-B929-EA467E2703DB' AND Name = '__mj_UpdatedAt')
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
            '9b427cf3-ef96-487e-956f-809aad45be43',
            '1816303E-6461-4E44-B929-EA467E2703DB', -- Entity: MJ: API Key Applications
            100005,
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

/* SQL text to insert entity field value with ID 76e5a5aa-2189-4e64-b3ea-ab81099d0dae */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('76e5a5aa-2189-4e64-b3ea-ab81099d0dae', 'C758EA76-7759-4E50-AD76-702007F237E8', 1, 'Exclude', 'Exclude')

/* SQL text to insert entity field value with ID 8d0a378f-307e-4eca-92c4-66db16a6eaac */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8d0a378f-307e-4eca-92c4-66db16a6eaac', 'C758EA76-7759-4E50-AD76-702007F237E8', 2, 'Include', 'Include')

/* SQL text to update ValueListType for entity field ID C758EA76-7759-4E50-AD76-702007F237E8 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C758EA76-7759-4E50-AD76-702007F237E8'

/* SQL text to insert entity field value with ID 3e263ae2-bf27-4327-8e89-56ec99bde5ca */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3e263ae2-bf27-4327-8e89-56ec99bde5ca', 'D0B5354C-4FD6-4867-9B00-2DCA6F503311', 1, 'Exclude', 'Exclude')

/* SQL text to insert entity field value with ID 54ef31c0-3281-43d6-83a7-1b6915f07218 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('54ef31c0-3281-43d6-83a7-1b6915f07218', 'D0B5354C-4FD6-4867-9B00-2DCA6F503311', 2, 'Include', 'Include')

/* SQL text to update ValueListType for entity field ID D0B5354C-4FD6-4867-9B00-2DCA6F503311 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D0B5354C-4FD6-4867-9B00-2DCA6F503311'

/* SQL text to insert entity field value with ID 31152693-dc39-4373-9188-8fed23e94eab */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('31152693-dc39-4373-9188-8fed23e94eab', '333B3099-1F1C-4034-86F0-40D2C5D86188', 1, 'Allowed', 'Allowed')

/* SQL text to insert entity field value with ID 48171a6e-de7d-4477-9c82-467692c12f91 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('48171a6e-de7d-4477-9c82-467692c12f91', '333B3099-1F1C-4034-86F0-40D2C5D86188', 2, 'Denied', 'Denied')

/* SQL text to insert entity field value with ID 411c7c8e-0f74-4cdb-9acd-8307f789aeaf */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('411c7c8e-0f74-4cdb-9acd-8307f789aeaf', '333B3099-1F1C-4034-86F0-40D2C5D86188', 3, 'NoScopesRequired', 'NoScopesRequired')

/* SQL text to update ValueListType for entity field ID 333B3099-1F1C-4034-86F0-40D2C5D86188 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='333B3099-1F1C-4034-86F0-40D2C5D86188'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8a291a58-8371-42f2-8aeb-f2ae96f8ce99'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8a291a58-8371-42f2-8aeb-f2ae96f8ce99', 'B56DB373-2982-4E91-AACB-075CB8BECBBB', '1816303E-6461-4E44-B929-EA467E2703DB', 'APIKeyID', 'One To Many', 1, 1, 'MJ: API Key Applications', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '25391123-d42a-4de2-b2ce-df4914e01bec'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('25391123-d42a-4de2-b2ce-df4914e01bec', '7AF734B5-579B-4E61-BC1D-38827BB5C465', 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', 'ApplicationID', 'One To Many', 1, 1, 'MJ: API Application Scopes', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e8d6e11f-c12c-4ffd-970a-c975cff43afe'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e8d6e11f-c12c-4ffd-970a-c975cff43afe', '7AF734B5-579B-4E61-BC1D-38827BB5C465', '1816303E-6461-4E44-B929-EA467E2703DB', 'ApplicationID', 'One To Many', 1, 1, 'MJ: API Key Applications', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '99e04d75-9b56-4fde-af8e-6b77d14c28cb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('99e04d75-9b56-4fde-af8e-6b77d14c28cb', '7AF734B5-579B-4E61-BC1D-38827BB5C465', 'C49BBAB8-6944-44AF-871B-01F599272E6E', 'ApplicationID', 'One To Many', 1, 1, 'MJ: API Key Usage Logs', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b54e84ac-a2d3-4657-a051-790404050944'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b54e84ac-a2d3-4657-a051-790404050944', '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', 'ParentID', 'One To Many', 1, 1, 'MJ: API Scopes', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9632b827-9398-4bbc-aa85-26ab449c7e9d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9632b827-9398-4bbc-aa85-26ab449c7e9d', '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', 'ScopeID', 'One To Many', 1, 1, 'MJ: API Application Scopes', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID E30132B4-4D67-4B2E-AED6-6145DB916A3D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E30132B4-4D67-4B2E-AED6-6145DB916A3D',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 268AD6B4-34BF-4A42-90F0-1695A7734CDA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='268AD6B4-34BF-4A42-90F0-1695A7734CDA',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID F6FA2E27-048B-4233-9CEF-35FB5E57950C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F6FA2E27-048B-4233-9CEF-35FB5E57950C',
         @RelatedEntityNameFieldMap='GovernmentContact'

/* SQL text to update entity field related entity name field map for entity field ID 55A3001D-2146-4652-96DA-70C22D645E7D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='55A3001D-2146-4652-96DA-70C22D645E7D',
         @RelatedEntityNameFieldMap='BoardPosition'

/* SQL text to update entity field related entity name field map for entity field ID 8BE70B5F-E50E-4E4F-A129-F8A1D133F207 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8BE70B5F-E50E-4E4F-A129-F8A1D133F207',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID D3026174-EB12-4EC1-9EB1-653102088B86 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D3026174-EB12-4EC1-9EB1-653102088B86',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID BDC5A90A-3A15-4AC1-9147-EAAFA3D41D9E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BDC5A90A-3A15-4AC1-9147-EAAFA3D41D9E',
         @RelatedEntityNameFieldMap='Enrollment'

/* SQL text to update entity field related entity name field map for entity field ID A13BE50D-2EB2-40EE-AD62-ACADDD21601A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A13BE50D-2EB2-40EE-AD62-ACADDD21601A',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID 6E987AC2-A3BA-4578-A0F1-138874596C5D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6E987AC2-A3BA-4578-A0F1-138874596C5D',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 620D39C4-5EAB-4F9B-9A11-19315BA11056 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='620D39C4-5EAB-4F9B-9A11-19315BA11056',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID D2C92059-05A4-49FD-A628-6C5FD0F5EC74 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D2C92059-05A4-49FD-A628-6C5FD0F5EC74',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 03E6224D-7EA1-4F4F-B8AD-26E972B114AF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='03E6224D-7EA1-4F4F-B8AD-26E972B114AF',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 795409A9-B3E2-4E9A-83BC-14D6101BBBE0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='795409A9-B3E2-4E9A-83BC-14D6101BBBE0',
         @RelatedEntityNameFieldMap='ChairMember'

/* SQL text to update entity field related entity name field map for entity field ID EF1D147B-9A83-4CF4-A5CD-26DF5D39E9C7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EF1D147B-9A83-4CF4-A5CD-26DF5D39E9C7',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID FFB44E5C-5399-4EEF-868D-C8A62830B844 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FFB44E5C-5399-4EEF-868D-C8A62830B844',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 447A6182-8169-4B60-AE96-D2BE29D0E8B5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='447A6182-8169-4B60-AE96-D2BE29D0E8B5',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID 2BF77529-7818-482E-A244-02A518976C63 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2BF77529-7818-482E-A244-02A518976C63',
         @RelatedEntityNameFieldMap='PrerequisiteCourse'

/* SQL text to update entity field related entity name field map for entity field ID 9A9DA620-438C-42C2-84CD-A36EA5AD47CE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9A9DA620-438C-42C2-84CD-A36EA5AD47CE',
         @RelatedEntityNameFieldMap='EmailSend'

/* SQL text to update entity field related entity name field map for entity field ID 1503F19C-7046-45B9-89C1-7D975EADA551 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1503F19C-7046-45B9-89C1-7D975EADA551',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 4C476E91-4981-4EE2-A5E3-0B53D6697551 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4C476E91-4981-4EE2-A5E3-0B53D6697551',
         @RelatedEntityNameFieldMap='Course'

/* SQL text to update entity field related entity name field map for entity field ID D911DE9D-C68D-4EDC-A788-41D1ED5636F5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D911DE9D-C68D-4EDC-A788-41D1ED5636F5',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 460D1995-5242-4213-8553-D37524C55D7C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='460D1995-5242-4213-8553-D37524C55D7C',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 90C5DA64-6D18-4923-9F13-0284BE4032DC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='90C5DA64-6D18-4923-9F13-0284BE4032DC',
         @RelatedEntityNameFieldMap='LastPostAuthor'

/* SQL text to update entity field related entity name field map for entity field ID BAC88F00-1869-4D35-B9ED-B50A37A43CB3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BAC88F00-1869-4D35-B9ED-B50A37A43CB3',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID E5733B0A-C494-49D4-BF42-7A94BF83AB62 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E5733B0A-C494-49D4-BF42-7A94BF83AB62',
         @RelatedEntityNameFieldMap='ReportedBy'

/* SQL text to update entity field related entity name field map for entity field ID E52DD03D-E743-4C6E-9486-B9D6739D0D9F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E52DD03D-E743-4C6E-9486-B9D6739D0D9F',
         @RelatedEntityNameFieldMap='ModeratedBy'

/* SQL text to update entity field related entity name field map for entity field ID 53EE2349-870F-4F97-99F4-310BC912D14C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='53EE2349-870F-4F97-99F4-310BC912D14C',
         @RelatedEntityNameFieldMap='Thread'

/* SQL text to update entity field related entity name field map for entity field ID CE377497-1E36-4F5C-8406-28ABBFC0AED5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CE377497-1E36-4F5C-8406-28ABBFC0AED5',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 3BC08D3A-C929-40B2-AE5F-BA77202611CD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3BC08D3A-C929-40B2-AE5F-BA77202611CD',
         @RelatedEntityNameFieldMap='ParentPost'

/* SQL text to update entity field related entity name field map for entity field ID A0D09995-0300-4F2B-A69B-E093621187E4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A0D09995-0300-4F2B-A69B-E093621187E4',
         @RelatedEntityNameFieldMap='LastReplyAuthor'

/* SQL text to update entity field related entity name field map for entity field ID 68CB55A8-AAE0-4A0B-A0EB-6FCCBD9B2E5E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='68CB55A8-AAE0-4A0B-A0EB-6FCCBD9B2E5E',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 467861A5-3785-4CA2-B995-D274C481BF40 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='467861A5-3785-4CA2-B995-D274C481BF40',
         @RelatedEntityNameFieldMap='EditedBy'

/* SQL text to update entity field related entity name field map for entity field ID D64D4CF7-11AC-435E-B06A-E5908FC87273 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D64D4CF7-11AC-435E-B06A-E5908FC87273',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID 40C1DF8F-11CF-402E-B7D1-3EC9503272A0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='40C1DF8F-11CF-402E-B7D1-3EC9503272A0',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 4FBB3F7D-B1AF-4E11-94E5-77F02F465F64 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4FBB3F7D-B1AF-4E11-94E5-77F02F465F64',
         @RelatedEntityNameFieldMap='Follower'

/* SQL text to update entity field related entity name field map for entity field ID 83731487-19CA-4E03-BB9F-629AE912F732 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='83731487-19CA-4E03-BB9F-629AE912F732',
         @RelatedEntityNameFieldMap='Member'

/* Index for Foreign Keys for APIApplicationScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table APIApplicationScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIApplicationScope_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIApplicationScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIApplicationScope_ApplicationID ON [${flyway:defaultSchema}].[APIApplicationScope] ([ApplicationID]);

-- Index for foreign key ScopeID in table APIApplicationScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIApplicationScope_ScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIApplicationScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIApplicationScope_ScopeID ON [${flyway:defaultSchema}].[APIApplicationScope] ([ScopeID]);

/* SQL text to update entity field related entity name field map for entity field ID 5C6D733A-BC74-4246-BAB4-259450E3F73A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5C6D733A-BC74-4246-BAB4-259450E3F73A',
         @RelatedEntityNameFieldMap='Application'

/* Index for Foreign Keys for APIApplication */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Applications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for APIKeyApplication */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Applications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyApplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyApplication_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyApplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyApplication_APIKeyID ON [${flyway:defaultSchema}].[APIKeyApplication] ([APIKeyID]);

-- Index for foreign key ApplicationID in table APIKeyApplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyApplication_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyApplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyApplication_ApplicationID ON [${flyway:defaultSchema}].[APIKeyApplication] ([ApplicationID]);

/* SQL text to update entity field related entity name field map for entity field ID 80332FB7-BB13-4AB9-9EE9-2D3056F63BC0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='80332FB7-BB13-4AB9-9EE9-2D3056F63BC0',
         @RelatedEntityNameFieldMap='APIKey'

/* Base View SQL for MJ: API Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Applications
-- Item: vwAPIApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Applications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIApplication
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIApplications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIApplications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIApplications]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[APIApplication] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Applications
-- Item: Permissions for vwAPIApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Applications
-- Item: spCreateAPIApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIApplication]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIApplication]
            (
                [ID],
                [Name],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIApplication]
            (
                [Name],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIApplication] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIApplication] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Applications
-- Item: spUpdateAPIApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIApplication]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIApplication]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIApplications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIApplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIApplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIApplication table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIApplication]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIApplication];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIApplication
ON [${flyway:defaultSchema}].[APIApplication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIApplication]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIApplication] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIApplication] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Applications
-- Item: spDeleteAPIApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIApplication]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIApplication] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIApplication] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 9171140B-9106-4863-9580-8327311BC488 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9171140B-9106-4863-9580-8327311BC488',
         @RelatedEntityNameFieldMap='Application'

/* SQL text to update entity field related entity name field map for entity field ID 8B52942B-234E-40D2-ABBA-57E06C1ACA66 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8B52942B-234E-40D2-ABBA-57E06C1ACA66',
         @RelatedEntityNameFieldMap='Scope'

/* Base View SQL for MJ: API Key Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Applications
-- Item: vwAPIKeyApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Applications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyApplication
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyApplications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyApplications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyApplications]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIApplication_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[APIKeyApplication] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIApplication] AS APIApplication_ApplicationID
  ON
    [a].[ApplicationID] = APIApplication_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Key Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Applications
-- Item: Permissions for vwAPIKeyApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Applications
-- Item: spCreateAPIKeyApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyApplication]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @ApplicationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyApplication]
            (
                [ID],
                [APIKeyID],
                [ApplicationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @ApplicationID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyApplication]
            (
                [APIKeyID],
                [ApplicationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @ApplicationID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyApplication] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Key Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyApplication] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Applications
-- Item: spUpdateAPIKeyApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyApplication]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @ApplicationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyApplication]
    SET
        [APIKeyID] = @APIKeyID,
        [ApplicationID] = @ApplicationID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyApplications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyApplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyApplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyApplication table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyApplication]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyApplication];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyApplication
ON [${flyway:defaultSchema}].[APIKeyApplication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyApplication]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyApplication] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Key Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyApplication] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Applications
-- Item: spDeleteAPIKeyApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyApplication
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyApplication]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyApplication] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Key Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyApplication] TO [cdp_Integration]



/* Base View SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: vwAPIApplicationScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Application Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIApplicationScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIApplicationScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIApplicationScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIApplicationScopes]
AS
SELECT
    a.*,
    APIApplication_ApplicationID.[Name] AS [Application],
    APIScope_ScopeID.[Name] AS [Scope]
FROM
    [${flyway:defaultSchema}].[APIApplicationScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIApplication] AS APIApplication_ApplicationID
  ON
    [a].[ApplicationID] = APIApplication_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIScope] AS APIScope_ScopeID
  ON
    [a].[ScopeID] = APIScope_ScopeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIApplicationScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: Permissions for vwAPIApplicationScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIApplicationScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spCreateAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIApplicationScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIApplicationScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIApplicationScope]
    @ID uniqueidentifier = NULL,
    @ApplicationID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIApplicationScope]
            (
                [ID],
                [ApplicationID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ApplicationID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIApplicationScope]
            (
                [ApplicationID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ApplicationID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIApplicationScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Application Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spUpdateAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIApplicationScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIApplicationScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIApplicationScope]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20),
    @IsDeny bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIApplicationScope]
    SET
        [ApplicationID] = @ApplicationID,
        [ScopeID] = @ScopeID,
        [ResourcePattern] = @ResourcePattern,
        [PatternType] = @PatternType,
        [IsDeny] = @IsDeny,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIApplicationScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIApplicationScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIApplicationScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIApplicationScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIApplicationScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIApplicationScope
ON [${flyway:defaultSchema}].[APIApplicationScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIApplicationScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIApplicationScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Application Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spDeleteAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIApplicationScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIApplicationScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIApplicationScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIApplicationScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIApplicationScope] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Application Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIApplicationScope] TO [cdp_Integration]



/* Index for Foreign Keys for APIKeyScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID ON [${flyway:defaultSchema}].[APIKeyScope] ([APIKeyID]);

-- Index for foreign key ScopeID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID ON [${flyway:defaultSchema}].[APIKeyScope] ([ScopeID]);

/* Index for Foreign Keys for APIKeyUsageLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([APIKeyID]);

-- Index for foreign key ApplicationID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([ApplicationID]);

/* SQL text to update entity field related entity name field map for entity field ID 7A229B80-2D65-44DD-861A-E1CF6FE9D98A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7A229B80-2D65-44DD-861A-E1CF6FE9D98A',
         @RelatedEntityNameFieldMap='Application'

/* Index for Foreign Keys for APIScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table APIScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIScope_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIScope_ParentID ON [${flyway:defaultSchema}].[APIScope] ([ParentID]);

/* Root ID Function SQL for MJ: API Scopes.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: fnAPIScopeParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [APIScope].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAPIScopeParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAPIScopeParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAPIScopeParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[APIScope]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[APIScope] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID F268FAAF-E9CA-4467-9621-827EDCCD71C0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F268FAAF-E9CA-4467-9621-827EDCCD71C0',
         @RelatedEntityNameFieldMap='Parent'

/* Base View SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIScope_ScopeID.[Name] AS [Scope]
FROM
    [${flyway:defaultSchema}].[APIKeyScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIScope] AS APIScope_ScopeID
  ON
    [a].[ScopeID] = APIScope_ScopeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Permissions for vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spCreateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [ID],
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spUpdateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20),
    @IsDeny bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        [APIKeyID] = @APIKeyID,
        [ScopeID] = @ScopeID,
        [ResourcePattern] = @ResourcePattern,
        [PatternType] = @PatternType,
        [IsDeny] = @IsDeny,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyScope
ON [${flyway:defaultSchema}].[APIKeyScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spDeleteAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]



/* Base View SQL for MJ: API Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: vwAPIScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIScopes]
AS
SELECT
    a.*,
    APIScope_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[APIScope] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[APIScope] AS APIScope_ParentID
  ON
    [a].[ParentID] = APIScope_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAPIScopeParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: Permissions for vwAPIScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: spCreateAPIScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIScope]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Category nvarchar(100),
    @Description nvarchar(500),
    @ParentID uniqueidentifier,
    @FullPath nvarchar(500),
    @ResourceType nvarchar(50),
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIScope]
            (
                [ID],
                [Name],
                [Category],
                [Description],
                [ParentID],
                [FullPath],
                [ResourceType],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Category,
                @Description,
                @ParentID,
                @FullPath,
                @ResourceType,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIScope]
            (
                [Name],
                [Category],
                [Description],
                [ParentID],
                [FullPath],
                [ResourceType],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Category,
                @Description,
                @ParentID,
                @FullPath,
                @ResourceType,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIScope] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIScope] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: spUpdateAPIScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIScope]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Category nvarchar(100),
    @Description nvarchar(500),
    @ParentID uniqueidentifier,
    @FullPath nvarchar(500),
    @ResourceType nvarchar(50),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIScope]
    SET
        [Name] = @Name,
        [Category] = @Category,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [FullPath] = @FullPath,
        [ResourceType] = @ResourceType,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIScope
ON [${flyway:defaultSchema}].[APIScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIScope] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Scopes
-- Item: spDeleteAPIScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIScope] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIScope] TO [cdp_Integration]



/* Base View SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Usage Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyUsageLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyUsageLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIApplication_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[APIKeyUsageLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[APIApplication] AS APIApplication_ApplicationID
  ON
    [a].[ApplicationID] = APIApplication_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Permissions for vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spCreateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20) = NULL,
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [ID],
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spUpdateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20),
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        [APIKeyID] = @APIKeyID,
        [Endpoint] = @Endpoint,
        [Operation] = @Operation,
        [Method] = @Method,
        [StatusCode] = @StatusCode,
        [ResponseTimeMs] = @ResponseTimeMs,
        [IPAddress] = @IPAddress,
        [UserAgent] = @UserAgent,
        [ApplicationID] = @ApplicationID,
        [RequestedResource] = @RequestedResource,
        [ScopesEvaluated] = @ScopesEvaluated,
        [AuthorizationResult] = @AuthorizationResult,
        [DeniedReason] = @DeniedReason
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyUsageLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyUsageLog
ON [${flyway:defaultSchema}].[APIKeyUsageLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spDeleteAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 0629C36C-83B4-47ED-88E9-F256C558D2A1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0629C36C-83B4-47ED-88E9-F256C558D2A1',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID EBEE6D77-E576-4F72-8428-B71DC7849C98 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EBEE6D77-E576-4F72-8428-B71DC7849C98',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 999F5E1D-C13A-45DF-AE20-182B49F22360 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='999F5E1D-C13A-45DF-AE20-182B49F22360',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 7B50EBC5-C420-4E15-A814-48C895FD76A6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7B50EBC5-C420-4E15-A814-48C895FD76A6',
         @RelatedEntityNameFieldMap='UploadedBy'

/* SQL text to update entity field related entity name field map for entity field ID F332BFFD-F222-4C7C-9A33-A92EAF46680E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F332BFFD-F222-4C7C-9A33-A92EAF46680E',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 48D9D495-13AD-4CD4-89F4-E53785C62D2D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='48D9D495-13AD-4CD4-89F4-E53785C62D2D',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 86FD787D-33C4-4F5C-A409-9632D56192FA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='86FD787D-33C4-4F5C-A409-9632D56192FA',
         @RelatedEntityNameFieldMap='CompetitionEntry'

/* SQL text to update entity field related entity name field map for entity field ID 9564C304-3122-4E44-810C-FFCCEE3CA0EC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9564C304-3122-4E44-810C-FFCCEE3CA0EC',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID EB55C238-0593-4716-9771-076F625B07D1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EB55C238-0593-4716-9771-076F625B07D1',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 4B30CB05-7C45-4FF6-AF5D-E9AA730BACA9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4B30CB05-7C45-4FF6-AF5D-E9AA730BACA9',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 7601B7DD-D85A-42A8-8EC7-4F671C0F1E3F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7601B7DD-D85A-42A8-8EC7-4F671C0F1E3F',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID F0B6FF48-1A87-4766-AA71-412B3D495FC8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F0B6FF48-1A87-4766-AA71-412B3D495FC8',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 7671AEB3-BC6A-44A3-B57E-B2BBFA0FBEA9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7671AEB3-BC6A-44A3-B57E-B2BBFA0FBEA9',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID D00AA663-BA49-4B04-8B4D-0CD1367F6666 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D00AA663-BA49-4B04-8B4D-0CD1367F6666',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 11ABCB96-5CFB-4D7F-9434-B8A4A172CD46 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='11ABCB96-5CFB-4D7F-9434-B8A4A172CD46',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID B7B702D9-242F-435B-8B0C-D7355A010AB0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B7B702D9-242F-435B-8B0C-D7355A010AB0',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 3103AA8B-2878-4E57-A840-98141F41C9AE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3103AA8B-2878-4E57-A840-98141F41C9AE',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 808E1230-A955-46DA-B334-827C6350D6CD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='808E1230-A955-46DA-B334-827C6350D6CD',
         @RelatedEntityNameFieldMap='CreatedBy'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '610dd273-c8ea-4d1c-8fe6-24853366bfa2'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'Application')
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
            '610dd273-c8ea-4d1c-8fe6-24853366bfa2',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100035,
            'Application',
            'Application',
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
         WHERE ID = 'b1e1d833-8b99-445d-979b-44e289525074'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'Application')
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
            'b1e1d833-8b99-445d-979b-44e289525074',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100019,
            'Application',
            'Application',
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
         WHERE ID = '90e4cb1e-5b3e-4308-ab8e-8a2212bb7666'  OR 
               (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'Scope')
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
            '90e4cb1e-5b3e-4308-ab8e-8a2212bb7666',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100020,
            'Scope',
            'Scope',
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
         WHERE ID = 'd621233d-81ad-4351-b4c7-35176d87d009'  OR 
               (EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'Parent')
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
            'd621233d-81ad-4351-b4c7-35176d87d009',
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', -- Entity: MJ: API Scopes
            100021,
            'Parent',
            'Parent',
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
         WHERE ID = 'ad53cf84-9b40-4bd7-aa05-70d63009d90d'  OR 
               (EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'RootParentID')
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
            'ad53cf84-9b40-4bd7-aa05-70d63009d90d',
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', -- Entity: MJ: API Scopes
            100022,
            'RootParentID',
            'Root Parent ID',
            NULL,
            'uniqueidentifier',
            16,
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
         WHERE ID = 'f4c500d3-c5d4-4b79-ac0c-6c5a8c20b502'  OR 
               (EntityID = '1816303E-6461-4E44-B929-EA467E2703DB' AND Name = 'APIKey')
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
            'f4c500d3-c5d4-4b79-ac0c-6c5a8c20b502',
            '1816303E-6461-4E44-B929-EA467E2703DB', -- Entity: MJ: API Key Applications
            100011,
            'APIKey',
            'API Key',
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
         WHERE ID = 'cd6d81a0-a676-4280-8a48-0d7e3c675843'  OR 
               (EntityID = '1816303E-6461-4E44-B929-EA467E2703DB' AND Name = 'Application')
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
            'cd6d81a0-a676-4280-8a48-0d7e3c675843',
            '1816303E-6461-4E44-B929-EA467E2703DB', -- Entity: MJ: API Key Applications
            100012,
            'Application',
            'Application',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '60261566-7560-4FB6-AC5C-730318887229'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '60261566-7560-4FB6-AC5C-730318887229'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '70385E3F-3530-4949-B6EB-C8F9986CB031'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F10D4D87-0D96-4961-8CB6-9884A151DD96'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '60261566-7560-4FB6-AC5C-730318887229'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '70385E3F-3530-4949-B6EB-C8F9986CB031'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B1E1D833-8B99-445D-979B-44E289525074'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0541B89F-BED5-4F22-98D1-3EBB740D4E5D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C758EA76-7759-4E50-AD76-702007F237E8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E52B901E-E069-4A02-BD8A-0AC199308847'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '49FEEAB6-A5EF-4B98-BAE4-405FBBE6700D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B1E1D833-8B99-445D-979B-44E289525074'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '90E4CB1E-5B3E-4308-AB8E-8A2212BB7666'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0541B89F-BED5-4F22-98D1-3EBB740D4E5D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B1E1D833-8B99-445D-979B-44E289525074'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '90E4CB1E-5B3E-4308-AB8E-8A2212BB7666'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D0B5354C-4FD6-4867-9B00-2DCA6F503311'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '887A096A-6BFA-42BF-949A-69E936E809F2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6FF07094-84F7-4095-B677-5D5ACDF6C74C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C95AA5BE-0A0D-4889-B135-CF8F4E4AB395'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C95AA5BE-0A0D-4889-B135-CF8F4E4AB395'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '333B3099-1F1C-4034-86F0-40D2C5D86188'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '72EFCD20-BD28-408A-88C7-1A91703DA172'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '333B3099-1F1C-4034-86F0-40D2C5D86188'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E456759C-27B8-4197-893C-F44A6015A8E8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '35817BF6-D6AF-4DD2-B588-50012F512FA8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F4C500D3-C5D4-4B79-AC0C-6C5A8C20B502'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F4C500D3-C5D4-4B79-AC0C-6C5A8C20B502'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CD6D81A0-A676-4280-8A48-0D7E3C675843'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F4C500D3-C5D4-4B79-AC0C-6C5A8C20B502'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CD6D81A0-A676-4280-8A48-0D7E3C675843'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '188F87BA-9FA0-4129-877E-6DB662D5E9D1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '80332FB7-BB13-4AB9-9EE9-2D3056F63BC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F4C500D3-C5D4-4B79-AC0C-6C5A8C20B502'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9171140B-9106-4863-9580-8327311BC488'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CD6D81A0-A676-4280-8A48-0D7E3C675843'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF92EECB-FB39-4717-9BE8-6EE9FCBF21F8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B427CF3-EF96-487E-956F-809AAD45BE43'
   AND AutoUpdateCategory = 1

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Rule Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '90A4451B-CD13-4F31-98F6-1B1E140FDB9E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Rule Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B52942B-234E-40D2-ABBA-57E06C1ACA66'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Rule Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '90E4CB1E-5B3E-4308-AB8E-8A2212BB7666'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Rule Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pattern Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C758EA76-7759-4E50-AD76-702007F237E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Rule Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Deny',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E52B901E-E069-4A02-BD8A-0AC199308847'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Rule Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '49FEEAB6-A5EF-4B98-BAE4-405FBBE6700D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C6D733A-BC74-4246-BAB4-259450E3F73A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B1E1D833-8B99-445D-979B-44E289525074'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Pattern',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0541B89F-BED5-4F22-98D1-3EBB740D4E5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4A1B72D5-BA7C-43B9-BB79-CB2D5BAAF88C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3187BD1E-57F5-4ACF-909E-D5C7CDE4A23C'
   AND AutoUpdateCategory = 1

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48219BCC-5A2B-42B8-A832-5459118ECD6D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '222DB89A-825A-41E4-BA64-FA489F5BCAB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Endpoint',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Operation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Method',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'IP Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B521399-DDA4-47BD-B13A-0597F1F9F08D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1ADE12E-28EE-4360-B5E5-DE58A8DA2F8D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A229B80-2D65-44DD-861A-E1CF6FE9D98A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requested Resource',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '72EFCD20-BD28-408A-88C7-1A91703DA172'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scopes Evaluated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E6AFEEC9-80D9-4193-9E4F-0B1B7FDA310A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Authorization Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '333B3099-1F1C-4034-86F0-40D2C5D86188'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Denied Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E456759C-27B8-4197-893C-F44A6015A8E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '35817BF6-D6AF-4DD2-B588-50012F512FA8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-key */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-key',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '1816303E-6461-4E44-B929-EA467E2703DB'
               

/* Set entity icon to fa fa-lock */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-lock',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('104220b2-a7f8-43ea-845f-51fbac159e1c', 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', 'FieldCategoryInfo', '{"Scope Rule Details":{"icon":"fa fa-shield-alt","description":"Defines how a scope is evaluated, including pattern type, deny flag, and priority."},"Application Assignment":{"icon":"fa fa-puzzle-piece","description":"Links an application to a resource pattern that the scope can affect."},"System Metadata":{"icon":"fa fa-cog","description":"Audit timestamps for record creation and last update."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5571c64b-186d-4090-9928-75877fa747d8', '1816303E-6461-4E44-B929-EA467E2703DB', 'FieldCategoryInfo', '{"API Key Assignment":{"icon":"fa fa-key","description":"Mapping of API keys to the applications authorized to use them"},"System Metadata":{"icon":"fa fa-cog","description":"Audit timestamps for creation and last modification of the record"}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authorization Details":{"icon":"fa fa-lock","description":"Information about the API key, application context, requested resource, and authorization outcome for each request"},"Request Information":{"icon":"fa fa-code","description":"Core details of the API call such as key, endpoint, operation and HTTP method"},"Response & Client Info":{"icon":"fa fa-network-wired","description":"Outcome of the request plus client context like status, timing, IP and user-agent"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryInfo'
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0dce8a38-2067-404a-b1b7-1f42eb02b88a', 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', 'FieldCategoryIcons', '{"Scope Rule Details":"fa fa-shield-alt","Application Assignment":"fa fa-puzzle-piece","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('91673fdf-6c48-475d-8501-cc5195d8e033', '1816303E-6461-4E44-B929-EA467E2703DB', 'FieldCategoryIcons', '{"API Key Assignment":"fa fa-key","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF'
         

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: junction, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '1816303E-6461-4E44-B929-EA467E2703DB'
         

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authorization Details":"fa fa-lock","Request Information":"fa fa-code","Response & Client Info":"fa fa-network-wired","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9EF38A8-150A-40E1-8181-2CCB30379BC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '432E223B-5DEB-4563-9B63-E51DDEEE7741'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '311BA3D2-F958-4A38-91F7-A5786C96C75F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C95AA5BE-0A0D-4889-B135-CF8F4E4AB395'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4D1B26B-A8A1-4A41-A353-DFC8F1AAC03D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23C53CEB-2D8F-42F5-B42E-C239644D10CA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Pattern',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pattern Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0B5354C-4FD6-4867-9B00-2DCA6F503311'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Deny Rule',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '887A096A-6BFA-42BF-949A-69E936E809F2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6FF07094-84F7-4095-B677-5D5ACDF6C74C'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Access Rules":{"icon":"fa fa-shield-alt","description":"Defines pattern‑based allow/deny rules that govern how a scope authorizes API requests"},"Key Scope Mapping":{"icon":"fa fa-link","description":"Defines which permission scopes are assigned to each API key"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields tracking creation and modification dates"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Access Rules":"fa fa-shield-alt","Key Scope Mapping":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F40188DA-CC22-4C89-ACD4-699A9682C60D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '60261566-7560-4FB6-AC5C-730318887229'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Application Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '70385E3F-3530-4949-B6EB-C8F9986CB031'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Operational Status',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F10D4D87-0D96-4961-8CB6-9884A151DD96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12813B1C-2775-4B9D-AECA-6968D2A7DFB5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FCF340D8-9E87-4E57-8F70-109A63900183'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-key */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-key',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '7AF734B5-579B-4E61-BC1D-38827BB5C465'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('92bfef9f-dd21-43d0-846f-b1c59460d809', '7AF734B5-579B-4E61-BC1D-38827BB5C465', 'FieldCategoryInfo', '{"Application Details":{"icon":"fa fa-code","description":"Core identifying information for each API application, including name and description"},"Operational Status":{"icon":"fa fa-toggle-on","description":"Current activation state of the application, controlling API key acceptance"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields that record creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d5d6dde2-108c-4c28-9cf3-d3920efeb0a4', '7AF734B5-579B-4E61-BC1D-38827BB5C465', 'FieldCategoryIcons', '{"Application Details":"fa fa-code","Operational Status":"fa fa-toggle-on","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '7AF734B5-579B-4E61-BC1D-38827BB5C465'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '88167D70-305F-4D45-A847-FFCE13C0043D'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '88167D70-305F-4D45-A847-FFCE13C0043D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CED10C09-DAF0-4301-BB54-FE877FF2F6D6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E82768CA-02AC-4D80-A3BE-28BA985A5551'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '88167D70-305F-4D45-A847-FFCE13C0043D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CED10C09-DAF0-4301-BB54-FE877FF2F6D6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A4F7D024-0661-4F4B-99DD-3C121EAFA8A2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7C99F86D-E060-42F4-8FDC-18603B470169'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '80CAFD84-016C-489E-9F81-9B105A19BCC3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '782493FA-A14C-4DEB-96B3-D9178CA23A5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1EDE7763-3304-41F9-86C0-1BDF42F77EAD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '88167D70-305F-4D45-A847-FFCE13C0043D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CED10C09-DAF0-4301-BB54-FE877FF2F6D6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '80DAE0F3-3DAE-49C5-9FFC-C491C00BC67B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F268FAAF-E9CA-4467-9621-827EDCCD71C0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D621233D-81AD-4351-B4C7-35176D87D009'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD53CF84-9B40-4BD7-AA05-70D63009D90D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Full Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A4F7D024-0661-4F4B-99DD-3C121EAFA8A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C99F86D-E060-42F4-8FDC-18603B470169'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E82768CA-02AC-4D80-A3BE-28BA985A5551'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Scope Hierarchy":{"icon":"fa fa-sitemap","description":"Defines hierarchical relationships and core attributes of permission scopes"},"Scope Definition":{"icon":"fa fa-key","description":"Core details of the permission scope including its name, category, and description"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields and primary identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Scope Hierarchy":"fa fa-sitemap","Scope Definition":"fa fa-key","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B' AND Name = 'FieldCategoryIcons'
            

