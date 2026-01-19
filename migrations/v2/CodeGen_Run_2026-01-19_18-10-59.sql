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
         'd4547a06-0b74-42d6-bc70-b1896e7cc1b4',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd4547a06-0b74-42d6-bc70-b1896e7cc1b4', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d4547a06-0b74-42d6-bc70-b1896e7cc1b4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d4547a06-0b74-42d6-bc70-b1896e7cc1b4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d4547a06-0b74-42d6-bc70-b1896e7cc1b4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '818ea2c9-daaf-4473-84b5-30420ad6f0fb',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '818ea2c9-daaf-4473-84b5-30420ad6f0fb', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('818ea2c9-daaf-4473-84b5-30420ad6f0fb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('818ea2c9-daaf-4473-84b5-30420ad6f0fb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('818ea2c9-daaf-4473-84b5-30420ad6f0fb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         WHERE ID = 'd4fad977-ca2b-4c44-b090-aa1f2fcef7a6'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd4fad977-ca2b-4c44-b090-aa1f2fcef7a6',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'cf44446f-5e26-4cb6-acb9-e7614f085ea2'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cf44446f-5e26-4cb6-acb9-e7614f085ea2',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '3b3686c0-5b0f-40ee-9685-573a85cea01f'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'NotificationTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3b3686c0-5b0f-40ee-9685-573a85cea01f',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4',
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
         WHERE ID = 'e75bff3e-ecd1-4380-b598-5836968b2659'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'InAppEnabled')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e75bff3e-ecd1-4380-b598-5836968b2659',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '1612d059-f9fd-4cc1-b022-13d29a5c43b4'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'EmailEnabled')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1612d059-f9fd-4cc1-b022-13d29a5c43b4',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'dd49dbb7-3331-4ce2-9e64-5a476b72f113'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'SMSEnabled')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dd49dbb7-3331-4ce2-9e64-5a476b72f113',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '848c9cfd-49cf-434e-8242-e9c0226eb36a'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'Enabled')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '848c9cfd-49cf-434e-8242-e9c0226eb36a',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '2197c597-35a7-4950-879f-93f61f1296ac'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2197c597-35a7-4950-879f-93f61f1296ac',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '83bc6540-804c-4b60-8c84-a51f19a5fe5c'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '83bc6540-804c-4b60-8c84-a51f19a5fe5c',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'b6c63bce-d0e9-4589-8a5b-59bd6accadc0'  OR 
               (EntityID = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DigestFrequency')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b6c63bce-d0e9-4589-8a5b-59bd6accadc0',
            'E1238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Users
            100042,
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
         WHERE ID = 'fca816e2-ad29-4026-997c-d7f8dfaf97eb'  OR 
               (EntityID = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DigestHourUTC')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fca816e2-ad29-4026-997c-d7f8dfaf97eb',
            'E1238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Users
            100043,
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
         WHERE ID = 'c44a60a2-7c62-43f4-8aa7-e6b84487a6cd'  OR 
               (EntityID = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DigestDayOfWeekUTC')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c44a60a2-7c62-43f4-8aa7-e6b84487a6cd',
            'E1238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Users
            100044,
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
         WHERE ID = '9e037386-e391-48f5-b568-f0e35d6f14e1'  OR 
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
            '9e037386-e391-48f5-b568-f0e35d6f14e1',
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
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4',
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
         WHERE ID = '5ff1d262-b85f-41d0-baed-441370d12e99'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5ff1d262-b85f-41d0-baed-441370d12e99',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '1bc33724-fe71-481b-8c0e-f497242c6f37'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1bc33724-fe71-481b-8c0e-f497242c6f37',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '3bbcdd18-a2bf-4435-8783-6e734a249d9b'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3bbcdd18-a2bf-4435-8783-6e734a249d9b',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '0a30089e-867b-42d9-bbd1-e4c93162040c'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'DefaultInApp')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0a30089e-867b-42d9-bbd1-e4c93162040c',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'a570322f-f80d-4236-baf8-3bcce952638e'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'DefaultEmail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a570322f-f80d-4236-baf8-3bcce952638e',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '55537864-1881-4166-803c-b603d3d5d32f'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'DefaultSMS')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '55537864-1881-4166-803c-b603d3d5d32f',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '37e162e6-e510-4f32-9783-caf4992fde1a'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'AllowUserPreference')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '37e162e6-e510-4f32-9783-caf4992fde1a',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '59d5b219-c50b-414e-86e7-b1a27c5b072a'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'EmailTemplateID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '59d5b219-c50b-414e-86e7-b1a27c5b072a',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '984c996a-d6a0-4744-910b-6e23ec7b3069'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'SMSTemplateID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '984c996a-d6a0-4744-910b-6e23ec7b3069',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '32595a3b-97fe-4942-82b7-7dc7ba2707d0'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'Icon')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '32595a3b-97fe-4942-82b7-7dc7ba2707d0',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '294947c6-444e-48a0-979e-026314151cc7'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'Color')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '294947c6-444e-48a0-979e-026314151cc7',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'e6e5403e-fa77-45a7-8316-86714711a4b6'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'AutoExpireDays')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e6e5403e-fa77-45a7-8316-86714711a4b6',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '143d00c7-8e72-42d0-ad04-97e1e945f291'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '143d00c7-8e72-42d0-ad04-97e1e945f291',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'a89df1e4-3314-4a61-9d29-b6617a0e43e2'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a89df1e4-3314-4a61-9d29-b6617a0e43e2',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = '17108bfe-46f8-47d4-a4a4-3f7edf2d55df'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '17108bfe-46f8-47d4-a4a4-3f7edf2d55df',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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

/* SQL text to insert entity field value with ID 3212825e-120f-4757-b2e9-d6001baf2fb1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3212825e-120f-4757-b2e9-d6001baf2fb1', 'B6C63BCE-D0E9-4589-8A5B-59BD6ACCADC0', 1, 'Daily', 'Daily')

/* SQL text to insert entity field value with ID de169884-25c0-4c09-8a1e-36d74da7cfec */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('de169884-25c0-4c09-8a1e-36d74da7cfec', 'B6C63BCE-D0E9-4589-8A5B-59BD6ACCADC0', 2, 'Disabled', 'Disabled')

/* SQL text to insert entity field value with ID d4df691c-c98d-4b3e-8c1c-a86fa6eaa939 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d4df691c-c98d-4b3e-8c1c-a86fa6eaa939', 'B6C63BCE-D0E9-4589-8A5B-59BD6ACCADC0', 3, 'Weekly', 'Weekly')

/* SQL text to update ValueListType for entity field ID B6C63BCE-D0E9-4589-8A5B-59BD6ACCADC0 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B6C63BCE-D0E9-4589-8A5B-59BD6ACCADC0'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5d9b9c97-d88d-4654-8e84-701f36e60f17'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5d9b9c97-d88d-4654-8e84-701f36e60f17', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', 'UserID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'edf45779-3528-4e23-bdbb-b53e06cb162b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('edf45779-3528-4e23-bdbb-b53e06cb162b', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', 'EmailTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8b9e7390-cc02-4f3a-9945-79c16f418d85'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8b9e7390-cc02-4f3a-9945-79c16f418d85', '48248F34-2837-EF11-86D4-6045BDEE16E6', 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', 'SMSTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f8548d43-35e7-496f-9b8c-66d85cc862cb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f8548d43-35e7-496f-9b8c-66d85cc862cb', 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', '14248F34-2837-EF11-86D4-6045BDEE16E6', 'NotificationTypeID', 'One To Many', 1, 1, 'User Notifications', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1940a297-4c99-4fc4-9c02-2a17a0d52fff'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1940a297-4c99-4fc4-9c02-2a17a0d52fff', 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', 'NotificationTypeID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID AFF5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AFF5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID B5F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B5F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID A3F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A3F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 6CF5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6CF5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 7CF5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7CF5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID A6F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A6F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID A7F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A7F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID A8F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A8F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 75F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='75F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 91F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='91F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 76F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='76F5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 77F5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='77F5423E-F36B-1410-8385-00BBA0B32CF2',
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

/* SQL text to update entity field related entity name field map for entity field ID CF44446F-5E26-4CB6-ACB9-E7614F085EA2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CF44446F-5E26-4CB6-ACB9-E7614F085EA2',
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

/* SQL text to update entity field related entity name field map for entity field ID 59D5B219-C50B-414E-86E7-B1A27C5B072A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='59D5B219-C50B-414E-86E7-B1A27C5B072A',
         @RelatedEntityNameFieldMap='EmailTemplate'

/* SQL text to update entity field related entity name field map for entity field ID 3B3686C0-5B0F-40EE-9685-573A85CEA01F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3B3686C0-5B0F-40EE-9685-573A85CEA01F',
         @RelatedEntityNameFieldMap='NotificationType'

/* SQL text to update entity field related entity name field map for entity field ID 984C996A-D6A0-4744-910B-6E23EC7B3069 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='984C996A-D6A0-4744-910B-6E23EC7B3069',
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



/* SQL text to update entity field related entity name field map for entity field ID 1DF6423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1DF6423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID CEF5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CEF5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 22F6423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='22F6423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID DAF5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DAF5423E-F36B-1410-8385-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID DDF5423E-F36B-1410-8385-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DDF5423E-F36B-1410-8385-00BBA0B32CF2',
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

/* SQL text to update entity field related entity name field map for entity field ID 9E037386-E391-48F5-B568-F0E35D6F14E1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9E037386-E391-48F5-B568-F0E35D6F14E1',
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




/* Index for Foreign Keys for UserRecordLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_UserID ON [${flyway:defaultSchema}].[UserRecordLog] ([UserID]);

-- Index for foreign key EntityID in table UserRecordLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserRecordLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserRecordLog_EntityID ON [${flyway:defaultSchema}].[UserRecordLog] ([EntityID]);

/* Base View Permissions SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: Permissions for vwUserRecordLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserRecordLogs] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spCreateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetimeoffset = NULL,
    @LatestAt datetimeoffset = NULL,
    @TotalCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [ID],
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spUpdateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetimeoffset,
    @LatestAt datetimeoffset,
    @TotalCount int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [EarliestAt] = @EarliestAt,
        [LatestAt] = @LatestAt,
        [TotalCount] = @TotalCount
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserRecordLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserRecordLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRecordLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRecordLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRecordLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRecordLog
ON [${flyway:defaultSchema}].[UserRecordLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRecordLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Record Logs
-- Item: spDeleteUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserRecordLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserRecordLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserRecordLog] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for UserView */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_UserID ON [${flyway:defaultSchema}].[UserView] ([UserID]);

-- Index for foreign key EntityID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_EntityID ON [${flyway:defaultSchema}].[UserView] ([EntityID]);

-- Index for foreign key CategoryID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_CategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_CategoryID ON [${flyway:defaultSchema}].[UserView] ([CategoryID]);

/* Base View Permissions SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Permissions for vwUserViews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViews] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spCreateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserView]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit = NULL,
    @IsDefault bit = NULL,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit = NULL,
    @SmartFilterEnabled bit = NULL,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit = NULL,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX),
    @CardState nvarchar(MAX),
    @DisplayState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserView]
            (
                [ID],
                [UserID],
                [EntityID],
                [Name],
                [Description],
                [CategoryID],
                [IsShared],
                [IsDefault],
                [GridState],
                [FilterState],
                [CustomFilterState],
                [SmartFilterEnabled],
                [SmartFilterPrompt],
                [SmartFilterWhereClause],
                [SmartFilterExplanation],
                [WhereClause],
                [CustomWhereClause],
                [SortState],
                [Thumbnail],
                [CardState],
                [DisplayState]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @Name,
                @Description,
                @CategoryID,
                ISNULL(@IsShared, 0),
                ISNULL(@IsDefault, 0),
                @GridState,
                @FilterState,
                ISNULL(@CustomFilterState, 0),
                ISNULL(@SmartFilterEnabled, 0),
                @SmartFilterPrompt,
                @SmartFilterWhereClause,
                @SmartFilterExplanation,
                @WhereClause,
                ISNULL(@CustomWhereClause, 0),
                @SortState,
                @Thumbnail,
                @CardState,
                @DisplayState
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserView]
            (
                [UserID],
                [EntityID],
                [Name],
                [Description],
                [CategoryID],
                [IsShared],
                [IsDefault],
                [GridState],
                [FilterState],
                [CustomFilterState],
                [SmartFilterEnabled],
                [SmartFilterPrompt],
                [SmartFilterWhereClause],
                [SmartFilterExplanation],
                [WhereClause],
                [CustomWhereClause],
                [SortState],
                [Thumbnail],
                [CardState],
                [DisplayState]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @Name,
                @Description,
                @CategoryID,
                ISNULL(@IsShared, 0),
                ISNULL(@IsDefault, 0),
                @GridState,
                @FilterState,
                ISNULL(@CustomFilterState, 0),
                ISNULL(@SmartFilterEnabled, 0),
                @SmartFilterPrompt,
                @SmartFilterWhereClause,
                @SmartFilterExplanation,
                @WhereClause,
                ISNULL(@CustomWhereClause, 0),
                @SortState,
                @Thumbnail,
                @CardState,
                @DisplayState
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spUpdateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX),
    @CardState nvarchar(MAX),
    @DisplayState nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [IsShared] = @IsShared,
        [IsDefault] = @IsDefault,
        [GridState] = @GridState,
        [FilterState] = @FilterState,
        [CustomFilterState] = @CustomFilterState,
        [SmartFilterEnabled] = @SmartFilterEnabled,
        [SmartFilterPrompt] = @SmartFilterPrompt,
        [SmartFilterWhereClause] = @SmartFilterWhereClause,
        [SmartFilterExplanation] = @SmartFilterExplanation,
        [WhereClause] = @WhereClause,
        [CustomWhereClause] = @CustomWhereClause,
        [SortState] = @SortState,
        [Thumbnail] = @Thumbnail,
        [CardState] = @CardState,
        [DisplayState] = @DisplayState
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViews]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserView table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserView]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserView];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserView
ON [${flyway:defaultSchema}].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserView] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spDeleteUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserView
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserView]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserView]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Index for Foreign Keys for User */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key LinkedEntityID in table User
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_User_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[User]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_User_LinkedEntityID ON [${flyway:defaultSchema}].[User] ([LinkedEntityID]);

-- Index for foreign key EmployeeID in table User
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_User_EmployeeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[User]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_User_EmployeeID ON [${flyway:defaultSchema}].[User] ([EmployeeID]);

/* Base View Permissions SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: Permissions for vwUsers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUsers] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spCreateUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUser]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUser];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUser]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit = NULL,
    @LinkedRecordType nchar(10) = NULL,
    @LinkedEntityID uniqueidentifier,
    @LinkedEntityRecordID nvarchar(450),
    @EmployeeID uniqueidentifier,
    @UserImageURL nvarchar(MAX),
    @UserImageIconClass nvarchar(100),
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
        INSERT INTO [${flyway:defaultSchema}].[User]
            (
                [ID],
                [Name],
                [FirstName],
                [LastName],
                [Title],
                [Email],
                [Type],
                [IsActive],
                [LinkedRecordType],
                [LinkedEntityID],
                [LinkedEntityRecordID],
                [EmployeeID],
                [UserImageURL],
                [UserImageIconClass],
                [DigestFrequency],
                [DigestHourUTC],
                [DigestDayOfWeekUTC]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @FirstName,
                @LastName,
                @Title,
                @Email,
                @Type,
                ISNULL(@IsActive, 0),
                ISNULL(@LinkedRecordType, 'None'),
                @LinkedEntityID,
                @LinkedEntityRecordID,
                @EmployeeID,
                @UserImageURL,
                @UserImageIconClass,
                @DigestFrequency,
                @DigestHourUTC,
                @DigestDayOfWeekUTC
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[User]
            (
                [Name],
                [FirstName],
                [LastName],
                [Title],
                [Email],
                [Type],
                [IsActive],
                [LinkedRecordType],
                [LinkedEntityID],
                [LinkedEntityRecordID],
                [EmployeeID],
                [UserImageURL],
                [UserImageIconClass],
                [DigestFrequency],
                [DigestHourUTC],
                [DigestDayOfWeekUTC]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @FirstName,
                @LastName,
                @Title,
                @Email,
                @Type,
                ISNULL(@IsActive, 0),
                ISNULL(@LinkedRecordType, 'None'),
                @LinkedEntityID,
                @LinkedEntityRecordID,
                @EmployeeID,
                @UserImageURL,
                @UserImageIconClass,
                @DigestFrequency,
                @DigestHourUTC,
                @DigestDayOfWeekUTC
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUsers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUser] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Users */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUser] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spUpdateUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUser]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUser];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUser]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(50),
    @Email nvarchar(100),
    @Type nchar(15),
    @IsActive bit,
    @LinkedRecordType nchar(10),
    @LinkedEntityID uniqueidentifier,
    @LinkedEntityRecordID nvarchar(450),
    @EmployeeID uniqueidentifier,
    @UserImageURL nvarchar(MAX),
    @UserImageIconClass nvarchar(100),
    @DigestFrequency nvarchar(20),
    @DigestHourUTC int,
    @DigestDayOfWeekUTC int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[User]
    SET
        [Name] = @Name,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Email] = @Email,
        [Type] = @Type,
        [IsActive] = @IsActive,
        [LinkedRecordType] = @LinkedRecordType,
        [LinkedEntityID] = @LinkedEntityID,
        [LinkedEntityRecordID] = @LinkedEntityRecordID,
        [EmployeeID] = @EmployeeID,
        [UserImageURL] = @UserImageURL,
        [UserImageIconClass] = @UserImageIconClass,
        [DigestFrequency] = @DigestFrequency,
        [DigestHourUTC] = @DigestHourUTC,
        [DigestDayOfWeekUTC] = @DigestDayOfWeekUTC
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUsers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUsers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUser] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the User table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUser]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUser];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUser
ON [${flyway:defaultSchema}].[User]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[User]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[User] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Users */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUser] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spDeleteUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUser]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUser];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUser]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[User]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUser] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Users */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUser] TO [cdp_Integration], [cdp_Developer]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9f4672c4-4166-4052-96c3-d603348af848'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9f4672c4-4166-4052-96c3-d603348af848',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'd9d59298-e9f6-4ead-a107-30111c5b10bc'  OR 
               (EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB' AND Name = 'NotificationType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd9d59298-e9f6-4ead-a107-30111c5b10bc',
            '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = '8dd6aee4-2285-404a-abc9-90f1a2e56050'  OR 
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
            '8dd6aee4-2285-404a-abc9-90f1a2e56050',
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
         WHERE ID = 'bb97deb2-a883-4cc5-84db-a9fd9d6a30d8'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'EmailTemplate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bb97deb2-a883-4cc5-84db-a9fd9d6a30d8',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
         WHERE ID = 'b0cbfabd-2e67-4609-889c-33ea8009e93b'  OR 
               (EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4' AND Name = 'SMSTemplate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b0cbfabd-2e67-4609-889c-33ea8009e93b',
            'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', -- Entity: MJ: User Notification Types
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
            WHERE ID = '1BC33724-FE71-481B-8C0E-F497242C6F37'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1BC33724-FE71-481B-8C0E-F497242C6F37'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3BBCDD18-A2BF-4435-8783-6E734A249D9B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '32595A3B-97FE-4942-82B7-7DC7BA2707D0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '294947C6-444E-48A0-979E-026314151CC7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '143D00C7-8E72-42D0-AD04-97E1E945F291'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1BC33724-FE71-481B-8C0E-F497242C6F37'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3BBCDD18-A2BF-4435-8783-6E734A249D9B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '32595A3B-97FE-4942-82B7-7DC7BA2707D0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '294947C6-444E-48A0-979E-026314151CC7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '315817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '315817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '325817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '664D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B54217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '315817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '325817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '454E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '264E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '284E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'D9D59298-E9F6-4EAD-A107-30111C5B10BC'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E75BFF3E-ECD1-4380-B598-5836968B2659'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1612D059-F9FD-4CC1-B022-13D29A5C43B4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD49DBB7-3331-4CE2-9E64-5A476B72F113'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '848C9CFD-49CF-434E-8242-E9C0226EB36A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9F4672C4-4166-4052-96C3-D603348AF848'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D9D59298-E9F6-4EAD-A107-30111C5B10BC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9F4672C4-4166-4052-96C3-D603348AF848'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D9D59298-E9F6-4EAD-A107-30111C5B10BC'
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
            WHERE ID = '5C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8DD6AEE4-2285-404A-ABC9-90F1A2E56050'
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
               WHERE ID = '8DD6AEE4-2285-404A-ABC9-90F1A2E56050'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2A5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2B5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2C5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2D5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2A5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '704F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 29 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '264E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User First Last',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '274E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '284E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '305817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2B4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '315817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '325817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Shared',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '664D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B54217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Grid State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '674D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sort State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '534F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1AB8DCBD-7946-42F0-866D-F9123FC4DC5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'View Definition & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Card State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B2C9803B-11D7-4A9D-8D00-8BE3549B842C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Filter State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Custom Filter',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Smart Filter Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '444E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Smart Filter Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '454E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Smart Filter Where Clause',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '464E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Smart Filter Explanation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '474E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Where Clause',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '405817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Filtering & Smart Search',
       GeneratedFormSection = 'Category',
       DisplayName = 'Custom Where Clause',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '415817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '10A7E79B-18EB-424C-A7EA-A26F5A5DB52A'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Display Settings":{"icon":"fa fa-eye","description":"Configuration for view display modes such as grid, cards, timeline, and chart"},"User & Ownership":{"icon":"fa fa-user","description":""},"Entity Context":{"icon":"fa fa-database","description":""},"View Definition & Settings":{"icon":"fa fa-sliders-h","description":""},"Filtering & Smart Search":{"icon":"fa fa-search","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Display Settings":"fa fa-eye","User & Ownership":"fa fa-user","Entity Context":"fa fa-database","View Definition & Settings":"fa fa-sliders-h","Filtering & Smart Search":"fa fa-search","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Basics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1BC33724-FE71-481B-8C0E-F497242C6F37'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Basics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3BBCDD18-A2BF-4435-8783-6E734A249D9B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Basics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32595A3B-97FE-4942-82B7-7DC7BA2707D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Basics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '294947C6-444E-48A0-979E-026314151CC7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Basics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Expire Days',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E6E5403E-FA77-45A7-8316-86714711A4B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Basics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '143D00C7-8E72-42D0-AD04-97E1E945F291'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In‑App',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A30089E-867B-42D9-BBD1-E4C93162040C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Email',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A570322F-F80D-4236-BAF8-3BCCE952638E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default SMS',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '55537864-1881-4166-803C-B603D3D5D32F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow User Preference',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37E162E6-E510-4F32-9783-CAF4992FDE1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '59D5B219-C50B-414E-86E7-B1A27C5B072A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB97DEB2-A883-4CC5-84DB-A9FD9D6A30D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '984C996A-D6A0-4744-910B-6E23EC7B3069'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0CBFABD-2E67-4609-889C-33EA8009E93B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5FF1D262-B85F-41D0-BAED-441370D12E99'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A89DF1E4-3314-4A61-9D29-B6617A0E43E2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '17108BFE-46F8-47D4-A4A4-3F7EDF2D55DF'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('008d0f79-7267-44fa-b89f-04edae25ac1a', 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', 'FieldCategoryInfo', '{"Notification Basics":{"icon":"fa fa-bell","description":"Core details of the notification type such as name, description, visual cues, and behavior settings"},"Delivery Settings":{"icon":"fa fa-paper-plane","description":"Default delivery method flags and user preference options for in‑app, email, and SMS"},"Template Associations":{"icon":"fa fa-file-alt","description":"Links to email and SMS template identifiers and their descriptive content"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('306d1ad2-075c-484f-8756-ebf4814f444f', 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4', 'FieldCategoryIcons', '{"Notification Basics":"fa fa-bell","Delivery Settings":"fa fa-paper-plane","Template Associations":"fa fa-file-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'D4547A06-0B74-42D6-BC70-B1896E7CC1B4'
         

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '275817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '285817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '295817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Earliest At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Latest At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Interaction Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E95817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EA5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Full Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '6E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Supervisor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Supervisor Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '704F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Technical Details":{"icon":"fa fa-cog","description":""},"User Profile":{"icon":"fa fa-user","description":""},"Interaction Summary":{"icon":"fa fa-clock","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E3238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Technical Details":"fa fa-cog","User Profile":"fa fa-user","Interaction Summary":"fa fa-clock"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E3238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

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
       DisplayName = 'User ID',
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
   WHERE ID = '9E037386-E391-48F5-B568-F0E35D6F14E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8DD6AEE4-2285-404A-ABC9-90F1A2E56050'
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
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D4FAD977-CA2B-4C44-B090-AA1F2FCEF7A6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2197C597-35A7-4950-879F-93F61F1296AC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '83BC6540-804C-4B60-8C84-A51F19A5FE5C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Notification Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF44446F-5E26-4CB6-ACB9-E7614F085EA2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Notification Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F4672C4-4166-4052-96C3-D603348AF848'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Notification Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3B3686C0-5B0F-40EE-9685-573A85CEA01F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User & Notification Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D9D59298-E9F6-4EAD-A107-30111C5B10BC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'In‑App Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E75BFF3E-ECD1-4380-B598-5836968B2659'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1612D059-F9FD-4CC1-B022-13D29A5C43B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD49DBB7-3331-4CE2-9E64-5A476B72F113'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Channel Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '848C9CFD-49CF-434E-8242-E9C0226EB36A'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('04cc7d40-8baf-47fd-bf6a-aee78ac4dd31', '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', 'FieldCategoryInfo', '{"User & Notification Context":{"icon":"fa fa-user","description":"Links a user to a specific notification type and provides readable identifiers"},"Delivery Channel Settings":{"icon":"fa fa-bell","description":"Individual channel toggles (in‑app, email, SMS) and overall enable flag for the notification"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e507de8c-0c24-4cf2-87ef-3a5975f257f8', '818EA2C9-DAAF-4473-84B5-30420AD6F0FB', 'FieldCategoryIcons', '{"User & Notification Context":"fa fa-user","Delivery Channel Settings":"fa fa-bell","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '818EA2C9-DAAF-4473-84B5-30420AD6F0FB'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '324D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '324D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '624F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '334D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C84217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '324D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '604F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '614F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '624F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '334D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 25 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '314D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '324D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '604F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '614F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '624F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '6B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Identity',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Last',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2C4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '334D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C84217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Image URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '6AE7E629-5A0F-4308-9A78-72A3E63DC282'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Image Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A263417-B004-4729-BDC4-4A960ADC7983'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Record Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '634F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '644F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Linked Entity Record ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '654F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Entity Links',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '344D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '104D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Digest Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Digest Frequency',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B6C63BCE-D0E9-4589-8A5B-59BD6ACCADC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Digest Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Digest Hour UTC',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FCA816E2-AD29-4026-997C-D7F8DFAF97EB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Digest Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Digest Day Of Week UTC',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C44A60A2-7C62-43F4-8AA7-E6B84487A6CD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Employee Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee First Last',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '664F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Employee Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '674F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Employee Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '684F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Employee Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Supervisor',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '694F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Employee Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Employee Supervisor Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '6A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5685f0c2-ee0f-4942-9468-265f30853d66', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Digest Settings":{"icon":"fa fa-bell","description":"User email digest preferences and schedule"},"User Identity":{"icon":"fa fa-id-card","description":""},"Account Settings":{"icon":"fa fa-cog","description":""},"Entity Links":{"icon":"fa fa-link","description":""},"Employee Details":{"icon":"fa fa-user-tie","description":""},"System Metadata":{"icon":"fa fa-database","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Digest Settings":"fa fa-bell","User Identity":"fa fa-id-card","Account Settings":"fa fa-cog","Entity Links":"fa fa-link","Employee Details":"fa fa-user-tie","System Metadata":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Generated Validation Functions for Users */
-- CHECK constraint for Users: Field: DigestDayOfWeekUTC was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([DigestDayOfWeekUTC]>=(0) AND [DigestDayOfWeekUTC]<=(6))', 'public ValidateDigestDayOfWeekUTCRange(result: ValidationResult) {
	// Ensure the value is within the allowed range of 0 to 6 (Sunday‑Saturday)
	if (this.DigestDayOfWeekUTC != null && (this.DigestDayOfWeekUTC < 0 || this.DigestDayOfWeekUTC > 6)) {
		result.Errors.push(new ValidationErrorInfo(
			"DigestDayOfWeekUTC",
			"Digest day of week (UTC) must be between 0 (Sunday) and 6 (Saturday).",
			this.DigestDayOfWeekUTC,
			ValidationErrorType.Failure
		));
	}
}', 'Digest day of week (UTC) must be a value between 0 and 6, representing Sunday through Saturday. This rule applies only when a digest day is provided, ensuring the stored day is a valid day of the week.', 'ValidateDigestDayOfWeekUTCRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'C44A60A2-7C62-43F4-8AA7-E6B84487A6CD');
  
            -- CHECK constraint for Users: Field: DigestHourUTC was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([DigestHourUTC]>=(0) AND [DigestHourUTC]<=(23))', 'public ValidateDigestHourUTCRange(result: ValidationResult) {
	// Only validate when a value is supplied (field is nullable)
	if (this.DigestHourUTC != null && (this.DigestHourUTC < 0 || this.DigestHourUTC > 23)) {
		result.Errors.push(new ValidationErrorInfo(
			"DigestHourUTC",
			"Digest hour must be between 0 and 23 (inclusive).",
			this.DigestHourUTC,
			ValidationErrorType.Failure
		));
	}
}', 'If a digest hour is provided, it must be a whole hour between 0 (midnight) and 23 (11 PM) in UTC.', 'ValidateDigestHourUTCRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'FCA816E2-AD29-4026-997C-D7F8DFAF97EB');
  
            

