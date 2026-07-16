/* SQL generated to create new entity Company Admins */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'fc625cd0-9c6b-4daa-8058-ae6cf6fdfeb4',
         'Company Admins',
         NULL,
         'Company administrators.',
         NULL,
         'CompanyAdmin',
         'vwCompanyAdmins',
         'acgi',
         1,
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to create new application acgi */
INSERT INTO [${flyway:defaultSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('e6fb14de-93aa-416e-bbc4-55d2de51e8ca', 'acgi', 'Generated for schema', 'acgi', 'acgi', 1);

/* Adding role UI to application acgi */
INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('e6fb14de-93aa-416e-bbc4-55d2de51e8ca', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* Adding role Developer to application acgi */
INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('e6fb14de-93aa-416e-bbc4-55d2de51e8ca', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1);

/* Adding role Integration to application acgi */
INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('e6fb14de-93aa-416e-bbc4-55d2de51e8ca', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* SQL generated to add new entity Company Admins to application ID: 'e6fb14de-93aa-416e-bbc4-55d2de51e8ca' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('e6fb14de-93aa-416e-bbc4-55d2de51e8ca', 'fc625cd0-9c6b-4daa-8058-ae6cf6fdfeb4', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'e6fb14de-93aa-416e-bbc4-55d2de51e8ca'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Company Admins for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fc625cd0-9c6b-4daa-8058-ae6cf6fdfeb4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Company Admins for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fc625cd0-9c6b-4daa-8058-ae6cf6fdfeb4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Company Admins for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fc625cd0-9c6b-4daa-8058-ae6cf6fdfeb4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Customers */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '4222f814-415f-4856-a4fc-f7b1e0e648a6',
         'Customers',
         NULL,
         'ACGI customer/member (root of GET_CUST_INFO_XML). PK custId. Watermark = queue maxQueueNum.',
         NULL,
         'Customer',
         'vwCustomers',
         'acgi',
         1,
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity Customers to application ID: 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA', '4222f814-415f-4856-a4fc-f7b1e0e648a6', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Customers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4222f814-415f-4856-a4fc-f7b1e0e648a6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Customers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4222f814-415f-4856-a4fc-f7b1e0e648a6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Customers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4222f814-415f-4856-a4fc-f7b1e0e648a6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Employees */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '9ead9711-d819-4f22-bee8-77736edb72cc',
         'Employees',
         NULL,
         'Company-customer employees (employeeAttributes promoted).',
         NULL,
         'Employee',
         'vwEmployees',
         'acgi',
         1,
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
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity Employees to application ID: 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA', '9ead9711-d819-4f22-bee8-77736edb72cc', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Employees for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9ead9711-d819-4f22-bee8-77736edb72cc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Employees for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9ead9711-d819-4f22-bee8-77736edb72cc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Employees for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9ead9711-d819-4f22-bee8-77736edb72cc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Employee */
ALTER TABLE [acgi].[Employee] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Employee */
UPDATE [acgi].[Employee] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Employee */
ALTER TABLE [acgi].[Employee] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Employee */
ALTER TABLE [acgi].[Employee] ADD CONSTRAINT [DF_acgi_Employee___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Employee */
ALTER TABLE [acgi].[Employee] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Employee */
UPDATE [acgi].[Employee] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Employee */
ALTER TABLE [acgi].[Employee] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Employee */
ALTER TABLE [acgi].[Employee] ADD CONSTRAINT [DF_acgi_Employee___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.CompanyAdmin */
ALTER TABLE [acgi].[CompanyAdmin] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.CompanyAdmin */
UPDATE [acgi].[CompanyAdmin] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.CompanyAdmin */
ALTER TABLE [acgi].[CompanyAdmin] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.CompanyAdmin */
ALTER TABLE [acgi].[CompanyAdmin] ADD CONSTRAINT [DF_acgi_CompanyAdmin___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.CompanyAdmin */
ALTER TABLE [acgi].[CompanyAdmin] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.CompanyAdmin */
UPDATE [acgi].[CompanyAdmin] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.CompanyAdmin */
ALTER TABLE [acgi].[CompanyAdmin] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.CompanyAdmin */
ALTER TABLE [acgi].[CompanyAdmin] ADD CONSTRAINT [DF_acgi_CompanyAdmin___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Customer */
ALTER TABLE [acgi].[Customer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Customer */
UPDATE [acgi].[Customer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Customer */
ALTER TABLE [acgi].[Customer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity acgi.Customer */
ALTER TABLE [acgi].[Customer] ADD CONSTRAINT [DF_acgi_Customer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Customer */
ALTER TABLE [acgi].[Customer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Customer */
UPDATE [acgi].[Customer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Customer */
ALTER TABLE [acgi].[Customer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity acgi.Customer */
ALTER TABLE [acgi].[Customer] ADD CONSTRAINT [DF_acgi_Customer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75378d7b-451e-4d17-947f-6d9be517def8' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'employeeAttributes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '75378d7b-451e-4d17-947f-6d9be517def8',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100001,
            'employeeAttributes',
            'employee Attributes',
            'employeeAttributes (JSON array of the nested attribute/summary rows).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86f0ab69-2118-4698-a72a-70f2bb7b6b20' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'id')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86f0ab69-2118-4698-a72a-70f2bb7b6b20',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100002,
            'id',
            'id',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50c73202-adcd-47e9-be5b-187baeec9c0e' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'functionDescr')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '50c73202-adcd-47e9-be5b-187baeec9c0e',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100003,
            'functionDescr',
            'function Descr',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25b39992-3e2e-4c09-b795-ed09c8ec1cdd' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'lastName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '25b39992-3e2e-4c09-b795-ed09c8ec1cdd',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100004,
            'lastName',
            'last Name',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e792bba6-04dd-4ea5-970f-aa3a973d7274' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'titleCodeDescr')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e792bba6-04dd-4ea5-970f-aa3a973d7274',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100005,
            'titleCodeDescr',
            'title Code Descr',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b492292e-1743-4023-8c37-db6a4436647b' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'custId')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b492292e-1743-4023-8c37-db6a4436647b',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100006,
            'custId',
            'cust Id',
            'Owning customer (synthetic FK to Customer.custId; injected from the parent custInfo the record is nested under).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abdb57fb-e4c7-4a16-adae-e1de75eb510b' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'firstName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'abdb57fb-e4c7-4a16-adae-e1de75eb510b',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100007,
            'firstName',
            'first Name',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cecd955d-4a5d-4813-a316-23c798d9c5ba' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'titleCode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cecd955d-4a5d-4813-a316-23c798d9c5ba',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100008,
            'titleCode',
            'title Code',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67c6a2d8-fc6f-4fe3-8cbc-11b3f2d98a86' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'lockCode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '67c6a2d8-fc6f-4fe3-8cbc-11b3f2d98a86',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100009,
            'lockCode',
            'lock Code',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e43b924f-ab0f-4699-add2-c7e639056465' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'displayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e43b924f-ab0f-4699-add2-c7e639056465',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100010,
            'displayName',
            'display Name',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '702a0ede-7381-492c-afb4-611f292e7367' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'administrator')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '702a0ede-7381-492c-afb4-611f292e7367',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100011,
            'administrator',
            'administrator',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c9f13403-840f-417d-92c4-d63ea88c665c' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = 'functionCode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c9f13403-840f-417d-92c4-d63ea88c665c',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100012,
            'functionCode',
            'function Code',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c5bd554-2e38-4e38-a793-06e51b58eb4d' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3c5bd554-2e38-4e38-a793-06e51b58eb4d',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100013,
            '${flyway:defaultSchema}_integration_SyncStatus',
            'Mj Integration Sync Status',
            'Current sync status: Active, Archived, or Error',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be26c49d-152e-469b-94cb-6e9e7b94ab8f' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be26c49d-152e-469b-94cb-6e9e7b94ab8f',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100014,
            '__mj_integration_LastSyncedAt',
            'Mj Integration Last Synced At',
            'Timestamp of the last successful sync for this record',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e0d4a9f-e056-4189-b533-b97a82d473dc' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2e0d4a9f-e056-4189-b533-b97a82d473dc',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100015,
            '${flyway:defaultSchema}_integration_LastSyncedSnapshot',
            'Mj Integration Last Synced Snapshot',
            'The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f26bbbc3-88bc-4fef-93c7-78d56e23c503' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f26bbbc3-88bc-4fef-93c7-78d56e23c503',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100016,
            '${flyway:defaultSchema}_integration_SyncMessage',
            'Mj Integration Sync Message',
            'Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '799e0ef8-c1ea-49bf-b272-03b7b4c0a549' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '799e0ef8-c1ea-49bf-b272-03b7b4c0a549',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100017,
            '${flyway:defaultSchema}_integration_ContentHash',
            'Mj Integration Content Hash',
            'SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25d23bdf-dd0d-4f96-a0d4-581aed750e15' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '25d23bdf-dd0d-4f96-a0d4-581aed750e15',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100018,
            '${flyway:defaultSchema}_integration_CustomOverflow',
            'Mj Integration Custom Overflow',
            'Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6cfd2028-45b3-414f-a776-2b7a98526f2c' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6cfd2028-45b3-414f-a776-2b7a98526f2c',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100019,
            '${flyway:defaultSchema}_integration_ExternalVersion',
            'Mj Integration External Version',
            'The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8460742-066d-4d34-b752-7dd06b00f91b' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8460742-066d-4d34-b752-7dd06b00f91b',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100020,
            '${flyway:defaultSchema}_integration_LastSeenModifiedValue',
            'Mj Integration Last Seen Modified Value',
            'The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e15b8ae-0b4b-4db8-9b70-ff7f7f21530f' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6e15b8ae-0b4b-4db8-9b70-ff7f7f21530f',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100021,
            '__mj_integration_LastReconciledAt',
            'Mj Integration Last Reconciled At',
            'Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '442cfc63-359e-41fe-a9a1-9143a43a6a32' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '442cfc63-359e-41fe-a9a1-9143a43a6a32',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100022,
            '${flyway:defaultSchema}_integration_LastWriterDirection',
            'Mj Integration Last Writer Direction',
            'Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.',
            'nvarchar',
            20,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3fcc30c-014b-4204-8ad5-af314c0b16a3' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e3fcc30c-014b-4204-8ad5-af314c0b16a3',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100023,
            '${flyway:defaultSchema}_integration_IsTombstoned',
            'Mj Integration Is Tombstoned',
            'Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '328fee3b-ee4d-4c4a-8f9c-6739dbebc417' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '328fee3b-ee4d-4c4a-8f9c-6739dbebc417',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100024,
            '__mj_integration_DeletedDetectedAt',
            'Mj Integration Deleted Detected At',
            'Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a371a1c-edb0-420d-a229-a290a37916ee' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5a371a1c-edb0-420d-a229-a290a37916ee',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100025,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70b0c94a-1edf-46ca-b6ae-0bbdcef26d8d' OR (EntityID = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '70b0c94a-1edf-46ca-b6ae-0bbdcef26d8d',
            '9EAD9711-D819-4F22-BEE8-77736EDB72CC', -- Entity: Employees
            100026,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dedcb382-e936-4951-a90d-59cbe649aea3' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = 'custId')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dedcb382-e936-4951-a90d-59cbe649aea3',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100001,
            'custId',
            'cust Id',
            'Owning customer (synthetic FK to Customer.custId; injected from the parent custInfo the record is nested under).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '939068db-5a77-4014-9226-cbe6a1bc8f35' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = 'displayNm')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '939068db-5a77-4014-9226-cbe6a1bc8f35',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100002,
            'displayNm',
            'display Nm',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4982abb4-0931-4f2e-ab5c-10b773841244' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = 'id')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4982abb4-0931-4f2e-ab5c-10b773841244',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100003,
            'id',
            'id',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5cf6813e-4c7b-41df-9517-689dfeaef5af' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5cf6813e-4c7b-41df-9517-689dfeaef5af',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100004,
            '${flyway:defaultSchema}_integration_SyncStatus',
            'Mj Integration Sync Status',
            'Current sync status: Active, Archived, or Error',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '011fc8b7-9486-40ed-85e7-0ca9cab0f99f' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '011fc8b7-9486-40ed-85e7-0ca9cab0f99f',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100005,
            '__mj_integration_LastSyncedAt',
            'Mj Integration Last Synced At',
            'Timestamp of the last successful sync for this record',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9de2df96-7165-416a-ad82-6604faaba852' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9de2df96-7165-416a-ad82-6604faaba852',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100006,
            '${flyway:defaultSchema}_integration_LastSyncedSnapshot',
            'Mj Integration Last Synced Snapshot',
            'The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '784a8b0b-0a6b-4dee-92a6-5f5719c681a7' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '784a8b0b-0a6b-4dee-92a6-5f5719c681a7',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100007,
            '${flyway:defaultSchema}_integration_SyncMessage',
            'Mj Integration Sync Message',
            'Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0c1cfdc-d07c-45c5-ab7c-98a2bed7b122' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0c1cfdc-d07c-45c5-ab7c-98a2bed7b122',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100008,
            '${flyway:defaultSchema}_integration_ContentHash',
            'Mj Integration Content Hash',
            'SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e0614181-d004-486f-9403-2f6e7b364aa5' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e0614181-d004-486f-9403-2f6e7b364aa5',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100009,
            '${flyway:defaultSchema}_integration_CustomOverflow',
            'Mj Integration Custom Overflow',
            'Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9796f3a-0ceb-4c48-9960-10ab0fd33aff' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f9796f3a-0ceb-4c48-9960-10ab0fd33aff',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100010,
            '${flyway:defaultSchema}_integration_ExternalVersion',
            'Mj Integration External Version',
            'The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '62ce4305-c29b-48b3-877b-9203f51f45e2' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '62ce4305-c29b-48b3-877b-9203f51f45e2',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100011,
            '${flyway:defaultSchema}_integration_LastSeenModifiedValue',
            'Mj Integration Last Seen Modified Value',
            'The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '151e18e7-c69a-4b43-bf35-936ff9a4a336' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '151e18e7-c69a-4b43-bf35-936ff9a4a336',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100012,
            '__mj_integration_LastReconciledAt',
            'Mj Integration Last Reconciled At',
            'Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0134d9e9-1f30-4a92-923c-6c048950f90a' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0134d9e9-1f30-4a92-923c-6c048950f90a',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100013,
            '${flyway:defaultSchema}_integration_LastWriterDirection',
            'Mj Integration Last Writer Direction',
            'Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.',
            'nvarchar',
            20,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb0b13bd-bb9b-4143-abfe-61fea37c0ee3' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb0b13bd-bb9b-4143-abfe-61fea37c0ee3',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100014,
            '${flyway:defaultSchema}_integration_IsTombstoned',
            'Mj Integration Is Tombstoned',
            'Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f06e0c6d-8936-4e4b-84c3-f8ac29ae6dc0' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f06e0c6d-8936-4e4b-84c3-f8ac29ae6dc0',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100015,
            '__mj_integration_DeletedDetectedAt',
            'Mj Integration Deleted Detected At',
            'Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b312367-75e0-42dd-8367-71de89fdf374' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b312367-75e0-42dd-8367-71de89fdf374',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100016,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ace25c6-f8d7-46c2-a8e3-ef08eb486716' OR (EntityID = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8ace25c6-f8d7-46c2-a8e3-ef08eb486716',
            'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', -- Entity: Company Admins
            100017,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b448130-4242-47cf-86b2-f252d581f58d' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'displayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b448130-4242-47cf-86b2-f252d581f58d',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100001,
            'displayName',
            'display Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae363da4-bc61-483a-8dd4-1dbfc600cfc1' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'custId')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae363da4-bc61-483a-8dd4-1dbfc600cfc1',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100002,
            'custId',
            'cust Id',
            'ACGI customer ID (primary key; addressing key of GET_CUST_INFO_XML).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cdefb287-72f8-4d7c-a97c-90a26fff22ce' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'suffixName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cdefb287-72f8-4d7c-a97c-90a26fff22ce',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100003,
            'suffixName',
            'suffix Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '899c897e-bed8-45b9-a9d5-710b15f16f3f' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'middleName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '899c897e-bed8-45b9-a9d5-710b15f16f3f',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100004,
            'middleName',
            'middle Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '133ab653-0c58-4bce-bec4-c623d85f9c66' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'prefixName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '133ab653-0c58-4bce-bec4-c623d85f9c66',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100005,
            'prefixName',
            'prefix Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0efb5cd7-ac21-4a5d-beed-865cd18289b8' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'loginId')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0efb5cd7-ac21-4a5d-beed-865cd18289b8',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100006,
            'loginId',
            'login Id',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1d2fbbf-51fc-488e-8384-d2fa5207c7d7' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'createDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c1d2fbbf-51fc-488e-8384-d2fa5207c7d7',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100007,
            'createDate',
            'create Date',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf3cfea5-9594-4522-ac88-9f3b2b463591' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'lastName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf3cfea5-9594-4522-ac88-9f3b2b463591',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100008,
            'lastName',
            'last Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2729ad9-f493-4145-932c-e9ff12451408' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'custType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e2729ad9-f493-4145-932c-e9ff12451408',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100009,
            'custType',
            'cust Type',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38359ea7-f2b3-4f83-b835-8afa18fadb67' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'informalName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '38359ea7-f2b3-4f83-b835-8afa18fadb67',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100010,
            'informalName',
            'informal Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a115418b-3422-4530-aba2-6efe486b1c53' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'firstName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a115418b-3422-4530-aba2-6efe486b1c53',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100011,
            'firstName',
            'first Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '392037b7-65f7-4d8e-933c-fba5dfe7ee5c' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'toBePurged')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '392037b7-65f7-4d8e-933c-fba5dfe7ee5c',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100012,
            'toBePurged',
            'to Be Purged',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7c0fd0f-8a0e-4dbd-8c02-b5723153caca' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'lockCode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e7c0fd0f-8a0e-4dbd-8c02-b5723153caca',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100013,
            'lockCode',
            'lock Code',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '137afd61-66c4-459e-8ba1-d93a1753779f' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = 'degreeName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '137afd61-66c4-459e-8ba1-d93a1753779f',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100014,
            'degreeName',
            'degree Name',
            'Flattened from 1:1 <name> struct.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5997b16e-e9ad-47fa-abf1-e0bf0b09d164' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5997b16e-e9ad-47fa-abf1-e0bf0b09d164',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100015,
            '${flyway:defaultSchema}_integration_SyncStatus',
            'Mj Integration Sync Status',
            'Current sync status: Active, Archived, or Error',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '543b75b5-9741-4acf-a2ea-801976ce3ef8' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '543b75b5-9741-4acf-a2ea-801976ce3ef8',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100016,
            '__mj_integration_LastSyncedAt',
            'Mj Integration Last Synced At',
            'Timestamp of the last successful sync for this record',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29eeed4c-7bde-40b0-bf7a-b66eee89c946' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '29eeed4c-7bde-40b0-bf7a-b66eee89c946',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100017,
            '${flyway:defaultSchema}_integration_LastSyncedSnapshot',
            'Mj Integration Last Synced Snapshot',
            'The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69915cd4-976d-4245-863a-26d68187f58f' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '69915cd4-976d-4245-863a-26d68187f58f',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100018,
            '${flyway:defaultSchema}_integration_SyncMessage',
            'Mj Integration Sync Message',
            'Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a5e56fc-4b5d-4019-b4a9-ab081f9010b8' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5a5e56fc-4b5d-4019-b4a9-ab081f9010b8',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100019,
            '${flyway:defaultSchema}_integration_ContentHash',
            'Mj Integration Content Hash',
            'SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).',
            'nvarchar',
            128,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c6c11d24-b97e-4e7d-a431-b5e2054d0c92' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c6c11d24-b97e-4e7d-a431-b5e2054d0c92',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100020,
            '${flyway:defaultSchema}_integration_CustomOverflow',
            'Mj Integration Custom Overflow',
            'Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7203dad7-47f8-45e3-ac6e-14791a116cba' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7203dad7-47f8-45e3-ac6e-14791a116cba',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100021,
            '${flyway:defaultSchema}_integration_ExternalVersion',
            'Mj Integration External Version',
            'The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '146f8b29-d5bc-4392-a8ed-fa71c039ccd0' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '146f8b29-d5bc-4392-a8ed-fa71c039ccd0',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100022,
            '${flyway:defaultSchema}_integration_LastSeenModifiedValue',
            'Mj Integration Last Seen Modified Value',
            'The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '247c030c-22f0-4a54-80b5-e4b5d20d047f' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '247c030c-22f0-4a54-80b5-e4b5d20d047f',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100023,
            '__mj_integration_LastReconciledAt',
            'Mj Integration Last Reconciled At',
            'Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '277744ee-39d2-4d0b-a747-3a5217a741ed' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '277744ee-39d2-4d0b-a747-3a5217a741ed',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100024,
            '${flyway:defaultSchema}_integration_LastWriterDirection',
            'Mj Integration Last Writer Direction',
            'Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.',
            'nvarchar',
            20,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb73e77d-2f42-4d5a-b46b-2f3d09fd0a9a' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb73e77d-2f42-4d5a-b46b-2f3d09fd0a9a',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100025,
            '${flyway:defaultSchema}_integration_IsTombstoned',
            'Mj Integration Is Tombstoned',
            'Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b368ec3-c9a0-494f-9d2b-cb1e51f9803d' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b368ec3-c9a0-494f-9d2b-cb1e51f9803d',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100026,
            '__mj_integration_DeletedDetectedAt',
            'Mj Integration Deleted Detected At',
            'Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ac6b81b-6c76-444f-931d-b23a72e4ff03' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9ac6b81b-6c76-444f-931d-b23a72e4ff03',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100027,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40945a53-0c03-4f3b-b809-59401741de62' OR (EntityID = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '40945a53-0c03-4f3b-b809-59401741de62',
            '4222F814-415F-4856-A4FC-F7B1E0E648A6', -- Entity: Customers
            100028,
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set soft PK for acgi.CompanyAdmin.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'custId';


/* Create Entity Relationship: Customers -> Employees (One To Many via custId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5f3d23e6-5b7a-43da-8d30-6adcef504097'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5f3d23e6-5b7a-43da-8d30-6adcef504097', '4222F814-415F-4856-A4FC-F7B1E0E648A6', '9EAD9711-D819-4F22-BEE8-77736EDB72CC', 'custId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Customers -> Company Admins (One To Many via custId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5ae941ff-cd73-49d9-a048-f854166c41b1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5ae941ff-cd73-49d9-a048-f854166c41b1', '4222F814-415F-4856-A4FC-F7B1E0E648A6', 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4', 'custId', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for CompanyAdmin */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table CompanyAdmin
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyAdmin_custId' 
    AND object_id = OBJECT_ID('[acgi].[CompanyAdmin]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyAdmin_custId ON [acgi].[CompanyAdmin] ([custId]);

/* Index for Foreign Keys for Customer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Employee */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key custId in table Employee
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Employee_custId' 
    AND object_id = OBJECT_ID('[acgi].[Employee]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Employee_custId ON [acgi].[Employee] ([custId]);

/* Base View SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: vwCompanyAdmins
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Company Admins
-----               SCHEMA:      acgi
-----               BASE TABLE:  CompanyAdmin
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCompanyAdmins]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCompanyAdmins];
GO

CREATE VIEW [acgi].[vwCompanyAdmins]
AS
SELECT
    c.*
FROM
    [acgi].[CompanyAdmin] AS c
GO
GRANT SELECT ON [acgi].[vwCompanyAdmins] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: Permissions for vwCompanyAdmins
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCompanyAdmins] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spCreateCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spCreateCompanyAdmin]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @displayNm_Clear bit = 0,
    @displayNm nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[CompanyAdmin]
        (
            [custId],
                [displayNm],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [id]
        )
    VALUES
        (
            CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @displayNm_Clear = 1 THEN NULL ELSE ISNULL(@displayNm, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCompanyAdmins] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [acgi].[spCreateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spCreateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spUpdateCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spUpdateCompanyAdmin]
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @displayNm_Clear bit = 0,
    @displayNm nvarchar(255) = NULL,
    @id nvarchar(255),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CompanyAdmin]
    SET
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [displayNm] = CASE WHEN @displayNm_Clear = 1 THEN NULL ELSE ISNULL(@displayNm, [displayNm]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCompanyAdmins] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCompanyAdmins]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCompanyAdmin] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyAdmin table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCompanyAdmin]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCompanyAdmin];
GO
CREATE TRIGGER [acgi].trgUpdateCompanyAdmin
ON [acgi].[CompanyAdmin]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[CompanyAdmin]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[CompanyAdmin] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spUpdateCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

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
-----               SCHEMA:      acgi
-----               BASE TABLE:  Customer
-----               PRIMARY KEY: custId
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwCustomers]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwCustomers];
GO

CREATE VIEW [acgi].[vwCustomers]
AS
SELECT
    c.*
FROM
    [acgi].[Customer] AS c
GO
GRANT SELECT ON [acgi].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Customers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Customers
-- Item: Permissions for vwCustomers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwCustomers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[acgi].[spCreateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateCustomer];
GO

CREATE PROCEDURE [acgi].[spCreateCustomer]
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @custId nvarchar(255) = NULL,
    @suffixName_Clear bit = 0,
    @suffixName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefixName_Clear bit = 0,
    @prefixName nvarchar(255) = NULL,
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @custType_Clear bit = 0,
    @custType nvarchar(255) = NULL,
    @informalName_Clear bit = 0,
    @informalName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @toBePurged_Clear bit = 0,
    @toBePurged nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @degreeName_Clear bit = 0,
    @degreeName nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Customer]
        (
            [displayName],
                [suffixName],
                [middleName],
                [prefixName],
                [loginId],
                [createDate],
                [lastName],
                [custType],
                [informalName],
                [firstName],
                [toBePurged],
                [lockCode],
                [degreeName],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [custId]
        )
    VALUES
        (
            CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, NULL) END,
                CASE WHEN @suffixName_Clear = 1 THEN NULL ELSE ISNULL(@suffixName, NULL) END,
                CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, NULL) END,
                CASE WHEN @prefixName_Clear = 1 THEN NULL ELSE ISNULL(@prefixName, NULL) END,
                CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, NULL) END,
                CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @custType_Clear = 1 THEN NULL ELSE ISNULL(@custType, NULL) END,
                CASE WHEN @informalName_Clear = 1 THEN NULL ELSE ISNULL(@informalName, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @toBePurged_Clear = 1 THEN NULL ELSE ISNULL(@toBePurged, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @degreeName_Clear = 1 THEN NULL ELSE ISNULL(@degreeName, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @custId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwCustomers] WHERE [custId] = @custId
END
GO
GRANT EXECUTE ON [acgi].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Customers */

GRANT EXECUTE ON [acgi].[spCreateCustomer] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[acgi].[spUpdateCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateCustomer];
GO

CREATE PROCEDURE [acgi].[spUpdateCustomer]
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @custId nvarchar(255),
    @suffixName_Clear bit = 0,
    @suffixName nvarchar(255) = NULL,
    @middleName_Clear bit = 0,
    @middleName nvarchar(255) = NULL,
    @prefixName_Clear bit = 0,
    @prefixName nvarchar(255) = NULL,
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @custType_Clear bit = 0,
    @custType nvarchar(255) = NULL,
    @informalName_Clear bit = 0,
    @informalName nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @toBePurged_Clear bit = 0,
    @toBePurged nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @degreeName_Clear bit = 0,
    @degreeName nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Customer]
    SET
        [displayName] = CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, [displayName]) END,
        [suffixName] = CASE WHEN @suffixName_Clear = 1 THEN NULL ELSE ISNULL(@suffixName, [suffixName]) END,
        [middleName] = CASE WHEN @middleName_Clear = 1 THEN NULL ELSE ISNULL(@middleName, [middleName]) END,
        [prefixName] = CASE WHEN @prefixName_Clear = 1 THEN NULL ELSE ISNULL(@prefixName, [prefixName]) END,
        [loginId] = CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, [loginId]) END,
        [createDate] = CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, [createDate]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [custType] = CASE WHEN @custType_Clear = 1 THEN NULL ELSE ISNULL(@custType, [custType]) END,
        [informalName] = CASE WHEN @informalName_Clear = 1 THEN NULL ELSE ISNULL(@informalName, [informalName]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [toBePurged] = CASE WHEN @toBePurged_Clear = 1 THEN NULL ELSE ISNULL(@toBePurged, [toBePurged]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [degreeName] = CASE WHEN @degreeName_Clear = 1 THEN NULL ELSE ISNULL(@degreeName, [degreeName]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [custId] = @custId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwCustomers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwCustomers]
                                    WHERE
                                        [custId] = @custId
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Customer table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateCustomer]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateCustomer];
GO
CREATE TRIGGER [acgi].trgUpdateCustomer
ON [acgi].[Customer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Customer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Customer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[custId] = I.[custId];
END;
GO

/* spUpdate Permissions for Customers */

GRANT EXECUTE ON [acgi].[spUpdateCustomer] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: vwEmployees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Employees
-----               SCHEMA:      acgi
-----               BASE TABLE:  Employee
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[acgi].[vwEmployees]', 'V') IS NOT NULL
    DROP VIEW [acgi].[vwEmployees];
GO

CREATE VIEW [acgi].[vwEmployees]
AS
SELECT
    e.*
FROM
    [acgi].[Employee] AS e
GO
GRANT SELECT ON [acgi].[vwEmployees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: Permissions for vwEmployees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [acgi].[vwEmployees] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spCreateEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spCreateEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spCreateEmployee];
GO

CREATE PROCEDURE [acgi].[spCreateEmployee]
    @employeeAttributes_Clear bit = 0,
    @employeeAttributes nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @administrator_Clear bit = 0,
    @administrator nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [acgi].[Employee]
        (
            [employeeAttributes],
                [functionDescr],
                [lastName],
                [titleCodeDescr],
                [custId],
                [firstName],
                [titleCode],
                [lockCode],
                [displayName],
                [administrator],
                [functionCode],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [id]
        )
    VALUES
        (
            CASE WHEN @employeeAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employeeAttributes, NULL) END,
                CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, NULL) END,
                CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, NULL) END,
                CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, NULL) END,
                CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, NULL) END,
                CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, NULL) END,
                CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, NULL) END,
                CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, NULL) END,
                CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, NULL) END,
                CASE WHEN @administrator_Clear = 1 THEN NULL ELSE ISNULL(@administrator, NULL) END,
                CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [acgi].[vwEmployees] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [acgi].[spCreateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Employees */

GRANT EXECUTE ON [acgi].[spCreateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spUpdateEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spUpdateEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spUpdateEmployee];
GO

CREATE PROCEDURE [acgi].[spUpdateEmployee]
    @employeeAttributes_Clear bit = 0,
    @employeeAttributes nvarchar(255) = NULL,
    @id nvarchar(255),
    @functionDescr_Clear bit = 0,
    @functionDescr nvarchar(255) = NULL,
    @lastName_Clear bit = 0,
    @lastName nvarchar(255) = NULL,
    @titleCodeDescr_Clear bit = 0,
    @titleCodeDescr nvarchar(255) = NULL,
    @custId_Clear bit = 0,
    @custId nvarchar(255) = NULL,
    @firstName_Clear bit = 0,
    @firstName nvarchar(255) = NULL,
    @titleCode_Clear bit = 0,
    @titleCode nvarchar(255) = NULL,
    @lockCode_Clear bit = 0,
    @lockCode nvarchar(255) = NULL,
    @displayName_Clear bit = 0,
    @displayName nvarchar(255) = NULL,
    @administrator_Clear bit = 0,
    @administrator nvarchar(255) = NULL,
    @functionCode_Clear bit = 0,
    @functionCode nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Employee]
    SET
        [employeeAttributes] = CASE WHEN @employeeAttributes_Clear = 1 THEN NULL ELSE ISNULL(@employeeAttributes, [employeeAttributes]) END,
        [functionDescr] = CASE WHEN @functionDescr_Clear = 1 THEN NULL ELSE ISNULL(@functionDescr, [functionDescr]) END,
        [lastName] = CASE WHEN @lastName_Clear = 1 THEN NULL ELSE ISNULL(@lastName, [lastName]) END,
        [titleCodeDescr] = CASE WHEN @titleCodeDescr_Clear = 1 THEN NULL ELSE ISNULL(@titleCodeDescr, [titleCodeDescr]) END,
        [custId] = CASE WHEN @custId_Clear = 1 THEN NULL ELSE ISNULL(@custId, [custId]) END,
        [firstName] = CASE WHEN @firstName_Clear = 1 THEN NULL ELSE ISNULL(@firstName, [firstName]) END,
        [titleCode] = CASE WHEN @titleCode_Clear = 1 THEN NULL ELSE ISNULL(@titleCode, [titleCode]) END,
        [lockCode] = CASE WHEN @lockCode_Clear = 1 THEN NULL ELSE ISNULL(@lockCode, [lockCode]) END,
        [displayName] = CASE WHEN @displayName_Clear = 1 THEN NULL ELSE ISNULL(@displayName, [displayName]) END,
        [administrator] = CASE WHEN @administrator_Clear = 1 THEN NULL ELSE ISNULL(@administrator, [administrator]) END,
        [functionCode] = CASE WHEN @functionCode_Clear = 1 THEN NULL ELSE ISNULL(@functionCode, [functionCode]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [acgi].[vwEmployees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [acgi].[vwEmployees]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [acgi].[spUpdateEmployee] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Employee table
------------------------------------------------------------
IF OBJECT_ID('[acgi].[trgUpdateEmployee]', 'TR') IS NOT NULL
    DROP TRIGGER [acgi].[trgUpdateEmployee];
GO
CREATE TRIGGER [acgi].trgUpdateEmployee
ON [acgi].[Employee]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [acgi].[Employee]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [acgi].[Employee] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Employees */

GRANT EXECUTE ON [acgi].[spUpdateEmployee] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Company Admins */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Company Admins
-- Item: spDeleteCompanyAdmin
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyAdmin
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteCompanyAdmin]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCompanyAdmin];
GO

CREATE PROCEDURE [acgi].[spDeleteCompanyAdmin]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[CompanyAdmin]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Company Admins */

GRANT EXECUTE ON [acgi].[spDeleteCompanyAdmin] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[acgi].[spDeleteCustomer]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteCustomer];
GO

CREATE PROCEDURE [acgi].[spDeleteCustomer]
    @custId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Customer]
    WHERE
        [custId] = @custId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [custId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @custId AS [custId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Customers */

GRANT EXECUTE ON [acgi].[spDeleteCustomer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Employees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Employees
-- Item: spDeleteEmployee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Employee
------------------------------------------------------------
IF OBJECT_ID('[acgi].[spDeleteEmployee]', 'P') IS NOT NULL
    DROP PROCEDURE [acgi].[spDeleteEmployee];
GO

CREATE PROCEDURE [acgi].[spDeleteEmployee]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [acgi].[Employee]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [acgi].[spDeleteEmployee] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Employees */

GRANT EXECUTE ON [acgi].[spDeleteEmployee] TO [cdp_Developer], [cdp_Integration];

/* Set soft PK for acgi.CompanyAdmin.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'FC625CD0-9C6B-4DAA-8058-AE6CF6FDFEB4' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '4222F814-415F-4856-A4FC-F7B1E0E648A6',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '9EAD9711-D819-4F22-BEE8-77736EDB72CC' AND [Name] = 'custId';

