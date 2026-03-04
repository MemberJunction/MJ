/* SQL generated to create new entity MJ: Integration Source Types */

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
         'b3798978-fb0a-4d5e-8b2e-0f9d28acf89a',
         'MJ: Integration Source Types',
         'Integration Source Types',
         NULL,
         NULL,
         'IntegrationSourceType',
         'vwIntegrationSourceTypes',
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
   

/* SQL generated to add new entity MJ: Integration Source Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b3798978-fb0a-4d5e-8b2e-0f9d28acf89a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Integration Source Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b3798978-fb0a-4d5e-8b2e-0f9d28acf89a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Integration Source Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b3798978-fb0a-4d5e-8b2e-0f9d28acf89a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Integration Source Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b3798978-fb0a-4d5e-8b2e-0f9d28acf89a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Company Integration Entity Maps */

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
         '34f67c2f-0d31-43db-9665-3eabb7833867',
         'MJ: Company Integration Entity Maps',
         'Company Integration Entity Maps',
         NULL,
         NULL,
         'CompanyIntegrationEntityMap',
         'vwCompanyIntegrationEntityMaps',
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
   

/* SQL generated to add new entity MJ: Company Integration Entity Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '34f67c2f-0d31-43db-9665-3eabb7833867', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('34f67c2f-0d31-43db-9665-3eabb7833867', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('34f67c2f-0d31-43db-9665-3eabb7833867', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('34f67c2f-0d31-43db-9665-3eabb7833867', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Company Integration Field Maps */

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
         '3cac10f4-cd1a-4cec-9c81-c8eda5a8bcf1',
         'MJ: Company Integration Field Maps',
         'Company Integration Field Maps',
         NULL,
         NULL,
         'CompanyIntegrationFieldMap',
         'vwCompanyIntegrationFieldMaps',
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
   

/* SQL generated to add new entity MJ: Company Integration Field Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3cac10f4-cd1a-4cec-9c81-c8eda5a8bcf1', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3cac10f4-cd1a-4cec-9c81-c8eda5a8bcf1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3cac10f4-cd1a-4cec-9c81-c8eda5a8bcf1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3cac10f4-cd1a-4cec-9c81-c8eda5a8bcf1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Company Integration Sync Watermarks */

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
         'eba65fd6-1a37-4af8-8655-eb85a852c8ec',
         'MJ: Company Integration Sync Watermarks',
         'Company Integration Sync Watermarks',
         NULL,
         NULL,
         'CompanyIntegrationSyncWatermark',
         'vwCompanyIntegrationSyncWatermarks',
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
   

/* SQL generated to add new entity MJ: Company Integration Sync Watermarks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'eba65fd6-1a37-4af8-8655-eb85a852c8ec', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('eba65fd6-1a37-4af8-8655-eb85a852c8ec', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('eba65fd6-1a37-4af8-8655-eb85a852c8ec', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('eba65fd6-1a37-4af8-8655-eb85a852c8ec', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.IntegrationSourceType */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationSourceType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.IntegrationSourceType */
ALTER TABLE [${flyway:defaultSchema}].[IntegrationSourceType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e001a6e3-e64c-442f-9efd-c4eacf3cbdd7'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e001a6e3-e64c-442f-9efd-c4eacf3cbdd7',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
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
         WHERE ID = '5b88ee70-7628-449c-b978-05666cc0be00'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5b88ee70-7628-449c-b978-05666cc0be00',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
            100002,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            400,
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
         WHERE ID = '319db732-b489-4da3-be12-2dc9ebbd671c'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '319db732-b489-4da3-be12-2dc9ebbd671c',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
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
         WHERE ID = '932b6403-51a2-4878-90be-878f8145ca31'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = 'DriverClass')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '932b6403-51a2-4878-90be-878f8145ca31',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
            100004,
            'DriverClass',
            'Driver Class',
            NULL,
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
         WHERE ID = 'e24fc616-beac-45c3-a175-618247dd1152'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = 'IconClass')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e24fc616-beac-45c3-a175-618247dd1152',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
            100005,
            'IconClass',
            'Icon Class',
            NULL,
            'nvarchar',
            400,
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
         WHERE ID = '70d746da-5cd2-494c-85ed-353145791bc1'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '70d746da-5cd2-494c-85ed-353145791bc1',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
            100006,
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
         WHERE ID = '683f0dc3-4093-416c-b209-c562152e009a'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '683f0dc3-4093-416c-b209-c562152e009a',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
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
         WHERE ID = 'b0e39085-7114-4719-b47b-946af00e157f'  OR 
               (EntityID = 'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b0e39085-7114-4719-b47b-946af00e157f',
            'B3798978-FB0A-4D5E-8B2E-0F9D28ACF89A', -- Entity: MJ: Integration Source Types
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
         WHERE ID = '896a9731-ac65-422b-abe8-7f76c2397abb'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '896a9731-ac65-422b-abe8-7f76c2397abb',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
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
         WHERE ID = '8cd5f6e1-9ced-4393-9d6c-486ce3d3504c'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'CompanyIntegrationID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8cd5f6e1-9ced-4393-9d6c-486ce3d3504c',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100002,
            'CompanyIntegrationID',
            'Company Integration ID',
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
            'DE238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = 'f7059000-f037-45b4-80fa-9ad87eebb1b1'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'ExternalObjectName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f7059000-f037-45b4-80fa-9ad87eebb1b1',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100003,
            'ExternalObjectName',
            'External Object Name',
            NULL,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e4f5a37e-3645-4737-8d7a-264e7d5ac387'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'ExternalObjectLabel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4f5a37e-3645-4737-8d7a-264e7d5ac387',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100004,
            'ExternalObjectLabel',
            'External Object Label',
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
         WHERE ID = '07926dde-86cb-40bb-bd8c-2ebed3c8332d'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'EntityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '07926dde-86cb-40bb-bd8c-2ebed3c8332d',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100005,
            'EntityID',
            'Entity ID',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = 'c9bb6b24-911b-4f2e-a56d-3d21cf323eb2'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'SyncDirection')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c9bb6b24-911b-4f2e-a56d-3d21cf323eb2',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100006,
            'SyncDirection',
            'Sync Direction',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pull',
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
         WHERE ID = '326dd712-5522-40de-a634-3a4d36e0e450'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'SyncEnabled')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '326dd712-5522-40de-a634-3a4d36e0e450',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100007,
            'SyncEnabled',
            'Sync Enabled',
            NULL,
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
         WHERE ID = 'fd3a2400-d2fd-49f8-8be7-bbf8d2c000f1'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'MatchStrategy')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd3a2400-d2fd-49f8-8be7-bbf8d2c000f1',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100008,
            'MatchStrategy',
            'Match Strategy',
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
         WHERE ID = 'd33ba545-1652-41e6-a392-1b6fe160cf5f'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'ConflictResolution')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd33ba545-1652-41e6-a392-1b6fe160cf5f',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100009,
            'ConflictResolution',
            'Conflict Resolution',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'SourceWins',
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
         WHERE ID = '5f01c31e-f9b7-4274-88eb-7498241aad1f'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5f01c31e-f9b7-4274-88eb-7498241aad1f',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100010,
            'Priority',
            'Priority',
            NULL,
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
         WHERE ID = '0be082f6-d7e7-43ec-8438-0bf212577c75'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'DeleteBehavior')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0be082f6-d7e7-43ec-8438-0bf212577c75',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100011,
            'DeleteBehavior',
            'Delete Behavior',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'SoftDelete',
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
         WHERE ID = '9749d299-a85d-4928-bcdd-861d20e4af1c'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9749d299-a85d-4928-bcdd-861d20e4af1c',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100012,
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
         WHERE ID = '29fe5333-d79e-48ba-be86-1a4f326cd397'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'Configuration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '29fe5333-d79e-48ba-be86-1a4f326cd397',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100013,
            'Configuration',
            'Configuration',
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
         WHERE ID = 'b3044f81-b6ac-4862-bbe7-73ffd22bb9f8'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b3044f81-b6ac-4862-bbe7-73ffd22bb9f8',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
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
         WHERE ID = '458fc8a3-f1d3-4679-991f-87885421d0c3'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '458fc8a3-f1d3-4679-991f-87885421d0c3',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
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
         WHERE ID = '2a87a724-1db3-4bfe-ad86-925bef7f4786'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2a87a724-1db3-4bfe-ad86-925bef7f4786',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
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
         WHERE ID = 'f11896e1-f4f6-4882-bf52-0b7aca9d761f'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'EntityMapID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f11896e1-f4f6-4882-bf52-0b7aca9d761f',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100002,
            'EntityMapID',
            'Entity Map ID',
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
            '34F67C2F-0D31-43DB-9665-3EABB7833867',
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
         WHERE ID = 'dfa2e261-2be2-41bc-9a40-4d25f6d019f4'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'SourceFieldName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dfa2e261-2be2-41bc-9a40-4d25f6d019f4',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100003,
            'SourceFieldName',
            'Source Field Name',
            NULL,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dea8b7df-aba6-41be-b4e9-8648809ae8c3'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'SourceFieldLabel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dea8b7df-aba6-41be-b4e9-8648809ae8c3',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100004,
            'SourceFieldLabel',
            'Source Field Label',
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
         WHERE ID = '8611254e-5ced-4ef4-9ee3-14b8a51489bb'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'DestinationFieldName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8611254e-5ced-4ef4-9ee3-14b8a51489bb',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100005,
            'DestinationFieldName',
            'Destination Field Name',
            NULL,
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '89c6ae8b-2233-4455-81a8-1f0980d29afd'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'DestinationFieldLabel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '89c6ae8b-2233-4455-81a8-1f0980d29afd',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100006,
            'DestinationFieldLabel',
            'Destination Field Label',
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
         WHERE ID = '0384d3e7-dc29-4997-b339-08cb485e5527'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'Direction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0384d3e7-dc29-4997-b339-08cb485e5527',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100007,
            'Direction',
            'Direction',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'SourceToDest',
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
         WHERE ID = '35960739-49e5-43b2-b19d-451746ceac54'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'TransformPipeline')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '35960739-49e5-43b2-b19d-451746ceac54',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100008,
            'TransformPipeline',
            'Transform Pipeline',
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
         WHERE ID = 'e4a11262-4179-4e3a-94a9-3e9c5ac3892e'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'IsKeyField')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4a11262-4179-4e3a-94a9-3e9c5ac3892e',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100009,
            'IsKeyField',
            'Is Key Field',
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
         WHERE ID = '2491e3d5-9584-4b8a-a902-f2c5ce43de6e'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'IsRequired')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2491e3d5-9584-4b8a-a902-f2c5ce43de6e',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100010,
            'IsRequired',
            'Is Required',
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
         WHERE ID = 'd8784114-4497-42b7-93d7-228c08cced88'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'DefaultValue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd8784114-4497-42b7-93d7-228c08cced88',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100011,
            'DefaultValue',
            'Default Value',
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
         WHERE ID = '9721acae-a986-4976-b092-bbc6baf3fc23'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9721acae-a986-4976-b092-bbc6baf3fc23',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100012,
            'Priority',
            'Priority',
            NULL,
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
         WHERE ID = 'b1987299-192a-4506-ab3a-0c5b7a41b2d9'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b1987299-192a-4506-ab3a-0c5b7a41b2d9',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
            100013,
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
         WHERE ID = '743909e4-4dad-4d03-8f42-c2f65363c698'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '743909e4-4dad-4d03-8f42-c2f65363c698',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
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
         WHERE ID = '31a93b64-d829-4c7c-b4a5-92997a768f6a'  OR 
               (EntityID = '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '31a93b64-d829-4c7c-b4a5-92997a768f6a',
            '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', -- Entity: MJ: Company Integration Field Maps
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
         WHERE ID = '17f29ba9-fed3-4579-adcf-ab748cc0856f'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '17f29ba9-fed3-4579-adcf-ab748cc0856f',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
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
         WHERE ID = 'cfc6179b-f14d-4b6e-8116-67e7bff4d6fc'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = 'EntityMapID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cfc6179b-f14d-4b6e-8116-67e7bff4d6fc',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
            100002,
            'EntityMapID',
            'Entity Map ID',
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
            '34F67C2F-0D31-43DB-9665-3EABB7833867',
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
         WHERE ID = '8d6646b1-2ba3-4dd7-9c7e-b651b69b560a'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = 'Direction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8d6646b1-2ba3-4dd7-9c7e-b651b69b560a',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
            100003,
            'Direction',
            'Direction',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pull',
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
         WHERE ID = '5f61c228-3ab2-4955-8753-047cdce44582'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = 'WatermarkType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5f61c228-3ab2-4955-8753-047cdce44582',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
            100004,
            'WatermarkType',
            'Watermark Type',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'Timestamp',
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
         WHERE ID = '397ed3d9-3242-4f57-a311-fc4997535cbd'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = 'WatermarkValue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '397ed3d9-3242-4f57-a311-fc4997535cbd',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
            100005,
            'WatermarkValue',
            'Watermark Value',
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
         WHERE ID = '89007350-b805-44f2-b26a-03c082606aef'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = 'LastSyncAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '89007350-b805-44f2-b26a-03c082606aef',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
            100006,
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
         WHERE ID = '17ea2466-e96d-4ca9-9665-11a8b006197d'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = 'RecordsSynced')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '17ea2466-e96d-4ca9-9665-11a8b006197d',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
            100007,
            'RecordsSynced',
            'Records Synced',
            NULL,
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
         WHERE ID = 'df149454-0eea-41b9-86e5-a0b0e4bf717d'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'df149454-0eea-41b9-86e5-a0b0e4bf717d',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
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
         WHERE ID = 'ecd13efc-c662-4335-8b55-b75571b27815'  OR 
               (EntityID = 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ecd13efc-c662-4335-8b55-b75571b27815',
            'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', -- Entity: MJ: Company Integration Sync Watermarks
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

/* SQL text to insert entity field value with ID 23fac6d9-3e45-4a12-8dc3-de3eaca30e10 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('23fac6d9-3e45-4a12-8dc3-de3eaca30e10', '70D746DA-5CD2-494C-85ED-353145791BC1', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 7fa33096-8f29-418e-a32b-2dcd74ced149 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7fa33096-8f29-418e-a32b-2dcd74ced149', '70D746DA-5CD2-494C-85ED-353145791BC1', 2, 'Inactive', 'Inactive')

/* SQL text to update ValueListType for entity field ID 70D746DA-5CD2-494C-85ED-353145791BC1 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='70D746DA-5CD2-494C-85ED-353145791BC1'

/* SQL text to insert entity field value with ID 523715a5-0605-4e24-918c-1dc1b5697db8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('523715a5-0605-4e24-918c-1dc1b5697db8', 'C9BB6B24-911B-4F2E-A56D-3D21CF323EB2', 1, 'Bidirectional', 'Bidirectional')

/* SQL text to insert entity field value with ID 747b8a30-f7ac-4b38-959c-5a4b2b2ea66c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('747b8a30-f7ac-4b38-959c-5a4b2b2ea66c', 'C9BB6B24-911B-4F2E-A56D-3D21CF323EB2', 2, 'Pull', 'Pull')

/* SQL text to insert entity field value with ID cadb6faf-ba35-4962-9ad1-f3641d24cafc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cadb6faf-ba35-4962-9ad1-f3641d24cafc', 'C9BB6B24-911B-4F2E-A56D-3D21CF323EB2', 3, 'Push', 'Push')

/* SQL text to update ValueListType for entity field ID C9BB6B24-911B-4F2E-A56D-3D21CF323EB2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C9BB6B24-911B-4F2E-A56D-3D21CF323EB2'

/* SQL text to insert entity field value with ID 7c892978-6571-4644-8a57-5442df19e60b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7c892978-6571-4644-8a57-5442df19e60b', 'D33BA545-1652-41E6-A392-1B6FE160CF5F', 1, 'DestWins', 'DestWins')

/* SQL text to insert entity field value with ID 5430775e-36f7-4fa9-8624-b3fd903bc4e9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5430775e-36f7-4fa9-8624-b3fd903bc4e9', 'D33BA545-1652-41E6-A392-1B6FE160CF5F', 2, 'Manual', 'Manual')

/* SQL text to insert entity field value with ID 9a1b0294-15a4-49f5-8f35-680c96e7aa52 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9a1b0294-15a4-49f5-8f35-680c96e7aa52', 'D33BA545-1652-41E6-A392-1B6FE160CF5F', 3, 'MostRecent', 'MostRecent')

/* SQL text to insert entity field value with ID b50bae0d-09e9-4b6f-bfa7-7334be91994a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b50bae0d-09e9-4b6f-bfa7-7334be91994a', 'D33BA545-1652-41E6-A392-1B6FE160CF5F', 4, 'SourceWins', 'SourceWins')

/* SQL text to update ValueListType for entity field ID D33BA545-1652-41E6-A392-1B6FE160CF5F */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D33BA545-1652-41E6-A392-1B6FE160CF5F'

/* SQL text to insert entity field value with ID 5e88d2e2-9422-4b31-a3d6-c4cae620c6df */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5e88d2e2-9422-4b31-a3d6-c4cae620c6df', '0BE082F6-D7E7-43EC-8438-0BF212577C75', 1, 'DoNothing', 'DoNothing')

/* SQL text to insert entity field value with ID 2dbc6535-0efb-440a-96e1-62fcd5166ce0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2dbc6535-0efb-440a-96e1-62fcd5166ce0', '0BE082F6-D7E7-43EC-8438-0BF212577C75', 2, 'HardDelete', 'HardDelete')

/* SQL text to insert entity field value with ID 31bc0711-ccef-402a-8c45-394e33d3e058 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('31bc0711-ccef-402a-8c45-394e33d3e058', '0BE082F6-D7E7-43EC-8438-0BF212577C75', 3, 'SoftDelete', 'SoftDelete')

/* SQL text to update ValueListType for entity field ID 0BE082F6-D7E7-43EC-8438-0BF212577C75 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0BE082F6-D7E7-43EC-8438-0BF212577C75'

/* SQL text to insert entity field value with ID 8673bf44-4910-4280-8fbc-2c43a3e110bc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8673bf44-4910-4280-8fbc-2c43a3e110bc', '9749D299-A85D-4928-BCDD-861D20E4AF1C', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 6277e5ec-4f8c-4a7f-9cae-6b9dab6c33e8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6277e5ec-4f8c-4a7f-9cae-6b9dab6c33e8', '9749D299-A85D-4928-BCDD-861D20E4AF1C', 2, 'Inactive', 'Inactive')

/* SQL text to update ValueListType for entity field ID 9749D299-A85D-4928-BCDD-861D20E4AF1C */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9749D299-A85D-4928-BCDD-861D20E4AF1C'

/* SQL text to insert entity field value with ID dee0f247-787a-4bd1-8c92-e72cf61d23f6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('dee0f247-787a-4bd1-8c92-e72cf61d23f6', '0384D3E7-DC29-4997-B339-08CB485E5527', 1, 'Both', 'Both')

/* SQL text to insert entity field value with ID d3c5082c-b1aa-446a-b2d7-921b2b431973 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d3c5082c-b1aa-446a-b2d7-921b2b431973', '0384D3E7-DC29-4997-B339-08CB485E5527', 2, 'DestToSource', 'DestToSource')

/* SQL text to insert entity field value with ID 1df8ebad-336c-4d04-9cae-28130448d812 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1df8ebad-336c-4d04-9cae-28130448d812', '0384D3E7-DC29-4997-B339-08CB485E5527', 3, 'SourceToDest', 'SourceToDest')

/* SQL text to update ValueListType for entity field ID 0384D3E7-DC29-4997-B339-08CB485E5527 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0384D3E7-DC29-4997-B339-08CB485E5527'

/* SQL text to insert entity field value with ID b6ee818a-ff73-4d71-a332-8aa7ec0465df */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b6ee818a-ff73-4d71-a332-8aa7ec0465df', 'B1987299-192A-4506-AB3A-0C5B7A41B2D9', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 86c87e68-1717-46ec-8242-df312f4470bb */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('86c87e68-1717-46ec-8242-df312f4470bb', 'B1987299-192A-4506-AB3A-0C5B7A41B2D9', 2, 'Inactive', 'Inactive')

/* SQL text to update ValueListType for entity field ID B1987299-192A-4506-AB3A-0C5B7A41B2D9 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B1987299-192A-4506-AB3A-0C5B7A41B2D9'

/* SQL text to insert entity field value with ID 68a5969b-ed8c-4eeb-ace5-a941488ba158 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('68a5969b-ed8c-4eeb-ace5-a941488ba158', '8D6646B1-2BA3-4DD7-9C7E-B651B69B560A', 1, 'Pull', 'Pull')

/* SQL text to insert entity field value with ID 7d420bcb-4780-4f3f-bf14-c38103ed8d75 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7d420bcb-4780-4f3f-bf14-c38103ed8d75', '8D6646B1-2BA3-4DD7-9C7E-B651B69B560A', 2, 'Push', 'Push')

/* SQL text to update ValueListType for entity field ID 8D6646B1-2BA3-4DD7-9C7E-B651B69B560A */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='8D6646B1-2BA3-4DD7-9C7E-B651B69B560A'

/* SQL text to insert entity field value with ID db946b1c-ec57-4605-a806-2030892094c9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('db946b1c-ec57-4605-a806-2030892094c9', '5F61C228-3AB2-4955-8753-047CDCE44582', 1, 'ChangeToken', 'ChangeToken')

/* SQL text to insert entity field value with ID 869ab31c-41a4-436c-b810-2df41186df1e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('869ab31c-41a4-436c-b810-2df41186df1e', '5F61C228-3AB2-4955-8753-047CDCE44582', 2, 'Cursor', 'Cursor')

/* SQL text to insert entity field value with ID 72e32073-7221-49e7-b6fc-9b776a8ec0d8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('72e32073-7221-49e7-b6fc-9b776a8ec0d8', '5F61C228-3AB2-4955-8753-047CDCE44582', 3, 'Timestamp', 'Timestamp')

/* SQL text to insert entity field value with ID e7a0f9e8-53b7-4c7c-8a1d-df4ff1ad7049 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e7a0f9e8-53b7-4c7c-8a1d-df4ff1ad7049', '5F61C228-3AB2-4955-8753-047CDCE44582', 4, 'Version', 'Version')

/* SQL text to update ValueListType for entity field ID 5F61C228-3AB2-4955-8753-047CDCE44582 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5F61C228-3AB2-4955-8753-047CDCE44582'


/* Create Entity Relationship: MJ: Company Integration Entity Maps -> MJ: Company Integration Sync Watermarks (One To Many via EntityMapID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '940be745-eeef-4320-8215-ae898856016f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('940be745-eeef-4320-8215-ae898856016f', '34F67C2F-0D31-43DB-9665-3EABB7833867', 'EBA65FD6-1A37-4AF8-8655-EB85A852C8EC', 'EntityMapID', 'One To Many', 1, 1, 'MJ: Company Integration Sync Watermarks', 1);
   END
                              
/* Create Entity Relationship: MJ: Company Integration Entity Maps -> MJ: Company Integration Field Maps (One To Many via EntityMapID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1c36af49-dfb4-4e7b-aab0-dae5d9f97b8e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1c36af49-dfb4-4e7b-aab0-dae5d9f97b8e', '34F67C2F-0D31-43DB-9665-3EABB7833867', '3CAC10F4-CD1A-4CEC-9C81-C8EDA5A8BCF1', 'EntityMapID', 'One To Many', 1, 1, 'MJ: Company Integration Field Maps', 1);
   END
                              


/* Create Entity Relationship: MJ: Company Integrations -> MJ: Company Integration Entity Maps (One To Many via CompanyIntegrationID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ce127cc6-fc3e-463c-b8f5-d5ed6764352c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ce127cc6-fc3e-463c-b8f5-d5ed6764352c', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', '34F67C2F-0D31-43DB-9665-3EABB7833867', 'CompanyIntegrationID', 'One To Many', 1, 1, 'MJ: Company Integration Entity Maps', 1);
   END
                              


/* Create Entity Relationship: MJ: Entities -> MJ: Company Integration Entity Maps (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b984602b-16c7-493e-a549-11a623aed3c8'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b984602b-16c7-493e-a549-11a623aed3c8', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '34F67C2F-0D31-43DB-9665-3EABB7833867', 'EntityID', 'One To Many', 1, 1, 'MJ: Company Integration Entity Maps', 2);
   END
                              

/* Base View SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: vwCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Categories
-----               SCHEMA:      sample_hd
-----               BASE TABLE:  Category
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[sample_hd].[vwCategories]', 'V') IS NOT NULL
    DROP VIEW [sample_hd].[vwCategories];
GO

CREATE VIEW [sample_hd].[vwCategories]
AS
SELECT
    c.*,
    Category_ParentCategoryID.[Name] AS [ParentCategory],
    Department_DepartmentID.[Name] AS [Department],
    root_ParentCategoryID.RootID AS [RootParentCategoryID]
FROM
    [sample_hd].[Category] AS c
LEFT OUTER JOIN
    [sample_hd].[Category] AS Category_ParentCategoryID
  ON
    [c].[ParentCategoryID] = Category_ParentCategoryID.[ID]
LEFT OUTER JOIN
    [sample_hd].[Department] AS Department_DepartmentID
  ON
    [c].[DepartmentID] = Department_DepartmentID.[ID]
OUTER APPLY
    [sample_hd].[fnCategoryParentCategoryID_GetRootID]([c].[ID], [c].[ParentCategoryID]) AS root_ParentCategoryID
GO
GRANT SELECT ON [sample_hd].[vwCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: Permissions for vwCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [sample_hd].[vwCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spCreateCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Category
------------------------------------------------------------
IF OBJECT_ID('[sample_hd].[spCreateCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [sample_hd].[spCreateCategory];
GO

CREATE PROCEDURE [sample_hd].[spCreateCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(150),
    @ParentCategoryID uniqueidentifier,
    @DepartmentID uniqueidentifier,
    @Description nvarchar(500),
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [sample_hd].[Category]
            (
                [ID],
                [Name],
                [ParentCategoryID],
                [DepartmentID],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentCategoryID,
                @DepartmentID,
                @Description,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [sample_hd].[Category]
            (
                [Name],
                [ParentCategoryID],
                [DepartmentID],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentCategoryID,
                @DepartmentID,
                @Description,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [sample_hd].[vwCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [sample_hd].[spCreateCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Categories */

GRANT EXECUTE ON [sample_hd].[spCreateCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spUpdateCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Category
------------------------------------------------------------
IF OBJECT_ID('[sample_hd].[spUpdateCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [sample_hd].[spUpdateCategory];
GO

CREATE PROCEDURE [sample_hd].[spUpdateCategory]
    @ID uniqueidentifier,
    @Name nvarchar(150),
    @ParentCategoryID uniqueidentifier,
    @DepartmentID uniqueidentifier,
    @Description nvarchar(500),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [sample_hd].[Category]
    SET
        [Name] = @Name,
        [ParentCategoryID] = @ParentCategoryID,
        [DepartmentID] = @DepartmentID,
        [Description] = @Description,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [sample_hd].[vwCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [sample_hd].[vwCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [sample_hd].[spUpdateCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Category table
------------------------------------------------------------
IF OBJECT_ID('[sample_hd].[trgUpdateCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [sample_hd].[trgUpdateCategory];
GO
CREATE TRIGGER [sample_hd].trgUpdateCategory
ON [sample_hd].[Category]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [sample_hd].[Category]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [sample_hd].[Category] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Categories */

GRANT EXECUTE ON [sample_hd].[spUpdateCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spDeleteCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Category
------------------------------------------------------------
IF OBJECT_ID('[sample_hd].[spDeleteCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [sample_hd].[spDeleteCategory];
GO

CREATE PROCEDURE [sample_hd].[spDeleteCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [sample_hd].[Category]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [sample_hd].[spDeleteCategory] TO [cdp_Integration]
    

/* spDelete Permissions for Categories */

GRANT EXECUTE ON [sample_hd].[spDeleteCategory] TO [cdp_Integration]



/* Base View SQL for MJ: Action Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Categories
-- Item: vwActionCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActionCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActionCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionCategories]
AS
SELECT
    a.*,
    MJActionCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ActionCategory] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ActionCategory] AS MJActionCategory_ParentID
  ON
    [a].[ParentID] = MJActionCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnActionCategoryParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionCategories] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for MJ: Action Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Categories
-- Item: Permissions for vwActionCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActionCategories] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: Action Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Categories
-- Item: spCreateActionCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateActionCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateActionCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ActionCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                ISNULL(@Status, 'Pending')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ActionCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                ISNULL(@Status, 'Pending')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionCategory] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Action Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionCategory] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Action Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Categories
-- Item: spUpdateActionCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateActionCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateActionCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActionCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionCategory] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateActionCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateActionCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionCategory
ON [${flyway:defaultSchema}].[ActionCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Action Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionCategory] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Action Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Categories
-- Item: spDeleteActionCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteActionCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteActionCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionCategory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Action Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionCategory] TO [cdp_Integration]



/* Base View SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Action
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActions]
AS
SELECT
    a.*,
    MJActionCategory_CategoryID.[Name] AS [Category],
    MJUser_CodeApprovedByUserID.[Name] AS [CodeApprovedByUser],
    MJAction_ParentID.[Name] AS [Parent],
    MJAIPrompt_DefaultCompactPromptID.[Name] AS [DefaultCompactPrompt],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Action] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ActionCategory] AS MJActionCategory_CategoryID
  ON
    [a].[CategoryID] = MJActionCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CodeApprovedByUserID
  ON
    [a].[CodeApprovedByUserID] = MJUser_CodeApprovedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ParentID
  ON
    [a].[ParentID] = MJAction_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_DefaultCompactPromptID
  ON
    [a].[DefaultCompactPromptID] = MJAIPrompt_DefaultCompactPromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnActionParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: Permissions for vwActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spCreateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAction]
    @ID uniqueidentifier = NULL,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20) = NULL,
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20) = NULL,
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetimeoffset,
    @CodeLocked bit = NULL,
    @ForceCodeGeneration bit = NULL,
    @RetentionPeriod int,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [ID],
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Action]
            (
                [CategoryID],
                [Name],
                [Description],
                [Type],
                [UserPrompt],
                [UserComments],
                [Code],
                [CodeComments],
                [CodeApprovalStatus],
                [CodeApprovalComments],
                [CodeApprovedByUserID],
                [CodeApprovedAt],
                [CodeLocked],
                [ForceCodeGeneration],
                [RetentionPeriod],
                [Status],
                [DriverClass],
                [ParentID],
                [IconClass],
                [DefaultCompactPromptID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CategoryID,
                @Name,
                @Description,
                ISNULL(@Type, 'Generated'),
                @UserPrompt,
                @UserComments,
                @Code,
                @CodeComments,
                ISNULL(@CodeApprovalStatus, 'Pending'),
                @CodeApprovalComments,
                @CodeApprovedByUserID,
                @CodeApprovedAt,
                ISNULL(@CodeLocked, 0),
                ISNULL(@ForceCodeGeneration, 0),
                @RetentionPeriod,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @ParentID,
                @IconClass,
                @DefaultCompactPromptID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAction] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spUpdateAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAction]
    @ID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @Name nvarchar(425),
    @Description nvarchar(MAX),
    @Type nvarchar(20),
    @UserPrompt nvarchar(MAX),
    @UserComments nvarchar(MAX),
    @Code nvarchar(MAX),
    @CodeComments nvarchar(MAX),
    @CodeApprovalStatus nvarchar(20),
    @CodeApprovalComments nvarchar(MAX),
    @CodeApprovedByUserID uniqueidentifier,
    @CodeApprovedAt datetimeoffset,
    @CodeLocked bit,
    @ForceCodeGeneration bit,
    @RetentionPeriod int,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100),
    @DefaultCompactPromptID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        [CategoryID] = @CategoryID,
        [Name] = @Name,
        [Description] = @Description,
        [Type] = @Type,
        [UserPrompt] = @UserPrompt,
        [UserComments] = @UserComments,
        [Code] = @Code,
        [CodeComments] = @CodeComments,
        [CodeApprovalStatus] = @CodeApprovalStatus,
        [CodeApprovalComments] = @CodeApprovalComments,
        [CodeApprovedByUserID] = @CodeApprovedByUserID,
        [CodeApprovedAt] = @CodeApprovedAt,
        [CodeLocked] = @CodeLocked,
        [ForceCodeGeneration] = @ForceCodeGeneration,
        [RetentionPeriod] = @RetentionPeriod,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [ParentID] = @ParentID,
        [IconClass] = @IconClass,
        [DefaultCompactPromptID] = @DefaultCompactPromptID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Action table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAction
ON [${flyway:defaultSchema}].[Action]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Action]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Action] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAction] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ActionAuthorization using cursor to call spDeleteActionAuthorization
    DECLARE @MJActionAuthorizations_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionAuthorizations_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionAuthorization]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionAuthorizations_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteActionAuthorization] @ID = @MJActionAuthorizations_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionAuthorizations_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionAuthorizations_ActionID_cursor
    
    -- Cascade delete from ActionContext using cursor to call spDeleteActionContext
    DECLARE @MJActionContexts_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionContexts_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionContext]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionContexts_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteActionContext] @ID = @MJActionContexts_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionContexts_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionContexts_ActionID_cursor
    
    -- Cascade delete from ActionExecutionLog using cursor to call spDeleteActionExecutionLog
    DECLARE @MJActionExecutionLogs_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionExecutionLogs_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionExecutionLog]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionExecutionLogs_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteActionExecutionLog] @ID = @MJActionExecutionLogs_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    
    -- Cascade delete from ActionLibrary using cursor to call spDeleteActionLibrary
    DECLARE @MJActionLibraries_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionLibraries_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionLibrary]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionLibraries_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteActionLibrary] @ID = @MJActionLibraries_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionLibraries_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionLibraries_ActionID_cursor
    
    -- Cascade delete from ActionParam using cursor to call spDeleteActionParam
    DECLARE @MJActionParams_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionParams_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionParam]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionParams_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteActionParam] @ID = @MJActionParams_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionParams_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionParams_ActionID_cursor
    
    -- Cascade delete from ActionResultCode using cursor to call spDeleteActionResultCode
    DECLARE @MJActionResultCodes_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionResultCodes_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionResultCode]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionResultCodes_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteActionResultCode] @ID = @MJActionResultCodes_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionResultCodes_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionResultCodes_ActionID_cursor
    
    -- Cascade delete from Action using cursor to call spDeleteAction
    DECLARE @MJActions_ParentIDID uniqueidentifier
    DECLARE cascade_delete_MJActions_ParentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [ParentID] = @ID
    
    OPEN cascade_delete_MJActions_ParentID_cursor
    FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAction] @ID = @MJActions_ParentIDID
        
        FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    END
    
    CLOSE cascade_delete_MJActions_ParentID_cursor
    DEALLOCATE cascade_delete_MJActions_ParentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_ActionID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactLength int
    DECLARE @MJAIAgentActions_ActionID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentActions_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_ActionIDID, @AgentID = @MJAIAgentActions_ActionID_AgentID, @ActionID = @MJAIAgentActions_ActionID_ActionID, @Status = @MJAIAgentActions_ActionID_Status, @MinExecutionsPerRun = @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_ActionID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_ActionID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_ActionID_CompactMode, @CompactLength = @MJAIAgentActions_ActionID_CompactLength, @CompactPromptID = @MJAIAgentActions_ActionID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_ActionID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_ActionID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_StartingStep bit
    DECLARE @MJAIAgentSteps_ActionID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_ActionID_RetryCount int
    DECLARE @MJAIAgentSteps_ActionID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_PositionX int
    DECLARE @MJAIAgentSteps_ActionID_PositionY int
    DECLARE @MJAIAgentSteps_ActionID_Width int
    DECLARE @MJAIAgentSteps_ActionID_Height int
    DECLARE @MJAIAgentSteps_ActionID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentSteps_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_ActionIDID, @AgentID = @MJAIAgentSteps_ActionID_AgentID, @Name = @MJAIAgentSteps_ActionID_Name, @Description = @MJAIAgentSteps_ActionID_Description, @StepType = @MJAIAgentSteps_ActionID_StepType, @StartingStep = @MJAIAgentSteps_ActionID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_ActionID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_ActionID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_ActionID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_ActionID_ActionID, @SubAgentID = @MJAIAgentSteps_ActionID_SubAgentID, @PromptID = @MJAIAgentSteps_ActionID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_ActionID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_ActionID_PositionX, @PositionY = @MJAIAgentSteps_ActionID_PositionY, @Width = @MJAIAgentSteps_ActionID_Width, @Height = @MJAIAgentSteps_ActionID_Height, @Status = @MJAIAgentSteps_ActionID_Status, @ActionInputMapping = @MJAIAgentSteps_ActionID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_ActionID_LoopBodyType, @Configuration = @MJAIAgentSteps_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_ActionID_cursor
    
    -- Cascade delete from EntityAction using cursor to call spDeleteEntityAction
    DECLARE @MJEntityActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJEntityActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteEntityAction] @ID = @MJEntityActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJEntityActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJEntityActions_ActionID_cursor
    
    -- Cascade update on MCPServerTool using cursor to call spUpdateMCPServerTool
    DECLARE @MJMCPServerTools_GeneratedActionIDID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_MCPServerID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolName nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolTitle nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolDescription nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_InputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_OutputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Annotations nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Status nvarchar(50)
    DECLARE @MJMCPServerTools_GeneratedActionID_DiscoveredAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_LastSeenAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID uniqueidentifier
    DECLARE cascade_update_MJMCPServerTools_GeneratedActionID_cursor CURSOR FOR
        SELECT [ID], [MCPServerID], [ToolName], [ToolTitle], [ToolDescription], [InputSchema], [OutputSchema], [Annotations], [Status], [DiscoveredAt], [LastSeenAt], [GeneratedActionID], [GeneratedActionCategoryID]
        FROM [${flyway:defaultSchema}].[MCPServerTool]
        WHERE [GeneratedActionID] = @ID

    OPEN cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMCPServerTools_GeneratedActionID_GeneratedActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMCPServerTool] @ID = @MJMCPServerTools_GeneratedActionIDID, @MCPServerID = @MJMCPServerTools_GeneratedActionID_MCPServerID, @ToolName = @MJMCPServerTools_GeneratedActionID_ToolName, @ToolTitle = @MJMCPServerTools_GeneratedActionID_ToolTitle, @ToolDescription = @MJMCPServerTools_GeneratedActionID_ToolDescription, @InputSchema = @MJMCPServerTools_GeneratedActionID_InputSchema, @OutputSchema = @MJMCPServerTools_GeneratedActionID_OutputSchema, @Annotations = @MJMCPServerTools_GeneratedActionID_Annotations, @Status = @MJMCPServerTools_GeneratedActionID_Status, @DiscoveredAt = @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @LastSeenAt = @MJMCPServerTools_GeneratedActionID_LastSeenAt, @GeneratedActionID = @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @GeneratedActionCategoryID = @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

        FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID
    END

    CLOSE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    DEALLOCATE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    
    -- Cascade delete from ScheduledAction using cursor to call spDeleteScheduledAction
    DECLARE @MJScheduledActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJScheduledActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScheduledAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJScheduledActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJScheduledActions_ActionID_cursor INTO @MJScheduledActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteScheduledAction] @ID = @MJScheduledActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJScheduledActions_ActionID_cursor INTO @MJScheduledActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJScheduledActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJScheduledActions_ActionID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Action]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration]



/* Base View SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIAgentRun_ParentRunID.[RunName] AS [ParentRun],
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    MJAIAgentRun_LastRunID.[RunName] AS [LastRun],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIModel_OverrideModelID.[Name] AS [OverrideModel],
    MJAIVendor_OverrideVendorID.[Name] AS [OverrideVendor],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity],
    root_ParentRunID.RootID AS [RootParentRunID],
    root_LastRunID.RootID AS [RootLastRunID]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_ParentRunID
  ON
    [a].[ParentRunID] = MJAIAgentRun_ParentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [a].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [a].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_LastRunID
  ON
    [a].[LastRunID] = MJAIAgentRun_LastRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_OverrideModelID
  ON
    [a].[OverrideModelID] = MJAIModel_OverrideModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_OverrideVendorID
  ON
    [a].[OverrideVendorID] = MJAIVendor_OverrideVendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [a].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]([a].[ID], [a].[ParentRunID]) AS root_ParentRunID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]([a].[ID], [a].[LastRunID]) AS root_LastRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int = NULL,
    @ConfigurationID uniqueidentifier,
    @OverrideModelID uniqueidentifier,
    @OverrideVendorID uniqueidentifier,
    @Data nvarchar(MAX),
    @Verbose bit,
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [ID],
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ParentRunID,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                ISNULL(@TotalPromptIterations, 0),
                @ConfigurationID,
                @OverrideModelID,
                @OverrideVendorID,
                @Data,
                @Verbose,
                @EffortLevel,
                @RunName,
                @Comments,
                @ScheduledJobRunID,
                @TestRunID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ParentRunID,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                ISNULL(@TotalPromptIterations, 0),
                @ConfigurationID,
                @OverrideModelID,
                @OverrideVendorID,
                @Data,
                @Verbose,
                @EffortLevel,
                @RunName,
                @Comments,
                @ScheduledJobRunID,
                @TestRunID,
                @PrimaryScopeEntityID,
                @PrimaryScopeRecordID,
                @SecondaryScopes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int,
    @ConfigurationID uniqueidentifier,
    @OverrideModelID uniqueidentifier,
    @OverrideVendorID uniqueidentifier,
    @Data nvarchar(MAX),
    @Verbose bit,
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier,
    @TestRunID uniqueidentifier,
    @PrimaryScopeEntityID uniqueidentifier,
    @PrimaryScopeRecordID nvarchar(100),
    @SecondaryScopes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = @AgentID,
        [ParentRunID] = @ParentRunID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ConversationID] = @ConversationID,
        [UserID] = @UserID,
        [Result] = @Result,
        [AgentState] = @AgentState,
        [TotalTokensUsed] = @TotalTokensUsed,
        [TotalCost] = @TotalCost,
        [TotalPromptTokensUsed] = @TotalPromptTokensUsed,
        [TotalCompletionTokensUsed] = @TotalCompletionTokensUsed,
        [TotalTokensUsedRollup] = @TotalTokensUsedRollup,
        [TotalPromptTokensUsedRollup] = @TotalPromptTokensUsedRollup,
        [TotalCompletionTokensUsedRollup] = @TotalCompletionTokensUsedRollup,
        [TotalCostRollup] = @TotalCostRollup,
        [ConversationDetailID] = @ConversationDetailID,
        [ConversationDetailSequence] = @ConversationDetailSequence,
        [CancellationReason] = @CancellationReason,
        [FinalStep] = @FinalStep,
        [FinalPayload] = @FinalPayload,
        [Message] = @Message,
        [LastRunID] = @LastRunID,
        [StartingPayload] = @StartingPayload,
        [TotalPromptIterations] = @TotalPromptIterations,
        [ConfigurationID] = @ConfigurationID,
        [OverrideModelID] = @OverrideModelID,
        [OverrideVendorID] = @OverrideVendorID,
        [Data] = @Data,
        [Verbose] = @Verbose,
        [EffortLevel] = @EffortLevel,
        [RunName] = @RunName,
        [Comments] = @Comments,
        [ScheduledJobRunID] = @ScheduledJobRunID,
        [TestRunID] = @TestRunID,
        [PrimaryScopeEntityID] = @PrimaryScopeEntityID,
        [PrimaryScopeRecordID] = @PrimaryScopeRecordID,
        [SecondaryScopes] = @SecondaryScopes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRun
ON [${flyway:defaultSchema}].[AIAgentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Steps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRunStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRunSteps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRunSteps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRunSteps]
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    MJAIAgentRunStep_ParentID.[StepName] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIAgentRunStep] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRunStep] AS MJAIAgentRunStep_ParentID
  ON
    [a].[ParentID] = MJAIAgentRunStep_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: Permissions for vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spCreateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunStep]
    @ID uniqueidentifier = NULL,
    @AgentRunID uniqueidentifier,
    @StepNumber int,
    @StepType nvarchar(50) = NULL,
    @StepName nvarchar(255),
    @TargetID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @InputData nvarchar(MAX),
    @OutputData nvarchar(MAX),
    @TargetLogID uniqueidentifier,
    @PayloadAtStart nvarchar(MAX),
    @PayloadAtEnd nvarchar(MAX),
    @FinalPayloadValidationResult nvarchar(25),
    @FinalPayloadValidationMessages nvarchar(MAX),
    @ParentID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunStep]
            (
                [ID],
                [AgentRunID],
                [StepNumber],
                [StepType],
                [StepName],
                [TargetID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [InputData],
                [OutputData],
                [TargetLogID],
                [PayloadAtStart],
                [PayloadAtEnd],
                [FinalPayloadValidationResult],
                [FinalPayloadValidationMessages],
                [ParentID],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentRunID,
                @StepNumber,
                ISNULL(@StepType, 'Prompt'),
                @StepName,
                @TargetID,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @InputData,
                @OutputData,
                @TargetLogID,
                @PayloadAtStart,
                @PayloadAtEnd,
                @FinalPayloadValidationResult,
                @FinalPayloadValidationMessages,
                @ParentID,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunStep]
            (
                [AgentRunID],
                [StepNumber],
                [StepType],
                [StepName],
                [TargetID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [InputData],
                [OutputData],
                [TargetLogID],
                [PayloadAtStart],
                [PayloadAtEnd],
                [FinalPayloadValidationResult],
                [FinalPayloadValidationMessages],
                [ParentID],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentRunID,
                @StepNumber,
                ISNULL(@StepType, 'Prompt'),
                @StepName,
                @TargetID,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @InputData,
                @OutputData,
                @TargetLogID,
                @PayloadAtStart,
                @PayloadAtEnd,
                @FinalPayloadValidationResult,
                @FinalPayloadValidationMessages,
                @ParentID,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRunSteps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spUpdateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunStep]
    @ID uniqueidentifier,
    @AgentRunID uniqueidentifier,
    @StepNumber int,
    @StepType nvarchar(50),
    @StepName nvarchar(255),
    @TargetID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @InputData nvarchar(MAX),
    @OutputData nvarchar(MAX),
    @TargetLogID uniqueidentifier,
    @PayloadAtStart nvarchar(MAX),
    @PayloadAtEnd nvarchar(MAX),
    @FinalPayloadValidationResult nvarchar(25),
    @FinalPayloadValidationMessages nvarchar(MAX),
    @ParentID uniqueidentifier,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunStep]
    SET
        [AgentRunID] = @AgentRunID,
        [StepNumber] = @StepNumber,
        [StepType] = @StepType,
        [StepName] = @StepName,
        [TargetID] = @TargetID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [InputData] = @InputData,
        [OutputData] = @OutputData,
        [TargetLogID] = @TargetLogID,
        [PayloadAtStart] = @PayloadAtStart,
        [PayloadAtEnd] = @PayloadAtEnd,
        [FinalPayloadValidationResult] = @FinalPayloadValidationResult,
        [FinalPayloadValidationMessages] = @FinalPayloadValidationMessages,
        [ParentID] = @ParentID,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRunSteps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRunSteps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRunStep]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRunStep];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRunStep
ON [${flyway:defaultSchema}].[AIAgentRunStep]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunStep]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRunStep] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunStep]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentRunStep using cursor to call spUpdateAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_ParentIDID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_StepNumber int
    DECLARE @MJAIAgentRunSteps_ParentID_StepType nvarchar(50)
    DECLARE @MJAIAgentRunSteps_ParentID_StepName nvarchar(255)
    DECLARE @MJAIAgentRunSteps_ParentID_TargetID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_Status nvarchar(50)
    DECLARE @MJAIAgentRunSteps_ParentID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_ParentID_Success bit
    DECLARE @MJAIAgentRunSteps_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_InputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_OutputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_TargetLogID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_PayloadAtStart nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_PayloadAtEnd nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult nvarchar(25)
    DECLARE @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_Comments nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentRunSteps_ParentID_cursor CURSOR FOR
        SELECT [ID], [AgentRunID], [StepNumber], [StepType], [StepName], [TargetID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [InputData], [OutputData], [TargetLogID], [PayloadAtStart], [PayloadAtEnd], [FinalPayloadValidationResult], [FinalPayloadValidationMessages], [ParentID], [Comments]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgentRunSteps_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_ParentID_cursor INTO @MJAIAgentRunSteps_ParentIDID, @MJAIAgentRunSteps_ParentID_AgentRunID, @MJAIAgentRunSteps_ParentID_StepNumber, @MJAIAgentRunSteps_ParentID_StepType, @MJAIAgentRunSteps_ParentID_StepName, @MJAIAgentRunSteps_ParentID_TargetID, @MJAIAgentRunSteps_ParentID_Status, @MJAIAgentRunSteps_ParentID_StartedAt, @MJAIAgentRunSteps_ParentID_CompletedAt, @MJAIAgentRunSteps_ParentID_Success, @MJAIAgentRunSteps_ParentID_ErrorMessage, @MJAIAgentRunSteps_ParentID_InputData, @MJAIAgentRunSteps_ParentID_OutputData, @MJAIAgentRunSteps_ParentID_TargetLogID, @MJAIAgentRunSteps_ParentID_PayloadAtStart, @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_ParentID_ParentID, @MJAIAgentRunSteps_ParentID_Comments

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRunSteps_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] @ID = @MJAIAgentRunSteps_ParentIDID, @AgentRunID = @MJAIAgentRunSteps_ParentID_AgentRunID, @StepNumber = @MJAIAgentRunSteps_ParentID_StepNumber, @StepType = @MJAIAgentRunSteps_ParentID_StepType, @StepName = @MJAIAgentRunSteps_ParentID_StepName, @TargetID = @MJAIAgentRunSteps_ParentID_TargetID, @Status = @MJAIAgentRunSteps_ParentID_Status, @StartedAt = @MJAIAgentRunSteps_ParentID_StartedAt, @CompletedAt = @MJAIAgentRunSteps_ParentID_CompletedAt, @Success = @MJAIAgentRunSteps_ParentID_Success, @ErrorMessage = @MJAIAgentRunSteps_ParentID_ErrorMessage, @InputData = @MJAIAgentRunSteps_ParentID_InputData, @OutputData = @MJAIAgentRunSteps_ParentID_OutputData, @TargetLogID = @MJAIAgentRunSteps_ParentID_TargetLogID, @PayloadAtStart = @MJAIAgentRunSteps_ParentID_PayloadAtStart, @PayloadAtEnd = @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @FinalPayloadValidationResult = @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @FinalPayloadValidationMessages = @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @ParentID = @MJAIAgentRunSteps_ParentID_ParentID, @Comments = @MJAIAgentRunSteps_ParentID_Comments

        FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_ParentID_cursor INTO @MJAIAgentRunSteps_ParentIDID, @MJAIAgentRunSteps_ParentID_AgentRunID, @MJAIAgentRunSteps_ParentID_StepNumber, @MJAIAgentRunSteps_ParentID_StepType, @MJAIAgentRunSteps_ParentID_StepName, @MJAIAgentRunSteps_ParentID_TargetID, @MJAIAgentRunSteps_ParentID_Status, @MJAIAgentRunSteps_ParentID_StartedAt, @MJAIAgentRunSteps_ParentID_CompletedAt, @MJAIAgentRunSteps_ParentID_Success, @MJAIAgentRunSteps_ParentID_ErrorMessage, @MJAIAgentRunSteps_ParentID_InputData, @MJAIAgentRunSteps_ParentID_OutputData, @MJAIAgentRunSteps_ParentID_TargetLogID, @MJAIAgentRunSteps_ParentID_PayloadAtStart, @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_ParentID_ParentID, @MJAIAgentRunSteps_ParentID_Comments
    END

    CLOSE cascade_update_MJAIAgentRunSteps_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgentRunSteps_ParentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRunStep]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_Success bit
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopK int
    DECLARE @MJAIPromptRuns_AgentRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_Seed int
    DECLARE @MJAIPromptRuns_AgentRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentRunID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TestRunID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentRunIDID, @PromptID = @MJAIPromptRuns_AgentRunID_PromptID, @ModelID = @MJAIPromptRuns_AgentRunID_ModelID, @VendorID = @MJAIPromptRuns_AgentRunID_VendorID, @AgentID = @MJAIPromptRuns_AgentRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentRunID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentRunID_Messages, @Result = @MJAIPromptRuns_AgentRunID_Result, @TokensUsed = @MJAIPromptRuns_AgentRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentRunID_TotalCost, @Success = @MJAIPromptRuns_AgentRunID_Success, @ErrorMessage = @MJAIPromptRuns_AgentRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentRunID_ParentID, @RunType = @MJAIPromptRuns_AgentRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentRunID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_AgentRunID_AgentRunID, @Cost = @MJAIPromptRuns_AgentRunID_Cost, @CostCurrency = @MJAIPromptRuns_AgentRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentRunID_Temperature, @TopP = @MJAIPromptRuns_AgentRunID_TopP, @TopK = @MJAIPromptRuns_AgentRunID_TopK, @MinP = @MJAIPromptRuns_AgentRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentRunID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentRunID_Seed, @StopSequences = @MJAIPromptRuns_AgentRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentRunID_ModelSelection, @Status = @MJAIPromptRuns_AgentRunID_Status, @Cancelled = @MJAIPromptRuns_AgentRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentRunID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentRunID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentRunID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentRunID_EffortLevel, @RunName = @MJAIPromptRuns_AgentRunID_RunName, @Comments = @MJAIPromptRuns_AgentRunID_Comments, @TestRunID = @MJAIPromptRuns_AgentRunID_TestRunID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]



/* Base View SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    MJAIAgent_ParentID.[Name] AS [Parent],
    MJAIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    MJAIAgentType_TypeID.[Name] AS [Type],
    MJArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType],
    MJUser_OwnerUserID.[Name] AS [OwnerUser],
    MJFileStorageProvider_AttachmentStorageProviderID.[Name] AS [AttachmentStorageProvider],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_ParentID
  ON
    [a].[ParentID] = MJAIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = MJAIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS MJAIAgentType_TypeID
  ON
    [a].[TypeID] = MJAIAgentType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS MJArtifactType_DefaultArtifactTypeID
  ON
    [a].[DefaultArtifactTypeID] = MJArtifactType_DefaultArtifactTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerUserID
  ON
    [a].[OwnerUserID] = MJUser_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    [a].[AttachmentStorageProviderID] = MJFileStorageProvider_AttachmentStorageProviderID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages int,
    @AttachmentStorageProviderID uniqueidentifier,
    @AttachmentRootPath nvarchar(500),
    @InlineStorageThresholdBytes int,
    @AgentTypePromptParams nvarchar(MAX),
    @ScopeConfig nvarchar(MAX),
    @NoteRetentionDays int,
    @ExampleRetentionDays int,
    @AutoArchiveEnabled bit = NULL,
    @RerankerConfiguration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [ID],
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
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages,
                @AttachmentStorageProviderID,
                @AttachmentRootPath,
                @InlineStorageThresholdBytes,
                @AgentTypePromptParams,
                @ScopeConfig,
                @NoteRetentionDays,
                @ExampleRetentionDays,
                ISNULL(@AutoArchiveEnabled, 1),
                @RerankerConfiguration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
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
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages,
                @AttachmentStorageProviderID,
                @AttachmentRootPath,
                @InlineStorageThresholdBytes,
                @AgentTypePromptParams,
                @ScopeConfig,
                @NoteRetentionDays,
                @ExampleRetentionDays,
                ISNULL(@AutoArchiveEnabled, 1),
                @RerankerConfiguration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent];
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
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50),
    @PayloadDownstreamPaths nvarchar(MAX),
    @PayloadUpstreamPaths nvarchar(MAX),
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25),
    @FinalPayloadValidationMaxRetries int,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25),
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier,
    @InvocationMode nvarchar(20),
    @ArtifactCreationMode nvarchar(20),
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit,
    @MaxNotesToInject int,
    @NoteInjectionStrategy nvarchar(20),
    @InjectExamples bit,
    @MaxExamplesToInject int,
    @ExampleInjectionStrategy nvarchar(20),
    @IsRestricted bit,
    @MessageMode nvarchar(50),
    @MaxMessages int,
    @AttachmentStorageProviderID uniqueidentifier,
    @AttachmentRootPath nvarchar(500),
    @InlineStorageThresholdBytes int,
    @AgentTypePromptParams nvarchar(MAX),
    @ScopeConfig nvarchar(MAX),
    @NoteRetentionDays int,
    @ExampleRetentionDays int,
    @AutoArchiveEnabled bit,
    @RerankerConfiguration nvarchar(MAX)
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
        [ContextCompressionMessageRetentionCount] = @ContextCompressionMessageRetentionCount,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [IconClass] = @IconClass,
        [ModelSelectionMode] = @ModelSelectionMode,
        [PayloadDownstreamPaths] = @PayloadDownstreamPaths,
        [PayloadUpstreamPaths] = @PayloadUpstreamPaths,
        [PayloadSelfReadPaths] = @PayloadSelfReadPaths,
        [PayloadSelfWritePaths] = @PayloadSelfWritePaths,
        [PayloadScope] = @PayloadScope,
        [FinalPayloadValidation] = @FinalPayloadValidation,
        [FinalPayloadValidationMode] = @FinalPayloadValidationMode,
        [FinalPayloadValidationMaxRetries] = @FinalPayloadValidationMaxRetries,
        [MaxCostPerRun] = @MaxCostPerRun,
        [MaxTokensPerRun] = @MaxTokensPerRun,
        [MaxIterationsPerRun] = @MaxIterationsPerRun,
        [MaxTimePerRun] = @MaxTimePerRun,
        [MinExecutionsPerRun] = @MinExecutionsPerRun,
        [MaxExecutionsPerRun] = @MaxExecutionsPerRun,
        [StartingPayloadValidation] = @StartingPayloadValidation,
        [StartingPayloadValidationMode] = @StartingPayloadValidationMode,
        [DefaultPromptEffortLevel] = @DefaultPromptEffortLevel,
        [ChatHandlingOption] = @ChatHandlingOption,
        [DefaultArtifactTypeID] = @DefaultArtifactTypeID,
        [OwnerUserID] = @OwnerUserID,
        [InvocationMode] = @InvocationMode,
        [ArtifactCreationMode] = @ArtifactCreationMode,
        [FunctionalRequirements] = @FunctionalRequirements,
        [TechnicalDesign] = @TechnicalDesign,
        [InjectNotes] = @InjectNotes,
        [MaxNotesToInject] = @MaxNotesToInject,
        [NoteInjectionStrategy] = @NoteInjectionStrategy,
        [InjectExamples] = @InjectExamples,
        [MaxExamplesToInject] = @MaxExamplesToInject,
        [ExampleInjectionStrategy] = @ExampleInjectionStrategy,
        [IsRestricted] = @IsRestricted,
        [MessageMode] = @MessageMode,
        [MaxMessages] = @MaxMessages,
        [AttachmentStorageProviderID] = @AttachmentStorageProviderID,
        [AttachmentRootPath] = @AttachmentRootPath,
        [InlineStorageThresholdBytes] = @InlineStorageThresholdBytes,
        [AgentTypePromptParams] = @AgentTypePromptParams,
        [ScopeConfig] = @ScopeConfig,
        [NoteRetentionDays] = @NoteRetentionDays,
        [ExampleRetentionDays] = @ExampleRetentionDays,
        [AutoArchiveEnabled] = @AutoArchiveEnabled,
        [RerankerConfiguration] = @RerankerConfiguration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgent];
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
        

/* spUpdate Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: vwAIArchitectures
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Architectures
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIArchitecture
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIArchitectures]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIArchitectures];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIArchitectures]
AS
SELECT
    a.*,
    MJAIArchitecture_ParentArchitectureID.[Name] AS [ParentArchitecture],
    root_ParentArchitectureID.RootID AS [RootParentArchitectureID]
FROM
    [${flyway:defaultSchema}].[AIArchitecture] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIArchitecture] AS MJAIArchitecture_ParentArchitectureID
  ON
    [a].[ParentArchitectureID] = MJAIArchitecture_ParentArchitectureID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIArchitectureParentArchitectureID_GetRootID]([a].[ID], [a].[ParentArchitectureID]) AS root_ParentArchitectureID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIArchitectures] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: Permissions for vwAIArchitectures
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIArchitectures] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: spCreateAIArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIArchitecture]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Category nvarchar(50),
    @ParentArchitectureID uniqueidentifier,
    @WikipediaURL nvarchar(500),
    @YearIntroduced int,
    @KeyPaper nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIArchitecture]
            (
                [ID],
                [Name],
                [Description],
                [Category],
                [ParentArchitectureID],
                [WikipediaURL],
                [YearIntroduced],
                [KeyPaper]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Category,
                @ParentArchitectureID,
                @WikipediaURL,
                @YearIntroduced,
                @KeyPaper
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIArchitecture]
            (
                [Name],
                [Description],
                [Category],
                [ParentArchitectureID],
                [WikipediaURL],
                [YearIntroduced],
                [KeyPaper]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Category,
                @ParentArchitectureID,
                @WikipediaURL,
                @YearIntroduced,
                @KeyPaper
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIArchitectures] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIArchitecture] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIArchitecture] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: spUpdateAIArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIArchitecture]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Category nvarchar(50),
    @ParentArchitectureID uniqueidentifier,
    @WikipediaURL nvarchar(500),
    @YearIntroduced int,
    @KeyPaper nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIArchitecture]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Category] = @Category,
        [ParentArchitectureID] = @ParentArchitectureID,
        [WikipediaURL] = @WikipediaURL,
        [YearIntroduced] = @YearIntroduced,
        [KeyPaper] = @KeyPaper
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIArchitectures] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIArchitectures]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIArchitecture] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIArchitecture table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIArchitecture]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIArchitecture];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIArchitecture
ON [${flyway:defaultSchema}].[AIArchitecture]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIArchitecture]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIArchitecture] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIArchitecture] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: spDeleteAIArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIArchitecture]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIArchitecture]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIArchitecture] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIArchitecture] TO [cdp_Integration]



/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_AgentID_AgentRunID, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_AgentRunID, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIConfigurations]
AS
SELECT
    a.*,
    MJAIPrompt_DefaultPromptForContextCompressionID.[Name] AS [DefaultPromptForContextCompression],
    MJAIPrompt_DefaultPromptForContextSummarizationID.[Name] AS [DefaultPromptForContextSummarization],
    MJFileStorageProvider_DefaultStorageProviderID.[Name] AS [DefaultStorageProvider],
    MJAIConfiguration_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIConfiguration] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_DefaultPromptForContextCompressionID
  ON
    [a].[DefaultPromptForContextCompressionID] = MJAIPrompt_DefaultPromptForContextCompressionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_DefaultPromptForContextSummarizationID
  ON
    [a].[DefaultPromptForContextSummarizationID] = MJAIPrompt_DefaultPromptForContextSummarizationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_DefaultStorageProviderID
  ON
    [a].[DefaultStorageProviderID] = MJFileStorageProvider_DefaultStorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ParentID
  ON
    [a].[ParentID] = MJAIConfiguration_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIConfigurationParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit = NULL,
    @Status nvarchar(20) = NULL,
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier,
    @DefaultStorageProviderID uniqueidentifier,
    @DefaultStorageRootPath nvarchar(500),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIConfiguration]
            (
                [ID],
                [Name],
                [Description],
                [IsDefault],
                [Status],
                [DefaultPromptForContextCompressionID],
                [DefaultPromptForContextSummarizationID],
                [DefaultStorageProviderID],
                [DefaultStorageRootPath],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                @DefaultPromptForContextCompressionID,
                @DefaultPromptForContextSummarizationID,
                @DefaultStorageProviderID,
                @DefaultStorageRootPath,
                @ParentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIConfiguration]
            (
                [Name],
                [Description],
                [IsDefault],
                [Status],
                [DefaultPromptForContextCompressionID],
                [DefaultPromptForContextSummarizationID],
                [DefaultStorageProviderID],
                [DefaultStorageRootPath],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                @DefaultPromptForContextCompressionID,
                @DefaultPromptForContextSummarizationID,
                @DefaultStorageProviderID,
                @DefaultStorageRootPath,
                @ParentID
            )
    END
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Status nvarchar(20),
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier,
    @DefaultStorageProviderID uniqueidentifier,
    @DefaultStorageRootPath nvarchar(500),
    @ParentID uniqueidentifier
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
        [DefaultPromptForContextSummarizationID] = @DefaultPromptForContextSummarizationID,
        [DefaultStorageProviderID] = @DefaultStorageProviderID,
        [DefaultStorageRootPath] = @DefaultStorageRootPath,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIConfigurations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIConfiguration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIConfiguration];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentConfiguration using cursor to call spUpdateAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AIConfigurationIDID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Name nvarchar(100)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_DisplayName nvarchar(200)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Description nvarchar(MAX)
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID uniqueidentifier
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_IsDefault bit
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Priority int
    DECLARE @MJAIAgentConfigurations_AIConfigurationID_Status nvarchar(20)
    DECLARE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [DisplayName], [Description], [AIConfigurationID], [IsDefault], [Priority], [Status]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AIConfigurationID] = @ID

    OPEN cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor INTO @MJAIAgentConfigurations_AIConfigurationIDID, @MJAIAgentConfigurations_AIConfigurationID_AgentID, @MJAIAgentConfigurations_AIConfigurationID_Name, @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @MJAIAgentConfigurations_AIConfigurationID_Description, @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @MJAIAgentConfigurations_AIConfigurationID_Priority, @MJAIAgentConfigurations_AIConfigurationID_Status

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AIConfigurationIDID, @AgentID = @MJAIAgentConfigurations_AIConfigurationID_AgentID, @Name = @MJAIAgentConfigurations_AIConfigurationID_Name, @DisplayName = @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @Description = @MJAIAgentConfigurations_AIConfigurationID_Description, @AIConfigurationID = @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @IsDefault = @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @Priority = @MJAIAgentConfigurations_AIConfigurationID_Priority, @Status = @MJAIAgentConfigurations_AIConfigurationID_Status

        FETCH NEXT FROM cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor INTO @MJAIAgentConfigurations_AIConfigurationIDID, @MJAIAgentConfigurations_AIConfigurationID_AgentID, @MJAIAgentConfigurations_AIConfigurationID_Name, @MJAIAgentConfigurations_AIConfigurationID_DisplayName, @MJAIAgentConfigurations_AIConfigurationID_Description, @MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, @MJAIAgentConfigurations_AIConfigurationID_IsDefault, @MJAIAgentConfigurations_AIConfigurationID_Priority, @MJAIAgentConfigurations_AIConfigurationID_Status
    END

    CLOSE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIAgentConfigurations_AIConfigurationID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor INTO @MJAIAgentPrompts_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor INTO @MJAIAgentPrompts_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_ConfigurationID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConfigurationID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConfigurationID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConfigurationID_Success bit
    DECLARE @MJAIAgentRuns_ConfigurationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConfigurationID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConfigurationID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConfigurationID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_Verbose bit
    DECLARE @MJAIAgentRuns_ConfigurationID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConfigurationID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConfigurationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConfigurationID_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentRuns_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConfigurationID_cursor INTO @MJAIAgentRuns_ConfigurationIDID, @MJAIAgentRuns_ConfigurationID_AgentID, @MJAIAgentRuns_ConfigurationID_ParentRunID, @MJAIAgentRuns_ConfigurationID_Status, @MJAIAgentRuns_ConfigurationID_StartedAt, @MJAIAgentRuns_ConfigurationID_CompletedAt, @MJAIAgentRuns_ConfigurationID_Success, @MJAIAgentRuns_ConfigurationID_ErrorMessage, @MJAIAgentRuns_ConfigurationID_ConversationID, @MJAIAgentRuns_ConfigurationID_UserID, @MJAIAgentRuns_ConfigurationID_Result, @MJAIAgentRuns_ConfigurationID_AgentState, @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCost, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @MJAIAgentRuns_ConfigurationID_CancellationReason, @MJAIAgentRuns_ConfigurationID_FinalStep, @MJAIAgentRuns_ConfigurationID_FinalPayload, @MJAIAgentRuns_ConfigurationID_Message, @MJAIAgentRuns_ConfigurationID_LastRunID, @MJAIAgentRuns_ConfigurationID_StartingPayload, @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @MJAIAgentRuns_ConfigurationID_ConfigurationID, @MJAIAgentRuns_ConfigurationID_OverrideModelID, @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @MJAIAgentRuns_ConfigurationID_Data, @MJAIAgentRuns_ConfigurationID_Verbose, @MJAIAgentRuns_ConfigurationID_EffortLevel, @MJAIAgentRuns_ConfigurationID_RunName, @MJAIAgentRuns_ConfigurationID_Comments, @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @MJAIAgentRuns_ConfigurationID_TestRunID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConfigurationID_SecondaryScopes

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConfigurationIDID, @AgentID = @MJAIAgentRuns_ConfigurationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConfigurationID_ParentRunID, @Status = @MJAIAgentRuns_ConfigurationID_Status, @StartedAt = @MJAIAgentRuns_ConfigurationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConfigurationID_CompletedAt, @Success = @MJAIAgentRuns_ConfigurationID_Success, @ErrorMessage = @MJAIAgentRuns_ConfigurationID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConfigurationID_ConversationID, @UserID = @MJAIAgentRuns_ConfigurationID_UserID, @Result = @MJAIAgentRuns_ConfigurationID_Result, @AgentState = @MJAIAgentRuns_ConfigurationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConfigurationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConfigurationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConfigurationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConfigurationID_FinalPayload, @Message = @MJAIAgentRuns_ConfigurationID_Message, @LastRunID = @MJAIAgentRuns_ConfigurationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConfigurationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConfigurationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConfigurationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConfigurationID_Data, @Verbose = @MJAIAgentRuns_ConfigurationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConfigurationID_EffortLevel, @RunName = @MJAIAgentRuns_ConfigurationID_RunName, @Comments = @MJAIAgentRuns_ConfigurationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConfigurationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConfigurationID_SecondaryScopes

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConfigurationID_cursor INTO @MJAIAgentRuns_ConfigurationIDID, @MJAIAgentRuns_ConfigurationID_AgentID, @MJAIAgentRuns_ConfigurationID_ParentRunID, @MJAIAgentRuns_ConfigurationID_Status, @MJAIAgentRuns_ConfigurationID_StartedAt, @MJAIAgentRuns_ConfigurationID_CompletedAt, @MJAIAgentRuns_ConfigurationID_Success, @MJAIAgentRuns_ConfigurationID_ErrorMessage, @MJAIAgentRuns_ConfigurationID_ConversationID, @MJAIAgentRuns_ConfigurationID_UserID, @MJAIAgentRuns_ConfigurationID_Result, @MJAIAgentRuns_ConfigurationID_AgentState, @MJAIAgentRuns_ConfigurationID_TotalTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCost, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConfigurationID_TotalCostRollup, @MJAIAgentRuns_ConfigurationID_ConversationDetailID, @MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, @MJAIAgentRuns_ConfigurationID_CancellationReason, @MJAIAgentRuns_ConfigurationID_FinalStep, @MJAIAgentRuns_ConfigurationID_FinalPayload, @MJAIAgentRuns_ConfigurationID_Message, @MJAIAgentRuns_ConfigurationID_LastRunID, @MJAIAgentRuns_ConfigurationID_StartingPayload, @MJAIAgentRuns_ConfigurationID_TotalPromptIterations, @MJAIAgentRuns_ConfigurationID_ConfigurationID, @MJAIAgentRuns_ConfigurationID_OverrideModelID, @MJAIAgentRuns_ConfigurationID_OverrideVendorID, @MJAIAgentRuns_ConfigurationID_Data, @MJAIAgentRuns_ConfigurationID_Verbose, @MJAIAgentRuns_ConfigurationID_EffortLevel, @MJAIAgentRuns_ConfigurationID_RunName, @MJAIAgentRuns_ConfigurationID_Comments, @MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, @MJAIAgentRuns_ConfigurationID_TestRunID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConfigurationID_SecondaryScopes
    END

    CLOSE cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConfigurationID_cursor
    
    -- Cascade delete from AIConfigurationParam using cursor to call spDeleteAIConfigurationParam
    DECLARE @MJAIConfigurationParams_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIConfigurationParam]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor INTO @MJAIConfigurationParams_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIConfigurationParam] @ID = @MJAIConfigurationParams_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor INTO @MJAIConfigurationParams_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIConfigurationParams_ConfigurationID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_ParentIDID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_ParentID_IsDefault bit
    DECLARE @MJAIConfigurations_ParentID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_ParentID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_ParentID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIConfigurations_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_ParentID_cursor INTO @MJAIConfigurations_ParentIDID, @MJAIConfigurations_ParentID_Name, @MJAIConfigurations_ParentID_Description, @MJAIConfigurations_ParentID_IsDefault, @MJAIConfigurations_ParentID_Status, @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_ParentID_DefaultStorageProviderID, @MJAIConfigurations_ParentID_DefaultStorageRootPath, @MJAIConfigurations_ParentID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_ParentIDID, @Name = @MJAIConfigurations_ParentID_Name, @Description = @MJAIConfigurations_ParentID_Description, @IsDefault = @MJAIConfigurations_ParentID_IsDefault, @Status = @MJAIConfigurations_ParentID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_ParentID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_ParentID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_ParentID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_ParentID_cursor INTO @MJAIConfigurations_ParentIDID, @MJAIConfigurations_ParentID_Name, @MJAIConfigurations_ParentID_Description, @MJAIConfigurations_ParentID_IsDefault, @MJAIConfigurations_ParentID_Status, @MJAIConfigurations_ParentID_DefaultPromptForContextCompressionID, @MJAIConfigurations_ParentID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_ParentID_DefaultStorageProviderID, @MJAIConfigurations_ParentID_DefaultStorageRootPath, @MJAIConfigurations_ParentID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_ParentID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_ParentID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_ConfigurationIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_ConfigurationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [ConfigurationID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_ConfigurationID_cursor INTO @MJAIPromptModels_ConfigurationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_ConfigurationIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_ConfigurationID_cursor INTO @MJAIPromptModels_ConfigurationIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_ConfigurationID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ConfigurationID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensUsed int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ConfigurationID_Success bit
    DECLARE @MJAIPromptRuns_ConfigurationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ConfigurationID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ConfigurationID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ConfigurationID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ConfigurationID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_TopK int
    DECLARE @MJAIPromptRuns_ConfigurationID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ConfigurationID_Seed int
    DECLARE @MJAIPromptRuns_ConfigurationID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_LogProbs bit
    DECLARE @MJAIPromptRuns_ConfigurationID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ConfigurationID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ConfigurationID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ConfigurationID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ConfigurationID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_Cancelled bit
    DECLARE @MJAIPromptRuns_ConfigurationID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ConfigurationID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ConfigurationID_CacheHit bit
    DECLARE @MJAIPromptRuns_ConfigurationID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ConfigurationID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ConfigurationID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ConfigurationID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ConfigurationID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ConfigurationID_QueueTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_PromptTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_CompletionTime int
    DECLARE @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_EffortLevel int
    DECLARE @MJAIPromptRuns_ConfigurationID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ConfigurationID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ConfigurationID_TestRunID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ConfigurationID_cursor INTO @MJAIPromptRuns_ConfigurationIDID, @MJAIPromptRuns_ConfigurationID_PromptID, @MJAIPromptRuns_ConfigurationID_ModelID, @MJAIPromptRuns_ConfigurationID_VendorID, @MJAIPromptRuns_ConfigurationID_AgentID, @MJAIPromptRuns_ConfigurationID_ConfigurationID, @MJAIPromptRuns_ConfigurationID_RunAt, @MJAIPromptRuns_ConfigurationID_CompletedAt, @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @MJAIPromptRuns_ConfigurationID_Messages, @MJAIPromptRuns_ConfigurationID_Result, @MJAIPromptRuns_ConfigurationID_TokensUsed, @MJAIPromptRuns_ConfigurationID_TokensPrompt, @MJAIPromptRuns_ConfigurationID_TokensCompletion, @MJAIPromptRuns_ConfigurationID_TotalCost, @MJAIPromptRuns_ConfigurationID_Success, @MJAIPromptRuns_ConfigurationID_ErrorMessage, @MJAIPromptRuns_ConfigurationID_ParentID, @MJAIPromptRuns_ConfigurationID_RunType, @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @MJAIPromptRuns_ConfigurationID_AgentRunID, @MJAIPromptRuns_ConfigurationID_Cost, @MJAIPromptRuns_ConfigurationID_CostCurrency, @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @MJAIPromptRuns_ConfigurationID_Temperature, @MJAIPromptRuns_ConfigurationID_TopP, @MJAIPromptRuns_ConfigurationID_TopK, @MJAIPromptRuns_ConfigurationID_MinP, @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @MJAIPromptRuns_ConfigurationID_PresencePenalty, @MJAIPromptRuns_ConfigurationID_Seed, @MJAIPromptRuns_ConfigurationID_StopSequences, @MJAIPromptRuns_ConfigurationID_ResponseFormat, @MJAIPromptRuns_ConfigurationID_LogProbs, @MJAIPromptRuns_ConfigurationID_TopLogProbs, @MJAIPromptRuns_ConfigurationID_DescendantCost, @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @MJAIPromptRuns_ConfigurationID_FinalValidationError, @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @MJAIPromptRuns_ConfigurationID_CommonValidationError, @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @MJAIPromptRuns_ConfigurationID_ValidationSummary, @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @MJAIPromptRuns_ConfigurationID_FailoverErrors, @MJAIPromptRuns_ConfigurationID_FailoverDurations, @MJAIPromptRuns_ConfigurationID_OriginalModelID, @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @MJAIPromptRuns_ConfigurationID_ModelSelection, @MJAIPromptRuns_ConfigurationID_Status, @MJAIPromptRuns_ConfigurationID_Cancelled, @MJAIPromptRuns_ConfigurationID_CancellationReason, @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @MJAIPromptRuns_ConfigurationID_CacheHit, @MJAIPromptRuns_ConfigurationID_CacheKey, @MJAIPromptRuns_ConfigurationID_JudgeID, @MJAIPromptRuns_ConfigurationID_JudgeScore, @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @MJAIPromptRuns_ConfigurationID_ErrorDetails, @MJAIPromptRuns_ConfigurationID_ChildPromptID, @MJAIPromptRuns_ConfigurationID_QueueTime, @MJAIPromptRuns_ConfigurationID_PromptTime, @MJAIPromptRuns_ConfigurationID_CompletionTime, @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @MJAIPromptRuns_ConfigurationID_EffortLevel, @MJAIPromptRuns_ConfigurationID_RunName, @MJAIPromptRuns_ConfigurationID_Comments, @MJAIPromptRuns_ConfigurationID_TestRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ConfigurationIDID, @PromptID = @MJAIPromptRuns_ConfigurationID_PromptID, @ModelID = @MJAIPromptRuns_ConfigurationID_ModelID, @VendorID = @MJAIPromptRuns_ConfigurationID_VendorID, @AgentID = @MJAIPromptRuns_ConfigurationID_AgentID, @ConfigurationID = @MJAIPromptRuns_ConfigurationID_ConfigurationID, @RunAt = @MJAIPromptRuns_ConfigurationID_RunAt, @CompletedAt = @MJAIPromptRuns_ConfigurationID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ConfigurationID_Messages, @Result = @MJAIPromptRuns_ConfigurationID_Result, @TokensUsed = @MJAIPromptRuns_ConfigurationID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ConfigurationID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ConfigurationID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ConfigurationID_TotalCost, @Success = @MJAIPromptRuns_ConfigurationID_Success, @ErrorMessage = @MJAIPromptRuns_ConfigurationID_ErrorMessage, @ParentID = @MJAIPromptRuns_ConfigurationID_ParentID, @RunType = @MJAIPromptRuns_ConfigurationID_RunType, @ExecutionOrder = @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ConfigurationID_AgentRunID, @Cost = @MJAIPromptRuns_ConfigurationID_Cost, @CostCurrency = @MJAIPromptRuns_ConfigurationID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ConfigurationID_Temperature, @TopP = @MJAIPromptRuns_ConfigurationID_TopP, @TopK = @MJAIPromptRuns_ConfigurationID_TopK, @MinP = @MJAIPromptRuns_ConfigurationID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ConfigurationID_PresencePenalty, @Seed = @MJAIPromptRuns_ConfigurationID_Seed, @StopSequences = @MJAIPromptRuns_ConfigurationID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ConfigurationID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ConfigurationID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ConfigurationID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ConfigurationID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ConfigurationID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ConfigurationID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ConfigurationID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ConfigurationID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ConfigurationID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ConfigurationID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ConfigurationID_ModelSelection, @Status = @MJAIPromptRuns_ConfigurationID_Status, @Cancelled = @MJAIPromptRuns_ConfigurationID_Cancelled, @CancellationReason = @MJAIPromptRuns_ConfigurationID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ConfigurationID_CacheHit, @CacheKey = @MJAIPromptRuns_ConfigurationID_CacheKey, @JudgeID = @MJAIPromptRuns_ConfigurationID_JudgeID, @JudgeScore = @MJAIPromptRuns_ConfigurationID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ConfigurationID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ConfigurationID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ConfigurationID_QueueTime, @PromptTime = @MJAIPromptRuns_ConfigurationID_PromptTime, @CompletionTime = @MJAIPromptRuns_ConfigurationID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ConfigurationID_EffortLevel, @RunName = @MJAIPromptRuns_ConfigurationID_RunName, @Comments = @MJAIPromptRuns_ConfigurationID_Comments, @TestRunID = @MJAIPromptRuns_ConfigurationID_TestRunID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ConfigurationID_cursor INTO @MJAIPromptRuns_ConfigurationIDID, @MJAIPromptRuns_ConfigurationID_PromptID, @MJAIPromptRuns_ConfigurationID_ModelID, @MJAIPromptRuns_ConfigurationID_VendorID, @MJAIPromptRuns_ConfigurationID_AgentID, @MJAIPromptRuns_ConfigurationID_ConfigurationID, @MJAIPromptRuns_ConfigurationID_RunAt, @MJAIPromptRuns_ConfigurationID_CompletedAt, @MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, @MJAIPromptRuns_ConfigurationID_Messages, @MJAIPromptRuns_ConfigurationID_Result, @MJAIPromptRuns_ConfigurationID_TokensUsed, @MJAIPromptRuns_ConfigurationID_TokensPrompt, @MJAIPromptRuns_ConfigurationID_TokensCompletion, @MJAIPromptRuns_ConfigurationID_TotalCost, @MJAIPromptRuns_ConfigurationID_Success, @MJAIPromptRuns_ConfigurationID_ErrorMessage, @MJAIPromptRuns_ConfigurationID_ParentID, @MJAIPromptRuns_ConfigurationID_RunType, @MJAIPromptRuns_ConfigurationID_ExecutionOrder, @MJAIPromptRuns_ConfigurationID_AgentRunID, @MJAIPromptRuns_ConfigurationID_Cost, @MJAIPromptRuns_ConfigurationID_CostCurrency, @MJAIPromptRuns_ConfigurationID_TokensUsedRollup, @MJAIPromptRuns_ConfigurationID_TokensPromptRollup, @MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, @MJAIPromptRuns_ConfigurationID_Temperature, @MJAIPromptRuns_ConfigurationID_TopP, @MJAIPromptRuns_ConfigurationID_TopK, @MJAIPromptRuns_ConfigurationID_MinP, @MJAIPromptRuns_ConfigurationID_FrequencyPenalty, @MJAIPromptRuns_ConfigurationID_PresencePenalty, @MJAIPromptRuns_ConfigurationID_Seed, @MJAIPromptRuns_ConfigurationID_StopSequences, @MJAIPromptRuns_ConfigurationID_ResponseFormat, @MJAIPromptRuns_ConfigurationID_LogProbs, @MJAIPromptRuns_ConfigurationID_TopLogProbs, @MJAIPromptRuns_ConfigurationID_DescendantCost, @MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, @MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, @MJAIPromptRuns_ConfigurationID_FinalValidationPassed, @MJAIPromptRuns_ConfigurationID_ValidationBehavior, @MJAIPromptRuns_ConfigurationID_RetryStrategy, @MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, @MJAIPromptRuns_ConfigurationID_FinalValidationError, @MJAIPromptRuns_ConfigurationID_ValidationErrorCount, @MJAIPromptRuns_ConfigurationID_CommonValidationError, @MJAIPromptRuns_ConfigurationID_FirstAttemptAt, @MJAIPromptRuns_ConfigurationID_LastAttemptAt, @MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, @MJAIPromptRuns_ConfigurationID_ValidationAttempts, @MJAIPromptRuns_ConfigurationID_ValidationSummary, @MJAIPromptRuns_ConfigurationID_FailoverAttempts, @MJAIPromptRuns_ConfigurationID_FailoverErrors, @MJAIPromptRuns_ConfigurationID_FailoverDurations, @MJAIPromptRuns_ConfigurationID_OriginalModelID, @MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, @MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, @MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, @MJAIPromptRuns_ConfigurationID_ModelSelection, @MJAIPromptRuns_ConfigurationID_Status, @MJAIPromptRuns_ConfigurationID_Cancelled, @MJAIPromptRuns_ConfigurationID_CancellationReason, @MJAIPromptRuns_ConfigurationID_ModelPowerRank, @MJAIPromptRuns_ConfigurationID_SelectionStrategy, @MJAIPromptRuns_ConfigurationID_CacheHit, @MJAIPromptRuns_ConfigurationID_CacheKey, @MJAIPromptRuns_ConfigurationID_JudgeID, @MJAIPromptRuns_ConfigurationID_JudgeScore, @MJAIPromptRuns_ConfigurationID_WasSelectedResult, @MJAIPromptRuns_ConfigurationID_StreamingEnabled, @MJAIPromptRuns_ConfigurationID_FirstTokenTime, @MJAIPromptRuns_ConfigurationID_ErrorDetails, @MJAIPromptRuns_ConfigurationID_ChildPromptID, @MJAIPromptRuns_ConfigurationID_QueueTime, @MJAIPromptRuns_ConfigurationID_PromptTime, @MJAIPromptRuns_ConfigurationID_CompletionTime, @MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, @MJAIPromptRuns_ConfigurationID_EffortLevel, @MJAIPromptRuns_ConfigurationID_RunName, @MJAIPromptRuns_ConfigurationID_Comments, @MJAIPromptRuns_ConfigurationID_TestRunID
    END

    CLOSE cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ConfigurationID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_ConfigurationIDID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_ConfigurationID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_ConfigurationID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_ConfigurationID_Status nvarchar(50)
    DECLARE @MJAIResultCache_ConfigurationID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_ConfigurationID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_ConfigurationID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_ConfigurationID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_ConfigurationID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [ConfigurationID] = @ID

    OPEN cascade_update_MJAIResultCache_ConfigurationID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_ConfigurationID_cursor INTO @MJAIResultCache_ConfigurationIDID, @MJAIResultCache_ConfigurationID_AIPromptID, @MJAIResultCache_ConfigurationID_AIModelID, @MJAIResultCache_ConfigurationID_RunAt, @MJAIResultCache_ConfigurationID_PromptText, @MJAIResultCache_ConfigurationID_ResultText, @MJAIResultCache_ConfigurationID_Status, @MJAIResultCache_ConfigurationID_ExpiredOn, @MJAIResultCache_ConfigurationID_VendorID, @MJAIResultCache_ConfigurationID_AgentID, @MJAIResultCache_ConfigurationID_ConfigurationID, @MJAIResultCache_ConfigurationID_PromptEmbedding, @MJAIResultCache_ConfigurationID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_ConfigurationID_ConfigurationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_ConfigurationIDID, @AIPromptID = @MJAIResultCache_ConfigurationID_AIPromptID, @AIModelID = @MJAIResultCache_ConfigurationID_AIModelID, @RunAt = @MJAIResultCache_ConfigurationID_RunAt, @PromptText = @MJAIResultCache_ConfigurationID_PromptText, @ResultText = @MJAIResultCache_ConfigurationID_ResultText, @Status = @MJAIResultCache_ConfigurationID_Status, @ExpiredOn = @MJAIResultCache_ConfigurationID_ExpiredOn, @VendorID = @MJAIResultCache_ConfigurationID_VendorID, @AgentID = @MJAIResultCache_ConfigurationID_AgentID, @ConfigurationID = @MJAIResultCache_ConfigurationID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_ConfigurationID_PromptEmbedding, @PromptRunID = @MJAIResultCache_ConfigurationID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_ConfigurationID_cursor INTO @MJAIResultCache_ConfigurationIDID, @MJAIResultCache_ConfigurationID_AIPromptID, @MJAIResultCache_ConfigurationID_AIModelID, @MJAIResultCache_ConfigurationID_RunAt, @MJAIResultCache_ConfigurationID_PromptText, @MJAIResultCache_ConfigurationID_ResultText, @MJAIResultCache_ConfigurationID_Status, @MJAIResultCache_ConfigurationID_ExpiredOn, @MJAIResultCache_ConfigurationID_VendorID, @MJAIResultCache_ConfigurationID_AgentID, @MJAIResultCache_ConfigurationID_ConfigurationID, @MJAIResultCache_ConfigurationID_PromptEmbedding, @MJAIResultCache_ConfigurationID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_ConfigurationID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_ConfigurationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]



/* Base View SQL for MJ: AI Prompt Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Categories
-- Item: vwAIPromptCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPromptCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPromptCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptCategories]
AS
SELECT
    a.*,
    MJAIPromptCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIPromptCategory] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS MJAIPromptCategory_ParentID
  ON
    [a].[ParentID] = MJAIPromptCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptCategoryParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptCategories] TO [cdp_UI], [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Categories
-- Item: Permissions for vwAIPromptCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptCategories] TO [cdp_UI], [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Categories
-- Item: spCreateAIPromptCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPromptCategory]
            (
                [ID],
                [Name],
                [ParentID],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentID,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptCategory]
            (
                [Name],
                [ParentID],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptCategory] TO [cdp_Developer]
    

/* spCreate Permissions for MJ: AI Prompt Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptCategory] TO [cdp_Developer]



/* spUpdate SQL for MJ: AI Prompt Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Categories
-- Item: spUpdateAIPromptCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptCategory]
    SET
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPromptCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptCategory] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptCategory
ON [${flyway:defaultSchema}].[AIPromptCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptCategory] TO [cdp_Developer]



/* spDelete SQL for MJ: AI Prompt Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Categories
-- Item: spDeleteAIPromptCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptCategory] TO [cdp_Developer]
    

/* spDelete Permissions for MJ: AI Prompt Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptCategory] TO [cdp_Developer]



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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPromptRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPromptRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRuns]
AS
SELECT
    a.*,
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJAIModel_ModelID.[Name] AS [Model],
    MJAIVendor_VendorID.[Name] AS [Vendor],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIPromptRun_ParentID.[RunName] AS [Parent],
    MJAIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    MJAIModel_OriginalModelID.[Name] AS [OriginalModel],
    MJAIPromptRun_RerunFromPromptRunID.[RunName] AS [RerunFromPromptRun],
    MJAIPrompt_JudgeID.[Name] AS [Judge],
    MJAIPrompt_ChildPromptID.[Name] AS [ChildPrompt],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID],
    root_RerunFromPromptRunID.RootID AS [RootRerunFromPromptRunID]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [a].[PromptID] = MJAIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_ModelID
  ON
    [a].[ModelID] = MJAIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_VendorID
  ON
    [a].[VendorID] = MJAIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_ParentID
  ON
    [a].[ParentID] = MJAIPromptRun_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_OriginalModelID
  ON
    [a].[OriginalModelID] = MJAIModel_OriginalModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_RerunFromPromptRunID
  ON
    [a].[RerunFromPromptRunID] = MJAIPromptRun_RerunFromPromptRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_JudgeID
  ON
    [a].[JudgeID] = MJAIPrompt_JudgeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ChildPromptID
  ON
    [a].[ChildPromptID] = MJAIPrompt_ChildPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]([a].[ID], [a].[RerunFromPromptRunID]) AS root_RerunFromPromptRunID
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @ID uniqueidentifier = NULL,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit = NULL,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int,
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(MAX),
    @ResponseFormat nvarchar(50),
    @LogProbs bit,
    @TopLogProbs int,
    @DescendantCost decimal(18, 6),
    @ValidationAttemptCount int,
    @SuccessfulValidationCount int,
    @FinalValidationPassed bit,
    @ValidationBehavior nvarchar(50),
    @RetryStrategy nvarchar(50),
    @MaxRetriesConfigured int,
    @FinalValidationError nvarchar(500),
    @ValidationErrorCount int,
    @CommonValidationError nvarchar(255),
    @FirstAttemptAt datetimeoffset,
    @LastAttemptAt datetimeoffset,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetimeoffset,
    @TotalFailoverDuration int,
    @RerunFromPromptRunID uniqueidentifier,
    @ModelSelection nvarchar(MAX),
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason nvarchar(MAX),
    @ModelPowerRank int,
    @SelectionStrategy nvarchar(50),
    @CacheHit bit = NULL,
    @CacheKey nvarchar(500),
    @JudgeID uniqueidentifier,
    @JudgeScore float(53),
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime int,
    @ErrorDetails nvarchar(MAX),
    @ChildPromptID uniqueidentifier,
    @QueueTime int,
    @PromptTime int,
    @CompletionTime int,
    @ModelSpecificResponseDetails nvarchar(MAX),
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @TestRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
            (
                [ID],
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
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptID,
                @ModelID,
                @VendorID,
                @AgentID,
                @ConfigurationID,
                ISNULL(@RunAt, sysdatetimeoffset()),
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @ParentID,
                ISNULL(@RunType, 'Single'),
                @ExecutionOrder,
                @AgentRunID,
                @Cost,
                @CostCurrency,
                @TokensUsedRollup,
                @TokensPromptRollup,
                @TokensCompletionRollup,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @ResponseFormat,
                @LogProbs,
                @TopLogProbs,
                @DescendantCost,
                @ValidationAttemptCount,
                @SuccessfulValidationCount,
                @FinalValidationPassed,
                @ValidationBehavior,
                @RetryStrategy,
                @MaxRetriesConfigured,
                @FinalValidationError,
                @ValidationErrorCount,
                @CommonValidationError,
                @FirstAttemptAt,
                @LastAttemptAt,
                @TotalRetryDurationMS,
                @ValidationAttempts,
                @ValidationSummary,
                @FailoverAttempts,
                @FailoverErrors,
                @FailoverDurations,
                @OriginalModelID,
                @OriginalRequestStartTime,
                @TotalFailoverDuration,
                @RerunFromPromptRunID,
                @ModelSelection,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                ISNULL(@CacheHit, 0),
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID,
                @QueueTime,
                @PromptTime,
                @CompletionTime,
                @ModelSpecificResponseDetails,
                @EffortLevel,
                @RunName,
                @Comments,
                @TestRunID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
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
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                @AgentID,
                @ConfigurationID,
                ISNULL(@RunAt, sysdatetimeoffset()),
                @CompletedAt,
                @ExecutionTimeMS,
                @Messages,
                @Result,
                @TokensUsed,
                @TokensPrompt,
                @TokensCompletion,
                @TotalCost,
                ISNULL(@Success, 0),
                @ErrorMessage,
                @ParentID,
                ISNULL(@RunType, 'Single'),
                @ExecutionOrder,
                @AgentRunID,
                @Cost,
                @CostCurrency,
                @TokensUsedRollup,
                @TokensPromptRollup,
                @TokensCompletionRollup,
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @ResponseFormat,
                @LogProbs,
                @TopLogProbs,
                @DescendantCost,
                @ValidationAttemptCount,
                @SuccessfulValidationCount,
                @FinalValidationPassed,
                @ValidationBehavior,
                @RetryStrategy,
                @MaxRetriesConfigured,
                @FinalValidationError,
                @ValidationErrorCount,
                @CommonValidationError,
                @FirstAttemptAt,
                @LastAttemptAt,
                @TotalRetryDurationMS,
                @ValidationAttempts,
                @ValidationSummary,
                @FailoverAttempts,
                @FailoverErrors,
                @FailoverDurations,
                @OriginalModelID,
                @OriginalRequestStartTime,
                @TotalFailoverDuration,
                @RerunFromPromptRunID,
                @ModelSelection,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                @CancellationReason,
                @ModelPowerRank,
                @SelectionStrategy,
                ISNULL(@CacheHit, 0),
                @CacheKey,
                @JudgeID,
                @JudgeScore,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                @FirstTokenTime,
                @ErrorDetails,
                @ChildPromptID,
                @QueueTime,
                @PromptTime,
                @CompletionTime,
                @ModelSpecificResponseDetails,
                @EffortLevel,
                @RunName,
                @Comments,
                @TestRunID
            )
    END
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ConfigurationID uniqueidentifier,
    @RunAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @ExecutionTimeMS int,
    @Messages nvarchar(MAX),
    @Result nvarchar(MAX),
    @TokensUsed int,
    @TokensPrompt int,
    @TokensCompletion int,
    @TotalCost decimal(18, 6),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ParentID uniqueidentifier,
    @RunType nvarchar(20),
    @ExecutionOrder int,
    @AgentRunID uniqueidentifier,
    @Cost decimal(19, 8),
    @CostCurrency nvarchar(10),
    @TokensUsedRollup int,
    @TokensPromptRollup int,
    @TokensCompletionRollup int,
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(MAX),
    @ResponseFormat nvarchar(50),
    @LogProbs bit,
    @TopLogProbs int,
    @DescendantCost decimal(18, 6),
    @ValidationAttemptCount int,
    @SuccessfulValidationCount int,
    @FinalValidationPassed bit,
    @ValidationBehavior nvarchar(50),
    @RetryStrategy nvarchar(50),
    @MaxRetriesConfigured int,
    @FinalValidationError nvarchar(500),
    @ValidationErrorCount int,
    @CommonValidationError nvarchar(255),
    @FirstAttemptAt datetimeoffset,
    @LastAttemptAt datetimeoffset,
    @TotalRetryDurationMS int,
    @ValidationAttempts nvarchar(MAX),
    @ValidationSummary nvarchar(MAX),
    @FailoverAttempts int,
    @FailoverErrors nvarchar(MAX),
    @FailoverDurations nvarchar(MAX),
    @OriginalModelID uniqueidentifier,
    @OriginalRequestStartTime datetimeoffset,
    @TotalFailoverDuration int,
    @RerunFromPromptRunID uniqueidentifier,
    @ModelSelection nvarchar(MAX),
    @Status nvarchar(50),
    @Cancelled bit,
    @CancellationReason nvarchar(MAX),
    @ModelPowerRank int,
    @SelectionStrategy nvarchar(50),
    @CacheHit bit,
    @CacheKey nvarchar(500),
    @JudgeID uniqueidentifier,
    @JudgeScore float(53),
    @WasSelectedResult bit,
    @StreamingEnabled bit,
    @FirstTokenTime int,
    @ErrorDetails nvarchar(MAX),
    @ChildPromptID uniqueidentifier,
    @QueueTime int,
    @PromptTime int,
    @CompletionTime int,
    @ModelSpecificResponseDetails nvarchar(MAX),
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @TestRunID uniqueidentifier
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
        [ErrorMessage] = @ErrorMessage,
        [ParentID] = @ParentID,
        [RunType] = @RunType,
        [ExecutionOrder] = @ExecutionOrder,
        [AgentRunID] = @AgentRunID,
        [Cost] = @Cost,
        [CostCurrency] = @CostCurrency,
        [TokensUsedRollup] = @TokensUsedRollup,
        [TokensPromptRollup] = @TokensPromptRollup,
        [TokensCompletionRollup] = @TokensCompletionRollup,
        [Temperature] = @Temperature,
        [TopP] = @TopP,
        [TopK] = @TopK,
        [MinP] = @MinP,
        [FrequencyPenalty] = @FrequencyPenalty,
        [PresencePenalty] = @PresencePenalty,
        [Seed] = @Seed,
        [StopSequences] = @StopSequences,
        [ResponseFormat] = @ResponseFormat,
        [LogProbs] = @LogProbs,
        [TopLogProbs] = @TopLogProbs,
        [DescendantCost] = @DescendantCost,
        [ValidationAttemptCount] = @ValidationAttemptCount,
        [SuccessfulValidationCount] = @SuccessfulValidationCount,
        [FinalValidationPassed] = @FinalValidationPassed,
        [ValidationBehavior] = @ValidationBehavior,
        [RetryStrategy] = @RetryStrategy,
        [MaxRetriesConfigured] = @MaxRetriesConfigured,
        [FinalValidationError] = @FinalValidationError,
        [ValidationErrorCount] = @ValidationErrorCount,
        [CommonValidationError] = @CommonValidationError,
        [FirstAttemptAt] = @FirstAttemptAt,
        [LastAttemptAt] = @LastAttemptAt,
        [TotalRetryDurationMS] = @TotalRetryDurationMS,
        [ValidationAttempts] = @ValidationAttempts,
        [ValidationSummary] = @ValidationSummary,
        [FailoverAttempts] = @FailoverAttempts,
        [FailoverErrors] = @FailoverErrors,
        [FailoverDurations] = @FailoverDurations,
        [OriginalModelID] = @OriginalModelID,
        [OriginalRequestStartTime] = @OriginalRequestStartTime,
        [TotalFailoverDuration] = @TotalFailoverDuration,
        [RerunFromPromptRunID] = @RerunFromPromptRunID,
        [ModelSelection] = @ModelSelection,
        [Status] = @Status,
        [Cancelled] = @Cancelled,
        [CancellationReason] = @CancellationReason,
        [ModelPowerRank] = @ModelPowerRank,
        [SelectionStrategy] = @SelectionStrategy,
        [CacheHit] = @CacheHit,
        [CacheKey] = @CacheKey,
        [JudgeID] = @JudgeID,
        [JudgeScore] = @JudgeScore,
        [WasSelectedResult] = @WasSelectedResult,
        [StreamingEnabled] = @StreamingEnabled,
        [FirstTokenTime] = @FirstTokenTime,
        [ErrorDetails] = @ErrorDetails,
        [ChildPromptID] = @ChildPromptID,
        [QueueTime] = @QueueTime,
        [PromptTime] = @PromptTime,
        [CompletionTime] = @CompletionTime,
        [ModelSpecificResponseDetails] = @ModelSpecificResponseDetails,
        [EffortLevel] = @EffortLevel,
        [RunName] = @RunName,
        [Comments] = @Comments,
        [TestRunID] = @TestRunID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptRun];
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



/* Base View SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPrompt
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPrompts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPrompts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT
    a.*,
    MJTemplate_TemplateID.[Name] AS [Template],
    MJAIPromptCategory_CategoryID.[Name] AS [Category],
    MJAIPromptType_TypeID.[Name] AS [Type],
    MJAIModelType_AIModelTypeID.[Name] AS [AIModelType],
    MJAIPrompt_ResultSelectorPromptID.[Name] AS [ResultSelectorPrompt],
    root_ResultSelectorPromptID.RootID AS [RootResultSelectorPromptID]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS MJTemplate_TemplateID
  ON
    [a].[TemplateID] = MJTemplate_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS MJAIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = MJAIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS MJAIPromptType_TypeID
  ON
    [a].[TypeID] = MJAIPromptType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModelType] AS MJAIModelType_AIModelTypeID
  ON
    [a].[AIModelTypeID] = MJAIModelType_AIModelTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ResultSelectorPromptID
  ON
    [a].[ResultSelectorPromptID] = MJAIPrompt_ResultSelectorPromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptResultSelectorPromptID_GetRootID]([a].[ID], [a].[ResultSelectorPromptID]) AS root_ResultSelectorPromptID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_UI], [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @ResponseFormat nvarchar(20) = NULL,
    @ModelSpecificResponseFormat nvarchar(MAX),
    @AIModelTypeID uniqueidentifier,
    @MinPowerRank int,
    @SelectionStrategy nvarchar(20) = NULL,
    @PowerPreference nvarchar(20) = NULL,
    @ParallelizationMode nvarchar(20) = NULL,
    @ParallelCount int,
    @ParallelConfigParam nvarchar(100),
    @OutputType nvarchar(50) = NULL,
    @OutputExample nvarchar(MAX),
    @ValidationBehavior nvarchar(50) = NULL,
    @MaxRetries int = NULL,
    @RetryDelayMS int = NULL,
    @RetryStrategy nvarchar(20) = NULL,
    @ResultSelectorPromptID uniqueidentifier,
    @EnableCaching bit = NULL,
    @CacheTTLSeconds int,
    @CacheMatchType nvarchar(20) = NULL,
    @CacheSimilarityThreshold float(53),
    @CacheMustMatchModel bit = NULL,
    @CacheMustMatchVendor bit = NULL,
    @CacheMustMatchAgent bit = NULL,
    @CacheMustMatchConfig bit = NULL,
    @PromptRole nvarchar(20) = NULL,
    @PromptPosition nvarchar(20) = NULL,
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(1000),
    @IncludeLogProbs bit,
    @TopLogProbs int,
    @FailoverStrategy nvarchar(50) = NULL,
    @FailoverMaxAttempts int,
    @FailoverDelaySeconds int,
    @FailoverModelStrategy nvarchar(50) = NULL,
    @FailoverErrorScope nvarchar(50) = NULL,
    @EffortLevel int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPrompt]
            (
                [ID],
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
                [CacheMustMatchConfig],
                [PromptRole],
                [PromptPosition],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [IncludeLogProbs],
                [TopLogProbs],
                [FailoverStrategy],
                [FailoverMaxAttempts],
                [FailoverDelaySeconds],
                [FailoverModelStrategy],
                [FailoverErrorScope],
                [EffortLevel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @TemplateID,
                @CategoryID,
                @TypeID,
                @Status,
                ISNULL(@ResponseFormat, 'Any'),
                @ModelSpecificResponseFormat,
                @AIModelTypeID,
                @MinPowerRank,
                ISNULL(@SelectionStrategy, 'Default'),
                ISNULL(@PowerPreference, 'Highest'),
                ISNULL(@ParallelizationMode, 'None'),
                @ParallelCount,
                @ParallelConfigParam,
                ISNULL(@OutputType, 'string'),
                @OutputExample,
                ISNULL(@ValidationBehavior, 'Warn'),
                ISNULL(@MaxRetries, 0),
                ISNULL(@RetryDelayMS, 0),
                ISNULL(@RetryStrategy, 'Fixed'),
                @ResultSelectorPromptID,
                ISNULL(@EnableCaching, 0),
                @CacheTTLSeconds,
                ISNULL(@CacheMatchType, 'Exact'),
                @CacheSimilarityThreshold,
                ISNULL(@CacheMustMatchModel, 1),
                ISNULL(@CacheMustMatchVendor, 1),
                ISNULL(@CacheMustMatchAgent, 0),
                ISNULL(@CacheMustMatchConfig, 0),
                ISNULL(@PromptRole, 'System'),
                ISNULL(@PromptPosition, 'First'),
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @IncludeLogProbs,
                @TopLogProbs,
                ISNULL(@FailoverStrategy, 'SameModelDifferentVendor'),
                @FailoverMaxAttempts,
                @FailoverDelaySeconds,
                ISNULL(@FailoverModelStrategy, 'PreferSameModel'),
                ISNULL(@FailoverErrorScope, 'All'),
                @EffortLevel
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPrompt]
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
                [CacheMustMatchConfig],
                [PromptRole],
                [PromptPosition],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [IncludeLogProbs],
                [TopLogProbs],
                [FailoverStrategy],
                [FailoverMaxAttempts],
                [FailoverDelaySeconds],
                [FailoverModelStrategy],
                [FailoverErrorScope],
                [EffortLevel]
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
                ISNULL(@ResponseFormat, 'Any'),
                @ModelSpecificResponseFormat,
                @AIModelTypeID,
                @MinPowerRank,
                ISNULL(@SelectionStrategy, 'Default'),
                ISNULL(@PowerPreference, 'Highest'),
                ISNULL(@ParallelizationMode, 'None'),
                @ParallelCount,
                @ParallelConfigParam,
                ISNULL(@OutputType, 'string'),
                @OutputExample,
                ISNULL(@ValidationBehavior, 'Warn'),
                ISNULL(@MaxRetries, 0),
                ISNULL(@RetryDelayMS, 0),
                ISNULL(@RetryStrategy, 'Fixed'),
                @ResultSelectorPromptID,
                ISNULL(@EnableCaching, 0),
                @CacheTTLSeconds,
                ISNULL(@CacheMatchType, 'Exact'),
                @CacheSimilarityThreshold,
                ISNULL(@CacheMustMatchModel, 1),
                ISNULL(@CacheMustMatchVendor, 1),
                ISNULL(@CacheMustMatchAgent, 0),
                ISNULL(@CacheMustMatchConfig, 0),
                ISNULL(@PromptRole, 'System'),
                ISNULL(@PromptPosition, 'First'),
                @Temperature,
                @TopP,
                @TopK,
                @MinP,
                @FrequencyPenalty,
                @PresencePenalty,
                @Seed,
                @StopSequences,
                @IncludeLogProbs,
                @TopLogProbs,
                ISNULL(@FailoverStrategy, 'SameModelDifferentVendor'),
                @FailoverMaxAttempts,
                @FailoverDelaySeconds,
                ISNULL(@FailoverModelStrategy, 'PreferSameModel'),
                ISNULL(@FailoverErrorScope, 'All'),
                @EffortLevel
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer]
    

/* spCreate Permissions for MJ: AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Developer]



/* spUpdate SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt];
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
    @CacheMustMatchConfig bit,
    @PromptRole nvarchar(20),
    @PromptPosition nvarchar(20),
    @Temperature decimal(3, 2),
    @TopP decimal(3, 2),
    @TopK int,
    @MinP decimal(3, 2),
    @FrequencyPenalty decimal(3, 2),
    @PresencePenalty decimal(3, 2),
    @Seed int,
    @StopSequences nvarchar(1000),
    @IncludeLogProbs bit,
    @TopLogProbs int,
    @FailoverStrategy nvarchar(50),
    @FailoverMaxAttempts int,
    @FailoverDelaySeconds int,
    @FailoverModelStrategy nvarchar(50),
    @FailoverErrorScope nvarchar(50),
    @EffortLevel int
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
        [CacheMustMatchConfig] = @CacheMustMatchConfig,
        [PromptRole] = @PromptRole,
        [PromptPosition] = @PromptPosition,
        [Temperature] = @Temperature,
        [TopP] = @TopP,
        [TopK] = @TopK,
        [MinP] = @MinP,
        [FrequencyPenalty] = @FrequencyPenalty,
        [PresencePenalty] = @PresencePenalty,
        [Seed] = @Seed,
        [StopSequences] = @StopSequences,
        [IncludeLogProbs] = @IncludeLogProbs,
        [TopLogProbs] = @TopLogProbs,
        [FailoverStrategy] = @FailoverStrategy,
        [FailoverMaxAttempts] = @FailoverMaxAttempts,
        [FailoverDelaySeconds] = @FailoverDelaySeconds,
        [FailoverModelStrategy] = @FailoverModelStrategy,
        [FailoverErrorScope] = @FailoverErrorScope,
        [EffortLevel] = @EffortLevel
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPrompts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPrompt table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPrompt]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPrompt];
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
        

/* spUpdate Permissions for MJ: AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Developer]



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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ParentID_AgentRunID, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPrompt]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_DefaultCompactPromptIDID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CategoryID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_Name nvarchar(425)
    DECLARE @MJActions_DefaultCompactPromptID_Description nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Type nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_UserComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_Code nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_DefaultCompactPromptID_CodeLocked bit
    DECLARE @MJActions_DefaultCompactPromptID_ForceCodeGeneration bit
    DECLARE @MJActions_DefaultCompactPromptID_RetentionPeriod int
    DECLARE @MJActions_DefaultCompactPromptID_Status nvarchar(20)
    DECLARE @MJActions_DefaultCompactPromptID_DriverClass nvarchar(255)
    DECLARE @MJActions_DefaultCompactPromptID_ParentID uniqueidentifier
    DECLARE @MJActions_DefaultCompactPromptID_IconClass nvarchar(100)
    DECLARE @MJActions_DefaultCompactPromptID_DefaultCompactPromptID uniqueidentifier
    DECLARE cascade_update_MJActions_DefaultCompactPromptID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [DefaultCompactPromptID] = @ID

    OPEN cascade_update_MJActions_DefaultCompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_DefaultCompactPromptID_DefaultCompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_DefaultCompactPromptIDID, @CategoryID = @MJActions_DefaultCompactPromptID_CategoryID, @Name = @MJActions_DefaultCompactPromptID_Name, @Description = @MJActions_DefaultCompactPromptID_Description, @Type = @MJActions_DefaultCompactPromptID_Type, @UserPrompt = @MJActions_DefaultCompactPromptID_UserPrompt, @UserComments = @MJActions_DefaultCompactPromptID_UserComments, @Code = @MJActions_DefaultCompactPromptID_Code, @CodeComments = @MJActions_DefaultCompactPromptID_CodeComments, @CodeApprovalStatus = @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_DefaultCompactPromptID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_DefaultCompactPromptID_CodeApprovedAt, @CodeLocked = @MJActions_DefaultCompactPromptID_CodeLocked, @ForceCodeGeneration = @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @RetentionPeriod = @MJActions_DefaultCompactPromptID_RetentionPeriod, @Status = @MJActions_DefaultCompactPromptID_Status, @DriverClass = @MJActions_DefaultCompactPromptID_DriverClass, @ParentID = @MJActions_DefaultCompactPromptID_ParentID, @IconClass = @MJActions_DefaultCompactPromptID_IconClass, @DefaultCompactPromptID = @MJActions_DefaultCompactPromptID_DefaultCompactPromptID

        FETCH NEXT FROM cascade_update_MJActions_DefaultCompactPromptID_cursor INTO @MJActions_DefaultCompactPromptIDID, @MJActions_DefaultCompactPromptID_CategoryID, @MJActions_DefaultCompactPromptID_Name, @MJActions_DefaultCompactPromptID_Description, @MJActions_DefaultCompactPromptID_Type, @MJActions_DefaultCompactPromptID_UserPrompt, @MJActions_DefaultCompactPromptID_UserComments, @MJActions_DefaultCompactPromptID_Code, @MJActions_DefaultCompactPromptID_CodeComments, @MJActions_DefaultCompactPromptID_CodeApprovalStatus, @MJActions_DefaultCompactPromptID_CodeApprovalComments, @MJActions_DefaultCompactPromptID_CodeApprovedByUserID, @MJActions_DefaultCompactPromptID_CodeApprovedAt, @MJActions_DefaultCompactPromptID_CodeLocked, @MJActions_DefaultCompactPromptID_ForceCodeGeneration, @MJActions_DefaultCompactPromptID_RetentionPeriod, @MJActions_DefaultCompactPromptID_Status, @MJActions_DefaultCompactPromptID_DriverClass, @MJActions_DefaultCompactPromptID_ParentID, @MJActions_DefaultCompactPromptID_IconClass, @MJActions_DefaultCompactPromptID_DefaultCompactPromptID
    END

    CLOSE cascade_update_MJActions_DefaultCompactPromptID_cursor
    DEALLOCATE cascade_update_MJActions_DefaultCompactPromptID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_CompactPromptIDID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_CompactPromptID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_CompactPromptID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_CompactPromptID_CompactLength int
    DECLARE @MJAIAgentActions_CompactPromptID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_CompactPromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [CompactPromptID] = @ID

    OPEN cascade_update_MJAIAgentActions_CompactPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_CompactPromptID_CompactPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_CompactPromptIDID, @AgentID = @MJAIAgentActions_CompactPromptID_AgentID, @ActionID = @MJAIAgentActions_CompactPromptID_ActionID, @Status = @MJAIAgentActions_CompactPromptID_Status, @MinExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_CompactPromptID_CompactMode, @CompactLength = @MJAIAgentActions_CompactPromptID_CompactLength, @CompactPromptID = @MJAIAgentActions_CompactPromptID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_CompactPromptID_cursor INTO @MJAIAgentActions_CompactPromptIDID, @MJAIAgentActions_CompactPromptID_AgentID, @MJAIAgentActions_CompactPromptID_ActionID, @MJAIAgentActions_CompactPromptID_Status, @MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, @MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, @MJAIAgentActions_CompactPromptID_ResultExpirationTurns, @MJAIAgentActions_CompactPromptID_ResultExpirationMode, @MJAIAgentActions_CompactPromptID_CompactMode, @MJAIAgentActions_CompactPromptID_CompactLength, @MJAIAgentActions_CompactPromptID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_CompactPromptID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_PromptID_cursor INTO @MJAIAgentPrompts_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_PromptID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_PromptIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_PromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_StartingStep bit
    DECLARE @MJAIAgentSteps_PromptID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_PromptID_RetryCount int
    DECLARE @MJAIAgentSteps_PromptID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_PromptID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_PositionX int
    DECLARE @MJAIAgentSteps_PromptID_PositionY int
    DECLARE @MJAIAgentSteps_PromptID_Width int
    DECLARE @MJAIAgentSteps_PromptID_Height int
    DECLARE @MJAIAgentSteps_PromptID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_PromptID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_PromptID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_PromptID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_PromptID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [PromptID] = @ID

    OPEN cascade_update_MJAIAgentSteps_PromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_PromptID_PromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_PromptIDID, @AgentID = @MJAIAgentSteps_PromptID_AgentID, @Name = @MJAIAgentSteps_PromptID_Name, @Description = @MJAIAgentSteps_PromptID_Description, @StepType = @MJAIAgentSteps_PromptID_StepType, @StartingStep = @MJAIAgentSteps_PromptID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_PromptID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_PromptID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_PromptID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_PromptID_ActionID, @SubAgentID = @MJAIAgentSteps_PromptID_SubAgentID, @PromptID = @MJAIAgentSteps_PromptID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_PromptID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_PromptID_PositionX, @PositionY = @MJAIAgentSteps_PromptID_PositionY, @Width = @MJAIAgentSteps_PromptID_Width, @Height = @MJAIAgentSteps_PromptID_Height, @Status = @MJAIAgentSteps_PromptID_Status, @ActionInputMapping = @MJAIAgentSteps_PromptID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_PromptID_LoopBodyType, @Configuration = @MJAIAgentSteps_PromptID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_PromptID_cursor INTO @MJAIAgentSteps_PromptIDID, @MJAIAgentSteps_PromptID_AgentID, @MJAIAgentSteps_PromptID_Name, @MJAIAgentSteps_PromptID_Description, @MJAIAgentSteps_PromptID_StepType, @MJAIAgentSteps_PromptID_StartingStep, @MJAIAgentSteps_PromptID_TimeoutSeconds, @MJAIAgentSteps_PromptID_RetryCount, @MJAIAgentSteps_PromptID_OnErrorBehavior, @MJAIAgentSteps_PromptID_ActionID, @MJAIAgentSteps_PromptID_SubAgentID, @MJAIAgentSteps_PromptID_PromptID, @MJAIAgentSteps_PromptID_ActionOutputMapping, @MJAIAgentSteps_PromptID_PositionX, @MJAIAgentSteps_PromptID_PositionY, @MJAIAgentSteps_PromptID_Width, @MJAIAgentSteps_PromptID_Height, @MJAIAgentSteps_PromptID_Status, @MJAIAgentSteps_PromptID_ActionInputMapping, @MJAIAgentSteps_PromptID_LoopBodyType, @MJAIAgentSteps_PromptID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_PromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_PromptID_cursor
    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType
    DECLARE @MJAIAgentTypes_SystemPromptIDID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_Name nvarchar(100)
    DECLARE @MJAIAgentTypes_SystemPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgentTypes_SystemPromptID_SystemPromptID uniqueidentifier
    DECLARE @MJAIAgentTypes_SystemPromptID_IsActive bit
    DECLARE @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormKey nvarchar(500)
    DECLARE @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault bit
    DECLARE @MJAIAgentTypes_SystemPromptID_PromptParamsSchema nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentTypes_SystemPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [SystemPromptID], [IsActive], [AgentPromptPlaceholder], [DriverClass], [UIFormSectionKey], [UIFormKey], [UIFormSectionExpandedByDefault], [PromptParamsSchema]
        FROM [${flyway:defaultSchema}].[AIAgentType]
        WHERE [SystemPromptID] = @ID

    OPEN cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentTypes_SystemPromptID_SystemPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentType] @ID = @MJAIAgentTypes_SystemPromptIDID, @Name = @MJAIAgentTypes_SystemPromptID_Name, @Description = @MJAIAgentTypes_SystemPromptID_Description, @SystemPromptID = @MJAIAgentTypes_SystemPromptID_SystemPromptID, @IsActive = @MJAIAgentTypes_SystemPromptID_IsActive, @AgentPromptPlaceholder = @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @DriverClass = @MJAIAgentTypes_SystemPromptID_DriverClass, @UIFormSectionKey = @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @UIFormKey = @MJAIAgentTypes_SystemPromptID_UIFormKey, @UIFormSectionExpandedByDefault = @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @PromptParamsSchema = @MJAIAgentTypes_SystemPromptID_PromptParamsSchema

        FETCH NEXT FROM cascade_update_MJAIAgentTypes_SystemPromptID_cursor INTO @MJAIAgentTypes_SystemPromptIDID, @MJAIAgentTypes_SystemPromptID_Name, @MJAIAgentTypes_SystemPromptID_Description, @MJAIAgentTypes_SystemPromptID_SystemPromptID, @MJAIAgentTypes_SystemPromptID_IsActive, @MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, @MJAIAgentTypes_SystemPromptID_DriverClass, @MJAIAgentTypes_SystemPromptID_UIFormSectionKey, @MJAIAgentTypes_SystemPromptID_UIFormKey, @MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, @MJAIAgentTypes_SystemPromptID_PromptParamsSchema
    END

    CLOSE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgentTypes_SystemPromptID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ContextCompressionPromptIDID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Name nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExposeAsAction bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionOrder int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_EnableContextCompression bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ContextCompressionPromptID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_Status nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectNotes bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InjectExamples bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ContextCompressionPromptID_IsRestricted bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ContextCompressionPromptID_MaxMessages int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ContextCompressionPromptID] = @ID

    OPEN cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ContextCompressionPromptIDID, @Name = @MJAIAgents_ContextCompressionPromptID_Name, @Description = @MJAIAgents_ContextCompressionPromptID_Description, @LogoURL = @MJAIAgents_ContextCompressionPromptID_LogoURL, @ParentID = @MJAIAgents_ContextCompressionPromptID_ParentID, @ExposeAsAction = @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ContextCompressionPromptID_TypeID, @Status = @MJAIAgents_ContextCompressionPromptID_Status, @DriverClass = @MJAIAgents_ContextCompressionPromptID_DriverClass, @IconClass = @MJAIAgents_ContextCompressionPromptID_IconClass, @ModelSelectionMode = @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ContextCompressionPromptID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @InvocationMode = @MJAIAgents_ContextCompressionPromptID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @InjectNotes = @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MessageMode = @MJAIAgents_ContextCompressionPromptID_MessageMode, @MaxMessages = @MJAIAgents_ContextCompressionPromptID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration

        FETCH NEXT FROM cascade_update_MJAIAgents_ContextCompressionPromptID_cursor INTO @MJAIAgents_ContextCompressionPromptIDID, @MJAIAgents_ContextCompressionPromptID_Name, @MJAIAgents_ContextCompressionPromptID_Description, @MJAIAgents_ContextCompressionPromptID_LogoURL, @MJAIAgents_ContextCompressionPromptID_ParentID, @MJAIAgents_ContextCompressionPromptID_ExposeAsAction, @MJAIAgents_ContextCompressionPromptID_ExecutionOrder, @MJAIAgents_ContextCompressionPromptID_ExecutionMode, @MJAIAgents_ContextCompressionPromptID_EnableContextCompression, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageThreshold, @MJAIAgents_ContextCompressionPromptID_ContextCompressionPromptID, @MJAIAgents_ContextCompressionPromptID_ContextCompressionMessageRetentionCount, @MJAIAgents_ContextCompressionPromptID_TypeID, @MJAIAgents_ContextCompressionPromptID_Status, @MJAIAgents_ContextCompressionPromptID_DriverClass, @MJAIAgents_ContextCompressionPromptID_IconClass, @MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, @MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, @MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, @MJAIAgents_ContextCompressionPromptID_PayloadScope, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_FinalPayloadValidationMaxRetries, @MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, @MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, @MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidation, @MJAIAgents_ContextCompressionPromptID_StartingPayloadValidationMode, @MJAIAgents_ContextCompressionPromptID_DefaultPromptEffortLevel, @MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, @MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, @MJAIAgents_ContextCompressionPromptID_OwnerUserID, @MJAIAgents_ContextCompressionPromptID_InvocationMode, @MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, @MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, @MJAIAgents_ContextCompressionPromptID_TechnicalDesign, @MJAIAgents_ContextCompressionPromptID_InjectNotes, @MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, @MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_InjectExamples, @MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, @MJAIAgents_ContextCompressionPromptID_ExampleInjectionStrategy, @MJAIAgents_ContextCompressionPromptID_IsRestricted, @MJAIAgents_ContextCompressionPromptID_MessageMode, @MJAIAgents_ContextCompressionPromptID_MaxMessages, @MJAIAgents_ContextCompressionPromptID_AttachmentStorageProviderID, @MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, @MJAIAgents_ContextCompressionPromptID_InlineStorageThresholdBytes, @MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, @MJAIAgents_ContextCompressionPromptID_ScopeConfig, @MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, @MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, @MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, @MJAIAgents_ContextCompressionPromptID_RerankerConfiguration
    END

    CLOSE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ContextCompressionPromptID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextCompressionID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @Name = @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor INTO @MJAIConfigurations_DefaultPromptForContextCompressionIDID, @MJAIConfigurations_DefaultPromptForContextCompressionID_Name, @MJAIConfigurations_DefaultPromptForContextCompressionID_Description, @MJAIConfigurations_DefaultPromptForContextCompressionID_IsDefault, @MJAIConfigurations_DefaultPromptForContextCompressionID_Status, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextCompressionID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextCompressionID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextCompressionID_cursor
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationIDID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name nvarchar(100)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description nvarchar(MAX)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault bit
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status nvarchar(20)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID uniqueidentifier
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath nvarchar(500)
    DECLARE @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID uniqueidentifier
    DECLARE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [IsDefault], [Status], [DefaultPromptForContextCompressionID], [DefaultPromptForContextSummarizationID], [DefaultStorageProviderID], [DefaultStorageRootPath], [ParentID]
        FROM [${flyway:defaultSchema}].[AIConfiguration]
        WHERE [DefaultPromptForContextSummarizationID] = @ID

    OPEN cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIConfiguration] @ID = @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @Name = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @Description = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @IsDefault = @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @Status = @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @DefaultPromptForContextCompressionID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @DefaultPromptForContextSummarizationID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @DefaultStorageProviderID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @DefaultStorageRootPath = @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @ParentID = @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID

        FETCH NEXT FROM cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor INTO @MJAIConfigurations_DefaultPromptForContextSummarizationIDID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Name, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Description, @MJAIConfigurations_DefaultPromptForContextSummarizationID_IsDefault, @MJAIConfigurations_DefaultPromptForContextSummarizationID_Status, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextCompressionID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultPromptForContextSummarizationID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageProviderID, @MJAIConfigurations_DefaultPromptForContextSummarizationID_DefaultStorageRootPath, @MJAIConfigurations_DefaultPromptForContextSummarizationID_ParentID
    END

    CLOSE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    DEALLOCATE cascade_update_MJAIConfigurations_DefaultPromptForContextSummarizationID_cursor
    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel
    DECLARE @MJAIPromptModels_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptModels_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptModel]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptModels_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptModel] @ID = @MJAIPromptModels_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptModels_PromptID_cursor INTO @MJAIPromptModels_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptModels_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptModels_PromptID_cursor
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun
    DECLARE @MJAIPromptRuns_PromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRuns_PromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [PromptID] = @ID
    
    OPEN cascade_delete_MJAIPromptRuns_PromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRun] @ID = @MJAIPromptRuns_PromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRuns_PromptID_cursor INTO @MJAIPromptRuns_PromptIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRuns_PromptID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRuns_PromptID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_JudgeIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_JudgeID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsed int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPrompt int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletion int
    DECLARE @MJAIPromptRuns_JudgeID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_Success bit
    DECLARE @MJAIPromptRuns_JudgeID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_JudgeID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_JudgeID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_JudgeID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_JudgeID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_JudgeID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_JudgeID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_TopK int
    DECLARE @MJAIPromptRuns_JudgeID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_JudgeID_Seed int
    DECLARE @MJAIPromptRuns_JudgeID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_LogProbs bit
    DECLARE @MJAIPromptRuns_JudgeID_TopLogProbs int
    DECLARE @MJAIPromptRuns_JudgeID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_JudgeID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_JudgeID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_JudgeID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_JudgeID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_JudgeID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_JudgeID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_JudgeID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_JudgeID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_Cancelled bit
    DECLARE @MJAIPromptRuns_JudgeID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_JudgeID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_JudgeID_CacheHit bit
    DECLARE @MJAIPromptRuns_JudgeID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_JudgeID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_JudgeID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_JudgeID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_JudgeID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_JudgeID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_JudgeID_QueueTime int
    DECLARE @MJAIPromptRuns_JudgeID_PromptTime int
    DECLARE @MJAIPromptRuns_JudgeID_CompletionTime int
    DECLARE @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_EffortLevel int
    DECLARE @MJAIPromptRuns_JudgeID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_JudgeID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_JudgeID_TestRunID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_JudgeID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [JudgeID] = @ID

    OPEN cascade_update_MJAIPromptRuns_JudgeID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_JudgeID_JudgeID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_JudgeIDID, @PromptID = @MJAIPromptRuns_JudgeID_PromptID, @ModelID = @MJAIPromptRuns_JudgeID_ModelID, @VendorID = @MJAIPromptRuns_JudgeID_VendorID, @AgentID = @MJAIPromptRuns_JudgeID_AgentID, @ConfigurationID = @MJAIPromptRuns_JudgeID_ConfigurationID, @RunAt = @MJAIPromptRuns_JudgeID_RunAt, @CompletedAt = @MJAIPromptRuns_JudgeID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_JudgeID_Messages, @Result = @MJAIPromptRuns_JudgeID_Result, @TokensUsed = @MJAIPromptRuns_JudgeID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_JudgeID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_JudgeID_TokensCompletion, @TotalCost = @MJAIPromptRuns_JudgeID_TotalCost, @Success = @MJAIPromptRuns_JudgeID_Success, @ErrorMessage = @MJAIPromptRuns_JudgeID_ErrorMessage, @ParentID = @MJAIPromptRuns_JudgeID_ParentID, @RunType = @MJAIPromptRuns_JudgeID_RunType, @ExecutionOrder = @MJAIPromptRuns_JudgeID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_JudgeID_AgentRunID, @Cost = @MJAIPromptRuns_JudgeID_Cost, @CostCurrency = @MJAIPromptRuns_JudgeID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_JudgeID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_JudgeID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_JudgeID_Temperature, @TopP = @MJAIPromptRuns_JudgeID_TopP, @TopK = @MJAIPromptRuns_JudgeID_TopK, @MinP = @MJAIPromptRuns_JudgeID_MinP, @FrequencyPenalty = @MJAIPromptRuns_JudgeID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_JudgeID_PresencePenalty, @Seed = @MJAIPromptRuns_JudgeID_Seed, @StopSequences = @MJAIPromptRuns_JudgeID_StopSequences, @ResponseFormat = @MJAIPromptRuns_JudgeID_ResponseFormat, @LogProbs = @MJAIPromptRuns_JudgeID_LogProbs, @TopLogProbs = @MJAIPromptRuns_JudgeID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_JudgeID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_JudgeID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_JudgeID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_JudgeID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_JudgeID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_JudgeID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_JudgeID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_JudgeID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_JudgeID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_JudgeID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_JudgeID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_JudgeID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_JudgeID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_JudgeID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_JudgeID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_JudgeID_ModelSelection, @Status = @MJAIPromptRuns_JudgeID_Status, @Cancelled = @MJAIPromptRuns_JudgeID_Cancelled, @CancellationReason = @MJAIPromptRuns_JudgeID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_JudgeID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_JudgeID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_JudgeID_CacheHit, @CacheKey = @MJAIPromptRuns_JudgeID_CacheKey, @JudgeID = @MJAIPromptRuns_JudgeID_JudgeID, @JudgeScore = @MJAIPromptRuns_JudgeID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_JudgeID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_JudgeID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_JudgeID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_JudgeID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_JudgeID_ChildPromptID, @QueueTime = @MJAIPromptRuns_JudgeID_QueueTime, @PromptTime = @MJAIPromptRuns_JudgeID_PromptTime, @CompletionTime = @MJAIPromptRuns_JudgeID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_JudgeID_EffortLevel, @RunName = @MJAIPromptRuns_JudgeID_RunName, @Comments = @MJAIPromptRuns_JudgeID_Comments, @TestRunID = @MJAIPromptRuns_JudgeID_TestRunID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_JudgeID_cursor INTO @MJAIPromptRuns_JudgeIDID, @MJAIPromptRuns_JudgeID_PromptID, @MJAIPromptRuns_JudgeID_ModelID, @MJAIPromptRuns_JudgeID_VendorID, @MJAIPromptRuns_JudgeID_AgentID, @MJAIPromptRuns_JudgeID_ConfigurationID, @MJAIPromptRuns_JudgeID_RunAt, @MJAIPromptRuns_JudgeID_CompletedAt, @MJAIPromptRuns_JudgeID_ExecutionTimeMS, @MJAIPromptRuns_JudgeID_Messages, @MJAIPromptRuns_JudgeID_Result, @MJAIPromptRuns_JudgeID_TokensUsed, @MJAIPromptRuns_JudgeID_TokensPrompt, @MJAIPromptRuns_JudgeID_TokensCompletion, @MJAIPromptRuns_JudgeID_TotalCost, @MJAIPromptRuns_JudgeID_Success, @MJAIPromptRuns_JudgeID_ErrorMessage, @MJAIPromptRuns_JudgeID_ParentID, @MJAIPromptRuns_JudgeID_RunType, @MJAIPromptRuns_JudgeID_ExecutionOrder, @MJAIPromptRuns_JudgeID_AgentRunID, @MJAIPromptRuns_JudgeID_Cost, @MJAIPromptRuns_JudgeID_CostCurrency, @MJAIPromptRuns_JudgeID_TokensUsedRollup, @MJAIPromptRuns_JudgeID_TokensPromptRollup, @MJAIPromptRuns_JudgeID_TokensCompletionRollup, @MJAIPromptRuns_JudgeID_Temperature, @MJAIPromptRuns_JudgeID_TopP, @MJAIPromptRuns_JudgeID_TopK, @MJAIPromptRuns_JudgeID_MinP, @MJAIPromptRuns_JudgeID_FrequencyPenalty, @MJAIPromptRuns_JudgeID_PresencePenalty, @MJAIPromptRuns_JudgeID_Seed, @MJAIPromptRuns_JudgeID_StopSequences, @MJAIPromptRuns_JudgeID_ResponseFormat, @MJAIPromptRuns_JudgeID_LogProbs, @MJAIPromptRuns_JudgeID_TopLogProbs, @MJAIPromptRuns_JudgeID_DescendantCost, @MJAIPromptRuns_JudgeID_ValidationAttemptCount, @MJAIPromptRuns_JudgeID_SuccessfulValidationCount, @MJAIPromptRuns_JudgeID_FinalValidationPassed, @MJAIPromptRuns_JudgeID_ValidationBehavior, @MJAIPromptRuns_JudgeID_RetryStrategy, @MJAIPromptRuns_JudgeID_MaxRetriesConfigured, @MJAIPromptRuns_JudgeID_FinalValidationError, @MJAIPromptRuns_JudgeID_ValidationErrorCount, @MJAIPromptRuns_JudgeID_CommonValidationError, @MJAIPromptRuns_JudgeID_FirstAttemptAt, @MJAIPromptRuns_JudgeID_LastAttemptAt, @MJAIPromptRuns_JudgeID_TotalRetryDurationMS, @MJAIPromptRuns_JudgeID_ValidationAttempts, @MJAIPromptRuns_JudgeID_ValidationSummary, @MJAIPromptRuns_JudgeID_FailoverAttempts, @MJAIPromptRuns_JudgeID_FailoverErrors, @MJAIPromptRuns_JudgeID_FailoverDurations, @MJAIPromptRuns_JudgeID_OriginalModelID, @MJAIPromptRuns_JudgeID_OriginalRequestStartTime, @MJAIPromptRuns_JudgeID_TotalFailoverDuration, @MJAIPromptRuns_JudgeID_RerunFromPromptRunID, @MJAIPromptRuns_JudgeID_ModelSelection, @MJAIPromptRuns_JudgeID_Status, @MJAIPromptRuns_JudgeID_Cancelled, @MJAIPromptRuns_JudgeID_CancellationReason, @MJAIPromptRuns_JudgeID_ModelPowerRank, @MJAIPromptRuns_JudgeID_SelectionStrategy, @MJAIPromptRuns_JudgeID_CacheHit, @MJAIPromptRuns_JudgeID_CacheKey, @MJAIPromptRuns_JudgeID_JudgeID, @MJAIPromptRuns_JudgeID_JudgeScore, @MJAIPromptRuns_JudgeID_WasSelectedResult, @MJAIPromptRuns_JudgeID_StreamingEnabled, @MJAIPromptRuns_JudgeID_FirstTokenTime, @MJAIPromptRuns_JudgeID_ErrorDetails, @MJAIPromptRuns_JudgeID_ChildPromptID, @MJAIPromptRuns_JudgeID_QueueTime, @MJAIPromptRuns_JudgeID_PromptTime, @MJAIPromptRuns_JudgeID_CompletionTime, @MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, @MJAIPromptRuns_JudgeID_EffortLevel, @MJAIPromptRuns_JudgeID_RunName, @MJAIPromptRuns_JudgeID_Comments, @MJAIPromptRuns_JudgeID_TestRunID
    END

    CLOSE cascade_update_MJAIPromptRuns_JudgeID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_JudgeID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ChildPromptIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsed int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_Success bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ChildPromptID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ChildPromptID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ChildPromptID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ChildPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_TopK int
    DECLARE @MJAIPromptRuns_ChildPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ChildPromptID_Seed int
    DECLARE @MJAIPromptRuns_ChildPromptID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_LogProbs bit
    DECLARE @MJAIPromptRuns_ChildPromptID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ChildPromptID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ChildPromptID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ChildPromptID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_Cancelled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ChildPromptID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheHit bit
    DECLARE @MJAIPromptRuns_ChildPromptID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ChildPromptID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ChildPromptID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ChildPromptID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ChildPromptID_QueueTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_PromptTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_CompletionTime int
    DECLARE @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_EffortLevel int
    DECLARE @MJAIPromptRuns_ChildPromptID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ChildPromptID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ChildPromptID_TestRunID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_ChildPromptID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ChildPromptID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ChildPromptID_ChildPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ChildPromptIDID, @PromptID = @MJAIPromptRuns_ChildPromptID_PromptID, @ModelID = @MJAIPromptRuns_ChildPromptID_ModelID, @VendorID = @MJAIPromptRuns_ChildPromptID_VendorID, @AgentID = @MJAIPromptRuns_ChildPromptID_AgentID, @ConfigurationID = @MJAIPromptRuns_ChildPromptID_ConfigurationID, @RunAt = @MJAIPromptRuns_ChildPromptID_RunAt, @CompletedAt = @MJAIPromptRuns_ChildPromptID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ChildPromptID_Messages, @Result = @MJAIPromptRuns_ChildPromptID_Result, @TokensUsed = @MJAIPromptRuns_ChildPromptID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ChildPromptID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ChildPromptID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ChildPromptID_TotalCost, @Success = @MJAIPromptRuns_ChildPromptID_Success, @ErrorMessage = @MJAIPromptRuns_ChildPromptID_ErrorMessage, @ParentID = @MJAIPromptRuns_ChildPromptID_ParentID, @RunType = @MJAIPromptRuns_ChildPromptID_RunType, @ExecutionOrder = @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ChildPromptID_AgentRunID, @Cost = @MJAIPromptRuns_ChildPromptID_Cost, @CostCurrency = @MJAIPromptRuns_ChildPromptID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ChildPromptID_Temperature, @TopP = @MJAIPromptRuns_ChildPromptID_TopP, @TopK = @MJAIPromptRuns_ChildPromptID_TopK, @MinP = @MJAIPromptRuns_ChildPromptID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ChildPromptID_PresencePenalty, @Seed = @MJAIPromptRuns_ChildPromptID_Seed, @StopSequences = @MJAIPromptRuns_ChildPromptID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ChildPromptID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ChildPromptID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ChildPromptID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ChildPromptID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ChildPromptID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ChildPromptID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ChildPromptID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ChildPromptID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ChildPromptID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ChildPromptID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ChildPromptID_ModelSelection, @Status = @MJAIPromptRuns_ChildPromptID_Status, @Cancelled = @MJAIPromptRuns_ChildPromptID_Cancelled, @CancellationReason = @MJAIPromptRuns_ChildPromptID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ChildPromptID_CacheHit, @CacheKey = @MJAIPromptRuns_ChildPromptID_CacheKey, @JudgeID = @MJAIPromptRuns_ChildPromptID_JudgeID, @JudgeScore = @MJAIPromptRuns_ChildPromptID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ChildPromptID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ChildPromptID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ChildPromptID_QueueTime, @PromptTime = @MJAIPromptRuns_ChildPromptID_PromptTime, @CompletionTime = @MJAIPromptRuns_ChildPromptID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ChildPromptID_EffortLevel, @RunName = @MJAIPromptRuns_ChildPromptID_RunName, @Comments = @MJAIPromptRuns_ChildPromptID_Comments, @TestRunID = @MJAIPromptRuns_ChildPromptID_TestRunID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ChildPromptID_cursor INTO @MJAIPromptRuns_ChildPromptIDID, @MJAIPromptRuns_ChildPromptID_PromptID, @MJAIPromptRuns_ChildPromptID_ModelID, @MJAIPromptRuns_ChildPromptID_VendorID, @MJAIPromptRuns_ChildPromptID_AgentID, @MJAIPromptRuns_ChildPromptID_ConfigurationID, @MJAIPromptRuns_ChildPromptID_RunAt, @MJAIPromptRuns_ChildPromptID_CompletedAt, @MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, @MJAIPromptRuns_ChildPromptID_Messages, @MJAIPromptRuns_ChildPromptID_Result, @MJAIPromptRuns_ChildPromptID_TokensUsed, @MJAIPromptRuns_ChildPromptID_TokensPrompt, @MJAIPromptRuns_ChildPromptID_TokensCompletion, @MJAIPromptRuns_ChildPromptID_TotalCost, @MJAIPromptRuns_ChildPromptID_Success, @MJAIPromptRuns_ChildPromptID_ErrorMessage, @MJAIPromptRuns_ChildPromptID_ParentID, @MJAIPromptRuns_ChildPromptID_RunType, @MJAIPromptRuns_ChildPromptID_ExecutionOrder, @MJAIPromptRuns_ChildPromptID_AgentRunID, @MJAIPromptRuns_ChildPromptID_Cost, @MJAIPromptRuns_ChildPromptID_CostCurrency, @MJAIPromptRuns_ChildPromptID_TokensUsedRollup, @MJAIPromptRuns_ChildPromptID_TokensPromptRollup, @MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, @MJAIPromptRuns_ChildPromptID_Temperature, @MJAIPromptRuns_ChildPromptID_TopP, @MJAIPromptRuns_ChildPromptID_TopK, @MJAIPromptRuns_ChildPromptID_MinP, @MJAIPromptRuns_ChildPromptID_FrequencyPenalty, @MJAIPromptRuns_ChildPromptID_PresencePenalty, @MJAIPromptRuns_ChildPromptID_Seed, @MJAIPromptRuns_ChildPromptID_StopSequences, @MJAIPromptRuns_ChildPromptID_ResponseFormat, @MJAIPromptRuns_ChildPromptID_LogProbs, @MJAIPromptRuns_ChildPromptID_TopLogProbs, @MJAIPromptRuns_ChildPromptID_DescendantCost, @MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, @MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, @MJAIPromptRuns_ChildPromptID_FinalValidationPassed, @MJAIPromptRuns_ChildPromptID_ValidationBehavior, @MJAIPromptRuns_ChildPromptID_RetryStrategy, @MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, @MJAIPromptRuns_ChildPromptID_FinalValidationError, @MJAIPromptRuns_ChildPromptID_ValidationErrorCount, @MJAIPromptRuns_ChildPromptID_CommonValidationError, @MJAIPromptRuns_ChildPromptID_FirstAttemptAt, @MJAIPromptRuns_ChildPromptID_LastAttemptAt, @MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, @MJAIPromptRuns_ChildPromptID_ValidationAttempts, @MJAIPromptRuns_ChildPromptID_ValidationSummary, @MJAIPromptRuns_ChildPromptID_FailoverAttempts, @MJAIPromptRuns_ChildPromptID_FailoverErrors, @MJAIPromptRuns_ChildPromptID_FailoverDurations, @MJAIPromptRuns_ChildPromptID_OriginalModelID, @MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, @MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, @MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, @MJAIPromptRuns_ChildPromptID_ModelSelection, @MJAIPromptRuns_ChildPromptID_Status, @MJAIPromptRuns_ChildPromptID_Cancelled, @MJAIPromptRuns_ChildPromptID_CancellationReason, @MJAIPromptRuns_ChildPromptID_ModelPowerRank, @MJAIPromptRuns_ChildPromptID_SelectionStrategy, @MJAIPromptRuns_ChildPromptID_CacheHit, @MJAIPromptRuns_ChildPromptID_CacheKey, @MJAIPromptRuns_ChildPromptID_JudgeID, @MJAIPromptRuns_ChildPromptID_JudgeScore, @MJAIPromptRuns_ChildPromptID_WasSelectedResult, @MJAIPromptRuns_ChildPromptID_StreamingEnabled, @MJAIPromptRuns_ChildPromptID_FirstTokenTime, @MJAIPromptRuns_ChildPromptID_ErrorDetails, @MJAIPromptRuns_ChildPromptID_ChildPromptID, @MJAIPromptRuns_ChildPromptID_QueueTime, @MJAIPromptRuns_ChildPromptID_PromptTime, @MJAIPromptRuns_ChildPromptID_CompletionTime, @MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, @MJAIPromptRuns_ChildPromptID_EffortLevel, @MJAIPromptRuns_ChildPromptID_RunName, @MJAIPromptRuns_ChildPromptID_Comments, @MJAIPromptRuns_ChildPromptID_TestRunID
    END

    CLOSE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ChildPromptID_cursor
    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt
    DECLARE @MJAIPrompts_ResultSelectorPromptIDID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Name nvarchar(255)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Description nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TemplateID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CategoryID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Status nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResponseFormat nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinPowerRank int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PowerPreference nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelCount int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam nvarchar(100)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputType nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_OutputExample nvarchar(MAX)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MaxRetries int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_RetryStrategy nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID uniqueidentifier
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EnableCaching bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMatchType nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold float(53)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptRole nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PromptPosition nvarchar(20)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Temperature decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopK int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_MinP decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_Seed int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_StopSequences nvarchar(1000)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs bit
    DECLARE @MJAIPrompts_ResultSelectorPromptID_TopLogProbs int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds int
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope nvarchar(50)
    DECLARE @MJAIPrompts_ResultSelectorPromptID_EffortLevel int
    DECLARE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [TemplateID], [CategoryID], [TypeID], [Status], [ResponseFormat], [ModelSpecificResponseFormat], [AIModelTypeID], [MinPowerRank], [SelectionStrategy], [PowerPreference], [ParallelizationMode], [ParallelCount], [ParallelConfigParam], [OutputType], [OutputExample], [ValidationBehavior], [MaxRetries], [RetryDelayMS], [RetryStrategy], [ResultSelectorPromptID], [EnableCaching], [CacheTTLSeconds], [CacheMatchType], [CacheSimilarityThreshold], [CacheMustMatchModel], [CacheMustMatchVendor], [CacheMustMatchAgent], [CacheMustMatchConfig], [PromptRole], [PromptPosition], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [IncludeLogProbs], [TopLogProbs], [FailoverStrategy], [FailoverMaxAttempts], [FailoverDelaySeconds], [FailoverModelStrategy], [FailoverErrorScope], [EffortLevel]
        FROM [${flyway:defaultSchema}].[AIPrompt]
        WHERE [ResultSelectorPromptID] = @ID

    OPEN cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPrompt] @ID = @MJAIPrompts_ResultSelectorPromptIDID, @Name = @MJAIPrompts_ResultSelectorPromptID_Name, @Description = @MJAIPrompts_ResultSelectorPromptID_Description, @TemplateID = @MJAIPrompts_ResultSelectorPromptID_TemplateID, @CategoryID = @MJAIPrompts_ResultSelectorPromptID_CategoryID, @TypeID = @MJAIPrompts_ResultSelectorPromptID_TypeID, @Status = @MJAIPrompts_ResultSelectorPromptID_Status, @ResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @ModelSpecificResponseFormat = @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @AIModelTypeID = @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MinPowerRank = @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @SelectionStrategy = @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @PowerPreference = @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @ParallelizationMode = @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @ParallelCount = @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @ParallelConfigParam = @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @OutputType = @MJAIPrompts_ResultSelectorPromptID_OutputType, @OutputExample = @MJAIPrompts_ResultSelectorPromptID_OutputExample, @ValidationBehavior = @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MaxRetries = @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @RetryDelayMS = @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @RetryStrategy = @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @ResultSelectorPromptID = @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @EnableCaching = @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @CacheTTLSeconds = @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @CacheMatchType = @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @CacheSimilarityThreshold = @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @CacheMustMatchModel = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @CacheMustMatchVendor = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @CacheMustMatchAgent = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @CacheMustMatchConfig = @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @PromptRole = @MJAIPrompts_ResultSelectorPromptID_PromptRole, @PromptPosition = @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @Temperature = @MJAIPrompts_ResultSelectorPromptID_Temperature, @TopP = @MJAIPrompts_ResultSelectorPromptID_TopP, @TopK = @MJAIPrompts_ResultSelectorPromptID_TopK, @MinP = @MJAIPrompts_ResultSelectorPromptID_MinP, @FrequencyPenalty = @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @PresencePenalty = @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @Seed = @MJAIPrompts_ResultSelectorPromptID_Seed, @StopSequences = @MJAIPrompts_ResultSelectorPromptID_StopSequences, @IncludeLogProbs = @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @TopLogProbs = @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @FailoverStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @FailoverMaxAttempts = @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @FailoverDelaySeconds = @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @FailoverModelStrategy = @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @FailoverErrorScope = @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @EffortLevel = @MJAIPrompts_ResultSelectorPromptID_EffortLevel

        FETCH NEXT FROM cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor INTO @MJAIPrompts_ResultSelectorPromptIDID, @MJAIPrompts_ResultSelectorPromptID_Name, @MJAIPrompts_ResultSelectorPromptID_Description, @MJAIPrompts_ResultSelectorPromptID_TemplateID, @MJAIPrompts_ResultSelectorPromptID_CategoryID, @MJAIPrompts_ResultSelectorPromptID_TypeID, @MJAIPrompts_ResultSelectorPromptID_Status, @MJAIPrompts_ResultSelectorPromptID_ResponseFormat, @MJAIPrompts_ResultSelectorPromptID_ModelSpecificResponseFormat, @MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, @MJAIPrompts_ResultSelectorPromptID_MinPowerRank, @MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, @MJAIPrompts_ResultSelectorPromptID_PowerPreference, @MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, @MJAIPrompts_ResultSelectorPromptID_ParallelCount, @MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, @MJAIPrompts_ResultSelectorPromptID_OutputType, @MJAIPrompts_ResultSelectorPromptID_OutputExample, @MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, @MJAIPrompts_ResultSelectorPromptID_MaxRetries, @MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, @MJAIPrompts_ResultSelectorPromptID_RetryStrategy, @MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, @MJAIPrompts_ResultSelectorPromptID_EnableCaching, @MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, @MJAIPrompts_ResultSelectorPromptID_CacheMatchType, @MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, @MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, @MJAIPrompts_ResultSelectorPromptID_PromptRole, @MJAIPrompts_ResultSelectorPromptID_PromptPosition, @MJAIPrompts_ResultSelectorPromptID_Temperature, @MJAIPrompts_ResultSelectorPromptID_TopP, @MJAIPrompts_ResultSelectorPromptID_TopK, @MJAIPrompts_ResultSelectorPromptID_MinP, @MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, @MJAIPrompts_ResultSelectorPromptID_PresencePenalty, @MJAIPrompts_ResultSelectorPromptID_Seed, @MJAIPrompts_ResultSelectorPromptID_StopSequences, @MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, @MJAIPrompts_ResultSelectorPromptID_TopLogProbs, @MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, @MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, @MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, @MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, @MJAIPrompts_ResultSelectorPromptID_EffortLevel
    END

    CLOSE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    DEALLOCATE cascade_update_MJAIPrompts_ResultSelectorPromptID_cursor
    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache
    DECLARE @MJAIResultCache_AIPromptIDID uniqueidentifier
    DECLARE cascade_delete_MJAIResultCache_AIPromptID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AIPromptID] = @ID
    
    OPEN cascade_delete_MJAIResultCache_AIPromptID_cursor
    FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteAIResultCache] @ID = @MJAIResultCache_AIPromptIDID
        
        FETCH NEXT FROM cascade_delete_MJAIResultCache_AIPromptID_cursor INTO @MJAIResultCache_AIPromptIDID
    END
    
    CLOSE cascade_delete_MJAIResultCache_AIPromptID_cursor
    DEALLOCATE cascade_delete_MJAIResultCache_AIPromptID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer]
    

/* spDelete Permissions for MJ: AI Prompts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Developer]



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
    MJAPIScope_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[APIScope] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[APIScope] AS MJAPIScope_ParentID
  ON
    [a].[ParentID] = MJAPIScope_ParentID.[ID]
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
    @IsActive bit = NULL,
    @UIConfig nvarchar(MAX)
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
                [IsActive],
                [UIConfig]
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
                ISNULL(@IsActive, 1),
                @UIConfig
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
                [IsActive],
                [UIConfig]
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
                ISNULL(@IsActive, 1),
                @UIConfig
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
    @IsActive bit,
    @UIConfig nvarchar(MAX)
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
        [IsActive] = @IsActive,
        [UIConfig] = @UIConfig
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



/* Base View SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactTypes]
AS
SELECT
    a.*,
    MJArtifactType_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ArtifactType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS MJArtifactType_ParentID
  ON
    [a].[ParentID] = MJArtifactType_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnArtifactTypeParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit = NULL,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX),
    @DriverClass nvarchar(255),
    @Icon nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[ArtifactType]
        (
            [Name],
                [Description],
                [ContentType],
                [IsEnabled],
                [ParentID],
                [ExtractRules],
                [DriverClass],
                [Icon],
                [ID]
        )
    VALUES
        (
            @Name,
                @Description,
                @ContentType,
                ISNULL(@IsEnabled, 1),
                @ParentID,
                @ExtractRules,
                @DriverClass,
                @Icon,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ContentType nvarchar(100),
    @IsEnabled bit,
    @ParentID uniqueidentifier,
    @ExtractRules nvarchar(MAX),
    @DriverClass nvarchar(255),
    @Icon nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ContentType] = @ContentType,
        [IsEnabled] = @IsEnabled,
        [ParentID] = @ParentID,
        [ExtractRules] = @ExtractRules,
        [DriverClass] = @DriverClass,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactType
ON [${flyway:defaultSchema}].[ArtifactType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactType] TO [cdp_Integration]



/* Base View SQL for MJ: Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Log Types
-- Item: vwAuditLogTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Audit Log Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AuditLogType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAuditLogTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAuditLogTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAuditLogTypes]
AS
SELECT
    a.*,
    MJAuditLogType_ParentID.[Name] AS [Parent],
    MJAuthorization_AuthorizationID.[Name] AS [Authorization],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AuditLogType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AuditLogType] AS MJAuditLogType_ParentID
  ON
    [a].[ParentID] = MJAuditLogType_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Authorization] AS MJAuthorization_AuthorizationID
  ON
    [a].[AuthorizationID] = MJAuthorization_AuthorizationID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAuditLogTypeParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogTypes] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Log Types
-- Item: Permissions for vwAuditLogTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAuditLogTypes] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for MJ: Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Log Types
-- Item: spCreateAuditLogType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuditLogType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAuditLogType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLogType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLogType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @AuthorizationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AuditLogType]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [AuthorizationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @AuthorizationID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AuditLogType]
            (
                [Name],
                [Description],
                [ParentID],
                [AuthorizationID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @AuthorizationID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAuditLogTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLogType] TO [cdp_Developer]
    

/* spCreate Permissions for MJ: Audit Log Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLogType] TO [cdp_Developer]



/* spUpdate SQL for MJ: Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Log Types
-- Item: spUpdateAuditLogType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AuditLogType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAuditLogType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAuditLogType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAuditLogType]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @AuthorizationID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLogType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [AuthorizationID] = @AuthorizationID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAuditLogTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAuditLogTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLogType] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AuditLogType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAuditLogType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAuditLogType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAuditLogType
ON [${flyway:defaultSchema}].[AuditLogType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLogType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AuditLogType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Audit Log Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLogType] TO [cdp_Developer]



/* spDelete SQL for MJ: Audit Log Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Log Types
-- Item: spDeleteAuditLogType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AuditLogType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAuditLogType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAuditLogType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAuditLogType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AuditLogType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAuditLogType] TO [cdp_Developer]
    

/* spDelete Permissions for MJ: Audit Log Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAuditLogType] TO [cdp_Developer]



/* Base View SQL for MJ: Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorizations
-- Item: vwAuthorizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Authorizations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Authorization
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAuthorizations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAuthorizations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAuthorizations]
AS
SELECT
    a.*,
    MJAuthorization_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Authorization] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Authorization] AS MJAuthorization_ParentID
  ON
    [a].[ParentID] = MJAuthorization_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAuthorizationParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAuthorizations] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for MJ: Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorizations
-- Item: Permissions for vwAuthorizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAuthorizations] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorizations
-- Item: spCreateAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Authorization
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAuthorization]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuthorization];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuthorization]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(100),
    @IsActive bit = NULL,
    @UseAuditLog bit = NULL,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Authorization]
            (
                [ID],
                [ParentID],
                [Name],
                [IsActive],
                [UseAuditLog],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                ISNULL(@IsActive, 1),
                ISNULL(@UseAuditLog, 1),
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Authorization]
            (
                [ParentID],
                [Name],
                [IsActive],
                [UseAuditLog],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                ISNULL(@IsActive, 1),
                ISNULL(@UseAuditLog, 1),
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAuthorizations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuthorization] TO [cdp_Developer]
    

/* spCreate Permissions for MJ: Authorizations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuthorization] TO [cdp_Developer]



/* spUpdate SQL for MJ: Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorizations
-- Item: spUpdateAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Authorization
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAuthorization]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAuthorization];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAuthorization]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(100),
    @IsActive bit,
    @UseAuditLog bit,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Authorization]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [IsActive] = @IsActive,
        [UseAuditLog] = @UseAuditLog,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAuthorizations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAuthorizations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuthorization] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Authorization table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAuthorization]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAuthorization];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAuthorization
ON [${flyway:defaultSchema}].[Authorization]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Authorization]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Authorization] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Authorizations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuthorization] TO [cdp_Developer]



/* spDelete SQL for MJ: Authorizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Authorizations
-- Item: spDeleteAuthorization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Authorization
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAuthorization]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAuthorization];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAuthorization]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Authorization]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for MJ: Authorizations */




/* Base View SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Collections
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Collection
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCollections]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCollections];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCollections]
AS
SELECT
    c.*,
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJCollection_ParentID.[Name] AS [Parent],
    MJUser_OwnerID.[Name] AS [Owner],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Collection] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [c].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Collection] AS MJCollection_ParentID
  ON
    [c].[ParentID] = MJCollection_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerID
  ON
    [c].[OwnerID] = MJUser_OwnerID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnCollectionParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: Permissions for vwCollections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCollections] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spCreateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Collection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCollection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCollection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCollection]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int,
    @OwnerID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence],
                [OwnerID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence,
                @OwnerID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Collection]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Icon],
                [Color],
                [Sequence],
                [OwnerID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ParentID,
                @Name,
                @Description,
                @Icon,
                @Color,
                @Sequence,
                @OwnerID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCollections] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spUpdateCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Collection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCollection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCollection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCollection]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Icon nvarchar(50),
    @Color nvarchar(7),
    @Sequence int,
    @OwnerID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        [EnvironmentID] = @EnvironmentID,
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [Color] = @Color,
        [Sequence] = @Sequence,
        [OwnerID] = @OwnerID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCollections] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCollections]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Collection table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCollection]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCollection];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCollection
ON [${flyway:defaultSchema}].[Collection]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Collection]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Collection] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Collections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Collections
-- Item: spDeleteCollection
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Collection
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCollection]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCollection];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCollection]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Collection]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Collections */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCollection] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegrationEntityMap */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationID in table CompanyIntegrationEntityMap
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationEntityMap]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_CompanyIntegrationID ON [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ([CompanyIntegrationID]);

-- Index for foreign key EntityID in table CompanyIntegrationEntityMap
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationEntityMap]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_EntityID ON [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 8CD5F6E1-9CED-4393-9D6C-486CE3D3504C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8CD5F6E1-9CED-4393-9D6C-486CE3D3504C',
         @RelatedEntityNameFieldMap='CompanyIntegration'

/* Index for Foreign Keys for CompanyIntegrationFieldMap */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityMapID in table CompanyIntegrationFieldMap
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationFieldMap_EntityMapID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationFieldMap]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationFieldMap_EntityMapID ON [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] ([EntityMapID]);

/* Base View SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Field Maps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationFieldMap
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap]
    @ID uniqueidentifier = NULL,
    @EntityMapID uniqueidentifier,
    @SourceFieldName nvarchar(500),
    @SourceFieldLabel nvarchar(500),
    @DestinationFieldName nvarchar(500),
    @DestinationFieldLabel nvarchar(500),
    @Direction nvarchar(50) = NULL,
    @TransformPipeline nvarchar(MAX),
    @IsKeyField bit = NULL,
    @IsRequired bit = NULL,
    @DefaultValue nvarchar(MAX),
    @Priority int = NULL,
    @Status nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
            (
                [ID],
                [EntityMapID],
                [SourceFieldName],
                [SourceFieldLabel],
                [DestinationFieldName],
                [DestinationFieldLabel],
                [Direction],
                [TransformPipeline],
                [IsKeyField],
                [IsRequired],
                [DefaultValue],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityMapID,
                @SourceFieldName,
                @SourceFieldLabel,
                @DestinationFieldName,
                @DestinationFieldLabel,
                ISNULL(@Direction, 'SourceToDest'),
                @TransformPipeline,
                ISNULL(@IsKeyField, 0),
                ISNULL(@IsRequired, 0),
                @DefaultValue,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
            (
                [EntityMapID],
                [SourceFieldName],
                [SourceFieldLabel],
                [DestinationFieldName],
                [DestinationFieldLabel],
                [Direction],
                [TransformPipeline],
                [IsKeyField],
                [IsRequired],
                [DefaultValue],
                [Priority],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityMapID,
                @SourceFieldName,
                @SourceFieldLabel,
                @DestinationFieldName,
                @DestinationFieldLabel,
                ISNULL(@Direction, 'SourceToDest'),
                @TransformPipeline,
                ISNULL(@IsKeyField, 0),
                ISNULL(@IsRequired, 0),
                @DefaultValue,
                ISNULL(@Priority, 0),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Company Integration Field Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap]
    @ID uniqueidentifier,
    @EntityMapID uniqueidentifier,
    @SourceFieldName nvarchar(500),
    @SourceFieldLabel nvarchar(500),
    @DestinationFieldName nvarchar(500),
    @DestinationFieldLabel nvarchar(500),
    @Direction nvarchar(50),
    @TransformPipeline nvarchar(MAX),
    @IsKeyField bit,
    @IsRequired bit,
    @DefaultValue nvarchar(MAX),
    @Priority int,
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
    SET
        [EntityMapID] = @EntityMapID,
        [SourceFieldName] = @SourceFieldName,
        [SourceFieldLabel] = @SourceFieldLabel,
        [DestinationFieldName] = @DestinationFieldName,
        [DestinationFieldLabel] = @DestinationFieldLabel,
        [Direction] = @Direction,
        [TransformPipeline] = @TransformPipeline,
        [IsKeyField] = @IsKeyField,
        [IsRequired] = @IsRequired,
        [DefaultValue] = @DefaultValue,
        [Priority] = @Priority,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationFieldMaps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationFieldMap table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationFieldMap]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationFieldMap];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationFieldMap
ON [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integration Field Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationFieldMap] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationFieldMap]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Company Integration Field Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationFieldMap] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 07926DDE-86CB-40BB-BD8C-2EBED3C8332D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='07926DDE-86CB-40BB-BD8C-2EBED3C8332D',
         @RelatedEntityNameFieldMap='Entity'

/* Base View SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: vwCompanyIntegrationEntityMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Entity Maps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationEntityMap
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps]
AS
SELECT
    c.*,
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [c].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [c].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: Permissions for vwCompanyIntegrationEntityMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spCreateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @ExternalObjectName nvarchar(500),
    @ExternalObjectLabel nvarchar(500),
    @EntityID uniqueidentifier,
    @SyncDirection nvarchar(50) = NULL,
    @SyncEnabled bit = NULL,
    @MatchStrategy nvarchar(MAX),
    @ConflictResolution nvarchar(50) = NULL,
    @Priority int = NULL,
    @DeleteBehavior nvarchar(50) = NULL,
    @Status nvarchar(50) = NULL,
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
            (
                [ID],
                [CompanyIntegrationID],
                [ExternalObjectName],
                [ExternalObjectLabel],
                [EntityID],
                [SyncDirection],
                [SyncEnabled],
                [MatchStrategy],
                [ConflictResolution],
                [Priority],
                [DeleteBehavior],
                [Status],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationID,
                @ExternalObjectName,
                @ExternalObjectLabel,
                @EntityID,
                ISNULL(@SyncDirection, 'Pull'),
                ISNULL(@SyncEnabled, 1),
                @MatchStrategy,
                ISNULL(@ConflictResolution, 'SourceWins'),
                ISNULL(@Priority, 0),
                ISNULL(@DeleteBehavior, 'SoftDelete'),
                ISNULL(@Status, 'Active'),
                @Configuration
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
            (
                [CompanyIntegrationID],
                [ExternalObjectName],
                [ExternalObjectLabel],
                [EntityID],
                [SyncDirection],
                [SyncEnabled],
                [MatchStrategy],
                [ConflictResolution],
                [Priority],
                [DeleteBehavior],
                [Status],
                [Configuration]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationID,
                @ExternalObjectName,
                @ExternalObjectLabel,
                @EntityID,
                ISNULL(@SyncDirection, 'Pull'),
                ISNULL(@SyncEnabled, 1),
                @MatchStrategy,
                ISNULL(@ConflictResolution, 'SourceWins'),
                ISNULL(@Priority, 0),
                ISNULL(@DeleteBehavior, 'SoftDelete'),
                ISNULL(@Status, 'Active'),
                @Configuration
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Company Integration Entity Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spUpdateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @ExternalObjectName nvarchar(500),
    @ExternalObjectLabel nvarchar(500),
    @EntityID uniqueidentifier,
    @SyncDirection nvarchar(50),
    @SyncEnabled bit,
    @MatchStrategy nvarchar(MAX),
    @ConflictResolution nvarchar(50),
    @Priority int,
    @DeleteBehavior nvarchar(50),
    @Status nvarchar(50),
    @Configuration nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
    SET
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [ExternalObjectName] = @ExternalObjectName,
        [ExternalObjectLabel] = @ExternalObjectLabel,
        [EntityID] = @EntityID,
        [SyncDirection] = @SyncDirection,
        [SyncEnabled] = @SyncEnabled,
        [MatchStrategy] = @MatchStrategy,
        [ConflictResolution] = @ConflictResolution,
        [Priority] = @Priority,
        [DeleteBehavior] = @DeleteBehavior,
        [Status] = @Status,
        [Configuration] = @Configuration
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationEntityMaps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationEntityMap table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationEntityMap]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationEntityMap];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationEntityMap
ON [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integration Entity Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationEntityMap] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spDeleteCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationEntityMap]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Company Integration Entity Maps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationEntityMap] TO [cdp_Integration]



/* Index for Foreign Keys for CompanyIntegrationSyncWatermark */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityMapID in table CompanyIntegrationSyncWatermark
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationSyncWatermark_EntityMapID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationSyncWatermark_EntityMapID ON [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] ([EntityMapID]);

/* Base View SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Sync Watermarks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationSyncWatermark
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks]
AS
SELECT
    c.*
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] AS c
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark]
    @ID uniqueidentifier = NULL,
    @EntityMapID uniqueidentifier,
    @Direction nvarchar(50) = NULL,
    @WatermarkType nvarchar(50) = NULL,
    @WatermarkValue nvarchar(MAX),
    @LastSyncAt datetimeoffset,
    @RecordsSynced int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
            (
                [ID],
                [EntityMapID],
                [Direction],
                [WatermarkType],
                [WatermarkValue],
                [LastSyncAt],
                [RecordsSynced]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityMapID,
                ISNULL(@Direction, 'Pull'),
                ISNULL(@WatermarkType, 'Timestamp'),
                @WatermarkValue,
                @LastSyncAt,
                ISNULL(@RecordsSynced, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
            (
                [EntityMapID],
                [Direction],
                [WatermarkType],
                [WatermarkValue],
                [LastSyncAt],
                [RecordsSynced]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityMapID,
                ISNULL(@Direction, 'Pull'),
                ISNULL(@WatermarkType, 'Timestamp'),
                @WatermarkValue,
                @LastSyncAt,
                ISNULL(@RecordsSynced, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Company Integration Sync Watermarks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark]
    @ID uniqueidentifier,
    @EntityMapID uniqueidentifier,
    @Direction nvarchar(50),
    @WatermarkType nvarchar(50),
    @WatermarkValue nvarchar(MAX),
    @LastSyncAt datetimeoffset,
    @RecordsSynced int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
    SET
        [EntityMapID] = @EntityMapID,
        [Direction] = @Direction,
        [WatermarkType] = @WatermarkType,
        [WatermarkValue] = @WatermarkValue,
        [LastSyncAt] = @LastSyncAt,
        [RecordsSynced] = @RecordsSynced
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationSyncWatermarks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationSyncWatermark table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationSyncWatermark]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationSyncWatermark];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationSyncWatermark
ON [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationSyncWatermark] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Company Integration Sync Watermarks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationSyncWatermark] TO [cdp_Integration]



/* Base View SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetails]
AS
SELECT
    c.*,
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationArtifact_ArtifactID.[Name] AS [Artifact],
    MJConversationArtifactVersion_ArtifactVersionID.[ConversationArtifact] AS [ArtifactVersion],
    MJConversationDetail_ParentID.[Message] AS [Parent],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ConversationDetail] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [c].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [c].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationArtifact] AS MJConversationArtifact_ArtifactID
  ON
    [c].[ArtifactID] = MJConversationArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwConversationArtifactVersions] AS MJConversationArtifactVersion_ArtifactVersionID
  ON
    [c].[ArtifactVersionID] = MJConversationArtifactVersion_ArtifactVersionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ParentID
  ON
    [c].[ParentID] = MJConversationDetail_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [c].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [c].[TestRunID] = MJTestRun_TestRunID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnConversationDetailParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetails] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetail]
    @ID uniqueidentifier = NULL,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20) = NULL,
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit = NULL,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint,
    @IsPinned bit = NULL,
    @ParentID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @SuggestedResponses nvarchar(MAX),
    @TestRunID uniqueidentifier,
    @ResponseForm nvarchar(MAX),
    @ActionableCommands nvarchar(MAX),
    @AutomaticCommands nvarchar(MAX),
    @OriginalMessageChanged bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ID],
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationID,
                @ExternalID,
                ISNULL(@Role, user_name()),
                @Message,
                @Error,
                ISNULL(@HiddenToUser, 0),
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                ISNULL(@IsPinned, 0),
                @ParentID,
                @AgentID,
                ISNULL(@Status, 'Complete'),
                @SuggestedResponses,
                @TestRunID,
                @ResponseForm,
                @ActionableCommands,
                @AutomaticCommands,
                ISNULL(@OriginalMessageChanged, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetail]
            (
                [ConversationID],
                [ExternalID],
                [Role],
                [Message],
                [Error],
                [HiddenToUser],
                [UserRating],
                [UserFeedback],
                [ReflectionInsights],
                [SummaryOfEarlierConversation],
                [UserID],
                [ArtifactID],
                [ArtifactVersionID],
                [CompletionTime],
                [IsPinned],
                [ParentID],
                [AgentID],
                [Status],
                [SuggestedResponses],
                [TestRunID],
                [ResponseForm],
                [ActionableCommands],
                [AutomaticCommands],
                [OriginalMessageChanged]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationID,
                @ExternalID,
                ISNULL(@Role, user_name()),
                @Message,
                @Error,
                ISNULL(@HiddenToUser, 0),
                @UserRating,
                @UserFeedback,
                @ReflectionInsights,
                @SummaryOfEarlierConversation,
                @UserID,
                @ArtifactID,
                @ArtifactVersionID,
                @CompletionTime,
                ISNULL(@IsPinned, 0),
                @ParentID,
                @AgentID,
                ISNULL(@Status, 'Complete'),
                @SuggestedResponses,
                @TestRunID,
                @ResponseForm,
                @ActionableCommands,
                @AutomaticCommands,
                ISNULL(@OriginalMessageChanged, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetail]
    @ID uniqueidentifier,
    @ConversationID uniqueidentifier,
    @ExternalID nvarchar(100),
    @Role nvarchar(20),
    @Message nvarchar(MAX),
    @Error nvarchar(MAX),
    @HiddenToUser bit,
    @UserRating int,
    @UserFeedback nvarchar(MAX),
    @ReflectionInsights nvarchar(MAX),
    @SummaryOfEarlierConversation nvarchar(MAX),
    @UserID uniqueidentifier,
    @ArtifactID uniqueidentifier,
    @ArtifactVersionID uniqueidentifier,
    @CompletionTime bigint,
    @IsPinned bit,
    @ParentID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(20),
    @SuggestedResponses nvarchar(MAX),
    @TestRunID uniqueidentifier,
    @ResponseForm nvarchar(MAX),
    @ActionableCommands nvarchar(MAX),
    @AutomaticCommands nvarchar(MAX),
    @OriginalMessageChanged bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        [ConversationID] = @ConversationID,
        [ExternalID] = @ExternalID,
        [Role] = @Role,
        [Message] = @Message,
        [Error] = @Error,
        [HiddenToUser] = @HiddenToUser,
        [UserRating] = @UserRating,
        [UserFeedback] = @UserFeedback,
        [ReflectionInsights] = @ReflectionInsights,
        [SummaryOfEarlierConversation] = @SummaryOfEarlierConversation,
        [UserID] = @UserID,
        [ArtifactID] = @ArtifactID,
        [ArtifactVersionID] = @ArtifactVersionID,
        [CompletionTime] = @CompletionTime,
        [IsPinned] = @IsPinned,
        [ParentID] = @ParentID,
        [AgentID] = @AgentID,
        [Status] = @Status,
        [SuggestedResponses] = @SuggestedResponses,
        [TestRunID] = @TestRunID,
        [ResponseForm] = @ResponseForm,
        [ActionableCommands] = @ActionableCommands,
        [AutomaticCommands] = @AutomaticCommands,
        [OriginalMessageChanged] = @OriginalMessageChanged
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetail
ON [${flyway:defaultSchema}].[ConversationDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* Base View SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: vwCredentialCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Credential Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CredentialCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCredentialCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCredentialCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCredentialCategories]
AS
SELECT
    c.*,
    MJCredentialCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[CredentialCategory] AS c
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialCategory] AS MJCredentialCategory_ParentID
  ON
    [c].[ParentID] = MJCredentialCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnCredentialCategoryParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentialCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: Permissions for vwCredentialCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCredentialCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: spCreateCredentialCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CredentialCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCredentialCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCredentialCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCredentialCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CredentialCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @IconClass
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CredentialCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @IconClass
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCredentialCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredentialCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Credential Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCredentialCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: spUpdateCredentialCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CredentialCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCredentialCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCredentialCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCredentialCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CredentialCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [IconClass] = @IconClass
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCredentialCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCredentialCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredentialCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CredentialCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCredentialCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCredentialCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCredentialCategory
ON [${flyway:defaultSchema}].[CredentialCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CredentialCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CredentialCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Credential Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCredentialCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Credential Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Credential Categories
-- Item: spDeleteCredentialCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CredentialCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCredentialCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCredentialCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCredentialCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CredentialCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredentialCategory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Credential Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCredentialCategory] TO [cdp_Integration]



/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationDetailIDID, @AgentID = @MJAIAgentExamples_SourceConversationDetailID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationDetailID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationDetailID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationDetailID_Comments, @Status = @MJAIAgentExamples_SourceConversationDetailID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor INTO @MJAIAgentExamples_SourceConversationDetailIDID, @MJAIAgentExamples_SourceConversationDetailID_AgentID, @MJAIAgentExamples_SourceConversationDetailID_UserID, @MJAIAgentExamples_SourceConversationDetailID_CompanyID, @MJAIAgentExamples_SourceConversationDetailID_Type, @MJAIAgentExamples_SourceConversationDetailID_ExampleInput, @MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, @MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationID, @MJAIAgentExamples_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationDetailID_SuccessScore, @MJAIAgentExamples_SourceConversationDetailID_Comments, @MJAIAgentExamples_SourceConversationDetailID_Status, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, @MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, @MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, @MJAIAgentExamples_SourceConversationDetailID_AccessCount, @MJAIAgentExamples_SourceConversationDetailID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationDetailIDID, @AgentID = @MJAIAgentNotes_SourceConversationDetailID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationDetailID_Note, @UserID = @MJAIAgentNotes_SourceConversationDetailID_UserID, @Type = @MJAIAgentNotes_SourceConversationDetailID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationDetailID_Comments, @Status = @MJAIAgentNotes_SourceConversationDetailID_Status, @SourceConversationID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor INTO @MJAIAgentNotes_SourceConversationDetailIDID, @MJAIAgentNotes_SourceConversationDetailID_AgentID, @MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationDetailID_Note, @MJAIAgentNotes_SourceConversationDetailID_UserID, @MJAIAgentNotes_SourceConversationDetailID_Type, @MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationDetailID_Comments, @MJAIAgentNotes_SourceConversationDetailID_Status, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationID, @MJAIAgentNotes_SourceConversationDetailID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationDetailID_CompanyID, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, @MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, @MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, @MJAIAgentNotes_SourceConversationDetailID_AccessCount, @MJAIAgentNotes_SourceConversationDetailID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationDetailID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationDetailIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationDetailID_Success bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationDetailID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationDetailID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationDetailID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationDetailID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationDetailID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationDetailID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationDetailID_SecondaryScopes nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationDetailIDID, @AgentID = @MJAIAgentRuns_ConversationDetailID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationDetailID_ParentRunID, @Status = @MJAIAgentRuns_ConversationDetailID_Status, @StartedAt = @MJAIAgentRuns_ConversationDetailID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationDetailID_CompletedAt, @Success = @MJAIAgentRuns_ConversationDetailID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ConversationDetailID_ConversationID, @UserID = @MJAIAgentRuns_ConversationDetailID_UserID, @Result = @MJAIAgentRuns_ConversationDetailID_Result, @AgentState = @MJAIAgentRuns_ConversationDetailID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationDetailID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationDetailID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationDetailID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationDetailID_FinalPayload, @Message = @MJAIAgentRuns_ConversationDetailID_Message, @LastRunID = @MJAIAgentRuns_ConversationDetailID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationDetailID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationDetailID_Data, @Verbose = @MJAIAgentRuns_ConversationDetailID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationDetailID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationDetailID_RunName, @Comments = @MJAIAgentRuns_ConversationDetailID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationDetailID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationDetailID_SecondaryScopes

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationDetailID_cursor INTO @MJAIAgentRuns_ConversationDetailIDID, @MJAIAgentRuns_ConversationDetailID_AgentID, @MJAIAgentRuns_ConversationDetailID_ParentRunID, @MJAIAgentRuns_ConversationDetailID_Status, @MJAIAgentRuns_ConversationDetailID_StartedAt, @MJAIAgentRuns_ConversationDetailID_CompletedAt, @MJAIAgentRuns_ConversationDetailID_Success, @MJAIAgentRuns_ConversationDetailID_ErrorMessage, @MJAIAgentRuns_ConversationDetailID_ConversationID, @MJAIAgentRuns_ConversationDetailID_UserID, @MJAIAgentRuns_ConversationDetailID_Result, @MJAIAgentRuns_ConversationDetailID_AgentState, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCost, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationDetailID_TotalCostRollup, @MJAIAgentRuns_ConversationDetailID_ConversationDetailID, @MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, @MJAIAgentRuns_ConversationDetailID_CancellationReason, @MJAIAgentRuns_ConversationDetailID_FinalStep, @MJAIAgentRuns_ConversationDetailID_FinalPayload, @MJAIAgentRuns_ConversationDetailID_Message, @MJAIAgentRuns_ConversationDetailID_LastRunID, @MJAIAgentRuns_ConversationDetailID_StartingPayload, @MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, @MJAIAgentRuns_ConversationDetailID_ConfigurationID, @MJAIAgentRuns_ConversationDetailID_OverrideModelID, @MJAIAgentRuns_ConversationDetailID_OverrideVendorID, @MJAIAgentRuns_ConversationDetailID_Data, @MJAIAgentRuns_ConversationDetailID_Verbose, @MJAIAgentRuns_ConversationDetailID_EffortLevel, @MJAIAgentRuns_ConversationDetailID_RunName, @MJAIAgentRuns_ConversationDetailID_Comments, @MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, @MJAIAgentRuns_ConversationDetailID_TestRunID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationDetailID_SecondaryScopes
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJConversationDetailArtifacts_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJConversationDetailArtifacts_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor INTO @MJConversationDetailArtifacts_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailArtifacts_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJConversationDetailAttachments_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJConversationDetailAttachments_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor INTO @MJConversationDetailAttachments_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailAttachments_ConversationDetailID_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJConversationDetailRatings_ConversationDetailIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJConversationDetailRatings_ConversationDetailIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor INTO @MJConversationDetailRatings_ConversationDetailIDID
    END
    
    CLOSE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    DEALLOCATE cascade_delete_MJConversationDetailRatings_ConversationDetailID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_ParentIDID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_ParentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_HiddenToUser bit
    DECLARE @MJConversationDetails_ParentID_UserRating int
    DECLARE @MJConversationDetails_ParentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_CompletionTime bigint
    DECLARE @MJConversationDetails_ParentID_IsPinned bit
    DECLARE @MJConversationDetails_ParentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_ParentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_ParentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_ParentID_OriginalMessageChanged bit
    DECLARE cascade_update_MJConversationDetails_ParentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJConversationDetails_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_ParentIDID, @ConversationID = @MJConversationDetails_ParentID_ConversationID, @ExternalID = @MJConversationDetails_ParentID_ExternalID, @Role = @MJConversationDetails_ParentID_Role, @Message = @MJConversationDetails_ParentID_Message, @Error = @MJConversationDetails_ParentID_Error, @HiddenToUser = @MJConversationDetails_ParentID_HiddenToUser, @UserRating = @MJConversationDetails_ParentID_UserRating, @UserFeedback = @MJConversationDetails_ParentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_ParentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_ParentID_UserID, @ArtifactID = @MJConversationDetails_ParentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_ParentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_ParentID_CompletionTime, @IsPinned = @MJConversationDetails_ParentID_IsPinned, @ParentID = @MJConversationDetails_ParentID_ParentID, @AgentID = @MJConversationDetails_ParentID_AgentID, @Status = @MJConversationDetails_ParentID_Status, @SuggestedResponses = @MJConversationDetails_ParentID_SuggestedResponses, @TestRunID = @MJConversationDetails_ParentID_TestRunID, @ResponseForm = @MJConversationDetails_ParentID_ResponseForm, @ActionableCommands = @MJConversationDetails_ParentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_ParentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_ParentID_OriginalMessageChanged

        FETCH NEXT FROM cascade_update_MJConversationDetails_ParentID_cursor INTO @MJConversationDetails_ParentIDID, @MJConversationDetails_ParentID_ConversationID, @MJConversationDetails_ParentID_ExternalID, @MJConversationDetails_ParentID_Role, @MJConversationDetails_ParentID_Message, @MJConversationDetails_ParentID_Error, @MJConversationDetails_ParentID_HiddenToUser, @MJConversationDetails_ParentID_UserRating, @MJConversationDetails_ParentID_UserFeedback, @MJConversationDetails_ParentID_ReflectionInsights, @MJConversationDetails_ParentID_SummaryOfEarlierConversation, @MJConversationDetails_ParentID_UserID, @MJConversationDetails_ParentID_ArtifactID, @MJConversationDetails_ParentID_ArtifactVersionID, @MJConversationDetails_ParentID_CompletionTime, @MJConversationDetails_ParentID_IsPinned, @MJConversationDetails_ParentID_ParentID, @MJConversationDetails_ParentID_AgentID, @MJConversationDetails_ParentID_Status, @MJConversationDetails_ParentID_SuggestedResponses, @MJConversationDetails_ParentID_TestRunID, @MJConversationDetails_ParentID_ResponseForm, @MJConversationDetails_ParentID_ActionableCommands, @MJConversationDetails_ParentID_AutomaticCommands, @MJConversationDetails_ParentID_OriginalMessageChanged
    END

    CLOSE cascade_update_MJConversationDetails_ParentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_ParentID_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @MJReports_ConversationDetailIDID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_CategoryID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_SharingScope nvarchar(20)
    DECLARE @MJReports_ConversationDetailID_ConversationID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_DataContextID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Configuration nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_OutputTriggerTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFormatTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputDeliveryTypeID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_OutputFrequency nvarchar(50)
    DECLARE @MJReports_ConversationDetailID_OutputTargetEmail nvarchar(255)
    DECLARE @MJReports_ConversationDetailID_OutputWorkflowID uniqueidentifier
    DECLARE @MJReports_ConversationDetailID_Thumbnail nvarchar(MAX)
    DECLARE @MJReports_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJReports_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJReports_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJReports_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @MJReports_ConversationDetailIDID, @Name = @MJReports_ConversationDetailID_Name, @Description = @MJReports_ConversationDetailID_Description, @CategoryID = @MJReports_ConversationDetailID_CategoryID, @UserID = @MJReports_ConversationDetailID_UserID, @SharingScope = @MJReports_ConversationDetailID_SharingScope, @ConversationID = @MJReports_ConversationDetailID_ConversationID, @ConversationDetailID = @MJReports_ConversationDetailID_ConversationDetailID, @DataContextID = @MJReports_ConversationDetailID_DataContextID, @Configuration = @MJReports_ConversationDetailID_Configuration, @OutputTriggerTypeID = @MJReports_ConversationDetailID_OutputTriggerTypeID, @OutputFormatTypeID = @MJReports_ConversationDetailID_OutputFormatTypeID, @OutputDeliveryTypeID = @MJReports_ConversationDetailID_OutputDeliveryTypeID, @OutputFrequency = @MJReports_ConversationDetailID_OutputFrequency, @OutputTargetEmail = @MJReports_ConversationDetailID_OutputTargetEmail, @OutputWorkflowID = @MJReports_ConversationDetailID_OutputWorkflowID, @Thumbnail = @MJReports_ConversationDetailID_Thumbnail, @EnvironmentID = @MJReports_ConversationDetailID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJReports_ConversationDetailID_cursor INTO @MJReports_ConversationDetailIDID, @MJReports_ConversationDetailID_Name, @MJReports_ConversationDetailID_Description, @MJReports_ConversationDetailID_CategoryID, @MJReports_ConversationDetailID_UserID, @MJReports_ConversationDetailID_SharingScope, @MJReports_ConversationDetailID_ConversationID, @MJReports_ConversationDetailID_ConversationDetailID, @MJReports_ConversationDetailID_DataContextID, @MJReports_ConversationDetailID_Configuration, @MJReports_ConversationDetailID_OutputTriggerTypeID, @MJReports_ConversationDetailID_OutputFormatTypeID, @MJReports_ConversationDetailID_OutputDeliveryTypeID, @MJReports_ConversationDetailID_OutputFrequency, @MJReports_ConversationDetailID_OutputTargetEmail, @MJReports_ConversationDetailID_OutputWorkflowID, @MJReports_ConversationDetailID_Thumbnail, @MJReports_ConversationDetailID_EnvironmentID
    END

    CLOSE cascade_update_MJReports_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJReports_ConversationDetailID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_ConversationDetailIDID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ParentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Name nvarchar(255)
    DECLARE @MJTasks_ConversationDetailID_Description nvarchar(MAX)
    DECLARE @MJTasks_ConversationDetailID_TypeID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ProjectID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_UserID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_AgentID uniqueidentifier
    DECLARE @MJTasks_ConversationDetailID_Status nvarchar(50)
    DECLARE @MJTasks_ConversationDetailID_PercentComplete int
    DECLARE @MJTasks_ConversationDetailID_DueAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_StartedAt datetimeoffset
    DECLARE @MJTasks_ConversationDetailID_CompletedAt datetimeoffset
    DECLARE cascade_update_MJTasks_ConversationDetailID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID

    OPEN cascade_update_MJTasks_ConversationDetailID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_ConversationDetailID_ConversationDetailID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_ConversationDetailIDID, @ParentID = @MJTasks_ConversationDetailID_ParentID, @Name = @MJTasks_ConversationDetailID_Name, @Description = @MJTasks_ConversationDetailID_Description, @TypeID = @MJTasks_ConversationDetailID_TypeID, @EnvironmentID = @MJTasks_ConversationDetailID_EnvironmentID, @ProjectID = @MJTasks_ConversationDetailID_ProjectID, @ConversationDetailID = @MJTasks_ConversationDetailID_ConversationDetailID, @UserID = @MJTasks_ConversationDetailID_UserID, @AgentID = @MJTasks_ConversationDetailID_AgentID, @Status = @MJTasks_ConversationDetailID_Status, @PercentComplete = @MJTasks_ConversationDetailID_PercentComplete, @DueAt = @MJTasks_ConversationDetailID_DueAt, @StartedAt = @MJTasks_ConversationDetailID_StartedAt, @CompletedAt = @MJTasks_ConversationDetailID_CompletedAt

        FETCH NEXT FROM cascade_update_MJTasks_ConversationDetailID_cursor INTO @MJTasks_ConversationDetailIDID, @MJTasks_ConversationDetailID_ParentID, @MJTasks_ConversationDetailID_Name, @MJTasks_ConversationDetailID_Description, @MJTasks_ConversationDetailID_TypeID, @MJTasks_ConversationDetailID_EnvironmentID, @MJTasks_ConversationDetailID_ProjectID, @MJTasks_ConversationDetailID_ConversationDetailID, @MJTasks_ConversationDetailID_UserID, @MJTasks_ConversationDetailID_AgentID, @MJTasks_ConversationDetailID_Status, @MJTasks_ConversationDetailID_PercentComplete, @MJTasks_ConversationDetailID_DueAt, @MJTasks_ConversationDetailID_StartedAt, @MJTasks_ConversationDetailID_CompletedAt
    END

    CLOSE cascade_update_MJTasks_ConversationDetailID_cursor
    DEALLOCATE cascade_update_MJTasks_ConversationDetailID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* Base View SQL for MJ: Dashboard Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Categories
-- Item: vwDashboardCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dashboard Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DashboardCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDashboardCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDashboardCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboardCategories]
AS
SELECT
    d.*,
    MJDashboardCategory_ParentID.[Name] AS [Parent],
    MJUser_UserID.[Name] AS [User],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[DashboardCategory] AS d
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS MJDashboardCategory_ParentID
  ON
    [d].[ParentID] = MJDashboardCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [d].[UserID] = MJUser_UserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnDashboardCategoryParentID_GetRootID]([d].[ID], [d].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardCategories] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for MJ: Dashboard Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Categories
-- Item: Permissions for vwDashboardCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardCategories] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Dashboard Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Categories
-- Item: spCreateDashboardCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DashboardCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDashboardCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DashboardCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DashboardCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboardCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardCategory] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* spCreate Permissions for MJ: Dashboard Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardCategory] TO [cdp_Developer], [cdp_Integration], [cdp_UI]



/* spUpdate SQL for MJ: Dashboard Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Categories
-- Item: spUpdateDashboardCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DashboardCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDashboardCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDashboardCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboardCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardCategory] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DashboardCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDashboardCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDashboardCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboardCategory
ON [${flyway:defaultSchema}].[DashboardCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DashboardCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Dashboard Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardCategory] TO [cdp_Developer], [cdp_Integration], [cdp_UI]



/* spDelete SQL for MJ: Dashboard Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Categories
-- Item: spDeleteDashboardCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDashboardCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DashboardCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardCategory] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* spDelete Permissions for MJ: Dashboard Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardCategory] TO [cdp_Developer], [cdp_Integration], [cdp_UI]



/* Base View SQL for MJ: File Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Categories
-- Item: vwFileCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: File Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FileCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFileCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFileCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFileCategories]
AS
SELECT
    f.*,
    MJFileCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[FileCategory] AS f
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileCategory] AS MJFileCategory_ParentID
  ON
    [f].[ParentID] = MJFileCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnFileCategoryParentID_GetRootID]([f].[ID], [f].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFileCategories] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* Base View Permissions SQL for MJ: File Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Categories
-- Item: Permissions for vwFileCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFileCategories] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: File Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Categories
-- Item: spCreateFileCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFileCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFileCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFileCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FileCategory]
            (
                [ID],
                [Name],
                [ParentID],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentID,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FileCategory]
            (
                [Name],
                [ParentID],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFileCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileCategory] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: File Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileCategory] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: File Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Categories
-- Item: spUpdateFileCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFileCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFileCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFileCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileCategory]
    SET
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFileCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFileCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileCategory] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FileCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFileCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFileCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFileCategory
ON [${flyway:defaultSchema}].[FileCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FileCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: File Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileCategory] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: File Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Categories
-- Item: spDeleteFileCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFileCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFileCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFileCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FileCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileCategory] TO [cdp_UI], [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for MJ: File Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileCategory] TO [cdp_UI], [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for IntegrationSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Source Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  IntegrationSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrationSourceTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrationSourceTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrationSourceTypes]
AS
SELECT
    i.*
FROM
    [${flyway:defaultSchema}].[IntegrationSourceType] AS i
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Permissions for vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrationSourceTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spCreateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegrationSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegrationSourceType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(500),
    @IconClass nvarchar(200),
    @Status nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[IntegrationSourceType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                @IconClass,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[IntegrationSourceType]
            (
                [Name],
                [Description],
                [DriverClass],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                @IconClass,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrationSourceTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Integration Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spUpdateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegrationSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegrationSourceType]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(500),
    @IconClass nvarchar(200),
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationSourceType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [IconClass] = @IconClass,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrationSourceTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrationSourceTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the IntegrationSourceType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegrationSourceType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegrationSourceType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegrationSourceType
ON [${flyway:defaultSchema}].[IntegrationSourceType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[IntegrationSourceType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[IntegrationSourceType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Integration Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegrationSourceType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spDeleteIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegrationSourceType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationSourceType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegrationSourceType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[IntegrationSourceType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationSourceType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Integration Source Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegrationSourceType] TO [cdp_Integration]



/* Base View SQL for MJ: Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Generated Code Categories
-- Item: vwGeneratedCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Generated Code Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GeneratedCodeCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGeneratedCodeCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGeneratedCodeCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
AS
SELECT
    g.*,
    MJGeneratedCodeCategory_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS g
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[GeneratedCodeCategory] AS MJGeneratedCodeCategory_ParentID
  ON
    [g].[ParentID] = MJGeneratedCodeCategory_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnGeneratedCodeCategoryParentID_GetRootID]([g].[ID], [g].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Generated Code Categories
-- Item: Permissions for vwGeneratedCodeCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGeneratedCodeCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Generated Code Categories
-- Item: spCreateGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGeneratedCodeCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GeneratedCodeCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GeneratedCodeCategory]
            (
                [Name],
                [Description],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Generated Code Categories
-- Item: spUpdateGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGeneratedCodeCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GeneratedCodeCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGeneratedCodeCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGeneratedCodeCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGeneratedCodeCategory
ON [${flyway:defaultSchema}].[GeneratedCodeCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GeneratedCodeCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGeneratedCodeCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Generated Code Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Generated Code Categories
-- Item: spDeleteGeneratedCodeCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GeneratedCodeCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GeneratedCodeCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Generated Code Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGeneratedCodeCategory] TO [cdp_Integration]



/* Base View SQL for MJ: List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Categories
-- Item: vwListCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: List Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ListCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwListCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwListCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwListCategories]
AS
SELECT
    l.*,
    MJListCategory_ParentID.[Name] AS [Parent],
    MJUser_UserID.[Name] AS [User],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ListCategory] AS l
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ListCategory] AS MJListCategory_ParentID
  ON
    [l].[ParentID] = MJListCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [l].[UserID] = MJUser_UserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnListCategoryParentID_GetRootID]([l].[ID], [l].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwListCategories] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for MJ: List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Categories
-- Item: Permissions for vwListCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwListCategories] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Categories
-- Item: spCreateListCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ListCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateListCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateListCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateListCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ListCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ListCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwListCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: List Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Categories
-- Item: spUpdateListCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ListCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateListCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateListCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateListCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwListCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwListCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ListCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateListCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateListCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateListCategory
ON [${flyway:defaultSchema}].[ListCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ListCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ListCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: List Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListCategory] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: List Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: List Categories
-- Item: spDeleteListCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ListCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteListCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteListCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteListCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ListCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListCategory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: List Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListCategory] TO [cdp_Integration]



/* Base View SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Projects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Project
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProjects]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProjects];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProjects]
AS
SELECT
    p.*,
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJProject_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Project] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [p].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS MJProject_ParentID
  ON
    [p].[ParentID] = MJProject_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnProjectParentID_GetRootID]([p].[ID], [p].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: Permissions for vwProjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spCreateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Project
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProject]
    @ID uniqueidentifier = NULL,
    @EnvironmentID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Color nvarchar(7),
    @Icon nvarchar(50),
    @IsArchived bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [ID],
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ParentID,
                @Name,
                @Description,
                @Color,
                @Icon,
                ISNULL(@IsArchived, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Project]
            (
                [EnvironmentID],
                [ParentID],
                [Name],
                [Description],
                [Color],
                [Icon],
                [IsArchived]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ParentID,
                @Name,
                @Description,
                @Color,
                @Icon,
                ISNULL(@IsArchived, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProject] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spUpdateProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Project
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProject]
    @ID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Color nvarchar(7),
    @Icon nvarchar(50),
    @IsArchived bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        [EnvironmentID] = @EnvironmentID,
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Color] = @Color,
        [Icon] = @Icon,
        [IsArchived] = @IsArchived
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Project table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProject]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProject];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProject
ON [${flyway:defaultSchema}].[Project]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Project]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Project] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProject] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Projects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Projects
-- Item: spDeleteProject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Project
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Project]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Projects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProject] TO [cdp_Integration]



/* Base View SQL for MJ: Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Categories
-- Item: vwQueryCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwQueryCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwQueryCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryCategories]
AS
SELECT
    q.*,
    MJQueryCategory_ParentID.[Name] AS [Parent],
    MJUser_UserID.[Name] AS [User],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[QueryCategory] AS q
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[QueryCategory] AS MJQueryCategory_ParentID
  ON
    [q].[ParentID] = MJQueryCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [q].[UserID] = MJUser_UserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnQueryCategoryParentID_GetRootID]([q].[ID], [q].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryCategories] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for MJ: Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Categories
-- Item: Permissions for vwQueryCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryCategories] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for MJ: Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Categories
-- Item: spCreateQueryCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueryCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueryCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @DefaultCacheEnabled bit = NULL,
    @DefaultCacheTTLMinutes int,
    @DefaultCacheMaxSize int,
    @CacheInheritanceEnabled bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueryCategory]
            (
                [ID],
                [Name],
                [ParentID],
                [Description],
                [UserID],
                [DefaultCacheEnabled],
                [DefaultCacheTTLMinutes],
                [DefaultCacheMaxSize],
                [CacheInheritanceEnabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentID,
                @Description,
                @UserID,
                ISNULL(@DefaultCacheEnabled, 0),
                @DefaultCacheTTLMinutes,
                @DefaultCacheMaxSize,
                ISNULL(@CacheInheritanceEnabled, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueryCategory]
            (
                [Name],
                [ParentID],
                [Description],
                [UserID],
                [DefaultCacheEnabled],
                [DefaultCacheTTLMinutes],
                [DefaultCacheMaxSize],
                [CacheInheritanceEnabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID,
                @Description,
                @UserID,
                ISNULL(@DefaultCacheEnabled, 0),
                @DefaultCacheTTLMinutes,
                @DefaultCacheMaxSize,
                ISNULL(@CacheInheritanceEnabled, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryCategory] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Query Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryCategory] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Categories
-- Item: spUpdateQueryCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueryCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryCategory]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @DefaultCacheEnabled bit,
    @DefaultCacheTTLMinutes int,
    @DefaultCacheMaxSize int,
    @CacheInheritanceEnabled bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryCategory]
    SET
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description,
        [UserID] = @UserID,
        [DefaultCacheEnabled] = @DefaultCacheEnabled,
        [DefaultCacheTTLMinutes] = @DefaultCacheTTLMinutes,
        [DefaultCacheMaxSize] = @DefaultCacheMaxSize,
        [CacheInheritanceEnabled] = @CacheInheritanceEnabled
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwQueryCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueryCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueryCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryCategory
ON [${flyway:defaultSchema}].[QueryCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Query Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for MJ: Query Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Query Categories
-- Item: spDeleteQueryCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteQueryCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for MJ: Query Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Base View SQL for MJ: Report Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Categories
-- Item: vwReportCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Report Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ReportCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwReportCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwReportCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReportCategories]
AS
SELECT
    r.*,
    MJReportCategory_ParentID.[Name] AS [Parent],
    MJUser_UserID.[Name] AS [User],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[ReportCategory] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ReportCategory] AS MJReportCategory_ParentID
  ON
    [r].[ParentID] = MJReportCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [r].[UserID] = MJUser_UserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnReportCategoryParentID_GetRootID]([r].[ID], [r].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReportCategories] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for MJ: Report Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Categories
-- Item: Permissions for vwReportCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReportCategories] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for MJ: Report Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Categories
-- Item: spCreateReportCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ReportCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateReportCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateReportCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReportCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ReportCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ReportCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReportCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportCategory] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Report Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReportCategory] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Report Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Categories
-- Item: spUpdateReportCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ReportCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateReportCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateReportCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReportCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwReportCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReportCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ReportCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateReportCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateReportCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReportCategory
ON [${flyway:defaultSchema}].[ReportCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ReportCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ReportCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Report Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReportCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for MJ: Report Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Report Categories
-- Item: spDeleteReportCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ReportCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteReportCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteReportCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReportCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ReportCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spDelete Permissions for MJ: Report Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReportCategory] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Base View SQL for MJ: Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Skills
-- Item: vwSkills
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Skills
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Skill
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSkills]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSkills];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSkills]
AS
SELECT
    s.*,
    MJSkill_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Skill] AS s
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Skill] AS MJSkill_ParentID
  ON
    [s].[ParentID] = MJSkill_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnSkillParentID_GetRootID]([s].[ID], [s].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSkills] TO [cdp_Developer], [cdp_Integration], [cdp_UI]
    

/* Base View Permissions SQL for MJ: Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Skills
-- Item: Permissions for vwSkills
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSkills] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Skills
-- Item: spCreateSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Skill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSkill]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Skill]
            (
                [ID],
                [Name],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Skill]
            (
                [Name],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSkills] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSkill] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Skills */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSkill] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Skills
-- Item: spUpdateSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Skill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSkill]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Skill]
    SET
        [Name] = @Name,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSkills] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSkills]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSkill] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Skill table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSkill]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSkill];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSkill
ON [${flyway:defaultSchema}].[Skill]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Skill]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Skill] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Skills */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSkill] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Skills */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Skills
-- Item: spDeleteSkill
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Skill
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSkill]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSkill];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSkill]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Skill]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSkill] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Skills */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSkill] TO [cdp_Developer], [cdp_Integration]



/* Base View SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: vwTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tags
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Tag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTags]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTags];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTags]
AS
SELECT
    t.*,
    MJTag_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Tag] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Tag] AS MJTag_ParentID
  ON
    [t].[ParentID] = MJTag_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnTagParentID_GetRootID]([t].[ID], [t].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTags] TO [cdp_UI]
    

/* Base View Permissions SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: Permissions for vwTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTags] TO [cdp_UI]

/* spCreate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spCreateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTag]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Tag]
            (
                [ID],
                [Name],
                [ParentID],
                [DisplayName],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ParentID,
                @DisplayName,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Tag]
            (
                [Name],
                [ParentID],
                [DisplayName],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ParentID,
                @DisplayName,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTag] TO [cdp_UI]
    

/* spCreate Permissions for MJ: Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTag] TO [cdp_UI]



/* spUpdate SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spUpdateTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTag]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Tag]
    SET
        [Name] = @Name,
        [ParentID] = @ParentID,
        [DisplayName] = @DisplayName,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTag] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tag table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTag]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTag];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTag
ON [${flyway:defaultSchema}].[Tag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Tag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Tag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTag] TO [cdp_UI]



/* spDelete SQL for MJ: Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tags
-- Item: spDeleteTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tag
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTag]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTag];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Tag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTag] TO [cdp_UI]
    

/* spDelete Permissions for MJ: Tags */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTag] TO [cdp_UI]



/* Base View SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tasks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Task
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTasks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTasks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTasks]
AS
SELECT
    t.*,
    MJTask_ParentID.[Name] AS [Parent],
    MJTaskType_TypeID.[Name] AS [Type],
    MJEnvironment_EnvironmentID.[Name] AS [Environment],
    MJProject_ProjectID.[Name] AS [Project],
    MJConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    MJUser_UserID.[Name] AS [User],
    MJAIAgent_AgentID.[Name] AS [Agent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[Task] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Task] AS MJTask_ParentID
  ON
    [t].[ParentID] = MJTask_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[TaskType] AS MJTaskType_TypeID
  ON
    [t].[TypeID] = MJTaskType_TypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Environment] AS MJEnvironment_EnvironmentID
  ON
    [t].[EnvironmentID] = MJEnvironment_EnvironmentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Project] AS MJProject_ProjectID
  ON
    [t].[ProjectID] = MJProject_ProjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [t].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [t].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [t].[AgentID] = MJAIAgent_AgentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnTaskParentID_GetRootID]([t].[ID], [t].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Permissions for vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spCreateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTask]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @EnvironmentID uniqueidentifier = NULL,
    @ProjectID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @UserID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @PercentComplete int,
    @DueAt datetimeoffset,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ID],
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @Description,
                @TypeID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ProjectID,
                @ConversationDetailID,
                @UserID,
                @AgentID,
                ISNULL(@Status, 'Pending'),
                @PercentComplete,
                @DueAt,
                @StartedAt,
                @CompletedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Task]
            (
                [ParentID],
                [Name],
                [Description],
                [TypeID],
                [EnvironmentID],
                [ProjectID],
                [ConversationDetailID],
                [UserID],
                [AgentID],
                [Status],
                [PercentComplete],
                [DueAt],
                [StartedAt],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @Description,
                @TypeID,
                CASE @EnvironmentID WHEN '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE ISNULL(@EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                @ProjectID,
                @ConversationDetailID,
                @UserID,
                @AgentID,
                ISNULL(@Status, 'Pending'),
                @PercentComplete,
                @DueAt,
                @StartedAt,
                @CompletedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTask] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spUpdateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTask]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @EnvironmentID uniqueidentifier,
    @ProjectID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @UserID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Status nvarchar(50),
    @PercentComplete int,
    @DueAt datetimeoffset,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [TypeID] = @TypeID,
        [EnvironmentID] = @EnvironmentID,
        [ProjectID] = @ProjectID,
        [ConversationDetailID] = @ConversationDetailID,
        [UserID] = @UserID,
        [AgentID] = @AgentID,
        [Status] = @Status,
        [PercentComplete] = @PercentComplete,
        [DueAt] = @DueAt,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Task table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTask]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTask];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTask
ON [${flyway:defaultSchema}].[Task]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Task]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Task] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTask] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spDeleteTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Task
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTask]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Task]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTask] TO [cdp_Integration]



/* Base View SQL for MJ: Template Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Categories
-- Item: vwTemplateCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Template Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TemplateCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTemplateCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTemplateCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTemplateCategories]
AS
SELECT
    t.*,
    MJTemplateCategory_ParentID.[Name] AS [Parent],
    MJUser_UserID.[Name] AS [User],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[TemplateCategory] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[TemplateCategory] AS MJTemplateCategory_ParentID
  ON
    [t].[ParentID] = MJTemplateCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [t].[UserID] = MJUser_UserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnTemplateCategoryParentID_GetRootID]([t].[ID], [t].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplateCategories] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for MJ: Template Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Categories
-- Item: Permissions for vwTemplateCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTemplateCategories] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for MJ: Template Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Categories
-- Item: spCreateTemplateCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TemplateCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTemplateCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTemplateCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTemplateCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TemplateCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TemplateCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTemplateCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplateCategory] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Template Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTemplateCategory] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Template Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Categories
-- Item: spUpdateTemplateCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TemplateCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTemplateCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTemplateCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTemplateCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TemplateCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTemplateCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTemplateCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplateCategory] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TemplateCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTemplateCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTemplateCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTemplateCategory
ON [${flyway:defaultSchema}].[TemplateCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TemplateCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TemplateCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Template Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTemplateCategory] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Template Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Template Categories
-- Item: spDeleteTemplateCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TemplateCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTemplateCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTemplateCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTemplateCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TemplateCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplateCategory] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Template Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTemplateCategory] TO [cdp_Integration]



/* Base View SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: vwTestSuites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Suites
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TestSuite
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwTestSuites]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwTestSuites];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwTestSuites]
AS
SELECT
    t.*,
    MJTestSuite_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[TestSuite] AS t
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[TestSuite] AS MJTestSuite_ParentID
  ON
    [t].[ParentID] = MJTestSuite_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnTestSuiteParentID_GetRootID]([t].[ID], [t].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: Permissions for vwTestSuites
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwTestSuites] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: spCreateTestSuite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestSuite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestSuite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestSuite]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @Tags nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @MaxExecutionTimeMS int,
    @Variables nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestSuite]
            (
                [ID],
                [ParentID],
                [Name],
                [Description],
                [Status],
                [Tags],
                [Configuration],
                [MaxExecutionTimeMS],
                [Variables]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                @Tags,
                @Configuration,
                @MaxExecutionTimeMS,
                @Variables
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestSuite]
            (
                [ParentID],
                [Name],
                [Description],
                [Status],
                [Tags],
                [Configuration],
                [MaxExecutionTimeMS],
                [Variables]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @Description,
                ISNULL(@Status, 'Active'),
                @Tags,
                @Configuration,
                @MaxExecutionTimeMS,
                @Variables
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwTestSuites] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuite] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Test Suites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestSuite] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: spUpdateTestSuite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestSuite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestSuite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestSuite]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @Status nvarchar(20),
    @Tags nvarchar(MAX),
    @Configuration nvarchar(MAX),
    @MaxExecutionTimeMS int,
    @Variables nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuite]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [Status] = @Status,
        [Tags] = @Tags,
        [Configuration] = @Configuration,
        [MaxExecutionTimeMS] = @MaxExecutionTimeMS,
        [Variables] = @Variables
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwTestSuites] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwTestSuites]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuite] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestSuite table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestSuite]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestSuite];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestSuite
ON [${flyway:defaultSchema}].[TestSuite]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestSuite]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestSuite] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Test Suites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestSuite] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Test Suites */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Suites
-- Item: spDeleteTestSuite
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TestSuite
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTestSuite]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuite];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTestSuite]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[TestSuite]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuite] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Test Suites */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTestSuite] TO [cdp_Integration]



/* Base View SQL for MJ: User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Categories
-- Item: vwUserViewCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User View Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserViewCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserViewCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserViewCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserViewCategories]
AS
SELECT
    u.*,
    MJUserViewCategory_ParentID.[Name] AS [Parent],
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_UserID.[Name] AS [User],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[UserViewCategory] AS u
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserViewCategory] AS MJUserViewCategory_ParentID
  ON
    [u].[ParentID] = MJUserViewCategory_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [u].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [u].[UserID] = MJUser_UserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnUserViewCategoryParentID_GetRootID]([u].[ID], [u].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Categories
-- Item: Permissions for vwUserViewCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViewCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Categories
-- Item: spCreateUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserViewCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserViewCategory]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserViewCategory]
            (
                [ID],
                [Name],
                [Description],
                [ParentID],
                [EntityID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentID,
                @EntityID,
                @UserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserViewCategory]
            (
                [Name],
                [Description],
                [ParentID],
                [EntityID],
                [UserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentID,
                @EntityID,
                @UserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViewCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewCategory] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserViewCategory] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Categories
-- Item: spUpdateUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserViewCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserViewCategory]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @ParentID uniqueidentifier,
    @EntityID uniqueidentifier,
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewCategory]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentID] = @ParentID,
        [EntityID] = @EntityID,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserViewCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViewCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserViewCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserViewCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserViewCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserViewCategory
ON [${flyway:defaultSchema}].[UserViewCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserViewCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserViewCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: User View Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User View Categories
-- Item: spDeleteUserViewCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserViewCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserViewCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserViewCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserViewCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: User View Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserViewCategory] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/* Base View SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: vwVersionLabels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Version Labels
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VersionLabel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVersionLabels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVersionLabels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVersionLabels]
AS
SELECT
    v.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJVersionLabel_ParentID.[Name] AS [Parent],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[VersionLabel] AS v
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [v].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VersionLabel] AS MJVersionLabel_ParentID
  ON
    [v].[ParentID] = MJVersionLabel_ParentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [v].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnVersionLabelParentID_GetRootID]([v].[ID], [v].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: Permissions for vwVersionLabels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVersionLabels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: spCreateVersionLabel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VersionLabel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVersionLabel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVersionLabel]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Scope nvarchar(50) = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @ParentID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @CreatedByUserID uniqueidentifier,
    @ExternalSystemID nvarchar(200),
    @ItemCount int = NULL,
    @CreationDurationMS int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VersionLabel]
            (
                [ID],
                [Name],
                [Description],
                [Scope],
                [EntityID],
                [RecordID],
                [ParentID],
                [Status],
                [CreatedByUserID],
                [ExternalSystemID],
                [ItemCount],
                [CreationDurationMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@Scope, 'Record'),
                @EntityID,
                @RecordID,
                @ParentID,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @ExternalSystemID,
                ISNULL(@ItemCount, 0),
                ISNULL(@CreationDurationMS, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VersionLabel]
            (
                [Name],
                [Description],
                [Scope],
                [EntityID],
                [RecordID],
                [ParentID],
                [Status],
                [CreatedByUserID],
                [ExternalSystemID],
                [ItemCount],
                [CreationDurationMS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@Scope, 'Record'),
                @EntityID,
                @RecordID,
                @ParentID,
                ISNULL(@Status, 'Active'),
                @CreatedByUserID,
                @ExternalSystemID,
                ISNULL(@ItemCount, 0),
                ISNULL(@CreationDurationMS, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVersionLabels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabel] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Version Labels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVersionLabel] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: spUpdateVersionLabel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VersionLabel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVersionLabel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVersionLabel]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Scope nvarchar(50),
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @ParentID uniqueidentifier,
    @Status nvarchar(50),
    @CreatedByUserID uniqueidentifier,
    @ExternalSystemID nvarchar(200),
    @ItemCount int,
    @CreationDurationMS int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabel]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Scope] = @Scope,
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [ParentID] = @ParentID,
        [Status] = @Status,
        [CreatedByUserID] = @CreatedByUserID,
        [ExternalSystemID] = @ExternalSystemID,
        [ItemCount] = @ItemCount,
        [CreationDurationMS] = @CreationDurationMS
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVersionLabels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVersionLabels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VersionLabel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVersionLabel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVersionLabel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVersionLabel
ON [${flyway:defaultSchema}].[VersionLabel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VersionLabel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VersionLabel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Version Labels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVersionLabel] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Version Labels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Version Labels
-- Item: spDeleteVersionLabel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VersionLabel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVersionLabel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVersionLabel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VersionLabel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabel] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Version Labels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVersionLabel] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '94db5296-4b37-4b06-b146-63bea8f3b345'  OR 
               (EntityID = '49770E19-D6D0-485D-A03F-01C39FDFB6D1' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '94db5296-4b37-4b06-b146-63bea8f3b345',
            '49770E19-D6D0-485D-A03F-01C39FDFB6D1', -- Entity: MJ: Generated Code Categories
            100015,
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
         WHERE ID = 'dfc7618d-2dd0-4dbe-9924-ff41caa8a0e7'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'RootParentRunID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dfc7618d-2dd0-4dbe-9924-ff41caa8a0e7',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100113,
            'RootParentRunID',
            'Root Parent Run ID',
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
         WHERE ID = '02c16772-f680-4032-9e16-042f1e2f3d52'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'RootLastRunID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '02c16772-f680-4032-9e16-042f1e2f3d52',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100114,
            'RootLastRunID',
            'Root Last Run ID',
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
         WHERE ID = '437f2e76-1f65-4c21-94a6-1959dd038928'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '437f2e76-1f65-4c21-94a6-1959dd038928',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            100033,
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
         WHERE ID = 'e79d5b78-3957-4734-8611-cb419923a675'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e79d5b78-3957-4734-8611-cb419923a675',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: MJ: AI Agents
            100135,
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
         WHERE ID = '558d30d4-8e38-4efa-8014-2511279f8b60'  OR 
               (EntityID = 'CB169268-D742-427E-8193-25E65D7D5F52' AND Name = 'RootParentCategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '558d30d4-8e38-4efa-8014-2511279f8b60',
            'CB169268-D742-427E-8193-25E65D7D5F52', -- Entity: Categories
            100021,
            'RootParentCategoryID',
            'Root Parent Category ID',
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
         WHERE ID = '12f2cb71-485d-46ef-a590-f7642acb6816'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'CompanyIntegration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '12f2cb71-485d-46ef-a590-f7642acb6816',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100031,
            'CompanyIntegration',
            'Company Integration',
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
         WHERE ID = '440bf6bb-a343-4417-9b10-e1d3cd5e8b8e'  OR 
               (EntityID = '34F67C2F-0D31-43DB-9665-3EABB7833867' AND Name = 'Entity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '440bf6bb-a343-4417-9b10-e1d3cd5e8b8e',
            '34F67C2F-0D31-43DB-9665-3EABB7833867', -- Entity: MJ: Company Integration Entity Maps
            100032,
            'Entity',
            'Entity',
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
         WHERE ID = '3ba15f58-ac13-4404-9c2e-e8927d8f4a3d'  OR 
               (EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3ba15f58-ac13-4404-9c2e-e8927d8f4a3d',
            'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E', -- Entity: MJ: Collections
            100029,
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
         WHERE ID = '65bcdfef-26b6-4486-b624-7cb23ad3ead4'  OR 
               (EntityID = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'RootResultSelectorPromptID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '65bcdfef-26b6-4486-b624-7cb23ad3ead4',
            '73AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: MJ: AI Prompts
            100113,
            'RootResultSelectorPromptID',
            'Root Result Selector Prompt ID',
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
         WHERE ID = 'b565e0fa-0add-49e6-9547-c2d00ed39619'  OR 
               (EntityID = '7DAD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b565e0fa-0add-49e6-9547-c2d00ed39619',
            '7DAD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: MJ: AI Prompt Categories
            100015,
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
         WHERE ID = 'ceb0029a-84ac-4328-abb6-85cee4a6f7bd'  OR 
               (EntityID = 'DB238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ceb0029a-84ac-4328-abb6-85cee4a6f7bd',
            'DB238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Skills
            100013,
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
         WHERE ID = 'd11d7d47-35c9-4e55-b1f5-ce406439f1b7'  OR 
               (EntityID = 'F9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd11d7d47-35c9-4e55-b1f5-ce406439f1b7',
            'F9238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Authorizations
            100019,
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
         WHERE ID = '9e525483-8f44-4d8d-9e8d-66d6c1eb01cb'  OR 
               (EntityID = 'FB238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9e525483-8f44-4d8d-9e8d-66d6c1eb01cb',
            'FB238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Audit Log Types
            100019,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ec35e6d8-77f5-4f2e-8e17-532f363efa64'  OR 
               (EntityID = '0C248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ec35e6d8-77f5-4f2e-8e17-532f363efa64',
            '0C248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Tags
            100017,
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
         WHERE ID = 'bb22bed4-2957-46af-b74a-4bfdc330e691'  OR 
               (EntityID = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bb22bed4-2957-46af-b74a-4bfdc330e691',
            '12248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Conversation Details
            100069,
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
         WHERE ID = 'cb9a283b-af15-4edd-b071-a92b92475b7b'  OR 
               (EntityID = '1A248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cb9a283b-af15-4edd-b071-a92b92475b7b',
            '1A248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Query Categories
            100027,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4beccad1-087a-4b2a-ad31-f158b468a3ef'  OR 
               (EntityID = '25248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4beccad1-087a-4b2a-ad31-f158b468a3ef',
            '25248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: User View Categories
            100023,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bf14f079-f07b-4844-8eb4-59f7c863b2f9'  OR 
               (EntityID = '26248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bf14f079-f07b-4844-8eb4-59f7c863b2f9',
            '26248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Dashboard Categories
            100019,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9ebb0ad4-e426-44ad-94e8-f377e4b292db'  OR 
               (EntityID = '27248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9ebb0ad4-e426-44ad-94e8-f377e4b292db',
            '27248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Report Categories
            100019,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3301a61c-a23e-453d-961a-8ad1db67a5c1'  OR 
               (EntityID = '2A248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3301a61c-a23e-453d-961a-8ad1db67a5c1',
            '2A248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: File Categories
            100015,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4c7dbe24-839e-4b6a-ab5c-379ad1a32b73'  OR 
               (EntityID = '33248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c7dbe24-839e-4b6a-ab5c-379ad1a32b73',
            '33248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Categories
            100017,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '24f88443-ad8a-4c7a-a596-9d06c733596f'  OR 
               (EntityID = '38248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24f88443-ad8a-4c7a-a596-9d06c733596f',
            '38248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Actions
            100055,
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
         WHERE ID = 'cf9d3563-4684-43bd-88da-c6ab0720eed7'  OR 
               (EntityID = '42248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cf9d3563-4684-43bd-88da-c6ab0720eed7',
            '42248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: List Categories
            100019,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2c35a31c-8b0e-4d1b-a292-dee0e87e4ea5'  OR 
               (EntityID = '49248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2c35a31c-8b0e-4d1b-a292-dee0e87e4ea5',
            '49248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Template Categories
            100019,
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cc4000a7-fde8-41c3-b279-29518e83196e'  OR 
               (EntityID = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cc4000a7-fde8-41c3-b279-29518e83196e',
            '91797885-7128-4B71-8C4B-81C5FEE24F38', -- Entity: MJ: Artifact Types
            100025,
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
         WHERE ID = 'e842a0ab-2256-433c-b773-53b86e9df529'  OR 
               (EntityID = '8FC868B5-778D-4282-BBAB-91C01F863C83' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e842a0ab-2256-433c-b773-53b86e9df529',
            '8FC868B5-778D-4282-BBAB-91C01F863C83', -- Entity: MJ: Test Suites
            100025,
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
         WHERE ID = '63ca5e33-acde-4319-aa06-b9d9a4106bb2'  OR 
               (EntityID = 'ED554027-0126-40EC-9A92-A002D309C4C6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '63ca5e33-acde-4319-aa06-b9d9a4106bb2',
            'ED554027-0126-40EC-9A92-A002D309C4C6', -- Entity: MJ: Version Labels
            100035,
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
         WHERE ID = 'ed1248c3-d941-4759-bca7-252c67cd3b9e'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'RootParentArchitectureID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ed1248c3-d941-4759-bca7-252c67cd3b9e',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100023,
            'RootParentArchitectureID',
            'Root Parent Architecture ID',
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
         WHERE ID = 'd1df5e4f-6d90-4ce4-ae99-d91338b61f33'  OR 
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
            'd1df5e4f-6d90-4ce4-ae99-d91338b61f33',
            '12A68DBD-84A6-4C13-9CC1-BACFCC850D9B', -- Entity: MJ: API Scopes
            100025,
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
         WHERE ID = 'aac65f68-843e-4714-945d-4ce9e09861a4'  OR 
               (EntityID = '31027859-1B84-4A79-9769-C6AE13AEB5A6' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aac65f68-843e-4714-945d-4ce9e09861a4',
            '31027859-1B84-4A79-9769-C6AE13AEB5A6', -- Entity: MJ: Credential Categories
            100017,
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
         WHERE ID = 'f99555ec-1b5c-4990-afab-28437475fd42'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f99555ec-1b5c-4990-afab-28437475fd42',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100193,
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
         WHERE ID = 'df62f320-c68c-467b-8a29-edffa2cbca25'  OR 
               (EntityID = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND Name = 'RootRerunFromPromptRunID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'df62f320-c68c-467b-8a29-edffa2cbca25',
            '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- Entity: MJ: AI Prompt Runs
            100194,
            'RootRerunFromPromptRunID',
            'Root Rerun From Prompt Run ID',
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
         WHERE ID = '65c50aa3-4ac9-47db-9fe7-eefd35905992'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '65c50aa3-4ac9-47db-9fe7-eefd35905992',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100049,
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
         WHERE ID = 'd9d64795-a493-43ab-a198-b3194690d139'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd9d64795-a493-43ab-a198-b3194690d139',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100049,
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
         WHERE ID = '1070c267-a5a1-4a69-9673-3b913f688025'  OR 
               (EntityID = 'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1070c267-a5a1-4a69-9673-3b913f688025',
            'B7E7DBA2-C9C1-4536-B71C-D50CDFE7673A', -- Entity: MJ: Projects
            100025,
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

