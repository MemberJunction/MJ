/* SQL generated to create new entity Locations */

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
         'da7103b0-8af9-4230-b060-863d0ebb13ef',
         'Locations',
         NULL,
         NULL,
         NULL,
         'Location',
         'vwLocations',
         'MJ_Biking_App',
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
   

/* SQL generated to add new entity Locations to application ID: '3d71bb83-c01a-400c-9e9d-2a1f82e70e11' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('3d71bb83-c01a-400c-9e9d-2a1f82e70e11', 'da7103b0-8af9-4230-b060-863d0ebb13ef', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3d71bb83-c01a-400c-9e9d-2a1f82e70e11'))

/* SQL generated to add new permission for entity Locations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('da7103b0-8af9-4230-b060-863d0ebb13ef', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Locations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('da7103b0-8af9-4230-b060-863d0ebb13ef', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Locations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('da7103b0-8af9-4230-b060-863d0ebb13ef', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Weathers */

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
         '96613ecb-68c3-43e7-951f-c094fe4a2d57',
         'Weathers',
         NULL,
         NULL,
         NULL,
         'Weather',
         'vwWeathers',
         'MJ_Biking_App',
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
   

/* SQL generated to add new entity Weathers to application ID: '3D71BB83-C01A-400C-9E9D-2A1F82E70E11' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('3D71BB83-C01A-400C-9E9D-2A1F82E70E11', '96613ecb-68c3-43e7-951f-c094fe4a2d57', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3D71BB83-C01A-400C-9E9D-2A1F82E70E11'))

/* SQL generated to add new permission for entity Weathers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96613ecb-68c3-43e7-951f-c094fe4a2d57', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Weathers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96613ecb-68c3-43e7-951f-c094fe4a2d57', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Weathers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96613ecb-68c3-43e7-951f-c094fe4a2d57', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Rider _ Stats */

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
         'e1462cc1-2acc-47d7-bfaf-bf8315ddfe91',
         'Rider _ Stats',
         NULL,
         NULL,
         NULL,
         'Rider_Stats',
         'vwRider_Stats',
         'MJ_Biking_App',
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
   

/* SQL generated to add new entity Rider _ Stats to application ID: '3D71BB83-C01A-400C-9E9D-2A1F82E70E11' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('3D71BB83-C01A-400C-9E9D-2A1F82E70E11', 'e1462cc1-2acc-47d7-bfaf-bf8315ddfe91', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3D71BB83-C01A-400C-9E9D-2A1F82E70E11'))

/* SQL generated to add new permission for entity Rider _ Stats for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e1462cc1-2acc-47d7-bfaf-bf8315ddfe91', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Rider _ Stats for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e1462cc1-2acc-47d7-bfaf-bf8315ddfe91', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Rider _ Stats for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e1462cc1-2acc-47d7-bfaf-bf8315ddfe91', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Riders */

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
         '3de4e36c-692f-4311-8732-4c7f4b7dd748',
         'Riders',
         NULL,
         NULL,
         NULL,
         'Rider',
         'vwRiders',
         'MJ_Biking_App',
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
   

/* SQL generated to add new entity Riders to application ID: '3D71BB83-C01A-400C-9E9D-2A1F82E70E11' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('3D71BB83-C01A-400C-9E9D-2A1F82E70E11', '3de4e36c-692f-4311-8732-4c7f4b7dd748', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3D71BB83-C01A-400C-9E9D-2A1F82E70E11'))

/* SQL generated to add new permission for entity Riders for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3de4e36c-692f-4311-8732-4c7f4b7dd748', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Riders for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3de4e36c-692f-4311-8732-4c7f4b7dd748', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Riders for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3de4e36c-692f-4311-8732-4c7f4b7dd748', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Bikes */

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
         'a30f1ce0-8ae2-4e88-ac05-9eb3e32757a5',
         'Bikes',
         NULL,
         NULL,
         NULL,
         'Bike',
         'vwBikes',
         'MJ_Biking_App',
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
   

/* SQL generated to add new entity Bikes to application ID: '3D71BB83-C01A-400C-9E9D-2A1F82E70E11' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('3D71BB83-C01A-400C-9E9D-2A1F82E70E11', 'a30f1ce0-8ae2-4e88-ac05-9eb3e32757a5', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3D71BB83-C01A-400C-9E9D-2A1F82E70E11'))

/* SQL generated to add new permission for entity Bikes for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a30f1ce0-8ae2-4e88-ac05-9eb3e32757a5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Bikes for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a30f1ce0-8ae2-4e88-ac05-9eb3e32757a5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Bikes for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a30f1ce0-8ae2-4e88-ac05-9eb3e32757a5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity MJ_Biking_App.Rider */
ALTER TABLE [MJ_Biking_App].[Rider] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity MJ_Biking_App.Rider */
ALTER TABLE [MJ_Biking_App].[Rider] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity MJ_Biking_App.Location */
ALTER TABLE [MJ_Biking_App].[Location] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity MJ_Biking_App.Location */
ALTER TABLE [MJ_Biking_App].[Location] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity MJ_Biking_App.Bike */
ALTER TABLE [MJ_Biking_App].[Bike] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity MJ_Biking_App.Bike */
ALTER TABLE [MJ_Biking_App].[Bike] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity MJ_Biking_App.Rider_Stats */
ALTER TABLE [MJ_Biking_App].[Rider_Stats] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity MJ_Biking_App.Rider_Stats */
ALTER TABLE [MJ_Biking_App].[Rider_Stats] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity MJ_Biking_App.Weather */
ALTER TABLE [MJ_Biking_App].[Weather] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity MJ_Biking_App.Weather */
ALTER TABLE [MJ_Biking_App].[Weather] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a99e0930-b279-4326-a4fd-308838757d39'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'rider_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a99e0930-b279-4326-a4fd-308838757d39',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100001,
            'rider_id',
            'rider _id',
            'Unique identifier for the rider',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
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
         WHERE ID = 'c16cf8fc-a420-48e2-985b-fd24dfd6014b'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'username')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c16cf8fc-a420-48e2-985b-fd24dfd6014b',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100002,
            'username',
            'username',
            'Unique username for the rider account',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd3d903c0-b0c4-4031-ab69-3151fd78ef56'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd3d903c0-b0c4-4031-ab69-3151fd78ef56',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100003,
            'email',
            'email',
            'Email address for the rider account',
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
         WHERE ID = '37dc57a4-9ce1-4832-be32-f112f73ee0c7'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'weight_kg')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '37dc57a4-9ce1-4832-be32-f112f73ee0c7',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100004,
            'weight_kg',
            'weight _kg',
            'Rider body weight in kilograms (0-300)',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = '06e5bc15-8d69-43a5-8b36-36c34ac07ff4'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'fitness_level')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '06e5bc15-8d69-43a5-8b36-36c34ac07ff4',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100005,
            'fitness_level',
            'fitness _level',
            'Self-reported fitness level on a scale of 1-10',
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
         WHERE ID = '72f6d91a-f3e4-4350-b2ce-f958d3ce774f'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'preferred_terrain')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '72f6d91a-f3e4-4350-b2ce-f958d3ce774f',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100006,
            'preferred_terrain',
            'preferred _terrain',
            'Preferred riding terrain: road, gravel, mountain, urban, or mixed',
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
         WHERE ID = 'e1425134-028a-402b-8c80-ed21fe09f5fc'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'lifetime_stats')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e1425134-028a-402b-8c80-ed21fe09f5fc',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100007,
            'lifetime_stats',
            'lifetime _stats',
            'JSON object containing aggregated lifetime statistics',
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
         WHERE ID = 'eddf4b5e-1402-4947-bad4-a10a6be6a276'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = 'created_at')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'eddf4b5e-1402-4947-bad4-a10a6be6a276',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100008,
            'created_at',
            'created _at',
            'UTC timestamp when the rider account was created',
            'datetime2',
            8,
            27,
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
         WHERE ID = '1be2951e-76e8-4797-bed0-9f004b8ffaa1'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1be2951e-76e8-4797-bed0-9f004b8ffaa1',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100009,
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
         WHERE ID = '5858fa75-c83a-4a2e-8a43-3327888fb7e1'  OR 
               (EntityID = '3DE4E36C-692F-4311-8732-4C7F4B7DD748' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5858fa75-c83a-4a2e-8a43-3327888fb7e1',
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748', -- Entity: Riders
            100010,
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
         WHERE ID = '765f61c4-bfc2-49e0-bb17-d0a643af2fd4'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'location_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '765f61c4-bfc2-49e0-bb17-d0a643af2fd4',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100001,
            'location_id',
            'location _id',
            'Unique identifier for the location',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
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
         WHERE ID = '7219a406-a331-4ed9-b759-f6240e87906c'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'rider_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7219a406-a331-4ed9-b759-f6240e87906c',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100002,
            'rider_id',
            'rider _id',
            'Foreign key to the rider who discovered/saved this location',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748',
            'rider_id',
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
         WHERE ID = '4590ee0e-7d31-46b1-8188-957458319869'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4590ee0e-7d31-46b1-8188-957458319869',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100003,
            'name',
            'name',
            'User-defined name for the location',
            'nvarchar',
            300,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd212a03c-8274-4f9d-93c6-5c3d100fee20'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'latitude')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd212a03c-8274-4f9d-93c6-5c3d100fee20',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100004,
            'latitude',
            'latitude',
            'Geographic latitude coordinate (-90 to 90 degrees)',
            'decimal',
            5,
            9,
            6,
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
         WHERE ID = '747adbc9-900a-48c1-ba5d-8f72581bb98c'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'longitude')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '747adbc9-900a-48c1-ba5d-8f72581bb98c',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100005,
            'longitude',
            'longitude',
            'Geographic longitude coordinate (-180 to 180 degrees)',
            'decimal',
            5,
            9,
            6,
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
         WHERE ID = '7c9b6280-e61a-4fbb-8cd8-0ae2946a5c0f'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'elevation_m')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c9b6280-e61a-4fbb-8cd8-0ae2946a5c0f',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100006,
            'elevation_m',
            'elevation _m',
            'Elevation above sea level in meters (-500 to 9000)',
            'decimal',
            5,
            7,
            2,
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
         WHERE ID = '1b20c76b-3fd7-4cfa-a237-94bdfe3ca7e3'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'terrain_type')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1b20c76b-3fd7-4cfa-a237-94bdfe3ca7e3',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100007,
            'terrain_type',
            'terrain _type',
            'Type of terrain: road, gravel, singletrack, doubletrack, paved_trail, urban, or mountain',
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
         WHERE ID = '1a1fdc68-1dfd-4b7a-b8af-ff04342141fe'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'surface_condition')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1a1fdc68-1dfd-4b7a-b8af-ff04342141fe',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100008,
            'surface_condition',
            'surface _condition',
            'Current surface condition: dry, wet, muddy, icy, sandy, loose, or packed',
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
         WHERE ID = 'd3bda535-c702-491e-ae5e-4fa591efb5ba'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'difficulty_rating')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd3bda535-c702-491e-ae5e-4fa591efb5ba',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100009,
            'difficulty_rating',
            'difficulty _rating',
            'Difficulty rating for the location (1.0 to 10.0)',
            'decimal',
            5,
            3,
            1,
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
         WHERE ID = '93ef7c80-bc5b-4579-adf8-80b2379fc211'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'visit_count')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '93ef7c80-bc5b-4579-adf8-80b2379fc211',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100010,
            'visit_count',
            'visit _count',
            'Number of times the rider has visited this location',
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
         WHERE ID = 'f7a6f97a-d18f-42ee-8d0b-92f00d8c04df'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = 'first_visited')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f7a6f97a-d18f-42ee-8d0b-92f00d8c04df',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100011,
            'first_visited',
            'first _visited',
            'UTC timestamp when the location was first visited',
            'datetime2',
            8,
            27,
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
         WHERE ID = '0f4d9b57-c555-484b-8f33-56a993702c56'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0f4d9b57-c555-484b-8f33-56a993702c56',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100012,
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
         WHERE ID = '01ad96fd-700b-4a4c-8841-e54af597fd01'  OR 
               (EntityID = 'DA7103B0-8AF9-4230-B060-863D0EBB13EF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '01ad96fd-700b-4a4c-8841-e54af597fd01',
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF', -- Entity: Locations
            100013,
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
         WHERE ID = 'cce435e6-931a-4e72-8180-ebe2e668ec65'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'bike_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cce435e6-931a-4e72-8180-ebe2e668ec65',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100001,
            'bike_id',
            'bike _id',
            'Unique identifier for the bike',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
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
         WHERE ID = '0bc0cc3a-a150-4e8d-8e49-7b75a6ac3cc8'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'rider_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0bc0cc3a-a150-4e8d-8e49-7b75a6ac3cc8',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100002,
            'rider_id',
            'rider _id',
            'Foreign key to the rider who owns this bike',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748',
            'rider_id',
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
         WHERE ID = 'cf083dbd-5c71-473e-a141-0f9cc3438bde'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cf083dbd-5c71-473e-a141-0f9cc3438bde',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100003,
            'name',
            'name',
            'User-defined name for the bike',
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5666dd7b-f9e2-4e8d-9ab9-3ad888d136d2'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'bike_type')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5666dd7b-f9e2-4e8d-9ab9-3ad888d136d2',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100004,
            'bike_type',
            'bike _type',
            'Type of bicycle: road, mountain, gravel, hybrid, bmx, electric, touring, or cyclocross',
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
         WHERE ID = '2ed7f83b-70ad-4643-96be-07383c07eef8'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'weight_kg')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2ed7f83b-70ad-4643-96be-07383c07eef8',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100005,
            'weight_kg',
            'weight _kg',
            'Weight of the bike in kilograms (0-50)',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = '24b3cc3c-5545-42d8-8a7d-769240b0cca2'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'wheel_size_in')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24b3cc3c-5545-42d8-8a7d-769240b0cca2',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100006,
            'wheel_size_in',
            'wheel _size _in',
            'Wheel diameter in inches (12-36)',
            'decimal',
            5,
            4,
            2,
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
         WHERE ID = '919dc5d9-de2d-4df6-a006-67f96238d2e6'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'total_distance_m')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '919dc5d9-de2d-4df6-a006-67f96238d2e6',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100007,
            'total_distance_m',
            'total _distance _m',
            'Total distance traveled on this bike in meters',
            'decimal',
            9,
            12,
            2,
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
         WHERE ID = '44a3b4b8-bb04-4e37-b8ed-6e31f8ac80c3'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = 'last_serviced')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '44a3b4b8-bb04-4e37-b8ed-6e31f8ac80c3',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100008,
            'last_serviced',
            'last _serviced',
            'Date and time of the last service or maintenance',
            'datetime2',
            8,
            27,
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
         WHERE ID = '99adac78-d803-4b30-ae9d-21bdfcd62f96'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '99adac78-d803-4b30-ae9d-21bdfcd62f96',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100009,
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
         WHERE ID = '18a1e54c-e1f4-48ea-8968-dbfcd12f4040'  OR 
               (EntityID = 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '18a1e54c-e1f4-48ea-8968-dbfcd12f4040',
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', -- Entity: Bikes
            100010,
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
         WHERE ID = 'a3f43479-2090-4b1e-8427-cd5c9ba74f7d'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'stats_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a3f43479-2090-4b1e-8427-cd5c9ba74f7d',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100001,
            'stats_id',
            'stats _id',
            'Unique identifier for the stats record',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
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
         WHERE ID = 'a05d76a4-870e-4b90-a6b0-ecc532c896c9'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'rider_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a05d76a4-870e-4b90-a6b0-ecc532c896c9',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100002,
            'rider_id',
            'rider _id',
            'Foreign key to the rider who recorded these stats',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3DE4E36C-692F-4311-8732-4C7F4B7DD748',
            'rider_id',
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
         WHERE ID = 'f96e0f5e-5a5f-4e44-81ba-ae0e8cc77606'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'location_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f96e0f5e-5a5f-4e44-81ba-ae0e8cc77606',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100003,
            'location_id',
            'location _id',
            'Foreign key to the location where the ride took place (optional)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF',
            'location_id',
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
         WHERE ID = '036796f3-b523-4cd1-9e25-2702f3068e1c'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'bike_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '036796f3-b523-4cd1-9e25-2702f3068e1c',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100004,
            'bike_id',
            'bike _id',
            'Foreign key to the bike used for the ride (optional)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5',
            'bike_id',
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
         WHERE ID = '7b59c111-705c-45d7-9a67-ce46560258a4'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'avg_speed_mps')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7b59c111-705c-45d7-9a67-ce46560258a4',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100005,
            'avg_speed_mps',
            'avg _speed _mps',
            'Average speed during the ride in meters per second (0-50)',
            'decimal',
            5,
            6,
            2,
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
         WHERE ID = 'a44cbbe7-e306-4a95-bc93-e4c10967eabf'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'max_speed_mps')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a44cbbe7-e306-4a95-bc93-e4c10967eabf',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100006,
            'max_speed_mps',
            'max _speed _mps',
            'Maximum speed during the ride in meters per second (0-80, must be >= avg_speed)',
            'decimal',
            5,
            6,
            2,
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
         WHERE ID = '2071558f-8257-4596-b3c8-c65827312404'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'avg_heart_rate_bpm')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2071558f-8257-4596-b3c8-c65827312404',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100007,
            'avg_heart_rate_bpm',
            'avg _heart _rate _bpm',
            'Average heart rate during the ride in beats per minute (30-250)',
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
         WHERE ID = 'b78d2ea0-76d3-486e-acc9-4f2385b68429'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'max_heart_rate_bpm')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b78d2ea0-76d3-486e-acc9-4f2385b68429',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100008,
            'max_heart_rate_bpm',
            'max _heart _rate _bpm',
            'Maximum heart rate during the ride in beats per minute (30-250, must be >= avg_heart_rate)',
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
         WHERE ID = 'f6de81bd-da56-44d0-9c10-23766d2eeb1a'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'cadence_rpm')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f6de81bd-da56-44d0-9c10-23766d2eeb1a',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100009,
            'cadence_rpm',
            'cadence _rpm',
            'Pedaling cadence in revolutions per minute (0-200)',
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
         WHERE ID = 'c59be69b-155e-46cf-a852-82cdb94e7ee8'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'power_watts')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c59be69b-155e-46cf-a852-82cdb94e7ee8',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100010,
            'power_watts',
            'power _watts',
            'Power output in watts (0-2500)',
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
         WHERE ID = '21ce260f-6d22-4834-a317-35c0f7663776'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'distance_m')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '21ce260f-6d22-4834-a317-35c0f7663776',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100011,
            'distance_m',
            'distance _m',
            'Total distance covered in meters',
            'decimal',
            9,
            12,
            2,
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
         WHERE ID = 'c5baf076-61a7-49e1-b2f5-7a2b8862e8ea'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'elevation_gain_m')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c5baf076-61a7-49e1-b2f5-7a2b8862e8ea',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100012,
            'elevation_gain_m',
            'elevation _gain _m',
            'Total elevation gained during the ride in meters (0-10000)',
            'decimal',
            5,
            8,
            2,
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
         WHERE ID = 'bd05d484-f07d-42aa-a6ee-9a0d2e16c7dc'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'duration_seconds')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bd05d484-f07d-42aa-a6ee-9a0d2e16c7dc',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100013,
            'duration_seconds',
            'duration _seconds',
            'Total duration of the ride in seconds (must be > 0)',
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
         WHERE ID = 'face9669-0d95-4613-b1d9-6f20bf33bc4a'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'calories_burned')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'face9669-0d95-4613-b1d9-6f20bf33bc4a',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100014,
            'calories_burned',
            'calories _burned',
            'Estimated calories burned during the ride (0-20000)',
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
         WHERE ID = 'fd06cc3b-08d0-4e76-878e-ee40a3580aa9'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'effort_rating')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd06cc3b-08d0-4e76-878e-ee40a3580aa9',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100015,
            'effort_rating',
            'effort _rating',
            'Self-reported perceived effort rating (1-10)',
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
         WHERE ID = 'b07afeb2-7c77-4207-b56d-d7e6685d8d44'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'recorded_at')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b07afeb2-7c77-4207-b56d-d7e6685d8d44',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100016,
            'recorded_at',
            'recorded _at',
            'UTC timestamp when the ride stats were recorded',
            'datetime2',
            8,
            27,
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
         WHERE ID = 'db4e7fe7-78a4-408c-8718-efa9807e8a76'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'db4e7fe7-78a4-408c-8718-efa9807e8a76',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100017,
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
         WHERE ID = 'c74061e6-42b2-40af-83e2-c9b3da82fbdf'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c74061e6-42b2-40af-83e2-c9b3da82fbdf',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100018,
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
         WHERE ID = '4f309a8c-2252-4259-ba9f-065328c90ec1'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'weather_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4f309a8c-2252-4259-ba9f-065328c90ec1',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100001,
            'weather_id',
            'weather _id',
            'Unique identifier for the weather record',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
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
         WHERE ID = 'f3e54018-3b2a-47a8-8598-7ff90994453b'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'location_id')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f3e54018-3b2a-47a8-8598-7ff90994453b',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100002,
            'location_id',
            'location _id',
            'Foreign key to the location where weather was observed',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'DA7103B0-8AF9-4230-B060-863D0EBB13EF',
            'location_id',
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
         WHERE ID = 'b64ae46b-96d3-4895-a60e-4c814c1efc24'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'temperature_c')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b64ae46b-96d3-4895-a60e-4c814c1efc24',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100003,
            'temperature_c',
            'temperature _c',
            'Temperature in Celsius (-90 to 60)',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = '4b1b29cc-4667-4492-9a3e-7ed4ffb29213'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'humidity_pct')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4b1b29cc-4667-4492-9a3e-7ed4ffb29213',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100004,
            'humidity_pct',
            'humidity _pct',
            'Relative humidity percentage (0-100)',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = '58286073-af70-4b1a-9c05-e7dc291659be'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'wind_speed_mps')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '58286073-af70-4b1a-9c05-e7dc291659be',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100005,
            'wind_speed_mps',
            'wind _speed _mps',
            'Wind speed in meters per second (0-120)',
            'decimal',
            5,
            6,
            2,
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
         WHERE ID = '573d23f4-d811-404b-9cf5-2a3cf08d5709'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'wind_direction_deg')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '573d23f4-d811-404b-9cf5-2a3cf08d5709',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100006,
            'wind_direction_deg',
            'wind _direction _deg',
            'Wind direction in degrees from north (0-360)',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = '1632fc3a-b57b-4b9d-b1a2-3066b30e6fd8'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'precipitation_type')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1632fc3a-b57b-4b9d-b1a2-3066b30e6fd8',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100007,
            'precipitation_type',
            'precipitation _type',
            'Type of precipitation: none, drizzle, rain, heavy_rain, snow, sleet, hail, or fog',
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
         WHERE ID = '552fa5ca-df9a-4f8b-9416-f72291514223'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'cloud_cover_pct')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '552fa5ca-df9a-4f8b-9416-f72291514223',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100008,
            'cloud_cover_pct',
            'cloud _cover _pct',
            'Cloud cover percentage (0-100)',
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
         WHERE ID = '8faf917a-d6c1-4a87-89d5-6593a7225fbb'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'visibility_km')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8faf917a-d6c1-4a87-89d5-6593a7225fbb',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100009,
            'visibility_km',
            'visibility _km',
            'Visibility in kilometers (0-100)',
            'decimal',
            5,
            6,
            2,
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
         WHERE ID = '5cdc68bf-85e2-42b9-89a1-4ecda76f0775'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'observed_at')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5cdc68bf-85e2-42b9-89a1-4ecda76f0775',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100010,
            'observed_at',
            'observed _at',
            'UTC timestamp when the weather observation was recorded',
            'datetime2',
            8,
            27,
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
         WHERE ID = 'af989d50-10f1-4ed6-b16f-2f1b450b4270'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'af989d50-10f1-4ed6-b16f-2f1b450b4270',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
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
         WHERE ID = '4427feb2-dc9b-4cb1-8a2a-e7b5bb38bd25'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4427feb2-dc9b-4cb1-8a2a-e7b5bb38bd25',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
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

/* SQL text to insert entity field value with ID 6406a962-0167-4b7f-a345-86c18ffda392 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6406a962-0167-4b7f-a345-86c18ffda392', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 1, 'bmx', 'bmx')

/* SQL text to insert entity field value with ID 7dffb111-a024-4751-8e56-923ab9d34805 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7dffb111-a024-4751-8e56-923ab9d34805', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 2, 'cyclocross', 'cyclocross')

/* SQL text to insert entity field value with ID 66298359-8fa4-430b-9b2c-605aaf27b68c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('66298359-8fa4-430b-9b2c-605aaf27b68c', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 3, 'electric', 'electric')

/* SQL text to insert entity field value with ID 1530b21a-a4de-4323-85d2-585c1913ff96 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1530b21a-a4de-4323-85d2-585c1913ff96', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 4, 'gravel', 'gravel')

/* SQL text to insert entity field value with ID 6ffbdd7c-7030-44ff-bf40-ae5381953f4c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6ffbdd7c-7030-44ff-bf40-ae5381953f4c', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 5, 'hybrid', 'hybrid')

/* SQL text to insert entity field value with ID 093dc242-f8b3-4d14-a5ce-ecf093090a4a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('093dc242-f8b3-4d14-a5ce-ecf093090a4a', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 6, 'mountain', 'mountain')

/* SQL text to insert entity field value with ID 44c2cc90-cf60-495d-8e42-ca1fd008bd83 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('44c2cc90-cf60-495d-8e42-ca1fd008bd83', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 7, 'road', 'road')

/* SQL text to insert entity field value with ID 8453e99d-c3d4-444d-98f1-d90ede8763bc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8453e99d-c3d4-444d-98f1-d90ede8763bc', '5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2', 8, 'touring', 'touring')

/* SQL text to update ValueListType for entity field ID 5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5666DD7B-F9E2-4E8D-9AB9-3AD888D136D2'

/* SQL text to insert entity field value with ID 96e07b06-ae71-45f2-be40-41cb7dd547e9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('96e07b06-ae71-45f2-be40-41cb7dd547e9', '1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3', 1, 'doubletrack', 'doubletrack')

/* SQL text to insert entity field value with ID 3fa38bea-d4a7-452e-877e-ddb91b1f4b7f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3fa38bea-d4a7-452e-877e-ddb91b1f4b7f', '1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3', 2, 'gravel', 'gravel')

/* SQL text to insert entity field value with ID d23b941e-b956-437a-b87c-ecbc029b561e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d23b941e-b956-437a-b87c-ecbc029b561e', '1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3', 3, 'mountain', 'mountain')

/* SQL text to insert entity field value with ID 052f8751-a39b-4266-8d99-f84d27bda1b8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('052f8751-a39b-4266-8d99-f84d27bda1b8', '1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3', 4, 'paved_trail', 'paved_trail')

/* SQL text to insert entity field value with ID 9074e62c-1913-4a6e-880e-ae6c8993200c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9074e62c-1913-4a6e-880e-ae6c8993200c', '1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3', 5, 'road', 'road')

/* SQL text to insert entity field value with ID cf63554c-525f-4f0a-9caa-38e0f2b8294d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cf63554c-525f-4f0a-9caa-38e0f2b8294d', '1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3', 6, 'singletrack', 'singletrack')

/* SQL text to insert entity field value with ID 40b53aa0-ec57-40a2-9358-45c19eb0eec7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('40b53aa0-ec57-40a2-9358-45c19eb0eec7', '1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3', 7, 'urban', 'urban')

/* SQL text to update ValueListType for entity field ID 1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1B20C76B-3FD7-4CFA-A237-94BDFE3CA7E3'

/* SQL text to insert entity field value with ID b1d28276-0afc-4124-b1b4-275ce4a8e90a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b1d28276-0afc-4124-b1b4-275ce4a8e90a', '1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE', 1, 'dry', 'dry')

/* SQL text to insert entity field value with ID e240629e-7529-46ec-ad9e-8ad8e65b4110 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e240629e-7529-46ec-ad9e-8ad8e65b4110', '1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE', 2, 'icy', 'icy')

/* SQL text to insert entity field value with ID 96234ae2-c655-4f2f-a697-599ba9440e28 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('96234ae2-c655-4f2f-a697-599ba9440e28', '1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE', 3, 'loose', 'loose')

/* SQL text to insert entity field value with ID 4062c1a9-db40-4de3-ba6c-dec2290eeeda */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4062c1a9-db40-4de3-ba6c-dec2290eeeda', '1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE', 4, 'muddy', 'muddy')

/* SQL text to insert entity field value with ID 1ce743eb-2907-49e0-b33f-b5464ca5de73 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1ce743eb-2907-49e0-b33f-b5464ca5de73', '1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE', 5, 'packed', 'packed')

/* SQL text to insert entity field value with ID 8162a685-92ed-462e-a6f4-b95c1430c5a4 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8162a685-92ed-462e-a6f4-b95c1430c5a4', '1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE', 6, 'sandy', 'sandy')

/* SQL text to insert entity field value with ID 1ad7cefa-1bbf-452c-9983-1b638b0309ec */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1ad7cefa-1bbf-452c-9983-1b638b0309ec', '1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE', 7, 'wet', 'wet')

/* SQL text to update ValueListType for entity field ID 1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1A1FDC68-1DFD-4B7A-B8AF-FF04342141FE'

/* SQL text to insert entity field value with ID 408d5de4-a73a-49c4-a195-bbdd38e43511 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('408d5de4-a73a-49c4-a195-bbdd38e43511', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 1, 'drizzle', 'drizzle')

/* SQL text to insert entity field value with ID a66dcd29-c7f5-40d4-bbfb-fed4e6ac1d50 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a66dcd29-c7f5-40d4-bbfb-fed4e6ac1d50', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 2, 'fog', 'fog')

/* SQL text to insert entity field value with ID 60ce93c2-619d-4228-9ca0-b8bb7f98766c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('60ce93c2-619d-4228-9ca0-b8bb7f98766c', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 3, 'hail', 'hail')

/* SQL text to insert entity field value with ID c2d75568-2363-455e-8a93-980b736c6643 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c2d75568-2363-455e-8a93-980b736c6643', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 4, 'heavy_rain', 'heavy_rain')

/* SQL text to insert entity field value with ID a72ccb31-af45-44eb-a881-fd50ac99f058 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a72ccb31-af45-44eb-a881-fd50ac99f058', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 5, 'none', 'none')

/* SQL text to insert entity field value with ID 9c8983e9-38c4-44ae-936d-77b4f63d3844 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9c8983e9-38c4-44ae-936d-77b4f63d3844', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 6, 'rain', 'rain')

/* SQL text to insert entity field value with ID 4788ab04-a5ee-4cae-a778-9bfdd7676ca6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4788ab04-a5ee-4cae-a778-9bfdd7676ca6', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 7, 'sleet', 'sleet')

/* SQL text to insert entity field value with ID 1b80f904-bb9f-478c-8863-29a5041ae424 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1b80f904-bb9f-478c-8863-29a5041ae424', '1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8', 8, 'snow', 'snow')

/* SQL text to update ValueListType for entity field ID 1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1632FC3A-B57B-4B9D-B1A2-3066B30E6FD8'

/* SQL text to insert entity field value with ID 82e3d44a-a75b-4d58-98da-0612459097fe */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('82e3d44a-a75b-4d58-98da-0612459097fe', '72F6D91A-F3E4-4350-B2CE-F958D3CE774F', 1, 'gravel', 'gravel')

/* SQL text to insert entity field value with ID 2aee0f7f-94ab-45f9-b115-c2d628124cba */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2aee0f7f-94ab-45f9-b115-c2d628124cba', '72F6D91A-F3E4-4350-B2CE-F958D3CE774F', 2, 'mixed', 'mixed')

/* SQL text to insert entity field value with ID 0a6743e1-93ed-44e0-8ee5-dd05c32317ee */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0a6743e1-93ed-44e0-8ee5-dd05c32317ee', '72F6D91A-F3E4-4350-B2CE-F958D3CE774F', 3, 'mountain', 'mountain')

/* SQL text to insert entity field value with ID 5a8c9ef2-ba47-4590-948a-592223d855df */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5a8c9ef2-ba47-4590-948a-592223d855df', '72F6D91A-F3E4-4350-B2CE-F958D3CE774F', 4, 'road', 'road')

/* SQL text to insert entity field value with ID 03ef16d1-a48b-45ba-9b10-79c5a8c51ac0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('03ef16d1-a48b-45ba-9b10-79c5a8c51ac0', '72F6D91A-F3E4-4350-B2CE-F958D3CE774F', 5, 'urban', 'urban')

/* SQL text to update ValueListType for entity field ID 72F6D91A-F3E4-4350-B2CE-F958D3CE774F */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='72F6D91A-F3E4-4350-B2CE-F958D3CE774F'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd67bbb6d-2456-47a1-9952-622fbd0b5893'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d67bbb6d-2456-47a1-9952-622fbd0b5893', '3DE4E36C-692F-4311-8732-4C7F4B7DD748', 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', 'rider_id', 'One To Many', 1, 1, 'Rider _ Stats', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ac2d457f-184d-4853-81e7-7dc2fedc0cb1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ac2d457f-184d-4853-81e7-7dc2fedc0cb1', '3DE4E36C-692F-4311-8732-4C7F4B7DD748', 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', 'rider_id', 'One To Many', 1, 1, 'Bikes', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a833ff1e-c010-4127-97e0-c1d739a16a78'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a833ff1e-c010-4127-97e0-c1d739a16a78', '3DE4E36C-692F-4311-8732-4C7F4B7DD748', 'DA7103B0-8AF9-4230-B060-863D0EBB13EF', 'rider_id', 'One To Many', 1, 1, 'Locations', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'af57602e-eaaf-42cb-98f1-24860e857959'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('af57602e-eaaf-42cb-98f1-24860e857959', 'DA7103B0-8AF9-4230-B060-863D0EBB13EF', 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', 'location_id', 'One To Many', 1, 1, 'Rider _ Stats', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5d74b9b3-cd3c-4702-9de6-ac4b93b6d7d4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5d74b9b3-cd3c-4702-9de6-ac4b93b6d7d4', 'DA7103B0-8AF9-4230-B060-863D0EBB13EF', '96613ECB-68C3-43E7-951F-C094FE4A2D57', 'location_id', 'One To Many', 1, 1, 'Weathers', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9bd74ed0-dc50-48ba-a474-0eeedbb4a01f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9bd74ed0-dc50-48ba-a474-0eeedbb4a01f', 'A30F1CE0-8AE2-4E88-AC05-9EB3E32757A5', 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', 'bike_id', 'One To Many', 1, 1, 'Rider _ Stats', 3);
   END
                              

/* Index for Foreign Keys for Bike */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bikes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key rider_id in table Bike
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Bike_rider_id' 
    AND object_id = OBJECT_ID('[MJ_Biking_App].[Bike]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Bike_rider_id ON [MJ_Biking_App].[Bike] ([rider_id]);

/* Base View SQL for Bikes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bikes
-- Item: vwBikes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Bikes
-----               SCHEMA:      MJ_Biking_App
-----               BASE TABLE:  Bike
-----               PRIMARY KEY: bike_id
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[vwBikes]', 'V') IS NOT NULL
    DROP VIEW [MJ_Biking_App].[vwBikes];
GO

CREATE VIEW [MJ_Biking_App].[vwBikes]
AS
SELECT
    b.*
FROM
    [MJ_Biking_App].[Bike] AS b
GO
GRANT SELECT ON [MJ_Biking_App].[vwBikes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Bikes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bikes
-- Item: Permissions for vwBikes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [MJ_Biking_App].[vwBikes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Bikes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bikes
-- Item: spCreateBike
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Bike
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spCreateBike]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spCreateBike];
GO

CREATE PROCEDURE [MJ_Biking_App].[spCreateBike]
    @bike_id uniqueidentifier = NULL,
    @rider_id uniqueidentifier,
    @name nvarchar(100),
    @bike_type nvarchar(20),
    @weight_kg decimal(5, 2),
    @wheel_size_in decimal(4, 2),
    @total_distance_m decimal(12, 2) = NULL,
    @last_serviced datetime2
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([bike_id] UNIQUEIDENTIFIER)
    
    IF @bike_id IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [MJ_Biking_App].[Bike]
            (
                [bike_id],
                [rider_id],
                [name],
                [bike_type],
                [weight_kg],
                [wheel_size_in],
                [total_distance_m],
                [last_serviced]
            )
        OUTPUT INSERTED.[bike_id] INTO @InsertedRow
        VALUES
            (
                @bike_id,
                @rider_id,
                @name,
                @bike_type,
                @weight_kg,
                @wheel_size_in,
                ISNULL(@total_distance_m, 0),
                @last_serviced
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [MJ_Biking_App].[Bike]
            (
                [rider_id],
                [name],
                [bike_type],
                [weight_kg],
                [wheel_size_in],
                [total_distance_m],
                [last_serviced]
            )
        OUTPUT INSERTED.[bike_id] INTO @InsertedRow
        VALUES
            (
                @rider_id,
                @name,
                @bike_type,
                @weight_kg,
                @wheel_size_in,
                ISNULL(@total_distance_m, 0),
                @last_serviced
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [MJ_Biking_App].[vwBikes] WHERE [bike_id] = (SELECT [bike_id] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spCreateBike] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Bikes */

GRANT EXECUTE ON [MJ_Biking_App].[spCreateBike] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Bikes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bikes
-- Item: spUpdateBike
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Bike
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spUpdateBike]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spUpdateBike];
GO

CREATE PROCEDURE [MJ_Biking_App].[spUpdateBike]
    @bike_id uniqueidentifier,
    @rider_id uniqueidentifier,
    @name nvarchar(100),
    @bike_type nvarchar(20),
    @weight_kg decimal(5, 2),
    @wheel_size_in decimal(4, 2),
    @total_distance_m decimal(12, 2),
    @last_serviced datetime2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Bike]
    SET
        [rider_id] = @rider_id,
        [name] = @name,
        [bike_type] = @bike_type,
        [weight_kg] = @weight_kg,
        [wheel_size_in] = @wheel_size_in,
        [total_distance_m] = @total_distance_m,
        [last_serviced] = @last_serviced
    WHERE
        [bike_id] = @bike_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [MJ_Biking_App].[vwBikes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [MJ_Biking_App].[vwBikes]
                                    WHERE
                                        [bike_id] = @bike_id
                                    
END
GO

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateBike] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Bike table
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[trgUpdateBike]', 'TR') IS NOT NULL
    DROP TRIGGER [MJ_Biking_App].[trgUpdateBike];
GO
CREATE TRIGGER [MJ_Biking_App].trgUpdateBike
ON [MJ_Biking_App].[Bike]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Bike]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [MJ_Biking_App].[Bike] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[bike_id] = I.[bike_id];
END;
GO
        

/* spUpdate Permissions for Bikes */

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateBike] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Bikes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Bikes
-- Item: spDeleteBike
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Bike
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spDeleteBike]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spDeleteBike];
GO

CREATE PROCEDURE [MJ_Biking_App].[spDeleteBike]
    @bike_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [MJ_Biking_App].[Bike]
    WHERE
        [bike_id] = @bike_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [bike_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @bike_id AS [bike_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spDeleteBike] TO [cdp_Integration]
    

/* spDelete Permissions for Bikes */

GRANT EXECUTE ON [MJ_Biking_App].[spDeleteBike] TO [cdp_Integration]



/* Index for Foreign Keys for Location */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key rider_id in table Location
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Location_rider_id' 
    AND object_id = OBJECT_ID('[MJ_Biking_App].[Location]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Location_rider_id ON [MJ_Biking_App].[Location] ([rider_id]);

/* Base View SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: vwLocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Locations
-----               SCHEMA:      MJ_Biking_App
-----               BASE TABLE:  Location
-----               PRIMARY KEY: location_id
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[vwLocations]', 'V') IS NOT NULL
    DROP VIEW [MJ_Biking_App].[vwLocations];
GO

CREATE VIEW [MJ_Biking_App].[vwLocations]
AS
SELECT
    l.*
FROM
    [MJ_Biking_App].[Location] AS l
GO
GRANT SELECT ON [MJ_Biking_App].[vwLocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: Permissions for vwLocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [MJ_Biking_App].[vwLocations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: spCreateLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Location
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spCreateLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spCreateLocation];
GO

CREATE PROCEDURE [MJ_Biking_App].[spCreateLocation]
    @location_id uniqueidentifier = NULL,
    @rider_id uniqueidentifier,
    @name nvarchar(150),
    @latitude decimal(9, 6),
    @longitude decimal(9, 6),
    @elevation_m decimal(7, 2),
    @terrain_type nvarchar(20),
    @surface_condition nvarchar(20),
    @difficulty_rating decimal(3, 1),
    @visit_count int = NULL,
    @first_visited datetime2 = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([location_id] UNIQUEIDENTIFIER)
    
    IF @location_id IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [MJ_Biking_App].[Location]
            (
                [location_id],
                [rider_id],
                [name],
                [latitude],
                [longitude],
                [elevation_m],
                [terrain_type],
                [surface_condition],
                [difficulty_rating],
                [visit_count],
                [first_visited]
            )
        OUTPUT INSERTED.[location_id] INTO @InsertedRow
        VALUES
            (
                @location_id,
                @rider_id,
                @name,
                @latitude,
                @longitude,
                @elevation_m,
                @terrain_type,
                @surface_condition,
                @difficulty_rating,
                ISNULL(@visit_count, 0),
                ISNULL(@first_visited, getutcdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [MJ_Biking_App].[Location]
            (
                [rider_id],
                [name],
                [latitude],
                [longitude],
                [elevation_m],
                [terrain_type],
                [surface_condition],
                [difficulty_rating],
                [visit_count],
                [first_visited]
            )
        OUTPUT INSERTED.[location_id] INTO @InsertedRow
        VALUES
            (
                @rider_id,
                @name,
                @latitude,
                @longitude,
                @elevation_m,
                @terrain_type,
                @surface_condition,
                @difficulty_rating,
                ISNULL(@visit_count, 0),
                ISNULL(@first_visited, getutcdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [MJ_Biking_App].[vwLocations] WHERE [location_id] = (SELECT [location_id] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spCreateLocation] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Locations */

GRANT EXECUTE ON [MJ_Biking_App].[spCreateLocation] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: spUpdateLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Location
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spUpdateLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spUpdateLocation];
GO

CREATE PROCEDURE [MJ_Biking_App].[spUpdateLocation]
    @location_id uniqueidentifier,
    @rider_id uniqueidentifier,
    @name nvarchar(150),
    @latitude decimal(9, 6),
    @longitude decimal(9, 6),
    @elevation_m decimal(7, 2),
    @terrain_type nvarchar(20),
    @surface_condition nvarchar(20),
    @difficulty_rating decimal(3, 1),
    @visit_count int,
    @first_visited datetime2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Location]
    SET
        [rider_id] = @rider_id,
        [name] = @name,
        [latitude] = @latitude,
        [longitude] = @longitude,
        [elevation_m] = @elevation_m,
        [terrain_type] = @terrain_type,
        [surface_condition] = @surface_condition,
        [difficulty_rating] = @difficulty_rating,
        [visit_count] = @visit_count,
        [first_visited] = @first_visited
    WHERE
        [location_id] = @location_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [MJ_Biking_App].[vwLocations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [MJ_Biking_App].[vwLocations]
                                    WHERE
                                        [location_id] = @location_id
                                    
END
GO

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateLocation] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Location table
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[trgUpdateLocation]', 'TR') IS NOT NULL
    DROP TRIGGER [MJ_Biking_App].[trgUpdateLocation];
GO
CREATE TRIGGER [MJ_Biking_App].trgUpdateLocation
ON [MJ_Biking_App].[Location]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Location]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [MJ_Biking_App].[Location] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[location_id] = I.[location_id];
END;
GO
        

/* spUpdate Permissions for Locations */

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateLocation] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Locations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Locations
-- Item: spDeleteLocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Location
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spDeleteLocation]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spDeleteLocation];
GO

CREATE PROCEDURE [MJ_Biking_App].[spDeleteLocation]
    @location_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [MJ_Biking_App].[Location]
    WHERE
        [location_id] = @location_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [location_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @location_id AS [location_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spDeleteLocation] TO [cdp_Integration]
    

/* spDelete Permissions for Locations */

GRANT EXECUTE ON [MJ_Biking_App].[spDeleteLocation] TO [cdp_Integration]



/* Index for Foreign Keys for Rider_Stats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Rider _ Stats
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key rider_id in table Rider_Stats
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Rider_Stats_rider_id' 
    AND object_id = OBJECT_ID('[MJ_Biking_App].[Rider_Stats]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Rider_Stats_rider_id ON [MJ_Biking_App].[Rider_Stats] ([rider_id]);

-- Index for foreign key location_id in table Rider_Stats
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Rider_Stats_location_id' 
    AND object_id = OBJECT_ID('[MJ_Biking_App].[Rider_Stats]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Rider_Stats_location_id ON [MJ_Biking_App].[Rider_Stats] ([location_id]);

-- Index for foreign key bike_id in table Rider_Stats
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Rider_Stats_bike_id' 
    AND object_id = OBJECT_ID('[MJ_Biking_App].[Rider_Stats]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Rider_Stats_bike_id ON [MJ_Biking_App].[Rider_Stats] ([bike_id]);

/* SQL text to update entity field related entity name field map for entity field ID F96E0F5E-5A5F-4E44-81BA-AE0E8CC77606 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F96E0F5E-5A5F-4E44-81BA-AE0E8CC77606',
         @RelatedEntityNameFieldMap='location_id_Virtual'

/* Index for Foreign Keys for Rider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Riders
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Riders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Riders
-- Item: vwRiders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Riders
-----               SCHEMA:      MJ_Biking_App
-----               BASE TABLE:  Rider
-----               PRIMARY KEY: rider_id
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[vwRiders]', 'V') IS NOT NULL
    DROP VIEW [MJ_Biking_App].[vwRiders];
GO

CREATE VIEW [MJ_Biking_App].[vwRiders]
AS
SELECT
    r.*
FROM
    [MJ_Biking_App].[Rider] AS r
GO
GRANT SELECT ON [MJ_Biking_App].[vwRiders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Riders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Riders
-- Item: Permissions for vwRiders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [MJ_Biking_App].[vwRiders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Riders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Riders
-- Item: spCreateRider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Rider
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spCreateRider]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spCreateRider];
GO

CREATE PROCEDURE [MJ_Biking_App].[spCreateRider]
    @rider_id uniqueidentifier = NULL,
    @username nvarchar(50),
    @email nvarchar(255),
    @weight_kg decimal(5, 2),
    @fitness_level int,
    @preferred_terrain nvarchar(20),
    @lifetime_stats nvarchar(MAX),
    @created_at datetime2 = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([rider_id] UNIQUEIDENTIFIER)
    
    IF @rider_id IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [MJ_Biking_App].[Rider]
            (
                [rider_id],
                [username],
                [email],
                [weight_kg],
                [fitness_level],
                [preferred_terrain],
                [lifetime_stats],
                [created_at]
            )
        OUTPUT INSERTED.[rider_id] INTO @InsertedRow
        VALUES
            (
                @rider_id,
                @username,
                @email,
                @weight_kg,
                @fitness_level,
                @preferred_terrain,
                @lifetime_stats,
                ISNULL(@created_at, getutcdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [MJ_Biking_App].[Rider]
            (
                [username],
                [email],
                [weight_kg],
                [fitness_level],
                [preferred_terrain],
                [lifetime_stats],
                [created_at]
            )
        OUTPUT INSERTED.[rider_id] INTO @InsertedRow
        VALUES
            (
                @username,
                @email,
                @weight_kg,
                @fitness_level,
                @preferred_terrain,
                @lifetime_stats,
                ISNULL(@created_at, getutcdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [MJ_Biking_App].[vwRiders] WHERE [rider_id] = (SELECT [rider_id] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spCreateRider] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Riders */

GRANT EXECUTE ON [MJ_Biking_App].[spCreateRider] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Riders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Riders
-- Item: spUpdateRider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Rider
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spUpdateRider]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spUpdateRider];
GO

CREATE PROCEDURE [MJ_Biking_App].[spUpdateRider]
    @rider_id uniqueidentifier,
    @username nvarchar(50),
    @email nvarchar(255),
    @weight_kg decimal(5, 2),
    @fitness_level int,
    @preferred_terrain nvarchar(20),
    @lifetime_stats nvarchar(MAX),
    @created_at datetime2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Rider]
    SET
        [username] = @username,
        [email] = @email,
        [weight_kg] = @weight_kg,
        [fitness_level] = @fitness_level,
        [preferred_terrain] = @preferred_terrain,
        [lifetime_stats] = @lifetime_stats,
        [created_at] = @created_at
    WHERE
        [rider_id] = @rider_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [MJ_Biking_App].[vwRiders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [MJ_Biking_App].[vwRiders]
                                    WHERE
                                        [rider_id] = @rider_id
                                    
END
GO

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateRider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Rider table
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[trgUpdateRider]', 'TR') IS NOT NULL
    DROP TRIGGER [MJ_Biking_App].[trgUpdateRider];
GO
CREATE TRIGGER [MJ_Biking_App].trgUpdateRider
ON [MJ_Biking_App].[Rider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Rider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [MJ_Biking_App].[Rider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[rider_id] = I.[rider_id];
END;
GO
        

/* spUpdate Permissions for Riders */

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateRider] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Riders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Riders
-- Item: spDeleteRider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Rider
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spDeleteRider]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spDeleteRider];
GO

CREATE PROCEDURE [MJ_Biking_App].[spDeleteRider]
    @rider_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [MJ_Biking_App].[Rider]
    WHERE
        [rider_id] = @rider_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [rider_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @rider_id AS [rider_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spDeleteRider] TO [cdp_Integration]
    

/* spDelete Permissions for Riders */

GRANT EXECUTE ON [MJ_Biking_App].[spDeleteRider] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 036796F3-B523-4CD1-9E25-2702F3068E1C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='036796F3-B523-4CD1-9E25-2702F3068E1C',
         @RelatedEntityNameFieldMap='bike_id_Virtual'

/* Base View SQL for Rider _ Stats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Rider _ Stats
-- Item: vwRider_Stats
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Rider _ Stats
-----               SCHEMA:      MJ_Biking_App
-----               BASE TABLE:  Rider_Stats
-----               PRIMARY KEY: stats_id
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[vwRider_Stats]', 'V') IS NOT NULL
    DROP VIEW [MJ_Biking_App].[vwRider_Stats];
GO

CREATE VIEW [MJ_Biking_App].[vwRider_Stats]
AS
SELECT
    r.*,
    Location_location_id.[name] AS [location_id_Virtual],
    Bike_bike_id.[name] AS [bike_id_Virtual]
FROM
    [MJ_Biking_App].[Rider_Stats] AS r
LEFT OUTER JOIN
    [MJ_Biking_App].[Location] AS Location_location_id
  ON
    [r].[location_id] = Location_location_id.[location_id]
LEFT OUTER JOIN
    [MJ_Biking_App].[Bike] AS Bike_bike_id
  ON
    [r].[bike_id] = Bike_bike_id.[bike_id]
GO
GRANT SELECT ON [MJ_Biking_App].[vwRider_Stats] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Rider _ Stats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Rider _ Stats
-- Item: Permissions for vwRider_Stats
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [MJ_Biking_App].[vwRider_Stats] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Rider _ Stats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Rider _ Stats
-- Item: spCreateRider_Stats
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Rider_Stats
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spCreateRider_Stats]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spCreateRider_Stats];
GO

CREATE PROCEDURE [MJ_Biking_App].[spCreateRider_Stats]
    @stats_id uniqueidentifier = NULL,
    @rider_id uniqueidentifier,
    @location_id uniqueidentifier,
    @bike_id uniqueidentifier,
    @avg_speed_mps decimal(6, 2),
    @max_speed_mps decimal(6, 2),
    @avg_heart_rate_bpm int,
    @max_heart_rate_bpm int,
    @cadence_rpm int,
    @power_watts int,
    @distance_m decimal(12, 2),
    @elevation_gain_m decimal(8, 2),
    @duration_seconds int,
    @calories_burned int,
    @effort_rating int,
    @recorded_at datetime2 = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([stats_id] UNIQUEIDENTIFIER)
    
    IF @stats_id IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [MJ_Biking_App].[Rider_Stats]
            (
                [stats_id],
                [rider_id],
                [location_id],
                [bike_id],
                [avg_speed_mps],
                [max_speed_mps],
                [avg_heart_rate_bpm],
                [max_heart_rate_bpm],
                [cadence_rpm],
                [power_watts],
                [distance_m],
                [elevation_gain_m],
                [duration_seconds],
                [calories_burned],
                [effort_rating],
                [recorded_at]
            )
        OUTPUT INSERTED.[stats_id] INTO @InsertedRow
        VALUES
            (
                @stats_id,
                @rider_id,
                @location_id,
                @bike_id,
                @avg_speed_mps,
                @max_speed_mps,
                @avg_heart_rate_bpm,
                @max_heart_rate_bpm,
                @cadence_rpm,
                @power_watts,
                @distance_m,
                @elevation_gain_m,
                @duration_seconds,
                @calories_burned,
                @effort_rating,
                ISNULL(@recorded_at, getutcdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [MJ_Biking_App].[Rider_Stats]
            (
                [rider_id],
                [location_id],
                [bike_id],
                [avg_speed_mps],
                [max_speed_mps],
                [avg_heart_rate_bpm],
                [max_heart_rate_bpm],
                [cadence_rpm],
                [power_watts],
                [distance_m],
                [elevation_gain_m],
                [duration_seconds],
                [calories_burned],
                [effort_rating],
                [recorded_at]
            )
        OUTPUT INSERTED.[stats_id] INTO @InsertedRow
        VALUES
            (
                @rider_id,
                @location_id,
                @bike_id,
                @avg_speed_mps,
                @max_speed_mps,
                @avg_heart_rate_bpm,
                @max_heart_rate_bpm,
                @cadence_rpm,
                @power_watts,
                @distance_m,
                @elevation_gain_m,
                @duration_seconds,
                @calories_burned,
                @effort_rating,
                ISNULL(@recorded_at, getutcdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [MJ_Biking_App].[vwRider_Stats] WHERE [stats_id] = (SELECT [stats_id] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spCreateRider_Stats] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Rider _ Stats */

GRANT EXECUTE ON [MJ_Biking_App].[spCreateRider_Stats] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Rider _ Stats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Rider _ Stats
-- Item: spUpdateRider_Stats
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Rider_Stats
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spUpdateRider_Stats]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spUpdateRider_Stats];
GO

CREATE PROCEDURE [MJ_Biking_App].[spUpdateRider_Stats]
    @stats_id uniqueidentifier,
    @rider_id uniqueidentifier,
    @location_id uniqueidentifier,
    @bike_id uniqueidentifier,
    @avg_speed_mps decimal(6, 2),
    @max_speed_mps decimal(6, 2),
    @avg_heart_rate_bpm int,
    @max_heart_rate_bpm int,
    @cadence_rpm int,
    @power_watts int,
    @distance_m decimal(12, 2),
    @elevation_gain_m decimal(8, 2),
    @duration_seconds int,
    @calories_burned int,
    @effort_rating int,
    @recorded_at datetime2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Rider_Stats]
    SET
        [rider_id] = @rider_id,
        [location_id] = @location_id,
        [bike_id] = @bike_id,
        [avg_speed_mps] = @avg_speed_mps,
        [max_speed_mps] = @max_speed_mps,
        [avg_heart_rate_bpm] = @avg_heart_rate_bpm,
        [max_heart_rate_bpm] = @max_heart_rate_bpm,
        [cadence_rpm] = @cadence_rpm,
        [power_watts] = @power_watts,
        [distance_m] = @distance_m,
        [elevation_gain_m] = @elevation_gain_m,
        [duration_seconds] = @duration_seconds,
        [calories_burned] = @calories_burned,
        [effort_rating] = @effort_rating,
        [recorded_at] = @recorded_at
    WHERE
        [stats_id] = @stats_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [MJ_Biking_App].[vwRider_Stats] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [MJ_Biking_App].[vwRider_Stats]
                                    WHERE
                                        [stats_id] = @stats_id
                                    
END
GO

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateRider_Stats] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Rider_Stats table
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[trgUpdateRider_Stats]', 'TR') IS NOT NULL
    DROP TRIGGER [MJ_Biking_App].[trgUpdateRider_Stats];
GO
CREATE TRIGGER [MJ_Biking_App].trgUpdateRider_Stats
ON [MJ_Biking_App].[Rider_Stats]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Rider_Stats]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [MJ_Biking_App].[Rider_Stats] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[stats_id] = I.[stats_id];
END;
GO
        

/* spUpdate Permissions for Rider _ Stats */

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateRider_Stats] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Rider _ Stats */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Rider _ Stats
-- Item: spDeleteRider_Stats
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Rider_Stats
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spDeleteRider_Stats]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spDeleteRider_Stats];
GO

CREATE PROCEDURE [MJ_Biking_App].[spDeleteRider_Stats]
    @stats_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [MJ_Biking_App].[Rider_Stats]
    WHERE
        [stats_id] = @stats_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [stats_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @stats_id AS [stats_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spDeleteRider_Stats] TO [cdp_Integration]
    

/* spDelete Permissions for Rider _ Stats */

GRANT EXECUTE ON [MJ_Biking_App].[spDeleteRider_Stats] TO [cdp_Integration]



/* Index for Foreign Keys for Weather */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Weathers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key location_id in table Weather
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Weather_location_id' 
    AND object_id = OBJECT_ID('[MJ_Biking_App].[Weather]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Weather_location_id ON [MJ_Biking_App].[Weather] ([location_id]);

/* SQL text to update entity field related entity name field map for entity field ID F3E54018-3B2A-47A8-8598-7FF90994453B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F3E54018-3B2A-47A8-8598-7FF90994453B',
         @RelatedEntityNameFieldMap='location_id_Virtual'

/* Base View SQL for Weathers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Weathers
-- Item: vwWeathers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Weathers
-----               SCHEMA:      MJ_Biking_App
-----               BASE TABLE:  Weather
-----               PRIMARY KEY: weather_id
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[vwWeathers]', 'V') IS NOT NULL
    DROP VIEW [MJ_Biking_App].[vwWeathers];
GO

CREATE VIEW [MJ_Biking_App].[vwWeathers]
AS
SELECT
    w.*,
    Location_location_id.[name] AS [location_id_Virtual]
FROM
    [MJ_Biking_App].[Weather] AS w
INNER JOIN
    [MJ_Biking_App].[Location] AS Location_location_id
  ON
    [w].[location_id] = Location_location_id.[location_id]
GO
GRANT SELECT ON [MJ_Biking_App].[vwWeathers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Weathers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Weathers
-- Item: Permissions for vwWeathers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [MJ_Biking_App].[vwWeathers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Weathers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Weathers
-- Item: spCreateWeather
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Weather
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spCreateWeather]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spCreateWeather];
GO

CREATE PROCEDURE [MJ_Biking_App].[spCreateWeather]
    @weather_id uniqueidentifier = NULL,
    @location_id uniqueidentifier,
    @temperature_c decimal(5, 2),
    @humidity_pct decimal(5, 2),
    @wind_speed_mps decimal(6, 2),
    @wind_direction_deg decimal(5, 2),
    @precipitation_type nvarchar(20),
    @cloud_cover_pct int,
    @visibility_km decimal(6, 2),
    @observed_at datetime2 = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([weather_id] UNIQUEIDENTIFIER)
    
    IF @weather_id IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [MJ_Biking_App].[Weather]
            (
                [weather_id],
                [location_id],
                [temperature_c],
                [humidity_pct],
                [wind_speed_mps],
                [wind_direction_deg],
                [precipitation_type],
                [cloud_cover_pct],
                [visibility_km],
                [observed_at]
            )
        OUTPUT INSERTED.[weather_id] INTO @InsertedRow
        VALUES
            (
                @weather_id,
                @location_id,
                @temperature_c,
                @humidity_pct,
                @wind_speed_mps,
                @wind_direction_deg,
                @precipitation_type,
                @cloud_cover_pct,
                @visibility_km,
                ISNULL(@observed_at, getutcdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [MJ_Biking_App].[Weather]
            (
                [location_id],
                [temperature_c],
                [humidity_pct],
                [wind_speed_mps],
                [wind_direction_deg],
                [precipitation_type],
                [cloud_cover_pct],
                [visibility_km],
                [observed_at]
            )
        OUTPUT INSERTED.[weather_id] INTO @InsertedRow
        VALUES
            (
                @location_id,
                @temperature_c,
                @humidity_pct,
                @wind_speed_mps,
                @wind_direction_deg,
                @precipitation_type,
                @cloud_cover_pct,
                @visibility_km,
                ISNULL(@observed_at, getutcdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [MJ_Biking_App].[vwWeathers] WHERE [weather_id] = (SELECT [weather_id] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spCreateWeather] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Weathers */

GRANT EXECUTE ON [MJ_Biking_App].[spCreateWeather] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Weathers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Weathers
-- Item: spUpdateWeather
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Weather
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spUpdateWeather]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spUpdateWeather];
GO

CREATE PROCEDURE [MJ_Biking_App].[spUpdateWeather]
    @weather_id uniqueidentifier,
    @location_id uniqueidentifier,
    @temperature_c decimal(5, 2),
    @humidity_pct decimal(5, 2),
    @wind_speed_mps decimal(6, 2),
    @wind_direction_deg decimal(5, 2),
    @precipitation_type nvarchar(20),
    @cloud_cover_pct int,
    @visibility_km decimal(6, 2),
    @observed_at datetime2
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Weather]
    SET
        [location_id] = @location_id,
        [temperature_c] = @temperature_c,
        [humidity_pct] = @humidity_pct,
        [wind_speed_mps] = @wind_speed_mps,
        [wind_direction_deg] = @wind_direction_deg,
        [precipitation_type] = @precipitation_type,
        [cloud_cover_pct] = @cloud_cover_pct,
        [visibility_km] = @visibility_km,
        [observed_at] = @observed_at
    WHERE
        [weather_id] = @weather_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [MJ_Biking_App].[vwWeathers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [MJ_Biking_App].[vwWeathers]
                                    WHERE
                                        [weather_id] = @weather_id
                                    
END
GO

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateWeather] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Weather table
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[trgUpdateWeather]', 'TR') IS NOT NULL
    DROP TRIGGER [MJ_Biking_App].[trgUpdateWeather];
GO
CREATE TRIGGER [MJ_Biking_App].trgUpdateWeather
ON [MJ_Biking_App].[Weather]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [MJ_Biking_App].[Weather]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [MJ_Biking_App].[Weather] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[weather_id] = I.[weather_id];
END;
GO
        

/* spUpdate Permissions for Weathers */

GRANT EXECUTE ON [MJ_Biking_App].[spUpdateWeather] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Weathers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Weathers
-- Item: spDeleteWeather
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Weather
------------------------------------------------------------
IF OBJECT_ID('[MJ_Biking_App].[spDeleteWeather]', 'P') IS NOT NULL
    DROP PROCEDURE [MJ_Biking_App].[spDeleteWeather];
GO

CREATE PROCEDURE [MJ_Biking_App].[spDeleteWeather]
    @weather_id uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [MJ_Biking_App].[Weather]
    WHERE
        [weather_id] = @weather_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [weather_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @weather_id AS [weather_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [MJ_Biking_App].[spDeleteWeather] TO [cdp_Integration]
    

/* spDelete Permissions for Weathers */

GRANT EXECUTE ON [MJ_Biking_App].[spDeleteWeather] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'faa60477-71ef-4504-b440-50517cf95eda'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'location_id_Virtual')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'faa60477-71ef-4504-b440-50517cf95eda',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100037,
            'location_id_Virtual',
            'location _id _ Virtual',
            NULL,
            'nvarchar',
            300,
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
         WHERE ID = 'b30dced0-775c-4ed4-a3ea-1330143403e9'  OR 
               (EntityID = 'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91' AND Name = 'bike_id_Virtual')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b30dced0-775c-4ed4-a3ea-1330143403e9',
            'E1462CC1-2ACC-47D7-BFAF-BF8315DDFE91', -- Entity: Rider _ Stats
            100038,
            'bike_id_Virtual',
            'bike _id _ Virtual',
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
         WHERE ID = 'c50deb9c-6084-464a-bf72-4d266a7446bd'  OR 
               (EntityID = '96613ECB-68C3-43E7-951F-C094FE4A2D57' AND Name = 'location_id_Virtual')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c50deb9c-6084-464a-bf72-4d266a7446bd',
            '96613ECB-68C3-43E7-951F-C094FE4A2D57', -- Entity: Weathers
            100025,
            'location_id_Virtual',
            'location _id _ Virtual',
            NULL,
            'nvarchar',
            300,
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

