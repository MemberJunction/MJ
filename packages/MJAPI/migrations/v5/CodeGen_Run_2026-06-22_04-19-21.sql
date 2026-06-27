/* SQL generated to create new entity Business Groups */

      INSERT INTO [__mj].[Entity] (
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
         'c7a93e70-e564-4434-a94f-5f0219ffce6f',
         'Business Groups',
         NULL,
         'BusinessGroup wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (iconLocation -> Icon_Location__c) Maps To: OrderApi__Business_Group__c',
         NULL,
         'BusinessGroup',
         'vwBusinessGroups',
         'fonteva',
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

/* SQL generated to create new application fonteva */
INSERT INTO [__mj].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('1faabfbd-d23a-4979-aed2-378775061db4', 'fonteva', 'Generated for schema', 'fonteva', 'fonteva', 1);

/* Adding role UI to application fonteva */
INSERT INTO [__mj].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('1faabfbd-d23a-4979-aed2-378775061db4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* Adding role Developer to application fonteva */
INSERT INTO [__mj].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('1faabfbd-d23a-4979-aed2-378775061db4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1);

/* Adding role Integration to application fonteva */
INSERT INTO [__mj].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('1faabfbd-d23a-4979-aed2-378775061db4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* SQL generated to add new entity Business Groups to application ID: '1faabfbd-d23a-4979-aed2-378775061db4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1faabfbd-d23a-4979-aed2-378775061db4', 'c7a93e70-e564-4434-a94f-5f0219ffce6f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1faabfbd-d23a-4979-aed2-378775061db4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Business Groups for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c7a93e70-e564-4434-a94f-5f0219ffce6f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Business Groups for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c7a93e70-e564-4434-a94f-5f0219ffce6f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Business Groups for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c7a93e70-e564-4434-a94f-5f0219ffce6f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Items */

      INSERT INTO [__mj].[Entity] (
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
         'a61185b3-b4a0-4f76-a20d-a625deba836f',
         'Items',
         NULL,
         'Item wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (itemClass -> Item_Class__c)',
         NULL,
         'Item',
         'vwItems',
         'fonteva',
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

/* SQL generated to add new entity Items to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'a61185b3-b4a0-4f76-a20d-a625deba836f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Items for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a61185b3-b4a0-4f76-a20d-a625deba836f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Items for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a61185b3-b4a0-4f76-a20d-a625deba836f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Items for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a61185b3-b4a0-4f76-a20d-a625deba836f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Events */

      INSERT INTO [__mj].[Entity] (
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
         '38502f41-9dce-4b16-bb45-6b96b35b121b',
         'Events',
         NULL,
         'Event wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (displayName -> Display_Name__c)',
         NULL,
         'Event',
         'vwEvents',
         'fonteva',
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

/* SQL generated to add new entity Events to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '38502f41-9dce-4b16-bb45-6b96b35b121b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Events for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('38502f41-9dce-4b16-bb45-6b96b35b121b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Events for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('38502f41-9dce-4b16-bb45-6b96b35b121b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Events for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('38502f41-9dce-4b16-bb45-6b96b35b121b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Sales Orders */

      INSERT INTO [__mj].[Entity] (
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
         'd79fa734-7f9d-4058-9338-a4e2b1c47081',
         'Sales Orders',
         NULL,
         'SalesOrder wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (businessGroup -> Business_Group__c) Maps To: OrderApi__Sales_Order__c',
         NULL,
         'SalesOrder',
         'vwSalesOrders',
         'fonteva',
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

/* SQL generated to add new entity Sales Orders to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'd79fa734-7f9d-4058-9338-a4e2b1c47081', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Sales Orders for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d79fa734-7f9d-4058-9338-a4e2b1c47081', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Sales Orders for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d79fa734-7f9d-4058-9338-a4e2b1c47081', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Sales Orders for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d79fa734-7f9d-4058-9338-a4e2b1c47081', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Sales Order Lines */

      INSERT INTO [__mj].[Entity] (
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
         '830f2e0e-62e8-4334-af5a-0bd6f8efa132',
         'Sales Order Lines',
         NULL,
         'SalesOrderLine wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (isShippingRate -> Is_Shipping_Rate__c) Maps To: OrderApi__Sales_Order_Line__c',
         NULL,
         'SalesOrderLine',
         'vwSalesOrderLines',
         'fonteva',
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

/* SQL generated to add new entity Sales Order Lines to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '830f2e0e-62e8-4334-af5a-0bd6f8efa132', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Sales Order Lines for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('830f2e0e-62e8-4334-af5a-0bd6f8efa132', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Sales Order Lines for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('830f2e0e-62e8-4334-af5a-0bd6f8efa132', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Sales Order Lines for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('830f2e0e-62e8-4334-af5a-0bd6f8efa132', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Assignments */

      INSERT INTO [__mj].[Entity] (
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
         '65e93d79-8409-4a97-bc29-c293808029eb',
         'Assignments',
         NULL,
         'Assignment wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (fullName -> Full_Name__c) Maps To: OrderApi__Assignment__c',
         NULL,
         'Assignment',
         'vwAssignments',
         'fonteva',
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

/* SQL generated to add new entity Assignments to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '65e93d79-8409-4a97-bc29-c293808029eb', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Assignments for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('65e93d79-8409-4a97-bc29-c293808029eb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Assignments for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('65e93d79-8409-4a97-bc29-c293808029eb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Assignments for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('65e93d79-8409-4a97-bc29-c293808029eb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Assignment Roles */

      INSERT INTO [__mj].[Entity] (
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
         '8b56b849-bbd0-4102-bac4-a314195550c2',
         'Assignment Roles',
         NULL,
         'AssignmentRole wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (isDefault -> Is_Default__c) Maps To: OrderApi__Assignment_Role__c',
         NULL,
         'AssignmentRole',
         'vwAssignmentRoles',
         'fonteva',
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

/* SQL generated to add new entity Assignment Roles to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '8b56b849-bbd0-4102-bac4-a314195550c2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Assignment Roles for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8b56b849-bbd0-4102-bac4-a314195550c2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Assignment Roles for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8b56b849-bbd0-4102-bac4-a314195550c2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Assignment Roles for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8b56b849-bbd0-4102-bac4-a314195550c2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Badges */

      INSERT INTO [__mj].[Entity] (
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
         'd73937c3-3b75-4e48-8d01-9bd4e0dcb3a3',
         'Badges',
         NULL,
         'Badge wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (badgeType -> Badge_Type__c) Maps To: OrderApi__Badge__c',
         NULL,
         'Badge',
         'vwBadges',
         'fonteva',
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

/* SQL generated to add new entity Badges to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'd73937c3-3b75-4e48-8d01-9bd4e0dcb3a3', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badges for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d73937c3-3b75-4e48-8d01-9bd4e0dcb3a3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badges for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d73937c3-3b75-4e48-8d01-9bd4e0dcb3a3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badges for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d73937c3-3b75-4e48-8d01-9bd4e0dcb3a3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Badge Types */

      INSERT INTO [__mj].[Entity] (
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
         'a4dd41fd-4e64-4227-aa2a-60813f30515e',
         'Badge Types',
         NULL,
         'BadgeType wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (iconLocation -> Icon_Location__c) Maps To: OrderApi__Badge_Type__c',
         NULL,
         'BadgeType',
         'vwBadgeTypes',
         'fonteva',
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

/* SQL generated to add new entity Badge Types to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'a4dd41fd-4e64-4227-aa2a-60813f30515e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badge Types for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a4dd41fd-4e64-4227-aa2a-60813f30515e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badge Types for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a4dd41fd-4e64-4227-aa2a-60813f30515e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badge Types for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a4dd41fd-4e64-4227-aa2a-60813f30515e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Badge Workflows */

      INSERT INTO [__mj].[Entity] (
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
         'be13f25c-8c7f-4040-99df-6f047458307d',
         'Badge Workflows',
         NULL,
         'BadgeWorkflow wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (iconLocation -> Icon_Location__c) Maps To: OrderApi__Badge_Workflow__c',
         NULL,
         'BadgeWorkflow',
         'vwBadgeWorkflows',
         'fonteva',
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

/* SQL generated to add new entity Badge Workflows to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'be13f25c-8c7f-4040-99df-6f047458307d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badge Workflows for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('be13f25c-8c7f-4040-99df-6f047458307d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badge Workflows for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('be13f25c-8c7f-4040-99df-6f047458307d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Badge Workflows for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('be13f25c-8c7f-4040-99df-6f047458307d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Catalogs */

      INSERT INTO [__mj].[Entity] (
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
         'c86dda48-e104-406c-94bf-cbc41d71dd5a',
         'Catalogs',
         NULL,
         'Catalog wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (catalogFilters -> Catalog_Filters__c) Maps To: OrderApi__Catalog__c',
         NULL,
         'Catalog',
         'vwCatalogs',
         'fonteva',
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

/* SQL generated to add new entity Catalogs to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'c86dda48-e104-406c-94bf-cbc41d71dd5a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Catalogs for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c86dda48-e104-406c-94bf-cbc41d71dd5a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Catalogs for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c86dda48-e104-406c-94bf-cbc41d71dd5a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Catalogs for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c86dda48-e104-406c-94bf-cbc41d71dd5a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Credit Memos */

      INSERT INTO [__mj].[Entity] (
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
         '8d068aa4-eafb-4ddb-b65e-5dcd7a9048a2',
         'Credit Memos',
         NULL,
         'CreditMemo wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (catalogFilters -> Catalog_Filters__c) Maps To: OrderApi__Credit_Memo__c',
         NULL,
         'CreditMemo',
         'vwCreditMemos',
         'fonteva',
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

/* SQL generated to add new entity Credit Memos to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '8d068aa4-eafb-4ddb-b65e-5dcd7a9048a2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Credit Memos for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8d068aa4-eafb-4ddb-b65e-5dcd7a9048a2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Credit Memos for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8d068aa4-eafb-4ddb-b65e-5dcd7a9048a2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Credit Memos for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8d068aa4-eafb-4ddb-b65e-5dcd7a9048a2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Credit Notes */

      INSERT INTO [__mj].[Entity] (
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
         '086be09c-c885-4eea-9427-3c50aff624e8',
         'Credit Notes',
         NULL,
         'CreditNote wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (catalogFilters -> Catalog_Filters__c) Maps To: OrderApi__Credit_Note__c',
         NULL,
         'CreditNote',
         'vwCreditNotes',
         'fonteva',
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

/* SQL generated to add new entity Credit Notes to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '086be09c-c885-4eea-9427-3c50aff624e8', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Credit Notes for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('086be09c-c885-4eea-9427-3c50aff624e8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Credit Notes for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('086be09c-c885-4eea-9427-3c50aff624e8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Credit Notes for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('086be09c-c885-4eea-9427-3c50aff624e8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Event Chatter Groups */

      INSERT INTO [__mj].[Entity] (
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
         '69fdd047-4472-4d2a-987b-f66f9fc41691',
         'Event Chatter Groups',
         NULL,
         'EventChatterGroup wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (groupName -> Group_Name__c)',
         NULL,
         'EventChatterGroup',
         'vwEventChatterGroups',
         'fonteva',
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

/* SQL generated to add new entity Event Chatter Groups to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '69fdd047-4472-4d2a-987b-f66f9fc41691', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Event Chatter Groups for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('69fdd047-4472-4d2a-987b-f66f9fc41691', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Event Chatter Groups for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('69fdd047-4472-4d2a-987b-f66f9fc41691', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Event Chatter Groups for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('69fdd047-4472-4d2a-987b-f66f9fc41691', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Invoices */

      INSERT INTO [__mj].[Entity] (
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
         '3183b578-00e9-4875-b6d6-98fd414e9362',
         'Invoices',
         NULL,
         'Invoice wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (balanceDue -> Balance_Due__c)',
         NULL,
         'Invoice',
         'vwInvoices',
         'fonteva',
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

/* SQL generated to add new entity Invoices to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '3183b578-00e9-4875-b6d6-98fd414e9362', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Invoices for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3183b578-00e9-4875-b6d6-98fd414e9362', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Invoices for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3183b578-00e9-4875-b6d6-98fd414e9362', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Invoices for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3183b578-00e9-4875-b6d6-98fd414e9362', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Package Items */

      INSERT INTO [__mj].[Entity] (
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
         '1e1074d2-5a9c-48ff-bad2-3feda5ad24ea',
         'Package Items',
         NULL,
         'PackageItem wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (displayItem -> Display_Item__c)',
         NULL,
         'PackageItem',
         'vwPackageItems',
         'fonteva',
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

/* SQL generated to add new entity Package Items to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '1e1074d2-5a9c-48ff-bad2-3feda5ad24ea', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Package Items for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1e1074d2-5a9c-48ff-bad2-3feda5ad24ea', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Package Items for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1e1074d2-5a9c-48ff-bad2-3feda5ad24ea', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Package Items for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1e1074d2-5a9c-48ff-bad2-3feda5ad24ea', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Payment Gateways */

      INSERT INTO [__mj].[Entity] (
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
         'd8b481e1-2758-4a72-9fd8-7d798dbf5754',
         'Payment Gateways',
         NULL,
         'PaymentGateway wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (businessGroup -> Business_Group__c)',
         NULL,
         'PaymentGateway',
         'vwPaymentGateways',
         'fonteva',
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

/* SQL generated to add new entity Payment Gateways to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'd8b481e1-2758-4a72-9fd8-7d798dbf5754', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Payment Gateways for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d8b481e1-2758-4a72-9fd8-7d798dbf5754', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Payment Gateways for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d8b481e1-2758-4a72-9fd8-7d798dbf5754', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Payment Gateways for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d8b481e1-2758-4a72-9fd8-7d798dbf5754', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Payment Methods */

      INSERT INTO [__mj].[Entity] (
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
         '6ac59167-c0ce-4c7b-8b66-e86c522acb5f',
         'Payment Methods',
         NULL,
         'PaymentMethod wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (cardType -> Card_Type__c)',
         NULL,
         'PaymentMethod',
         'vwPaymentMethods',
         'fonteva',
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

/* SQL generated to add new entity Payment Methods to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '6ac59167-c0ce-4c7b-8b66-e86c522acb5f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Payment Methods for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6ac59167-c0ce-4c7b-8b66-e86c522acb5f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Payment Methods for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6ac59167-c0ce-4c7b-8b66-e86c522acb5f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Payment Methods for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6ac59167-c0ce-4c7b-8b66-e86c522acb5f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Price Rules */

      INSERT INTO [__mj].[Entity] (
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
         '31c1dc2f-b66f-4f1b-a90f-e2f22fff52cc',
         'Price Rules',
         NULL,
         'PriceRule wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (isDefault -> Is_Default__c)',
         NULL,
         'PriceRule',
         'vwPriceRules',
         'fonteva',
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

/* SQL generated to add new entity Price Rules to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '31c1dc2f-b66f-4f1b-a90f-e2f22fff52cc', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Price Rules for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('31c1dc2f-b66f-4f1b-a90f-e2f22fff52cc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Price Rules for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('31c1dc2f-b66f-4f1b-a90f-e2f22fff52cc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Price Rules for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('31c1dc2f-b66f-4f1b-a90f-e2f22fff52cc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Receipts */

      INSERT INTO [__mj].[Entity] (
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
         'b3710c16-c891-4b8d-9339-bd0ea9c3c67d',
         'Receipts',
         NULL,
         'Receipt wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (appliedAmount -> Applied_Amount__c)',
         NULL,
         'Receipt',
         'vwReceipts',
         'fonteva',
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

/* SQL generated to add new entity Receipts to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'b3710c16-c891-4b8d-9339-bd0ea9c3c67d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Receipts for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3710c16-c891-4b8d-9339-bd0ea9c3c67d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Receipts for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3710c16-c891-4b8d-9339-bd0ea9c3c67d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Receipts for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b3710c16-c891-4b8d-9339-bd0ea9c3c67d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Receipt Lines */

      INSERT INTO [__mj].[Entity] (
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
         'af63245f-25a0-42ba-95f9-c597be2fc595',
         'Receipt Lines',
         NULL,
         'ReceiptLine wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (invoiceLine -> Invoice_Line__c)',
         NULL,
         'ReceiptLine',
         'vwReceiptLines',
         'fonteva',
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

/* SQL generated to add new entity Receipt Lines to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'af63245f-25a0-42ba-95f9-c597be2fc595', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Receipt Lines for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('af63245f-25a0-42ba-95f9-c597be2fc595', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Receipt Lines for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('af63245f-25a0-42ba-95f9-c597be2fc595', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Receipt Lines for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('af63245f-25a0-42ba-95f9-c597be2fc595', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Scheduled Payments */

      INSERT INTO [__mj].[Entity] (
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
         'a35c1d90-2f3b-4fc5-851b-1d929b26aeb9',
         'Scheduled Payments',
         NULL,
         'ScheduledPayment wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (paymentMethod -> Payment_Method__c)',
         NULL,
         'ScheduledPayment',
         'vwScheduledPayments',
         'fonteva',
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

/* SQL generated to add new entity Scheduled Payments to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'a35c1d90-2f3b-4fc5-851b-1d929b26aeb9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Scheduled Payments for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a35c1d90-2f3b-4fc5-851b-1d929b26aeb9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Scheduled Payments for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a35c1d90-2f3b-4fc5-851b-1d929b26aeb9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Scheduled Payments for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('a35c1d90-2f3b-4fc5-851b-1d929b26aeb9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Scheduled Payment Lines */

      INSERT INTO [__mj].[Entity] (
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
         'd98bbab8-6b3c-4603-9609-65bf2e38a02d',
         'Scheduled Payment Lines',
         NULL,
         'ScheduledPaymentLine wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (paymentMethod -> Payment_Method__c)',
         NULL,
         'ScheduledPaymentLine',
         'vwScheduledPaymentLines',
         'fonteva',
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

/* SQL generated to add new entity Scheduled Payment Lines to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'd98bbab8-6b3c-4603-9609-65bf2e38a02d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Scheduled Payment Lines for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d98bbab8-6b3c-4603-9609-65bf2e38a02d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Scheduled Payment Lines for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d98bbab8-6b3c-4603-9609-65bf2e38a02d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Scheduled Payment Lines for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d98bbab8-6b3c-4603-9609-65bf2e38a02d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Stores */

      INSERT INTO [__mj].[Entity] (
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
         '849dd047-951b-45d0-a128-10c74a995e3b',
         'Stores',
         NULL,
         'Store wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (enableTaxInclusivePricing -> Enable_Tax_Inclusive_Pricing__c)',
         NULL,
         'Store',
         'vwStores',
         'fonteva',
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

/* SQL generated to add new entity Stores to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '849dd047-951b-45d0-a128-10c74a995e3b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Stores for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('849dd047-951b-45d0-a128-10c74a995e3b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Stores for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('849dd047-951b-45d0-a128-10c74a995e3b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Stores for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('849dd047-951b-45d0-a128-10c74a995e3b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Subscriptions */

      INSERT INTO [__mj].[Entity] (
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
         '57ace25c-bc19-45f2-b68d-789a6ae4d8e1',
         'Subscriptions',
         NULL,
         'Subscription wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (salesOrderLine -> Sales_Order_Line__c)',
         NULL,
         'Subscription',
         'vwSubscriptions',
         'fonteva',
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

/* SQL generated to add new entity Subscriptions to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '57ace25c-bc19-45f2-b68d-789a6ae4d8e1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscriptions for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('57ace25c-bc19-45f2-b68d-789a6ae4d8e1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscriptions for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('57ace25c-bc19-45f2-b68d-789a6ae4d8e1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscriptions for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('57ace25c-bc19-45f2-b68d-789a6ae4d8e1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Subscription Lines */

      INSERT INTO [__mj].[Entity] (
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
         'fd862b37-0e92-453e-a962-aeeb4b18e355',
         'Subscription Lines',
         NULL,
         'SubscriptionLine wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (salesOrderLine -> Sales_Order_Line__c)',
         NULL,
         'SubscriptionLine',
         'vwSubscriptionLines',
         'fonteva',
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

/* SQL generated to add new entity Subscription Lines to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'fd862b37-0e92-453e-a962-aeeb4b18e355', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscription Lines for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fd862b37-0e92-453e-a962-aeeb4b18e355', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscription Lines for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fd862b37-0e92-453e-a962-aeeb4b18e355', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscription Lines for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fd862b37-0e92-453e-a962-aeeb4b18e355', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Subscription Plans */

      INSERT INTO [__mj].[Entity] (
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
         'b9a3a9f2-658d-4453-8c0e-66d32a5690d1',
         'Subscription Plans',
         NULL,
         'SubscriptionPlan wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (isActive -> Is_Active__c)',
         NULL,
         'SubscriptionPlan',
         'vwSubscriptionPlans',
         'fonteva',
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

/* SQL generated to add new entity Subscription Plans to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', 'b9a3a9f2-658d-4453-8c0e-66d32a5690d1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscription Plans for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b9a3a9f2-658d-4453-8c0e-66d32a5690d1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscription Plans for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b9a3a9f2-658d-4453-8c0e-66d32a5690d1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Subscription Plans for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b9a3a9f2-658d-4453-8c0e-66d32a5690d1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Terms */

      INSERT INTO [__mj].[Entity] (
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
         '0b13fdf0-c135-4121-8d73-55ee28de67a0',
         'Terms',
         NULL,
         'Term wrapped object with camel case properties. Each properties maps to a field on the SObject that has _ for each capital letter. Ex. (isActive -> Is_Active__c)',
         NULL,
         'Term',
         'vwTerms',
         'fonteva',
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

/* SQL generated to add new entity Terms to application ID: '1FAABFBD-D23A-4979-AED2-378775061DB4' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('1FAABFBD-D23A-4979-AED2-378775061DB4', '0b13fdf0-c135-4121-8d73-55ee28de67a0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = '1FAABFBD-D23A-4979-AED2-378775061DB4'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Terms for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b13fdf0-c135-4121-8d73-55ee28de67a0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Terms for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b13fdf0-c135-4121-8d73-55ee28de67a0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Terms for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0b13fdf0-c135-4121-8d73-55ee28de67a0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

