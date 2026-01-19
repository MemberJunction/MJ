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
         '1670f39b-7e85-4c02-b0cf-7b7fa60c1df2',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1670f39b-7e85-4c02-b0cf-7b7fa60c1df2', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1670f39b-7e85-4c02-b0cf-7b7fa60c1df2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1670f39b-7e85-4c02-b0cf-7b7fa60c1df2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1670f39b-7e85-4c02-b0cf-7b7fa60c1df2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'd9be49e3-6790-4ae2-851f-6cc61b66dc3f',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd9be49e3-6790-4ae2-851f-6cc61b66dc3f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d9be49e3-6790-4ae2-851f-6cc61b66dc3f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d9be49e3-6790-4ae2-851f-6cc61b66dc3f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d9be49e3-6790-4ae2-851f-6cc61b66dc3f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         WHERE ID = '0e9b13e2-e441-4031-80b1-063059f6774e'  OR 
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
            '0e9b13e2-e441-4031-80b1-063059f6774e',
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
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2',
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
         WHERE ID = 'b96109e9-2b5b-4f0c-a2d0-7c8410942360'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'ID')
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
            'b96109e9-2b5b-4f0c-a2d0-7c8410942360',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'bde35259-1b7c-4650-86d1-3755b584945a'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'UserID')
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
            'bde35259-1b7c-4650-86d1-3755b584945a',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '481973c5-e4eb-41e2-8f4c-5302b5043f57'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'NotificationTypeID')
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
            '481973c5-e4eb-41e2-8f4c-5302b5043f57',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2',
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
         WHERE ID = 'a8093208-4bfb-4641-9b21-2a87303a7ee3'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'InAppEnabled')
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
            'a8093208-4bfb-4641-9b21-2a87303a7ee3',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '587adbc5-c327-42b5-a241-627f47f4d302'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'EmailEnabled')
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
            '587adbc5-c327-42b5-a241-627f47f4d302',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '7508c0c7-2b1a-436d-a7fc-c777e31cd065'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'SMSEnabled')
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
            '7508c0c7-2b1a-436d-a7fc-c777e31cd065',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'bc7d664f-c8fa-4c4c-8268-7d8fb09e2c6e'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'Enabled')
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
            'bc7d664f-c8fa-4c4c-8268-7d8fb09e2c6e',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '11795096-fc09-4956-9206-db678b6b8355'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = '__mj_CreatedAt')
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
            '11795096-fc09-4956-9206-db678b6b8355',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'd9221d18-cec0-444f-9f80-2d411eb09669'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = '__mj_UpdatedAt')
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
            'd9221d18-cec0-444f-9f80-2d411eb09669',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'f7c2c153-ce8a-4105-a47a-fb86010219a9'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'ID')
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
            'f7c2c153-ce8a-4105-a47a-fb86010219a9',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'da98430f-46b7-4b23-8894-1ea6d9d21bbe'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'Name')
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
            'da98430f-46b7-4b23-8894-1ea6d9d21bbe',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '7325b680-197b-412c-8018-aa33525a5056'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'Description')
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
            '7325b680-197b-412c-8018-aa33525a5056',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '61f4d28f-a563-4d61-9276-a40b93543e24'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'DefaultInApp')
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
            '61f4d28f-a563-4d61-9276-a40b93543e24',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '4f5f99c0-e6b8-4d2a-8838-a93ca3a47c02'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'DefaultEmail')
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
            '4f5f99c0-e6b8-4d2a-8838-a93ca3a47c02',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '48320ff0-62a7-487b-92ee-3a90172d163a'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'DefaultSMS')
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
            '48320ff0-62a7-487b-92ee-3a90172d163a',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '63164298-5a91-4e26-a0e5-43eb31593934'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'AllowUserPreference')
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
            '63164298-5a91-4e26-a0e5-43eb31593934',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '031c3876-04aa-4a95-8a1d-5e267393cb48'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'EmailTemplateID')
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
            '031c3876-04aa-4a95-8a1d-5e267393cb48',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'fb3a772c-c7b4-4d27-aabe-44a381c1a667'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'SMSTemplateID')
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
            'fb3a772c-c7b4-4d27-aabe-44a381c1a667',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '3916a272-2807-4bca-9ffe-c8aafa68437f'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'Icon')
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
            '3916a272-2807-4bca-9ffe-c8aafa68437f',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'd783d966-414a-404b-9308-e142e279ada6'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'Color')
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
            'd783d966-414a-404b-9308-e142e279ada6',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'd2c17b7f-0a13-43fd-aced-682d905f61c7'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'AutoExpireDays')
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
            'd2c17b7f-0a13-43fd-aced-682d905f61c7',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'c5a9c4d5-e9ce-47ab-998b-33334c35b7d4'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'Priority')
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
            'c5a9c4d5-e9ce-47ab-998b-33334c35b7d4',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'd9f82cd8-a3ac-493a-8f77-0ce43cc060a0'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = '__mj_CreatedAt')
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
            'd9f82cd8-a3ac-493a-8f77-0ce43cc060a0',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '32fd228e-d445-436c-950f-00ca20f23b77'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = '__mj_UpdatedAt')
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
            '32fd228e-d445-436c-950f-00ca20f23b77',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
      WHERE ID = '1c1adba7-1262-492b-9c1e-ec0f1cf4878f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1c1adba7-1262-492b-9c1e-ec0f1cf4878f', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', 'UserID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '7180df48-5b9a-40ee-a691-8a93c1369198'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('7180df48-5b9a-40ee-a691-8a93c1369198', '48248F34-2837-EF11-86D4-6045BDEE16E6', '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', 'SMSTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1bc0492e-5b61-4cd7-b5f3-627ddb4ea77f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1bc0492e-5b61-4cd7-b5f3-627ddb4ea77f', '48248F34-2837-EF11-86D4-6045BDEE16E6', '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', 'EmailTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0f00b4d9-52f4-47ec-93d1-884df9f4b22c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0f00b4d9-52f4-47ec-93d1-884df9f4b22c', '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', 'NotificationTypeID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'aad70727-f18d-42c8-822f-713e6b2c8527'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('aad70727-f18d-42c8-822f-713e6b2c8527', '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', '14248F34-2837-EF11-86D4-6045BDEE16E6', 'NotificationTypeID', 'One To Many', 1, 1, 'User Notifications', 1);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID A508433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A508433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID AB08433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AB08433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 9908433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9908433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 6208433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6208433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 7208433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7208433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 9C08433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9C08433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 9D08433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9D08433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 9E08433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9E08433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 6B08433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6B08433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 8708433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8708433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 6C08433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6C08433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6D08433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6D08433E-F36B-1410-8385-00BBA0B32CF2',
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

/* SQL text to update entity field related entity name field map for entity field ID BDE35259-1B7C-4650-86D1-3755B584945A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BDE35259-1B7C-4650-86D1-3755B584945A',
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

/* SQL text to update entity field related entity name field map for entity field ID 031C3876-04AA-4A95-8A1D-5E267393CB48 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='031C3876-04AA-4A95-8A1D-5E267393CB48',
         @RelatedEntityNameFieldMap='EmailTemplate'

/* SQL text to update entity field related entity name field map for entity field ID 481973C5-E4EB-41E2-8F4C-5302B5043F57 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='481973C5-E4EB-41E2-8F4C-5302B5043F57',
         @RelatedEntityNameFieldMap='NotificationType'

/* SQL text to update entity field related entity name field map for entity field ID FB3A772C-C7B4-4D27-AABE-44A381C1A667 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FB3A772C-C7B4-4D27-AABE-44A381C1A667',
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



/* SQL text to update entity field related entity name field map for entity field ID 5309433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5309433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID D008433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D008433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 5909433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5909433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID E408433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E408433E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID E908433E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E908433E-F36B-1410-8385-00BBA0B32CF2',
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

/* SQL text to update entity field related entity name field map for entity field ID 0E9B13E2-E441-4031-80B1-063059F6774E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0E9B13E2-E441-4031-80B1-063059F6774E',
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
         WHERE ID = '817f0d62-36e6-4ae6-8eff-1595384aba37'  OR 
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
            '817f0d62-36e6-4ae6-8eff-1595384aba37',
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
         WHERE ID = '0d1dcbe1-ebff-42f8-8e7f-1e15f2c0baa4'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'User')
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
            '0d1dcbe1-ebff-42f8-8e7f-1e15f2c0baa4',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'd5a712a5-e793-4cda-b899-db20ac6a3c67'  OR 
               (EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F' AND Name = 'NotificationType')
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
            'd5a712a5-e793-4cda-b899-db20ac6a3c67',
            'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '266eb4dd-1764-4ebd-8d2f-0fc743c0c3f1'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'EmailTemplate')
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
            '266eb4dd-1764-4ebd-8d2f-0fc743c0c3f1',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
         WHERE ID = '0fe58097-4d17-4cf4-b5a6-15e57643caed'  OR 
               (EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2' AND Name = 'SMSTemplate')
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
            '0fe58097-4d17-4cf4-b5a6-15e57643caed',
            '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', -- Entity: MJ: User Notification Types
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
            WHERE ID = 'DA98430F-46B7-4B23-8894-1EA6D9D21BBE'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DA98430F-46B7-4B23-8894-1EA6D9D21BBE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7325B680-197B-412C-8018-AA33525A5056'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3916A272-2807-4BCA-9FFE-C8AAFA68437F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D783D966-414A-404B-9308-E142E279ADA6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C5A9C4D5-E9CE-47AB-998B-33334C35B7D4'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DA98430F-46B7-4B23-8894-1EA6D9D21BBE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7325B680-197B-412C-8018-AA33525A5056'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '266EB4DD-1764-4EBD-8D2F-0FC743C0C3F1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0FE58097-4D17-4CF4-B5A6-15E57643CAED'
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
            WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '817F0D62-36E6-4AE6-8EFF-1595384ABA37'
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
               WHERE ID = '817F0D62-36E6-4AE6-8EFF-1595384ABA37'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '0D1DCBE1-EBFF-42F8-8E7F-1E15F2C0BAA4'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A8093208-4BFB-4641-9B21-2A87303A7EE3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '587ADBC5-C327-42B5-A241-627F47F4D302'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7508C0C7-2B1A-436D-A7FC-C777E31CD065'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BC7D664F-C8FA-4C4C-8268-7D8FB09E2C6E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0D1DCBE1-EBFF-42F8-8E7F-1E15F2C0BAA4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D5A712A5-E793-4CDA-B899-DB20AC6A3C67'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0D1DCBE1-EBFF-42F8-8E7F-1E15F2C0BAA4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D5A712A5-E793-4CDA-B899-DB20AC6A3C67'
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
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E9B13E2-E441-4031-80B1-063059F6774E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '817F0D62-36E6-4AE6-8EFF-1595384ABA37'
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
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
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
   WHERE ID = 'F7C2C153-CE8A-4105-A47A-FB86010219A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D9F82CD8-A3AC-493A-8F77-0CE43CC060A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32FD228E-D445-436C-950F-00CA20F23B77'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA98430F-46B7-4B23-8894-1EA6D9D21BBE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7325B680-197B-412C-8018-AA33525A5056'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3916A272-2807-4BCA-9FFE-C8AAFA68437F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D783D966-414A-404B-9308-E142E279ADA6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5A9C4D5-E9CE-47AB-998B-33334C35B7D4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In-App',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '61F4D28F-A563-4D61-9276-A40B93543E24'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Email',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4F5F99C0-E6B8-4D2A-8838-A93CA3A47C02'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default SMS',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48320FF0-62A7-487B-92EE-3A90172D163A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow User Preference',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '63164298-5A91-4E26-A0E5-43EB31593934'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Expire Days',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2C17B7F-0A13-43FD-ACED-682D905F61C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '031C3876-04AA-4A95-8A1D-5E267393CB48'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB3A772C-C7B4-4D27-AABE-44A381C1A667'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '266EB4DD-1764-4EBD-8D2F-0FC743C0C3F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0FE58097-4D17-4CF4-B5A6-15E57643CAED'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d8a554fe-5db8-4347-a9bd-979e0851afba', '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', 'FieldCategoryInfo', '{"Notification Details":{"icon":"fa fa-info-circle","description":"Core definition of the notification type, including name, description, visual styling and priority"},"Delivery Configuration":{"icon":"fa fa-sliders-h","description":"Default delivery channels, user preference allowance and expiration settings for the notification"},"Template Settings":{"icon":"fa fa-file-alt","description":"Associations to email and SMS templates used when the notification is sent"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('aa728e75-87bf-48c6-b26a-48684315c7a6', '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2', 'FieldCategoryIcons', '{"Notification Details":"fa fa-info-circle","Delivery Configuration":"fa fa-sliders-h","Template Settings":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '1670F39B-7E85-4C02-B0CF-7B7FA60C1DF2'
         

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B96109E9-2B5B-4F0C-A2D0-7C8410942360'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BDE35259-1B7C-4650-86D1-3755B584945A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '481973C5-E4EB-41E2-8F4C-5302B5043F57'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D1DCBE1-EBFF-42F8-8E7F-1E15F2C0BAA4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5A712A5-E793-4CDA-B899-DB20AC6A3C67'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'In-App Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8093208-4BFB-4641-9B21-2A87303A7EE3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '587ADBC5-C327-42B5-A241-627F47F4D302'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7508C0C7-2B1A-436D-A7FC-C777E31CD065'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Preference Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC7D664F-C8FA-4C4C-8268-7D8FB09E2C6E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '11795096-FC09-4956-9206-DB678B6B8355'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D9221D18-CEC0-444F-9F80-2D411EB09669'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9e150cee-46b2-40a9-a588-22d07c0d49d3', 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', 'FieldCategoryInfo', '{"Identifiers":{"icon":"fa fa-id-card","description":"Mapping of user and notification type identifiers"},"Preference Settings":{"icon":"fa fa-sliders-h","description":"Individual channel enable flags for notifications"},"System Metadata":{"icon":"fa fa-cog","description":"Audit timestamps and primary key"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('2ab2a1cc-2944-4d5a-90b1-8d589ad4a393', 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F', 'FieldCategoryIcons', '{"Identifiers":"fa fa-id-card","Preference Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'D9BE49E3-6790-4AE2-851F-6CC61B66DC3F'
         

