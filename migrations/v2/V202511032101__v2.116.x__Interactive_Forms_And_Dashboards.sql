/*
 * Interactive Forms and Dashboards - Migration
 *
 * This migration adds support for Interactive Component-based forms and dashboards.
 *
 * Changes:
 * 1. Creates EntityForm table for Interactive Component form registrations
 * 2. Adds ComponentSpec field to Dashboard table for Interactive Component dashboards
 * 3. Adds indexes for performance
 * 4. Adds extended properties for documentation
 */

-- =============================================
-- Step 1: Create EntityForm Table
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EntityForm' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[EntityForm] (
        [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        [EntityID] UNIQUEIDENTIFIER NOT NULL,
        [Name] NVARCHAR(100) NOT NULL,
        [Description] NVARCHAR(MAX) NULL,
        [ComponentSpec] NVARCHAR(MAX) NOT NULL,
        [Priority] INT NOT NULL DEFAULT 0,
        [Scope] NVARCHAR(20) NOT NULL DEFAULT 'Global',
        [RoleID] UNIQUEIDENTIFIER NULL,
        [UserID] UNIQUEIDENTIFIER NULL,
        [IsDefault] BIT NOT NULL DEFAULT 0,
        [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
        [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
        [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_EntityForm] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_EntityForm_Entity] FOREIGN KEY ([EntityID]) REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
        CONSTRAINT [FK_EntityForm_Role] FOREIGN KEY ([RoleID]) REFERENCES [${flyway:defaultSchema}].[Role]([ID]),
        CONSTRAINT [FK_EntityForm_User] FOREIGN KEY ([UserID]) REFERENCES [${flyway:defaultSchema}].[User]([ID]),
        CONSTRAINT [CK_EntityForm_Scope] CHECK ([Scope] IN ('Global', 'Role', 'User')),
        CONSTRAINT [CK_EntityForm_Status] CHECK ([Status] IN ('Active', 'Inactive', 'Pending', 'Archived')),
        CONSTRAINT [CK_EntityForm_Scope_RoleID] CHECK (
            ([Scope] = 'Role' AND [RoleID] IS NOT NULL) OR ([Scope] <> 'Role')
        ),
        CONSTRAINT [CK_EntityForm_Scope_UserID] CHECK (
            ([Scope] = 'User' AND [UserID] IS NOT NULL) OR ([Scope] <> 'User')
        )
    );

    PRINT 'Created EntityForm table';
END
ELSE
BEGIN
    PRINT 'EntityForm table already exists';
END
GO

-- =============================================
-- Step 2: Create Indexes on EntityForm
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_EntityID' AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityForm]'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_EntityForm_EntityID] ON [${flyway:defaultSchema}].[EntityForm]([EntityID]);
    PRINT 'Created index IX_EntityForm_EntityID';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_RoleID' AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityForm]'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_EntityForm_RoleID] ON [${flyway:defaultSchema}].[EntityForm]([RoleID]) WHERE [RoleID] IS NOT NULL;
    PRINT 'Created index IX_EntityForm_RoleID';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_UserID' AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityForm]'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_EntityForm_UserID] ON [${flyway:defaultSchema}].[EntityForm]([UserID]) WHERE [UserID] IS NOT NULL;
    PRINT 'Created index IX_EntityForm_UserID';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EntityForm_Lookup' AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityForm]'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_EntityForm_Lookup]
    ON [${flyway:defaultSchema}].[EntityForm]([EntityID], [Status], [Scope], [Priority] DESC)
    INCLUDE ([RoleID], [UserID], [ComponentSpec]);
    PRINT 'Created composite index IX_EntityForm_Lookup';
END
GO

-- =============================================
-- Step 3: Add ComponentSpec Column to Dashboard
-- =============================================

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
    AND name = 'ComponentSpec'
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[Dashboard]
    ADD [ComponentSpec] NVARCHAR(MAX) NULL;

    PRINT 'Added ComponentSpec column to Dashboard table';
END
ELSE
BEGIN
    PRINT 'ComponentSpec column already exists on Dashboard table';
END
GO

-- =============================================
-- Step 4: Add Extended Properties - EntityForm Table
-- =============================================

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores Interactive Component form registrations for entities. Supports user, role, and global scope with priority-based resolution.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key identifier for the entity form',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'ID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Entity table - the entity this form is for',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'EntityID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the form (e.g., "Enhanced Customer Form")',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'Name';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description of the form and its purpose',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'Description';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON string containing the Interactive Component specification. Includes component code, properties, events, and dependencies.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'ComponentSpec';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Priority for form selection. Higher numbers = higher priority. Used when multiple forms match the same scope.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'Priority';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Scope of the form: Global (all users), Role (specific role), or User (specific user). User scope has highest priority, then Role, then Global.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'Scope';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Role table. Required when Scope=''Role'', null otherwise.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'RoleID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to User table. Required when Scope=''User'', null otherwise.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'UserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this is the default form for the entity within its scope',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'IsDefault';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the form: Active, Inactive, Pending, or Archived. Only Active forms are used.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'EntityForm',
    @level2type = N'COLUMN', @level2name = 'Status';
GO

-- =============================================
-- Step 5: Add Extended Properties - Dashboard.ComponentSpec
-- =============================================

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON string containing the Interactive Component specification for Interactive type dashboards. Includes component code, properties, events, and dependencies. Used when Type=''Interactive''.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'Dashboard',
    @level2type = N'COLUMN', @level2name = 'ComponentSpec';
GO

PRINT 'Migration completed successfully: Interactive Forms and Dashboards';
GO
