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
         'b0f09de6-140b-4dff-8855-8c44635ff802',
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

/* SQL generated to add new entity Company Admins to application ID: 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA', 'b0f09de6-140b-4dff-8855-8c44635ff802', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Company Admins for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b0f09de6-140b-4dff-8855-8c44635ff802', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Company Admins for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b0f09de6-140b-4dff-8855-8c44635ff802', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Company Admins for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b0f09de6-140b-4dff-8855-8c44635ff802', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'b3ba1c22-0f4c-4752-a057-9d585345cb41',
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
                                       ('E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA', 'b3ba1c22-0f4c-4752-a057-9d585345cb41', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Customers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3ba1c22-0f4c-4752-a057-9d585345cb41', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Customers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3ba1c22-0f4c-4752-a057-9d585345cb41', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Customers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3ba1c22-0f4c-4752-a057-9d585345cb41', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'eca3753f-cdc7-47de-a9d2-871847a68fe7',
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
                                       ('E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA', 'eca3753f-cdc7-47de-a9d2-871847a68fe7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'E6FB14DE-93AA-416E-BBC4-55D2DE51E8CA'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Employees for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('eca3753f-cdc7-47de-a9d2-871847a68fe7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Employees for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('eca3753f-cdc7-47de-a9d2-871847a68fe7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Employees for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('eca3753f-cdc7-47de-a9d2-871847a68fe7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93f4de96-ce2d-41cc-993d-c98024e6a8ad' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'employeeAttributes')) BEGIN
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
            '93f4de96-ce2d-41cc-993d-c98024e6a8ad',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc2a0cb5-9de0-45a6-b3f8-fcfb43fa80dd' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'id')) BEGIN
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
            'bc2a0cb5-9de0-45a6-b3f8-fcfb43fa80dd',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff3bf5b9-9bfb-42bd-9e53-759d3222ff3d' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'functionDescr')) BEGIN
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
            'ff3bf5b9-9bfb-42bd-9e53-759d3222ff3d',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fc0e15f1-8334-4c69-ba27-df78803fca16' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'lastName')) BEGIN
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
            'fc0e15f1-8334-4c69-ba27-df78803fca16',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54b5043f-3c73-4a7d-9241-69f36912dd82' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'titleCodeDescr')) BEGIN
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
            '54b5043f-3c73-4a7d-9241-69f36912dd82',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f6d757c-6d6a-4889-a7c3-46f480c17f64' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'custId')) BEGIN
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
            '8f6d757c-6d6a-4889-a7c3-46f480c17f64',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a48b40d2-3120-4ee9-90b0-e167c7780563' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'firstName')) BEGIN
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
            'a48b40d2-3120-4ee9-90b0-e167c7780563',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd86bdb4b-8524-46ce-887d-78ac6bd12362' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'titleCode')) BEGIN
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
            'd86bdb4b-8524-46ce-887d-78ac6bd12362',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ebc6a3b-46ef-4dc9-832d-a57381648363' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'lockCode')) BEGIN
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
            '1ebc6a3b-46ef-4dc9-832d-a57381648363',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '212236f6-eb5d-4e24-9a47-942d6e141f96' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'displayName')) BEGIN
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
            '212236f6-eb5d-4e24-9a47-942d6e141f96',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74f3a045-a158-46bf-bf22-8795b3e01c5b' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'administrator')) BEGIN
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
            '74f3a045-a158-46bf-bf22-8795b3e01c5b',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d6bcfe4-77b7-4711-83d2-0246551a026f' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = 'functionCode')) BEGIN
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
            '7d6bcfe4-77b7-4711-83d2-0246551a026f',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f71699e-b1ff-4d0a-be4d-dbfdea325264' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
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
            '2f71699e-b1ff-4d0a-be4d-dbfdea325264',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56eb48f5-c408-41db-b1de-d9ff6e114b57' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
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
            '56eb48f5-c408-41db-b1de-d9ff6e114b57',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '798e39e1-07b9-4fe9-a255-03629c3d9a06' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
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
            '798e39e1-07b9-4fe9-a255-03629c3d9a06',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f5a7c72-0283-415a-b855-0c3225049386' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
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
            '0f5a7c72-0283-415a-b855-0c3225049386',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '832f1bcf-e7cf-4e30-95a3-a95696a42bb3' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
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
            '832f1bcf-e7cf-4e30-95a3-a95696a42bb3',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bff92f21-5f88-4e0c-9c98-1f8c9317fbef' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
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
            'bff92f21-5f88-4e0c-9c98-1f8c9317fbef',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '013280ad-ef89-48c0-a9c2-bcdea56fd772' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
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
            '013280ad-ef89-48c0-a9c2-bcdea56fd772',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe3028f2-422a-4c2a-8c70-4abd71af0117' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
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
            'fe3028f2-422a-4c2a-8c70-4abd71af0117',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f63bda01-52d1-4605-abaa-59a1cb80a5ed' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
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
            'f63bda01-52d1-4605-abaa-59a1cb80a5ed',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70f2dd99-6946-4671-b42f-673c15799859' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
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
            '70f2dd99-6946-4671-b42f-673c15799859',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd5f4f9d6-8ffd-4968-8231-8fdefc51579a' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
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
            'd5f4f9d6-8ffd-4968-8231-8fdefc51579a',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f965fddb-f871-4167-b574-45fde5b8d270' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
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
            'f965fddb-f871-4167-b574-45fde5b8d270',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6374ac81-5934-4da9-ba83-8e2ea35e54ec' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6374ac81-5934-4da9-ba83-8e2ea35e54ec',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf8b4d97-cdb6-43b4-814c-2f704d98593f' OR (EntityID = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'bf8b4d97-cdb6-43b4-814c-2f704d98593f',
            'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', -- Entity: Employees
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd37e552-02c2-43a6-a8be-f5b40c310548' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = 'custId')) BEGIN
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
            'dd37e552-02c2-43a6-a8be-f5b40c310548',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24ffe231-3751-43db-81b1-01f75e1215fd' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = 'displayNm')) BEGIN
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
            '24ffe231-3751-43db-81b1-01f75e1215fd',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fb3ea6c-f769-40bf-a5b8-3bfd2c4f7fa7' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = 'id')) BEGIN
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
            '2fb3ea6c-f769-40bf-a5b8-3bfd2c4f7fa7',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9835c0be-94df-411a-9738-21b2ec7777f0' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
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
            '9835c0be-94df-411a-9738-21b2ec7777f0',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f786370-9ae8-499d-b531-3894c4d76527' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
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
            '0f786370-9ae8-499d-b531-3894c4d76527',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b648d17d-dbad-454d-b238-4c0e19220e12' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
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
            'b648d17d-dbad-454d-b238-4c0e19220e12',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '269978c9-2529-4b6a-8958-6fdadf24a95e' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
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
            '269978c9-2529-4b6a-8958-6fdadf24a95e',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5257b916-c26f-4c32-b025-30e3d81c0a14' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
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
            '5257b916-c26f-4c32-b025-30e3d81c0a14',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22c110ba-3c9a-4f3e-9fb4-31d5be3ac663' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
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
            '22c110ba-3c9a-4f3e-9fb4-31d5be3ac663',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '165f5463-31a4-4483-b551-9d29007d8707' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
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
            '165f5463-31a4-4483-b551-9d29007d8707',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5049449-8ac3-49de-966a-cdb8be44ba22' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
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
            'b5049449-8ac3-49de-966a-cdb8be44ba22',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a215b75-2ed1-47f1-a126-72e9998fc192' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
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
            '5a215b75-2ed1-47f1-a126-72e9998fc192',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '60b14c11-958f-4f1e-b1fc-c3b483f8a6ad' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
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
            '60b14c11-958f-4f1e-b1fc-c3b483f8a6ad',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea714b57-1874-4aed-bb77-03a6262ee31c' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
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
            'ea714b57-1874-4aed-bb77-03a6262ee31c',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '178c9b6d-e955-43b2-9e1d-e4e37a2cac02' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
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
            '178c9b6d-e955-43b2-9e1d-e4e37a2cac02',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81c1dec7-eb0c-4e58-829c-fda1840f998e' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '__mj_CreatedAt')) BEGIN
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
            '81c1dec7-eb0c-4e58-829c-fda1840f998e',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0abd055c-586e-4a56-8bca-861f2afd6d56' OR (EntityID = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0abd055c-586e-4a56-8bca-861f2afd6d56',
            'B0F09DE6-140B-4DFF-8855-8C44635FF802', -- Entity: Company Admins
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29e7db07-b9e3-40c5-a48e-5bd32a3c132e' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'displayName')) BEGIN
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
            '29e7db07-b9e3-40c5-a48e-5bd32a3c132e',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0631454-c552-47f9-a61f-f8bbb6566230' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'custId')) BEGIN
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
            'c0631454-c552-47f9-a61f-f8bbb6566230',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '681935d3-816b-48fc-8a81-6bb3088fe8c4' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'suffixName')) BEGIN
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
            '681935d3-816b-48fc-8a81-6bb3088fe8c4',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f593a807-b2e7-44e3-b67c-76c1574b3ca0' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'middleName')) BEGIN
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
            'f593a807-b2e7-44e3-b67c-76c1574b3ca0',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '481b8775-6eb2-4eb3-a926-a035712d5d20' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'prefixName')) BEGIN
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
            '481b8775-6eb2-4eb3-a926-a035712d5d20',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36a8ff82-b8fe-4c99-9b92-af6f2e87db94' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'loginId')) BEGIN
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
            '36a8ff82-b8fe-4c99-9b92-af6f2e87db94',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ebd9790-6221-4e35-a63d-c873f4a83024' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'createDate')) BEGIN
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
            '1ebd9790-6221-4e35-a63d-c873f4a83024',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bbafe394-27c5-45b2-ab89-ec99b176fb24' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'lastName')) BEGIN
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
            'bbafe394-27c5-45b2-ab89-ec99b176fb24',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '102fe871-7289-4e45-bc09-ac198361967f' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'custType')) BEGIN
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
            '102fe871-7289-4e45-bc09-ac198361967f',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '429fd7a4-2963-4e8c-b829-4cc78a334968' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'informalName')) BEGIN
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
            '429fd7a4-2963-4e8c-b829-4cc78a334968',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8ec4aaf-9ffb-4b26-89ab-dfb368e38bd4' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'firstName')) BEGIN
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
            'a8ec4aaf-9ffb-4b26-89ab-dfb368e38bd4',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5ccd246a-a09e-42c8-aa0b-f9568552fe35' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'toBePurged')) BEGIN
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
            '5ccd246a-a09e-42c8-aa0b-f9568552fe35',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31ce4de4-79b8-4269-a828-408989e04807' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'lockCode')) BEGIN
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
            '31ce4de4-79b8-4269-a828-408989e04807',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6c69134-6861-432b-aa33-b6425ebf6c62' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = 'degreeName')) BEGIN
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
            'd6c69134-6861-432b-aa33-b6425ebf6c62',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a202a20-86a6-4791-83e1-1faafe2833e6' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
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
            '6a202a20-86a6-4791-83e1-1faafe2833e6',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bea7d6e-8ee8-4d36-a5d0-239965e9e8a9' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
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
            '3bea7d6e-8ee8-4d36-a5d0-239965e9e8a9',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73d6a99e-175f-404d-a6c3-e01f44676044' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
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
            '73d6a99e-175f-404d-a6c3-e01f44676044',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c23671e-22cf-4476-9e9c-3bed0f4d58aa' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
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
            '0c23671e-22cf-4476-9e9c-3bed0f4d58aa',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11b2ca90-e6bf-4a30-b02b-a9b813d6cd86' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
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
            '11b2ca90-e6bf-4a30-b02b-a9b813d6cd86',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f738f7c5-843f-415e-a945-631cf79bb3be' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
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
            'f738f7c5-843f-415e-a945-631cf79bb3be',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5897a8b-0d08-4a5d-8a8e-d01ffb2e61d9' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
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
            'f5897a8b-0d08-4a5d-8a8e-d01ffb2e61d9',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ecc2229-9717-4741-878f-61687e256ea3' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
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
            '7ecc2229-9717-4741-878f-61687e256ea3',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbf88ccf-4a9e-4bf0-96d5-b6f59aeab1db' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
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
            'dbf88ccf-4a9e-4bf0-96d5-b6f59aeab1db',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c953133-91f7-4363-90e9-b3b083591c8c' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
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
            '7c953133-91f7-4363-90e9-b3b083591c8c',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '217a4bb3-1b90-4e63-ace7-3b95d5f7946d' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
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
            '217a4bb3-1b90-4e63-ace7-3b95d5f7946d',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae1570e5-2b20-4a04-8798-112eff055406' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
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
            'ae1570e5-2b20-4a04-8798-112eff055406',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '981d1f20-a3c9-44db-a165-9524caf44d4d' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '__mj_CreatedAt')) BEGIN
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
            '981d1f20-a3c9-44db-a165-9524caf44d4d',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '991500b6-b92e-4e3c-b91f-b82bff6d8848' OR (EntityID = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '991500b6-b92e-4e3c-b91f-b82bff6d8848',
            'B3BA1C22-0F4C-4752-A057-9D585345CB41', -- Entity: Customers
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
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'custId';


/* Create Entity Relationship: Customers -> Employees (One To Many via custId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '69df123a-7671-45d3-a6a9-0b4a2c675d7a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('69df123a-7671-45d3-a6a9-0b4a2c675d7a', 'B3BA1C22-0F4C-4752-A057-9D585345CB41', 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7', 'custId', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Customers -> Company Admins (One To Many via custId) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c80db960-8c6d-4106-ad90-bbe1ef358117'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c80db960-8c6d-4106-ad90-bbe1ef358117', 'B3BA1C22-0F4C-4752-A057-9D585345CB41', 'B0F09DE6-140B-4DFF-8855-8C44635FF802', 'custId', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
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
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'custId';

/* Set soft PK for acgi.CompanyAdmin.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'custId';

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
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'id';

/* Set soft FK for acgi.CompanyAdmin.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'B0F09DE6-140B-4DFF-8855-8C44635FF802' AND [Name] = 'custId';

/* Set soft PK for acgi.Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41' AND [Name] = 'custId';

/* Set soft PK for acgi.Employee.id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'id';

/* Set soft FK for acgi.Employee.custId → Customer.custId */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'B3BA1C22-0F4C-4752-A057-9D585345CB41',
                                    [RelatedEntityFieldName] = 'custId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'ECA3753F-CDC7-47DE-A9D2-871847A68FE7' AND [Name] = 'custId';

