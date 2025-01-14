/* SQL generated to create new entity Sales Tax Rates */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'e5a481de-b195-4dff-b5a5-7fb5c31839b0',
         'Sales Tax Rates',
         NULL,
         NULL,
         'SalesTaxRate',
         'vwSalesTaxRates',
         'Sales',
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
   

/* SQL generated to create new application Sales */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description) VALUES ('91c5c35c-a491-4ec1-89bd-6550ef49c030', 'Sales', 'Generated for schema')

/* SQL generated to add new entity Sales Tax Rates to application ID: '91c5c35c-a491-4ec1-89bd-6550ef49c030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91c5c35c-a491-4ec1-89bd-6550ef49c030', 'e5a481de-b195-4dff-b5a5-7fb5c31839b0', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91c5c35c-a491-4ec1-89bd-6550ef49c030'))

/* SQL generated to add new permission for entity Sales Tax Rates for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e5a481de-b195-4dff-b5a5-7fb5c31839b0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Tax Rates for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e5a481de-b195-4dff-b5a5-7fb5c31839b0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Tax Rates for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e5a481de-b195-4dff-b5a5-7fb5c31839b0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Person Credit Cards */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '98e66615-d8cf-4c61-a611-03e73bc3af32',
         'Person Credit Cards',
         NULL,
         NULL,
         'PersonCreditCard',
         'vwPersonCreditCards',
         'Sales',
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
   

/* SQL generated to add new entity Person Credit Cards to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '98e66615-d8cf-4c61-a611-03e73bc3af32', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Person Credit Cards for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('98e66615-d8cf-4c61-a611-03e73bc3af32', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Person Credit Cards for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('98e66615-d8cf-4c61-a611-03e73bc3af32', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Person Credit Cards for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('98e66615-d8cf-4c61-a611-03e73bc3af32', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Person Phones */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '9975ba73-2637-495a-93c2-2c38279a9bfa',
         'Person Phones',
         NULL,
         NULL,
         'PersonPhone',
         'vwPersonPhones',
         'Person',
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
   

/* SQL generated to create new application Person */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description) VALUES ('3732d087-d645-40e9-af0f-67abaadde2ba', 'Person', 'Generated for schema')

/* SQL generated to add new entity Person Phones to application ID: '3732d087-d645-40e9-af0f-67abaadde2ba' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732d087-d645-40e9-af0f-67abaadde2ba', '9975ba73-2637-495a-93c2-2c38279a9bfa', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732d087-d645-40e9-af0f-67abaadde2ba'))

/* SQL generated to add new permission for entity Person Phones for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9975ba73-2637-495a-93c2-2c38279a9bfa', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Person Phones for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9975ba73-2637-495a-93c2-2c38279a9bfa', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Person Phones for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9975ba73-2637-495a-93c2-2c38279a9bfa', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Territories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '5678dbe7-dadd-4eb2-95c4-bd81544abfee',
         'Sales Territories',
         NULL,
         NULL,
         'SalesTerritory',
         'vwSalesTerritories',
         'Sales',
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
   

/* SQL generated to add new entity Sales Territories to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '5678dbe7-dadd-4eb2-95c4-bd81544abfee', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Territories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5678dbe7-dadd-4eb2-95c4-bd81544abfee', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Territories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5678dbe7-dadd-4eb2-95c4-bd81544abfee', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Territories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5678dbe7-dadd-4eb2-95c4-bd81544abfee', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Phone Number Types */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'eff085e0-fd32-4935-9f17-cd23b59bba0b',
         'Phone Number Types',
         NULL,
         NULL,
         'PhoneNumberType',
         'vwPhoneNumberTypes',
         'Person',
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
   

/* SQL generated to add new entity Phone Number Types to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', 'eff085e0-fd32-4935-9f17-cd23b59bba0b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Phone Number Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('eff085e0-fd32-4935-9f17-cd23b59bba0b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Phone Number Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('eff085e0-fd32-4935-9f17-cd23b59bba0b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Phone Number Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('eff085e0-fd32-4935-9f17-cd23b59bba0b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Products */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '2e673a94-da9e-430a-a5fd-157cf69ec37b',
         'Products',
         NULL,
         NULL,
         'Product',
         'vwProducts',
         'Production',
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
   

/* SQL generated to create new application Production */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description) VALUES ('b4f7da6c-d746-4613-84a5-7d6fbcd12dff', 'Production', 'Generated for schema')

/* SQL generated to add new entity Products to application ID: 'b4f7da6c-d746-4613-84a5-7d6fbcd12dff' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('b4f7da6c-d746-4613-84a5-7d6fbcd12dff', '2e673a94-da9e-430a-a5fd-157cf69ec37b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'b4f7da6c-d746-4613-84a5-7d6fbcd12dff'))

/* SQL generated to add new permission for entity Products for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2e673a94-da9e-430a-a5fd-157cf69ec37b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Products for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2e673a94-da9e-430a-a5fd-157cf69ec37b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Products for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2e673a94-da9e-430a-a5fd-157cf69ec37b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Territory Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '539c7f45-fbb5-45b7-a4a7-367488d58937',
         'Sales Territory Histories',
         NULL,
         NULL,
         'SalesTerritoryHistory',
         'vwSalesTerritoryHistories',
         'Sales',
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
   

/* SQL generated to add new entity Sales Territory Histories to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '539c7f45-fbb5-45b7-a4a7-367488d58937', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Territory Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('539c7f45-fbb5-45b7-a4a7-367488d58937', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Territory Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('539c7f45-fbb5-45b7-a4a7-367488d58937', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Territory Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('539c7f45-fbb5-45b7-a4a7-367488d58937', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Scrap Reasons */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'f8816ceb-8954-41c6-8501-7c8c3d0b52e3',
         'Scrap Reasons',
         NULL,
         NULL,
         'ScrapReason',
         'vwScrapReasons',
         'Production',
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
   

/* SQL generated to add new entity Scrap Reasons to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'f8816ceb-8954-41c6-8501-7c8c3d0b52e3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Scrap Reasons for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f8816ceb-8954-41c6-8501-7c8c3d0b52e3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Scrap Reasons for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f8816ceb-8954-41c6-8501-7c8c3d0b52e3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Scrap Reasons for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f8816ceb-8954-41c6-8501-7c8c3d0b52e3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Shifts */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '77ef4de1-f4c5-4102-ba87-3df15f28f169',
         'Shifts',
         NULL,
         NULL,
         'Shift',
         'vwShifts',
         'HumanResources',
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
   

/* SQL generated to create new application HumanResources */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description) VALUES ('fc136a08-66fb-4294-bde5-458580020822', 'HumanResources', 'Generated for schema')

/* SQL generated to add new entity Shifts to application ID: 'fc136a08-66fb-4294-bde5-458580020822' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('fc136a08-66fb-4294-bde5-458580020822', '77ef4de1-f4c5-4102-ba87-3df15f28f169', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'fc136a08-66fb-4294-bde5-458580020822'))

/* SQL generated to add new permission for entity Shifts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('77ef4de1-f4c5-4102-ba87-3df15f28f169', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Shifts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('77ef4de1-f4c5-4102-ba87-3df15f28f169', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Shifts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('77ef4de1-f4c5-4102-ba87-3df15f28f169', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Categories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '9e13d382-3650-43df-8b06-36ec54d77f1f',
         'Product Categories',
         NULL,
         NULL,
         'ProductCategory',
         'vwProductCategories',
         'Production',
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
   

/* SQL generated to add new entity Product Categories to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '9e13d382-3650-43df-8b06-36ec54d77f1f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Categories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9e13d382-3650-43df-8b06-36ec54d77f1f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Categories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9e13d382-3650-43df-8b06-36ec54d77f1f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Categories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9e13d382-3650-43df-8b06-36ec54d77f1f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Ship Methods */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '68218f02-3c1f-412d-b58d-5bcb9ca5a768',
         'Ship Methods',
         NULL,
         NULL,
         'ShipMethod',
         'vwShipMethods',
         'Purchasing',
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
   

/* SQL generated to create new application Purchasing */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description) VALUES ('5e2eb5c9-99b4-4506-b209-2698dfd48ad6', 'Purchasing', 'Generated for schema')

/* SQL generated to add new entity Ship Methods to application ID: '5e2eb5c9-99b4-4506-b209-2698dfd48ad6' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('5e2eb5c9-99b4-4506-b209-2698dfd48ad6', '68218f02-3c1f-412d-b58d-5bcb9ca5a768', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '5e2eb5c9-99b4-4506-b209-2698dfd48ad6'))

/* SQL generated to add new permission for entity Ship Methods for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('68218f02-3c1f-412d-b58d-5bcb9ca5a768', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Ship Methods for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('68218f02-3c1f-412d-b58d-5bcb9ca5a768', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Ship Methods for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('68218f02-3c1f-412d-b58d-5bcb9ca5a768', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Cost Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'f1087060-c9d9-4750-9d57-b2695ae80b10',
         'Product Cost Histories',
         NULL,
         NULL,
         'ProductCostHistory',
         'vwProductCostHistories',
         'Production',
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
   

/* SQL generated to add new entity Product Cost Histories to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'f1087060-c9d9-4750-9d57-b2695ae80b10', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Cost Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f1087060-c9d9-4750-9d57-b2695ae80b10', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Cost Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f1087060-c9d9-4750-9d57-b2695ae80b10', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Cost Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f1087060-c9d9-4750-9d57-b2695ae80b10', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Descriptions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'f2c0c7d6-6ad9-42c5-9684-2695bbe9f23b',
         'Product Descriptions',
         NULL,
         NULL,
         'ProductDescription',
         'vwProductDescriptions',
         'Production',
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
   

/* SQL generated to add new entity Product Descriptions to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'f2c0c7d6-6ad9-42c5-9684-2695bbe9f23b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Descriptions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2c0c7d6-6ad9-42c5-9684-2695bbe9f23b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Descriptions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2c0c7d6-6ad9-42c5-9684-2695bbe9f23b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Descriptions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2c0c7d6-6ad9-42c5-9684-2695bbe9f23b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Shopping Cart Items */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'cd5aa32b-bdf9-4896-8733-2927de7d96ba',
         'Shopping Cart Items',
         NULL,
         NULL,
         'ShoppingCartItem',
         'vwShoppingCartItems',
         'Sales',
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
   

/* SQL generated to add new entity Shopping Cart Items to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'cd5aa32b-bdf9-4896-8733-2927de7d96ba', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Shopping Cart Items for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cd5aa32b-bdf9-4896-8733-2927de7d96ba', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Shopping Cart Items for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cd5aa32b-bdf9-4896-8733-2927de7d96ba', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Shopping Cart Items for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cd5aa32b-bdf9-4896-8733-2927de7d96ba', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Documents */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '4594a23b-acbd-44c7-9055-cfbb2b54bd1f',
         'Product Documents',
         NULL,
         NULL,
         'ProductDocument',
         'vwProductDocuments',
         'Production',
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
   

/* SQL generated to add new entity Product Documents to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '4594a23b-acbd-44c7-9055-cfbb2b54bd1f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Documents for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4594a23b-acbd-44c7-9055-cfbb2b54bd1f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Documents for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4594a23b-acbd-44c7-9055-cfbb2b54bd1f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Documents for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4594a23b-acbd-44c7-9055-cfbb2b54bd1f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Database Logs */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'c42f8588-723c-4b5f-ba2a-5905493a5e00',
         'Database Logs',
         NULL,
         NULL,
         'DatabaseLog',
         'vwDatabaseLogs',
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
   

/* SQL generated to create new application dbo */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description) VALUES ('fc9d9140-6c02-4eee-9b34-046d0fae2046', 'dbo', 'Generated for schema')

/* SQL generated to add new entity Database Logs to application ID: 'fc9d9140-6c02-4eee-9b34-046d0fae2046' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('fc9d9140-6c02-4eee-9b34-046d0fae2046', 'c42f8588-723c-4b5f-ba2a-5905493a5e00', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'fc9d9140-6c02-4eee-9b34-046d0fae2046'))

/* SQL generated to add new permission for entity Database Logs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c42f8588-723c-4b5f-ba2a-5905493a5e00', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Database Logs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c42f8588-723c-4b5f-ba2a-5905493a5e00', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Database Logs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c42f8588-723c-4b5f-ba2a-5905493a5e00', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Inventories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '4e3c36fe-a9b3-4bf2-9d06-e63d5bbf1cef',
         'Product Inventories',
         NULL,
         NULL,
         'ProductInventory',
         'vwProductInventories',
         'Production',
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
   

/* SQL generated to add new entity Product Inventories to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '4e3c36fe-a9b3-4bf2-9d06-e63d5bbf1cef', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Inventories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4e3c36fe-a9b3-4bf2-9d06-e63d5bbf1cef', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Inventories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4e3c36fe-a9b3-4bf2-9d06-e63d5bbf1cef', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Inventories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4e3c36fe-a9b3-4bf2-9d06-e63d5bbf1cef', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Special Offers */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '14cfdc86-168e-4fc0-9412-218ec12723c3',
         'Special Offers',
         NULL,
         NULL,
         'SpecialOffer',
         'vwSpecialOffers',
         'Sales',
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
   

/* SQL generated to add new entity Special Offers to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '14cfdc86-168e-4fc0-9412-218ec12723c3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Special Offers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('14cfdc86-168e-4fc0-9412-218ec12723c3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Special Offers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('14cfdc86-168e-4fc0-9412-218ec12723c3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Special Offers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('14cfdc86-168e-4fc0-9412-218ec12723c3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Error Logs__dbo */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '75f0e21a-590e-41bd-871f-fffaa69033d5',
         'Error Logs__dbo',
         NULL,
         '__dbo',
         'ErrorLog',
         'vwErrorLogs__dbo',
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
   

/* SQL generated to add new entity Error Logs__dbo to application ID: 'FC9D9140-6C02-4EEE-9B34-046D0FAE2046' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('FC9D9140-6C02-4EEE-9B34-046D0FAE2046', '75f0e21a-590e-41bd-871f-fffaa69033d5', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'FC9D9140-6C02-4EEE-9B34-046D0FAE2046'))

/* SQL generated to add new permission for entity Error Logs__dbo for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('75f0e21a-590e-41bd-871f-fffaa69033d5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Error Logs__dbo for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('75f0e21a-590e-41bd-871f-fffaa69033d5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Error Logs__dbo for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('75f0e21a-590e-41bd-871f-fffaa69033d5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product List Price Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'b3ced5cc-2705-4de4-9d41-cb7d84295129',
         'Product List Price Histories',
         NULL,
         NULL,
         'ProductListPriceHistory',
         'vwProductListPriceHistories',
         'Production',
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
   

/* SQL generated to add new entity Product List Price Histories to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'b3ced5cc-2705-4de4-9d41-cb7d84295129', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product List Price Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b3ced5cc-2705-4de4-9d41-cb7d84295129', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product List Price Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b3ced5cc-2705-4de4-9d41-cb7d84295129', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product List Price Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b3ced5cc-2705-4de4-9d41-cb7d84295129', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Address */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'fcc72094-4d4d-4922-a921-b53929412a8a',
         'Address',
         NULL,
         NULL,
         'Address',
         'vwAddress',
         'Person',
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
   

/* SQL generated to add new entity Address to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', 'fcc72094-4d4d-4922-a921-b53929412a8a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Address for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fcc72094-4d4d-4922-a921-b53929412a8a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Address for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fcc72094-4d4d-4922-a921-b53929412a8a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Address for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fcc72094-4d4d-4922-a921-b53929412a8a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Special Offer Products */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '2e9d2d3e-09f1-460b-9438-00a7deecda17',
         'Special Offer Products',
         NULL,
         NULL,
         'SpecialOfferProduct',
         'vwSpecialOfferProducts',
         'Sales',
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
   

/* SQL generated to add new entity Special Offer Products to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '2e9d2d3e-09f1-460b-9438-00a7deecda17', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Special Offer Products for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2e9d2d3e-09f1-460b-9438-00a7deecda17', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Special Offer Products for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2e9d2d3e-09f1-460b-9438-00a7deecda17', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Special Offer Products for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2e9d2d3e-09f1-460b-9438-00a7deecda17', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Models */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '762cf79e-6b98-44ac-a286-c032e0e0ad3d',
         'Product Models',
         NULL,
         NULL,
         'ProductModel',
         'vwProductModels',
         'Production',
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
   

/* SQL generated to add new entity Product Models to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '762cf79e-6b98-44ac-a286-c032e0e0ad3d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Models for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('762cf79e-6b98-44ac-a286-c032e0e0ad3d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Models for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('762cf79e-6b98-44ac-a286-c032e0e0ad3d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Models for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('762cf79e-6b98-44ac-a286-c032e0e0ad3d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Address Types */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '9183f478-37b6-4251-8248-7ba9bc645a07',
         'Address Types',
         NULL,
         NULL,
         'AddressType',
         'vwAddressTypes',
         'Person',
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
   

/* SQL generated to add new entity Address Types to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', '9183f478-37b6-4251-8248-7ba9bc645a07', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Address Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9183f478-37b6-4251-8248-7ba9bc645a07', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Address Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9183f478-37b6-4251-8248-7ba9bc645a07', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Address Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9183f478-37b6-4251-8248-7ba9bc645a07', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity State Provinces */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'd40e7660-118e-4acc-bed4-7004330a9337',
         'State Provinces',
         NULL,
         NULL,
         'StateProvince',
         'vwStateProvinces',
         'Person',
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
   

/* SQL generated to add new entity State Provinces to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', 'd40e7660-118e-4acc-bed4-7004330a9337', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity State Provinces for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d40e7660-118e-4acc-bed4-7004330a9337', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity State Provinces for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d40e7660-118e-4acc-bed4-7004330a9337', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity State Provinces for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d40e7660-118e-4acc-bed4-7004330a9337', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Model Illustrations */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '947a0d5e-a1c3-4821-aaef-141aff8cee45',
         'Product Model Illustrations',
         NULL,
         NULL,
         'ProductModelIllustration',
         'vwProductModelIllustrations',
         'Production',
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
   

/* SQL generated to add new entity Product Model Illustrations to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '947a0d5e-a1c3-4821-aaef-141aff8cee45', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Model Illustrations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('947a0d5e-a1c3-4821-aaef-141aff8cee45', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Model Illustrations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('947a0d5e-a1c3-4821-aaef-141aff8cee45', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Model Illustrations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('947a0d5e-a1c3-4821-aaef-141aff8cee45', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity AWBuild Versions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '1f872d2f-37a0-48f8-a1e8-8e835683d068',
         'AWBuild Versions',
         NULL,
         NULL,
         'AWBuildVersion',
         'vwAWBuildVersions',
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
   

/* SQL generated to add new entity AWBuild Versions to application ID: 'FC9D9140-6C02-4EEE-9B34-046D0FAE2046' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('FC9D9140-6C02-4EEE-9B34-046D0FAE2046', '1f872d2f-37a0-48f8-a1e8-8e835683d068', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'FC9D9140-6C02-4EEE-9B34-046D0FAE2046'))

/* SQL generated to add new permission for entity AWBuild Versions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1f872d2f-37a0-48f8-a1e8-8e835683d068', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity AWBuild Versions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1f872d2f-37a0-48f8-a1e8-8e835683d068', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity AWBuild Versions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1f872d2f-37a0-48f8-a1e8-8e835683d068', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Model Product Description Cultures */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '4b324846-c9a3-40bd-ada4-aceed03dcb68',
         'Product Model Product Description Cultures',
         NULL,
         NULL,
         'ProductModelProductDescriptionCulture',
         'vwProductModelProductDescriptionCultures',
         'Production',
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
   

/* SQL generated to add new entity Product Model Product Description Cultures to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '4b324846-c9a3-40bd-ada4-aceed03dcb68', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Model Product Description Cultures for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4b324846-c9a3-40bd-ada4-aceed03dcb68', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Model Product Description Cultures for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4b324846-c9a3-40bd-ada4-aceed03dcb68', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Model Product Description Cultures for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4b324846-c9a3-40bd-ada4-aceed03dcb68', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Bill Of Materials */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '050db399-1ccc-4b5c-9f69-0a59f0e32ebf',
         'Bill Of Materials',
         NULL,
         NULL,
         'BillOfMaterials',
         'vwBillOfMaterials',
         'Production',
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
   

/* SQL generated to add new entity Bill Of Materials to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '050db399-1ccc-4b5c-9f69-0a59f0e32ebf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Bill Of Materials for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('050db399-1ccc-4b5c-9f69-0a59f0e32ebf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Bill Of Materials for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('050db399-1ccc-4b5c-9f69-0a59f0e32ebf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Bill Of Materials for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('050db399-1ccc-4b5c-9f69-0a59f0e32ebf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Stores */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '7bf23f49-f7ec-4048-ac37-047e2e5d2f15',
         'Stores',
         NULL,
         NULL,
         'Store',
         'vwStores',
         'Sales',
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
   

/* SQL generated to add new entity Stores to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '7bf23f49-f7ec-4048-ac37-047e2e5d2f15', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Stores for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7bf23f49-f7ec-4048-ac37-047e2e5d2f15', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Stores for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7bf23f49-f7ec-4048-ac37-047e2e5d2f15', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Stores for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7bf23f49-f7ec-4048-ac37-047e2e5d2f15', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Photos */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'd04c35d6-bd66-4f79-9c00-9db273f92597',
         'Product Photos',
         NULL,
         NULL,
         'ProductPhoto',
         'vwProductPhotos',
         'Production',
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
   

/* SQL generated to add new entity Product Photos to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'd04c35d6-bd66-4f79-9c00-9db273f92597', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Photos for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d04c35d6-bd66-4f79-9c00-9db273f92597', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Photos for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d04c35d6-bd66-4f79-9c00-9db273f92597', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Photos for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d04c35d6-bd66-4f79-9c00-9db273f92597', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Product Photos */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'be1eacd8-377a-41c8-9d1a-b60dea824eb1',
         'Product Product Photos',
         NULL,
         NULL,
         'ProductProductPhoto',
         'vwProductProductPhotos',
         'Production',
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
   

/* SQL generated to add new entity Product Product Photos to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'be1eacd8-377a-41c8-9d1a-b60dea824eb1', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Product Photos for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('be1eacd8-377a-41c8-9d1a-b60dea824eb1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Product Photos for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('be1eacd8-377a-41c8-9d1a-b60dea824eb1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Product Photos for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('be1eacd8-377a-41c8-9d1a-b60dea824eb1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Transaction Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '12d656cb-32d3-4857-9ffc-ec660aab061c',
         'Transaction Histories',
         NULL,
         NULL,
         'TransactionHistory',
         'vwTransactionHistories',
         'Production',
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
   

/* SQL generated to add new entity Transaction Histories to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '12d656cb-32d3-4857-9ffc-ec660aab061c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Transaction Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('12d656cb-32d3-4857-9ffc-ec660aab061c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Transaction Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('12d656cb-32d3-4857-9ffc-ec660aab061c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Transaction Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('12d656cb-32d3-4857-9ffc-ec660aab061c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity AIAgent Learning Cycles */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '7c17bbeb-4eb7-4904-b627-e08eb4cff54f',
         'AIAgent Learning Cycles',
         NULL,
         NULL,
         'AIAgentLearningCycle',
         'vwAIAgentLearningCycles',
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
   

/* SQL generated to add new permission for entity AIAgent Learning Cycles for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7c17bbeb-4eb7-4904-b627-e08eb4cff54f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity AIAgent Learning Cycles for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7c17bbeb-4eb7-4904-b627-e08eb4cff54f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity AIAgent Learning Cycles for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7c17bbeb-4eb7-4904-b627-e08eb4cff54f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Reviews */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '0af977a8-c363-4137-9042-dd79d02b4e66',
         'Product Reviews',
         NULL,
         NULL,
         'ProductReview',
         'vwProductReviews',
         'Production',
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
   

/* SQL generated to add new entity Product Reviews to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '0af977a8-c363-4137-9042-dd79d02b4e66', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Reviews for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0af977a8-c363-4137-9042-dd79d02b4e66', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Reviews for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0af977a8-c363-4137-9042-dd79d02b4e66', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Reviews for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0af977a8-c363-4137-9042-dd79d02b4e66', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Business Entities */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'f4c2a01d-daf7-478c-b23a-dbebc551c567',
         'Business Entities',
         NULL,
         NULL,
         'BusinessEntity',
         'vwBusinessEntities',
         'Person',
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
   

/* SQL generated to add new entity Business Entities to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', 'f4c2a01d-daf7-478c-b23a-dbebc551c567', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Business Entities for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f4c2a01d-daf7-478c-b23a-dbebc551c567', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Business Entities for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f4c2a01d-daf7-478c-b23a-dbebc551c567', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Business Entities for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f4c2a01d-daf7-478c-b23a-dbebc551c567', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Transaction History Archives */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '930d0f58-2fad-4455-96bc-045b12441a7b',
         'Transaction History Archives',
         NULL,
         NULL,
         'TransactionHistoryArchive',
         'vwTransactionHistoryArchives',
         'Production',
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
   

/* SQL generated to add new entity Transaction History Archives to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '930d0f58-2fad-4455-96bc-045b12441a7b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Transaction History Archives for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('930d0f58-2fad-4455-96bc-045b12441a7b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Transaction History Archives for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('930d0f58-2fad-4455-96bc-045b12441a7b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Transaction History Archives for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('930d0f58-2fad-4455-96bc-045b12441a7b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Subcategories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '14685a95-ac4c-4758-afdf-193c5ab2e911',
         'Product Subcategories',
         NULL,
         NULL,
         'ProductSubcategory',
         'vwProductSubcategories',
         'Production',
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
   

/* SQL generated to add new entity Product Subcategories to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '14685a95-ac4c-4758-afdf-193c5ab2e911', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Product Subcategories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('14685a95-ac4c-4758-afdf-193c5ab2e911', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Subcategories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('14685a95-ac4c-4758-afdf-193c5ab2e911', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Subcategories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('14685a95-ac4c-4758-afdf-193c5ab2e911', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Business Entity Address */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '1a3d6916-a332-4abb-bf45-0cc3211eea16',
         'Business Entity Address',
         NULL,
         NULL,
         'BusinessEntityAddress',
         'vwBusinessEntityAddress',
         'Person',
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
   

/* SQL generated to add new entity Business Entity Address to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', '1a3d6916-a332-4abb-bf45-0cc3211eea16', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Business Entity Address for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1a3d6916-a332-4abb-bf45-0cc3211eea16', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Business Entity Address for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1a3d6916-a332-4abb-bf45-0cc3211eea16', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Business Entity Address for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1a3d6916-a332-4abb-bf45-0cc3211eea16', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Product Vendors */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'c4e5e4fe-61c4-4aeb-81c1-05631f826a8e',
         'Product Vendors',
         NULL,
         NULL,
         'ProductVendor',
         'vwProductVendors',
         'Purchasing',
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
   

/* SQL generated to add new entity Product Vendors to application ID: '5E2EB5C9-99B4-4506-B209-2698DFD48AD6' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('5E2EB5C9-99B4-4506-B209-2698DFD48AD6', 'c4e5e4fe-61c4-4aeb-81c1-05631f826a8e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '5E2EB5C9-99B4-4506-B209-2698DFD48AD6'))

/* SQL generated to add new permission for entity Product Vendors for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c4e5e4fe-61c4-4aeb-81c1-05631f826a8e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Product Vendors for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c4e5e4fe-61c4-4aeb-81c1-05631f826a8e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Product Vendors for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c4e5e4fe-61c4-4aeb-81c1-05631f826a8e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Business Entity Contacts */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '1e5e9469-7779-4321-b513-125918c96c0d',
         'Business Entity Contacts',
         NULL,
         NULL,
         'BusinessEntityContact',
         'vwBusinessEntityContacts',
         'Person',
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
   

/* SQL generated to add new entity Business Entity Contacts to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', '1e5e9469-7779-4321-b513-125918c96c0d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Business Entity Contacts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1e5e9469-7779-4321-b513-125918c96c0d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Business Entity Contacts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1e5e9469-7779-4321-b513-125918c96c0d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Business Entity Contacts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1e5e9469-7779-4321-b513-125918c96c0d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Unit Measures */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '4729e6fa-b4c2-43f3-a857-f1c890dd2573',
         'Unit Measures',
         NULL,
         NULL,
         'UnitMeasure',
         'vwUnitMeasures',
         'Production',
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
   

/* SQL generated to add new entity Unit Measures to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '4729e6fa-b4c2-43f3-a857-f1c890dd2573', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Unit Measures for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4729e6fa-b4c2-43f3-a857-f1c890dd2573', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Unit Measures for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4729e6fa-b4c2-43f3-a857-f1c890dd2573', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Unit Measures for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4729e6fa-b4c2-43f3-a857-f1c890dd2573', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Vendors */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ae05857e-42c8-4b4e-9d45-3775e8b33a7c',
         'Vendors',
         NULL,
         NULL,
         'Vendor',
         'vwVendors',
         'Purchasing',
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
   

/* SQL generated to add new entity Vendors to application ID: '5E2EB5C9-99B4-4506-B209-2698DFD48AD6' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('5E2EB5C9-99B4-4506-B209-2698DFD48AD6', 'ae05857e-42c8-4b4e-9d45-3775e8b33a7c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '5E2EB5C9-99B4-4506-B209-2698DFD48AD6'))

/* SQL generated to add new permission for entity Vendors for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae05857e-42c8-4b4e-9d45-3775e8b33a7c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Vendors for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae05857e-42c8-4b4e-9d45-3775e8b33a7c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Vendors for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae05857e-42c8-4b4e-9d45-3775e8b33a7c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contact Types */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '4f988f9f-c324-4d05-8e7f-df8d3d1b3305',
         'Contact Types',
         NULL,
         NULL,
         'ContactType',
         'vwContactTypes',
         'Person',
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
   

/* SQL generated to add new entity Contact Types to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', '4f988f9f-c324-4d05-8e7f-df8d3d1b3305', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Contact Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f988f9f-c324-4d05-8e7f-df8d3d1b3305', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contact Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f988f9f-c324-4d05-8e7f-df8d3d1b3305', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contact Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f988f9f-c324-4d05-8e7f-df8d3d1b3305', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Country Region Currencies */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ed1d3130-136c-4d84-a675-af2353d7f70d',
         'Country Region Currencies',
         NULL,
         NULL,
         'CountryRegionCurrency',
         'vwCountryRegionCurrencies',
         'Sales',
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
   

/* SQL generated to add new entity Country Region Currencies to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'ed1d3130-136c-4d84-a675-af2353d7f70d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Country Region Currencies for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed1d3130-136c-4d84-a675-af2353d7f70d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Country Region Currencies for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed1d3130-136c-4d84-a675-af2353d7f70d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Country Region Currencies for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed1d3130-136c-4d84-a675-af2353d7f70d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Country Regions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '8b23e276-4165-4e4e-83b8-8efe4fbf2a89',
         'Country Regions',
         NULL,
         NULL,
         'CountryRegion',
         'vwCountryRegions',
         'Person',
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
   

/* SQL generated to add new entity Country Regions to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', '8b23e276-4165-4e4e-83b8-8efe4fbf2a89', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Country Regions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8b23e276-4165-4e4e-83b8-8efe4fbf2a89', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Country Regions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8b23e276-4165-4e4e-83b8-8efe4fbf2a89', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Country Regions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8b23e276-4165-4e4e-83b8-8efe4fbf2a89', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Work Orders */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '3008b3b2-b613-4fda-9764-c299e55ffa49',
         'Work Orders',
         NULL,
         NULL,
         'WorkOrder',
         'vwWorkOrders',
         'Production',
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
   

/* SQL generated to add new entity Work Orders to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '3008b3b2-b613-4fda-9764-c299e55ffa49', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Work Orders for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3008b3b2-b613-4fda-9764-c299e55ffa49', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Work Orders for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3008b3b2-b613-4fda-9764-c299e55ffa49', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Work Orders for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3008b3b2-b613-4fda-9764-c299e55ffa49', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Purchase Order Details */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '3c9aef88-1f32-404e-9a3f-b0d764887b52',
         'Purchase Order Details',
         NULL,
         NULL,
         'PurchaseOrderDetail',
         'vwPurchaseOrderDetails',
         'Purchasing',
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
   

/* SQL generated to add new entity Purchase Order Details to application ID: '5E2EB5C9-99B4-4506-B209-2698DFD48AD6' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('5E2EB5C9-99B4-4506-B209-2698DFD48AD6', '3c9aef88-1f32-404e-9a3f-b0d764887b52', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '5E2EB5C9-99B4-4506-B209-2698DFD48AD6'))

/* SQL generated to add new permission for entity Purchase Order Details for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3c9aef88-1f32-404e-9a3f-b0d764887b52', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Purchase Order Details for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3c9aef88-1f32-404e-9a3f-b0d764887b52', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Purchase Order Details for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3c9aef88-1f32-404e-9a3f-b0d764887b52', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Credit Cards */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'f5789abf-7fbb-47c6-8257-91e74b042be8',
         'Credit Cards',
         NULL,
         NULL,
         'CreditCard',
         'vwCreditCards',
         'Sales',
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
   

/* SQL generated to add new entity Credit Cards to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'f5789abf-7fbb-47c6-8257-91e74b042be8', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Credit Cards for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f5789abf-7fbb-47c6-8257-91e74b042be8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Credit Cards for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f5789abf-7fbb-47c6-8257-91e74b042be8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Credit Cards for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f5789abf-7fbb-47c6-8257-91e74b042be8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Cultures */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '92c3ea47-9c67-4ad9-92c4-a0e2389288d5',
         'Cultures',
         NULL,
         NULL,
         'Culture',
         'vwCultures',
         'Production',
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
   

/* SQL generated to add new entity Cultures to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', '92c3ea47-9c67-4ad9-92c4-a0e2389288d5', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Cultures for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('92c3ea47-9c67-4ad9-92c4-a0e2389288d5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Cultures for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('92c3ea47-9c67-4ad9-92c4-a0e2389288d5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Cultures for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('92c3ea47-9c67-4ad9-92c4-a0e2389288d5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity flyway _schema _histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '22bd66eb-f303-481e-9fbb-65703ef0e7aa',
         'flyway _schema _histories',
         NULL,
         NULL,
         'flyway_schema_history',
         'vwflyway_schema_histories',
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
   

/* SQL generated to add new permission for entity flyway _schema _histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('22bd66eb-f303-481e-9fbb-65703ef0e7aa', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity flyway _schema _histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('22bd66eb-f303-481e-9fbb-65703ef0e7aa', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity flyway _schema _histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('22bd66eb-f303-481e-9fbb-65703ef0e7aa', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Work Order Routings */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'b62575bf-e263-4930-a340-64fad548be33',
         'Work Order Routings',
         NULL,
         NULL,
         'WorkOrderRouting',
         'vwWorkOrderRoutings',
         'Production',
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
   

/* SQL generated to add new entity Work Order Routings to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'b62575bf-e263-4930-a340-64fad548be33', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Work Order Routings for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b62575bf-e263-4930-a340-64fad548be33', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Work Order Routings for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b62575bf-e263-4930-a340-64fad548be33', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Work Order Routings for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b62575bf-e263-4930-a340-64fad548be33', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Currencies */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'b06e8264-e3b9-40c7-8eae-9135c9b8a520',
         'Currencies',
         NULL,
         NULL,
         'Currency',
         'vwCurrencies',
         'Sales',
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
   

/* SQL generated to add new entity Currencies to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'b06e8264-e3b9-40c7-8eae-9135c9b8a520', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Currencies for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b06e8264-e3b9-40c7-8eae-9135c9b8a520', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Currencies for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b06e8264-e3b9-40c7-8eae-9135c9b8a520', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Currencies for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b06e8264-e3b9-40c7-8eae-9135c9b8a520', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Purchase Order Headers */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '9df970e4-7c2b-406e-ad55-517b11016e3c',
         'Purchase Order Headers',
         NULL,
         NULL,
         'PurchaseOrderHeader',
         'vwPurchaseOrderHeaders',
         'Purchasing',
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
   

/* SQL generated to add new entity Purchase Order Headers to application ID: '5E2EB5C9-99B4-4506-B209-2698DFD48AD6' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('5E2EB5C9-99B4-4506-B209-2698DFD48AD6', '9df970e4-7c2b-406e-ad55-517b11016e3c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '5E2EB5C9-99B4-4506-B209-2698DFD48AD6'))

/* SQL generated to add new permission for entity Purchase Order Headers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9df970e4-7c2b-406e-ad55-517b11016e3c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Purchase Order Headers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9df970e4-7c2b-406e-ad55-517b11016e3c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Purchase Order Headers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9df970e4-7c2b-406e-ad55-517b11016e3c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Currency Rates */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ed3ef6b4-ff92-4456-af20-c542cfa7dcc3',
         'Currency Rates',
         NULL,
         NULL,
         'CurrencyRate',
         'vwCurrencyRates',
         'Sales',
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
   

/* SQL generated to add new entity Currency Rates to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'ed3ef6b4-ff92-4456-af20-c542cfa7dcc3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Currency Rates for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed3ef6b4-ff92-4456-af20-c542cfa7dcc3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Currency Rates for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed3ef6b4-ff92-4456-af20-c542cfa7dcc3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Currency Rates for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed3ef6b4-ff92-4456-af20-c542cfa7dcc3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Customers */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'c19b85db-573b-438f-b45c-3ce8b711ea9a',
         'Customers',
         NULL,
         NULL,
         'Customer',
         'vwCustomers',
         'Sales',
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
   

/* SQL generated to add new entity Customers to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'c19b85db-573b-438f-b45c-3ce8b711ea9a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Customers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c19b85db-573b-438f-b45c-3ce8b711ea9a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Customers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c19b85db-573b-438f-b45c-3ce8b711ea9a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Customers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c19b85db-573b-438f-b45c-3ce8b711ea9a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Departments */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '2608b392-6743-458f-a179-967f02799339',
         'Departments',
         NULL,
         NULL,
         'Department',
         'vwDepartments',
         'HumanResources',
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
   

/* SQL generated to add new entity Departments to application ID: 'FC136A08-66FB-4294-BDE5-458580020822' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('FC136A08-66FB-4294-BDE5-458580020822', '2608b392-6743-458f-a179-967f02799339', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'FC136A08-66FB-4294-BDE5-458580020822'))

/* SQL generated to add new permission for entity Departments for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2608b392-6743-458f-a179-967f02799339', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Departments for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2608b392-6743-458f-a179-967f02799339', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Departments for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2608b392-6743-458f-a179-967f02799339', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Documents */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ab7cb582-bca0-4d89-a2a9-fabcda062f24',
         'Documents',
         NULL,
         NULL,
         'Document',
         'vwDocuments',
         'Production',
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
   

/* SQL generated to add new entity Documents to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'ab7cb582-bca0-4d89-a2a9-fabcda062f24', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Documents for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ab7cb582-bca0-4d89-a2a9-fabcda062f24', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Documents for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ab7cb582-bca0-4d89-a2a9-fabcda062f24', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Documents for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ab7cb582-bca0-4d89-a2a9-fabcda062f24', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Order Details */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'd3c903bf-243f-4a28-9fcc-56cd77a926fc',
         'Sales Order Details',
         NULL,
         NULL,
         'SalesOrderDetail',
         'vwSalesOrderDetails',
         'Sales',
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
   

/* SQL generated to add new entity Sales Order Details to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'd3c903bf-243f-4a28-9fcc-56cd77a926fc', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Order Details for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d3c903bf-243f-4a28-9fcc-56cd77a926fc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Order Details for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d3c903bf-243f-4a28-9fcc-56cd77a926fc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Order Details for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d3c903bf-243f-4a28-9fcc-56cd77a926fc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Email Address */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'a479408b-fab5-40e4-bc66-1dd0f655ceae',
         'Email Address',
         NULL,
         NULL,
         'EmailAddress',
         'vwEmailAddress',
         'Person',
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
   

/* SQL generated to add new entity Email Address to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', 'a479408b-fab5-40e4-bc66-1dd0f655ceae', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Email Address for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a479408b-fab5-40e4-bc66-1dd0f655ceae', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Email Address for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a479408b-fab5-40e4-bc66-1dd0f655ceae', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Email Address for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a479408b-fab5-40e4-bc66-1dd0f655ceae', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Employees__HumanResources */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '7ce5ed1b-0640-4715-bfc5-069dad6c9569',
         'Employees__HumanResources',
         NULL,
         '__HumanResources',
         'Employee',
         'vwEmployees__HumanResources',
         'HumanResources',
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
   

/* SQL generated to add new entity Employees__HumanResources to application ID: 'FC136A08-66FB-4294-BDE5-458580020822' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('FC136A08-66FB-4294-BDE5-458580020822', '7ce5ed1b-0640-4715-bfc5-069dad6c9569', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'FC136A08-66FB-4294-BDE5-458580020822'))

/* SQL generated to add new permission for entity Employees__HumanResources for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ce5ed1b-0640-4715-bfc5-069dad6c9569', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Employees__HumanResources for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ce5ed1b-0640-4715-bfc5-069dad6c9569', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Employees__HumanResources for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ce5ed1b-0640-4715-bfc5-069dad6c9569', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Order Headers */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '43e3fa42-4653-414f-8b37-fd7773cd3fd4',
         'Sales Order Headers',
         NULL,
         NULL,
         'SalesOrderHeader',
         'vwSalesOrderHeaders',
         'Sales',
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
   

/* SQL generated to add new entity Sales Order Headers to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '43e3fa42-4653-414f-8b37-fd7773cd3fd4', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Order Headers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('43e3fa42-4653-414f-8b37-fd7773cd3fd4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Order Headers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('43e3fa42-4653-414f-8b37-fd7773cd3fd4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Order Headers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('43e3fa42-4653-414f-8b37-fd7773cd3fd4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Employee Department Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'b911d26f-af1b-4432-9d93-3bf3a7b1d2bf',
         'Employee Department Histories',
         NULL,
         NULL,
         'EmployeeDepartmentHistory',
         'vwEmployeeDepartmentHistories',
         'HumanResources',
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
   

/* SQL generated to add new entity Employee Department Histories to application ID: 'FC136A08-66FB-4294-BDE5-458580020822' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('FC136A08-66FB-4294-BDE5-458580020822', 'b911d26f-af1b-4432-9d93-3bf3a7b1d2bf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'FC136A08-66FB-4294-BDE5-458580020822'))

/* SQL generated to add new permission for entity Employee Department Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b911d26f-af1b-4432-9d93-3bf3a7b1d2bf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Employee Department Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b911d26f-af1b-4432-9d93-3bf3a7b1d2bf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Employee Department Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b911d26f-af1b-4432-9d93-3bf3a7b1d2bf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Employee Pay Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'b4a7173c-841e-46cb-a7fb-accb6972741b',
         'Employee Pay Histories',
         NULL,
         NULL,
         'EmployeePayHistory',
         'vwEmployeePayHistories',
         'HumanResources',
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
   

/* SQL generated to add new entity Employee Pay Histories to application ID: 'FC136A08-66FB-4294-BDE5-458580020822' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('FC136A08-66FB-4294-BDE5-458580020822', 'b4a7173c-841e-46cb-a7fb-accb6972741b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'FC136A08-66FB-4294-BDE5-458580020822'))

/* SQL generated to add new permission for entity Employee Pay Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b4a7173c-841e-46cb-a7fb-accb6972741b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Employee Pay Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b4a7173c-841e-46cb-a7fb-accb6972741b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Employee Pay Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b4a7173c-841e-46cb-a7fb-accb6972741b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Order Header Sales Reasons */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '8035f66a-7f74-48ca-a782-e7cf978ce2c4',
         'Sales Order Header Sales Reasons',
         NULL,
         NULL,
         'SalesOrderHeaderSalesReason',
         'vwSalesOrderHeaderSalesReasons',
         'Sales',
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
   

/* SQL generated to add new entity Sales Order Header Sales Reasons to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '8035f66a-7f74-48ca-a782-e7cf978ce2c4', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Order Header Sales Reasons for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8035f66a-7f74-48ca-a782-e7cf978ce2c4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Order Header Sales Reasons for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8035f66a-7f74-48ca-a782-e7cf978ce2c4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Order Header Sales Reasons for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8035f66a-7f74-48ca-a782-e7cf978ce2c4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Persons */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ed13e71b-96c7-41de-a1ec-a78ae53a807c',
         'Sales Persons',
         NULL,
         NULL,
         'SalesPerson',
         'vwSalesPersons',
         'Sales',
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
   

/* SQL generated to add new entity Sales Persons to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'ed13e71b-96c7-41de-a1ec-a78ae53a807c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Persons for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed13e71b-96c7-41de-a1ec-a78ae53a807c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Persons for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed13e71b-96c7-41de-a1ec-a78ae53a807c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Persons for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ed13e71b-96c7-41de-a1ec-a78ae53a807c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Illustrations */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ff1dc98c-e7e8-4e88-a131-0614dbeb1ad1',
         'Illustrations',
         NULL,
         NULL,
         'Illustration',
         'vwIllustrations',
         'Production',
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
   

/* SQL generated to add new entity Illustrations to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'ff1dc98c-e7e8-4e88-a131-0614dbeb1ad1', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Illustrations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ff1dc98c-e7e8-4e88-a131-0614dbeb1ad1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Illustrations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ff1dc98c-e7e8-4e88-a131-0614dbeb1ad1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Illustrations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ff1dc98c-e7e8-4e88-a131-0614dbeb1ad1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Job Candidates */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '60ad8392-0551-4f94-ae72-e12b4a97c33a',
         'Job Candidates',
         NULL,
         NULL,
         'JobCandidate',
         'vwJobCandidates',
         'HumanResources',
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
   

/* SQL generated to add new entity Job Candidates to application ID: 'FC136A08-66FB-4294-BDE5-458580020822' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('FC136A08-66FB-4294-BDE5-458580020822', '60ad8392-0551-4f94-ae72-e12b4a97c33a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'FC136A08-66FB-4294-BDE5-458580020822'))

/* SQL generated to add new permission for entity Job Candidates for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('60ad8392-0551-4f94-ae72-e12b4a97c33a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Job Candidates for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('60ad8392-0551-4f94-ae72-e12b4a97c33a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Job Candidates for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('60ad8392-0551-4f94-ae72-e12b4a97c33a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Locations */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'f0ff47e3-c6c4-485f-9c2e-4f254baec242',
         'Locations',
         NULL,
         NULL,
         'Location',
         'vwLocations',
         'Production',
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
   

/* SQL generated to add new entity Locations to application ID: 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF', 'f0ff47e3-c6c4-485f-9c2e-4f254baec242', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'B4F7DA6C-D746-4613-84A5-7D6FBCD12DFF'))

/* SQL generated to add new permission for entity Locations for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f0ff47e3-c6c4-485f-9c2e-4f254baec242', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Locations for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f0ff47e3-c6c4-485f-9c2e-4f254baec242', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Locations for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f0ff47e3-c6c4-485f-9c2e-4f254baec242', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Passwords */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'ae217382-15a8-4779-b57a-18f47305de5e',
         'Passwords',
         NULL,
         NULL,
         'Password',
         'vwPasswords',
         'Person',
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
   

/* SQL generated to add new entity Passwords to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', 'ae217382-15a8-4779-b57a-18f47305de5e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Passwords for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae217382-15a8-4779-b57a-18f47305de5e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Passwords for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae217382-15a8-4779-b57a-18f47305de5e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Passwords for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ae217382-15a8-4779-b57a-18f47305de5e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Person Quota Histories */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'fcb1d332-5a5c-4dcd-9754-2a0e408110ae',
         'Sales Person Quota Histories',
         NULL,
         NULL,
         'SalesPersonQuotaHistory',
         'vwSalesPersonQuotaHistories',
         'Sales',
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
   

/* SQL generated to add new entity Sales Person Quota Histories to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', 'fcb1d332-5a5c-4dcd-9754-2a0e408110ae', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Person Quota Histories for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fcb1d332-5a5c-4dcd-9754-2a0e408110ae', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Person Quota Histories for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fcb1d332-5a5c-4dcd-9754-2a0e408110ae', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Person Quota Histories for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fcb1d332-5a5c-4dcd-9754-2a0e408110ae', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Persons */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         'aeed9687-41a4-4535-867c-c86401a9a7a1',
         'Persons',
         NULL,
         NULL,
         'Person',
         'vwPersons',
         'Person',
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
   

/* SQL generated to add new entity Persons to application ID: '3732D087-D645-40E9-AF0F-67ABAADDE2BA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('3732D087-D645-40E9-AF0F-67ABAADDE2BA', 'aeed9687-41a4-4535-867c-c86401a9a7a1', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '3732D087-D645-40E9-AF0F-67ABAADDE2BA'))

/* SQL generated to add new permission for entity Persons for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('aeed9687-41a4-4535-867c-c86401a9a7a1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Persons for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('aeed9687-41a4-4535-867c-c86401a9a7a1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Persons for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('aeed9687-41a4-4535-867c-c86401a9a7a1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Sales Reasons */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
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
         '710d03d4-3aa4-459a-8d2d-808db0fd173c',
         'Sales Reasons',
         NULL,
         NULL,
         'SalesReason',
         'vwSalesReasons',
         'Sales',
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
   

/* SQL generated to add new entity Sales Reasons to application ID: '91C5C35C-A491-4EC1-89BD-6550EF49C030' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                    (ApplicationID, EntityID, Sequence) VALUES
                                    ('91C5C35C-A491-4EC1-89BD-6550EF49C030', '710d03d4-3aa4-459a-8d2d-808db0fd173c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '91C5C35C-A491-4EC1-89BD-6550EF49C030'))

/* SQL generated to add new permission for entity Sales Reasons for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('710d03d4-3aa4-459a-8d2d-808db0fd173c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Sales Reasons for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('710d03d4-3aa4-459a-8d2d-808db0fd173c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Sales Reasons for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('710d03d4-3aa4-459a-8d2d-808db0fd173c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SpecialOfferProduct */
ALTER TABLE [Sales].[SpecialOfferProduct] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SpecialOfferProduct */
ALTER TABLE [Sales].[SpecialOfferProduct] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.PersonCreditCard */
ALTER TABLE [Sales].[PersonCreditCard] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.PersonCreditCard */
ALTER TABLE [Sales].[PersonCreditCard] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.TransactionHistoryArchive */
ALTER TABLE [Production].[TransactionHistoryArchive] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.TransactionHistoryArchive */
ALTER TABLE [Production].[TransactionHistoryArchive] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.Store */
ALTER TABLE [Sales].[Store] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.Store */
ALTER TABLE [Sales].[Store] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Purchasing.ProductVendor */
ALTER TABLE [Purchasing].[ProductVendor] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Purchasing.ProductVendor */
ALTER TABLE [Purchasing].[ProductVendor] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.Illustration */
ALTER TABLE [Production].[Illustration] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.Illustration */
ALTER TABLE [Production].[Illustration] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity HumanResources.Employee */
ALTER TABLE [HumanResources].[Employee] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity HumanResources.Employee */
ALTER TABLE [HumanResources].[Employee] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.BillOfMaterials */
ALTER TABLE [Production].[BillOfMaterials] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.BillOfMaterials */
ALTER TABLE [Production].[BillOfMaterials] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.BusinessEntityAddress */
ALTER TABLE [Person].[BusinessEntityAddress] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.BusinessEntityAddress */
ALTER TABLE [Person].[BusinessEntityAddress] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.BusinessEntityContact */
ALTER TABLE [Person].[BusinessEntityContact] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.BusinessEntityContact */
ALTER TABLE [Person].[BusinessEntityContact] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductModelIllustration */
ALTER TABLE [Production].[ProductModelIllustration] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductModelIllustration */
ALTER TABLE [Production].[ProductModelIllustration] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.Product */
ALTER TABLE [Production].[Product] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.Product */
ALTER TABLE [Production].[Product] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.Password */
ALTER TABLE [Person].[Password] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.Password */
ALTER TABLE [Person].[Password] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductSubcategory */
ALTER TABLE [Production].[ProductSubcategory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductSubcategory */
ALTER TABLE [Production].[ProductSubcategory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.EmailAddress */
ALTER TABLE [Person].[EmailAddress] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.EmailAddress */
ALTER TABLE [Person].[EmailAddress] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SpecialOffer */
ALTER TABLE [Sales].[SpecialOffer] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SpecialOffer */
ALTER TABLE [Sales].[SpecialOffer] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductDescription */
ALTER TABLE [Production].[ProductDescription] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductDescription */
ALTER TABLE [Production].[ProductDescription] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.ShoppingCartItem */
ALTER TABLE [Sales].[ShoppingCartItem] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.ShoppingCartItem */
ALTER TABLE [Sales].[ShoppingCartItem] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesPersonQuotaHistory */
ALTER TABLE [Sales].[SalesPersonQuotaHistory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesPersonQuotaHistory */
ALTER TABLE [Sales].[SalesPersonQuotaHistory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.PersonPhone */
ALTER TABLE [Person].[PersonPhone] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.PersonPhone */
ALTER TABLE [Person].[PersonPhone] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesTerritoryHistory */
ALTER TABLE [Sales].[SalesTerritoryHistory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesTerritoryHistory */
ALTER TABLE [Sales].[SalesTerritoryHistory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductCategory */
ALTER TABLE [Production].[ProductCategory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductCategory */
ALTER TABLE [Production].[ProductCategory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Purchasing.Vendor */
ALTER TABLE [Purchasing].[Vendor] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Purchasing.Vendor */
ALTER TABLE [Purchasing].[Vendor] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity HumanResources.EmployeeDepartmentHistory */
ALTER TABLE [HumanResources].[EmployeeDepartmentHistory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity HumanResources.EmployeeDepartmentHistory */
ALTER TABLE [HumanResources].[EmployeeDepartmentHistory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.Customer */
ALTER TABLE [Sales].[Customer] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.Customer */
ALTER TABLE [Sales].[Customer] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity HumanResources.Shift */
ALTER TABLE [HumanResources].[Shift] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity HumanResources.Shift */
ALTER TABLE [HumanResources].[Shift] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.Location */
ALTER TABLE [Production].[Location] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.Location */
ALTER TABLE [Production].[Location] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Purchasing.PurchaseOrderHeader */
ALTER TABLE [Purchasing].[PurchaseOrderHeader] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Purchasing.PurchaseOrderHeader */
ALTER TABLE [Purchasing].[PurchaseOrderHeader] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesOrderDetail */
ALTER TABLE [Sales].[SalesOrderDetail] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesOrderDetail */
ALTER TABLE [Sales].[SalesOrderDetail] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity dbo.DatabaseLog */
ALTER TABLE [dbo].[DatabaseLog] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity dbo.DatabaseLog */
ALTER TABLE [dbo].[DatabaseLog] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Purchasing.ShipMethod */
ALTER TABLE [Purchasing].[ShipMethod] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Purchasing.ShipMethod */
ALTER TABLE [Purchasing].[ShipMethod] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.WorkOrderRouting */
ALTER TABLE [Production].[WorkOrderRouting] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.WorkOrderRouting */
ALTER TABLE [Production].[WorkOrderRouting] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.flyway_schema_history */
ALTER TABLE [${flyway:defaultSchema}].[flyway_schema_history] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.flyway_schema_history */
ALTER TABLE [${flyway:defaultSchema}].[flyway_schema_history] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.StateProvince */
ALTER TABLE [Person].[StateProvince] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.StateProvince */
ALTER TABLE [Person].[StateProvince] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.AddressType */
ALTER TABLE [Person].[AddressType] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.AddressType */
ALTER TABLE [Person].[AddressType] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ScrapReason */
ALTER TABLE [Production].[ScrapReason] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ScrapReason */
ALTER TABLE [Production].[ScrapReason] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesTaxRate */
ALTER TABLE [Sales].[SalesTaxRate] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesTaxRate */
ALTER TABLE [Sales].[SalesTaxRate] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesReason */
ALTER TABLE [Sales].[SalesReason] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesReason */
ALTER TABLE [Sales].[SalesReason] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity dbo.AWBuildVersion */
ALTER TABLE [dbo].[AWBuildVersion] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity dbo.AWBuildVersion */
ALTER TABLE [dbo].[AWBuildVersion] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.CountryRegion */
ALTER TABLE [Person].[CountryRegion] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.CountryRegion */
ALTER TABLE [Person].[CountryRegion] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.Currency */
ALTER TABLE [Sales].[Currency] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.Currency */
ALTER TABLE [Sales].[Currency] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.CreditCard */
ALTER TABLE [Sales].[CreditCard] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.CreditCard */
ALTER TABLE [Sales].[CreditCard] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity HumanResources.Department */
ALTER TABLE [HumanResources].[Department] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity HumanResources.Department */
ALTER TABLE [HumanResources].[Department] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductPhoto */
ALTER TABLE [Production].[ProductPhoto] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductPhoto */
ALTER TABLE [Production].[ProductPhoto] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.Culture */
ALTER TABLE [Production].[Culture] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.Culture */
ALTER TABLE [Production].[Culture] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesPerson */
ALTER TABLE [Sales].[SalesPerson] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesPerson */
ALTER TABLE [Sales].[SalesPerson] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity HumanResources.EmployeePayHistory */
ALTER TABLE [HumanResources].[EmployeePayHistory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity HumanResources.EmployeePayHistory */
ALTER TABLE [HumanResources].[EmployeePayHistory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductModelProductDescriptionCulture */
ALTER TABLE [Production].[ProductModelProductDescriptionCulture] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductModelProductDescriptionCulture */
ALTER TABLE [Production].[ProductModelProductDescriptionCulture] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.CountryRegionCurrency */
ALTER TABLE [Sales].[CountryRegionCurrency] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.CountryRegionCurrency */
ALTER TABLE [Sales].[CountryRegionCurrency] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Purchasing.PurchaseOrderDetail */
ALTER TABLE [Purchasing].[PurchaseOrderDetail] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Purchasing.PurchaseOrderDetail */
ALTER TABLE [Purchasing].[PurchaseOrderDetail] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductCostHistory */
ALTER TABLE [Production].[ProductCostHistory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductCostHistory */
ALTER TABLE [Production].[ProductCostHistory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.Address */
ALTER TABLE [Person].[Address] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.Address */
ALTER TABLE [Person].[Address] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductProductPhoto */
ALTER TABLE [Production].[ProductProductPhoto] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductProductPhoto */
ALTER TABLE [Production].[ProductProductPhoto] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesTerritory */
ALTER TABLE [Sales].[SalesTerritory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesTerritory */
ALTER TABLE [Sales].[SalesTerritory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductModel */
ALTER TABLE [Production].[ProductModel] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductModel */
ALTER TABLE [Production].[ProductModel] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.WorkOrder */
ALTER TABLE [Production].[WorkOrder] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.WorkOrder */
ALTER TABLE [Production].[WorkOrder] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.CurrencyRate */
ALTER TABLE [Sales].[CurrencyRate] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.CurrencyRate */
ALTER TABLE [Sales].[CurrencyRate] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.Person */
ALTER TABLE [Person].[Person] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.Person */
ALTER TABLE [Person].[Person] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductListPriceHistory */
ALTER TABLE [Production].[ProductListPriceHistory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductListPriceHistory */
ALTER TABLE [Production].[ProductListPriceHistory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.PhoneNumberType */
ALTER TABLE [Person].[PhoneNumberType] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.PhoneNumberType */
ALTER TABLE [Person].[PhoneNumberType] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductDocument */
ALTER TABLE [Production].[ProductDocument] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductDocument */
ALTER TABLE [Production].[ProductDocument] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.BusinessEntity */
ALTER TABLE [Person].[BusinessEntity] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.BusinessEntity */
ALTER TABLE [Person].[BusinessEntity] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductReview */
ALTER TABLE [Production].[ProductReview] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductReview */
ALTER TABLE [Production].[ProductReview] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Person.ContactType */
ALTER TABLE [Person].[ContactType] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Person.ContactType */
ALTER TABLE [Person].[ContactType] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.AIAgentLearningCycle */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentLearningCycle] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentLearningCycle */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentLearningCycle] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity HumanResources.JobCandidate */
ALTER TABLE [HumanResources].[JobCandidate] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity HumanResources.JobCandidate */
ALTER TABLE [HumanResources].[JobCandidate] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.ProductInventory */
ALTER TABLE [Production].[ProductInventory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.ProductInventory */
ALTER TABLE [Production].[ProductInventory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesOrderHeaderSalesReason */
ALTER TABLE [Sales].[SalesOrderHeaderSalesReason] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesOrderHeaderSalesReason */
ALTER TABLE [Sales].[SalesOrderHeaderSalesReason] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.TransactionHistory */
ALTER TABLE [Production].[TransactionHistory] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.TransactionHistory */
ALTER TABLE [Production].[TransactionHistory] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.UnitMeasure */
ALTER TABLE [Production].[UnitMeasure] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.UnitMeasure */
ALTER TABLE [Production].[UnitMeasure] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Production.Document */
ALTER TABLE [Production].[Document] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Production.Document */
ALTER TABLE [Production].[Document] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity Sales.SalesOrderHeader */
ALTER TABLE [Sales].[SalesOrderHeader] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity Sales.SalesOrderHeader */
ALTER TABLE [Sales].[SalesOrderHeader] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity dbo.ErrorLog */
ALTER TABLE [dbo].[ErrorLog] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity dbo.ErrorLog */
ALTER TABLE [dbo].[ErrorLog] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to insert new entity field */

      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         '9caedded-b0f0-4122-bf85-a8b6df02b474',
         '2E9D2D3E-09F1-460B-9438-00A7DEECDA17',
         1,
         'SpecialOfferID',
         'Special Offer ID',
         'Primary key for SpecialOfferProduct records.',
         'int',
         4,
         10,
         0,
         0,
         'null',
         0,
         0,
         0,
         '14CFDC86-168E-4FC0-9412-218EC12723C3',
         'SpecialOfferID',
         0,
         0,
         1,
         1,
         1,
         1,
         'Search'
      )

/* SQL text to insert new entity field */

      INSERT INTO [${flyway:defaultSchema}].EntityField
      (
         ID,
         EntityID,
         Sequence,
         Name,
         DisplayName,
         Description,
         Type,
         Length,
         Precision,
         Scale,
         AllowsNull,
         DefaultValue,
         AutoIncrement,
         AllowUpdateAPI,
         IsVirtual,
         RelatedEntityID,
         RelatedEntityFieldName,
         IsNameField,
         IncludeInUserSearchAPI,
         IncludeRelatedEntityNameFieldInBaseView,
         DefaultInView,
         IsPrimaryKey,
         IsUnique,
         RelatedEntityDisplayType
      )
      VALUES
      (
         'd69d8ff0-d068-4027-9742-067564c642af',
         '2E9D2D3E-09F1-460B-9438-00A7DEECDA17',
         1,
         'SpecialOfferID',
         'Special Offer ID',
         'Clustered index created by a primary key constraint.',
         'int',
         4,
         10,
         0,
         0,
         'null',
         0,
         0,
         0,
         '14CFDC86-168E-4FC0-9412-218EC12723C3',
         'SpecialOfferID',
         0,
         0,
         1,
         1,
         1,
         1,
         'Search'
      )

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to create Entitiy Relationships */
INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('76d23162-db86-4f5d-87ae-86e22f67e30f', '14CFDC86-168E-4FC0-9412-218EC12723C3', '2E9D2D3E-09F1-460B-9438-00A7DEECDA17', 'SpecialOfferID', 'One To Many', 1, 1, 'Special Offer Products', 1);
                              

/* SQL text to update entity field related entity name field map for entity field ID C819260C-B9D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C819260C-B9D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID CC19260C-B9D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CC19260C-B9D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID CD19260C-B9D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CD19260C-B9D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID B4CC991A-B9D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B4CC991A-B9D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID B5CC991A-B9D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B5CC991A-B9D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID EC2DFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EC2DFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID F52DFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F52DFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID FC2DFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FC2DFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID F62DFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F62DFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID F72DFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F72DFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 112EFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='112EFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 232EFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='232EFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 262EFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='262EFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 272EFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='272EFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 282EFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='282EFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 2F2EFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2F2EFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 352EFDD5-B8D2-EF11-B008-286B35C04424 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='352EFDD5-B8D2-EF11-B008-286B35C04424',
         @RelatedEntityNameFieldMap='Item'

