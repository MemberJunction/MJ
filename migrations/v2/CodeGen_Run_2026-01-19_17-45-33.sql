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
         'bcae98b7-b444-4bd4-8697-2ea72b5d0f0c',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bcae98b7-b444-4bd4-8697-2ea72b5d0f0c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bcae98b7-b444-4bd4-8697-2ea72b5d0f0c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bcae98b7-b444-4bd4-8697-2ea72b5d0f0c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bcae98b7-b444-4bd4-8697-2ea72b5d0f0c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '47cd468d-2774-42c4-9b65-e9ab5021e2a8',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '47cd468d-2774-42c4-9b65-e9ab5021e2a8', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('47cd468d-2774-42c4-9b65-e9ab5021e2a8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('47cd468d-2774-42c4-9b65-e9ab5021e2a8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('47cd468d-2774-42c4-9b65-e9ab5021e2a8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserNotificationType */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserNotificationType */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserNotificationPreference */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationPreference] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserNotificationPreference */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationPreference] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2becaadb-eec2-4f12-accd-374612527c0e'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'ID')
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
            '2becaadb-eec2-4f12-accd-374612527c0e',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '43dde93e-3c81-4234-899a-c9bcb2c052f5'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'Name')
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
            '43dde93e-3c81-4234-899a-c9bcb2c052f5',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '8bcee8af-8397-4fea-9916-a43afe448449'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'Description')
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
            '8bcee8af-8397-4fea-9916-a43afe448449',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'c2f9f556-5c1e-40f0-9a0c-5d7907b56be9'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'DefaultInApp')
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
            'c2f9f556-5c1e-40f0-9a0c-5d7907b56be9',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'a62ce989-7229-4c1a-bcee-0d53ce5e6e7e'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'DefaultEmail')
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
            'a62ce989-7229-4c1a-bcee-0d53ce5e6e7e',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'b55ad8ba-fd4f-47fe-85a6-f51005d0c2ae'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'DefaultSMS')
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
            'b55ad8ba-fd4f-47fe-85a6-f51005d0c2ae',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'a35faa8b-c819-46b2-969e-48de5b097bbe'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'AllowUserPreference')
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
            'a35faa8b-c819-46b2-969e-48de5b097bbe',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '704082d7-9d8d-4a60-a414-23ada2a42213'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'EmailTemplateID')
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
            '704082d7-9d8d-4a60-a414-23ada2a42213',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'af204e23-ba11-41a9-bb2a-b5333d2a85f1'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'SMSTemplateID')
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
            'af204e23-ba11-41a9-bb2a-b5333d2a85f1',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '983d2211-ea94-417e-9ec9-76e907f20d30'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'Icon')
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
            '983d2211-ea94-417e-9ec9-76e907f20d30',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'a11fdc8c-a6a5-4f04-b254-e1db3ec102d9'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'Color')
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
            'a11fdc8c-a6a5-4f04-b254-e1db3ec102d9',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '8dc89cfa-1357-477f-a5dc-8395bb790a31'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'AutoExpireDays')
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
            '8dc89cfa-1357-477f-a5dc-8395bb790a31',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '84cf064d-be3b-487f-a640-68e6ccd3fd44'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'Priority')
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
            '84cf064d-be3b-487f-a640-68e6ccd3fd44',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '2b820605-56ff-40be-8c8e-0905bf6ee7f9'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = '__mj_CreatedAt')
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
            '2b820605-56ff-40be-8c8e-0905bf6ee7f9',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '1d248378-6bb4-4582-9b67-e3ff23eacf0b'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = '__mj_UpdatedAt')
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
            '1d248378-6bb4-4582-9b67-e3ff23eacf0b',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = '0538e7d9-6b27-4f6c-bbe1-b6b73093dd71'  OR 
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
            '0538e7d9-6b27-4f6c-bbe1-b6b73093dd71',
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
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C',
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
         WHERE ID = 'a5fd9e06-2900-4015-960c-96e01ddb0a25'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'ID')
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
            'a5fd9e06-2900-4015-960c-96e01ddb0a25',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '10d82146-f77a-4561-b36b-38c7ec7cacec'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'UserID')
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
            '10d82146-f77a-4561-b36b-38c7ec7cacec',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '5be4e9b3-8fdb-4e02-bca5-3cd1c5db9fde'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'NotificationTypeID')
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
            '5be4e9b3-8fdb-4e02-bca5-3cd1c5db9fde',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
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
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C',
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
         WHERE ID = '11d61a6c-7986-4518-832e-0f201925e21e'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'InAppEnabled')
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
            '11d61a6c-7986-4518-832e-0f201925e21e',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '383370b7-2f35-4339-9ca2-9a24356f0665'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'EmailEnabled')
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
            '383370b7-2f35-4339-9ca2-9a24356f0665',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '64f8a8f7-f15c-4b62-aaf6-21488b9069ee'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'SMSEnabled')
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
            '64f8a8f7-f15c-4b62-aaf6-21488b9069ee',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'f2e329b5-3424-4bf7-8c1b-ae201896a65e'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'Enabled')
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
            'f2e329b5-3424-4bf7-8c1b-ae201896a65e',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '8a91764d-a26e-47ce-8c2e-ca6827ada51c'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'DigestFrequency')
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
            '8a91764d-a26e-47ce-8c2e-ca6827ada51c',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
            100008,
            'DigestFrequency',
            'Digest Frequency',
            'Email digest frequency: Disabled (no digest), Daily (24 hours), or Weekly (7 days)',
            'nvarchar',
            40,
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
         WHERE ID = 'bf8ffa3f-a122-442f-b3e2-e30246c791cb'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'DigestHourUTC')
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
            'bf8ffa3f-a122-442f-b3e2-e30246c791cb',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
            100009,
            'DigestHourUTC',
            'Digest Hour UTC',
            'Hour in UTC (0-23) when digest email should be sent',
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
         WHERE ID = '74f12c9c-e017-48bc-bee6-07a9774d629c'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'DigestDayOfWeekUTC')
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
            '74f12c9c-e017-48bc-bee6-07a9774d629c',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
            100010,
            'DigestDayOfWeekUTC',
            'Digest Day Of Week UTC',
            'Day of week for weekly digests (0=Sunday, 1=Monday, etc). Only used when DigestFrequency is Weekly.',
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
         WHERE ID = '57b77e67-8ea1-43e9-9c74-8667581b13dc'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = '__mj_CreatedAt')
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
            '57b77e67-8ea1-43e9-9c74-8667581b13dc',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
            100011,
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
         WHERE ID = '7d9836e1-1862-4797-9ae3-cffb52eea793'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = '__mj_UpdatedAt')
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
            '7d9836e1-1862-4797-9ae3-cffb52eea793',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
            100012,
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

/* SQL text to insert entity field value with ID ad811027-7e44-4003-adf6-8d6dda2fcb09 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ad811027-7e44-4003-adf6-8d6dda2fcb09', '8A91764D-A26E-47CE-8C2E-CA6827ADA51C', 1, 'Daily', 'Daily')

/* SQL text to insert entity field value with ID ba2d95dc-5f77-4d6b-b943-21fcb1a27925 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ba2d95dc-5f77-4d6b-b943-21fcb1a27925', '8A91764D-A26E-47CE-8C2E-CA6827ADA51C', 2, 'Disabled', 'Disabled')

/* SQL text to insert entity field value with ID 48a85318-9779-4df0-850c-fa780859e7eb */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('48a85318-9779-4df0-850c-fa780859e7eb', '8A91764D-A26E-47CE-8C2E-CA6827ADA51C', 3, 'Weekly', 'Weekly')

/* SQL text to update ValueListType for entity field ID 8A91764D-A26E-47CE-8C2E-CA6827ADA51C */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='8A91764D-A26E-47CE-8C2E-CA6827ADA51C'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '7d4b9bc1-aa38-4ac7-891d-443c4d9bdbd4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('7d4b9bc1-aa38-4ac7-891d-443c4d9bdbd4', 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', '14248F34-2837-EF11-86D4-6045BDEE16E6', 'NotificationTypeID', 'One To Many', 1, 1, 'User Notifications', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0469649a-7c29-4b6c-ad82-6eb3460642e2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0469649a-7c29-4b6c-ad82-6eb3460642e2', 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', '47CD468D-2774-42C4-9B65-E9AB5021E2A8', 'NotificationTypeID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd05ffabb-72b3-4125-8a35-128f69504b20'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d05ffabb-72b3-4125-8a35-128f69504b20', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '47CD468D-2774-42C4-9B65-E9AB5021E2A8', 'UserID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '84dd438c-ca57-4622-b483-35779f574c51'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('84dd438c-ca57-4622-b483-35779f574c51', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', 'EmailTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '34756303-4113-40de-b715-101ff7dda10c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('34756303-4113-40de-b715-101ff7dda10c', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', 'SMSTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID B0E3423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B0E3423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID D4E3423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D4E3423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 68E3423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='68E3423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 1EE2423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1EE2423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 7EE2423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7EE2423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 7AE3423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7AE3423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 80E3423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='80E3423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 86E3423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='86E3423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 54E2423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='54E2423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID FCE2423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FCE2423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 5AE2423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5AE2423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 60E2423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='60E2423E-F36B-1410-8385-00BBA0B32CF2',
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

/* SQL text to update entity field related entity name field map for entity field ID 10D82146-F77A-4561-B36B-38C7EC7CACEC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='10D82146-F77A-4561-B36B-38C7EC7CACEC',
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

/* SQL text to update entity field related entity name field map for entity field ID 704082D7-9D8D-4A60-A414-23ADA2A42213 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='704082D7-9D8D-4A60-A414-23ADA2A42213',
         @RelatedEntityNameFieldMap='EmailTemplate'

/* SQL text to update entity field related entity name field map for entity field ID AF204E23-BA11-41A9-BB2A-B5333D2A85F1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AF204E23-BA11-41A9-BB2A-B5333D2A85F1',
         @RelatedEntityNameFieldMap='SMSTemplate'

/* SQL text to update entity field related entity name field map for entity field ID 5BE4E9B3-8FDB-4E02-BCA5-3CD1C5DB9FDE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5BE4E9B3-8FDB-4E02-BCA5-3CD1C5DB9FDE',
         @RelatedEntityNameFieldMap='NotificationType'

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
    @Enabled bit,
    @DigestFrequency nvarchar(20),
    @DigestHourUTC int,
    @DigestDayOfWeekUTC int
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
                [Enabled],
                [DigestFrequency],
                [DigestHourUTC],
                [DigestDayOfWeekUTC]
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
                @Enabled,
                @DigestFrequency,
                @DigestHourUTC,
                @DigestDayOfWeekUTC
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
                [Enabled],
                [DigestFrequency],
                [DigestHourUTC],
                [DigestDayOfWeekUTC]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @NotificationTypeID,
                @InAppEnabled,
                @EmailEnabled,
                @SMSEnabled,
                @Enabled,
                @DigestFrequency,
                @DigestHourUTC,
                @DigestDayOfWeekUTC
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
    @Enabled bit,
    @DigestFrequency nvarchar(20),
    @DigestHourUTC int,
    @DigestDayOfWeekUTC int
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
        [Enabled] = @Enabled,
        [DigestFrequency] = @DigestFrequency,
        [DigestHourUTC] = @DigestHourUTC,
        [DigestDayOfWeekUTC] = @DigestDayOfWeekUTC
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



/* SQL text to update entity field related entity name field map for entity field ID 7DE4423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7DE4423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 48E4423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='48E4423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 54E4423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='54E4423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 7FE4423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7FE4423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 57E4423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='57E4423E-F36B-1410-8385-00BBA0B32CF2',
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

/* SQL text to update entity field related entity name field map for entity field ID 0538E7D9-6B27-4F6C-BBE1-B6B73093DD71 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0538E7D9-6B27-4F6C-BBE1-B6B73093DD71',
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
         WHERE ID = 'd472bc43-21e7-45f1-80d2-9c3ab3c9315b'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'EmailTemplate')
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
            'd472bc43-21e7-45f1-80d2-9c3ab3c9315b',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'fc7c9c1b-dc5f-47c2-8144-35ef75e2abf2'  OR 
               (EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C' AND Name = 'SMSTemplate')
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
            'fc7c9c1b-dc5f-47c2-8144-35ef75e2abf2',
            'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', -- Entity: MJ: User Notification Types
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '07db6d2c-2806-4c33-974f-b25b69e2844c'  OR 
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
            '07db6d2c-2806-4c33-974f-b25b69e2844c',
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
         WHERE ID = 'caa1b653-48d0-4192-903a-7f11e422fad8'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'User')
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
            'caa1b653-48d0-4192-903a-7f11e422fad8',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
            100025,
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
         WHERE ID = '06ddebf5-407c-4694-8661-74233785bb59'  OR 
               (EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8' AND Name = 'NotificationType')
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
            '06ddebf5-407c-4694-8661-74233785bb59',
            '47CD468D-2774-42C4-9B65-E9AB5021E2A8', -- Entity: MJ: User Notification Preferences
            100026,
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
            WHERE ID = '5C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '07DB6D2C-2806-4C33-974F-B25B69E2844C'
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
               WHERE ID = '07DB6D2C-2806-4C33-974F-B25B69E2844C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '43DDE93E-3C81-4234-899A-C9BCB2C052F5'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '43DDE93E-3C81-4234-899A-C9BCB2C052F5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8BCEE8AF-8397-4FEA-9916-A43AFE448449'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '983D2211-EA94-417E-9EC9-76E907F20D30'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A11FDC8C-A6A5-4F04-B254-E1DB3EC102D9'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '84CF064D-BE3B-487F-A640-68E6CCD3FD44'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '43DDE93E-3C81-4234-899A-C9BCB2C052F5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8BCEE8AF-8397-4FEA-9916-A43AFE448449'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D472BC43-21E7-45F1-80D2-9C3AB3C9315B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FC7C9C1B-DC5F-47C2-8144-35EF75E2ABF2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'CAA1B653-48D0-4192-903A-7F11E422FAD8'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '11D61A6C-7986-4518-832E-0F201925E21E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '383370B7-2F35-4339-9CA2-9A24356F0665'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64F8A8F7-F15C-4B62-AAF6-21488B9069EE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F2E329B5-3424-4BF7-8C1B-AE201896A65E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8A91764D-A26E-47CE-8C2E-CA6827ADA51C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CAA1B653-48D0-4192-903A-7F11E422FAD8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '06DDEBF5-407C-4694-8661-74233785BB59'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8A91764D-A26E-47CE-8C2E-CA6827ADA51C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CAA1B653-48D0-4192-903A-7F11E422FAD8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '06DDEBF5-407C-4694-8661-74233785BB59'
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
       DisplayName = 'Resource Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
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
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Type',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0538E7D9-6B27-4F6C-BBE1-B6B73093DD71'
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
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Type',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '07DB6D2C-2806-4C33-974F-B25B69E2844C'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Notification Type":{"icon":"fa fa-tag","description":"Classification details of a notification such as its category and delivery preferences"},"Notification Overview":{"icon":"fa fa-bell","description":""},"Related Resource":{"icon":"fa fa-link","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Notification Type":"fa fa-tag","Notification Overview":"fa fa-bell","Related Resource":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2BECAADB-EEC2-4F12-ACCD-374612527C0E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2B820605-56FF-40BE-8C8E-0905BF6EE7F9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D248378-6BB4-4582-9B67-E3FF23EACF0B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '43DDE93E-3C81-4234-899A-C9BCB2C052F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8BCEE8AF-8397-4FEA-9916-A43AFE448449'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '983D2211-EA94-417E-9EC9-76E907F20D30'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A11FDC8C-A6A5-4F04-B254-E1DB3EC102D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84CF064D-BE3B-487F-A640-68E6CCD3FD44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In‑App',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C2F9F556-5C1E-40F0-9A0C-5D7907B56BE9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Email',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A62CE989-7229-4C1A-BCEE-0D53CE5E6E7E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default SMS',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B55AD8BA-FD4F-47FE-85A6-F51005D0C2AE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Preference Allowed',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A35FAA8B-C819-46B2-969E-48DE5B097BBE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Expire Days',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8DC89CFA-1357-477F-A5DC-8395BB790A31'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '704082D7-9D8D-4A60-A414-23ADA2A42213'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF204E23-BA11-41A9-BB2A-B5333D2A85F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D472BC43-21E7-45F1-80D2-9C3AB3C9315B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC7C9C1B-DC5F-47C2-8144-35EF75E2ABF2'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b648a394-c39d-4729-b046-409c8a729816', 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', 'FieldCategoryInfo', '{"Notification Definition":{"icon":"fa fa-bell","description":"Core details of the notification type such as name, description, visual icon, color, and priority."},"Delivery Settings":{"icon":"fa fa-sliders-h","description":"Default delivery channel configuration, user preference options, and expiration behavior."},"Template Settings":{"icon":"fa fa-file-alt","description":"Associations to email and SMS templates (IDs and raw content) used for this notification type."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7fffb1f1-fc2e-4a9e-a005-8df451071923', 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C', 'FieldCategoryIcons', '{"Notification Definition":"fa fa-bell","Delivery Settings":"fa fa-sliders-h","Template Settings":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'BCAE98B7-B444-4BD4-8697-2EA72B5D0F0C'
         

/* Set categories for 14 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A5FD9E06-2900-4015-960C-96E01DDB0A25'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10D82146-F77A-4561-B36B-38C7EC7CACEC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BE4E9B3-8FDB-4E02-BCA5-3CD1C5DB9FDE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Channels',
       GeneratedFormSection = 'Category',
       DisplayName = 'In‑App Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '11D61A6C-7986-4518-832E-0F201925E21E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Channels',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '383370B7-2F35-4339-9CA2-9A24356F0665'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Channels',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64F8A8F7-F15C-4B62-AAF6-21488B9069EE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Channels',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2E329B5-3424-4BF7-8C1B-AE201896A65E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Digest Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Digest Frequency',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A91764D-A26E-47CE-8C2E-CA6827ADA51C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Digest Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Digest Hour (UTC)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BF8FFA3F-A122-442F-B3E2-E30246C791CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Digest Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Digest Day of Week (UTC)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '74F12C9C-E017-48BC-BEE6-07A9774D629C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '57B77E67-8EA1-43E9-9C74-8667581B13DC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D9836E1-1862-4797-9AE3-CFFB52EEA793'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CAA1B653-48D0-4192-903A-7F11E422FAD8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '06DDEBF5-407C-4694-8661-74233785BB59'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a1be3f6d-d453-4370-bee0-fc29711dd07e', '47CD468D-2774-42C4-9B65-E9AB5021E2A8', 'FieldCategoryInfo', '{"Notification Channels":{"icon":"fa fa-bell","description":"User preferences for each notification delivery method"},"Digest Settings":{"icon":"fa fa-calendar-alt","description":"Settings for email digest scheduling and timing"},"Preference Context":{"icon":"fa fa-user","description":"Links preferences to a specific user and notification type"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1f40e5c7-3777-4946-b70d-3e27e75bea47', '47CD468D-2774-42C4-9B65-E9AB5021E2A8', 'FieldCategoryIcons', '{"Notification Channels":"fa fa-bell","Digest Settings":"fa fa-calendar-alt","Preference Context":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '47CD468D-2774-42C4-9B65-E9AB5021E2A8'
         

/* Generated Validation Functions for MJ: User Notification Preferences */
-- CHECK constraint for MJ: User Notification Preferences: Field: DigestDayOfWeekUTC was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([DigestDayOfWeekUTC]>=(0) AND [DigestDayOfWeekUTC]<=(6))', 'public ValidateDigestDayOfWeekUTCRange(result: ValidationResult) {
	// Only validate when a value is provided (field is nullable)
	if (this.DigestDayOfWeekUTC != null && (this.DigestDayOfWeekUTC < 0 || this.DigestDayOfWeekUTC > 6)) {
		result.Errors.push(new ValidationErrorInfo(
			"DigestDayOfWeekUTC",
			"Digest day of week must be between 0 (Sunday) and 6 (Saturday) if specified.",
			this.DigestDayOfWeekUTC,
			ValidationErrorType.Failure
		));
	}
}', 'When a digest day of the week is set, it must be a valid day represented by a number between 0 (Sunday) and 6 (Saturday). This ensures the digest schedule can be calculated correctly.', 'ValidateDigestDayOfWeekUTCRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '74F12C9C-E017-48BC-BEE6-07A9774D629C');
  
            -- CHECK constraint for MJ: User Notification Preferences: Field: DigestHourUTC was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([DigestHourUTC]>=(0) AND [DigestHourUTC]<=(23))', 'public ValidateDigestHourUTCRange(result: ValidationResult) {
	// If a digest hour is specified, it must be between 0 and 23 (inclusive)
	if (this.DigestHourUTC != null && (this.DigestHourUTC < 0 || this.DigestHourUTC > 23)) {
		result.Errors.push(new ValidationErrorInfo(
			"DigestHourUTC",
			"Digest hour must be a value between 0 and 23 (UTC).",
			this.DigestHourUTC,
			ValidationErrorType.Failure
		));
	}
}', 'When a digest hour is set, it must be a whole hour between 0 (midnight) and 23 (11 PM) UTC, ensuring the scheduled digest occurs at a valid time of day.', 'ValidateDigestHourUTCRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'BF8FFA3F-A122-442F-B3E2-E30246C791CB');
  
            

