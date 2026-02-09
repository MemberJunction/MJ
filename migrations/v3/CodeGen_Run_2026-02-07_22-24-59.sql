/* SQL generated to create new entity Products */

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
         '64a541b8-9876-4aa7-9fe8-3ebf259a67e3',
         'Products',
         NULL,
         NULL,
         NULL,
         'Product',
         'vwProducts',
         'AdvancedEntities',
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
   

/* SQL generated to create new application AdvancedEntities */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('65e23f3f-7857-46a2-9100-1c402361af9c', 'AdvancedEntities', 'Generated for schema', 'AdvancedEntities', 'advancedentities', 1)

/* SQL generated to add new entity Products to application ID: '65e23f3f-7857-46a2-9100-1c402361af9c' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('65e23f3f-7857-46a2-9100-1c402361af9c', '64a541b8-9876-4aa7-9fe8-3ebf259a67e3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '65e23f3f-7857-46a2-9100-1c402361af9c'))

/* SQL generated to add new permission for entity Products for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('64a541b8-9876-4aa7-9fe8-3ebf259a67e3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Products for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('64a541b8-9876-4aa7-9fe8-3ebf259a67e3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Products for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('64a541b8-9876-4aa7-9fe8-3ebf259a67e3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Meetings */

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
         '54c50008-538e-449a-9e64-9c399d7756b5',
         'Meetings',
         NULL,
         NULL,
         NULL,
         'Meeting',
         'vwMeetings',
         'AdvancedEntities',
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
   

/* SQL generated to add new entity Meetings to application ID: '65E23F3F-7857-46A2-9100-1C402361AF9C' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('65E23F3F-7857-46A2-9100-1C402361AF9C', '54c50008-538e-449a-9e64-9c399d7756b5', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '65E23F3F-7857-46A2-9100-1C402361AF9C'))

/* SQL generated to add new permission for entity Meetings for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('54c50008-538e-449a-9e64-9c399d7756b5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Meetings for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('54c50008-538e-449a-9e64-9c399d7756b5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Meetings for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('54c50008-538e-449a-9e64-9c399d7756b5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Webinars */

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
         '96416023-9846-4ecb-ba53-e453f83b0a3a',
         'Webinars',
         NULL,
         NULL,
         NULL,
         'Webinar',
         'vwWebinars',
         'AdvancedEntities',
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
   

/* SQL generated to add new entity Webinars to application ID: '65E23F3F-7857-46A2-9100-1C402361AF9C' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('65E23F3F-7857-46A2-9100-1C402361AF9C', '96416023-9846-4ecb-ba53-e453f83b0a3a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '65E23F3F-7857-46A2-9100-1C402361AF9C'))

/* SQL generated to add new permission for entity Webinars for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96416023-9846-4ecb-ba53-e453f83b0a3a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Webinars for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96416023-9846-4ecb-ba53-e453f83b0a3a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Webinars for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96416023-9846-4ecb-ba53-e453f83b0a3a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Publications */

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
         'db6b59a4-ef3e-45ab-a726-78ecbb0f7746',
         'Publications',
         NULL,
         NULL,
         NULL,
         'Publication',
         'vwPublications',
         'AdvancedEntities',
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
   

/* SQL generated to add new entity Publications to application ID: '65E23F3F-7857-46A2-9100-1C402361AF9C' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('65E23F3F-7857-46A2-9100-1C402361AF9C', 'db6b59a4-ef3e-45ab-a726-78ecbb0f7746', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '65E23F3F-7857-46A2-9100-1C402361AF9C'))

/* SQL generated to add new permission for entity Publications for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('db6b59a4-ef3e-45ab-a726-78ecbb0f7746', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Publications for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('db6b59a4-ef3e-45ab-a726-78ecbb0f7746', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Publications for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('db6b59a4-ef3e-45ab-a726-78ecbb0f7746', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Customers */

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
         '272df2b5-9e4e-4406-82fa-b64c92d5a8a4',
         'Customers',
         NULL,
         NULL,
         NULL,
         'Customer',
         'vwCustomers',
         'AdvancedEntities',
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
   

/* SQL generated to add new entity Customers to application ID: '65E23F3F-7857-46A2-9100-1C402361AF9C' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('65E23F3F-7857-46A2-9100-1C402361AF9C', '272df2b5-9e4e-4406-82fa-b64c92d5a8a4', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '65E23F3F-7857-46A2-9100-1C402361AF9C'))

/* SQL generated to add new permission for entity Customers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('272df2b5-9e4e-4406-82fa-b64c92d5a8a4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Customers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('272df2b5-9e4e-4406-82fa-b64c92d5a8a4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Customers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('272df2b5-9e4e-4406-82fa-b64c92d5a8a4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Orders */

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
         '788f753f-bead-418c-9ba1-d8af03826e57',
         'Orders',
         NULL,
         NULL,
         NULL,
         'Order',
         'vwOrders',
         'AdvancedEntities',
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
   

/* SQL generated to add new entity Orders to application ID: '65E23F3F-7857-46A2-9100-1C402361AF9C' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('65E23F3F-7857-46A2-9100-1C402361AF9C', '788f753f-bead-418c-9ba1-d8af03826e57', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '65E23F3F-7857-46A2-9100-1C402361AF9C'))

/* SQL generated to add new permission for entity Orders for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('788f753f-bead-418c-9ba1-d8af03826e57', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Orders for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('788f753f-bead-418c-9ba1-d8af03826e57', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Orders for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('788f753f-bead-418c-9ba1-d8af03826e57', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity AdvancedEntities.Product */
ALTER TABLE [AdvancedEntities].[Product] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity AdvancedEntities.Product */
ALTER TABLE [AdvancedEntities].[Product] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity AdvancedEntities.Publication */
ALTER TABLE [AdvancedEntities].[Publication] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity AdvancedEntities.Publication */
ALTER TABLE [AdvancedEntities].[Publication] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity AdvancedEntities.Meeting */
ALTER TABLE [AdvancedEntities].[Meeting] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity AdvancedEntities.Meeting */
ALTER TABLE [AdvancedEntities].[Meeting] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity AdvancedEntities.Customer */
ALTER TABLE [AdvancedEntities].[Customer] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity AdvancedEntities.Customer */
ALTER TABLE [AdvancedEntities].[Customer] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity AdvancedEntities.Order */
ALTER TABLE [AdvancedEntities].[Order] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity AdvancedEntities.Order */
ALTER TABLE [AdvancedEntities].[Order] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity AdvancedEntities.Webinar */
ALTER TABLE [AdvancedEntities].[Webinar] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity AdvancedEntities.Webinar */
ALTER TABLE [AdvancedEntities].[Webinar] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6b25830a-a520-4561-b70d-0dd87d9301a8'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6b25830a-a520-4561-b70d-0dd87d9301a8',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
            100001,
            'ID',
            'ID',
            'Unique identifier for this product. Shared across the IS-A chain (same UUID in Product, Meeting/Publication, and Webinar tables).',
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
         WHERE ID = 'd3042c5a-89e6-4877-ac0c-0b15cffcda1a'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd3042c5a-89e6-4877-ac0c-0b15cffcda1a',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
            100002,
            'Name',
            'Name',
            'Display name of the product.',
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd1c67f6-5201-4b74-87d2-f0cb181ea31c'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd1c67f6-5201-4b74-87d2-f0cb181ea31c',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
            100003,
            'Description',
            'Description',
            'Detailed description of the product.',
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
         WHERE ID = 'fbb6aac5-2f8c-4d96-875c-498e3b09a6f5'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = 'Price')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fbb6aac5-2f8c-4d96-875c-498e3b09a6f5',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
            100004,
            'Price',
            'Price',
            'Price in USD.',
            'decimal',
            9,
            18,
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
         WHERE ID = 'e74b0209-4de3-4c33-8fb0-92eb8f37cfde'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = 'SKU')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e74b0209-4de3-4c33-8fb0-92eb8f37cfde',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
            100005,
            'SKU',
            'SKU',
            'Stock Keeping Unit. Unique identifier for inventory and catalog purposes.',
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
         WHERE ID = 'dbc022b0-6314-46a1-adc3-ef97283a954a'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dbc022b0-6314-46a1-adc3-ef97283a954a',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
            100006,
            'Category',
            'Category',
            'Product category for grouping and filtering.',
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
         WHERE ID = '7d851efb-0a60-47e5-b30b-8aacca455f67'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7d851efb-0a60-47e5-b30b-8aacca455f67',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
            100007,
            'IsActive',
            'Is Active',
            'Whether this product is currently active and available.',
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
         WHERE ID = 'b6ed32e2-abb9-4963-a449-58084c818183'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b6ed32e2-abb9-4963-a449-58084c818183',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
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
         WHERE ID = '135bef71-adbc-4878-bf0f-62b50e419fbc'  OR 
               (EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '135bef71-adbc-4878-bf0f-62b50e419fbc',
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', -- Entity: Products
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
         WHERE ID = '42856087-1157-47d0-973f-657059368808'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '42856087-1157-47d0-973f-657059368808',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100001,
            'ID',
            'ID',
            'Shared primary key with Product. This is the same UUID as the parent Product.ID.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            0,
            0,
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3',
            'ID',
            0,
            1,
            1,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b6c1ef29-cb8f-4db4-835c-b86a9cd6430e'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'ISBN')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b6c1ef29-cb8f-4db4-835c-b86a9cd6430e',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100002,
            'ISBN',
            'ISBN',
            'International Standard Book Number.',
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
         WHERE ID = '11581850-e9e2-4afb-9ecd-cf6276dc04bd'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'PublishDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '11581850-e9e2-4afb-9ecd-cf6276dc04bd',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100003,
            'PublishDate',
            'Publish Date',
            'Date the publication was released.',
            'date',
            3,
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
         WHERE ID = 'cff6b589-c530-4131-ad29-2cc7f37cd1d1'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'Publisher')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cff6b589-c530-4131-ad29-2cc7f37cd1d1',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100004,
            'Publisher',
            'Publisher',
            'Name of the publishing company.',
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
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ac4a98f4-ddb1-48b8-ba20-df1b55f34ce1'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'Format')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ac4a98f4-ddb1-48b8-ba20-df1b55f34ce1',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100005,
            'Format',
            'Format',
            'Publication format: eBook, Print, AudioBook, or PDF.',
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
         WHERE ID = '4fa11167-5e9b-4ea5-9449-5218b74dfcf8'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'PageCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4fa11167-5e9b-4ea5-9449-5218b74dfcf8',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100006,
            'PageCount',
            'Page Count',
            'Total number of pages (for Print and PDF formats).',
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
         WHERE ID = '9e851062-a714-4621-ac7b-53188aa282f4'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'Author')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9e851062-a714-4621-ac7b-53188aa282f4',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100007,
            'Author',
            'Author',
            'Author of the publication.',
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
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a55b6656-937c-4609-9f54-3272df430eaa'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a55b6656-937c-4609-9f54-3272df430eaa',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
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
         WHERE ID = 'fc507364-373c-4393-8eda-d575a849bbb0'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fc507364-373c-4393-8eda-d575a849bbb0',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
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
         WHERE ID = 'c6c848f2-a42b-4dc3-9f38-68ad99f0330c'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c6c848f2-a42b-4dc3-9f38-68ad99f0330c',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100001,
            'ID',
            'ID',
            'Shared primary key with Product. This is the same UUID as the parent Product.ID.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            0,
            0,
            '64A541B8-9876-4AA7-9FE8-3EBF259A67E3',
            'ID',
            0,
            1,
            1,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a245630d-8b7f-4199-a873-453f4bf1641f'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'StartTime')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a245630d-8b7f-4199-a873-453f4bf1641f',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100002,
            'StartTime',
            'Start Time',
            'When the meeting begins.',
            'datetime2',
            8,
            27,
            7,
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
         WHERE ID = '512408da-cf47-4155-bfb6-270ffd9d3d19'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'EndTime')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '512408da-cf47-4155-bfb6-270ffd9d3d19',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100003,
            'EndTime',
            'End Time',
            'When the meeting ends.',
            'datetime2',
            8,
            27,
            7,
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
         WHERE ID = '0ce475d0-adff-4281-9244-5afdabd47024'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'Location')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0ce475d0-adff-4281-9244-5afdabd47024',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100004,
            'Location',
            'Location',
            'Physical address or virtual meeting room URL.',
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
         WHERE ID = '4529824a-b5a9-41b6-b947-93a748d3e6cb'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'MaxAttendees')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4529824a-b5a9-41b6-b947-93a748d3e6cb',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100005,
            'MaxAttendees',
            'Max Attendees',
            'Maximum number of attendees allowed.',
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
         WHERE ID = '82254a14-a2fd-43ed-a0b3-a5a845a10d44'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'MeetingPlatform')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '82254a14-a2fd-43ed-a0b3-a5a845a10d44',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100006,
            'MeetingPlatform',
            'Meeting Platform',
            'Platform used for virtual meetings (e.g., Zoom, Microsoft Teams, Google Meet).',
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
         WHERE ID = '2e33e5e6-7555-441c-b369-bafa13143804'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'OrganizerName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2e33e5e6-7555-441c-b369-bafa13143804',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100007,
            'OrganizerName',
            'Organizer Name',
            'Name of the person organizing this meeting.',
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
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '51017749-c880-4cc0-ab8c-e81e59464ce6'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '51017749-c880-4cc0-ab8c-e81e59464ce6',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
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
         WHERE ID = 'deee929d-1c76-40cd-9bdd-4312a25be4f9'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'deee929d-1c76-40cd-9bdd-4312a25be4f9',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
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
         WHERE ID = 'cca6eb5f-2e00-4291-9769-54199ddedf9f'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cca6eb5f-2e00-4291-9769-54199ddedf9f',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100001,
            'ID',
            'ID',
            'Unique customer identifier.',
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
         WHERE ID = '5b594996-04b7-4d25-9997-132566aa6a07'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'FirstName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5b594996-04b7-4d25-9997-132566aa6a07',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100002,
            'FirstName',
            'First Name',
            'Customer first name.',
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
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7e49f17e-9528-4af7-9ccd-ac4180c010a2'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'LastName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7e49f17e-9528-4af7-9ccd-ac4180c010a2',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100003,
            'LastName',
            'Last Name',
            'Customer last name.',
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
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5a480288-3f53-432d-b70c-47dd78774a92'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5a480288-3f53-432d-b70c-47dd78774a92',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100004,
            'Email',
            'Email',
            'Primary email address (unique).',
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
         WHERE ID = '358406ad-eeca-4781-a872-c750b3954791'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'Phone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '358406ad-eeca-4781-a872-c750b3954791',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100005,
            'Phone',
            'Phone',
            'Contact phone number.',
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
         WHERE ID = 'e0ecc2cf-055f-4b61-8e6a-76fd86e3df1a'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'Company')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e0ecc2cf-055f-4b61-8e6a-76fd86e3df1a',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100006,
            'Company',
            'Company',
            'Company or organization name.',
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
         WHERE ID = 'aa4e0f1f-e409-49a6-a685-b875aa1e4400'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'City')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aa4e0f1f-e409-49a6-a685-b875aa1e4400',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100007,
            'City',
            'City',
            'City of the customer.',
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
         WHERE ID = 'bdd8daef-6871-4854-a3de-eade7e58c317'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'State')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bdd8daef-6871-4854-a3de-eade7e58c317',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100008,
            'State',
            'State',
            'State or province.',
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
         WHERE ID = '2cc79038-17d7-4893-9ac4-4eb0b121dfb1'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'Country')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2cc79038-17d7-4893-9ac4-4eb0b121dfb1',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100009,
            'Country',
            'Country',
            'Country (defaults to USA).',
            'nvarchar',
            200,
            0,
            0,
            0,
            'USA',
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
         WHERE ID = '7fcaefe5-c471-4016-b854-b4b4638a5918'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'CustomerSince')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7fcaefe5-c471-4016-b854-b4b4638a5918',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100010,
            'CustomerSince',
            'Customer Since',
            'Date the customer account was created.',
            'date',
            3,
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
         WHERE ID = '839eb379-a869-4a45-898b-256c9ab28c1b'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = 'Tier')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '839eb379-a869-4a45-898b-256c9ab28c1b',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
            100011,
            'Tier',
            'Tier',
            'Loyalty tier: Bronze, Silver, Gold, or Platinum.',
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
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c9df8f69-cda7-49a4-9512-6e32905b478c'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c9df8f69-cda7-49a4-9512-6e32905b478c',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
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
         WHERE ID = '11311f79-b9ce-460c-a004-b3c8f4a5db49'  OR 
               (EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '11311f79-b9ce-460c-a004-b3c8f4a5db49',
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', -- Entity: Customers
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
         WHERE ID = 'f970717d-e8cc-4574-98da-1a61d3b032cf'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f970717d-e8cc-4574-98da-1a61d3b032cf',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100001,
            'ID',
            'ID',
            'Unique order identifier.',
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
         WHERE ID = '72a6446a-0f82-4491-95c4-f81551578737'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'CustomerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '72a6446a-0f82-4491-95c4-f81551578737',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100002,
            'CustomerID',
            'Customer ID',
            'Foreign key to Customer. Each order belongs to exactly one customer.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4',
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
         WHERE ID = '436bd511-0aad-4094-8b3d-0cb1ffd755b2'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'OrderDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '436bd511-0aad-4094-8b3d-0cb1ffd755b2',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100003,
            'OrderDate',
            'Order Date',
            'Date and time the order was placed.',
            'datetime2',
            8,
            27,
            7,
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
         WHERE ID = 'ae51bfdc-44a8-4009-9f10-9b8e31690b26'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'TotalAmount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ae51bfdc-44a8-4009-9f10-9b8e31690b26',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100004,
            'TotalAmount',
            'Total Amount',
            'Total monetary value of the order in USD.',
            'decimal',
            9,
            18,
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
         WHERE ID = '7a8fecfa-52ad-4fdd-ba4b-5f92e7628118'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7a8fecfa-52ad-4fdd-ba4b-5f92e7628118',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100005,
            'Status',
            'Status',
            'Order fulfillment status: Pending, Processing, Shipped, Delivered, or Cancelled.',
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
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dbdac9fe-e3b8-40f0-9fe3-fcec22f029da'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'ItemCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dbdac9fe-e3b8-40f0-9fe3-fcec22f029da',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100006,
            'ItemCount',
            'Item Count',
            'Number of items in this order.',
            'int',
            4,
            10,
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
         WHERE ID = '8a8319d2-95ad-416e-99da-94979ee31550'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'ShippingAddress')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8a8319d2-95ad-416e-99da-94979ee31550',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100007,
            'ShippingAddress',
            'Shipping Address',
            'Delivery address for physical shipments.',
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
         WHERE ID = '0aa5aa09-daf5-41e8-bfb1-f1211dee9d64'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0aa5aa09-daf5-41e8-bfb1-f1211dee9d64',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
            100008,
            'Notes',
            'Notes',
            'Optional notes or special instructions.',
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
         WHERE ID = 'dcaf8dcb-2ca4-4f01-b5d1-72d99a929603'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dcaf8dcb-2ca4-4f01-b5d1-72d99a929603',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
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
         WHERE ID = 'a15ce122-71b9-4f2c-9f5d-b839d376a31b'  OR 
               (EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a15ce122-71b9-4f2c-9f5d-b839d376a31b',
            '788F753F-BEAD-418C-9BA1-D8AF03826E57', -- Entity: Orders
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
         WHERE ID = '63f9b150-682b-4071-91bf-68824c73f788'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '63f9b150-682b-4071-91bf-68824c73f788',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100001,
            'ID',
            'ID',
            'Shared primary key with Meeting and Product. Same UUID across all three tables.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            0,
            0,
            '54C50008-538E-449A-9E64-9C399D7756B5',
            'ID',
            0,
            1,
            1,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '62c1ae0c-b048-479b-8866-356a6ded656d'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'StreamingURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '62c1ae0c-b048-479b-8866-356a6ded656d',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100002,
            'StreamingURL',
            'Streaming URL',
            'URL for the live stream.',
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
         WHERE ID = '3c94108b-029f-435f-a54b-0e10876e06bf'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'IsRecorded')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3c94108b-029f-435f-a54b-0e10876e06bf',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100003,
            'IsRecorded',
            'Is Recorded',
            'Whether this webinar will be recorded for later viewing.',
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
         WHERE ID = 'c732a37c-85e0-4493-9a3b-610db8cca430'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'WebinarProvider')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c732a37c-85e0-4493-9a3b-610db8cca430',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100004,
            'WebinarProvider',
            'Webinar Provider',
            'The webinar hosting platform (e.g., Zoom Webinars, GoToWebinar, Webex Events).',
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
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8bc5ff5a-96d7-4705-8775-51c70d9d965e'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'RegistrationURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8bc5ff5a-96d7-4705-8775-51c70d9d965e',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100005,
            'RegistrationURL',
            'Registration URL',
            'URL where attendees can register for the webinar.',
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
         WHERE ID = '7f604939-cbf4-4594-aced-48e71987c658'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'ExpectedAttendees')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7f604939-cbf4-4594-aced-48e71987c658',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100006,
            'ExpectedAttendees',
            'Expected Attendees',
            'Expected number of attendees for planning purposes.',
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
         WHERE ID = '2561b627-01bb-4053-b6db-24aa8c5b2205'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2561b627-01bb-4053-b6db-24aa8c5b2205',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
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
         WHERE ID = 'fd0c51de-2a20-4ed2-9502-48cb2911b9ec'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd0c51de-2a20-4ed2-9502-48cb2911b9ec',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
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

/* SQL text to delete entity field value ID 2B28453E-F36B-1410-8680-007B559E242F */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='2B28453E-F36B-1410-8680-007B559E242F'

/* SQL text to insert entity field value with ID 7715d2a4-5d3e-4f5b-9100-8f31f5321f35 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7715d2a4-5d3e-4f5b-9100-8f31f5321f35', 'AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1', 1, 'AudioBook', 'AudioBook')

/* SQL text to insert entity field value with ID 522b83a5-c3e5-4868-8756-d320874fe847 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('522b83a5-c3e5-4868-8756-d320874fe847', 'AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1', 2, 'PDF', 'PDF')

/* SQL text to insert entity field value with ID 7f7fb65b-db51-4f0d-bdd1-dff2a4daae49 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7f7fb65b-db51-4f0d-bdd1-dff2a4daae49', 'AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1', 3, 'Print', 'Print')

/* SQL text to insert entity field value with ID 86ca5ee8-0955-4760-a320-c3131742dca9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('86ca5ee8-0955-4760-a320-c3131742dca9', 'AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1', 4, 'eBook', 'eBook')

/* SQL text to update ValueListType for entity field ID AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1'

/* SQL text to insert entity field value with ID a2138afd-3cf3-406e-8490-2b1100d97abd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a2138afd-3cf3-406e-8490-2b1100d97abd', '839EB379-A869-4A45-898B-256C9AB28C1B', 1, 'Bronze', 'Bronze')

/* SQL text to insert entity field value with ID e41c7eb0-4370-4c43-a423-8564249384ba */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e41c7eb0-4370-4c43-a423-8564249384ba', '839EB379-A869-4A45-898B-256C9AB28C1B', 2, 'Gold', 'Gold')

/* SQL text to insert entity field value with ID 574f7d61-7c1e-4ed1-a5aa-d39a06585b8c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('574f7d61-7c1e-4ed1-a5aa-d39a06585b8c', '839EB379-A869-4A45-898B-256C9AB28C1B', 3, 'Platinum', 'Platinum')

/* SQL text to insert entity field value with ID ce455685-6f4b-4b9d-be29-2803f9abb050 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ce455685-6f4b-4b9d-be29-2803f9abb050', '839EB379-A869-4A45-898B-256C9AB28C1B', 4, 'Silver', 'Silver')

/* SQL text to update ValueListType for entity field ID 839EB379-A869-4A45-898B-256C9AB28C1B */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='839EB379-A869-4A45-898B-256C9AB28C1B'

/* SQL text to insert entity field value with ID 726ea6c3-5c4a-4bd5-9739-833d35994b89 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('726ea6c3-5c4a-4bd5-9739-833d35994b89', '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118', 1, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field value with ID 9f800490-0f6a-4e0c-8c1e-c88c63353a7f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9f800490-0f6a-4e0c-8c1e-c88c63353a7f', '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118', 2, 'Delivered', 'Delivered')

/* SQL text to insert entity field value with ID 9c083cc4-ce01-41b5-ad4d-413e6cb4c037 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9c083cc4-ce01-41b5-ad4d-413e6cb4c037', '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118', 3, 'Pending', 'Pending')

/* SQL text to insert entity field value with ID a5a7822e-a0b2-400f-a956-9f36a711d6fe */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a5a7822e-a0b2-400f-a956-9f36a711d6fe', '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118', 4, 'Processing', 'Processing')

/* SQL text to insert entity field value with ID cd6d65ff-2f24-4c1e-9c66-fcb212025484 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cd6d65ff-2f24-4c1e-9c66-fcb212025484', '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118', 5, 'Shipped', 'Shipped')

/* SQL text to update ValueListType for entity field ID 7A8FECFA-52AD-4FDD-BA4B-5F92E7628118 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7A8FECFA-52AD-4FDD-BA4B-5F92E7628118'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f483541c-bcfc-42c7-bf88-cc2399758e2f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f483541c-bcfc-42c7-bf88-cc2399758e2f', '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', '54C50008-538E-449A-9E64-9C399D7756B5', 'ID', 'One To Many', 1, 1, 'Meetings', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '04bd0635-fb68-4515-85ae-70c59d0de14a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('04bd0635-fb68-4515-85ae-70c59d0de14a', '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', 'ID', 'One To Many', 1, 1, 'Publications', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd059e4aa-cb96-4bd9-aa7e-c06fd939aed4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d059e4aa-cb96-4bd9-aa7e-c06fd939aed4', '54C50008-538E-449A-9E64-9C399D7756B5', '96416023-9846-4ECB-BA53-E453F83B0A3A', 'ID', 'One To Many', 1, 1, 'Webinars', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ee7f3afe-90a1-453b-a5de-f85c8ec07120'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ee7f3afe-90a1-453b-a5de-f85c8ec07120', '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', '788F753F-BEAD-418C-9BA1-D8AF03826E57', 'CustomerID', 'One To Many', 1, 1, 'Orders', 1);
   END
                              

/* SQL text to update virtual entity field CustomerID for entity Customer Order Summaries */
UPDATE
                                    [${flyway:defaultSchema}].EntityField
                                  SET
                                    Sequence=1,
                                    Type='uniqueidentifier',
                                    AllowsNull=0,
                                    
                                    Length=16,
                                    Precision=0,
                                    Scale=0
                                  WHERE
                                    ID = '87EC423E-F36B-1410-8DDB-00021F8B792E'

/* SQL text to add virtual entity field FirstName for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '213d1fe5-f29b-4b01-ad2c-0a9117d51851', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'FirstName', 'nvarchar', 0,
                                       200, 0, 0,
                                       2, 0, 0
                                    )

/* SQL text to add virtual entity field LastName for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '7b338e41-7bc3-49f0-a381-e34ac19e682c', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'LastName', 'nvarchar', 0,
                                       200, 0, 0,
                                       3, 0, 0
                                    )

/* SQL text to add virtual entity field Email for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'e6778661-bee6-479a-9cd0-7704b5397655', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'Email', 'nvarchar', 0,
                                       510, 0, 0,
                                       4, 0, 0
                                    )

/* SQL text to add virtual entity field Company for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'f35159b8-cf74-4912-97c4-01eb0a7dfb6d', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'Company', 'nvarchar', 1,
                                       400, 0, 0,
                                       5, 0, 0
                                    )

/* SQL text to add virtual entity field City for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '8bc4982c-b930-4adc-a05f-6d2956f55655', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'City', 'nvarchar', 1,
                                       200, 0, 0,
                                       6, 0, 0
                                    )

/* SQL text to add virtual entity field State for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'e84cbb13-232e-4103-92fb-e2176ee8ee46', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'State', 'nvarchar', 1,
                                       100, 0, 0,
                                       7, 0, 0
                                    )

/* SQL text to add virtual entity field Country for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'd366d6bc-578b-43d0-aaea-3932ceda2bf7', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'Country', 'nvarchar', 0,
                                       200, 0, 0,
                                       8, 0, 0
                                    )

/* SQL text to add virtual entity field Tier for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '55b2dc72-34ef-432f-9fb4-0640d7b69218', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'Tier', 'nvarchar', 0,
                                       40, 0, 0,
                                       9, 0, 0
                                    )

/* SQL text to add virtual entity field CustomerSince for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '5eea2e59-dde7-4e93-a243-901ff0aeec86', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'CustomerSince', 'date', 0,
                                       3, 10, 0,
                                       10, 0, 0
                                    )

/* SQL text to add virtual entity field TotalOrders for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'e373b5aa-b7ab-46b0-aaa3-677aceb6ce14', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'TotalOrders', 'int', 1,
                                       4, 10, 0,
                                       11, 0, 0
                                    )

/* SQL text to add virtual entity field LifetimeSpend for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'b5d570e5-1b9e-44a3-98b6-e89fe945e1e9', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'LifetimeSpend', 'decimal', 0,
                                       17, 38, 2,
                                       12, 0, 0
                                    )

/* SQL text to add virtual entity field AvgOrderValue for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'cb429687-2287-4508-9d63-8759ce9f722c', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'AvgOrderValue', 'decimal', 0,
                                       17, 38, 6,
                                       13, 0, 0
                                    )

/* SQL text to add virtual entity field SmallestOrder for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '9207622c-c1b0-472d-852a-3de65f6156be', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'SmallestOrder', 'decimal', 0,
                                       9, 18, 2,
                                       14, 0, 0
                                    )

/* SQL text to add virtual entity field LargestOrder for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '272fcab2-629a-4287-9a2a-26b36b4be7e8', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'LargestOrder', 'decimal', 0,
                                       9, 18, 2,
                                       15, 0, 0
                                    )

/* SQL text to add virtual entity field FirstOrderDate for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '62f64005-5732-4e44-8b72-8edc64b3d4ff', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'FirstOrderDate', 'datetime2', 1,
                                       8, 27, 7,
                                       16, 0, 0
                                    )

/* SQL text to add virtual entity field LastOrderDate for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '17881905-8333-48c5-b13c-2743d6d9e587', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'LastOrderDate', 'datetime2', 1,
                                       8, 27, 7,
                                       17, 0, 0
                                    )

/* SQL text to add virtual entity field TotalItemsPurchased for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '1001f12d-99d8-49a4-a115-cd996532ae4a', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'TotalItemsPurchased', 'int', 0,
                                       4, 10, 0,
                                       18, 0, 0
                                    )

/* SQL text to add virtual entity field CancelledOrders for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '85b65cab-3f4b-4996-a67f-14f9c1e19c5d', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'CancelledOrders', 'int', 1,
                                       4, 10, 0,
                                       19, 0, 0
                                    )

/* SQL text to add virtual entity field DeliveredOrders for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  '39774948-e524-48f9-b737-5b2793fe720c', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'DeliveredOrders', 'int', 1,
                                       4, 10, 0,
                                       20, 0, 0
                                    )

/* SQL text to add virtual entity field DaysSinceLastOrder for entity Customer Order Summaries */
INSERT INTO [${flyway:defaultSchema}].EntityField (
                                      ID, EntityID, Name, Type, AllowsNull,
                                      Length, Precision, Scale,
                                      Sequence, IsPrimaryKey, IsUnique )
                            VALUES (  'a9bcf0ce-19fe-4783-9bcc-8090020e0d02', '86EC423E-F36B-1410-8DDB-00021F8B792E', 'DaysSinceLastOrder', 'int', 1,
                                       4, 10, 0,
                                       21, 0, 0
                                    )

/* SQL text to update virtual entity updated date for Customer Order Summaries */
UPDATE [${flyway:defaultSchema}].Entity SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='86EC423E-F36B-1410-8DDB-00021F8B792E'

/* Index for Foreign Keys for Customer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Customers
-----               SCHEMA:      AdvancedEntities
-----               BASE TABLE:  Customer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[vwCustomers]', 'V') IS NOT NULL
    DROP VIEW [AdvancedEntities].[vwCustomers];
GO

CREATE VIEW [AdvancedEntities].[vwCustomers]
AS
SELECT
    c.*
FROM
    [AdvancedEntities].[Customer] AS c
GO
GRANT SELECT ON [AdvancedEntities].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Permissions for vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [AdvancedEntities].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spCreateCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spCreateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spCreateCustomer];
GO

CREATE PROCEDURE [AdvancedEntities].[spCreateCustomer]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(200),
    @City nvarchar(100),
    @State nvarchar(50),
    @Country nvarchar(100) = NULL,
    @CustomerSince date,
    @Tier nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [AdvancedEntities].[Customer]
            (
                [ID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [City],
                [State],
                [Country],
                [CustomerSince],
                [Tier]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FirstName,
                @LastName,
                @Email,
                @Phone,
                @Company,
                @City,
                @State,
                ISNULL(@Country, 'USA'),
                @CustomerSince,
                @Tier
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [AdvancedEntities].[Customer]
            (
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [City],
                [State],
                [Country],
                [CustomerSince],
                [Tier]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                @Email,
                @Phone,
                @Company,
                @City,
                @State,
                ISNULL(@Country, 'USA'),
                @CustomerSince,
                @Tier
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [AdvancedEntities].[vwCustomers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Customers */

GRANT EXECUTE ON [AdvancedEntities].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spUpdateCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spUpdateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spUpdateCustomer];
GO

CREATE PROCEDURE [AdvancedEntities].[spUpdateCustomer]
    @ID uniqueidentifier,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(200),
    @City nvarchar(100),
    @State nvarchar(50),
    @Country nvarchar(100),
    @CustomerSince date,
    @Tier nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Customer]
    SET
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Email] = @Email,
        [Phone] = @Phone,
        [Company] = @Company,
        [City] = @City,
        [State] = @State,
        [Country] = @Country,
        [CustomerSince] = @CustomerSince,
        [Tier] = @Tier
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [AdvancedEntities].[vwCustomers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [AdvancedEntities].[vwCustomers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [AdvancedEntities].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Customer table
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[trgUpdateCustomer]', 'TR') IS NOT NULL
    DROP TRIGGER [AdvancedEntities].[trgUpdateCustomer];
GO
CREATE TRIGGER [AdvancedEntities].trgUpdateCustomer
ON [AdvancedEntities].[Customer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Customer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [AdvancedEntities].[Customer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Customers */

GRANT EXECUTE ON [AdvancedEntities].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spDeleteCustomer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Customer
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spDeleteCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spDeleteCustomer];
GO

CREATE PROCEDURE [AdvancedEntities].[spDeleteCustomer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [AdvancedEntities].[Customer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spDeleteCustomer] TO [cdp_Integration]
    

/* spDelete Permissions for Customers */

GRANT EXECUTE ON [AdvancedEntities].[spDeleteCustomer] TO [cdp_Integration]



/* Index for Foreign Keys for Meeting */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ID in table Meeting
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Meeting_ID' 
    AND object_id = OBJECT_ID('[AdvancedEntities].[Meeting]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Meeting_ID ON [AdvancedEntities].[Meeting] ([ID]);

/* Base View SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Meetings
-----               SCHEMA:      AdvancedEntities
-----               BASE TABLE:  Meeting
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[vwMeetings]', 'V') IS NOT NULL
    DROP VIEW [AdvancedEntities].[vwMeetings];
GO

CREATE VIEW [AdvancedEntities].[vwMeetings]
AS
SELECT
    m.*,
    ${flyway:defaultSchema}_isa_p1.[Name],
    ${flyway:defaultSchema}_isa_p1.[Description],
    ${flyway:defaultSchema}_isa_p1.[Price],
    ${flyway:defaultSchema}_isa_p1.[SKU],
    ${flyway:defaultSchema}_isa_p1.[Category],
    ${flyway:defaultSchema}_isa_p1.[IsActive]
FROM
    [AdvancedEntities].[Meeting] AS m
INNER JOIN
    [AdvancedEntities].[Product] AS ${flyway:defaultSchema}_isa_p1
  ON
    [m].[ID] = ${flyway:defaultSchema}_isa_p1.[ID]
GO
GRANT SELECT ON [AdvancedEntities].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: Permissions for vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [AdvancedEntities].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spCreateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spCreateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spCreateMeeting];
GO

CREATE PROCEDURE [AdvancedEntities].[spCreateMeeting]
    @ID uniqueidentifier = NULL,
    @StartTime datetime2,
    @EndTime datetime2,
    @Location nvarchar(500),
    @MaxAttendees int,
    @MeetingPlatform nvarchar(100),
    @OrganizerName nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [AdvancedEntities].[Meeting]
        (
            [StartTime],
                [EndTime],
                [Location],
                [MaxAttendees],
                [MeetingPlatform],
                [OrganizerName],
                [ID]
        )
    VALUES
        (
            @StartTime,
                @EndTime,
                @Location,
                @MaxAttendees,
                @MeetingPlatform,
                @OrganizerName,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [AdvancedEntities].[vwMeetings] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Meetings */

GRANT EXECUTE ON [AdvancedEntities].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spUpdateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spUpdateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spUpdateMeeting];
GO

CREATE PROCEDURE [AdvancedEntities].[spUpdateMeeting]
    @ID uniqueidentifier,
    @StartTime datetime2,
    @EndTime datetime2,
    @Location nvarchar(500),
    @MaxAttendees int,
    @MeetingPlatform nvarchar(100),
    @OrganizerName nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Meeting]
    SET
        [StartTime] = @StartTime,
        [EndTime] = @EndTime,
        [Location] = @Location,
        [MaxAttendees] = @MaxAttendees,
        [MeetingPlatform] = @MeetingPlatform,
        [OrganizerName] = @OrganizerName
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [AdvancedEntities].[vwMeetings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [AdvancedEntities].[vwMeetings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [AdvancedEntities].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Meeting table
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[trgUpdateMeeting]', 'TR') IS NOT NULL
    DROP TRIGGER [AdvancedEntities].[trgUpdateMeeting];
GO
CREATE TRIGGER [AdvancedEntities].trgUpdateMeeting
ON [AdvancedEntities].[Meeting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Meeting]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [AdvancedEntities].[Meeting] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Meetings */

GRANT EXECUTE ON [AdvancedEntities].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spDeleteMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spDeleteMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spDeleteMeeting];
GO

CREATE PROCEDURE [AdvancedEntities].[spDeleteMeeting]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [AdvancedEntities].[Meeting]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spDeleteMeeting] TO [cdp_Integration]
    

/* spDelete Permissions for Meetings */

GRANT EXECUTE ON [AdvancedEntities].[spDeleteMeeting] TO [cdp_Integration]



/* Index for Foreign Keys for Order */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CustomerID in table Order
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Order_CustomerID' 
    AND object_id = OBJECT_ID('[AdvancedEntities].[Order]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Order_CustomerID ON [AdvancedEntities].[Order] ([CustomerID]);

/* Base View SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: vwOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Orders
-----               SCHEMA:      AdvancedEntities
-----               BASE TABLE:  Order
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[vwOrders]', 'V') IS NOT NULL
    DROP VIEW [AdvancedEntities].[vwOrders];
GO

CREATE VIEW [AdvancedEntities].[vwOrders]
AS
SELECT
    o.*
FROM
    [AdvancedEntities].[Order] AS o
GO
GRANT SELECT ON [AdvancedEntities].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Permissions for vwOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [AdvancedEntities].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spCreateOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Order
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spCreateOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spCreateOrder];
GO

CREATE PROCEDURE [AdvancedEntities].[spCreateOrder]
    @ID uniqueidentifier = NULL,
    @CustomerID uniqueidentifier,
    @OrderDate datetime2,
    @TotalAmount decimal(18, 2),
    @Status nvarchar(20),
    @ItemCount int = NULL,
    @ShippingAddress nvarchar(500),
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [AdvancedEntities].[Order]
            (
                [ID],
                [CustomerID],
                [OrderDate],
                [TotalAmount],
                [Status],
                [ItemCount],
                [ShippingAddress],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CustomerID,
                @OrderDate,
                @TotalAmount,
                @Status,
                ISNULL(@ItemCount, 1),
                @ShippingAddress,
                @Notes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [AdvancedEntities].[Order]
            (
                [CustomerID],
                [OrderDate],
                [TotalAmount],
                [Status],
                [ItemCount],
                [ShippingAddress],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CustomerID,
                @OrderDate,
                @TotalAmount,
                @Status,
                ISNULL(@ItemCount, 1),
                @ShippingAddress,
                @Notes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [AdvancedEntities].[vwOrders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spCreateOrder] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Orders */

GRANT EXECUTE ON [AdvancedEntities].[spCreateOrder] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spUpdateOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Order
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spUpdateOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spUpdateOrder];
GO

CREATE PROCEDURE [AdvancedEntities].[spUpdateOrder]
    @ID uniqueidentifier,
    @CustomerID uniqueidentifier,
    @OrderDate datetime2,
    @TotalAmount decimal(18, 2),
    @Status nvarchar(20),
    @ItemCount int,
    @ShippingAddress nvarchar(500),
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Order]
    SET
        [CustomerID] = @CustomerID,
        [OrderDate] = @OrderDate,
        [TotalAmount] = @TotalAmount,
        [Status] = @Status,
        [ItemCount] = @ItemCount,
        [ShippingAddress] = @ShippingAddress,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [AdvancedEntities].[vwOrders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [AdvancedEntities].[vwOrders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [AdvancedEntities].[spUpdateOrder] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Order table
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[trgUpdateOrder]', 'TR') IS NOT NULL
    DROP TRIGGER [AdvancedEntities].[trgUpdateOrder];
GO
CREATE TRIGGER [AdvancedEntities].trgUpdateOrder
ON [AdvancedEntities].[Order]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Order]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [AdvancedEntities].[Order] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Orders */

GRANT EXECUTE ON [AdvancedEntities].[spUpdateOrder] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spDeleteOrder
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Order
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spDeleteOrder]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spDeleteOrder];
GO

CREATE PROCEDURE [AdvancedEntities].[spDeleteOrder]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [AdvancedEntities].[Order]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spDeleteOrder] TO [cdp_Integration]
    

/* spDelete Permissions for Orders */

GRANT EXECUTE ON [AdvancedEntities].[spDeleteOrder] TO [cdp_Integration]



/* Index for Foreign Keys for Product */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Publication */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ID in table Publication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Publication_ID' 
    AND object_id = OBJECT_ID('[AdvancedEntities].[Publication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Publication_ID ON [AdvancedEntities].[Publication] ([ID]);

/* Base View SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Products
-----               SCHEMA:      AdvancedEntities
-----               BASE TABLE:  Product
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [AdvancedEntities].[vwProducts];
GO

CREATE VIEW [AdvancedEntities].[vwProducts]
AS
SELECT
    p.*
FROM
    [AdvancedEntities].[Product] AS p
GO
GRANT SELECT ON [AdvancedEntities].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [AdvancedEntities].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spCreateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spCreateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spCreateProduct];
GO

CREATE PROCEDURE [AdvancedEntities].[spCreateProduct]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Price decimal(18, 2),
    @SKU nvarchar(50),
    @Category nvarchar(100),
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [AdvancedEntities].[Product]
            (
                [ID],
                [Name],
                [Description],
                [Price],
                [SKU],
                [Category],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Price,
                @SKU,
                @Category,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [AdvancedEntities].[Product]
            (
                [Name],
                [Description],
                [Price],
                [SKU],
                [Category],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Price,
                @SKU,
                @Category,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [AdvancedEntities].[vwProducts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spCreateProduct] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Products */

GRANT EXECUTE ON [AdvancedEntities].[spCreateProduct] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spUpdateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spUpdateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spUpdateProduct];
GO

CREATE PROCEDURE [AdvancedEntities].[spUpdateProduct]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @Price decimal(18, 2),
    @SKU nvarchar(50),
    @Category nvarchar(100),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Product]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Price] = @Price,
        [SKU] = @SKU,
        [Category] = @Category,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [AdvancedEntities].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [AdvancedEntities].[vwProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [AdvancedEntities].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[trgUpdateProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [AdvancedEntities].[trgUpdateProduct];
GO
CREATE TRIGGER [AdvancedEntities].trgUpdateProduct
ON [AdvancedEntities].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Product]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [AdvancedEntities].[Product] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Products */

GRANT EXECUTE ON [AdvancedEntities].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spDeleteProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spDeleteProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spDeleteProduct];
GO

CREATE PROCEDURE [AdvancedEntities].[spDeleteProduct]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [AdvancedEntities].[Product]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spDeleteProduct] TO [cdp_Integration]
    

/* spDelete Permissions for Products */

GRANT EXECUTE ON [AdvancedEntities].[spDeleteProduct] TO [cdp_Integration]



/* Base View SQL for Publications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publications
-- Item: vwPublications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Publications
-----               SCHEMA:      AdvancedEntities
-----               BASE TABLE:  Publication
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[vwPublications]', 'V') IS NOT NULL
    DROP VIEW [AdvancedEntities].[vwPublications];
GO

CREATE VIEW [AdvancedEntities].[vwPublications]
AS
SELECT
    p.*,
    ${flyway:defaultSchema}_isa_p1.[Name],
    ${flyway:defaultSchema}_isa_p1.[Description],
    ${flyway:defaultSchema}_isa_p1.[Price],
    ${flyway:defaultSchema}_isa_p1.[SKU],
    ${flyway:defaultSchema}_isa_p1.[Category],
    ${flyway:defaultSchema}_isa_p1.[IsActive]
FROM
    [AdvancedEntities].[Publication] AS p
INNER JOIN
    [AdvancedEntities].[Product] AS ${flyway:defaultSchema}_isa_p1
  ON
    [p].[ID] = ${flyway:defaultSchema}_isa_p1.[ID]
GO
GRANT SELECT ON [AdvancedEntities].[vwPublications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Publications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publications
-- Item: Permissions for vwPublications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [AdvancedEntities].[vwPublications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Publications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publications
-- Item: spCreatePublication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Publication
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spCreatePublication]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spCreatePublication];
GO

CREATE PROCEDURE [AdvancedEntities].[spCreatePublication]
    @ID uniqueidentifier = NULL,
    @ISBN nvarchar(20),
    @PublishDate date,
    @Publisher nvarchar(200),
    @Format nvarchar(50),
    @PageCount int,
    @Author nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [AdvancedEntities].[Publication]
        (
            [ISBN],
                [PublishDate],
                [Publisher],
                [Format],
                [PageCount],
                [Author],
                [ID]
        )
    VALUES
        (
            @ISBN,
                @PublishDate,
                @Publisher,
                @Format,
                @PageCount,
                @Author,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [AdvancedEntities].[vwPublications] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spCreatePublication] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Publications */

GRANT EXECUTE ON [AdvancedEntities].[spCreatePublication] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Publications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publications
-- Item: spUpdatePublication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Publication
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spUpdatePublication]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spUpdatePublication];
GO

CREATE PROCEDURE [AdvancedEntities].[spUpdatePublication]
    @ID uniqueidentifier,
    @ISBN nvarchar(20),
    @PublishDate date,
    @Publisher nvarchar(200),
    @Format nvarchar(50),
    @PageCount int,
    @Author nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Publication]
    SET
        [ISBN] = @ISBN,
        [PublishDate] = @PublishDate,
        [Publisher] = @Publisher,
        [Format] = @Format,
        [PageCount] = @PageCount,
        [Author] = @Author
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [AdvancedEntities].[vwPublications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [AdvancedEntities].[vwPublications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [AdvancedEntities].[spUpdatePublication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Publication table
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[trgUpdatePublication]', 'TR') IS NOT NULL
    DROP TRIGGER [AdvancedEntities].[trgUpdatePublication];
GO
CREATE TRIGGER [AdvancedEntities].trgUpdatePublication
ON [AdvancedEntities].[Publication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Publication]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [AdvancedEntities].[Publication] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Publications */

GRANT EXECUTE ON [AdvancedEntities].[spUpdatePublication] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Publications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publications
-- Item: spDeletePublication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Publication
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spDeletePublication]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spDeletePublication];
GO

CREATE PROCEDURE [AdvancedEntities].[spDeletePublication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [AdvancedEntities].[Publication]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spDeletePublication] TO [cdp_Integration]
    

/* spDelete Permissions for Publications */

GRANT EXECUTE ON [AdvancedEntities].[spDeletePublication] TO [cdp_Integration]



/* Index for Foreign Keys for Webinar */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Webinars
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ID in table Webinar
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Webinar_ID' 
    AND object_id = OBJECT_ID('[AdvancedEntities].[Webinar]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Webinar_ID ON [AdvancedEntities].[Webinar] ([ID]);

/* Base View SQL for Webinars */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Webinars
-- Item: vwWebinars
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Webinars
-----               SCHEMA:      AdvancedEntities
-----               BASE TABLE:  Webinar
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[vwWebinars]', 'V') IS NOT NULL
    DROP VIEW [AdvancedEntities].[vwWebinars];
GO

CREATE VIEW [AdvancedEntities].[vwWebinars]
AS
SELECT
    w.*,
    ${flyway:defaultSchema}_isa_p1.[StartTime],
    ${flyway:defaultSchema}_isa_p1.[EndTime],
    ${flyway:defaultSchema}_isa_p1.[Location],
    ${flyway:defaultSchema}_isa_p1.[MaxAttendees],
    ${flyway:defaultSchema}_isa_p1.[MeetingPlatform],
    ${flyway:defaultSchema}_isa_p1.[OrganizerName],
    ${flyway:defaultSchema}_isa_p2.[Name],
    ${flyway:defaultSchema}_isa_p2.[Description],
    ${flyway:defaultSchema}_isa_p2.[Price],
    ${flyway:defaultSchema}_isa_p2.[SKU],
    ${flyway:defaultSchema}_isa_p2.[Category],
    ${flyway:defaultSchema}_isa_p2.[IsActive]
FROM
    [AdvancedEntities].[Webinar] AS w
INNER JOIN
    [AdvancedEntities].[Meeting] AS ${flyway:defaultSchema}_isa_p1
  ON
    [w].[ID] = ${flyway:defaultSchema}_isa_p1.[ID]
INNER JOIN
    [AdvancedEntities].[Product] AS ${flyway:defaultSchema}_isa_p2
  ON
    [${flyway:defaultSchema}_isa_p1].[ID] = ${flyway:defaultSchema}_isa_p2.[ID]
GO
GRANT SELECT ON [AdvancedEntities].[vwWebinars] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Webinars */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Webinars
-- Item: Permissions for vwWebinars
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [AdvancedEntities].[vwWebinars] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Webinars */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Webinars
-- Item: spCreateWebinar
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Webinar
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spCreateWebinar]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spCreateWebinar];
GO

CREATE PROCEDURE [AdvancedEntities].[spCreateWebinar]
    @ID uniqueidentifier = NULL,
    @StreamingURL nvarchar(1000),
    @IsRecorded bit = NULL,
    @WebinarProvider nvarchar(100),
    @RegistrationURL nvarchar(1000),
    @ExpectedAttendees int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [AdvancedEntities].[Webinar]
        (
            [StreamingURL],
                [IsRecorded],
                [WebinarProvider],
                [RegistrationURL],
                [ExpectedAttendees],
                [ID]
        )
    VALUES
        (
            @StreamingURL,
                ISNULL(@IsRecorded, 0),
                @WebinarProvider,
                @RegistrationURL,
                @ExpectedAttendees,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [AdvancedEntities].[vwWebinars] WHERE [ID] = @ActualID
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spCreateWebinar] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Webinars */

GRANT EXECUTE ON [AdvancedEntities].[spCreateWebinar] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Webinars */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Webinars
-- Item: spUpdateWebinar
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Webinar
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spUpdateWebinar]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spUpdateWebinar];
GO

CREATE PROCEDURE [AdvancedEntities].[spUpdateWebinar]
    @ID uniqueidentifier,
    @StreamingURL nvarchar(1000),
    @IsRecorded bit,
    @WebinarProvider nvarchar(100),
    @RegistrationURL nvarchar(1000),
    @ExpectedAttendees int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Webinar]
    SET
        [StreamingURL] = @StreamingURL,
        [IsRecorded] = @IsRecorded,
        [WebinarProvider] = @WebinarProvider,
        [RegistrationURL] = @RegistrationURL,
        [ExpectedAttendees] = @ExpectedAttendees
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [AdvancedEntities].[vwWebinars] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [AdvancedEntities].[vwWebinars]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [AdvancedEntities].[spUpdateWebinar] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Webinar table
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[trgUpdateWebinar]', 'TR') IS NOT NULL
    DROP TRIGGER [AdvancedEntities].[trgUpdateWebinar];
GO
CREATE TRIGGER [AdvancedEntities].trgUpdateWebinar
ON [AdvancedEntities].[Webinar]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [AdvancedEntities].[Webinar]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [AdvancedEntities].[Webinar] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Webinars */

GRANT EXECUTE ON [AdvancedEntities].[spUpdateWebinar] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Webinars */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Webinars
-- Item: spDeleteWebinar
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Webinar
------------------------------------------------------------
IF OBJECT_ID('[AdvancedEntities].[spDeleteWebinar]', 'P') IS NOT NULL
    DROP PROCEDURE [AdvancedEntities].[spDeleteWebinar];
GO

CREATE PROCEDURE [AdvancedEntities].[spDeleteWebinar]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [AdvancedEntities].[Webinar]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [AdvancedEntities].[spDeleteWebinar] TO [cdp_Integration]
    

/* spDelete Permissions for Webinars */

GRANT EXECUTE ON [AdvancedEntities].[spDeleteWebinar] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b024d126-49bb-42c7-a183-827744f58a4b'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b024d126-49bb-42c7-a183-827744f58a4b',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100019,
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
            0,
            1,
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
         WHERE ID = 'a0c94b7e-c2d7-4690-88c1-f85d4c4bda60'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a0c94b7e-c2d7-4690-88c1-f85d4c4bda60',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100020,
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
         WHERE ID = '32a20d4b-bd1a-40ca-b6e4-116fafaab923'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'Price')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '32a20d4b-bd1a-40ca-b6e4-116fafaab923',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100021,
            'Price',
            'Price',
            NULL,
            'decimal',
            9,
            18,
            2,
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
         WHERE ID = '2a051234-07b1-478a-b354-2515f4fefee6'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'SKU')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2a051234-07b1-478a-b354-2515f4fefee6',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100022,
            'SKU',
            'SKU',
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
         WHERE ID = 'b079dbf0-bdbc-48b1-9176-b080b2f4cf50'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b079dbf0-bdbc-48b1-9176-b080b2f4cf50',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100023,
            'Category',
            'Category',
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
         WHERE ID = '3f5b921f-9fa3-408d-85ae-053c8415fae0'  OR 
               (EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3f5b921f-9fa3-408d-85ae-053c8415fae0',
            'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', -- Entity: Publications
            100024,
            'IsActive',
            'Is Active',
            NULL,
            'bit',
            1,
            1,
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
         WHERE ID = 'ad7e2ef3-49b0-43ec-b2dd-684a9bcffcfc'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ad7e2ef3-49b0-43ec-b2dd-684a9bcffcfc',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100019,
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
            0,
            1,
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
         WHERE ID = '4b3b8af3-a400-4fd8-8324-1bb023df87a8'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4b3b8af3-a400-4fd8-8324-1bb023df87a8',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100020,
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
         WHERE ID = '3ab59105-7403-4411-a165-f3ad831ea52a'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'Price')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3ab59105-7403-4411-a165-f3ad831ea52a',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100021,
            'Price',
            'Price',
            NULL,
            'decimal',
            9,
            18,
            2,
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
         WHERE ID = '5ccc33a3-b924-4e71-8a0a-71ccadfdd927'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'SKU')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5ccc33a3-b924-4e71-8a0a-71ccadfdd927',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100022,
            'SKU',
            'SKU',
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
         WHERE ID = '6e6a19dd-b8c6-43ae-b17a-7f16ee2ba48d'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e6a19dd-b8c6-43ae-b17a-7f16ee2ba48d',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100023,
            'Category',
            'Category',
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
         WHERE ID = '8b9eac6c-03db-4dd4-adf1-2a5d4864552a'  OR 
               (EntityID = '54C50008-538E-449A-9E64-9C399D7756B5' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8b9eac6c-03db-4dd4-adf1-2a5d4864552a',
            '54C50008-538E-449A-9E64-9C399D7756B5', -- Entity: Meetings
            100024,
            'IsActive',
            'Is Active',
            NULL,
            'bit',
            1,
            1,
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
         WHERE ID = 'a0240973-1e86-4136-836a-dee16f695205'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'StartTime')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a0240973-1e86-4136-836a-dee16f695205',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100017,
            'StartTime',
            'Start Time',
            NULL,
            'datetime2',
            8,
            27,
            7,
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
         WHERE ID = 'd48f71d9-382e-4efb-ac3b-d5ab91198ebd'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'EndTime')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd48f71d9-382e-4efb-ac3b-d5ab91198ebd',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100018,
            'EndTime',
            'End Time',
            NULL,
            'datetime2',
            8,
            27,
            7,
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
         WHERE ID = '9c3a5dca-2b6d-496e-afa1-b25adf8ff8fb'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'Location')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9c3a5dca-2b6d-496e-afa1-b25adf8ff8fb',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100019,
            'Location',
            'Location',
            NULL,
            'nvarchar',
            1000,
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
         WHERE ID = '1d0b7880-849c-4563-9f44-aa5994ed6981'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'MaxAttendees')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1d0b7880-849c-4563-9f44-aa5994ed6981',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100020,
            'MaxAttendees',
            'Max Attendees',
            NULL,
            'int',
            4,
            10,
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
         WHERE ID = 'd3d69e66-c452-4555-9803-63abf72df79c'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'MeetingPlatform')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd3d69e66-c452-4555-9803-63abf72df79c',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100021,
            'MeetingPlatform',
            'Meeting Platform',
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
         WHERE ID = 'eed1babd-1cbd-40f3-a662-50b959adb8f8'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'OrganizerName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'eed1babd-1cbd-40f3-a662-50b959adb8f8',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100022,
            'OrganizerName',
            'Organizer Name',
            NULL,
            'nvarchar',
            400,
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
         WHERE ID = '7496884c-f77c-4208-9f89-2922087532cb'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7496884c-f77c-4208-9f89-2922087532cb',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100023,
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
            0,
            1,
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
         WHERE ID = '9906b257-2a23-4d59-bf1e-0f584dd93a17'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9906b257-2a23-4d59-bf1e-0f584dd93a17',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100024,
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
         WHERE ID = 'bba5c175-93e7-4c71-9af3-211d69d082aa'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'Price')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bba5c175-93e7-4c71-9af3-211d69d082aa',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100025,
            'Price',
            'Price',
            NULL,
            'decimal',
            9,
            18,
            2,
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
         WHERE ID = 'ec6783c2-ca5f-41a2-a81f-c9a59cc7bb5a'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'SKU')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ec6783c2-ca5f-41a2-a81f-c9a59cc7bb5a',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100026,
            'SKU',
            'SKU',
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
         WHERE ID = '6de39375-75d5-4850-bc26-53c5d55578c7'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6de39375-75d5-4850-bc26-53c5d55578c7',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100027,
            'Category',
            'Category',
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
         WHERE ID = 'fc4a46fd-18a6-4808-80c4-c724ea74d856'  OR 
               (EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fc4a46fd-18a6-4808-80c4-c724ea74d856',
            '96416023-9846-4ECB-BA53-E453F83B0A3A', -- Entity: Webinars
            100028,
            'IsActive',
            'Is Active',
            NULL,
            'bit',
            1,
            1,
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

/* Update IS-A parent field Name on Meetings */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=400,
                      Precision=0,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='AD7E2EF3-49B0-43EC-B2DD-684A9BCFFCFC'

/* Update IS-A parent field Description on Meetings */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=-1,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='4B3B8AF3-A400-4FD8-8324-1BB023DF87A8'

/* Update IS-A parent field Price on Meetings */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='decimal',
                      Length=9,
                      Precision=18,
                      Scale=2,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='3AB59105-7403-4411-A165-F3AD831EA52A'

/* Update IS-A parent field SKU on Meetings */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=100,
                      Precision=0,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='5CCC33A3-B924-4E71-8A0A-71CCADFDD927'

/* Update IS-A parent field Category on Meetings */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=200,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='6E6A19DD-B8C6-43AE-B17A-7F16EE2BA48D'

/* Update IS-A parent field IsActive on Meetings */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='bit',
                      Length=1,
                      Precision=1,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='8B9EAC6C-03DB-4DD4-ADF1-2A5D4864552A'

/* Update entity timestamp for Meetings after IS-A field sync */
UPDATE [${flyway:defaultSchema}].Entity SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='54C50008-538E-449A-9E64-9C399D7756B5'

/* Update IS-A parent field Name on Publications */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=400,
                      Precision=0,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='B024D126-49BB-42C7-A183-827744F58A4B'

/* Update IS-A parent field Description on Publications */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=-1,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='A0C94B7E-C2D7-4690-88C1-F85D4C4BDA60'

/* Update IS-A parent field Price on Publications */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='decimal',
                      Length=9,
                      Precision=18,
                      Scale=2,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='32A20D4B-BD1A-40CA-B6E4-116FAFAAB923'

/* Update IS-A parent field SKU on Publications */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=100,
                      Precision=0,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='2A051234-07B1-478A-B354-2515F4FEFEE6'

/* Update IS-A parent field Category on Publications */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=200,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='B079DBF0-BDBC-48B1-9176-B080B2F4CF50'

/* Update IS-A parent field IsActive on Publications */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='bit',
                      Length=1,
                      Precision=1,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='3F5B921F-9FA3-408D-85AE-053C8415FAE0'

/* Update entity timestamp for Publications after IS-A field sync */
UPDATE [${flyway:defaultSchema}].Entity SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='DB6B59A4-EF3E-45AB-A726-78ECBB0F7746'

/* Update IS-A parent field StartTime on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='datetime2',
                      Length=8,
                      Precision=27,
                      Scale=7,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='A0240973-1E86-4136-836A-DEE16F695205'

/* Update IS-A parent field EndTime on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='datetime2',
                      Length=8,
                      Precision=27,
                      Scale=7,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='D48F71D9-382E-4EFB-AC3B-D5AB91198EBD'

/* Update IS-A parent field Location on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=1000,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='9C3A5DCA-2B6D-496E-AFA1-B25ADF8FF8FB'

/* Update IS-A parent field MaxAttendees on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='int',
                      Length=4,
                      Precision=10,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='1D0B7880-849C-4563-9F44-AA5994ED6981'

/* Update IS-A parent field MeetingPlatform on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=200,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='D3D69E66-C452-4555-9803-63ABF72DF79C'

/* Update IS-A parent field OrganizerName on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=400,
                      Precision=0,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='EED1BABD-1CBD-40F3-A662-50B959ADB8F8'

/* Update IS-A parent field Name on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=400,
                      Precision=0,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='7496884C-F77C-4208-9F89-2922087532CB'

/* Update IS-A parent field Description on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=-1,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='9906B257-2A23-4D59-BF1E-0F584DD93A17'

/* Update IS-A parent field Price on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='decimal',
                      Length=9,
                      Precision=18,
                      Scale=2,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='BBA5C175-93E7-4C71-9AF3-211D69D082AA'

/* Update IS-A parent field SKU on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=100,
                      Precision=0,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='EC6783C2-CA5F-41A2-A81F-C9A59CC7BB5A'

/* Update IS-A parent field Category on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='nvarchar',
                      Length=200,
                      Precision=0,
                      Scale=0,
                      AllowsNull=1,
                      AllowUpdateAPI=1
                  WHERE ID='6DE39375-75D5-4850-BC26-53C5D55578C7'

/* Update IS-A parent field IsActive on Webinars */
UPDATE [${flyway:defaultSchema}].EntityField
                  SET IsVirtual=1,
                      Type='bit',
                      Length=1,
                      Precision=1,
                      Scale=0,
                      AllowsNull=0,
                      AllowUpdateAPI=1
                  WHERE ID='FC4A46FD-18A6-4808-80C4-C724EA74D856'

/* Update entity timestamp for Webinars after IS-A field sync */
UPDATE [${flyway:defaultSchema}].Entity SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='96416023-9846-4ECB-BA53-E453F83B0A3A'

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5A480288-3F53-432D-B70C-47DD78774A92'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5B594996-04B7-4D25-9997-132566AA6A07'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7E49F17E-9528-4AF7-9CCD-AC4180C010A2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5A480288-3F53-432D-B70C-47DD78774A92'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '358406AD-EECA-4781-A872-C750B3954791'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E0ECC2CF-055F-4B61-8E6A-76FD86E3DF1A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7FCAEFE5-C471-4016-B854-B4B4638A5918'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '839EB379-A869-4A45-898B-256C9AB28C1B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5B594996-04B7-4D25-9997-132566AA6A07'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7E49F17E-9528-4AF7-9CCD-AC4180C010A2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5A480288-3F53-432D-B70C-47DD78774A92'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '358406AD-EECA-4781-A872-C750B3954791'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0ECC2CF-055F-4B61-8E6A-76FD86E3DF1A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AA4E0F1F-E409-49A6-A685-B875AA1E4400'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BDD8DAEF-6871-4854-A3DE-EADE7E58C317'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2CC79038-17D7-4893-9AC4-4EB0B121DFB1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '839EB379-A869-4A45-898B-256C9AB28C1B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AD7E2EF3-49B0-43EC-B2DD-684A9BCFFCFC'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A245630D-8B7F-4199-A873-453F4BF1641F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '512408DA-CF47-4155-BFB6-270FFD9D3D19'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0CE475D0-ADFF-4281-9244-5AFDABD47024'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2E33E5E6-7555-441C-B369-BAFA13143804'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AD7E2EF3-49B0-43EC-B2DD-684A9BCFFCFC'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E6A19DD-B8C6-43AE-B17A-7F16EE2BA48D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8B9EAC6C-03DB-4DD4-ADF1-2A5D4864552A'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0CE475D0-ADFF-4281-9244-5AFDABD47024'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '82254A14-A2FD-43ED-A0B3-A5A845A10D44'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2E33E5E6-7555-441C-B369-BAFA13143804'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AD7E2EF3-49B0-43EC-B2DD-684A9BCFFCFC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5CCC33A3-B924-4E71-8A0A-71CCADFDD927'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E6A19DD-B8C6-43AE-B17A-7F16EE2BA48D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B024D126-49BB-42C7-A183-827744F58A4B'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B6C1EF29-CB8F-4DB4-835C-B86A9CD6430E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '11581850-E9E2-4AFB-9ECD-CF6276DC04BD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CFF6B589-C530-4131-AD29-2CC7F37CD1D1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9E851062-A714-4621-AC7B-53188AA282F4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B024D126-49BB-42C7-A183-827744F58A4B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '32A20D4B-BD1A-40CA-B6E4-116FAFAAB923'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B6C1EF29-CB8F-4DB4-835C-B86A9CD6430E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CFF6B589-C530-4131-AD29-2CC7F37CD1D1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9E851062-A714-4621-AC7B-53188AA282F4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B024D126-49BB-42C7-A183-827744F58A4B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2A051234-07B1-478A-B354-2515F4FEFEE6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B079DBF0-BDBC-48B1-9176-B080B2F4CF50'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'D3042C5A-89E6-4877-AC0C-0B15CFFCDA1A'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D3042C5A-89E6-4877-AC0C-0B15CFFCDA1A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FBB6AAC5-2F8C-4D96-875C-498E3B09A6F5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E74B0209-4DE3-4C33-8FB0-92EB8F37CFDE'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DBC022B0-6314-46A1-ADC3-EF97283A954A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7D851EFB-0A60-47E5-B30B-8AACCA455F67'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D3042C5A-89E6-4877-AC0C-0B15CFFCDA1A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E74B0209-4DE3-4C33-8FB0-92EB8F37CFDE'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DBC022B0-6314-46A1-ADC3-EF97283A954A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F970717D-E8CC-4574-98DA-1A61D3B032CF'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F970717D-E8CC-4574-98DA-1A61D3B032CF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '436BD511-0AAD-4094-8B3D-0CB1FFD755B2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AE51BFDC-44A8-4009-9F10-9B8E31690B26'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DBDAC9FE-E3B8-40F0-9FE3-FCEC22F029DA'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F970717D-E8CC-4574-98DA-1A61D3B032CF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8A8319D2-95AD-416E-99DA-94979EE31550'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '42856087-1157-47D0-973F-657059368808'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A55B6656-937C-4609-9F54-3272DF430EAA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC507364-373C-4393-8EDA-D575A849BBB0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B024D126-49BB-42C7-A183-827744F58A4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A0C94B7E-C2D7-4690-88C1-F85D4C4BDA60'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Author',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E851062-A714-4621-AC7B-53188AA282F4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'ISBN',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B6C1EF29-CB8F-4DB4-835C-B86A9CD6430E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Publisher',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CFF6B589-C530-4131-AD29-2CC7F37CD1D1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Publish Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '11581850-E9E2-4AFB-9ECD-CF6276DC04BD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Format',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC4A98F4-DDB1-48B8-BA20-DF1B55F34CE1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Publication Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Page Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4FA11167-5E9B-4EA5-9449-5218B74DFCF8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sales & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Price',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '32A20D4B-BD1A-40CA-B6E4-116FAFAAB923'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sales & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'SKU',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A051234-07B1-478A-B354-2515F4FEFEE6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sales & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B079DBF0-BDBC-48B1-9176-B080B2F4CF50'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sales & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F5B921F-9FA3-408D-85AE-053C8415FAE0'
   AND AutoUpdateCategory = 1

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C6C848F2-A42B-4DC3-9F38-68AD99F0330C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Meeting Schedule & Logistics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Start Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A245630D-8B7F-4199-A873-453F4BF1641F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Meeting Schedule & Logistics',
       GeneratedFormSection = 'Category',
       DisplayName = 'End Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '512408DA-CF47-4155-BFB6-270FFD9D3D19'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Meeting Schedule & Logistics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Location',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '0CE475D0-ADFF-4281-9244-5AFDABD47024'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Meeting Schedule & Logistics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Maximum Attendees',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4529824A-B5A9-41B6-B947-93A748D3E6CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Meeting Schedule & Logistics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Meeting Platform',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '82254A14-A2FD-43ED-A0B3-A5A845A10D44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Meeting Schedule & Logistics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Organizer Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E33E5E6-7555-441C-B369-BAFA13143804'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '51017749-C880-4CC0-AB8C-E81E59464CE6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DEEE929D-1C76-40CD-9BDD-4312A25BE4F9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD7E2EF3-49B0-43EC-B2DD-684A9BCFFCFC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B3B8AF3-A400-4FD8-8324-1BB023DF87A8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Price',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3AB59105-7403-4411-A165-F3AD831EA52A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'SKU',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5CCC33A3-B924-4E71-8A0A-71CCADFDD927'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E6A19DD-B8C6-43AE-B17A-7F16EE2BA48D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B9EAC6C-03DB-4DD4-ADF1-2A5D4864552A'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-book */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-book',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746'
               

/* Set entity icon to fa fa-calendar */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-calendar',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '54C50008-538E-449A-9E64-9C399D7756B5'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3b1f5aa5-f205-48c0-9f34-c155bbdb5413', 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', 'FieldCategoryInfo', '{"Core Publication Info":{"icon":"fa fa-book","description":"Essential information about the publication such as title, author, ISBN, publisher, format and page count."},"Sales & Availability":{"icon":"fa fa-dollar-sign","description":"Pricing, SKU, classification and active status for selling the publication."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields including record identifier and timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('638922fb-fa61-4a1b-8cf7-811562839944', '54C50008-538E-449A-9E64-9C399D7756B5', 'FieldCategoryInfo', '{"Product Details":{"icon":"fa fa-box","description":"Core product information such as name, description, pricing, SKU and status"},"Meeting Schedule & Logistics":{"icon":"fa fa-calendar-alt","description":"Timing, location, capacity and platform details for conducting the meeting"},"System Metadata":{"icon":"fa fa-cog","description":"Audit and technical fields managed automatically by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d4067f20-cd8a-409f-b79a-a09acbb6e4b1', '54C50008-538E-449A-9E64-9C399D7756B5', 'FieldCategoryIcons', '{"Product Details":"fa fa-box","Meeting Schedule & Logistics":"fa fa-calendar-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('65ba43a3-cc12-4d26-9ba3-4b32d32b8ad3', 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746', 'FieldCategoryIcons', '{"Core Publication Info":"fa fa-book","Sales & Availability":"fa fa-dollar-sign","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '54C50008-538E-449A-9E64-9C399D7756B5'
         

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'DB6B59A4-EF3E-45AB-A726-78ECBB0F7746'
         

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCA6EB5F-2E00-4291-9769-54199DDEDF9F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C9DF8F69-CDA7-49A4-9512-6E32905B478C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '11311F79-B9CE-460C-A004-B3C8F4A5DB49'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B594996-04B7-4D25-9997-132566AA6A07'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E49F17E-9528-4AF7-9CCD-AC4180C010A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '5A480288-3F53-432D-B70C-47DD78774A92'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Phone',
       ExtendedType = 'Tel',
       CodeType = NULL
   WHERE ID = '358406AD-EECA-4781-A872-C750B3954791'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location',
       GeneratedFormSection = 'Category',
       DisplayName = 'City',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA4E0F1F-E409-49A6-A685-B875AA1E4400'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location',
       GeneratedFormSection = 'Category',
       DisplayName = 'State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BDD8DAEF-6871-4854-A3DE-EADE7E58C317'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location',
       GeneratedFormSection = 'Category',
       DisplayName = 'Country',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2CC79038-17D7-4893-9AC4-4EB0B121DFB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0ECC2CF-055F-4B61-8E6A-76FD86E3DF1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tier',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '839EB379-A869-4A45-898B-256C9AB28C1B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Customer Since',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7FCAEFE5-C471-4016-B854-B4B4638A5918'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-users */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-users',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d464f16c-93cf-4d56-97ed-8c8108af0f65', '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-user","description":"Core personal contact fields such as name, email, and phone."},"Location":{"icon":"fa fa-map-marker-alt","description":"Geographic address details of the customer."},"Account Details":{"icon":"fa fa-briefcase","description":"Company affiliation, loyalty tier, and account creation date."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f6ca4e61-d95f-4f87-9815-e3a7c7fd4111', '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4', 'FieldCategoryIcons', '{"Personal Information":"fa fa-user","Location":"fa fa-map-marker-alt","Account Details":"fa fa-briefcase","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '272DF2B5-9E4E-4406-82FA-B64C92D5A8A4'
         

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B25830A-A520-4561-B70D-0DD87D9301A8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D3042C5A-89E6-4877-AC0C-0B15CFFCDA1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD1C67F6-5201-4B74-87D2-F0CB181EA31C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DBC022B0-6314-46A1-ADC3-EF97283A954A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Pricing & Inventory',
       GeneratedFormSection = 'Category',
       DisplayName = 'Price',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FBB6AAC5-2F8C-4D96-875C-498E3B09A6F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Pricing & Inventory',
       GeneratedFormSection = 'Category',
       DisplayName = 'SKU',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E74B0209-4DE3-4C33-8FB0-92EB8F37CFDE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Pricing & Inventory',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7D851EFB-0A60-47E5-B30B-8AACCA455F67'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B6ED32E2-ABB9-4963-A449-58084C818183'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '135BEF71-ADBC-4878-BF0F-62B50E419FBC'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-box */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-box',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9d97ac5a-f9b7-457e-a823-2b2e9c7cb3c3', '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', 'FieldCategoryInfo', '{"Product Details":{"icon":"fa fa-tag","description":"Core product information such as name, description, and category"},"Pricing & Inventory":{"icon":"fa fa-dollar-sign","description":"Pricing, SKU, and availability status for inventory management"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('df8e8548-4c2d-40bb-8fee-22aff0e0bc5f', '64A541B8-9876-4AA7-9FE8-3EBF259A67E3', 'FieldCategoryIcons', '{"Product Details":"fa fa-tag","Pricing & Inventory":"fa fa-dollar-sign","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '64A541B8-9876-4AA7-9FE8-3EBF259A67E3'
         

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Customer',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '72A6446A-0F82-4491-95C4-F81551578737'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '436BD511-0AAD-4094-8B3D-0CB1FFD755B2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Amount',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AE51BFDC-44A8-4009-9F10-9B8E31690B26'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Summary',
       GeneratedFormSection = 'Category',
       DisplayName = 'Item Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DBDAC9FE-E3B8-40F0-9FE3-FCEC22F029DA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Fulfillment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A8FECFA-52AD-4FDD-BA4B-5F92E7628118'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Fulfillment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Shipping Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A8319D2-95AD-416E-99DA-94979EE31550'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Fulfillment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0AA5AA09-DAF5-41E8-BFB1-F1211DEE9D64'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F970717D-E8CC-4574-98DA-1A61D3B032CF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DCAF8DCB-2CA4-4F01-B5D1-72D99A929603'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A15CE122-71B9-4F2C-9F5D-B839D376A31B'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shopping-cart */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-shopping-cart',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '788F753F-BEAD-418C-9BA1-D8AF03826E57'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('71015796-7a4e-40d8-9b78-9b5b91b1ed90', '788F753F-BEAD-418C-9BA1-D8AF03826E57', 'FieldCategoryInfo', '{"Order Summary":{"icon":"fa fa-info-circle","description":"Key order data such as customer, date, total amount and item count"},"Fulfillment":{"icon":"fa fa-truck","description":"Status and shipping details including address and buyer notes"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields and primary identifier for the record"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('2d1696a3-9300-4280-b632-bd1c7e4e4ddd', '788F753F-BEAD-418C-9BA1-D8AF03826E57', 'FieldCategoryIcons', '{"Order Summary":"fa fa-info-circle","Fulfillment":"fa fa-truck","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '788F753F-BEAD-418C-9BA1-D8AF03826E57'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '7496884C-F77C-4208-9F89-2922087532CB'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C732A37C-85E0-4493-9A3B-610DB8CCA430'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A0240973-1E86-4136-836A-DEE16F695205'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D48F71D9-382E-4EFB-AC3B-D5AB91198EBD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EED1BABD-1CBD-40F3-A662-50B959ADB8F8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7496884C-F77C-4208-9F89-2922087532CB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BBA5C175-93E7-4C71-9AF3-211D69D082AA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6DE39375-75D5-4850-BC26-53C5D55578C7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FC4A46FD-18A6-4808-80C4-C724EA74D856'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C732A37C-85E0-4493-9A3B-610DB8CCA430'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EED1BABD-1CBD-40F3-A662-50B959ADB8F8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7496884C-F77C-4208-9F89-2922087532CB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EC6783C2-CA5F-41A2-A81F-C9A59CC7BB5A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6DE39375-75D5-4850-BC26-53C5D55578C7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 20 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '63F9B150-682B-4071-91BF-68824C73F788'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2561B627-01BB-4053-B6DB-24AA8C5B2205'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD0C51DE-2A20-4ED2-9502-48CB2911B9EC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Webinar Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Webinar Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7496884C-F77C-4208-9F89-2922087532CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Webinar Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9906B257-2A23-4D59-BF1E-0F584DD93A17'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Webinar Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6DE39375-75D5-4850-BC26-53C5D55578C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Webinar Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'SKU',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC6783C2-CA5F-41A2-A81F-C9A59CC7BB5A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Webinar Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Price',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BBA5C175-93E7-4C71-9AF3-211D69D082AA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Webinar Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC4A46FD-18A6-4808-80C4-C724EA74D856'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Webinar Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Organizer Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EED1BABD-1CBD-40F3-A662-50B959ADB8F8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Capacity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Start Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A0240973-1E86-4136-836A-DEE16F695205'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Capacity',
       GeneratedFormSection = 'Category',
       DisplayName = 'End Time',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D48F71D9-382E-4EFB-AC3B-D5AB91198EBD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Capacity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Location',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C3A5DCA-2B6D-496E-AFA1-B25ADF8FF8FB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Capacity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expected Attendees',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F604939-CBF4-4594-ACED-48E71987C658'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Schedule & Capacity',
       GeneratedFormSection = 'Category',
       DisplayName = 'Maximum Attendees',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D0B7880-849C-4563-9F44-AA5994ED6981'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Streaming & Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Streaming URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '62C1AE0C-B048-479B-8866-356A6DED656D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Streaming & Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Registration URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '8BC5FF5A-96D7-4705-8775-51C70D9D965E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Streaming & Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Webinar Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C732A37C-85E0-4493-9A3B-610DB8CCA430'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Streaming & Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Meeting Platform',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D3D69E66-C452-4555-9803-63ABF72DF79C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Streaming & Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Recorded',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C94108B-029F-435F-A54B-0E10876E06BF'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-video */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-video',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '96416023-9846-4ECB-BA53-E453F83B0A3A'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('87ed6fb5-934b-452e-b3d8-94de38ab0945', '96416023-9846-4ECB-BA53-E453F83B0A3A', 'FieldCategoryInfo', '{"Webinar Overview":{"icon":"fa fa-chalkboard-teacher","description":"Core descriptive and commercial information about the webinar such as title, description, pricing, SKU, category and organizer."},"Schedule & Capacity":{"icon":"fa fa-calendar-alt","description":"Timing, location, and attendee limits that define when and how many participants can join the webinar."},"Streaming & Access":{"icon":"fa fa-video","description":"Technical access details including streaming links, registration link, provider, platform and recording options."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier for the record."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('affb6908-a327-4edb-a617-44ac6915e05c', '96416023-9846-4ECB-BA53-E453F83B0A3A', 'FieldCategoryIcons', '{"Webinar Overview":"fa fa-chalkboard-teacher","Schedule & Capacity":"fa fa-calendar-alt","Streaming & Access":"fa fa-video","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '96416023-9846-4ECB-BA53-E453F83B0A3A'
         

