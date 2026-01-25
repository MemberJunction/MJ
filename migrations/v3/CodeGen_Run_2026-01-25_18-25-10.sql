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
         '36486dce-95c4-4827-9768-71816db10e7e',
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
   

/* SQL generated to add new entity Categories to application ID: '725eccfc-6d7d-4ae4-adc6-aa294d9f004e' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('725eccfc-6d7d-4ae4-adc6-aa294d9f004e', '36486dce-95c4-4827-9768-71816db10e7e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '725eccfc-6d7d-4ae4-adc6-aa294d9f004e'))

/* SQL generated to add new permission for entity Categories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('36486dce-95c4-4827-9768-71816db10e7e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Categories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('36486dce-95c4-4827-9768-71816db10e7e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Categories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('36486dce-95c4-4827-9768-71816db10e7e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '6722e65d-bb50-480a-935f-fc6f02c9ffe0',
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
   

/* SQL generated to add new entity Customers to application ID: '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E', '6722e65d-bb50-480a-935f-fc6f02c9ffe0', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E'))

/* SQL generated to add new permission for entity Customers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6722e65d-bb50-480a-935f-fc6f02c9ffe0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Customers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6722e65d-bb50-480a-935f-fc6f02c9ffe0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Customers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6722e65d-bb50-480a-935f-fc6f02c9ffe0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'cbf1c0ef-5f22-4788-83e1-4392e0876f52',
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
   

/* SQL generated to add new entity Products to application ID: '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E', 'cbf1c0ef-5f22-4788-83e1-4392e0876f52', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E'))

/* SQL generated to add new permission for entity Products for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cbf1c0ef-5f22-4788-83e1-4392e0876f52', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Products for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cbf1c0ef-5f22-4788-83e1-4392e0876f52', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Products for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cbf1c0ef-5f22-4788-83e1-4392e0876f52', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '7ce8b55f-aaf0-4f88-9784-72d981578521',
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
   

/* SQL generated to add new entity Orders to application ID: '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E', '7ce8b55f-aaf0-4f88-9784-72d981578521', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E'))

/* SQL generated to add new permission for entity Orders for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ce8b55f-aaf0-4f88-9784-72d981578521', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Orders for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ce8b55f-aaf0-4f88-9784-72d981578521', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Orders for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ce8b55f-aaf0-4f88-9784-72d981578521', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '2bd72d61-f3e5-4469-af5e-c1dfb24967d0',
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
   

/* SQL generated to add new entity Order Details to application ID: '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E', '2bd72d61-f3e5-4469-af5e-c1dfb24967d0', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '725ECCFC-6D7D-4AE4-ADC6-AA294D9F004E'))

/* SQL generated to add new permission for entity Order Details for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2bd72d61-f3e5-4469-af5e-c1dfb24967d0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Order Details for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2bd72d61-f3e5-4469-af5e-c1dfb24967d0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Order Details for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2bd72d61-f3e5-4469-af5e-c1dfb24967d0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Products */
ALTER TABLE [dbo].[Products] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Products */
ALTER TABLE [dbo].[Products] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Categories */
ALTER TABLE [dbo].[Categories] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Categories */
ALTER TABLE [dbo].[Categories] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Orders */
ALTER TABLE [dbo].[Orders] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Orders */
ALTER TABLE [dbo].[Orders] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.OrderDetails */
ALTER TABLE [dbo].[OrderDetails] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.OrderDetails */
ALTER TABLE [dbo].[OrderDetails] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity dbo.Customers */
ALTER TABLE [dbo].[Customers] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity dbo.Customers */
ALTER TABLE [dbo].[Customers] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f25f3a70-831b-4640-badd-8c8b2b77ce7a'  OR 
               (EntityID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52' AND Name = 'ProductID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f25f3a70-831b-4640-badd-8c8b2b77ce7a',
            'CBF1C0EF-5F22-4788-83E1-4392E0876F52', -- Entity: Products
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
         WHERE ID = '614361ef-2e12-41ee-9f54-7eb4a9a063b8'  OR 
               (EntityID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52' AND Name = 'ProductName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '614361ef-2e12-41ee-9f54-7eb4a9a063b8',
            'CBF1C0EF-5F22-4788-83E1-4392E0876F52', -- Entity: Products
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
         WHERE ID = '6ce9b116-d805-4efc-9ade-99b722c1ee5b'  OR 
               (EntityID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52' AND Name = 'Price')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6ce9b116-d805-4efc-9ade-99b722c1ee5b',
            'CBF1C0EF-5F22-4788-83E1-4392E0876F52', -- Entity: Products
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
         WHERE ID = 'aa08cffa-cfdc-4eac-88e1-b06c6ab198c7'  OR 
               (EntityID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52' AND Name = 'CategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aa08cffa-cfdc-4eac-88e1-b06c6ab198c7',
            'CBF1C0EF-5F22-4788-83E1-4392E0876F52', -- Entity: Products
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
         WHERE ID = 'b08b8e74-09f2-4784-b236-67e18de31a21'  OR 
               (EntityID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b08b8e74-09f2-4784-b236-67e18de31a21',
            'CBF1C0EF-5F22-4788-83E1-4392E0876F52', -- Entity: Products
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
         WHERE ID = '4bf626f3-2efc-4d60-b8c2-fcb6c05afd97'  OR 
               (EntityID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4bf626f3-2efc-4d60-b8c2-fcb6c05afd97',
            'CBF1C0EF-5F22-4788-83E1-4392E0876F52', -- Entity: Products
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
         WHERE ID = 'fc424d39-42f8-45a0-b66c-6c5c27458ef4'  OR 
               (EntityID = '36486DCE-95C4-4827-9768-71816DB10E7E' AND Name = 'CategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fc424d39-42f8-45a0-b66c-6c5c27458ef4',
            '36486DCE-95C4-4827-9768-71816DB10E7E', -- Entity: Categories
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
         WHERE ID = '3a383d71-5d4c-40b0-a58f-a6903d5690e6'  OR 
               (EntityID = '36486DCE-95C4-4827-9768-71816DB10E7E' AND Name = 'CategoryName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3a383d71-5d4c-40b0-a58f-a6903d5690e6',
            '36486DCE-95C4-4827-9768-71816DB10E7E', -- Entity: Categories
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
         WHERE ID = '52d11cd4-3747-4d5c-92c7-c5f710be253b'  OR 
               (EntityID = '36486DCE-95C4-4827-9768-71816DB10E7E' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '52d11cd4-3747-4d5c-92c7-c5f710be253b',
            '36486DCE-95C4-4827-9768-71816DB10E7E', -- Entity: Categories
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
         WHERE ID = 'b63d819c-31f6-4853-a342-29815eef9344'  OR 
               (EntityID = '36486DCE-95C4-4827-9768-71816DB10E7E' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b63d819c-31f6-4853-a342-29815eef9344',
            '36486DCE-95C4-4827-9768-71816DB10E7E', -- Entity: Categories
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '15eea406-71b6-4591-8691-cef889c3c5db'  OR 
               (EntityID = '7CE8B55F-AAF0-4F88-9784-72D981578521' AND Name = 'OrderID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '15eea406-71b6-4591-8691-cef889c3c5db',
            '7CE8B55F-AAF0-4F88-9784-72D981578521', -- Entity: Orders
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
         WHERE ID = 'cafd61d3-4ccb-4d96-80de-fc40483803d9'  OR 
               (EntityID = '7CE8B55F-AAF0-4F88-9784-72D981578521' AND Name = 'CustomerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cafd61d3-4ccb-4d96-80de-fc40483803d9',
            '7CE8B55F-AAF0-4F88-9784-72D981578521', -- Entity: Orders
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
         WHERE ID = '1d1d8024-672d-4bcb-8a95-f61ee2198f11'  OR 
               (EntityID = '7CE8B55F-AAF0-4F88-9784-72D981578521' AND Name = 'OrderDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1d1d8024-672d-4bcb-8a95-f61ee2198f11',
            '7CE8B55F-AAF0-4F88-9784-72D981578521', -- Entity: Orders
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
         WHERE ID = '0bf2c620-0617-4602-b2e3-90795ce6ffbd'  OR 
               (EntityID = '7CE8B55F-AAF0-4F88-9784-72D981578521' AND Name = 'TotalAmount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0bf2c620-0617-4602-b2e3-90795ce6ffbd',
            '7CE8B55F-AAF0-4F88-9784-72D981578521', -- Entity: Orders
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
         WHERE ID = 'edf32f26-30c0-4746-ae4a-a805c2653eed'  OR 
               (EntityID = '7CE8B55F-AAF0-4F88-9784-72D981578521' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'edf32f26-30c0-4746-ae4a-a805c2653eed',
            '7CE8B55F-AAF0-4F88-9784-72D981578521', -- Entity: Orders
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
         WHERE ID = '5581e67e-85be-4767-bbe9-c2cae2d56026'  OR 
               (EntityID = '7CE8B55F-AAF0-4F88-9784-72D981578521' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5581e67e-85be-4767-bbe9-c2cae2d56026',
            '7CE8B55F-AAF0-4F88-9784-72D981578521', -- Entity: Orders
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
         WHERE ID = 'f2a837e9-3aa1-4dd7-9fc8-0303d32e0428'  OR 
               (EntityID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0' AND Name = 'OrderDetailID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f2a837e9-3aa1-4dd7-9fc8-0303d32e0428',
            '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', -- Entity: Order Details
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
         WHERE ID = '14dc1425-7aec-4cc4-a4ac-8afa616d9a02'  OR 
               (EntityID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0' AND Name = 'OrderID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '14dc1425-7aec-4cc4-a4ac-8afa616d9a02',
            '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', -- Entity: Order Details
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
         WHERE ID = '774fb74e-8fe8-4030-9b1f-ec2a773fa29d'  OR 
               (EntityID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0' AND Name = 'ProductID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '774fb74e-8fe8-4030-9b1f-ec2a773fa29d',
            '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', -- Entity: Order Details
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
         WHERE ID = '1c89adf1-c424-4adf-b7bc-cde3ed57986a'  OR 
               (EntityID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0' AND Name = 'Quantity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1c89adf1-c424-4adf-b7bc-cde3ed57986a',
            '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', -- Entity: Order Details
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
         WHERE ID = 'd159f383-1d9b-4748-aff7-14664588ecfc'  OR 
               (EntityID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd159f383-1d9b-4748-aff7-14664588ecfc',
            '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', -- Entity: Order Details
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
         WHERE ID = '653e0fe4-f912-44cb-8421-0ae1491ea071'  OR 
               (EntityID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '653e0fe4-f912-44cb-8421-0ae1491ea071',
            '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', -- Entity: Order Details
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
         WHERE ID = '52376007-1b24-453c-90da-17b8cd128f7c'  OR 
               (EntityID = '6722E65D-BB50-480A-935F-FC6F02C9FFE0' AND Name = 'CustomerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '52376007-1b24-453c-90da-17b8cd128f7c',
            '6722E65D-BB50-480A-935F-FC6F02C9FFE0', -- Entity: Customers
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
         WHERE ID = '6e52e91d-3a04-412f-a063-4210ffe6c56a'  OR 
               (EntityID = '6722E65D-BB50-480A-935F-FC6F02C9FFE0' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e52e91d-3a04-412f-a063-4210ffe6c56a',
            '6722E65D-BB50-480A-935F-FC6F02C9FFE0', -- Entity: Customers
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
         WHERE ID = '84c29f0c-ecb6-4021-ab6b-406a575037df'  OR 
               (EntityID = '6722E65D-BB50-480A-935F-FC6F02C9FFE0' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '84c29f0c-ecb6-4021-ab6b-406a575037df',
            '6722E65D-BB50-480A-935F-FC6F02C9FFE0', -- Entity: Customers
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
         WHERE ID = '8c2f6b22-918b-4b9a-a873-272f5563cab1'  OR 
               (EntityID = '6722E65D-BB50-480A-935F-FC6F02C9FFE0' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8c2f6b22-918b-4b9a-a873-272f5563cab1',
            '6722E65D-BB50-480A-935F-FC6F02C9FFE0', -- Entity: Customers
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
         WHERE ID = '5304ae4c-b7c5-462c-97a1-841c84550a70'  OR 
               (EntityID = '6722E65D-BB50-480A-935F-FC6F02C9FFE0' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5304ae4c-b7c5-462c-97a1-841c84550a70',
            '6722E65D-BB50-480A-935F-FC6F02C9FFE0', -- Entity: Customers
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ddf44585-aa2a-4f38-9607-eae5919ba504'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ddf44585-aa2a-4f38-9607-eae5919ba504', 'CBF1C0EF-5F22-4788-83E1-4392E0876F52', '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', 'ProductID', 'One To Many', 1, 1, 'Order Details', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '7b299894-2b87-4d0e-9404-c829dee711f4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('7b299894-2b87-4d0e-9404-c829dee711f4', '36486DCE-95C4-4827-9768-71816DB10E7E', 'CBF1C0EF-5F22-4788-83E1-4392E0876F52', 'CategoryID', 'One To Many', 1, 1, 'Products', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b5743b99-470b-4e78-93f8-01bcc90c7726'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b5743b99-470b-4e78-93f8-01bcc90c7726', '7CE8B55F-AAF0-4F88-9784-72D981578521', '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', 'OrderID', 'One To Many', 1, 1, 'Order Details', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '187c92ef-63dc-455f-939f-6fdcf6b2efe2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('187c92ef-63dc-455f-939f-6fdcf6b2efe2', '6722E65D-BB50-480A-935F-FC6F02C9FFE0', '7CE8B55F-AAF0-4F88-9784-72D981578521', 'CustomerID', 'One To Many', 1, 1, 'Orders', 1);
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
            WHERE ID = '6E52E91D-3A04-412F-A063-4210FFE6C56A'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E52E91D-3A04-412F-A063-4210FFE6C56A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '84C29F0C-ECB6-4021-AB6B-406A575037DF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E52E91D-3A04-412F-A063-4210FFE6C56A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '84C29F0C-ECB6-4021-AB6B-406A575037DF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '614361EF-2E12-41EE-9F54-7EB4A9A063B8'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '614361EF-2E12-41EE-9F54-7EB4A9A063B8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6CE9B116-D805-4EFC-9ADE-99B722C1EE5B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '614361EF-2E12-41EE-9F54-7EB4A9A063B8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3A383D71-5D4C-40B0-A58F-A6903D5690E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3A383D71-5D4C-40B0-A58F-A6903D5690E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3A383D71-5D4C-40B0-A58F-A6903D5690E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '15EEA406-71B6-4591-8691-CEF889C3C5DB'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '15EEA406-71B6-4591-8691-CEF889C3C5DB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1D1D8024-672D-4BCB-8A95-F61EE2198F11'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0BF2C620-0617-4602-B2E3-90795CE6FFBD'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '15EEA406-71B6-4591-8691-CEF889C3C5DB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F2A837E9-3AA1-4DD7-9FC8-0303D32E0428'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F2A837E9-3AA1-4DD7-9FC8-0303D32E0428'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '14DC1425-7AEC-4CC4-A4AC-8AFA616D9A02'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '774FB74E-8FE8-4030-9B1F-EC2A773FA29D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1C89ADF1-C424-4ADF-B7BC-CDE3ED57986A'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '14DC1425-7AEC-4CC4-A4AC-8AFA616D9A02'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '774FB74E-8FE8-4030-9B1F-EC2A773FA29D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 4 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC424D39-42F8-45A0-B66C-6C5C27458EF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3A383D71-5D4C-40B0-A58F-A6903D5690E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52D11CD4-3747-4D5C-92C7-C5F710BE253B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B63D819C-31F6-4853-A342-29815EEF9344'
   AND AutoUpdateCategory = 1

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Product ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F25F3A70-831B-4640-BADD-8C8B2B77CE7A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Product Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '614361EF-2E12-41EE-9F54-7EB4A9A063B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Price',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6CE9B116-D805-4EFC-9ADE-99B722C1EE5B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Product Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA08CFFA-CFDC-4EAC-88E1-B06C6AB198C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B08B8E74-09F2-4784-B236-67E18DE31A21'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BF626F3-2EFC-4D60-B8C2-FCB6C05AFD97'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tags */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tags',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '36486DCE-95C4-4827-9768-71816DB10E7E'
               

/* Set entity icon to fa fa-shopping-cart */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-shopping-cart',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4c68287b-aefb-4508-8780-1d6241f223a3', '36486DCE-95C4-4827-9768-71816DB10E7E', 'FieldCategoryInfo', '{"Category Details":{"icon":"fa fa-tag","description":"Core lookup information defining each category"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6ce5b9bc-7d90-4389-ab8a-c574206037ae', 'CBF1C0EF-5F22-4788-83E1-4392E0876F52', 'FieldCategoryInfo', '{"Product Information":{"icon":"fa fa-box","description":"Core product details including name, price, and category association"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit timestamps for record creation and modification"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('669f2cb3-75b2-4556-8e55-2d4a4395a7a9', '36486DCE-95C4-4827-9768-71816DB10E7E', 'FieldCategoryIcons', '{"Category Details":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1da04a30-7690-4295-b619-2ea47dc66e72', 'CBF1C0EF-5F22-4788-83E1-4392E0876F52', 'FieldCategoryIcons', '{"Product Information":"fa fa-box","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '36486DCE-95C4-4827-9768-71816DB10E7E'
         

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'CBF1C0EF-5F22-4788-83E1-4392E0876F52'
         

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '15EEA406-71B6-4591-8691-CEF889C3C5DB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Customer',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CAFD61D3-4CCB-4D96-80DE-FC40483803D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D1D8024-672D-4BCB-8A95-F61EE2198F11'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Order Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Amount',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0BF2C620-0617-4602-B2E3-90795CE6FFBD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDF32F26-30C0-4746-AE4A-A805C2653EED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5581E67E-85BE-4767-BBE9-C2CAE2D56026'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shopping-cart */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-shopping-cart',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '7CE8B55F-AAF0-4F88-9784-72D981578521'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('11fbb1d1-75a1-4090-91a7-25840149347f', '7CE8B55F-AAF0-4F88-9784-72D981578521', 'FieldCategoryInfo', '{"Order Details":{"icon":"fa fa-receipt","description":"Key information that defines the order, including its identifier, customer, date, and total value"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9ad11bb0-8800-4344-9add-5057a152f1b0', '7CE8B55F-AAF0-4F88-9784-72D981578521', 'FieldCategoryIcons', '{"Order Details":"fa fa-receipt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '7CE8B55F-AAF0-4F88-9784-72D981578521'
         

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order Detail ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2A837E9-3AA1-4DD7-9FC8-0303D32E0428'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '14DC1425-7AEC-4CC4-A4AC-8AFA616D9A02'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Product',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '774FB74E-8FE8-4030-9B1F-EC2A773FA29D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Line Item',
       GeneratedFormSection = 'Category',
       DisplayName = 'Quantity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C89ADF1-C424-4ADF-B7BC-CDE3ED57986A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D159F383-1D9B-4748-AFF7-14664588ECFC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '653E0FE4-F912-44CB-8421-0AE1491EA071'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-box */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-box',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3c2d9602-caa7-495e-ab59-730c0ffe7699', '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', 'FieldCategoryInfo', '{"Line Item":{"icon":"fa fa-list","description":"Core details for each order line, including identifiers, product reference, and quantity"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('cca3476b-5700-43dc-acbc-0ab1328141ab', '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0', 'FieldCategoryIcons', '{"Line Item":"fa fa-list","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '2BD72D61-F3E5-4469-AF5E-C1DFB24967D0'
         

/* Set categories for 5 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Customer Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Customer',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52376007-1B24-453C-90DA-17B8CD128F7C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Customer Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E52E91D-3A04-412F-A063-4210FFE6C56A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Customer Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '84C29F0C-ECB6-4021-AB6B-406A575037DF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8C2F6B22-918B-4B9A-A873-272F5563CAB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5304AE4C-B7C5-462C-97A1-841C84550A70'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-users */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-users',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '6722E65D-BB50-480A-935F-FC6F02C9FFE0'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('05ace46f-4c9a-4ead-9dd0-a5fcc027e91d', '6722E65D-BB50-480A-935F-FC6F02C9FFE0', 'FieldCategoryInfo', '{"Customer Details":{"icon":"fa fa-user","description":"Core customer information including identifier, name, and email address"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7bbd7376-1ffe-484d-9684-54f19c59533a', '6722E65D-BB50-480A-935F-FC6F02C9FFE0', 'FieldCategoryIcons', '{"Customer Details":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '6722E65D-BB50-480A-935F-FC6F02C9FFE0'
         

