/* SQL generated to create new entity Categories */

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
         '7e388af0-d74e-4e68-b8d6-8c3fa018f9cf',
         'Categories',
         NULL,
         NULL,
         NULL,
         'Categories',
         'vwCategories',
         'dbo',
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
   

/* SQL generated to add new entity Categories to application ID: '131fb286-9550-4aa7-925a-896868d9ed55' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('131fb286-9550-4aa7-925a-896868d9ed55', '7e388af0-d74e-4e68-b8d6-8c3fa018f9cf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '131fb286-9550-4aa7-925a-896868d9ed55'))

/* SQL generated to add new permission for entity Categories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7e388af0-d74e-4e68-b8d6-8c3fa018f9cf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Categories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7e388af0-d74e-4e68-b8d6-8c3fa018f9cf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Categories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7e388af0-d74e-4e68-b8d6-8c3fa018f9cf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '38da6337-5786-423d-8785-565297d4ce3a',
         'Customers',
         NULL,
         NULL,
         NULL,
         'Customers',
         'vwCustomers',
         'dbo',
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
   

/* SQL generated to add new entity Customers to application ID: '131FB286-9550-4AA7-925A-896868D9ED55' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('131FB286-9550-4AA7-925A-896868D9ED55', '38da6337-5786-423d-8785-565297d4ce3a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '131FB286-9550-4AA7-925A-896868D9ED55'))

/* SQL generated to add new permission for entity Customers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('38da6337-5786-423d-8785-565297d4ce3a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Customers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('38da6337-5786-423d-8785-565297d4ce3a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Customers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('38da6337-5786-423d-8785-565297d4ce3a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'd5ae3ac0-9898-4f1f-b424-52d40b452145',
         'Products',
         NULL,
         NULL,
         NULL,
         'Products',
         'vwProducts',
         'dbo',
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
   

/* SQL generated to add new entity Products to application ID: '131FB286-9550-4AA7-925A-896868D9ED55' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('131FB286-9550-4AA7-925A-896868D9ED55', 'd5ae3ac0-9898-4f1f-b424-52d40b452145', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '131FB286-9550-4AA7-925A-896868D9ED55'))

/* SQL generated to add new permission for entity Products for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d5ae3ac0-9898-4f1f-b424-52d40b452145', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Products for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d5ae3ac0-9898-4f1f-b424-52d40b452145', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Products for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d5ae3ac0-9898-4f1f-b424-52d40b452145', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '03b0b5f4-eb84-4c2c-8247-7d851464ef30',
         'Orders',
         NULL,
         NULL,
         NULL,
         'Orders',
         'vwOrders',
         'dbo',
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
   

/* SQL generated to add new entity Orders to application ID: '131FB286-9550-4AA7-925A-896868D9ED55' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('131FB286-9550-4AA7-925A-896868D9ED55', '03b0b5f4-eb84-4c2c-8247-7d851464ef30', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '131FB286-9550-4AA7-925A-896868D9ED55'))

/* SQL generated to add new permission for entity Orders for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('03b0b5f4-eb84-4c2c-8247-7d851464ef30', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Orders for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('03b0b5f4-eb84-4c2c-8247-7d851464ef30', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Orders for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('03b0b5f4-eb84-4c2c-8247-7d851464ef30', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Order Details */

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
         '8f7a4c30-d5a8-4f33-ad4e-7abed1e55040',
         'Order Details',
         NULL,
         NULL,
         NULL,
         'OrderDetails',
         'vwOrderDetails',
         'dbo',
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
   

/* SQL generated to add new entity Order Details to application ID: '131FB286-9550-4AA7-925A-896868D9ED55' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('131FB286-9550-4AA7-925A-896868D9ED55', '8f7a4c30-d5a8-4f33-ad4e-7abed1e55040', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '131FB286-9550-4AA7-925A-896868D9ED55'))

/* SQL generated to add new permission for entity Order Details for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8f7a4c30-d5a8-4f33-ad4e-7abed1e55040', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Order Details for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8f7a4c30-d5a8-4f33-ad4e-7abed1e55040', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Order Details for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8f7a4c30-d5a8-4f33-ad4e-7abed1e55040', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Products */
ALTER TABLE [dbo].[Products] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Products */
ALTER TABLE [dbo].[Products] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Customers */
ALTER TABLE [dbo].[Customers] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Customers */
ALTER TABLE [dbo].[Customers] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.OrderDetails */
ALTER TABLE [dbo].[OrderDetails] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.OrderDetails */
ALTER TABLE [dbo].[OrderDetails] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Orders */
ALTER TABLE [dbo].[Orders] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Orders */
ALTER TABLE [dbo].[Orders] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Categories */
ALTER TABLE [dbo].[Categories] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Categories */
ALTER TABLE [dbo].[Categories] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b29ef5f9-ff85-41ce-9979-454440829b87'  OR 
               (EntityID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145' AND Name = 'ProductID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b29ef5f9-ff85-41ce-9979-454440829b87',
            'D5AE3AC0-9898-4F1F-B424-52D40B452145', -- Entity: Products
            100001,
            'ProductID',
            'Product ID',
            NULL,
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
         WHERE ID = '081e9427-c02a-420d-a26f-8aa16865c200'  OR 
               (EntityID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145' AND Name = 'ProductName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '081e9427-c02a-420d-a26f-8aa16865c200',
            'D5AE3AC0-9898-4F1F-B424-52D40B452145', -- Entity: Products
            100002,
            'ProductName',
            'Product Name',
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
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6e190cbb-123a-4e26-a211-de5659d630eb'  OR 
               (EntityID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145' AND Name = 'Price')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e190cbb-123a-4e26-a211-de5659d630eb',
            'D5AE3AC0-9898-4F1F-B424-52D40B452145', -- Entity: Products
            100003,
            'Price',
            'Price',
            NULL,
            'decimal',
            9,
            18,
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
         WHERE ID = 'e2423572-2c3c-4d7f-ab1d-7375ea12b4ed'  OR 
               (EntityID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145' AND Name = 'CategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e2423572-2c3c-4d7f-ab1d-7375ea12b4ed',
            'D5AE3AC0-9898-4F1F-B424-52D40B452145', -- Entity: Products
            100004,
            'CategoryID',
            'Category ID',
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
         WHERE ID = '73b2f02a-4643-47a2-8e6d-ad5173659984'  OR 
               (EntityID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '73b2f02a-4643-47a2-8e6d-ad5173659984',
            'D5AE3AC0-9898-4F1F-B424-52D40B452145', -- Entity: Products
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
         WHERE ID = '71fba21a-cb12-4792-819a-86594295fe28'  OR 
               (EntityID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '71fba21a-cb12-4792-819a-86594295fe28',
            'D5AE3AC0-9898-4F1F-B424-52D40B452145', -- Entity: Products
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
         WHERE ID = '8390af18-3a5d-466b-997a-df17e62ea997'  OR 
               (EntityID = '38DA6337-5786-423D-8785-565297D4CE3A' AND Name = 'CustomerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8390af18-3a5d-466b-997a-df17e62ea997',
            '38DA6337-5786-423D-8785-565297D4CE3A', -- Entity: Customers
            100001,
            'CustomerID',
            'Customer ID',
            NULL,
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
         WHERE ID = '01033470-7e51-48a0-8bee-d8cdcafe4ad0'  OR 
               (EntityID = '38DA6337-5786-423D-8785-565297D4CE3A' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '01033470-7e51-48a0-8bee-d8cdcafe4ad0',
            '38DA6337-5786-423D-8785-565297D4CE3A', -- Entity: Customers
            100002,
            'Name',
            'Name',
            NULL,
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
         WHERE ID = 'f075288e-6ba6-4222-9442-ca440be96eef'  OR 
               (EntityID = '38DA6337-5786-423D-8785-565297D4CE3A' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f075288e-6ba6-4222-9442-ca440be96eef',
            '38DA6337-5786-423D-8785-565297D4CE3A', -- Entity: Customers
            100003,
            'Email',
            'Email',
            NULL,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '037cd22d-c457-4e62-bc80-f451a0ac8424'  OR 
               (EntityID = '38DA6337-5786-423D-8785-565297D4CE3A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '037cd22d-c457-4e62-bc80-f451a0ac8424',
            '38DA6337-5786-423D-8785-565297D4CE3A', -- Entity: Customers
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
         WHERE ID = '0f4a13f3-aa43-41de-92c8-2de5dda34e7f'  OR 
               (EntityID = '38DA6337-5786-423D-8785-565297D4CE3A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0f4a13f3-aa43-41de-92c8-2de5dda34e7f',
            '38DA6337-5786-423D-8785-565297D4CE3A', -- Entity: Customers
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ed299d18-916e-4941-b9dd-66af56a7751b'  OR 
               (EntityID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040' AND Name = 'OrderDetailID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ed299d18-916e-4941-b9dd-66af56a7751b',
            '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', -- Entity: Order Details
            100001,
            'OrderDetailID',
            'Order Detail ID',
            NULL,
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
         WHERE ID = '1a780aad-f357-41c6-a431-e2fa50f50a25'  OR 
               (EntityID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040' AND Name = 'OrderID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1a780aad-f357-41c6-a431-e2fa50f50a25',
            '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', -- Entity: Order Details
            100002,
            'OrderID',
            'Order ID',
            NULL,
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
         WHERE ID = '4689f333-e51e-4b7c-9bd0-9b71910ed31c'  OR 
               (EntityID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040' AND Name = 'ProductID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4689f333-e51e-4b7c-9bd0-9b71910ed31c',
            '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', -- Entity: Order Details
            100003,
            'ProductID',
            'Product ID',
            NULL,
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
         WHERE ID = '82fb01b6-2ab3-4766-bad1-2ea6e002c049'  OR 
               (EntityID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040' AND Name = 'Quantity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '82fb01b6-2ab3-4766-bad1-2ea6e002c049',
            '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', -- Entity: Order Details
            100004,
            'Quantity',
            'Quantity',
            NULL,
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
         WHERE ID = '37d17af7-6d07-411d-8ec2-df1bb9d2238b'  OR 
               (EntityID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '37d17af7-6d07-411d-8ec2-df1bb9d2238b',
            '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', -- Entity: Order Details
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
         WHERE ID = '707970bf-2579-419d-ba4e-8dfa9401e5fe'  OR 
               (EntityID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '707970bf-2579-419d-ba4e-8dfa9401e5fe',
            '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', -- Entity: Order Details
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
         WHERE ID = '45e0770d-4034-4660-ae77-09f4464ae580'  OR 
               (EntityID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30' AND Name = 'OrderID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '45e0770d-4034-4660-ae77-09f4464ae580',
            '03B0B5F4-EB84-4C2C-8247-7D851464EF30', -- Entity: Orders
            100001,
            'OrderID',
            'Order ID',
            NULL,
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
         WHERE ID = '84ea7d9e-4203-41ad-9831-b0ca8144c654'  OR 
               (EntityID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30' AND Name = 'CustomerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '84ea7d9e-4203-41ad-9831-b0ca8144c654',
            '03B0B5F4-EB84-4C2C-8247-7D851464EF30', -- Entity: Orders
            100002,
            'CustomerID',
            'Customer ID',
            NULL,
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
         WHERE ID = 'e44226db-3906-4d89-a4b9-5acd52abce3e'  OR 
               (EntityID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30' AND Name = 'OrderDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e44226db-3906-4d89-a4b9-5acd52abce3e',
            '03B0B5F4-EB84-4C2C-8247-7D851464EF30', -- Entity: Orders
            100003,
            'OrderDate',
            'Order Date',
            NULL,
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = 'aebe7a60-ca2c-4586-ba71-2bb9735fe899'  OR 
               (EntityID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30' AND Name = 'TotalAmount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aebe7a60-ca2c-4586-ba71-2bb9735fe899',
            '03B0B5F4-EB84-4C2C-8247-7D851464EF30', -- Entity: Orders
            100004,
            'TotalAmount',
            'Total Amount',
            NULL,
            'decimal',
            9,
            18,
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
         WHERE ID = '81fa9887-9d7f-4b4d-ab9e-9b43489ef073'  OR 
               (EntityID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '81fa9887-9d7f-4b4d-ab9e-9b43489ef073',
            '03B0B5F4-EB84-4C2C-8247-7D851464EF30', -- Entity: Orders
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
         WHERE ID = '200942cf-9f3a-43a3-8c48-6628f43d75a2'  OR 
               (EntityID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '200942cf-9f3a-43a3-8c48-6628f43d75a2',
            '03B0B5F4-EB84-4C2C-8247-7D851464EF30', -- Entity: Orders
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
         WHERE ID = 'ba99c674-4b13-4a6f-a3ba-09e1b2f4b8c6'  OR 
               (EntityID = '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF' AND Name = 'CategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ba99c674-4b13-4a6f-a3ba-09e1b2f4b8c6',
            '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF', -- Entity: Categories
            100001,
            'CategoryID',
            'Category ID',
            NULL,
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
         WHERE ID = 'a41292ba-03d9-4e7c-9f53-031648e15d5c'  OR 
               (EntityID = '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF' AND Name = 'CategoryName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a41292ba-03d9-4e7c-9f53-031648e15d5c',
            '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF', -- Entity: Categories
            100002,
            'CategoryName',
            'Category Name',
            NULL,
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
         WHERE ID = 'ee5ffae4-2801-43d6-9e96-d15aa9c5ec6c'  OR 
               (EntityID = '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ee5ffae4-2801-43d6-9e96-d15aa9c5ec6c',
            '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF', -- Entity: Categories
            100003,
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
         WHERE ID = '258b47f0-88c2-4d8d-a344-e4c7c9681b91'  OR 
               (EntityID = '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '258b47f0-88c2-4d8d-a344-e4c7c9681b91',
            '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF', -- Entity: Categories
            100004,
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
      WHERE ID = '8a583f40-f1b6-4d96-ad7e-2cc6abb1350d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8a583f40-f1b6-4d96-ad7e-2cc6abb1350d', 'D5AE3AC0-9898-4F1F-B424-52D40B452145', '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', 'ProductID', 'One To Many', 1, 1, 'Order Details', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'bec981f7-a97e-425e-8bd5-f842126ec6f0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('bec981f7-a97e-425e-8bd5-f842126ec6f0', '38DA6337-5786-423D-8785-565297D4CE3A', '03B0B5F4-EB84-4C2C-8247-7D851464EF30', 'CustomerID', 'One To Many', 1, 1, 'Orders', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'bacc331a-61c7-4573-a9b0-4920c314f495'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('bacc331a-61c7-4573-a9b0-4920c314f495', '03B0B5F4-EB84-4C2C-8247-7D851464EF30', '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', 'OrderID', 'One To Many', 1, 1, 'Order Details', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b6309846-724e-4275-9cb0-8df6221d4230'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b6309846-724e-4275-9cb0-8df6221d4230', '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF', 'D5AE3AC0-9898-4F1F-B424-52D40B452145', 'CategoryID', 'One To Many', 1, 1, 'Products', 1);
   END
                              

/* Index for Foreign Keys for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for OrderDetails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Order Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderID in table OrderDetails
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderDetails_OrderID' 
    AND object_id = OBJECT_ID('[dbo].[OrderDetails]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderDetails_OrderID ON [dbo].[OrderDetails] ([OrderID]);

-- Index for foreign key ProductID in table OrderDetails
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderDetails_ProductID' 
    AND object_id = OBJECT_ID('[dbo].[OrderDetails]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderDetails_ProductID ON [dbo].[OrderDetails] ([ProductID]);

/* Index for Foreign Keys for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CustomerID in table Orders
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Orders_CustomerID' 
    AND object_id = OBJECT_ID('[dbo].[Orders]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Orders_CustomerID ON [dbo].[Orders] ([CustomerID]);

/* Index for Foreign Keys for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Products
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Products_CategoryID' 
    AND object_id = OBJECT_ID('[dbo].[Products]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Products_CategoryID ON [dbo].[Products] ([CategoryID]);

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
-----               SCHEMA:      dbo
-----               BASE TABLE:  Categories
-----               PRIMARY KEY: CategoryID
------------------------------------------------------------
IF OBJECT_ID('[dbo].[vwCategories]', 'V') IS NOT NULL
    DROP VIEW [dbo].[vwCategories];
GO

CREATE VIEW [dbo].[vwCategories]
AS
SELECT
    c.*
FROM
    [dbo].[Categories] AS c
GO
GRANT SELECT ON [dbo].[vwCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: Permissions for vwCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [dbo].[vwCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spCreateCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Categories
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spCreateCategories]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spCreateCategories];
GO

CREATE PROCEDURE [dbo].[spCreateCategories]
    @CategoryID int = NULL,
    @CategoryName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [dbo].[Categories]
        (
            [CategoryID],
                [CategoryName]
        )
    VALUES
        (
            @CategoryID,
                @CategoryName
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [dbo].[vwCategories] WHERE [CategoryID] = @CategoryID
END
GO
GRANT EXECUTE ON [dbo].[spCreateCategories] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Categories */

GRANT EXECUTE ON [dbo].[spCreateCategories] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spUpdateCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Categories
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spUpdateCategories]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spUpdateCategories];
GO

CREATE PROCEDURE [dbo].[spUpdateCategories]
    @CategoryID int,
    @CategoryName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Categories]
    SET
        [CategoryName] = @CategoryName
    WHERE
        [CategoryID] = @CategoryID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [dbo].[vwCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [dbo].[vwCategories]
                                    WHERE
                                        [CategoryID] = @CategoryID
                                    
END
GO

GRANT EXECUTE ON [dbo].[spUpdateCategories] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Categories table
------------------------------------------------------------
IF OBJECT_ID('[dbo].[trgUpdateCategories]', 'TR') IS NOT NULL
    DROP TRIGGER [dbo].[trgUpdateCategories];
GO
CREATE TRIGGER [dbo].trgUpdateCategories
ON [dbo].[Categories]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Categories]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [dbo].[Categories] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[CategoryID] = I.[CategoryID];
END;
GO
        

/* spUpdate Permissions for Categories */

GRANT EXECUTE ON [dbo].[spUpdateCategories] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Categories
-- Item: spDeleteCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Categories
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spDeleteCategories]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteCategories];
GO

CREATE PROCEDURE [dbo].[spDeleteCategories]
    @CategoryID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [dbo].[Categories]
    WHERE
        [CategoryID] = @CategoryID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [CategoryID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @CategoryID AS [CategoryID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [dbo].[spDeleteCategories] TO [cdp_Integration]
    

/* spDelete Permissions for Categories */

GRANT EXECUTE ON [dbo].[spDeleteCategories] TO [cdp_Integration]



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
-----               SCHEMA:      dbo
-----               BASE TABLE:  Customers
-----               PRIMARY KEY: CustomerID
------------------------------------------------------------
IF OBJECT_ID('[dbo].[vwCustomers]', 'V') IS NOT NULL
    DROP VIEW [dbo].[vwCustomers];
GO

CREATE VIEW [dbo].[vwCustomers]
AS
SELECT
    c.*
FROM
    [dbo].[Customers] AS c
GO
GRANT SELECT ON [dbo].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Permissions for vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [dbo].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spCreateCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Customers
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spCreateCustomers]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spCreateCustomers];
GO

CREATE PROCEDURE [dbo].[spCreateCustomers]
    @CustomerID int = NULL,
    @Name nvarchar(100),
    @Email nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [dbo].[Customers]
        (
            [CustomerID],
                [Name],
                [Email]
        )
    VALUES
        (
            @CustomerID,
                @Name,
                @Email
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [dbo].[vwCustomers] WHERE [CustomerID] = @CustomerID
END
GO
GRANT EXECUTE ON [dbo].[spCreateCustomers] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Customers */

GRANT EXECUTE ON [dbo].[spCreateCustomers] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spUpdateCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Customers
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spUpdateCustomers]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spUpdateCustomers];
GO

CREATE PROCEDURE [dbo].[spUpdateCustomers]
    @CustomerID int,
    @Name nvarchar(100),
    @Email nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Customers]
    SET
        [Name] = @Name,
        [Email] = @Email
    WHERE
        [CustomerID] = @CustomerID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [dbo].[vwCustomers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [dbo].[vwCustomers]
                                    WHERE
                                        [CustomerID] = @CustomerID
                                    
END
GO

GRANT EXECUTE ON [dbo].[spUpdateCustomers] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Customers table
------------------------------------------------------------
IF OBJECT_ID('[dbo].[trgUpdateCustomers]', 'TR') IS NOT NULL
    DROP TRIGGER [dbo].[trgUpdateCustomers];
GO
CREATE TRIGGER [dbo].trgUpdateCustomers
ON [dbo].[Customers]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Customers]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [dbo].[Customers] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[CustomerID] = I.[CustomerID];
END;
GO
        

/* spUpdate Permissions for Customers */

GRANT EXECUTE ON [dbo].[spUpdateCustomers] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: spDeleteCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Customers
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spDeleteCustomers]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteCustomers];
GO

CREATE PROCEDURE [dbo].[spDeleteCustomers]
    @CustomerID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [dbo].[Customers]
    WHERE
        [CustomerID] = @CustomerID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [CustomerID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @CustomerID AS [CustomerID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [dbo].[spDeleteCustomers] TO [cdp_Integration]
    

/* spDelete Permissions for Customers */

GRANT EXECUTE ON [dbo].[spDeleteCustomers] TO [cdp_Integration]



/* Base View SQL for Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Order Details
-- Item: vwOrderDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Order Details
-----               SCHEMA:      dbo
-----               BASE TABLE:  OrderDetails
-----               PRIMARY KEY: OrderDetailID
------------------------------------------------------------
IF OBJECT_ID('[dbo].[vwOrderDetails]', 'V') IS NOT NULL
    DROP VIEW [dbo].[vwOrderDetails];
GO

CREATE VIEW [dbo].[vwOrderDetails]
AS
SELECT
    o.*
FROM
    [dbo].[OrderDetails] AS o
GO
GRANT SELECT ON [dbo].[vwOrderDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Order Details
-- Item: Permissions for vwOrderDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [dbo].[vwOrderDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Order Details
-- Item: spCreateOrderDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderDetails
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spCreateOrderDetails]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spCreateOrderDetails];
GO

CREATE PROCEDURE [dbo].[spCreateOrderDetails]
    @OrderDetailID int = NULL,
    @OrderID int,
    @ProductID int,
    @Quantity int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [dbo].[OrderDetails]
        (
            [OrderDetailID],
                [OrderID],
                [ProductID],
                [Quantity]
        )
    VALUES
        (
            @OrderDetailID,
                @OrderID,
                @ProductID,
                @Quantity
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [dbo].[vwOrderDetails] WHERE [OrderDetailID] = @OrderDetailID
END
GO
GRANT EXECUTE ON [dbo].[spCreateOrderDetails] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Order Details */

GRANT EXECUTE ON [dbo].[spCreateOrderDetails] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Order Details
-- Item: spUpdateOrderDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderDetails
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spUpdateOrderDetails]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spUpdateOrderDetails];
GO

CREATE PROCEDURE [dbo].[spUpdateOrderDetails]
    @OrderDetailID int,
    @OrderID int,
    @ProductID int,
    @Quantity int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[OrderDetails]
    SET
        [OrderID] = @OrderID,
        [ProductID] = @ProductID,
        [Quantity] = @Quantity
    WHERE
        [OrderDetailID] = @OrderDetailID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [dbo].[vwOrderDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [dbo].[vwOrderDetails]
                                    WHERE
                                        [OrderDetailID] = @OrderDetailID
                                    
END
GO

GRANT EXECUTE ON [dbo].[spUpdateOrderDetails] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderDetails table
------------------------------------------------------------
IF OBJECT_ID('[dbo].[trgUpdateOrderDetails]', 'TR') IS NOT NULL
    DROP TRIGGER [dbo].[trgUpdateOrderDetails];
GO
CREATE TRIGGER [dbo].trgUpdateOrderDetails
ON [dbo].[OrderDetails]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[OrderDetails]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [dbo].[OrderDetails] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[OrderDetailID] = I.[OrderDetailID];
END;
GO
        

/* spUpdate Permissions for Order Details */

GRANT EXECUTE ON [dbo].[spUpdateOrderDetails] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Order Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Order Details
-- Item: spDeleteOrderDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderDetails
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spDeleteOrderDetails]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteOrderDetails];
GO

CREATE PROCEDURE [dbo].[spDeleteOrderDetails]
    @OrderDetailID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [dbo].[OrderDetails]
    WHERE
        [OrderDetailID] = @OrderDetailID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [OrderDetailID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @OrderDetailID AS [OrderDetailID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [dbo].[spDeleteOrderDetails] TO [cdp_Integration]
    

/* spDelete Permissions for Order Details */

GRANT EXECUTE ON [dbo].[spDeleteOrderDetails] TO [cdp_Integration]



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
-----               SCHEMA:      dbo
-----               BASE TABLE:  Orders
-----               PRIMARY KEY: OrderID
------------------------------------------------------------
IF OBJECT_ID('[dbo].[vwOrders]', 'V') IS NOT NULL
    DROP VIEW [dbo].[vwOrders];
GO

CREATE VIEW [dbo].[vwOrders]
AS
SELECT
    o.*
FROM
    [dbo].[Orders] AS o
GO
GRANT SELECT ON [dbo].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: Permissions for vwOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [dbo].[vwOrders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spCreateOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Orders
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spCreateOrders]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spCreateOrders];
GO

CREATE PROCEDURE [dbo].[spCreateOrders]
    @OrderID int = NULL,
    @CustomerID int,
    @OrderDate datetime,
    @TotalAmount decimal(18, 2)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [dbo].[Orders]
        (
            [OrderID],
                [CustomerID],
                [OrderDate],
                [TotalAmount]
        )
    VALUES
        (
            @OrderID,
                @CustomerID,
                @OrderDate,
                @TotalAmount
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [dbo].[vwOrders] WHERE [OrderID] = @OrderID
END
GO
GRANT EXECUTE ON [dbo].[spCreateOrders] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Orders */

GRANT EXECUTE ON [dbo].[spCreateOrders] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spUpdateOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Orders
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spUpdateOrders]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spUpdateOrders];
GO

CREATE PROCEDURE [dbo].[spUpdateOrders]
    @OrderID int,
    @CustomerID int,
    @OrderDate datetime,
    @TotalAmount decimal(18, 2)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Orders]
    SET
        [CustomerID] = @CustomerID,
        [OrderDate] = @OrderDate,
        [TotalAmount] = @TotalAmount
    WHERE
        [OrderID] = @OrderID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [dbo].[vwOrders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [dbo].[vwOrders]
                                    WHERE
                                        [OrderID] = @OrderID
                                    
END
GO

GRANT EXECUTE ON [dbo].[spUpdateOrders] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Orders table
------------------------------------------------------------
IF OBJECT_ID('[dbo].[trgUpdateOrders]', 'TR') IS NOT NULL
    DROP TRIGGER [dbo].[trgUpdateOrders];
GO
CREATE TRIGGER [dbo].trgUpdateOrders
ON [dbo].[Orders]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Orders]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [dbo].[Orders] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[OrderID] = I.[OrderID];
END;
GO
        

/* spUpdate Permissions for Orders */

GRANT EXECUTE ON [dbo].[spUpdateOrders] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Orders */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Orders
-- Item: spDeleteOrders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Orders
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spDeleteOrders]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteOrders];
GO

CREATE PROCEDURE [dbo].[spDeleteOrders]
    @OrderID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [dbo].[Orders]
    WHERE
        [OrderID] = @OrderID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [OrderID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @OrderID AS [OrderID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [dbo].[spDeleteOrders] TO [cdp_Integration]
    

/* spDelete Permissions for Orders */

GRANT EXECUTE ON [dbo].[spDeleteOrders] TO [cdp_Integration]



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
-----               SCHEMA:      dbo
-----               BASE TABLE:  Products
-----               PRIMARY KEY: ProductID
------------------------------------------------------------
IF OBJECT_ID('[dbo].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [dbo].[vwProducts];
GO

CREATE VIEW [dbo].[vwProducts]
AS
SELECT
    p.*
FROM
    [dbo].[Products] AS p
GO
GRANT SELECT ON [dbo].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [dbo].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spCreateProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Products
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spCreateProducts]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spCreateProducts];
GO

CREATE PROCEDURE [dbo].[spCreateProducts]
    @ProductID int = NULL,
    @ProductName nvarchar(200),
    @Price decimal(18, 2),
    @CategoryID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [dbo].[Products]
        (
            [ProductID],
                [ProductName],
                [Price],
                [CategoryID]
        )
    VALUES
        (
            @ProductID,
                @ProductName,
                @Price,
                @CategoryID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [dbo].[vwProducts] WHERE [ProductID] = @ProductID
END
GO
GRANT EXECUTE ON [dbo].[spCreateProducts] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Products */

GRANT EXECUTE ON [dbo].[spCreateProducts] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spUpdateProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Products
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spUpdateProducts]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spUpdateProducts];
GO

CREATE PROCEDURE [dbo].[spUpdateProducts]
    @ProductID int,
    @ProductName nvarchar(200),
    @Price decimal(18, 2),
    @CategoryID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Products]
    SET
        [ProductName] = @ProductName,
        [Price] = @Price,
        [CategoryID] = @CategoryID
    WHERE
        [ProductID] = @ProductID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [dbo].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [dbo].[vwProducts]
                                    WHERE
                                        [ProductID] = @ProductID
                                    
END
GO

GRANT EXECUTE ON [dbo].[spUpdateProducts] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Products table
------------------------------------------------------------
IF OBJECT_ID('[dbo].[trgUpdateProducts]', 'TR') IS NOT NULL
    DROP TRIGGER [dbo].[trgUpdateProducts];
GO
CREATE TRIGGER [dbo].trgUpdateProducts
ON [dbo].[Products]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [dbo].[Products]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [dbo].[Products] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ProductID] = I.[ProductID];
END;
GO
        

/* spUpdate Permissions for Products */

GRANT EXECUTE ON [dbo].[spUpdateProducts] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: spDeleteProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Products
------------------------------------------------------------
IF OBJECT_ID('[dbo].[spDeleteProducts]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[spDeleteProducts];
GO

CREATE PROCEDURE [dbo].[spDeleteProducts]
    @ProductID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [dbo].[Products]
    WHERE
        [ProductID] = @ProductID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ProductID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ProductID AS [ProductID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [dbo].[spDeleteProducts] TO [cdp_Integration]
    

/* spDelete Permissions for Products */

GRANT EXECUTE ON [dbo].[spDeleteProducts] TO [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '01033470-7E51-48A0-8BEE-D8CDCAFE4AD0'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '01033470-7E51-48A0-8BEE-D8CDCAFE4AD0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F075288E-6BA6-4222-9442-CA440BE96EEF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '01033470-7E51-48A0-8BEE-D8CDCAFE4AD0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F075288E-6BA6-4222-9442-CA440BE96EEF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4689F333-E51E-4B7C-9BD0-9B71910ED31C'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1A780AAD-F357-41C6-A431-E2FA50F50A25'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4689F333-E51E-4B7C-9BD0-9B71910ED31C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '82FB01B6-2AB3-4766-BAD1-2EA6E002C049'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1A780AAD-F357-41C6-A431-E2FA50F50A25'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4689F333-E51E-4B7C-9BD0-9B71910ED31C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '081E9427-C02A-420D-A26F-8AA16865C200'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '081E9427-C02A-420D-A26F-8AA16865C200'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E190CBB-123A-4E26-A211-DE5659D630EB'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '081E9427-C02A-420D-A26F-8AA16865C200'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '45E0770D-4034-4660-AE77-09F4464AE580'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '45E0770D-4034-4660-AE77-09F4464AE580'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E44226DB-3906-4D89-A4B9-5ACD52ABCE3E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AEBE7A60-CA2C-4586-BA71-2BB9735FE899'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '45E0770D-4034-4660-AE77-09F4464AE580'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'A41292BA-03D9-4E7C-9F53-031648E15D5C'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BA99C674-4B13-4A6F-A3BA-09E1B2F4B8C6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A41292BA-03D9-4E7C-9F53-031648E15D5C'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A41292BA-03D9-4E7C-9F53-031648E15D5C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ED299D18-916E-4941-B9DD-66AF56A7751B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1A780AAD-F357-41C6-A431-E2FA50F50A25'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Product',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4689F333-E51E-4B7C-9BD0-9B71910ED31C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Quantity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '82FB01B6-2AB3-4766-BAD1-2EA6E002C049'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37D17AF7-6D07-411D-8EC2-DF1BB9D2238B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '707970BF-2579-419D-BA4E-8DFA9401E5FE'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shopping-cart */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-shopping-cart',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('defb5832-7c0c-4cdc-a772-43264200589a', '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', 'FieldCategoryInfo', '{"Order Line Item":{"icon":"fa fa-box","description":"Core details of each order line, linking to the order, product, and specifying quantity"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a79858c3-466b-4b1e-9808-b1c62d557ab4', '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040', 'FieldCategoryIcons', '{"Order Line Item":"fa fa-box","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '8F7A4C30-D5A8-4F33-AD4E-7ABED1E55040'
         

/* Set categories for 5 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Customer Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Customer',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8390AF18-3A5D-466B-997A-DF17E62EA997'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Customer Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '01033470-7E51-48A0-8BEE-D8CDCAFE4AD0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Customer Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'F075288E-6BA6-4222-9442-CA440BE96EEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '037CD22D-C457-4E62-BC80-F451A0AC8424'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0F4A13F3-AA43-41DE-92C8-2DE5DDA34E7F'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-users */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-users',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '38DA6337-5786-423D-8785-565297D4CE3A'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7f552e2a-95d2-4e77-8fc8-3b458efe0d13', '38DA6337-5786-423D-8785-565297D4CE3A', 'FieldCategoryInfo', '{"Customer Details":{"icon":"fa fa-user","description":"Key identifying and contact information for each customer"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and update timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0da5cc13-c4a2-498e-b838-30effc1e6099', '38DA6337-5786-423D-8785-565297D4CE3A', 'FieldCategoryIcons', '{"Customer Details":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '38DA6337-5786-423D-8785-565297D4CE3A'
         

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '45E0770D-4034-4660-AE77-09F4464AE580'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E44226DB-3906-4D89-A4B9-5ACD52ABCE3E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Amount',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AEBE7A60-CA2C-4586-BA71-2BB9735FE899'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Customer Reference',
       GeneratedFormSection = 'Category',
       DisplayName = 'Customer',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84EA7D9E-4203-41AD-9831-B0CA8144C654'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '81FA9887-9D7F-4B4D-AB9E-9B43489EF073'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '200942CF-9F3A-43A3-8C48-6628F43D75A2'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shopping-cart */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-shopping-cart',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0dddc6fc-b17d-43ef-9b49-2a72b05ecf2f', '03B0B5F4-EB84-4C2C-8247-7D851464EF30', 'FieldCategoryInfo', '{"Order Details":{"icon":"fa fa-file-invoice-dollar","description":"Core order information such as ID, date, and total amount"},"Customer Reference":{"icon":"fa fa-user","description":"Link to the customer who placed the order"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5910a2bc-d2fd-411e-a47f-0fe033b3aed5', '03B0B5F4-EB84-4C2C-8247-7D851464EF30', 'FieldCategoryIcons', '{"Order Details":"fa fa-file-invoice-dollar","Customer Reference":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '03B0B5F4-EB84-4C2C-8247-7D851464EF30'
         

/* Set categories for 4 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA99C674-4B13-4A6F-A3BA-09E1B2F4B8C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A41292BA-03D9-4E7C-9F53-031648E15D5C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE5FFAE4-2801-43D6-9E96-D15AA9C5EC6C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '258B47F0-88C2-4D8D-A344-E4C7C9681B91'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-list */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-list',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('2ebfe881-a00f-491b-a01e-6fbb67deaaba', '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF', 'FieldCategoryInfo', '{"Category Information":{"icon":"fa fa-tag","description":"Core descriptive fields that define each category"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed automatically by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f35183cb-1b57-4b3c-8415-2647e5465605', '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF', 'FieldCategoryIcons', '{"Category Information":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '7E388AF0-D74E-4E68-B8D6-8C3FA018F9CF'
         

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Product',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B29EF5F9-FF85-41CE-9979-454440829B87'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Product Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '081E9427-C02A-420D-A26F-8AA16865C200'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Price',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E190CBB-123A-4E26-A211-DE5659D630EB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E2423572-2C3C-4D7F-AB1D-7375EA12B4ED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73B2F02A-4643-47A2-8E6D-AD5173659984'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '71FBA21A-CB12-4792-819A-86594295FE28'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-box */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-box',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4660d5c3-bbd1-446f-9519-0e70d5fc077e', 'D5AE3AC0-9898-4F1F-B424-52D40B452145', 'FieldCategoryInfo', '{"Product Information":{"icon":"fa fa-box","description":"Core details of the product including name, price, and classification"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit timestamps for record creation and updates"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a3946f60-34c3-41c7-a60d-a9c497cfec5e', 'D5AE3AC0-9898-4F1F-B424-52D40B452145', 'FieldCategoryIcons', '{"Product Information":"fa fa-box","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'D5AE3AC0-9898-4F1F-B424-52D40B452145'
         

