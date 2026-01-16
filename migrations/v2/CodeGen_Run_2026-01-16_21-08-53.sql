/* SQL generated to create new entity MJ: User Notification Types */

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
         'be28b6b8-3f70-486b-94a2-72a4ba3a9df6',
         'MJ: User Notification Types',
         'User Notification Types',
         NULL,
         NULL,
         'UserNotificationType',
         'vwUserNotificationTypes',
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
   

/* SQL generated to add new entity MJ: User Notification Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'be28b6b8-3f70-486b-94a2-72a4ba3a9df6', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('be28b6b8-3f70-486b-94a2-72a4ba3a9df6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('be28b6b8-3f70-486b-94a2-72a4ba3a9df6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('be28b6b8-3f70-486b-94a2-72a4ba3a9df6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: User Notification Preferences */

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
         '1135e274-0a28-423e-958f-595e02cde0f6',
         'MJ: User Notification Preferences',
         'User Notification Preferences',
         NULL,
         NULL,
         'UserNotificationPreference',
         'vwUserNotificationPreferences',
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
   

/* SQL generated to add new entity MJ: User Notification Preferences to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1135e274-0a28-423e-958f-595e02cde0f6', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1135e274-0a28-423e-958f-595e02cde0f6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1135e274-0a28-423e-958f-595e02cde0f6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1135e274-0a28-423e-958f-595e02cde0f6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserNotificationPreference */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationPreference] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserNotificationPreference */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationPreference] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserNotificationType */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserNotificationType */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '52e6e266-a996-4fc6-a9af-64e67615d71a'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'ID')
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
            '52e6e266-a996-4fc6-a9af-64e67615d71a',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'cc2deebe-a583-466f-9578-36895cdac6d0'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'UserID')
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
            'cc2deebe-a583-466f-9578-36895cdac6d0',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100002,
            'UserID',
            'User ID',
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
         WHERE ID = 'a73bdb33-4e7f-4ba0-adb6-fce77fb1c3c9'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'NotificationTypeID')
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
            'a73bdb33-4e7f-4ba0-adb6-fce77fb1c3c9',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100003,
            'NotificationTypeID',
            'Notification Type ID',
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
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6',
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
         WHERE ID = '30cd496b-29ef-4b0c-bdad-48504b7a658d'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'InAppEnabled')
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
            '30cd496b-29ef-4b0c-bdad-48504b7a658d',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100004,
            'InAppEnabled',
            'In App Enabled',
            'User preference for in-app notifications (NULL = use default)',
            'bit',
            1,
            1,
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
         WHERE ID = '675dd3df-8350-4304-961e-a455ccd0addb'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'EmailEnabled')
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
            '675dd3df-8350-4304-961e-a455ccd0addb',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100005,
            'EmailEnabled',
            'Email Enabled',
            'User preference for email notifications (NULL = use default)',
            'bit',
            1,
            1,
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
         WHERE ID = '34e681d2-20e1-48a7-ba2e-818def3f7bc4'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'SMSEnabled')
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
            '34e681d2-20e1-48a7-ba2e-818def3f7bc4',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100006,
            'SMSEnabled',
            'SMS Enabled',
            'User preference for SMS notifications (NULL = use default)',
            'bit',
            1,
            1,
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
         WHERE ID = 'b7b8a4ea-d666-4dcb-a68d-2d81a9e5ac22'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'Enabled')
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
            'b7b8a4ea-d666-4dcb-a68d-2d81a9e5ac22',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100007,
            'Enabled',
            'Enabled',
            NULL,
            'bit',
            1,
            1,
            0,
            1,
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
         WHERE ID = '7c9d6beb-0bb9-48c3-aeec-341139000d78'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = '__mj_CreatedAt')
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
            '7c9d6beb-0bb9-48c3-aeec-341139000d78',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '14dad513-a24e-418f-ac77-f72b32e1a680'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = '__mj_UpdatedAt')
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
            '14dad513-a24e-418f-ac77-f72b32e1a680',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '406f9a7f-0fde-4c69-abff-9b31bccdc30e'  OR 
               (EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'NotificationTypeID')
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
            '406f9a7f-0fde-4c69-abff-9b31bccdc30e',
            '14248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: User Notifications
            100026,
            'NotificationTypeID',
            'Notification Type ID',
            'Optional reference to notification type for categorization and delivery preferences',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6',
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
         WHERE ID = 'ec7e5d53-329e-4f90-9557-ae920eb910e4'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'ID')
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
            'ec7e5d53-329e-4f90-9557-ae920eb910e4',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
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
         WHERE ID = '9ed4f409-45e7-471d-890c-93ea308d06b0'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'Name')
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
            '9ed4f409-45e7-471d-890c-93ea308d06b0',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100002,
            'Name',
            'Name',
            'Unique name for the notification type (e.g., ''Agent Completion'')',
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
         WHERE ID = '64235d3d-8968-47d6-b371-43b5fe82b871'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'Description')
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
            '64235d3d-8968-47d6-b371-43b5fe82b871',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100003,
            'Description',
            'Description',
            NULL,
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
         WHERE ID = '743a995d-1bdb-4667-b978-45deef13d11d'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'DefaultInApp')
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
            '743a995d-1bdb-4667-b978-45deef13d11d',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100004,
            'DefaultInApp',
            'Default In App',
            'Whether in-app notifications are enabled by default for this type',
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
         WHERE ID = 'e0cd8af5-c711-440a-aeb3-100589946f65'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'DefaultEmail')
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
            'e0cd8af5-c711-440a-aeb3-100589946f65',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100005,
            'DefaultEmail',
            'Default Email',
            'Whether email notifications are enabled by default for this type',
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
         WHERE ID = '7812d390-a32d-49db-815f-dbc51c595eb3'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'DefaultSMS')
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
            '7812d390-a32d-49db-815f-dbc51c595eb3',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100006,
            'DefaultSMS',
            'Default SMS',
            'Whether SMS notifications are enabled by default for this type',
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
         WHERE ID = '66e7cc42-4d0e-4a8b-848b-01c9deb37836'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'AllowUserPreference')
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
            '66e7cc42-4d0e-4a8b-848b-01c9deb37836',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100007,
            'AllowUserPreference',
            'Allow User Preference',
            'Whether users can override the default delivery method',
            'bit',
            1,
            1,
            0,
            1,
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
         WHERE ID = 'e79f0307-a54b-44e9-8581-dc01bbde7d29'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'EmailTemplateID')
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
            'e79f0307-a54b-44e9-8581-dc01bbde7d29',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100008,
            'EmailTemplateID',
            'Email Template ID',
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
            '48248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = 'e425e07e-fc2c-43a0-a4f7-7ec5a48d06e5'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'SMSTemplateID')
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
            'e425e07e-fc2c-43a0-a4f7-7ec5a48d06e5',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100009,
            'SMSTemplateID',
            'SMS Template ID',
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
            '48248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '8a5c7d1c-da73-4b8f-8604-cc80e3927dfd'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'Icon')
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
            '8a5c7d1c-da73-4b8f-8604-cc80e3927dfd',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100010,
            'Icon',
            'Icon',
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
         WHERE ID = 'be7c7ff1-e0ab-4263-a0b2-66cb0d9428b3'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'Color')
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
            'be7c7ff1-e0ab-4263-a0b2-66cb0d9428b3',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100011,
            'Color',
            'Color',
            NULL,
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
         WHERE ID = '30cf85a9-d532-4c91-82dd-8ddda372c2a9'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'AutoExpireDays')
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
            '30cf85a9-d532-4c91-82dd-8ddda372c2a9',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100012,
            'AutoExpireDays',
            'Auto Expire Days',
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
         WHERE ID = 'efebbcd8-feee-4dad-989a-92ef12ea1488'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'Priority')
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
            'efebbcd8-feee-4dad-989a-92ef12ea1488',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100013,
            'Priority',
            'Priority',
            NULL,
            'int',
            4,
            10,
            0,
            1,
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
         WHERE ID = '60b2c901-fe1c-4277-873a-d0b45a132d1f'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = '__mj_CreatedAt')
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
            '60b2c901-fe1c-4277-873a-d0b45a132d1f',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'dfb5d333-1665-41eb-945e-93ac41d2c962'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = '__mj_UpdatedAt')
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
            'dfb5d333-1665-41eb-945e-93ac41d2c962',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
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
      WHERE ID = '0667a8e5-fe1d-4ce2-9e93-67e8f0d19545'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0667a8e5-fe1d-4ce2-9e93-67e8f0d19545', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '1135E274-0A28-423E-958F-595E02CDE0F6', 'UserID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b3dd0992-059e-48e3-9624-fd663d5486b5'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b3dd0992-059e-48e3-9624-fd663d5486b5', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', 'SMSTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5f3cbcda-d0af-4c8f-ac0f-872d0e6d72f5'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5f3cbcda-d0af-4c8f-ac0f-872d0e6d72f5', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', 'EmailTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '866699a7-7ebc-4b58-a6ad-fb3df5be1729'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('866699a7-7ebc-4b58-a6ad-fb3df5be1729', 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', '1135E274-0A28-423E-958F-595E02CDE0F6', 'NotificationTypeID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6f771dae-b36d-4dfa-a55b-023f86660f02'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6f771dae-b36d-4dfa-a55b-023f86660f02', 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', '14248F34-2837-EF11-86D4-6045BDEE16E6', 'NotificationTypeID', 'One To Many', 1, 1, 'User Notifications', 1);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID C80A433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C80A433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID E00A433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E00A433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 980A433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='980A433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID BC09433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BC09433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID FC09433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FC09433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID A40A433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A40A433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID A80A433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A80A433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID AC0A433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AC0A433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID E009433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E009433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 500A433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='500A433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID E409433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E409433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID E809433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E809433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for UserNotificationPreference */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserNotificationPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationPreference_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationPreference_UserID ON [${flyway:defaultSchema}].[UserNotificationPreference] ([UserID]);

-- Index for foreign key NotificationTypeID in table UserNotificationPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationPreference_NotificationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationPreference_NotificationTypeID ON [${flyway:defaultSchema}].[UserNotificationPreference] ([NotificationTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID CC2DEEBE-A583-466F-9578-36895CDAC6D0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CC2DEEBE-A583-466F-9578-36895CDAC6D0',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for UserNotificationType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EmailTemplateID in table UserNotificationType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationType_EmailTemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationType_EmailTemplateID ON [${flyway:defaultSchema}].[UserNotificationType] ([EmailTemplateID]);

-- Index for foreign key SMSTemplateID in table UserNotificationType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationType_SMSTemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationType_SMSTemplateID ON [${flyway:defaultSchema}].[UserNotificationType] ([SMSTemplateID]);

/* SQL text to update entity field related entity name field map for entity field ID E79F0307-A54B-44E9-8581-DC01BBDE7D29 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E79F0307-A54B-44E9-8581-DC01BBDE7D29',
         @RelatedEntityNameFieldMap='EmailTemplate'

/* SQL text to update entity field related entity name field map for entity field ID A73BDB33-4E7F-4BA0-ADB6-FCE77FB1C3C9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A73BDB33-4E7F-4BA0-ADB6-FCE77FB1C3C9',
         @RelatedEntityNameFieldMap='NotificationType'

/* SQL text to update entity field related entity name field map for entity field ID E425E07E-FC2C-43A0-A4F7-7EC5A48D06E5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E425E07E-FC2C-43A0-A4F7-7EC5A48D06E5',
         @RelatedEntityNameFieldMap='SMSTemplate'

/* Base View SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: vwUserNotificationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Notification Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotificationType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotificationTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotificationTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotificationTypes]
AS
SELECT
    u.*,
    Template_EmailTemplateID.[Name] AS [EmailTemplate],
    Template_SMSTemplateID.[Name] AS [SMSTemplate]
FROM
    [${flyway:defaultSchema}].[UserNotificationType] AS u
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_EmailTemplateID
  ON
    [u].[EmailTemplateID] = Template_EmailTemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_SMSTemplateID
  ON
    [u].[SMSTemplateID] = Template_SMSTemplateID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: Permissions for vwUserNotificationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: spCreateUserNotificationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotificationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotificationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @DefaultInApp bit = NULL,
    @DefaultEmail bit = NULL,
    @DefaultSMS bit = NULL,
    @AllowUserPreference bit,
    @EmailTemplateID uniqueidentifier,
    @SMSTemplateID uniqueidentifier,
    @Icon nvarchar(100),
    @Color nvarchar(50),
    @AutoExpireDays int,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationType]
            (
                [ID],
                [Name],
                [Description],
                [DefaultInApp],
                [DefaultEmail],
                [DefaultSMS],
                [AllowUserPreference],
                [EmailTemplateID],
                [SMSTemplateID],
                [Icon],
                [Color],
                [AutoExpireDays],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@DefaultInApp, 1),
                ISNULL(@DefaultEmail, 0),
                ISNULL(@DefaultSMS, 0),
                @AllowUserPreference,
                @EmailTemplateID,
                @SMSTemplateID,
                @Icon,
                @Color,
                @AutoExpireDays,
                @Priority
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationType]
            (
                [Name],
                [Description],
                [DefaultInApp],
                [DefaultEmail],
                [DefaultSMS],
                [AllowUserPreference],
                [EmailTemplateID],
                [SMSTemplateID],
                [Icon],
                [Color],
                [AutoExpireDays],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@DefaultInApp, 1),
                ISNULL(@DefaultEmail, 0),
                ISNULL(@DefaultSMS, 0),
                @AllowUserPreference,
                @EmailTemplateID,
                @SMSTemplateID,
                @Icon,
                @Color,
                @AutoExpireDays,
                @Priority
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotificationTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: User Notification Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: spUpdateUserNotificationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotificationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotificationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @DefaultInApp bit,
    @DefaultEmail bit,
    @DefaultSMS bit,
    @AllowUserPreference bit,
    @EmailTemplateID uniqueidentifier,
    @SMSTemplateID uniqueidentifier,
    @Icon nvarchar(100),
    @Color nvarchar(50),
    @AutoExpireDays int,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DefaultInApp] = @DefaultInApp,
        [DefaultEmail] = @DefaultEmail,
        [DefaultSMS] = @DefaultSMS,
        [AllowUserPreference] = @AllowUserPreference,
        [EmailTemplateID] = @EmailTemplateID,
        [SMSTemplateID] = @SMSTemplateID,
        [Icon] = @Icon,
        [Color] = @Color,
        [AutoExpireDays] = @AutoExpireDays,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotificationTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotificationTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotificationType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotificationType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotificationType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotificationType
ON [${flyway:defaultSchema}].[UserNotificationType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotificationType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: User Notification Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: spDeleteUserNotificationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotificationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotificationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotificationType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: User Notification Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationType] TO [cdp_Integration]



/* Base View SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: vwUserNotificationPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Notification Preferences
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotificationPreference
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotificationPreferences]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotificationPreferences];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotificationPreferences]
AS
SELECT
    u.*,
    User_UserID.[Name] AS [User],
    UserNotificationType_NotificationTypeID.[Name] AS [NotificationType]
FROM
    [${flyway:defaultSchema}].[UserNotificationPreference] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[UserNotificationType] AS UserNotificationType_NotificationTypeID
  ON
    [u].[NotificationTypeID] = UserNotificationType_NotificationTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: Permissions for vwUserNotificationPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: spCreateUserNotificationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotificationPreference
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotificationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationPreference];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationPreference]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @NotificationTypeID uniqueidentifier,
    @InAppEnabled bit,
    @EmailEnabled bit,
    @SMSEnabled bit,
    @Enabled bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationPreference]
            (
                [ID],
                [UserID],
                [NotificationTypeID],
                [InAppEnabled],
                [EmailEnabled],
                [SMSEnabled],
                [Enabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @NotificationTypeID,
                @InAppEnabled,
                @EmailEnabled,
                @SMSEnabled,
                @Enabled
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationPreference]
            (
                [UserID],
                [NotificationTypeID],
                [InAppEnabled],
                [EmailEnabled],
                [SMSEnabled],
                [Enabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @NotificationTypeID,
                @InAppEnabled,
                @EmailEnabled,
                @SMSEnabled,
                @Enabled
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotificationPreferences] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: User Notification Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: spUpdateUserNotificationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotificationPreference
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotificationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationPreference];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationPreference]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @NotificationTypeID uniqueidentifier,
    @InAppEnabled bit,
    @EmailEnabled bit,
    @SMSEnabled bit,
    @Enabled bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationPreference]
    SET
        [UserID] = @UserID,
        [NotificationTypeID] = @NotificationTypeID,
        [InAppEnabled] = @InAppEnabled,
        [EmailEnabled] = @EmailEnabled,
        [SMSEnabled] = @SMSEnabled,
        [Enabled] = @Enabled
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotificationPreferences] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotificationPreferences]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotificationPreference table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotificationPreference]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotificationPreference];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotificationPreference
ON [${flyway:defaultSchema}].[UserNotificationPreference]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationPreference]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotificationPreference] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: User Notification Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: spDeleteUserNotificationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotificationPreference
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotificationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationPreference];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationPreference]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotificationPreference]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationPreference] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: User Notification Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationPreference] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID A50B433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A50B433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 3E0B433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3E0B433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 520B433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='520B433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID AB0B433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AB0B433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 570B433E-F36B-1410-8F32-001BEBCB62EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='570B433E-F36B-1410-8F32-001BEBCB62EB',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for UserNotification */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_UserID ON [${flyway:defaultSchema}].[UserNotification] ([UserID]);

-- Index for foreign key ResourceTypeID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID ON [${flyway:defaultSchema}].[UserNotification] ([ResourceTypeID]);

-- Index for foreign key NotificationTypeID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_NotificationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_NotificationTypeID ON [${flyway:defaultSchema}].[UserNotification] ([NotificationTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 406F9A7F-0FDE-4C69-ABFF-9B31BCCDC30E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='406F9A7F-0FDE-4C69-ABFF-9B31BCCDC30E',
         @RelatedEntityNameFieldMap='NotificationType'

/* Base View SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User Notifications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotification
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotifications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotifications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotifications]
AS
SELECT
    u.*,
    User_UserID.[Name] AS [User],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType],
    UserNotificationType_NotificationTypeID.[Name] AS [NotificationType]
FROM
    [${flyway:defaultSchema}].[UserNotification] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [u].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserNotificationType] AS UserNotificationType_NotificationTypeID
  ON
    [u].[NotificationTypeID] = UserNotificationType_NotificationTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Permissions for vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spCreateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit = NULL,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier,
    @NotificationTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [ID],
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID],
                [NotificationTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID,
                @NotificationTypeID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID],
                [NotificationTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID,
                @NotificationTypeID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spUpdateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier,
    @NotificationTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        [UserID] = @UserID,
        [Title] = @Title,
        [Message] = @Message,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceConfiguration] = @ResourceConfiguration,
        [Unread] = @Unread,
        [ReadAt] = @ReadAt,
        [ResourceRecordID] = @ResourceRecordID,
        [NotificationTypeID] = @NotificationTypeID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotifications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotification table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotification]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotification];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotification
ON [${flyway:defaultSchema}].[UserNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotification] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spDeleteUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotification]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for User Notifications */




/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9da363fd-c4fb-44bc-9942-b2834081e2b2'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'User')
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
            '9da363fd-c4fb-44bc-9942-b2834081e2b2',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100019,
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
         WHERE ID = 'b1b74b01-1dbd-405e-a2f5-e0cdb4e4d352'  OR 
               (EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6' AND Name = 'NotificationType')
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
            'b1b74b01-1dbd-405e-a2f5-e0cdb4e4d352',
            '1135E274-0A28-423E-958F-595E02CDE0F6', -- Entity: MJ: User Notification Preferences
            100020,
            'NotificationType',
            'Notification Type',
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
         WHERE ID = '24b007f0-a44e-46ab-928b-90e2ea0aaa69'  OR 
               (EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'NotificationType')
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
            '24b007f0-a44e-46ab-928b-90e2ea0aaa69',
            '14248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: User Notifications
            100029,
            'NotificationType',
            'Notification Type',
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
         WHERE ID = '841a6c5a-098e-4dd5-81fd-34d414af20a1'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'EmailTemplate')
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
            '841a6c5a-098e-4dd5-81fd-34d414af20a1',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100031,
            'EmailTemplate',
            'Email Template',
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
         WHERE ID = '005c41a6-1a30-4414-bec3-26a3fe63dae8'  OR 
               (EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6' AND Name = 'SMSTemplate')
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
            '005c41a6-1a30-4414-bec3-26a3fe63dae8',
            'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', -- Entity: MJ: User Notification Types
            100032,
            'SMSTemplate',
            'SMS Template',
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
            WHERE ID = '9ED4F409-45E7-471D-890C-93EA308D06B0'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9ED4F409-45E7-471D-890C-93EA308D06B0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64235D3D-8968-47D6-B371-43B5FE82B871'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '743A995D-1BDB-4667-B978-45DEEF13D11D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E0CD8AF5-C711-440A-AEB3-100589946F65'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7812D390-A32D-49DB-815F-DBC51C595EB3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8A5C7D1C-DA73-4B8F-8604-CC80E3927DFD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BE7C7FF1-E0AB-4263-A0B2-66CB0D9428B3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EFEBBCD8-FEEE-4DAD-989A-92EF12EA1488'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9ED4F409-45E7-471D-890C-93EA308D06B0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '64235D3D-8968-47D6-B371-43B5FE82B871'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '841A6C5A-098E-4DD5-81FD-34D414AF20A1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '005C41A6-1A30-4414-BEC3-26A3FE63DAE8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '24B007F0-A44E-46AB-928B-90E2EA0AAA69'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '24B007F0-A44E-46AB-928B-90E2EA0AAA69'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '9DA363FD-C4FB-44BC-9942-B2834081E2B2'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '30CD496B-29EF-4B0C-BDAD-48504B7A658D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '675DD3DF-8350-4304-961E-A455CCD0ADDB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '34E681D2-20E1-48A7-BA2E-818DEF3F7BC4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B7B8A4EA-D666-4DCB-A68D-2D81A9E5AC22'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9DA363FD-C4FB-44BC-9942-B2834081E2B2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B1B74B01-1DBD-405E-A2F5-E0CDB4E4D352'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9DA363FD-C4FB-44BC-9942-B2834081E2B2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B1B74B01-1DBD-405E-A2F5-E0CDB4E4D352'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '544F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '554F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '574F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Unread',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Read At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '406F9A7F-0FDE-4C69-ABFF-9B31BCCDC30E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24B007F0-A44E-46AB-928B-90E2EA0AAA69'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '584F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Notification Overview":{"icon":"fa fa-bell","description":""},"Related Resource":{"icon":"fa fa-link","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Notification Overview":"fa fa-bell","Related Resource":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC7E5D53-329E-4F90-9557-AE920EB910E4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9ED4F409-45E7-471D-890C-93EA308D06B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64235D3D-8968-47D6-B371-43B5FE82B871'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In-App',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '743A995D-1BDB-4667-B978-45DEEF13D11D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Email',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0CD8AF5-C711-440A-AEB3-100589946F65'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default SMS',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7812D390-A32D-49DB-815F-DBC51C595EB3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow User Preference',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '66E7CC42-4D0E-4A8B-848B-01C9DEB37836'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E79F0307-A54B-44E9-8581-DC01BBDE7D29'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E425E07E-FC2C-43A0-A4F7-7EC5A48D06E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A5C7D1C-DA73-4B8F-8604-CC80E3927DFD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BE7C7FF1-E0AB-4263-A0B2-66CB0D9428B3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Expire Days',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '30CF85A9-D532-4C91-82DD-8DDDA372C2A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFEBBCD8-FEEE-4DAD-989A-92EF12EA1488'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '60B2C901-FE1C-4277-873A-D0B45A132D1F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFB5D333-1665-41EB-945E-93AC41D2C962'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '841A6C5A-098E-4DD5-81FD-34D414AF20A1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '005C41A6-1A30-4414-BEC3-26A3FE63DAE8'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9eccb770-1cd4-4890-9e27-260a30cc24a4', 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', 'FieldCategoryInfo', '{"Core Details":{"icon":"fa fa-info-circle","description":"Defines the notification type''s identity, visual styling, and lifecycle settings"},"Delivery Settings":{"icon":"fa fa-bell","description":"Default channel configuration and user preference allowance for notifications"},"Template Settings":{"icon":"fa fa-file-alt","description":"Associations to email and SMS templates, both IDs and content"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields for record creation and modification tracking"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b523e347-7936-443a-a2c3-e63ed6ef670f', 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6', 'FieldCategoryIcons', '{"Core Details":"fa fa-info-circle","Delivery Settings":"fa fa-bell","Template Settings":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'BE28B6B8-3F70-486B-94A2-72A4BA3A9DF6'
         

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52E6E266-A996-4FC6-A9AF-64E67615D71A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C9D6BEB-0BB9-48C3-AEEC-341139000D78'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '14DAD513-A24E-418F-AC77-F72B32E1A680'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC2DEEBE-A583-466F-9578-36895CDAC6D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9DA363FD-C4FB-44BC-9942-B2834081E2B2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A73BDB33-4E7F-4BA0-ADB6-FCE77FB1C3C9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B1B74B01-1DBD-405E-A2F5-E0CDB4E4D352'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'In‑App Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '30CD496B-29EF-4B0C-BDAD-48504B7A658D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '675DD3DF-8350-4304-961E-A455CCD0ADDB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '34E681D2-20E1-48A7-BA2E-818DEF3F7BC4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7B8A4EA-D666-4DCB-A68D-2D81A9E5AC22'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '1135E274-0A28-423E-958F-595E02CDE0F6'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0b45e659-0ff9-407a-ac1f-6bae9bd4664d', '1135E274-0A28-423E-958F-595E02CDE0F6', 'FieldCategoryInfo', '{"Preference Mapping":{"icon":"fa fa-link","description":"Links a user to a notification type with readable names"},"Channel Settings":{"icon":"fa fa-sliders-h","description":"User''s channel‑specific enable/disable settings for notifications"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking creation and updates"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a334a169-d430-4792-9963-dd18ad5d446b', '1135E274-0A28-423E-958F-595E02CDE0F6', 'FieldCategoryIcons', '{"Preference Mapping":"fa fa-link","Channel Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '1135E274-0A28-423E-958F-595E02CDE0F6'
         

