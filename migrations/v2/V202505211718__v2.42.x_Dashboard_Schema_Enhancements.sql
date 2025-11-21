-- =============================================
-- TRANSACTION 1: Create and alter tables (schema changes)
-- =============================================
BEGIN TRANSACTION;

BEGIN TRY
    -- Modify Dashboard table to add new columns
    ALTER TABLE [${flyway:defaultSchema}].[Dashboard]
    ADD [Type] NVARCHAR(20) NOT NULL CONSTRAINT DF_Dashboard_Type DEFAULT 'Config',
        [Thumbnail] NVARCHAR(MAX) NULL,
        [Scope] NVARCHAR(20) NOT NULL CONSTRAINT DF_Dashboard_Scope DEFAULT 'Global',
        [ApplicationID] UNIQUEIDENTIFIER NULL,
        [DriverClass] NVARCHAR(255) NULL,
        [Code] NVARCHAR(255) NULL;

    -- Create DashboardUserState table
    CREATE TABLE [${flyway:defaultSchema}].[DashboardUserState](
        [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_DashboardUserState_ID DEFAULT newsequentialid(),
        [DashboardID] UNIQUEIDENTIFIER NOT NULL,
        [UserID] UNIQUEIDENTIFIER NOT NULL,
        [UserState] NVARCHAR(MAX) NULL,
        CONSTRAINT PK_DashboardUserState PRIMARY KEY ([ID])
    );

    -- Create DashboardUserPreference table
    CREATE TABLE [${flyway:defaultSchema}].[DashboardUserPreference](
        [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_DashboardUserPreference_ID DEFAULT newsequentialid(),
        [UserID] UNIQUEIDENTIFIER NULL, -- NULL means system default
        [DashboardID] UNIQUEIDENTIFIER NOT NULL,
        [Scope] NVARCHAR(20) NOT NULL,
        [ApplicationID] UNIQUEIDENTIFIER NULL, -- Only for App scope
        [DisplayOrder] INT NOT NULL,
        CONSTRAINT PK_DashboardUserPreference PRIMARY KEY ([ID])
    );

    COMMIT TRANSACTION;
    PRINT 'Transaction 1: Table creation completed successfully.';
END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT 'Transaction 1 failed: ' + ERROR_MESSAGE();
    -- Create a variable to indicate that further transactions should not run
    DECLARE @Transaction1Failed BIT = 1;
END CATCH

GO

-- =============================================
-- TRANSACTION 2: Add constraints, keys, and documentation
-- =============================================
-- Only execute if Transaction 1 was successful
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[DashboardUserPreference]') AND type in (N'U'))
BEGIN
    PRINT 'Transaction 1 failed. Skipping Transaction 2.';
END
ELSE
BEGIN
    BEGIN TRANSACTION;
    
    BEGIN TRY
        -- Add constraints for Dashboard table
        ALTER TABLE [${flyway:defaultSchema}].[Dashboard]
        ADD CONSTRAINT CK_Dashboard_Type CHECK ([Type] IN (N'Config', N'Code'));

        ALTER TABLE [${flyway:defaultSchema}].[Dashboard]
        ADD CONSTRAINT CK_Dashboard_Scope CHECK ([Scope] IN (N'Global', N'App'));

        ALTER TABLE [${flyway:defaultSchema}].[Dashboard]
        ADD CONSTRAINT FK_Dashboard_Application FOREIGN KEY ([ApplicationID])
        REFERENCES [${flyway:defaultSchema}].[Application] ([ID]);

        -- Add documentation for Dashboard columns
        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Specifies if the dashboard is metadata-driven (Config) or code-based (Code)',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'Dashboard',
            @level2type = N'COLUMN', @level2name = N'Type';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Base64 encoded image or URL to an image thumbnail for the dashboard',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'Dashboard',
            @level2type = N'COLUMN', @level2name = N'Thumbnail';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Scope of the dashboard: Global or App-specific',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'Dashboard',
            @level2type = N'COLUMN', @level2name = N'Scope';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Associated Application ID if Scope is App, otherwise NULL',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'Dashboard',
            @level2type = N'COLUMN', @level2name = N'ApplicationID';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Used to identify the dashboard for code-base dashboards. Allows reuse of the same DriverClass for multiple dashboards that can be rendered differently.',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'Dashboard',
            @level2type = N'COLUMN', @level2name = N'Code';        

        -- Add documentation for the new DriverClass column
        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Specifies the runtime class that will be used for the Dashboard when Type is set to ''Code''. This class contains the custom logic and implementation for code-based dashboards.',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'Dashboard',
            @level2type = N'COLUMN', @level2name = N'DriverClass';

        -- Add constraints for DashboardUserState
        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserState]
        ADD CONSTRAINT FK_DashboardUserState_Dashboard FOREIGN KEY ([DashboardID]) 
            REFERENCES [${flyway:defaultSchema}].[Dashboard] ([ID]);

        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserState]
        ADD CONSTRAINT FK_DashboardUserState_User FOREIGN KEY ([UserID]) 
            REFERENCES [${flyway:defaultSchema}].[User] ([ID]);

        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserState]
        ADD CONSTRAINT UQ_DashboardUserState_Dashboard_User UNIQUE ([DashboardID], [UserID]);

        -- Add documentation for DashboardUserState
        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Stores user-specific dashboard state information',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserState';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Dashboard that this state applies to',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserState',
            @level2type = N'COLUMN', @level2name = N'DashboardID';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'User that this state belongs to',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserState',
            @level2type = N'COLUMN', @level2name = N'UserID';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'JSON object containing user-specific dashboard state',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserState',
            @level2type = N'COLUMN', @level2name = N'UserState';

        -- Add constraints for DashboardUserPreference
        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference]
        ADD CONSTRAINT FK_DashboardUserPreference_Dashboard FOREIGN KEY ([DashboardID]) 
            REFERENCES [${flyway:defaultSchema}].[Dashboard] ([ID]);

        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference]
        ADD CONSTRAINT FK_DashboardUserPreference_User FOREIGN KEY ([UserID]) 
            REFERENCES [${flyway:defaultSchema}].[User] ([ID]);

        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference]
        ADD CONSTRAINT FK_DashboardUserPreference_Application FOREIGN KEY ([ApplicationID]) 
            REFERENCES [${flyway:defaultSchema}].[Application] ([ID]);

        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference]
        ADD CONSTRAINT CK_DashboardUserPreference_Scope CHECK ([Scope] IN (N'Global', N'App'));

        ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference]
        ADD CONSTRAINT CK_DashboardUserPreference_ApplicationScope 
            CHECK (([Scope] = 'Global' AND [ApplicationID] IS NULL) OR 
                ([Scope] = 'App' AND [ApplicationID] IS NOT NULL));

        -- Add unique constraints to prevent duplicates - using filtered indexes instead of ISNULL
        -- For Global scope with NULL UserID
        CREATE UNIQUE NONCLUSTERED INDEX [IX_DashboardUserPreference_Global_Default] 
        ON [${flyway:defaultSchema}].[DashboardUserPreference] ([DashboardID], [Scope])
        WHERE [UserID] IS NULL AND [Scope] = 'Global';
        
        -- For Global scope with specific UserID
        CREATE UNIQUE NONCLUSTERED INDEX [IX_DashboardUserPreference_Global_User] 
        ON [${flyway:defaultSchema}].[DashboardUserPreference] ([UserID], [DashboardID], [Scope])
        WHERE [UserID] IS NOT NULL AND [Scope] = 'Global';
        
        -- For App scope with NULL UserID
        CREATE UNIQUE NONCLUSTERED INDEX [IX_DashboardUserPreference_App_Default] 
        ON [${flyway:defaultSchema}].[DashboardUserPreference] ([DashboardID], [ApplicationID])
        WHERE [UserID] IS NULL AND [Scope] = 'App';
        
        -- For App scope with specific UserID
        CREATE UNIQUE NONCLUSTERED INDEX [IX_DashboardUserPreference_App_User] 
        ON [${flyway:defaultSchema}].[DashboardUserPreference] ([UserID], [DashboardID], [ApplicationID])
        WHERE [UserID] IS NOT NULL AND [Scope] = 'App';

        -- Add documentation for DashboardUserPreference
        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Stores dashboard preferences for users and system defaults. The absence of a record for a dashboard means it is not shown.',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserPreference';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'User that these preferences belong to, NULL for system defaults',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserPreference',
            @level2type = N'COLUMN', @level2name = N'UserID';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Dashboard that this preference refers to',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserPreference',
            @level2type = N'COLUMN', @level2name = N'DashboardID';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Scope of the preference (Global or App)',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserPreference',
            @level2type = N'COLUMN', @level2name = N'Scope';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Application that this preference applies to (only for App scope)',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserPreference',
            @level2type = N'COLUMN', @level2name = N'ApplicationID';

        EXEC sp_addextendedproperty
            @name = N'MS_Description',
            @value = N'Order in which to display the dashboard',
            @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
            @level1type = N'TABLE',  @level1name = N'DashboardUserPreference',
            @level2type = N'COLUMN', @level2name = N'DisplayOrder';

        COMMIT TRANSACTION;
        PRINT 'Transaction 2: Constraints and documentation added successfully.';
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        PRINT 'Transaction 2 failed: ' + ERROR_MESSAGE();
    END CATCH
END



/******************* CodeGen Output *******************/

/* SQL generated to create new entity MJ: Dashboard User States */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '1b266740-f4db-43a2-b75b-7a45adb59709',
         'MJ: Dashboard User States',
         NULL,
         NULL,
         'DashboardUserState',
         'vwDashboardUserStates',
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
   

/* SQL generated to add new entity MJ: Dashboard User States to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1b266740-f4db-43a2-b75b-7a45adb59709', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Dashboard User States for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1b266740-f4db-43a2-b75b-7a45adb59709', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to add new permission for entity MJ: Dashboard User States for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1b266740-f4db-43a2-b75b-7a45adb59709', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to add new permission for entity MJ: Dashboard User States for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1b266740-f4db-43a2-b75b-7a45adb59709', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Dashboard User Preferences */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ddfc6120-afaf-4002-a79a-a6aa00b0df7b',
         'MJ: Dashboard User Preferences',
         NULL,
         NULL,
         'DashboardUserPreference',
         'vwDashboardUserPreferences',
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
   

/* SQL generated to add new entity MJ: Dashboard User Preferences to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ddfc6120-afaf-4002-a79a-a6aa00b0df7b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Dashboard User Preferences for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ddfc6120-afaf-4002-a79a-a6aa00b0df7b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to add new permission for entity MJ: Dashboard User Preferences for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ddfc6120-afaf-4002-a79a-a6aa00b0df7b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to add new permission for entity MJ: Dashboard User Preferences for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ddfc6120-afaf-4002-a79a-a6aa00b0df7b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DashboardUserState */
ALTER TABLE [${flyway:defaultSchema}].[DashboardUserState] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DashboardUserState */
ALTER TABLE [${flyway:defaultSchema}].[DashboardUserState] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DashboardUserPreference */
ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DashboardUserPreference */
ALTER TABLE [${flyway:defaultSchema}].[DashboardUserPreference] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8548f57a-0342-42bf-9fd0-d3ba3efacdd4'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Type')
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
            '8548f57a-0342-42bf-9fd0-d3ba3efacdd4',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            9,
            'Type',
            'Type',
            'Specifies if the dashboard is metadata-driven (Config) or code-based (Code)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Config',
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
         WHERE ID = '16163d33-9858-44bf-9887-c34a71359dc7'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Thumbnail')
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
            '16163d33-9858-44bf-9887-c34a71359dc7',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            10,
            'Thumbnail',
            'Thumbnail',
            'Base64 encoded image or URL to an image thumbnail for the dashboard',
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
         WHERE ID = '47bb4821-6981-41b4-9ed0-9e007934df5d'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Scope')
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
            '47bb4821-6981-41b4-9ed0-9e007934df5d',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            11,
            'Scope',
            'Scope',
            'Scope of the dashboard: Global or App-specific',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Global',
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
         WHERE ID = '7d310722-72ea-4dd8-a2a8-dfd3020dc243'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ApplicationID')
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
            '7d310722-72ea-4dd8-a2a8-dfd3020dc243',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            12,
            'ApplicationID',
            'Application ID',
            'Associated Application ID if Scope is App, otherwise NULL',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E8238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = 'e76316e1-b693-48a5-8c1e-e47244e41937'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = 'ID')
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
            'e76316e1-b693-48a5-8c1e-e47244e41937',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            1,
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
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f47fa039-77c7-4d2a-a396-aaf7031b2657'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = 'DashboardID')
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
            'f47fa039-77c7-4d2a-a396-aaf7031b2657',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            2,
            'DashboardID',
            'Dashboard ID',
            'Dashboard that this state applies to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '05248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9be9576d-d305-4a67-8621-9fdc2f7737f9'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = 'UserID')
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
            '9be9576d-d305-4a67-8621-9fdc2f7737f9',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            3,
            'UserID',
            'User ID',
            'User that this state belongs to',
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '890bee89-4c8c-4708-b8a3-567649fb6ebd'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = 'UserState')
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
            '890bee89-4c8c-4708-b8a3-567649fb6ebd',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            4,
            'UserState',
            'User State',
            'JSON object containing user-specific dashboard state',
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a86f1c4c-b95f-48a8-90e9-ad271ad88a0f'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = '__mj_CreatedAt')
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
            'a86f1c4c-b95f-48a8-90e9-ad271ad88a0f',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            5,
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
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9941b94c-89c1-4f83-8f22-99080fce7bea'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = '__mj_UpdatedAt')
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
            '9941b94c-89c1-4f83-8f22-99080fce7bea',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            6,
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
         WHERE ID = 'dfeda9be-2135-42e7-b69c-e0708174412a'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'ID')
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
            'dfeda9be-2135-42e7-b69c-e0708174412a',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            1,
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
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd70e4d7e-0718-448b-8811-659f17ca8e4e'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'UserID')
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
            'd70e4d7e-0718-448b-8811-659f17ca8e4e',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            2,
            'UserID',
            'User ID',
            'User that these preferences belong to, NULL for system defaults',
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '482b1e94-f26e-48c4-83fc-33760af5ad6d'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'DashboardID')
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
            '482b1e94-f26e-48c4-83fc-33760af5ad6d',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            3,
            'DashboardID',
            'Dashboard ID',
            'Dashboard that this preference refers to',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '05248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c58aaac7-5375-41cd-867a-0fe967c3a791'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'Scope')
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
            'c58aaac7-5375-41cd-867a-0fe967c3a791',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            4,
            'Scope',
            'Scope',
            'Scope of the preference (Global or App)',
            'nvarchar',
            40,
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
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f1f8b32e-366f-48ad-8e55-5725e1735c7d'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'ApplicationID')
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
            'f1f8b32e-366f-48ad-8e55-5725e1735c7d',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            5,
            'ApplicationID',
            'Application ID',
            'Application that this preference applies to (only for App scope)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E8238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9bab3b54-20f1-456e-af49-d32806cb6af0'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'DisplayOrder')
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
            '9bab3b54-20f1-456e-af49-d32806cb6af0',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            6,
            'DisplayOrder',
            'Display Order',
            'Order in which to display the dashboard',
            'int',
            4,
            10,
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
         WHERE ID = '8888bbf9-69c8-4f25-97ba-50003eaef472'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = '__mj_CreatedAt')
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
            '8888bbf9-69c8-4f25-97ba-50003eaef472',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            7,
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
         WHERE ID = 'd6f61320-7c7c-4465-afa1-02abc507a45f'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = '__mj_UpdatedAt')
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
            'd6f61320-7c7c-4465-afa1-02abc507a45f',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            8,
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
      WHERE ID = '9e229c05-60a7-4bf6-9236-fbf688522a07'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9e229c05-60a7-4bf6-9236-fbf688522a07', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '1B266740-F4DB-43A2-B75B-7A45ADB59709', 'UserID', 'One To Many', 1, 1, 'MJ: Dashboard User States', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '120adab2-ad2e-4a90-83dc-52b7d20d6a5b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('120adab2-ad2e-4a90-83dc-52b7d20d6a5b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', 'UserID', 'One To Many', 1, 1, 'MJ: Dashboard User Preferences', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'bb20b71e-4c17-4fa7-a707-ae3759860ace'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('bb20b71e-4c17-4fa7-a707-ae3759860ace', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', '05248F34-2837-EF11-86D4-6045BDEE16E6', 'ApplicationID', 'One To Many', 1, 1, 'Dashboards', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '63d2a59c-4c57-406d-8278-2c1e70a3a38f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('63d2a59c-4c57-406d-8278-2c1e70a3a38f', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', 'ApplicationID', 'One To Many', 1, 1, 'MJ: Dashboard User Preferences', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '32c90649-9083-479a-b33c-6d9339167134'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('32c90649-9083-479a-b33c-6d9339167134', '05248F34-2837-EF11-86D4-6045BDEE16E6', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', 'DashboardID', 'One To Many', 1, 1, 'MJ: Dashboard User Preferences', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '362cc173-0649-4490-bb70-4d2778b39654'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('362cc173-0649-4490-bb70-4d2778b39654', '05248F34-2837-EF11-86D4-6045BDEE16E6', '1B266740-F4DB-43A2-B75B-7A45ADB59709', 'DashboardID', 'One To Many', 1, 1, 'MJ: Dashboard User States', 2);
   END
                              

/* Index for Foreign Keys for AIConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DefaultPromptForContextCompressionID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextCompressionID]);

-- Index for foreign key DefaultPromptForContextSummarizationID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextSummarizationID]);

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

/* Index for Foreign Keys for AIPromptModel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_PromptID ON [${flyway:defaultSchema}].[AIPromptModel] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_ModelID ON [${flyway:defaultSchema}].[AIPromptModel] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_VendorID ON [${flyway:defaultSchema}].[AIPromptModel] ([VendorID]);

-- Index for foreign key ConfigurationID in table AIPromptModel
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptModel_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptModel]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptModel_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptModel] ([ConfigurationID]);

/* Base View SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIConfigurations]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIConfigurations]
AS
SELECT
    a.*,
    AIPrompt_DefaultPromptForContextCompressionID.[Name] AS [DefaultPromptForContextCompression],
    AIPrompt_DefaultPromptForContextSummarizationID.[Name] AS [DefaultPromptForContextSummarization]
FROM
    [${flyway:defaultSchema}].[AIConfiguration] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextCompressionID
  ON
    [a].[DefaultPromptForContextCompressionID] = AIPrompt_DefaultPromptForContextCompressionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextSummarizationID
  ON
    [a].[DefaultPromptForContextSummarizationID] = AIPrompt_DefaultPromptForContextSummarizationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Permissions for vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spCreateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIConfiguration]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration]
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Status nvarchar(20),
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIConfiguration]
        (
            [Name],
            [Description],
            [IsDefault],
            [Status],
            [DefaultPromptForContextCompressionID],
            [DefaultPromptForContextSummarizationID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @IsDefault,
            @Status,
            @DefaultPromptForContextCompressionID,
            @DefaultPromptForContextSummarizationID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spUpdateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIConfiguration]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Status nvarchar(20),
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsDefault] = @IsDefault,
        [Status] = @Status,
        [DefaultPromptForContextCompressionID] = @DefaultPromptForContextCompressionID,
        [DefaultPromptForContextSummarizationID] = @DefaultPromptForContextSummarizationID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfiguration table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIConfiguration
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIConfiguration
ON [${flyway:defaultSchema}].[AIConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIConfiguration]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfiguration]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]



/* Base View SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_ParentID
  ON
    [a].[ParentID] = AIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = AIPrompt_ContextCompressionPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgent]
        (
            [Name],
            [Description],
            [LogoURL],
            [ParentID],
            [ExposeAsAction],
            [ExecutionOrder],
            [ExecutionMode],
            [EnableContextCompression],
            [ContextCompressionMessageThreshold],
            [ContextCompressionPromptID],
            [ContextCompressionMessageRetentionCount]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @LogoURL,
            @ParentID,
            @ExposeAsAction,
            @ExecutionOrder,
            @ExecutionMode,
            @EnableContextCompression,
            @ContextCompressionMessageThreshold,
            @ContextCompressionPromptID,
            @ContextCompressionMessageRetentionCount
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [LogoURL] = @LogoURL,
        [ParentID] = @ParentID,
        [ExposeAsAction] = @ExposeAsAction,
        [ExecutionOrder] = @ExecutionOrder,
        [ExecutionMode] = @ExecutionMode,
        [EnableContextCompression] = @EnableContextCompression,
        [ContextCompressionMessageThreshold] = @ContextCompressionMessageThreshold,
        [ContextCompressionPromptID] = @ContextCompressionPromptID,
        [ContextCompressionMessageRetentionCount] = @ContextCompressionMessageRetentionCount
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgent
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



/* Base View SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: vwAIPromptModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPromptModels]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptModels]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIPromptModel] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: Permissions for vwAIPromptModels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spCreateAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPromptModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptModel]
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Priority int,
    @ExecutionGroup int,
    @ModelParameters nvarchar(MAX),
    @Status nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPromptModel]
        (
            [PromptID],
            [ModelID],
            [VendorID],
            [ConfigurationID],
            [Priority],
            [ExecutionGroup],
            [ModelParameters],
            [Status],
            [ParallelizationMode],
            [ParallelCount],
            [ParallelConfigParam]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @PromptID,
            @ModelID,
            @VendorID,
            @ConfigurationID,
            @Priority,
            @ExecutionGroup,
            @ModelParameters,
            @Status,
            @ParallelizationMode,
            @ParallelCount,
            @ParallelConfigParam
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptModel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptModel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spUpdateAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPromptModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptModel]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Priority int,
    @ExecutionGroup int,
    @ModelParameters nvarchar(MAX),
    @Status nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptModel]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [ConfigurationID] = @ConfigurationID,
        [Priority] = @Priority,
        [ExecutionGroup] = @ExecutionGroup,
        [ModelParameters] = @ModelParameters,
        [Status] = @Status,
        [ParallelizationMode] = @ParallelizationMode,
        [ParallelCount] = @ParallelCount,
        [ParallelConfigParam] = @ParallelConfigParam
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptModel table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPromptModel
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptModel
ON [${flyway:defaultSchema}].[AIPromptModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptModel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Models
-- Item: spDeleteAIPromptModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPromptModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptModel]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptModel] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Models */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptModel] TO [cdp_Integration]



/* Index for Foreign Keys for AIPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TemplateID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID ON [${flyway:defaultSchema}].[AIPrompt] ([TemplateID]);

-- Index for foreign key CategoryID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID ON [${flyway:defaultSchema}].[AIPrompt] ([CategoryID]);

-- Index for foreign key TypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_TypeID ON [${flyway:defaultSchema}].[AIPrompt] ([TypeID]);

-- Index for foreign key AIModelTypeID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID ON [${flyway:defaultSchema}].[AIPrompt] ([AIModelTypeID]);

-- Index for foreign key ResultSelectorPromptID in table AIPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID ON [${flyway:defaultSchema}].[AIPrompt] ([ResultSelectorPromptID]);

/* Index for Foreign Keys for AIResultCache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AIPromptID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AIPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AIPromptID ON [${flyway:defaultSchema}].[AIResultCache] ([AIPromptID]);

-- Index for foreign key AIModelID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AIModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AIModelID ON [${flyway:defaultSchema}].[AIResultCache] ([AIModelID]);

-- Index for foreign key VendorID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_VendorID ON [${flyway:defaultSchema}].[AIResultCache] ([VendorID]);

-- Index for foreign key AgentID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_AgentID ON [${flyway:defaultSchema}].[AIResultCache] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_ConfigurationID ON [${flyway:defaultSchema}].[AIResultCache] ([ConfigurationID]);

-- Index for foreign key PromptRunID in table AIResultCache
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIResultCache_PromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIResultCache]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIResultCache_PromptRunID ON [${flyway:defaultSchema}].[AIResultCache] ([PromptRunID]);

/* Base View SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPrompts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT
    a.*,
    Template_TemplateID.[Name] AS [Template],
    AIPromptCategory_CategoryID.[Name] AS [Category],
    AIPromptType_TypeID.[Name] AS [Type],
    AIModelType_AIModelTypeID.[Name] AS [AIModelType],
    AIPrompt_ResultSelectorPromptID.[Name] AS [ResultSelectorPrompt]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [a].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = AIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS AIPromptType_TypeID
  ON
    [a].[TypeID] = AIPromptType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ResultSelectorPromptID
  ON
    [a].[ResultSelectorPromptID] = AIPrompt_ResultSelectorPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPrompt]
        (
            [Name],
            [Description],
            [TemplateID],
            [CategoryID],
            [TypeID],
            [Status],
            [ResponseFormat],
            [ModelSpecificResponseFormat],
            [AIModelTypeID],
            [MinPowerRank],
            [SelectionStrategy],
            [PowerPreference],
            [ParallelizationMode],
            [ParallelCount],
            [ParallelConfigParam],
            [OutputType],
            [OutputExample],
            [ValidationBehavior],
            [MaxRetries],
            [RetryDelayMS],
            [RetryStrategy],
            [ResultSelectorPromptID],
            [EnableCaching],
            [CacheTTLSeconds],
            [CacheMatchType],
            [CacheSimilarityThreshold],
            [CacheMustMatchModel],
            [CacheMustMatchVendor],
            [CacheMustMatchAgent],
            [CacheMustMatchConfig]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @TemplateID,
            @CategoryID,
            @TypeID,
            @Status,
            @ResponseFormat,
            @ModelSpecificResponseFormat,
            @AIModelTypeID,
            @MinPowerRank,
            @SelectionStrategy,
            @PowerPreference,
            @ParallelizationMode,
            @ParallelCount,
            @ParallelConfigParam,
            @OutputType,
            @OutputExample,
            @ValidationBehavior,
            @MaxRetries,
            @RetryDelayMS,
            @RetryStrategy,
            @ResultSelectorPromptID,
            @EnableCaching,
            @CacheTTLSeconds,
            @CacheMatchType,
            @CacheSimilarityThreshold,
            @CacheMustMatchModel,
            @CacheMustMatchVendor,
            @CacheMustMatchAgent,
            @CacheMustMatchConfig
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for AI Prompts */




/* spUpdate SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20),
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20),
    @PowerPreference nvarchar(20),
    @ParallelizationMode nvarchar(20),
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50),
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50),
    @MaxRetries int,
    @RetryDelayMS int,
    @RetryStrategy nvarchar(20),
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20),
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit,
    @CacheMustMatchVendor bit,
    @CacheMustMatchAgent bit,
    @CacheMustMatchConfig bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [TemplateID] = @TemplateID,
        [CategoryID] = @CategoryID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [ResponseFormat] = @ResponseFormat,
        [ModelSpecificResponseFormat] = @ModelSpecificResponseFormat,
        [AIModelTypeID] = @AIModelTypeID,
        [MinPowerRank] = @MinPowerRank,
        [SelectionStrategy] = @SelectionStrategy,
        [PowerPreference] = @PowerPreference,
        [ParallelizationMode] = @ParallelizationMode,
        [ParallelCount] = @ParallelCount,
        [ParallelConfigParam] = @ParallelConfigParam,
        [OutputType] = @OutputType,
        [OutputExample] = @OutputExample,
        [ValidationBehavior] = @ValidationBehavior,
        [MaxRetries] = @MaxRetries,
        [RetryDelayMS] = @RetryDelayMS,
        [RetryStrategy] = @RetryStrategy,
        [ResultSelectorPromptID] = @ResultSelectorPromptID,
        [EnableCaching] = @EnableCaching,
        [CacheTTLSeconds] = @CacheTTLSeconds,
        [CacheMatchType] = @CacheMatchType,
        [CacheSimilarityThreshold] = @CacheSimilarityThreshold,
        [CacheMustMatchModel] = @CacheMustMatchModel,
        [CacheMustMatchVendor] = @CacheMustMatchVendor,
        [CacheMustMatchAgent] = @CacheMustMatchAgent,
        [CacheMustMatchConfig] = @CacheMustMatchConfig
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPrompt
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPrompt
ON [${flyway:defaultSchema}].[AIPrompt]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPrompt]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPrompt] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Prompts */




/* spDelete SQL for AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for AI Prompts */




/* Base View SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: vwAIResultCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Result Cache
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIResultCache
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIResultCaches]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIResultCaches]
AS
SELECT
    a.*,
    AIPrompt_AIPromptID.[Name] AS [AIPrompt],
    AIModel_AIModelID.[Name] AS [AIModel],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIResultCache] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_AIPromptID
  ON
    [a].[AIPromptID] = AIPrompt_AIPromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_AIModelID
  ON
    [a].[AIModelID] = AIModel_AIModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIResultCaches] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: Permissions for vwAIResultCaches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIResultCaches] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spCreateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIResultCache]
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @PromptEmbedding varbinary,
    @PromptRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIResultCache]
        (
            [AIPromptID],
            [AIModelID],
            [RunAt],
            [PromptText],
            [ResultText],
            [Status],
            [ExpiredOn],
            [VendorID],
            [AgentID],
            [ConfigurationID],
            [PromptEmbedding],
            [PromptRunID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AIPromptID,
            @AIModelID,
            @RunAt,
            @PromptText,
            @ResultText,
            @Status,
            @ExpiredOn,
            @VendorID,
            @AgentID,
            @ConfigurationID,
            @PromptEmbedding,
            @PromptRunID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIResultCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for AI Result Cache */




/* spUpdate SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spUpdateAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIResultCache]
    @ID uniqueidentifier,
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @PromptEmbedding varbinary,
    @PromptRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        [AIPromptID] = @AIPromptID,
        [AIModelID] = @AIModelID,
        [RunAt] = @RunAt,
        [PromptText] = @PromptText,
        [ResultText] = @ResultText,
        [Status] = @Status,
        [ExpiredOn] = @ExpiredOn,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [PromptEmbedding] = @PromptEmbedding,
        [PromptRunID] = @PromptRunID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIResultCaches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIResultCache table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIResultCache
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIResultCache
ON [${flyway:defaultSchema}].[AIResultCache]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIResultCache]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIResultCache] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Result Cache */




/* spDelete SQL for AI Result Cache */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Result Cache
-- Item: spDeleteAIResultCache
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIResultCache
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIResultCache]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIResultCache]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIResultCache]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for AI Result Cache */




/* Index for Foreign Keys for Dashboard */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_UserID ON [${flyway:defaultSchema}].[Dashboard] ([UserID]);

-- Index for foreign key CategoryID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_CategoryID ON [${flyway:defaultSchema}].[Dashboard] ([CategoryID]);

-- Index for foreign key ApplicationID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID ON [${flyway:defaultSchema}].[Dashboard] ([ApplicationID]);

/* SQL text to update entity field related entity name field map for entity field ID 7D310722-72EA-4DD8-A2A8-DFD3020DC243 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7D310722-72EA-4DD8-A2A8-DFD3020DC243',
         @RelatedEntityNameFieldMap='Application'

/* Base View SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dashboards
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Dashboard
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDashboards]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboards]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User],
    DashboardCategory_CategoryID.[Name] AS [Category],
    Application_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[Dashboard] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS DashboardCategory_CategoryID
  ON
    [d].[CategoryID] = DashboardCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS Application_ApplicationID
  ON
    [d].[ApplicationID] = Application_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_UI]
    

/* Base View Permissions SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Permissions for vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_UI]

/* spCreate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spCreateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboard]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @Code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Dashboard]
        (
            [Name],
            [Description],
            [UserID],
            [CategoryID],
            [UIConfigDetails],
            [Type],
            [Thumbnail],
            [Scope],
            [ApplicationID],
            [Code]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @UserID,
            @CategoryID,
            @UIConfigDetails,
            @Type,
            @Thumbnail,
            @Scope,
            @ApplicationID,
            @Code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboards] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_UI]
    

/* spCreate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_UI]



/* spUpdate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spUpdateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboard]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @Code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [CategoryID] = @CategoryID,
        [UIConfigDetails] = @UIConfigDetails,
        [Type] = @Type,
        [Thumbnail] = @Thumbnail,
        [Scope] = @Scope,
        [ApplicationID] = @ApplicationID,
        [Code] = @Code
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboards]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Dashboard table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDashboard
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboard
ON [${flyway:defaultSchema}].[Dashboard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Dashboard] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_UI]



/* spDelete SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spDeleteDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboard]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Dashboard]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_UI]



/* Index for Foreign Keys for AIModelVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID ON [${flyway:defaultSchema}].[AIModelVendor] ([ModelID]);

-- Index for foreign key VendorID in table AIModelVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID ON [${flyway:defaultSchema}].[AIModelVendor] ([VendorID]);

/* Base View SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIModelVendors]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelVendors]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor]
FROM
    [${flyway:defaultSchema}].[AIModelVendor] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Permissions for vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spCreateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelVendor]
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int,
    @Status nvarchar(20),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit,
    @SupportsStreaming bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIModelVendor]
        (
            [ModelID],
            [VendorID],
            [Priority],
            [Status],
            [DriverClass],
            [DriverImportPath],
            [APIName],
            [MaxInputTokens],
            [MaxOutputTokens],
            [SupportedResponseFormats],
            [SupportsEffortLevel],
            [SupportsStreaming]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ModelID,
            @VendorID,
            @Priority,
            @Status,
            @DriverClass,
            @DriverImportPath,
            @APIName,
            @MaxInputTokens,
            @MaxOutputTokens,
            @SupportedResponseFormats,
            @SupportsEffortLevel,
            @SupportsStreaming
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelVendors] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spUpdateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelVendor]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @Priority int,
    @Status nvarchar(20),
    @DriverClass nvarchar(100),
    @DriverImportPath nvarchar(255),
    @APIName nvarchar(100),
    @MaxInputTokens int,
    @MaxOutputTokens int,
    @SupportedResponseFormats nvarchar(100),
    @SupportsEffortLevel bit,
    @SupportsStreaming bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [Priority] = @Priority,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [APIName] = @APIName,
        [MaxInputTokens] = @MaxInputTokens,
        [MaxOutputTokens] = @MaxOutputTokens,
        [SupportedResponseFormats] = @SupportedResponseFormats,
        [SupportsEffortLevel] = @SupportsEffortLevel,
        [SupportsStreaming] = @SupportsStreaming
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelVendors]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelVendor table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIModelVendor
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelVendor
ON [${flyway:defaultSchema}].[AIModelVendor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelVendor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelVendor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelVendor] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spDeleteAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelVendor
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIModelVendor]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelVendor]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelVendor]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelVendor] TO [cdp_Integration]



/* Index for Foreign Keys for DashboardUserState */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User States
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DashboardID in table DashboardUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardUserState_DashboardID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardUserState_DashboardID ON [${flyway:defaultSchema}].[DashboardUserState] ([DashboardID]);

-- Index for foreign key UserID in table DashboardUserState
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardUserState_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardUserState]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardUserState_UserID ON [${flyway:defaultSchema}].[DashboardUserState] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID F47FA039-77C7-4D2A-A396-AAF7031B2657 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F47FA039-77C7-4D2A-A396-AAF7031B2657',
         @RelatedEntityNameFieldMap='Dashboard'

/* Index for Foreign Keys for AIVendorType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key VendorID in table AIVendorType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIVendorType_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIVendorType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIVendorType_VendorID ON [${flyway:defaultSchema}].[AIVendorType] ([VendorID]);

-- Index for foreign key TypeID in table AIVendorType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIVendorType_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIVendorType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIVendorType_TypeID ON [${flyway:defaultSchema}].[AIVendorType] ([TypeID]);

/* Index for Foreign Keys for AIAgentPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPrompt_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPrompt_AgentID ON [${flyway:defaultSchema}].[AIAgentPrompt] ([AgentID]);

-- Index for foreign key PromptID in table AIAgentPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPrompt_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPrompt_PromptID ON [${flyway:defaultSchema}].[AIAgentPrompt] ([PromptID]);

-- Index for foreign key ConfigurationID in table AIAgentPrompt
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPrompt_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPrompt]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPrompt_ConfigurationID ON [${flyway:defaultSchema}].[AIAgentPrompt] ([ConfigurationID]);

/* Base View SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: vwAIVendorTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Vendor Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIVendorType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIVendorTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIVendorTypes]
AS
SELECT
    a.*,
    AIVendor_VendorID.[Name] AS [Vendor],
    AIVendorTypeDefinition_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[AIVendorType] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendorTypeDefinition] AS AIVendorTypeDefinition_TypeID
  ON
    [a].[TypeID] = AIVendorTypeDefinition_TypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendorTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: Permissions for vwAIVendorTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIVendorTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: spCreateAIVendorType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIVendorType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIVendorType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIVendorType]
    @VendorID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Rank int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIVendorType]
        (
            [VendorID],
            [TypeID],
            [Rank],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @VendorID,
            @TypeID,
            @Rank,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIVendorTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendorType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Vendor Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIVendorType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: spUpdateAIVendorType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIVendorType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIVendorType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIVendorType]
    @ID uniqueidentifier,
    @VendorID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Rank int,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendorType]
    SET
        [VendorID] = @VendorID,
        [TypeID] = @TypeID,
        [Rank] = @Rank,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIVendorTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendorType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIVendorType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIVendorType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIVendorType
ON [${flyway:defaultSchema}].[AIVendorType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIVendorType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIVendorType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Vendor Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIVendorType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Vendor Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Vendor Types
-- Item: spDeleteAIVendorType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIVendorType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIVendorType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIVendorType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIVendorType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendorType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Vendor Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIVendorType] TO [cdp_Integration]



/* Base View SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: vwAIAgentPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentPrompts]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentPrompts]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIAgentPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentPrompts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: Permissions for vwAIAgentPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentPrompts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: spCreateAIAgentPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentPrompt]
    @AgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @Purpose nvarchar(MAX),
    @ExecutionOrder int,
    @ConfigurationID uniqueidentifier,
    @Status nvarchar(20),
    @ContextBehavior nvarchar(50),
    @ContextMessageCount int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentPrompt]
        (
            [AgentID],
            [PromptID],
            [Purpose],
            [ExecutionOrder],
            [ConfigurationID],
            [Status],
            [ContextBehavior],
            [ContextMessageCount]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @PromptID,
            @Purpose,
            @ExecutionOrder,
            @ConfigurationID,
            @Status,
            @ContextBehavior,
            @ContextMessageCount
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: spUpdateAIAgentPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentPrompt]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @PromptID uniqueidentifier,
    @Purpose nvarchar(MAX),
    @ExecutionOrder int,
    @ConfigurationID uniqueidentifier,
    @Status nvarchar(20),
    @ContextBehavior nvarchar(50),
    @ContextMessageCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentPrompt]
    SET
        [AgentID] = @AgentID,
        [PromptID] = @PromptID,
        [Purpose] = @Purpose,
        [ExecutionOrder] = @ExecutionOrder,
        [ConfigurationID] = @ConfigurationID,
        [Status] = @Status,
        [ContextBehavior] = @ContextBehavior,
        [ContextMessageCount] = @ContextMessageCount
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentPrompt table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentPrompt
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentPrompt
ON [${flyway:defaultSchema}].[AIAgentPrompt]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentPrompt]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentPrompt] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentPrompt] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Prompts
-- Item: spDeleteAIAgentPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentPrompt
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentPrompt]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentPrompt]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 9BE9576D-D305-4A67-8621-9FDC2F7737F9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9BE9576D-D305-4A67-8621-9FDC2F7737F9',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for MJ: Dashboard User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User States
-- Item: vwDashboardUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dashboard User States
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DashboardUserState
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDashboardUserStates]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboardUserStates]
AS
SELECT
    d.*,
    Dashboard_DashboardID.[Name] AS [Dashboard],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[DashboardUserState] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Dashboard] AS Dashboard_DashboardID
  ON
    [d].[DashboardID] = Dashboard_DashboardID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Dashboard User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User States
-- Item: Permissions for vwDashboardUserStates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardUserStates] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Dashboard User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User States
-- Item: spCreateDashboardUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DashboardUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDashboardUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardUserState]
    @DashboardID uniqueidentifier,
    @UserID uniqueidentifier,
    @UserState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[DashboardUserState]
        (
            [DashboardID],
            [UserID],
            [UserState]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @DashboardID,
            @UserID,
            @UserState
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboardUserStates] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardUserState] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Dashboard User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardUserState] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Dashboard User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User States
-- Item: spUpdateDashboardUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DashboardUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDashboardUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardUserState]
    @ID uniqueidentifier,
    @DashboardID uniqueidentifier,
    @UserID uniqueidentifier,
    @UserState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardUserState]
    SET
        [DashboardID] = @DashboardID,
        [UserID] = @UserID,
        [UserState] = @UserState
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboardUserStates]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardUserState] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DashboardUserState table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDashboardUserState
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboardUserState
ON [${flyway:defaultSchema}].[DashboardUserState]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardUserState]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DashboardUserState] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Dashboard User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardUserState] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Dashboard User States */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User States
-- Item: spDeleteDashboardUserState
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardUserState
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDashboardUserState]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardUserState]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DashboardUserState]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardUserState] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Dashboard User States */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardUserState] TO [cdp_Integration]



/* Index for Foreign Keys for DashboardUserPreference */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User Preferences
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table DashboardUserPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardUserPreference_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardUserPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardUserPreference_UserID ON [${flyway:defaultSchema}].[DashboardUserPreference] ([UserID]);

-- Index for foreign key DashboardID in table DashboardUserPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardUserPreference_DashboardID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardUserPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardUserPreference_DashboardID ON [${flyway:defaultSchema}].[DashboardUserPreference] ([DashboardID]);

-- Index for foreign key ApplicationID in table DashboardUserPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardUserPreference_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardUserPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardUserPreference_ApplicationID ON [${flyway:defaultSchema}].[DashboardUserPreference] ([ApplicationID]);

/* SQL text to update entity field related entity name field map for entity field ID D70E4D7E-0718-448B-8811-659F17CA8E4E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D70E4D7E-0718-448B-8811-659F17CA8E4E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 482B1E94-F26E-48C4-83FC-33760AF5AD6D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='482B1E94-F26E-48C4-83FC-33760AF5AD6D',
         @RelatedEntityNameFieldMap='Dashboard'

/* SQL text to update entity field related entity name field map for entity field ID F1F8B32E-366F-48AD-8E55-5725E1735C7D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F1F8B32E-366F-48AD-8E55-5725E1735C7D',
         @RelatedEntityNameFieldMap='Application'

/* Base View SQL for MJ: Dashboard User Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User Preferences
-- Item: vwDashboardUserPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dashboard User Preferences
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DashboardUserPreference
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDashboardUserPreferences]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboardUserPreferences]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User],
    Dashboard_DashboardID.[Name] AS [Dashboard],
    Application_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[DashboardUserPreference] AS d
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Dashboard] AS Dashboard_DashboardID
  ON
    [d].[DashboardID] = Dashboard_DashboardID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS Application_ApplicationID
  ON
    [d].[ApplicationID] = Application_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardUserPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Dashboard User Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User Preferences
-- Item: Permissions for vwDashboardUserPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardUserPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Dashboard User Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User Preferences
-- Item: spCreateDashboardUserPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DashboardUserPreference
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDashboardUserPreference]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardUserPreference]
    @UserID uniqueidentifier,
    @DashboardID uniqueidentifier,
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DisplayOrder int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[DashboardUserPreference]
        (
            [UserID],
            [DashboardID],
            [Scope],
            [ApplicationID],
            [DisplayOrder]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @DashboardID,
            @Scope,
            @ApplicationID,
            @DisplayOrder
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboardUserPreferences] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardUserPreference] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Dashboard User Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardUserPreference] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Dashboard User Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User Preferences
-- Item: spUpdateDashboardUserPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DashboardUserPreference
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDashboardUserPreference]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardUserPreference]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @DashboardID uniqueidentifier,
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @DisplayOrder int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardUserPreference]
    SET
        [UserID] = @UserID,
        [DashboardID] = @DashboardID,
        [Scope] = @Scope,
        [ApplicationID] = @ApplicationID,
        [DisplayOrder] = @DisplayOrder
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboardUserPreferences]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardUserPreference] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DashboardUserPreference table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDashboardUserPreference
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboardUserPreference
ON [${flyway:defaultSchema}].[DashboardUserPreference]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardUserPreference]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DashboardUserPreference] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Dashboard User Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardUserPreference] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Dashboard User Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard User Preferences
-- Item: spDeleteDashboardUserPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardUserPreference
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDashboardUserPreference]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardUserPreference]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DashboardUserPreference]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardUserPreference] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Dashboard User Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardUserPreference] TO [cdp_Integration]



/* Index for Foreign Keys for AIPromptRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID ON [${flyway:defaultSchema}].[AIPromptRun] ([PromptID]);

-- Index for foreign key ModelID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID ON [${flyway:defaultSchema}].[AIPromptRun] ([ModelID]);

-- Index for foreign key VendorID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID ON [${flyway:defaultSchema}].[AIPromptRun] ([VendorID]);

-- Index for foreign key AgentID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID ON [${flyway:defaultSchema}].[AIPromptRun] ([AgentID]);

-- Index for foreign key ConfigurationID in table AIPromptRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID ON [${flyway:defaultSchema}].[AIPromptRun] ([ConfigurationID]);

/* Base View SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIPromptRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRuns]
AS
SELECT
    a.*,
    AIPrompt_PromptID.[Name] AS [Prompt],
    AIModel_ModelID.[Name] AS [Model],
    AIVendor_VendorID.[Name] AS [Vendor],
    AIAgent_AgentID.[Name] AS [Agent],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_PromptID
  ON
    [a].[PromptID] = AIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_VendorID
  ON
    [a].[VendorID] = AIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetime2,
    @CompletedAt datetime2,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIPromptRun]
        (
            [PromptID],
            [ModelID],
            [VendorID],
            [AgentID],
            [ConfigurationID],
            [RunAt],
            [CompletedAt],
            [ExecutionTimeMS],
            [Messages],
            [Result],
            [TokensUsed],
            [TokensPrompt],
            [TokensCompletion],
            [TotalCost],
            [Success],
            [ErrorMessage]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @PromptID,
            @ModelID,
            @VendorID,
            @AgentID,
            @ConfigurationID,
            @RunAt,
            @CompletedAt,
            @ExecutionTimeMS,
            @Messages,
            @Result,
            @TokensUsed,
            @TokensPrompt,
            @TokensCompletion,
            @TotalCost,
            @Success,
            @ErrorMessage
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetime2,
    @CompletedAt datetime2,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        [PromptID] = @PromptID,
        [ModelID] = @ModelID,
        [VendorID] = @VendorID,
        [AgentID] = @AgentID,
        [ConfigurationID] = @ConfigurationID,
        [RunAt] = @RunAt,
        [CompletedAt] = @CompletedAt,
        [ExecutionTimeMS] = @ExecutionTimeMS,
        [Messages] = @Messages,
        [Result] = @Result,
        [TokensUsed] = @TokensUsed,
        [TokensPrompt] = @TokensPrompt,
        [TokensCompletion] = @TokensCompletion,
        [TotalCost] = @TotalCost,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIPromptRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRun
ON [${flyway:defaultSchema}].[AIPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIPromptRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Integration]



/* Index for Foreign Keys for AIConfigurationParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConfigurationID in table AIConfigurationParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfigurationParam_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfigurationParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfigurationParam_ConfigurationID ON [${flyway:defaultSchema}].[AIConfigurationParam] ([ConfigurationID]);

/* Base View SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: vwAIConfigurationParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configuration Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIConfigurationParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIConfigurationParams]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIConfigurationParams]
AS
SELECT
    a.*,
    AIConfiguration_ConfigurationID.[Name] AS [Configuration]
FROM
    [${flyway:defaultSchema}].[AIConfigurationParam] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurationParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: Permissions for vwAIConfigurationParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurationParams] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: spCreateAIConfigurationParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIConfigurationParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIConfigurationParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfigurationParam]
    @ConfigurationID uniqueidentifier,
    @Name nvarchar(100),
    @Type nvarchar(20),
    @Value nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIConfigurationParam]
        (
            [ConfigurationID],
            [Name],
            [Type],
            [Value],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ConfigurationID,
            @Name,
            @Type,
            @Value,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIConfigurationParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Configuration Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: spUpdateAIConfigurationParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIConfigurationParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIConfigurationParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfigurationParam]
    @ID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @Name nvarchar(100),
    @Type nvarchar(20),
    @Value nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfigurationParam]
    SET
        [ConfigurationID] = @ConfigurationID,
        [Name] = @Name,
        [Type] = @Type,
        [Value] = @Value,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIConfigurationParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfigurationParam table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIConfigurationParam
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIConfigurationParam
ON [${flyway:defaultSchema}].[AIConfigurationParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfigurationParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIConfigurationParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Configuration Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfigurationParam] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Configuration Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configuration Params
-- Item: spDeleteAIConfigurationParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfigurationParam
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIConfigurationParam]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfigurationParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfigurationParam]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfigurationParam] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Configuration Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfigurationParam] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '401ed2ba-9fee-4d6e-876a-21ca9a8ead0e'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Application')
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
            '401ed2ba-9fee-4d6e-876a-21ca9a8ead0e',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            15,
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
         WHERE ID = '4a47f441-cb45-4444-8288-e02239f6ae6a'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = 'Dashboard')
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
            '4a47f441-cb45-4444-8288-e02239f6ae6a',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            7,
            'Dashboard',
            'Dashboard',
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
         WHERE ID = '3adc0a79-da2c-47a6-9afd-02e714e55073'  OR 
               (EntityID = '1B266740-F4DB-43A2-B75B-7A45ADB59709' AND Name = 'User')
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
            '3adc0a79-da2c-47a6-9afd-02e714e55073',
            '1B266740-F4DB-43A2-B75B-7A45ADB59709', -- Entity: MJ: Dashboard User States
            8,
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
         WHERE ID = 'd94cd10d-a355-46c3-9127-34fd396fcd83'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'User')
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
            'd94cd10d-a355-46c3-9127-34fd396fcd83',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            9,
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
         WHERE ID = '8df7ac92-37bb-452b-9a1b-692d8e991b2a'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'Dashboard')
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
            '8df7ac92-37bb-452b-9a1b-692d8e991b2a',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            10,
            'Dashboard',
            'Dashboard',
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
         WHERE ID = '332c16cc-c6e1-495d-98c5-97ca56c85807'  OR 
               (EntityID = 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B' AND Name = 'Application')
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
            '332c16cc-c6e1-495d-98c5-97ca56c85807',
            'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B', -- Entity: MJ: Dashboard User Preferences
            11,
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

-- CHECK constraint for Dashboards: Field: Scope was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Scope]=N''App'' OR [Scope]=N''Global'')', 'public ValidateScopeValueIsAppOrGlobal(result: ValidationResult) {
	if (this.Scope !== "App" && this.Scope !== "Global") {
		result.Errors.push(new ValidationErrorInfo("Scope", "Scope must be either ''App'' or ''Global''.", this.Scope, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the value of the Scope field must be either ''App'' or ''Global''. No other values are allowed.', 'ValidateScopeValueIsAppOrGlobal', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '47BB4821-6981-41B4-9ED0-9E007934DF5D');
  
            -- CHECK constraint for Dashboards: Field: Type was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Type]=N''Code'' OR [Type]=N''Config'')', 'public ValidateTypeAllowedValues(result: ValidationResult) {
	if (this.Type !== "Code" && this.Type !== "Config") {
		result.Errors.push(new ValidationErrorInfo("Type", "Type must be either \"Code\" or \"Config\".", this.Type, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the value for the Type field must be either ''Code'' or ''Config'', and nothing else is allowed.', 'ValidateTypeAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8548F57A-0342-42BF-9FD0-D3BA3EFACDD4');
  
            

-- CHECK constraint for MJ: Dashboard User Preferences: Field: Scope was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Scope]=N''App'' OR [Scope]=N''Global'')', 'public ValidateScopeMustBeAppOrGlobal(result: ValidationResult) {
	if (this.Scope !== "App" && this.Scope !== "Global") {
		result.Errors.push(new ValidationErrorInfo("Scope", "Scope must be either ''App'' or ''Global''.", this.Scope, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the value of Scope must be either ''App'' or ''Global''. No other values are allowed for the Scope field.', 'ValidateScopeMustBeAppOrGlobal', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'C58AAAC7-5375-41CD-867A-0FE967C3A791');
  
            -- CHECK constraint for MJ: Dashboard User Preferences @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Scope]=''Global'' AND [ApplicationID] IS NULL OR [Scope]=''App'' AND [ApplicationID] IS NOT NULL)', 'public ValidateApplicationIDCorrectForScope(result: ValidationResult) {
	if (this.Scope === "Global" && this.ApplicationID !== null) {
		result.Errors.push(new ValidationErrorInfo("ApplicationID", "When scope is ''Global'', ApplicationID must be blank.", this.ApplicationID, ValidationErrorType.Failure));
	}
	else if (this.Scope === "App" && this.ApplicationID === null) {
		result.Errors.push(new ValidationErrorInfo("ApplicationID", "When scope is ''App'', ApplicationID must be provided.", this.ApplicationID, ValidationErrorType.Failure));
	}
}', 'This rule ensures that when the scope is set to ''Global'', the ApplicationID must be blank, and when the scope is set to ''App'', an ApplicationID must be provided.', 'ValidateApplicationIDCorrectForScope', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DDFC6120-AFAF-4002-A79A-A6AA00B0DF7B');
  
            
















/***** ADDITIONAL CODE GEN **********/
 IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c730a4d6-7966-4eb8-836f-29eecdeab11b'  OR 
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Code')
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
            'c730a4d6-7966-4eb8-836f-29eecdeab11b',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            13,
            'Code',
            'Code',
            'Key used to identify the runtime class when Dashboard Type is Code',
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
