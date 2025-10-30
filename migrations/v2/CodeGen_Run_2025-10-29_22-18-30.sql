/* SQL generated to create new entity Industries */

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
         '9f46fd13-6018-4214-bc98-35b8b1eb6ddc',
         'Industries',
         NULL,
         NULL,
         NULL,
         'Industry',
         'vwIndustries',
         'CRM',
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
   

/* SQL generated to create new application CRM */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description, SchemaAutoAddNewEntities) VALUES ('27f3136c-dbeb-4698-bdef-49d4c17eb042', 'CRM', 'Generated for schema', 'CRM')

/* SQL generated to add new entity Industries to application ID: '27f3136c-dbeb-4698-bdef-49d4c17eb042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27f3136c-dbeb-4698-bdef-49d4c17eb042', '9f46fd13-6018-4214-bc98-35b8b1eb6ddc', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27f3136c-dbeb-4698-bdef-49d4c17eb042'))

/* SQL generated to add new permission for entity Industries for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9f46fd13-6018-4214-bc98-35b8b1eb6ddc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Industries for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9f46fd13-6018-4214-bc98-35b8b1eb6ddc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Industries for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9f46fd13-6018-4214-bc98-35b8b1eb6ddc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Account Types */

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
         'c030c99d-0995-4c08-9f67-eb8f8d3dc48f',
         'Account Types',
         NULL,
         NULL,
         NULL,
         'AccountType',
         'vwAccountTypes',
         'CRM',
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
   

/* SQL generated to add new entity Account Types to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', 'c030c99d-0995-4c08-9f67-eb8f8d3dc48f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Account Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c030c99d-0995-4c08-9f67-eb8f8d3dc48f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Account Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c030c99d-0995-4c08-9f67-eb8f8d3dc48f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Account Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c030c99d-0995-4c08-9f67-eb8f8d3dc48f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Account Status */

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
         '5fa28b6c-f28d-427c-a72e-34503562a00e',
         'Account Status',
         NULL,
         NULL,
         NULL,
         'AccountStatus',
         'vwAccountStatus',
         'CRM',
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
   

/* SQL generated to add new entity Account Status to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '5fa28b6c-f28d-427c-a72e-34503562a00e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Account Status for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5fa28b6c-f28d-427c-a72e-34503562a00e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Account Status for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5fa28b6c-f28d-427c-a72e-34503562a00e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Account Status for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5fa28b6c-f28d-427c-a72e-34503562a00e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activity Types */

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
         'ba3decf6-b6a0-441f-9cea-8a5861ac961c',
         'Activity Types',
         NULL,
         NULL,
         NULL,
         'ActivityType',
         'vwActivityTypes',
         'CRM',
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
   

/* SQL generated to add new entity Activity Types to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', 'ba3decf6-b6a0-441f-9cea-8a5861ac961c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Activity Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba3decf6-b6a0-441f-9cea-8a5861ac961c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba3decf6-b6a0-441f-9cea-8a5861ac961c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('ba3decf6-b6a0-441f-9cea-8a5861ac961c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Relationship Types */

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
         '8cc17f62-138b-48e4-8167-d2681d5f65ac',
         'Relationship Types',
         NULL,
         NULL,
         NULL,
         'RelationshipType',
         'vwRelationshipTypes',
         'CRM',
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
   

/* SQL generated to add new entity Relationship Types to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '8cc17f62-138b-48e4-8167-d2681d5f65ac', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Relationship Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8cc17f62-138b-48e4-8167-d2681d5f65ac', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Relationship Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8cc17f62-138b-48e4-8167-d2681d5f65ac', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Relationship Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8cc17f62-138b-48e4-8167-d2681d5f65ac', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contact Relationships */

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
         '87f25037-7fe9-468d-851e-94f7fd187e8c',
         'Contact Relationships',
         NULL,
         NULL,
         NULL,
         'ContactRelationship',
         'vwContactRelationships',
         'CRM',
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
   

/* SQL generated to add new entity Contact Relationships to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '87f25037-7fe9-468d-851e-94f7fd187e8c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Contact Relationships for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('87f25037-7fe9-468d-851e-94f7fd187e8c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contact Relationships for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('87f25037-7fe9-468d-851e-94f7fd187e8c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contact Relationships for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('87f25037-7fe9-468d-851e-94f7fd187e8c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'c32fa2fa-d2e4-4685-9afd-f640630e8626',
         'Products',
         NULL,
         NULL,
         NULL,
         'Product',
         'vwProducts',
         'CRM',
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
   

/* SQL generated to add new entity Products to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', 'c32fa2fa-d2e4-4685-9afd-f640630e8626', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Products for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c32fa2fa-d2e4-4685-9afd-f640630e8626', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Products for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c32fa2fa-d2e4-4685-9afd-f640630e8626', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Products for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c32fa2fa-d2e4-4685-9afd-f640630e8626', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Deals */

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
         '9c3e5e87-fea1-4f4c-96f1-b1d2f0e6911b',
         'Deals',
         NULL,
         NULL,
         NULL,
         'Deal',
         'vwDeals',
         'CRM',
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
   

/* SQL generated to add new entity Deals to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '9c3e5e87-fea1-4f4c-96f1-b1d2f0e6911b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Deals for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9c3e5e87-fea1-4f4c-96f1-b1d2f0e6911b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Deals for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9c3e5e87-fea1-4f4c-96f1-b1d2f0e6911b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Deals for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9c3e5e87-fea1-4f4c-96f1-b1d2f0e6911b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Deal Products */

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
         'f2bd75b7-187a-4f2a-8da7-6331c774caf9',
         'Deal Products',
         NULL,
         NULL,
         NULL,
         'DealProduct',
         'vwDealProducts',
         'CRM',
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
   

/* SQL generated to add new entity Deal Products to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', 'f2bd75b7-187a-4f2a-8da7-6331c774caf9', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Deal Products for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2bd75b7-187a-4f2a-8da7-6331c774caf9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Deal Products for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2bd75b7-187a-4f2a-8da7-6331c774caf9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Deal Products for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f2bd75b7-187a-4f2a-8da7-6331c774caf9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Invoices */

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
         '8f49f6cb-f89b-4b58-90fd-78cf64cea367',
         'Invoices',
         NULL,
         NULL,
         NULL,
         'Invoice',
         'vwInvoices',
         'CRM',
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
   

/* SQL generated to add new entity Invoices to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '8f49f6cb-f89b-4b58-90fd-78cf64cea367', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Invoices for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8f49f6cb-f89b-4b58-90fd-78cf64cea367', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Invoices for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8f49f6cb-f89b-4b58-90fd-78cf64cea367', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Invoices for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('8f49f6cb-f89b-4b58-90fd-78cf64cea367', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Invoice Line Items */

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
         '805a851b-17dc-47bd-9097-e68e4061537b',
         'Invoice Line Items',
         NULL,
         NULL,
         NULL,
         'InvoiceLineItem',
         'vwInvoiceLineItems',
         'CRM',
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
   

/* SQL generated to add new entity Invoice Line Items to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '805a851b-17dc-47bd-9097-e68e4061537b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Invoice Line Items for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('805a851b-17dc-47bd-9097-e68e4061537b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Invoice Line Items for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('805a851b-17dc-47bd-9097-e68e4061537b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Invoice Line Items for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('805a851b-17dc-47bd-9097-e68e4061537b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Payments */

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
         'c5eb9416-0f8a-465c-abb0-70fbb05393af',
         'Payments',
         NULL,
         NULL,
         NULL,
         'Payment',
         'vwPayments',
         'CRM',
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
   

/* SQL generated to add new entity Payments to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', 'c5eb9416-0f8a-465c-abb0-70fbb05393af', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Payments for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c5eb9416-0f8a-465c-abb0-70fbb05393af', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Payments for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c5eb9416-0f8a-465c-abb0-70fbb05393af', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Payments for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c5eb9416-0f8a-465c-abb0-70fbb05393af', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Events */

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
         'a0183d9a-b171-4e72-826d-7f86248795f9',
         'Events',
         NULL,
         NULL,
         NULL,
         'Event',
         'vwEvents',
         'Events',
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
   

/* SQL generated to create new application Events */
INSERT INTO [${flyway:defaultSchema}].Application (ID, Name, Description, SchemaAutoAddNewEntities) VALUES ('a9305e1a-556d-45a0-9289-403dfddc59b5', 'Events', 'Generated for schema', 'Events')

/* SQL generated to add new entity Events to application ID: 'a9305e1a-556d-45a0-9289-403dfddc59b5' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('a9305e1a-556d-45a0-9289-403dfddc59b5', 'a0183d9a-b171-4e72-826d-7f86248795f9', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'a9305e1a-556d-45a0-9289-403dfddc59b5'))

/* SQL generated to add new permission for entity Events for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a0183d9a-b171-4e72-826d-7f86248795f9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Events for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a0183d9a-b171-4e72-826d-7f86248795f9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Events for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a0183d9a-b171-4e72-826d-7f86248795f9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Speakers */

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
         '0adaff68-56f9-41da-9572-7e165c682ea7',
         'Speakers',
         NULL,
         NULL,
         NULL,
         'Speaker',
         'vwSpeakers',
         'Events',
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
   

/* SQL generated to add new entity Speakers to application ID: 'A9305E1A-556D-45A0-9289-403DFDDC59B5' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('A9305E1A-556D-45A0-9289-403DFDDC59B5', '0adaff68-56f9-41da-9572-7e165c682ea7', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'A9305E1A-556D-45A0-9289-403DFDDC59B5'))

/* SQL generated to add new permission for entity Speakers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0adaff68-56f9-41da-9572-7e165c682ea7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Speakers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0adaff68-56f9-41da-9572-7e165c682ea7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Speakers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0adaff68-56f9-41da-9572-7e165c682ea7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Submissions */

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
         'bc59e925-cc3f-41ce-befa-df3b879dd982',
         'Submissions',
         NULL,
         NULL,
         NULL,
         'Submission',
         'vwSubmissions',
         'Events',
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
   

/* SQL generated to add new entity Submissions to application ID: 'A9305E1A-556D-45A0-9289-403DFDDC59B5' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('A9305E1A-556D-45A0-9289-403DFDDC59B5', 'bc59e925-cc3f-41ce-befa-df3b879dd982', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'A9305E1A-556D-45A0-9289-403DFDDC59B5'))

/* SQL generated to add new permission for entity Submissions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bc59e925-cc3f-41ce-befa-df3b879dd982', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Submissions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bc59e925-cc3f-41ce-befa-df3b879dd982', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Submissions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bc59e925-cc3f-41ce-befa-df3b879dd982', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Submission Speakers */

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
         'd15b9246-2192-4ca9-8057-708e997af565',
         'Submission Speakers',
         NULL,
         NULL,
         NULL,
         'SubmissionSpeaker',
         'vwSubmissionSpeakers',
         'Events',
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
   

/* SQL generated to add new entity Submission Speakers to application ID: 'A9305E1A-556D-45A0-9289-403DFDDC59B5' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('A9305E1A-556D-45A0-9289-403DFDDC59B5', 'd15b9246-2192-4ca9-8057-708e997af565', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'A9305E1A-556D-45A0-9289-403DFDDC59B5'))

/* SQL generated to add new permission for entity Submission Speakers for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d15b9246-2192-4ca9-8057-708e997af565', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Submission Speakers for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d15b9246-2192-4ca9-8057-708e997af565', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Submission Speakers for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('d15b9246-2192-4ca9-8057-708e997af565', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Submission Reviews */

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
         'cf6c33be-3726-4cb3-8562-1e768e7ea249',
         'Submission Reviews',
         NULL,
         NULL,
         NULL,
         'SubmissionReview',
         'vwSubmissionReviews',
         'Events',
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
   

/* SQL generated to add new entity Submission Reviews to application ID: 'A9305E1A-556D-45A0-9289-403DFDDC59B5' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('A9305E1A-556D-45A0-9289-403DFDDC59B5', 'cf6c33be-3726-4cb3-8562-1e768e7ea249', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'A9305E1A-556D-45A0-9289-403DFDDC59B5'))

/* SQL generated to add new permission for entity Submission Reviews for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cf6c33be-3726-4cb3-8562-1e768e7ea249', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Submission Reviews for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cf6c33be-3726-4cb3-8562-1e768e7ea249', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Submission Reviews for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('cf6c33be-3726-4cb3-8562-1e768e7ea249', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Accounts */

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
         '4785f9cd-21a7-4250-be9a-91b3f6e55dff',
         'Accounts',
         NULL,
         NULL,
         NULL,
         'Account',
         'vwAccounts',
         'CRM',
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
   

/* SQL generated to add new entity Accounts to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '4785f9cd-21a7-4250-be9a-91b3f6e55dff', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Accounts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4785f9cd-21a7-4250-be9a-91b3f6e55dff', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Accounts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4785f9cd-21a7-4250-be9a-91b3f6e55dff', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Accounts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4785f9cd-21a7-4250-be9a-91b3f6e55dff', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contacts */

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
         '150a943c-7323-4b22-b609-3f852db5f784',
         'Contacts',
         NULL,
         NULL,
         NULL,
         'Contact',
         'vwContacts',
         'CRM',
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
   

/* SQL generated to add new entity Contacts to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '150a943c-7323-4b22-b609-3f852db5f784', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Contacts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('150a943c-7323-4b22-b609-3f852db5f784', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contacts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('150a943c-7323-4b22-b609-3f852db5f784', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contacts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('150a943c-7323-4b22-b609-3f852db5f784', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Submission Notifications */

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
         '78188c48-2e2c-4674-ab78-d6639350c388',
         'Submission Notifications',
         NULL,
         NULL,
         NULL,
         'SubmissionNotification',
         'vwSubmissionNotifications',
         'Events',
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
   

/* SQL generated to add new entity Submission Notifications to application ID: 'A9305E1A-556D-45A0-9289-403DFDDC59B5' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('A9305E1A-556D-45A0-9289-403DFDDC59B5', '78188c48-2e2c-4674-ab78-d6639350c388', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'A9305E1A-556D-45A0-9289-403DFDDC59B5'))

/* SQL generated to add new permission for entity Submission Notifications for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('78188c48-2e2c-4674-ab78-d6639350c388', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Submission Notifications for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('78188c48-2e2c-4674-ab78-d6639350c388', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Submission Notifications for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('78188c48-2e2c-4674-ab78-d6639350c388', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activities */

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
         '1af94bae-5a2d-4756-be56-988d263f070e',
         'Activities',
         NULL,
         NULL,
         NULL,
         'Activity',
         'vwActivities',
         'CRM',
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
   

/* SQL generated to add new entity Activities to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', '1af94bae-5a2d-4756-be56-988d263f070e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Activities for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1af94bae-5a2d-4756-be56-988d263f070e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activities for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1af94bae-5a2d-4756-be56-988d263f070e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activities for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('1af94bae-5a2d-4756-be56-988d263f070e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Event Review Tasks */

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
         '85b84e83-35a2-4874-b2de-57195316f966',
         'Event Review Tasks',
         NULL,
         NULL,
         NULL,
         'EventReviewTask',
         'vwEventReviewTasks',
         'Events',
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
   

/* SQL generated to add new entity Event Review Tasks to application ID: 'A9305E1A-556D-45A0-9289-403DFDDC59B5' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('A9305E1A-556D-45A0-9289-403DFDDC59B5', '85b84e83-35a2-4874-b2de-57195316f966', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'A9305E1A-556D-45A0-9289-403DFDDC59B5'))

/* SQL generated to add new permission for entity Event Review Tasks for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('85b84e83-35a2-4874-b2de-57195316f966', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Event Review Tasks for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('85b84e83-35a2-4874-b2de-57195316f966', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Event Review Tasks for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('85b84e83-35a2-4874-b2de-57195316f966', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Account Insights */

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
         'a6a148b1-9084-41f8-b300-72a304341e40',
         'Account Insights',
         NULL,
         NULL,
         NULL,
         'AccountInsight',
         'vwAccountInsights',
         'CRM',
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
   

/* SQL generated to add new entity Account Insights to application ID: '27F3136C-DBEB-4698-BDEF-49D4C17EB042' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('27F3136C-DBEB-4698-BDEF-49D4C17EB042', 'a6a148b1-9084-41f8-b300-72a304341e40', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '27F3136C-DBEB-4698-BDEF-49D4C17EB042'))

/* SQL generated to add new permission for entity Account Insights for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a6a148b1-9084-41f8-b300-72a304341e40', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Account Insights for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a6a148b1-9084-41f8-b300-72a304341e40', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Account Insights for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('a6a148b1-9084-41f8-b300-72a304341e40', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity Events.SubmissionReview */
ALTER TABLE [Events].[SubmissionReview] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Events.SubmissionReview */
ALTER TABLE [Events].[SubmissionReview] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.AccountStatus */
ALTER TABLE [CRM].[AccountStatus] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.AccountStatus */
ALTER TABLE [CRM].[AccountStatus] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Industry */
ALTER TABLE [CRM].[Industry] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Industry */
ALTER TABLE [CRM].[Industry] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Contact */
ALTER TABLE [CRM].[Contact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Contact */
ALTER TABLE [CRM].[Contact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Events.EventReviewTask */
ALTER TABLE [Events].[EventReviewTask] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Events.EventReviewTask */
ALTER TABLE [Events].[EventReviewTask] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.DealProduct */
ALTER TABLE [CRM].[DealProduct] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.DealProduct */
ALTER TABLE [CRM].[DealProduct] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Events.SubmissionSpeaker */
ALTER TABLE [Events].[SubmissionSpeaker] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Events.SubmissionSpeaker */
ALTER TABLE [Events].[SubmissionSpeaker] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Payment */
ALTER TABLE [CRM].[Payment] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Payment */
ALTER TABLE [CRM].[Payment] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.AccountInsight */
ALTER TABLE [CRM].[AccountInsight] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.AccountInsight */
ALTER TABLE [CRM].[AccountInsight] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Invoice */
ALTER TABLE [CRM].[Invoice] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Invoice */
ALTER TABLE [CRM].[Invoice] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Events.Speaker */
ALTER TABLE [Events].[Speaker] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Events.Speaker */
ALTER TABLE [Events].[Speaker] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Events.Event */
ALTER TABLE [Events].[Event] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Events.Event */
ALTER TABLE [Events].[Event] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.ActivityType */
ALTER TABLE [CRM].[ActivityType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.ActivityType */
ALTER TABLE [CRM].[ActivityType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Account */
ALTER TABLE [CRM].[Account] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Account */
ALTER TABLE [CRM].[Account] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.ContactRelationship */
ALTER TABLE [CRM].[ContactRelationship] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.ContactRelationship */
ALTER TABLE [CRM].[ContactRelationship] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Activity */
ALTER TABLE [CRM].[Activity] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Activity */
ALTER TABLE [CRM].[Activity] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Deal */
ALTER TABLE [CRM].[Deal] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Deal */
ALTER TABLE [CRM].[Deal] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.RelationshipType */
ALTER TABLE [CRM].[RelationshipType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.RelationshipType */
ALTER TABLE [CRM].[RelationshipType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Events.SubmissionNotification */
ALTER TABLE [Events].[SubmissionNotification] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Events.SubmissionNotification */
ALTER TABLE [Events].[SubmissionNotification] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Events.Submission */
ALTER TABLE [Events].[Submission] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Events.Submission */
ALTER TABLE [Events].[Submission] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.InvoiceLineItem */
ALTER TABLE [CRM].[InvoiceLineItem] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.InvoiceLineItem */
ALTER TABLE [CRM].[InvoiceLineItem] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.AccountType */
ALTER TABLE [CRM].[AccountType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.AccountType */
ALTER TABLE [CRM].[AccountType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Product */
ALTER TABLE [CRM].[Product] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Product */
ALTER TABLE [CRM].[Product] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1798cd96-54bf-471f-9a25-ecf8c5ef82a4'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1798cd96-54bf-471f-9a25-ecf8c5ef82a4',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100001,
            'ID',
            'ID',
            'Unique identifier for the review',
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
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f90ed2e5-66a8-4117-8494-743a7604067c'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'SubmissionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f90ed2e5-66a8-4117-8494-743a7604067c',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100002,
            'SubmissionID',
            'Submission ID',
            'Submission being reviewed',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982',
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
         WHERE ID = 'd7c159eb-4a3f-4da1-8d6f-68ee2e505cb5'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'ReviewerContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd7c159eb-4a3f-4da1-8d6f-68ee2e505cb5',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100003,
            'ReviewerContactID',
            'Reviewer Contact ID',
            'CRM Contact ID of the reviewer',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = '1bdee44f-f185-4ac2-a655-b89044ade011'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'ReviewedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1bdee44f-f185-4ac2-a655-b89044ade011',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100004,
            'ReviewedAt',
            'Reviewed At',
            'Timestamp when review was submitted',
            'datetime',
            8,
            23,
            3,
            0,
            'getdate()',
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
         WHERE ID = '60f02b09-997a-43c5-a767-651fa974eb2b'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'OverallScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '60f02b09-997a-43c5-a767-651fa974eb2b',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100005,
            'OverallScore',
            'Overall Score',
            'Overall score from 0-10',
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
         WHERE ID = 'cb0dd3d9-52ba-4d3f-8e2d-68013ecc5962'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'RelevanceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cb0dd3d9-52ba-4d3f-8e2d-68013ecc5962',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100006,
            'RelevanceScore',
            'Relevance Score',
            'Relevance to conference theme score (0-10)',
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
         WHERE ID = '584a8f25-c408-46f5-ba3d-39f7e5c0c3dc'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'QualityScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '584a8f25-c408-46f5-ba3d-39f7e5c0c3dc',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100007,
            'QualityScore',
            'Quality Score',
            'Quality of abstract and proposed content score (0-10)',
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
         WHERE ID = '0066924e-566b-4386-a087-977a8863e99a'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'SpeakerExperienceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0066924e-566b-4386-a087-977a8863e99a',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100008,
            'SpeakerExperienceScore',
            'Speaker Experience Score',
            'Speaker experience and credibility score (0-10)',
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
         WHERE ID = '3de16578-8a1a-47d0-8bbb-7964d10b1a58'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'Comments')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3de16578-8a1a-47d0-8bbb-7964d10b1a58',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100009,
            'Comments',
            'Comments',
            'Reviewer comments and feedback',
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
         WHERE ID = '78c43520-498f-4af4-b980-690ce0ebcfe8'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = 'Recommendation')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '78c43520-498f-4af4-b980-690ce0ebcfe8',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
            100010,
            'Recommendation',
            'Recommendation',
            'Reviewer recommendation (Accept, Reject, Waitlist, Needs Discussion)',
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
         WHERE ID = 'c214f8ef-6c19-483d-b4a7-a5ba314d5860'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c214f8ef-6c19-483d-b4a7-a5ba314d5860',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
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
         WHERE ID = '35299858-2d8d-42ce-9597-56e3fdd0e79e'  OR 
               (EntityID = 'CF6C33BE-3726-4CB3-8562-1E768E7EA249' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '35299858-2d8d-42ce-9597-56e3fdd0e79e',
            'CF6C33BE-3726-4CB3-8562-1E768E7EA249', -- Entity: Submission Reviews
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '527467b6-e4d0-48fc-8045-bf6f08387f0f'  OR 
               (EntityID = '5FA28B6C-F28D-427C-A72E-34503562A00E' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '527467b6-e4d0-48fc-8045-bf6f08387f0f',
            '5FA28B6C-F28D-427C-A72E-34503562A00E', -- Entity: Account Status
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c2051022-986f-489a-85fe-e98384f88491'  OR 
               (EntityID = '5FA28B6C-F28D-427C-A72E-34503562A00E' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c2051022-986f-489a-85fe-e98384f88491',
            '5FA28B6C-F28D-427C-A72E-34503562A00E', -- Entity: Account Status
            100002,
            'Name',
            'Name',
            'Name of the account status',
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
         WHERE ID = '70c69118-f870-447b-921e-d958f5ebe7c1'  OR 
               (EntityID = '5FA28B6C-F28D-427C-A72E-34503562A00E' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '70c69118-f870-447b-921e-d958f5ebe7c1',
            '5FA28B6C-F28D-427C-A72E-34503562A00E', -- Entity: Account Status
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
         WHERE ID = '6a44ea94-2d14-47a8-8eaf-bbf3410e8fa1'  OR 
               (EntityID = '5FA28B6C-F28D-427C-A72E-34503562A00E' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6a44ea94-2d14-47a8-8eaf-bbf3410e8fa1',
            '5FA28B6C-F28D-427C-A72E-34503562A00E', -- Entity: Account Status
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
         WHERE ID = '8d14481f-f9b1-4127-8b9f-42d1f039af84'  OR 
               (EntityID = '9F46FD13-6018-4214-BC98-35B8B1EB6DDC' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8d14481f-f9b1-4127-8b9f-42d1f039af84',
            '9F46FD13-6018-4214-BC98-35B8B1EB6DDC', -- Entity: Industries
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4ec6b43d-f3cb-4f00-a816-e1a5ca28c527'  OR 
               (EntityID = '9F46FD13-6018-4214-BC98-35B8B1EB6DDC' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4ec6b43d-f3cb-4f00-a816-e1a5ca28c527',
            '9F46FD13-6018-4214-BC98-35B8B1EB6DDC', -- Entity: Industries
            100002,
            'Name',
            'Name',
            'Name of the industry',
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
         WHERE ID = '10f981e6-9a54-4a92-bee3-a143cdd7651c'  OR 
               (EntityID = '9F46FD13-6018-4214-BC98-35B8B1EB6DDC' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '10f981e6-9a54-4a92-bee3-a143cdd7651c',
            '9F46FD13-6018-4214-BC98-35B8B1EB6DDC', -- Entity: Industries
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
         WHERE ID = '03f6781c-a4b0-487e-b116-e06ba431a96f'  OR 
               (EntityID = '9F46FD13-6018-4214-BC98-35B8B1EB6DDC' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '03f6781c-a4b0-487e-b116-e06ba431a96f',
            '9F46FD13-6018-4214-BC98-35B8B1EB6DDC', -- Entity: Industries
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
         WHERE ID = '8508c35d-4d2e-40cc-98cd-27c4c5250742'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8508c35d-4d2e-40cc-98cd-27c4c5250742',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bf9299bb-5cac-4e59-87a1-0ee42618862f'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'AccountID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bf9299bb-5cac-4e59-87a1-0ee42618862f',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100002,
            'AccountID',
            'Account ID',
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
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF',
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
         WHERE ID = '813fdfd8-7e40-4fc7-8579-5292b6fc88fa'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'Salutation')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '813fdfd8-7e40-4fc7-8579-5292b6fc88fa',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100003,
            'Salutation',
            'Salutation',
            'Salutation or title prefix (Mr., Ms., Dr., etc.)',
            'nvarchar',
            20,
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
         WHERE ID = '26c57519-da92-4c46-9555-0b23cb4fd0c7'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'FirstName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '26c57519-da92-4c46-9555-0b23cb4fd0c7',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100004,
            'FirstName',
            'First Name',
            'First name of the contact',
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
         WHERE ID = 'df838988-eb71-46eb-8e37-531e7011824f'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'LastName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'df838988-eb71-46eb-8e37-531e7011824f',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100005,
            'LastName',
            'Last Name',
            'Last name of the contact',
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
         WHERE ID = '327312eb-060b-4e08-894e-5387cb717af5'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'FullName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '327312eb-060b-4e08-894e-5387cb717af5',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100006,
            'FullName',
            'Full Name',
            'Full name of the contact (computed column)',
            'nvarchar',
            202,
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
         WHERE ID = 'ec3b90e2-fc79-462c-8254-e9a9658e0e43'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ec3b90e2-fc79-462c-8254-e9a9658e0e43',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100007,
            'Title',
            'Title',
            'Job title of the contact',
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
         WHERE ID = '4841424f-335c-4921-b4ad-2d6772ef7124'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'Department')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4841424f-335c-4921-b4ad-2d6772ef7124',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100008,
            'Department',
            'Department',
            'Department the contact works in',
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
         WHERE ID = 'ec4bba9f-dd59-4c66-961c-451d8ebcedfe'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ec4bba9f-dd59-4c66-961c-451d8ebcedfe',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100009,
            'Email',
            'Email',
            'Email address of the contact',
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
         WHERE ID = '25ec93dc-f7a9-4f8e-8e80-b1787fce2486'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'Phone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '25ec93dc-f7a9-4f8e-8e80-b1787fce2486',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100010,
            'Phone',
            'Phone',
            'Primary work phone number of the contact',
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
         WHERE ID = '5ca3b3a6-41fd-4cff-be8d-0fd0604993b4'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'Mobile')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5ca3b3a6-41fd-4cff-be8d-0fd0604993b4',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100011,
            'Mobile',
            'Mobile',
            'Mobile phone number of the contact',
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
         WHERE ID = '46590b4a-2003-4410-9176-d8f807f32ec6'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'ReportsToID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '46590b4a-2003-4410-9176-d8f807f32ec6',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100012,
            'ReportsToID',
            'Reports To ID',
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
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = 'f43a2756-ddc5-4309-8262-253b2e1635d5'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'MailingStreet')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f43a2756-ddc5-4309-8262-253b2e1635d5',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100013,
            'MailingStreet',
            'Mailing Street',
            'Street address for mailing',
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
         WHERE ID = '77edcf17-0560-407b-b6d8-c72ec11060d3'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'MailingCity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '77edcf17-0560-407b-b6d8-c72ec11060d3',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100014,
            'MailingCity',
            'Mailing City',
            'City for mailing address',
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
         WHERE ID = '20d419d1-6ab3-4dbd-a9d4-83bc6fff1215'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'MailingState')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '20d419d1-6ab3-4dbd-a9d4-83bc6fff1215',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100015,
            'MailingState',
            'Mailing State',
            'State/province for mailing address',
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
         WHERE ID = 'e05296ac-59d1-43ff-9f80-e21113ba4dbf'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'MailingPostalCode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e05296ac-59d1-43ff-9f80-e21113ba4dbf',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100016,
            'MailingPostalCode',
            'Mailing Postal Code',
            'Postal/ZIP code for mailing address',
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
         WHERE ID = 'd2bb85ed-df57-4bbf-8ae6-77ac9bbdfb77'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'MailingCountry')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd2bb85ed-df57-4bbf-8ae6-77ac9bbdfb77',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100017,
            'MailingCountry',
            'Mailing Country',
            'Country for mailing address',
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
         WHERE ID = '63b95be4-1825-41a2-8fd8-f55d1151c18d'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'BirthDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '63b95be4-1825-41a2-8fd8-f55d1151c18d',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100018,
            'BirthDate',
            'Birth Date',
            'Birth date of the contact',
            'date',
            3,
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
         WHERE ID = '9283c808-2f35-4cda-af90-36114fdee48f'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'PreferredContactMethod')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9283c808-2f35-4cda-af90-36114fdee48f',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100019,
            'PreferredContactMethod',
            'Preferred Contact Method',
            'Preferred method of communication (Email, Phone, Mobile, etc.)',
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
         WHERE ID = '6db36645-ed06-4bac-9e6a-ed8f1d0e4ac6'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6db36645-ed06-4bac-9e6a-ed8f1d0e4ac6',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100020,
            'IsActive',
            'Is Active',
            'Indicates whether the contact is currently active',
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
         WHERE ID = '8542af94-0be8-44ef-b1bb-d00b1b4f08d7'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8542af94-0be8-44ef-b1bb-d00b1b4f08d7',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100021,
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
         WHERE ID = '9bb8223d-079b-483f-bac0-a1cfb3aa598e'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9bb8223d-079b-483f-bac0-a1cfb3aa598e',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100022,
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
         WHERE ID = '3088e9d0-4b6b-46ca-a407-6d6f4d6ce8cb'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3088e9d0-4b6b-46ca-a407-6d6f4d6ce8cb',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100001,
            'ID',
            'ID',
            'Unique identifier for the review task',
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
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c916e60e-9805-47f1-90d0-9ad00963b599'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'EventID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c916e60e-9805-47f1-90d0-9ad00963b599',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100002,
            'EventID',
            'Event ID',
            'Event this review task is for',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'A0183D9A-B171-4E72-826D-7F86248795F9',
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
         WHERE ID = 'b0b633d1-e95c-4a76-9ddd-a1c85596904e'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'SubmissionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b0b633d1-e95c-4a76-9ddd-a1c85596904e',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100003,
            'SubmissionID',
            'Submission ID',
            'Submission to be reviewed',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982',
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
         WHERE ID = '536e8939-0af6-4012-a07e-86aa99bd2235'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'AssignedToContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '536e8939-0af6-4012-a07e-86aa99bd2235',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100004,
            'AssignedToContactID',
            'Assigned To Contact ID',
            'CRM Contact ID of assigned reviewer (NULL if unassigned)',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = '08085ad8-acbb-4df5-a3d7-6a3fa7fae5ed'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '08085ad8-acbb-4df5-a3d7-6a3fa7fae5ed',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100005,
            'Status',
            'Status',
            'Current status of the review task (Pending, In Progress, Completed, Canceled)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pending',
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
         WHERE ID = 'd2cecd05-99f5-49cf-b460-375b20008921'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd2cecd05-99f5-49cf-b460-375b20008921',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100006,
            'Priority',
            'Priority',
            'Priority level (High, Normal, Low)',
            'nvarchar',
            40,
            0,
            0,
            1,
            'Normal',
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
         WHERE ID = 'adb8c005-b12c-46b4-b7e2-64f5b1f288d8'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'DueDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'adb8c005-b12c-46b4-b7e2-64f5b1f288d8',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100007,
            'DueDate',
            'Due Date',
            'Due date for completing the review',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = 'f7c1f4ed-8117-481c-9af1-e8fddfe7a5b1'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'CompletedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f7c1f4ed-8117-481c-9af1-e8fddfe7a5b1',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100008,
            'CompletedAt',
            'Completed At',
            'Timestamp when task was completed',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = '3599dd63-b448-40dd-83d1-f1eb6992aa6e'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3599dd63-b448-40dd-83d1-f1eb6992aa6e',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
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
         WHERE ID = '70ebfb0b-9bff-4e15-8c43-527f74b4e8ee'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '70ebfb0b-9bff-4e15-8c43-527f74b4e8ee',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
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
         WHERE ID = 'ede953af-4bf2-4764-895e-e099c20ad40c'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ede953af-4bf2-4764-895e-e099c20ad40c',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9a487d68-4f28-4786-9509-4f79a2f33169'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'DealID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9a487d68-4f28-4786-9509-4f79a2f33169',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100002,
            'DealID',
            'Deal ID',
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
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B',
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
         WHERE ID = '6d84d10e-cfe4-4391-b886-313865616220'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'ProductID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6d84d10e-cfe4-4391-b886-313865616220',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
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
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626',
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
         WHERE ID = '1aa21d79-116b-4ce3-a89b-ba384bddfd05'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'Quantity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1aa21d79-116b-4ce3-a89b-ba384bddfd05',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100004,
            'Quantity',
            'Quantity',
            'Number of units of the product included in the deal',
            'decimal',
            9,
            18,
            4,
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
         WHERE ID = 'cc131a2b-6189-4cc9-a0e5-61545f00e24c'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'UnitPrice')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cc131a2b-6189-4cc9-a0e5-61545f00e24c',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100005,
            'UnitPrice',
            'Unit Price',
            'Negotiated price per unit for this deal (may differ from standard price)',
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
         WHERE ID = '1ba0f4c2-6e05-479f-b584-c58308c6f171'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'Discount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1ba0f4c2-6e05-479f-b584-c58308c6f171',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100006,
            'Discount',
            'Discount',
            'Discount percentage applied to this line item (0-100)',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = '1570d155-331e-40a9-babc-0f742749b056'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'TotalPrice')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1570d155-331e-40a9-babc-0f742749b056',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100007,
            'TotalPrice',
            'Total Price',
            'Calculated field: Quantity × UnitPrice × (1 - Discount percentage)',
            'numeric',
            17,
            38,
            6,
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
         WHERE ID = '1ba53315-654a-4565-9d38-205f4a1eb832'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1ba53315-654a-4565-9d38-205f4a1eb832',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100008,
            'Notes',
            'Notes',
            'Additional notes or specifications for this line item',
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
         WHERE ID = '9ea08e36-10ae-481d-b78b-e0cd4d9e214f'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9ea08e36-10ae-481d-b78b-e0cd4d9e214f',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
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
         WHERE ID = '4cf8bd16-ab83-4d44-b0da-9ff9b988ab6e'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4cf8bd16-ab83-4d44-b0da-9ff9b988ab6e',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
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
         WHERE ID = 'b3241b91-2380-4429-8494-cf9b78862a3e'  OR 
               (EntityID = 'D15B9246-2192-4CA9-8057-708E997AF565' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b3241b91-2380-4429-8494-cf9b78862a3e',
            'D15B9246-2192-4CA9-8057-708E997AF565', -- Entity: Submission Speakers
            100001,
            'ID',
            'ID',
            'Unique identifier for the relationship',
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
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a4c101b5-c761-4d69-b80c-89f50d2c91ca'  OR 
               (EntityID = 'D15B9246-2192-4CA9-8057-708E997AF565' AND Name = 'SubmissionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a4c101b5-c761-4d69-b80c-89f50d2c91ca',
            'D15B9246-2192-4CA9-8057-708E997AF565', -- Entity: Submission Speakers
            100002,
            'SubmissionID',
            'Submission ID',
            'Reference to the submission',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982',
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
         WHERE ID = 'f01ed252-fd0f-4d31-89a4-572999f6c9de'  OR 
               (EntityID = 'D15B9246-2192-4CA9-8057-708E997AF565' AND Name = 'SpeakerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f01ed252-fd0f-4d31-89a4-572999f6c9de',
            'D15B9246-2192-4CA9-8057-708E997AF565', -- Entity: Submission Speakers
            100003,
            'SpeakerID',
            'Speaker ID',
            'Reference to the speaker',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7',
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
         WHERE ID = '2d8cf28b-c813-4113-804c-ef422eb2d8bd'  OR 
               (EntityID = 'D15B9246-2192-4CA9-8057-708E997AF565' AND Name = 'IsPrimaryContact')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2d8cf28b-c813-4113-804c-ef422eb2d8bd',
            'D15B9246-2192-4CA9-8057-708E997AF565', -- Entity: Submission Speakers
            100004,
            'IsPrimaryContact',
            'Is Primary Contact',
            'Whether this speaker is the primary contact for the submission',
            'bit',
            1,
            1,
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
         WHERE ID = '99d6b34e-cb14-4ec7-8422-dc625062ef75'  OR 
               (EntityID = 'D15B9246-2192-4CA9-8057-708E997AF565' AND Name = 'Role')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '99d6b34e-cb14-4ec7-8422-dc625062ef75',
            'D15B9246-2192-4CA9-8057-708E997AF565', -- Entity: Submission Speakers
            100005,
            'Role',
            'Role',
            'Role of speaker in this submission (Presenter, Co-Presenter, Moderator, Panelist)',
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
         WHERE ID = '7103f90c-a023-4931-8610-d6927c81e7f4'  OR 
               (EntityID = 'D15B9246-2192-4CA9-8057-708E997AF565' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7103f90c-a023-4931-8610-d6927c81e7f4',
            'D15B9246-2192-4CA9-8057-708E997AF565', -- Entity: Submission Speakers
            100006,
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
         WHERE ID = '34881719-b7d6-4286-ba4b-a866c664fca0'  OR 
               (EntityID = 'D15B9246-2192-4CA9-8057-708E997AF565' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '34881719-b7d6-4286-ba4b-a866c664fca0',
            'D15B9246-2192-4CA9-8057-708E997AF565', -- Entity: Submission Speakers
            100007,
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
         WHERE ID = '72693a0e-aa46-40ea-968b-adf4f409383b'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '72693a0e-aa46-40ea-968b-adf4f409383b',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a72c6ca2-42f5-44c2-b591-6b1f8d8396d4'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = 'InvoiceID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a72c6ca2-42f5-44c2-b591-6b1f8d8396d4',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
            100002,
            'InvoiceID',
            'Invoice ID',
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
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367',
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
         WHERE ID = '9322b3a7-263e-4f4a-9e5c-e2dd4b7f6bc0'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = 'PaymentDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9322b3a7-263e-4f4a-9e5c-e2dd4b7f6bc0',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
            100003,
            'PaymentDate',
            'Payment Date',
            'Date the payment was received',
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
         WHERE ID = 'b41edc81-4685-4b48-9c8f-411fae58475f'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = 'Amount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b41edc81-4685-4b48-9c8f-411fae58475f',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
            100004,
            'Amount',
            'Amount',
            'Amount of the payment in local currency',
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
         WHERE ID = '4a745c62-fe2d-458e-a246-5577408c9908'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = 'PaymentMethod')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4a745c62-fe2d-458e-a246-5577408c9908',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
            100005,
            'PaymentMethod',
            'Payment Method',
            'Method of payment (Check, Credit Card, Wire Transfer, ACH, Cash, Other)',
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
         WHERE ID = '51c3b48c-fa7e-47c7-a8f0-fa8430e27ba2'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = 'ReferenceNumber')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '51c3b48c-fa7e-47c7-a8f0-fa8430e27ba2',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
            100006,
            'ReferenceNumber',
            'Reference Number',
            'Check number, transaction ID, or other payment reference',
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
         WHERE ID = '8c11b068-14d4-4ede-b545-80fe757bb513'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8c11b068-14d4-4ede-b545-80fe757bb513',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
            100007,
            'Notes',
            'Notes',
            'Additional notes about the payment',
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
         WHERE ID = '8dd9703a-d019-4dba-9dca-1f108542fd72'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8dd9703a-d019-4dba-9dca-1f108542fd72',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
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
         WHERE ID = '86003a82-1c87-4cd7-b235-ee78bd670fc0'  OR 
               (EntityID = 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '86003a82-1c87-4cd7-b235-ee78bd670fc0',
            'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', -- Entity: Payments
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
         WHERE ID = 'f866bfad-c08a-4ff5-93be-ff9d24975e14'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f866bfad-c08a-4ff5-93be-ff9d24975e14',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '24850cbd-bc15-47a0-96c3-8166dd9fa225'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'AccountID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24850cbd-bc15-47a0-96c3-8166dd9fa225',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100002,
            'AccountID',
            'Account ID',
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
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF',
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
         WHERE ID = '9c5f8910-a19b-4a52-9cda-51629c40038c'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'InsightType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9c5f8910-a19b-4a52-9cda-51629c40038c',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100003,
            'InsightType',
            'Insight Type',
            'Type of insight (Manual, News Article, SEC Filing, Press Release, Social Media, Financial Report, Market Analysis, Earnings Call, Patent Filing, Leadership Change)',
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
         WHERE ID = '5f61b4d6-a648-4b50-8c5b-a66b00383eea'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5f61b4d6-a648-4b50-8c5b-a66b00383eea',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100004,
            'Title',
            'Title',
            'Title or headline of the insight',
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
         WHERE ID = 'adf902f5-2a9c-4fac-8850-49732c759e0e'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'Content')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'adf902f5-2a9c-4fac-8850-49732c759e0e',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100005,
            'Content',
            'Content',
            'Full content or detailed notes about the insight',
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
         WHERE ID = 'c30335fa-b185-488e-8489-ced23038d794'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'SourceURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c30335fa-b185-488e-8489-ced23038d794',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100006,
            'SourceURL',
            'Source URL',
            'URL to the source article, filing, or document',
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
         WHERE ID = '8468e038-5cc3-4692-b59f-27d6a1a293a2'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'PublishedDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8468e038-5cc3-4692-b59f-27d6a1a293a2',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100007,
            'PublishedDate',
            'Published Date',
            'Date the original content was published (not when it was added to CRM)',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = 'f94bf75e-c11c-4217-bdc7-0959dc1b8606'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f94bf75e-c11c-4217-bdc7-0959dc1b8606',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100008,
            'CreatedAt',
            'Created At',
            'Timestamp when this insight was added to the system',
            'datetime',
            8,
            23,
            3,
            0,
            'getdate()',
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
         WHERE ID = '1cee3018-2377-4b85-9f6a-8a5e509d0fac'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'CreatedByContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1cee3018-2377-4b85-9f6a-8a5e509d0fac',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100009,
            'CreatedByContactID',
            'Created By Contact ID',
            'Contact who manually created this insight (NULL for AI-generated insights)',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = '1a0eb917-eb5e-4626-98ea-1fbcfa9dbddd'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'Sentiment')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1a0eb917-eb5e-4626-98ea-1fbcfa9dbddd',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100010,
            'Sentiment',
            'Sentiment',
            'AI-analyzed sentiment of the insight (Positive, Negative, Neutral, Mixed)',
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
         WHERE ID = 'f4fc97aa-83af-4ed9-bcae-ebbae6c3ec0d'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f4fc97aa-83af-4ed9-bcae-ebbae6c3ec0d',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100011,
            'Priority',
            'Priority',
            'Priority level for follow-up or attention (High, Medium, Low)',
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
         WHERE ID = '4245a32f-a563-4af8-8926-712ebf81bc30'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'Tags')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4245a32f-a563-4af8-8926-712ebf81bc30',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100012,
            'Tags',
            'Tags',
            'JSON array of tags for categorization and filtering',
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
         WHERE ID = '7654056f-514f-4db5-b26b-7fac56b65344'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'Summary')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7654056f-514f-4db5-b26b-7fac56b65344',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100013,
            'Summary',
            'Summary',
            'AI-generated concise summary of the content for quick reading',
            'nvarchar',
            4000,
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
         WHERE ID = '0106cb6b-4e20-4ff7-8e31-053521d81d79'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'IsArchived')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0106cb6b-4e20-4ff7-8e31-053521d81d79',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100014,
            'IsArchived',
            'Is Archived',
            'Whether this insight has been archived (hidden from default views)',
            'bit',
            1,
            1,
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
         WHERE ID = 'c331c875-428d-49b2-8485-4b78c07a8548'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c331c875-428d-49b2-8485-4b78c07a8548',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100015,
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
         WHERE ID = '0efca6b0-0cc5-42cf-b6c0-0c64e9e40d8a'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0efca6b0-0cc5-42cf-b6c0-0c64e9e40d8a',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100016,
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
         WHERE ID = '3e957a7c-733c-43c9-81ab-a9d3c875a75a'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3e957a7c-733c-43c9-81ab-a9d3c875a75a',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f547f478-85a5-4303-a360-9558d47e3643'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'InvoiceNumber')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f547f478-85a5-4303-a360-9558d47e3643',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100002,
            'InvoiceNumber',
            'Invoice Number',
            'Unique invoice identifier for external reference',
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
         WHERE ID = '417567c6-6258-41e5-8a18-44dff22fcae8'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'AccountID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '417567c6-6258-41e5-8a18-44dff22fcae8',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100003,
            'AccountID',
            'Account ID',
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
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF',
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
         WHERE ID = '6a6ea1e2-719e-4038-9d82-cdf3605a9157'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'DealID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6a6ea1e2-719e-4038-9d82-cdf3605a9157',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100004,
            'DealID',
            'Deal ID',
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
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B',
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
         WHERE ID = '915f2cc4-4632-4def-a1a4-882a0c21123c'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'InvoiceDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '915f2cc4-4632-4def-a1a4-882a0c21123c',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100005,
            'InvoiceDate',
            'Invoice Date',
            'Date the invoice was issued',
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
         WHERE ID = '8ca518d0-ba39-4e55-be2c-810752d4c51c'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'DueDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8ca518d0-ba39-4e55-be2c-810752d4c51c',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100006,
            'DueDate',
            'Due Date',
            'Payment due date for the invoice',
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
         WHERE ID = '006ca7d1-d4b9-4212-a964-4c5298004b06'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '006ca7d1-d4b9-4212-a964-4c5298004b06',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100007,
            'Status',
            'Status',
            'Current status of the invoice (Draft, Sent, Paid, Partial, Overdue, Cancelled)',
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
         WHERE ID = '5a1a8b36-b248-477e-bd09-b20668d534f6'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'SubTotal')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5a1a8b36-b248-477e-bd09-b20668d534f6',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100008,
            'SubTotal',
            'Sub Total',
            'Sum of all line items before tax',
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
         WHERE ID = '248410f3-da07-4577-a510-a03a6955726c'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'TaxRate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '248410f3-da07-4577-a510-a03a6955726c',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100009,
            'TaxRate',
            'Tax Rate',
            'Tax rate percentage to apply to the subtotal',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = '2707be77-ec82-4453-b442-685989140a73'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'TaxAmount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2707be77-ec82-4453-b442-685989140a73',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100010,
            'TaxAmount',
            'Tax Amount',
            'Calculated field: SubTotal × TaxRate percentage',
            'numeric',
            17,
            30,
            9,
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
         WHERE ID = '45668ee5-e72b-4cde-b9a8-f953d174ff9d'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'TotalAmount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '45668ee5-e72b-4cde-b9a8-f953d174ff9d',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100011,
            'TotalAmount',
            'Total Amount',
            'Calculated field: SubTotal + TaxAmount',
            'numeric',
            17,
            31,
            9,
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
         WHERE ID = '4d60e0b1-591c-4024-bc70-144ecc9ec489'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'AmountPaid')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4d60e0b1-591c-4024-bc70-144ecc9ec489',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100012,
            'AmountPaid',
            'Amount Paid',
            'Total amount paid against this invoice',
            'decimal',
            9,
            18,
            2,
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
         WHERE ID = 'b8f4e1f1-0c48-46ea-9e4c-c76364e7ce8a'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'BalanceDue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b8f4e1f1-0c48-46ea-9e4c-c76364e7ce8a',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100013,
            'BalanceDue',
            'Balance Due',
            'Calculated field: TotalAmount - AmountPaid',
            'numeric',
            17,
            32,
            9,
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
         WHERE ID = '5cddba73-8baf-41e8-8346-e3cb105c7563'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'Terms')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5cddba73-8baf-41e8-8346-e3cb105c7563',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100014,
            'Terms',
            'Terms',
            'Payment terms (e.g., Net 30, Net 15, Due on Receipt, 2/10 Net 30)',
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
         WHERE ID = 'c72e57cb-8bf4-4465-93c2-942a8a42e934'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c72e57cb-8bf4-4465-93c2-942a8a42e934',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100015,
            'Notes',
            'Notes',
            'Additional notes or special instructions for the invoice',
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
         WHERE ID = '147e5cac-cd05-4774-9766-4d9f8f561e05'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'BillingStreet')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '147e5cac-cd05-4774-9766-4d9f8f561e05',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100016,
            'BillingStreet',
            'Billing Street',
            'Billing address street',
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
         WHERE ID = '9fe1404a-bc0e-4850-a32b-3dfad14db53f'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'BillingCity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9fe1404a-bc0e-4850-a32b-3dfad14db53f',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100017,
            'BillingCity',
            'Billing City',
            'Billing address city',
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
         WHERE ID = 'd15b69a2-6dc2-4801-bf75-7607b10a789f'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'BillingState')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd15b69a2-6dc2-4801-bf75-7607b10a789f',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100018,
            'BillingState',
            'Billing State',
            'Billing address state or province',
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
         WHERE ID = '215aa0c1-fa94-411b-af95-009f90fc9af8'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'BillingPostalCode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '215aa0c1-fa94-411b-af95-009f90fc9af8',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100019,
            'BillingPostalCode',
            'Billing Postal Code',
            'Billing address postal or ZIP code',
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
         WHERE ID = '67b8ca6c-9217-4555-9693-7dc26e00d9a2'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'BillingCountry')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '67b8ca6c-9217-4555-9693-7dc26e00d9a2',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100020,
            'BillingCountry',
            'Billing Country',
            'Billing address country',
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
         WHERE ID = '09cd4a32-d4dc-4ec5-b86e-e76fb646a71e'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '09cd4a32-d4dc-4ec5-b86e-e76fb646a71e',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100021,
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
         WHERE ID = '25b82aad-8054-49a1-a5a7-c46fde5232b2'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '25b82aad-8054-49a1-a5a7-c46fde5232b2',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100022,
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
         WHERE ID = '256980f8-a30b-4d88-a534-98ddd2ef921c'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '256980f8-a30b-4d88-a534-98ddd2ef921c',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100001,
            'ID',
            'ID',
            'Unique identifier for the speaker',
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
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3a136010-dc61-4d6d-ad60-1a63507922da'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'ContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3a136010-dc61-4d6d-ad60-1a63507922da',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100002,
            'ContactID',
            'Contact ID',
            'Optional reference to CRM Contact record',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = 'ed622825-7f23-4dd4-9ce6-73b07b7fd6bd'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'FullName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ed622825-7f23-4dd4-9ce6-73b07b7fd6bd',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100003,
            'FullName',
            'Full Name',
            'Full name of the speaker',
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
         WHERE ID = 'b7b4d4cf-7527-415c-a384-4cc681fb1c48'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b7b4d4cf-7527-415c-a384-4cc681fb1c48',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100004,
            'Email',
            'Email',
            'Primary email address',
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
         WHERE ID = '48bb9804-ddd6-4222-b035-3b3a6e0f7834'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'PhoneNumber')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '48bb9804-ddd6-4222-b035-3b3a6e0f7834',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100005,
            'PhoneNumber',
            'Phone Number',
            'Contact phone number',
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
         WHERE ID = 'f1137146-9aee-4807-8fb8-1745723da98b'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f1137146-9aee-4807-8fb8-1745723da98b',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100006,
            'Title',
            'Title',
            'Professional title or position',
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
         WHERE ID = '62639afc-abee-4be3-9770-8b1f93c63eb2'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'Organization')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '62639afc-abee-4be3-9770-8b1f93c63eb2',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100007,
            'Organization',
            'Organization',
            'Company or organization affiliation',
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
         WHERE ID = 'b0ca5838-2759-45cd-8f0d-d8075fd8a437'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'Bio')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b0ca5838-2759-45cd-8f0d-d8075fd8a437',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100008,
            'Bio',
            'Bio',
            'Speaker biography as submitted',
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
         WHERE ID = '5d7a285a-456d-402c-a2b0-fbf819fbd777'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'LinkedInURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5d7a285a-456d-402c-a2b0-fbf819fbd777',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100009,
            'LinkedInURL',
            'Linked In URL',
            'LinkedIn profile URL',
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
         WHERE ID = 'fb28a845-8725-4b1a-b6b1-080379f1433c'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'TwitterHandle')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fb28a845-8725-4b1a-b6b1-080379f1433c',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100010,
            'TwitterHandle',
            'Twitter Handle',
            'Twitter/X handle',
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
         WHERE ID = 'ba7b2e6e-8c02-4b5b-86ad-43598398618a'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'WebsiteURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ba7b2e6e-8c02-4b5b-86ad-43598398618a',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100011,
            'WebsiteURL',
            'Website URL',
            'Personal or professional website URL',
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
         WHERE ID = '03bf6f83-a140-4297-ac7b-1ed2f434e0b0'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'PhotoURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '03bf6f83-a140-4297-ac7b-1ed2f434e0b0',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100012,
            'PhotoURL',
            'Photo URL',
            'URL to speaker headshot or profile photo',
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
         WHERE ID = 'c8465491-4e6a-41d8-b8af-ff763ad437e7'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'SpeakingExperience')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c8465491-4e6a-41d8-b8af-ff763ad437e7',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100013,
            'SpeakingExperience',
            'Speaking Experience',
            'Description of previous speaking experience as submitted',
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
         WHERE ID = '421c35f8-0ddc-46bc-abae-78452e2b9872'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'DossierResearchedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '421c35f8-0ddc-46bc-abae-78452e2b9872',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100014,
            'DossierResearchedAt',
            'Dossier Researched At',
            'Timestamp when AI research was last performed on this speaker',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = 'f4e808e0-6294-4587-a61c-26a146221e49'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'DossierJSON')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f4e808e0-6294-4587-a61c-26a146221e49',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100015,
            'DossierJSON',
            'Dossier JSON',
            'Comprehensive JSON research results from web searches and social media',
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
         WHERE ID = '1fbdbf20-cd48-4305-b2b9-0736f1ba3b69'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'DossierSummary')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1fbdbf20-cd48-4305-b2b9-0736f1ba3b69',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100016,
            'DossierSummary',
            'Dossier Summary',
            'AI-generated summary of speaker background and credibility',
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
         WHERE ID = 'ca040c07-2e01-4bfa-b23e-0d57efb6ebf6'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'CredibilityScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ca040c07-2e01-4bfa-b23e-0d57efb6ebf6',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100017,
            'CredibilityScore',
            'Credibility Score',
            'AI-calculated credibility score based on research (0-100)',
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
         WHERE ID = '3b1abc3c-7852-4ec9-8195-dfa27530a8ca'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'SpeakingHistory')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3b1abc3c-7852-4ec9-8195-dfa27530a8ca',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100018,
            'SpeakingHistory',
            'Speaking History',
            'JSON array of previous speaking engagements discovered through research',
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
         WHERE ID = 'a9d7b7ec-f903-4a6e-ba0e-56a217b3dc28'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'Expertise')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a9d7b7ec-f903-4a6e-ba0e-56a217b3dc28',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100019,
            'Expertise',
            'Expertise',
            'JSON array of expertise topics and domains',
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
         WHERE ID = '956a168b-186c-43f6-a54f-e5927aad9bae'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'PublicationsCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '956a168b-186c-43f6-a54f-e5927aad9bae',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100020,
            'PublicationsCount',
            'Publications Count',
            'Number of publications, articles, or blog posts discovered',
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
         WHERE ID = '2a78400f-b2c1-4a84-b331-d21d1128a602'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'SocialMediaReach')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2a78400f-b2c1-4a84-b331-d21d1128a602',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100021,
            'SocialMediaReach',
            'Social Media Reach',
            'Total social media followers/reach across platforms',
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
         WHERE ID = '37e7abc3-d00c-457e-abb2-261c38797e84'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = 'RedFlags')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '37e7abc3-d00c-457e-abb2-261c38797e84',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100022,
            'RedFlags',
            'Red Flags',
            'JSON array of any concerns or red flags identified during research',
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
         WHERE ID = 'd75e080f-d931-416f-9067-1c4d0c1fae15'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd75e080f-d931-416f-9067-1c4d0c1fae15',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100023,
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
         WHERE ID = '28445118-eb80-4ccf-adf3-06fdb318f808'  OR 
               (EntityID = '0ADAFF68-56F9-41DA-9572-7E165C682EA7' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '28445118-eb80-4ccf-adf3-06fdb318f808',
            '0ADAFF68-56F9-41DA-9572-7E165C682EA7', -- Entity: Speakers
            100024,
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
         WHERE ID = 'c66bc0a0-5111-420f-ab0d-dbaac9249462'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c66bc0a0-5111-420f-ab0d-dbaac9249462',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100001,
            'ID',
            'ID',
            'Unique identifier for the event',
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
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '258da168-1798-4789-94e4-708b26a88c4f'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'ParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '258da168-1798-4789-94e4-708b26a88c4f',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100002,
            'ParentID',
            'Parent ID',
            'Parent event ID for multi-day or related events',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'A0183D9A-B171-4E72-826D-7F86248795F9',
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
         WHERE ID = '740c810a-e9b4-4f5b-bbf8-5d24cac659d5'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '740c810a-e9b4-4f5b-bbf8-5d24cac659d5',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100003,
            'Name',
            'Name',
            'Name of the event or conference',
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
         WHERE ID = 'faf9c910-1a8b-4813-9799-47420a873eb5'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'faf9c910-1a8b-4813-9799-47420a873eb5',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100004,
            'Description',
            'Description',
            'Full description of the event',
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
         WHERE ID = 'fdafd7f8-289a-4d1d-ac91-b1b7c6d5dcac'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'ConferenceTheme')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fdafd7f8-289a-4d1d-ac91-b1b7c6d5dcac',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100005,
            'ConferenceTheme',
            'Conference Theme',
            'Main theme or focus area of the conference',
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
         WHERE ID = '6aa765a9-d486-462e-b615-506d24b42be7'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'TargetAudience')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6aa765a9-d486-462e-b615-506d24b42be7',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100006,
            'TargetAudience',
            'Target Audience',
            'Description of target audience and their expertise levels',
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
         WHERE ID = '966c46ad-1b13-4072-af9b-311b4abe8a90'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'StartDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '966c46ad-1b13-4072-af9b-311b4abe8a90',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100007,
            'StartDate',
            'Start Date',
            'Start date and time of the event',
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
         WHERE ID = '8d5a75ae-bd78-44ad-9640-eeea86f0509e'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'EndDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8d5a75ae-bd78-44ad-9640-eeea86f0509e',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100008,
            'EndDate',
            'End Date',
            'End date and time of the event',
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
         WHERE ID = '53c57267-86d9-44b6-865e-bc0c746a545b'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'Location')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '53c57267-86d9-44b6-865e-bc0c746a545b',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100009,
            'Location',
            'Location',
            'Physical or virtual location of the event',
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
         WHERE ID = 'a73dc4f3-bbe1-41b2-86f1-38a215f23776'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a73dc4f3-bbe1-41b2-86f1-38a215f23776',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100010,
            'Status',
            'Status',
            'Current status of the event (Planning, Open for Submissions, Review, Closed, Completed, Canceled)',
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
         WHERE ID = '71f42fdd-3e13-4ef4-8ebc-ec513a9ffacf'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'SubmissionDeadline')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '71f42fdd-3e13-4ef4-8ebc-ec513a9ffacf',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100011,
            'SubmissionDeadline',
            'Submission Deadline',
            'Deadline for submitting proposals',
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
         WHERE ID = 'f4288311-2885-4b24-b0fb-7fa602c2baeb'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'NotificationDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f4288311-2885-4b24-b0fb-7fa602c2baeb',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100012,
            'NotificationDate',
            'Notification Date',
            'Date when speakers will be notified of acceptance/rejection',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = '846014d1-c443-4ec8-8e82-7c92a1609ef2'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'EvaluationRubric')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '846014d1-c443-4ec8-8e82-7c92a1609ef2',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100013,
            'EvaluationRubric',
            'Evaluation Rubric',
            'AI prompt/rubric for evaluating submissions (JSON or text)',
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
         WHERE ID = '5b77b77a-3935-4af0-a351-8ea6ba2c4277'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'BaselinePassingScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5b77b77a-3935-4af0-a351-8ea6ba2c4277',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100014,
            'BaselinePassingScore',
            'Baseline Passing Score',
            'Minimum score required to pass initial screening (0-100)',
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
         WHERE ID = '887a408b-6251-4c31-997e-0a8a9ccbdaaa'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'ReviewCommitteeEmails')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '887a408b-6251-4c31-997e-0a8a9ccbdaaa',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100015,
            'ReviewCommitteeEmails',
            'Review Committee Emails',
            'JSON array of review committee member email addresses',
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
         WHERE ID = 'f771894c-33ea-4c9a-b3d4-133ac515e459'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'TypeformID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f771894c-33ea-4c9a-b3d4-133ac515e459',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100016,
            'TypeformID',
            'Typeform ID',
            'Typeform form ID for submission intake',
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
         WHERE ID = '1bd2654c-3cdd-4be6-911d-346e0dd49199'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'TypeformMonitorEnabled')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1bd2654c-3cdd-4be6-911d-346e0dd49199',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100017,
            'TypeformMonitorEnabled',
            'Typeform Monitor Enabled',
            'Whether automated Typeform monitoring is enabled',
            'bit',
            1,
            1,
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
         WHERE ID = '6ca906c0-51f9-4dcc-8c72-6065701e47d5'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'TypeformCheckFrequencyMinutes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6ca906c0-51f9-4dcc-8c72-6065701e47d5',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100018,
            'TypeformCheckFrequencyMinutes',
            'Typeform Check Frequency Minutes',
            'How often to check Typeform for new submissions (minutes)',
            'int',
            4,
            10,
            0,
            1,
            '(60)',
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
         WHERE ID = '79155898-6bf3-4f70-aec7-a898bbb0f18f'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'BoxFolderID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '79155898-6bf3-4f70-aec7-a898bbb0f18f',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100019,
            'BoxFolderID',
            'Box Folder ID',
            'Box.com folder ID where submission files are stored',
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
         WHERE ID = 'a14035d9-5eb4-4352-96e7-eb34c2e39ea7'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'SessionFormats')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a14035d9-5eb4-4352-96e7-eb34c2e39ea7',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100020,
            'SessionFormats',
            'Session Formats',
            'JSON array of allowed session formats (Workshop, Keynote, Panel, Lightning Talk, etc.)',
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
         WHERE ID = 'cb9e5522-3fdf-4a58-b54a-319b0d12484e'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'AccountID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cb9e5522-3fdf-4a58-b54a-319b0d12484e',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100021,
            'AccountID',
            'Account ID',
            'Optional reference to CRM Account for event organization',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF',
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
         WHERE ID = 'a449775f-2a01-46b3-be67-31b357e3e603'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a449775f-2a01-46b3-be67-31b357e3e603',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100022,
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
         WHERE ID = '4ebd75a4-2b49-4e59-85b1-71c846f7e788'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4ebd75a4-2b49-4e59-85b1-71c846f7e788',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100023,
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
         WHERE ID = '57c99d8b-6712-40b8-bac5-1bca09ca72a8'  OR 
               (EntityID = 'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '57c99d8b-6712-40b8-bac5-1bca09ca72a8',
            'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C', -- Entity: Activity Types
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c9ecb4a9-6361-4b34-b559-b15337603954'  OR 
               (EntityID = 'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c9ecb4a9-6361-4b34-b559-b15337603954',
            'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C', -- Entity: Activity Types
            100002,
            'Name',
            'Name',
            'Name of the activity type',
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
         WHERE ID = 'c4e9a5a4-29a9-4a95-a8ae-83043acda77b'  OR 
               (EntityID = 'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c4e9a5a4-29a9-4a95-a8ae-83043acda77b',
            'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C', -- Entity: Activity Types
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
         WHERE ID = 'b7d6cc48-8da8-4569-a602-fbd11db3b46f'  OR 
               (EntityID = 'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b7d6cc48-8da8-4569-a602-fbd11db3b46f',
            'BA3DECF6-B6A0-441F-9CEA-8A5861AC961C', -- Entity: Activity Types
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
         WHERE ID = '94e196c8-51f8-429c-9e79-dc6324ccc8ac'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '94e196c8-51f8-429c-9e79-dc6324ccc8ac',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2b90a553-1923-41be-a0d9-32b54fc2e81a'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2b90a553-1923-41be-a0d9-32b54fc2e81a',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100002,
            'Name',
            'Name',
            'Official name of the organization or company',
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
         WHERE ID = '7fbd137a-c017-4a22-85e4-bfc5a642ccb2'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'Industry')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7fbd137a-c017-4a22-85e4-bfc5a642ccb2',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100003,
            'Industry',
            'Industry',
            'Industry sector the account belongs to',
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
         WHERE ID = 'bc014746-888b-4169-8928-9e44d5e0c9c9'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'AnnualRevenue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bc014746-888b-4169-8928-9e44d5e0c9c9',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100004,
            'AnnualRevenue',
            'Annual Revenue',
            'Estimated annual revenue of the account in local currency',
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
         WHERE ID = '02ecc930-0159-47de-b8f9-0c85f062a733'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'TickerSymbol')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '02ecc930-0159-47de-b8f9-0c85f062a733',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100005,
            'TickerSymbol',
            'Ticker Symbol',
            'Stock ticker symbol for publicly traded companies',
            'nvarchar',
            20,
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
         WHERE ID = '58799f4b-019b-4020-bbbf-e42f16fe7074'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'Exchange')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '58799f4b-019b-4020-bbbf-e42f16fe7074',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100006,
            'Exchange',
            'Exchange',
            'Stock exchange where company is listed (NYSE, NASDAQ, AMEX, LSE, TSE, HKEX, SSE, Other)',
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
         WHERE ID = 'a601b314-50e8-421a-a479-628fe45a7c3e'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'EmployeeCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a601b314-50e8-421a-a479-628fe45a7c3e',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100007,
            'EmployeeCount',
            'Employee Count',
            'Approximate number of employees',
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
         WHERE ID = 'fa47ec16-e04a-41cb-a327-2d18a3c5a3c4'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'Founded')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fa47ec16-e04a-41cb-a327-2d18a3c5a3c4',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100008,
            'Founded',
            'Founded',
            'Year the company was founded',
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
         WHERE ID = 'da9fd968-f549-4a0b-85ca-b56186829128'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'Website')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'da9fd968-f549-4a0b-85ca-b56186829128',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100009,
            'Website',
            'Website',
            'Primary website URL of the account',
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
         WHERE ID = 'ee09a082-c532-437e-8460-04659ecf8c7b'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'Phone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ee09a082-c532-437e-8460-04659ecf8c7b',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100010,
            'Phone',
            'Phone',
            'Main phone number for the account',
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
         WHERE ID = 'f5f086c2-90eb-4f3f-a0ee-19e5459f5164'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'Fax')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f5f086c2-90eb-4f3f-a0ee-19e5459f5164',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100011,
            'Fax',
            'Fax',
            'Fax number for the account',
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
         WHERE ID = '8d3a51d8-3f8d-4f5f-aa22-a3f5e3b354ce'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'BillingStreet')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8d3a51d8-3f8d-4f5f-aa22-a3f5e3b354ce',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100012,
            'BillingStreet',
            'Billing Street',
            'Street address for billing',
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
         WHERE ID = 'c0dfcaa0-4e05-468e-acb7-8a240e50d071'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'BillingCity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c0dfcaa0-4e05-468e-acb7-8a240e50d071',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100013,
            'BillingCity',
            'Billing City',
            'City for billing address',
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
         WHERE ID = '3490560b-021e-4efb-9f10-53d4f1aecb69'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'BillingState')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3490560b-021e-4efb-9f10-53d4f1aecb69',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100014,
            'BillingState',
            'Billing State',
            'State/province for billing address',
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
         WHERE ID = '7b9aaa8f-163c-4c8b-a0a8-f509b87034db'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'BillingPostalCode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7b9aaa8f-163c-4c8b-a0a8-f509b87034db',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100015,
            'BillingPostalCode',
            'Billing Postal Code',
            'Postal/ZIP code for billing address',
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
         WHERE ID = '5e2c23aa-1265-46b3-8392-8385114d29a4'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'BillingCountry')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5e2c23aa-1265-46b3-8392-8385114d29a4',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100016,
            'BillingCountry',
            'Billing Country',
            'Country for billing address',
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
         WHERE ID = '18d365bc-3710-42a7-9f8c-96a96ff92d75'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'ShippingStreet')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '18d365bc-3710-42a7-9f8c-96a96ff92d75',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100017,
            'ShippingStreet',
            'Shipping Street',
            'Street address for shipping',
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
         WHERE ID = '4c084c8e-3e28-4b12-a5e2-2d0f9a1b3b2a'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'ShippingCity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c084c8e-3e28-4b12-a5e2-2d0f9a1b3b2a',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100018,
            'ShippingCity',
            'Shipping City',
            'City for shipping address',
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
         WHERE ID = '08bbc1c6-1a90-4db2-8324-f5b4976f07ae'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'ShippingState')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '08bbc1c6-1a90-4db2-8324-f5b4976f07ae',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100019,
            'ShippingState',
            'Shipping State',
            'State/province for shipping address',
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
         WHERE ID = '64f87060-86ec-435b-8eb2-99bce6eecab0'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'ShippingPostalCode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64f87060-86ec-435b-8eb2-99bce6eecab0',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100020,
            'ShippingPostalCode',
            'Shipping Postal Code',
            'Postal/ZIP code for shipping address',
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
         WHERE ID = '054de57a-88f4-451b-ab12-9cf06c1f14fd'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'ShippingCountry')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '054de57a-88f4-451b-ab12-9cf06c1f14fd',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100021,
            'ShippingCountry',
            'Shipping Country',
            'Country for shipping address',
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
         WHERE ID = '57d4943f-69aa-4cd5-b684-7ae026a63529'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'AccountType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '57d4943f-69aa-4cd5-b684-7ae026a63529',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100022,
            'AccountType',
            'Account Type',
            'Type of relationship with the account (Prospect, Customer, etc.)',
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
         WHERE ID = 'f8fe6be7-7ee6-4c7f-9f83-7e09955a62e9'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'AccountStatus')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f8fe6be7-7ee6-4c7f-9f83-7e09955a62e9',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100023,
            'AccountStatus',
            'Account Status',
            'Current status of the account (Active, Inactive, etc.)',
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
         WHERE ID = '9e4c8a3b-85cc-4eee-afb8-605aa5bdb9d1'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9e4c8a3b-85cc-4eee-afb8-605aa5bdb9d1',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
            100024,
            'IsActive',
            'Is Active',
            'Indicates whether the account is currently active',
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
         WHERE ID = '2dadd7e8-9641-458a-9676-5437c7cb501d'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2dadd7e8-9641-458a-9676-5437c7cb501d',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
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
            NULL,
            NULL,
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
         WHERE ID = '261e491d-2ca1-471d-9eb9-b28c74811f86'  OR 
               (EntityID = '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '261e491d-2ca1-471d-9eb9-b28c74811f86',
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', -- Entity: Accounts
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
            NULL,
            NULL,
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
         WHERE ID = 'a8fbd687-38b3-4a63-9488-43aa804a5462'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a8fbd687-38b3-4a63-9488-43aa804a5462',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e4025cb6-f0fb-4f94-947b-d671cf1bd55b'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'PrimaryContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4025cb6-f0fb-4f94-947b-d671cf1bd55b',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100002,
            'PrimaryContactID',
            'Primary Contact ID',
            'ID of the primary contact in the relationship (e.g., the parent)',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = '32226817-1d0c-4eaf-a1d6-2a8e49ec7091'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'RelatedContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '32226817-1d0c-4eaf-a1d6-2a8e49ec7091',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100003,
            'RelatedContactID',
            'Related Contact ID',
            'ID of the related contact in the relationship (e.g., the child)',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = 'b36537e6-f3fb-4744-be99-7cf4b790807e'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'RelationshipTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b36537e6-f3fb-4744-be99-7cf4b790807e',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100004,
            'RelationshipTypeID',
            'Relationship Type ID',
            'ID of the relationship type defining how contacts are related',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            '8CC17F62-138B-48E4-8167-D2681D5F65AC',
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
         WHERE ID = '060862e0-8ee8-4d48-9bb5-424bc7dc866a'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'StartDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '060862e0-8ee8-4d48-9bb5-424bc7dc866a',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100005,
            'StartDate',
            'Start Date',
            'Date when the relationship started',
            'date',
            3,
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
         WHERE ID = 'b3ac182b-b77b-438e-b816-7e33a9a143f2'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'EndDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b3ac182b-b77b-438e-b816-7e33a9a143f2',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100006,
            'EndDate',
            'End Date',
            'Date when the relationship ended (if applicable)',
            'date',
            3,
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
         WHERE ID = 'ad559876-ad47-4759-b9ea-bc6b9b158264'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ad559876-ad47-4759-b9ea-bc6b9b158264',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100007,
            'Notes',
            'Notes',
            'Additional notes or details about the relationship',
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
         WHERE ID = '1f359445-1316-41cc-b82c-274923d6df07'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1f359445-1316-41cc-b82c-274923d6df07',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100008,
            'IsActive',
            'Is Active',
            'Indicates whether the relationship is currently active',
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
         WHERE ID = '4a8b2d63-fc2a-48e1-af02-12035127a065'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4a8b2d63-fc2a-48e1-af02-12035127a065',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
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
         WHERE ID = '99f326e0-8fb7-4f11-b99d-5efc6a1e9d6e'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '99f326e0-8fb7-4f11-b99d-5efc6a1e9d6e',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
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
         WHERE ID = '8e0ba39d-5527-42f2-a566-d72bc163e588'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8e0ba39d-5527-42f2-a566-d72bc163e588',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '307f2132-9384-4ca4-a1a5-d0c628be4739'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'AccountID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '307f2132-9384-4ca4-a1a5-d0c628be4739',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100002,
            'AccountID',
            'Account ID',
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
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF',
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
         WHERE ID = '6f8b8025-2cff-4427-9fa6-d1e3e7a11401'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'ContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f8b8025-2cff-4427-9fa6-d1e3e7a11401',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100003,
            'ContactID',
            'Contact ID',
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
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = '9230c94b-09ce-402f-b8ad-aeaabed00646'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'ActivityType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9230c94b-09ce-402f-b8ad-aeaabed00646',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100004,
            'ActivityType',
            'Activity Type',
            'Type of activity (Call, Email, Meeting, etc.)',
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
         WHERE ID = 'ef55b113-bb91-4520-b85b-be1a098da38f'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Subject')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ef55b113-bb91-4520-b85b-be1a098da38f',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100005,
            'Subject',
            'Subject',
            'Brief description of the activity',
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
         WHERE ID = 'dc750707-14b5-4df8-a5ab-1e5e64d663b8'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dc750707-14b5-4df8-a5ab-1e5e64d663b8',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100006,
            'Description',
            'Description',
            'Detailed description or notes about the activity',
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
         WHERE ID = 'a84b6cb8-e5cc-4dcd-a81e-4cc09689b57a'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'StartDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a84b6cb8-e5cc-4dcd-a81e-4cc09689b57a',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100007,
            'StartDate',
            'Start Date',
            'Date and time when the activity starts',
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
         WHERE ID = '8a3a73de-afdd-4ec1-8d01-ac21c1cd8d08'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'EndDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8a3a73de-afdd-4ec1-8d01-ac21c1cd8d08',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100008,
            'EndDate',
            'End Date',
            'Date and time when the activity ends',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = '2f9740f5-2c6c-4952-9f70-f4cc0aa8e0eb'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2f9740f5-2c6c-4952-9f70-f4cc0aa8e0eb',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100009,
            'Status',
            'Status',
            'Current status of the activity (Planned, Completed, etc.)',
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
         WHERE ID = '11cc9cd8-12a1-4463-a715-976cb1e5ffae'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '11cc9cd8-12a1-4463-a715-976cb1e5ffae',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100010,
            'Priority',
            'Priority',
            'Priority level of the activity (High, Medium, Low)',
            'nvarchar',
            20,
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
         WHERE ID = '85be8206-93da-4ce6-aca8-36a0f59fc570'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Direction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '85be8206-93da-4ce6-aca8-36a0f59fc570',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100011,
            'Direction',
            'Direction',
            'Direction of communication (Inbound, Outbound, Internal)',
            'nvarchar',
            20,
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
         WHERE ID = '66da39ac-8e1f-4b68-ac5b-e54ca1457dc5'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Location')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '66da39ac-8e1f-4b68-ac5b-e54ca1457dc5',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100012,
            'Location',
            'Location',
            'Physical or virtual location of the activity',
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
         WHERE ID = 'a5e01f19-6f31-4487-bab3-0404a7885f55'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Result')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a5e01f19-6f31-4487-bab3-0404a7885f55',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100013,
            'Result',
            'Result',
            'Outcome or result of the activity',
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
         WHERE ID = 'd753d883-e319-4dd7-a3e1-f707783474bd'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd753d883-e319-4dd7-a3e1-f707783474bd',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
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
         WHERE ID = '3aad6f64-f5d8-448d-a619-de2894e012e1'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3aad6f64-f5d8-448d-a619-de2894e012e1',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
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
         WHERE ID = '9b4b4240-b320-404b-bd71-44c5e47d286c'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9b4b4240-b320-404b-bd71-44c5e47d286c',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fc8311ae-ff00-45ad-9935-eede661299a9'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fc8311ae-ff00-45ad-9935-eede661299a9',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100002,
            'Name',
            'Name',
            'Descriptive name for the deal or opportunity',
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
         WHERE ID = 'bb63db93-6f43-4ae5-ba4f-16419eca4479'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'AccountID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bb63db93-6f43-4ae5-ba4f-16419eca4479',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100003,
            'AccountID',
            'Account ID',
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
            '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF',
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
         WHERE ID = 'e07fb840-83e7-4ca9-becf-17f97ff5fd26'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'ContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e07fb840-83e7-4ca9-becf-17f97ff5fd26',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100004,
            'ContactID',
            'Contact ID',
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
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = '5228d5a6-91e6-45d2-b002-5ee2b76c5c0b'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'Stage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5228d5a6-91e6-45d2-b002-5ee2b76c5c0b',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100005,
            'Stage',
            'Stage',
            'Current stage in the sales pipeline (Prospecting, Qualification, Proposal, Negotiation, Closed Won, Closed Lost)',
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
         WHERE ID = 'e216de1e-367a-4e5f-8b5a-fa8d9ed788d9'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'Amount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e216de1e-367a-4e5f-8b5a-fa8d9ed788d9',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100006,
            'Amount',
            'Amount',
            'Total potential value of the deal in local currency',
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
         WHERE ID = '99431dba-93f4-4095-9c63-18627c092c0c'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'Probability')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '99431dba-93f4-4095-9c63-18627c092c0c',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100007,
            'Probability',
            'Probability',
            'Estimated probability of closing the deal (0-100 percent)',
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
         WHERE ID = '1eaec073-f36a-4e4d-b6f5-6cf86027b14d'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'ExpectedRevenue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1eaec073-f36a-4e4d-b6f5-6cf86027b14d',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100008,
            'ExpectedRevenue',
            'Expected Revenue',
            'Calculated field: Amount multiplied by Probability percentage',
            'numeric',
            17,
            35,
            7,
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
         WHERE ID = '4dbe1698-f20d-4cad-82da-b0fc6f0cdc9d'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'CloseDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4dbe1698-f20d-4cad-82da-b0fc6f0cdc9d',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100009,
            'CloseDate',
            'Close Date',
            'Target date for closing the deal',
            'date',
            3,
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
         WHERE ID = 'a12683ed-2661-44dd-8864-7ee30ec223fb'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'ActualCloseDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a12683ed-2661-44dd-8864-7ee30ec223fb',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100010,
            'ActualCloseDate',
            'Actual Close Date',
            'Actual date the deal was closed (won or lost)',
            'date',
            3,
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
         WHERE ID = 'ca0f9f9d-671e-4ade-bbd2-4c01fa2fbe72'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'DealSource')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ca0f9f9d-671e-4ade-bbd2-4c01fa2fbe72',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100011,
            'DealSource',
            'Deal Source',
            'Origin of the deal (Web, Referral, Cold Call, Trade Show, Marketing Campaign, Partner, Direct, Other)',
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
         WHERE ID = '10b9e057-7445-4979-ba9e-fb61ad7160a4'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'Competitor')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '10b9e057-7445-4979-ba9e-fb61ad7160a4',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100012,
            'Competitor',
            'Competitor',
            'Name of competing company or solution being considered',
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
         WHERE ID = 'f3863b68-75cf-4f40-9d4a-ceee52140156'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'LossReason')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f3863b68-75cf-4f40-9d4a-ceee52140156',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100013,
            'LossReason',
            'Loss Reason',
            'Reason for losing the deal if Stage is Closed Lost',
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
         WHERE ID = 'ed36baf5-6d3f-48e4-a8b0-9e6eaca01fbe'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'NextStep')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ed36baf5-6d3f-48e4-a8b0-9e6eaca01fbe',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100014,
            'NextStep',
            'Next Step',
            'Description of the next action to be taken for this deal',
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
         WHERE ID = '14391b8f-8884-445f-a3aa-9709d0ca0512'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '14391b8f-8884-445f-a3aa-9709d0ca0512',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100015,
            'Description',
            'Description',
            'Detailed description of the deal, requirements, and notes',
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
         WHERE ID = 'e76ec39d-1c72-41ce-8135-3a3a8e18a94f'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'OwnerID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e76ec39d-1c72-41ce-8135-3a3a8e18a94f',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100016,
            'OwnerID',
            'Owner ID',
            'Sales representative or owner responsible for this deal',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            '150A943C-7323-4B22-B609-3F852DB5F784',
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
         WHERE ID = '954c5eae-6c73-459d-9016-37e33b04c576'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '954c5eae-6c73-459d-9016-37e33b04c576',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
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
         WHERE ID = '9987e000-8263-4a1b-a4a8-744f839dab40'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9987e000-8263-4a1b-a4a8-744f839dab40',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
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
         WHERE ID = 'f0bbe5dc-f56a-4b3b-81e9-de9cfa17774d'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f0bbe5dc-f56a-4b3b-81e9-de9cfa17774d',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '81346037-615b-4aa6-b8b9-5a0518f288eb'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '81346037-615b-4aa6-b8b9-5a0518f288eb',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
            100002,
            'Name',
            'Name',
            'Name of the relationship type (e.g., Parent, Child, Spouse)',
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
         WHERE ID = '993d8141-76e1-4609-9f08-c843530a9e18'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = 'IsBidirectional')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '993d8141-76e1-4609-9f08-c843530a9e18',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
            100003,
            'IsBidirectional',
            'Is Bidirectional',
            'Indicates if the relationship is the same in both directions (e.g., Spouse, Friend)',
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
         WHERE ID = 'bc399c8b-a7fc-4475-9875-88f6cd560320'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = 'InverseRelationshipID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bc399c8b-a7fc-4475-9875-88f6cd560320',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
            100004,
            'InverseRelationshipID',
            'Inverse Relationship ID',
            'ID of the inverse relationship type (e.g., Parent → Child)',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            '8CC17F62-138B-48E4-8167-D2681D5F65AC',
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
         WHERE ID = '5d9adea9-9f46-42ad-9cd8-a80db3d4ba8f'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5d9adea9-9f46-42ad-9cd8-a80db3d4ba8f',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
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
         WHERE ID = '8de64c12-3e6d-4553-90da-ae997368ca5f'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8de64c12-3e6d-4553-90da-ae997368ca5f',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
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
         WHERE ID = '2105655e-ba62-4c58-beae-f9424ca42769'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2105655e-ba62-4c58-beae-f9424ca42769',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100001,
            'ID',
            'ID',
            'Unique identifier for the notification',
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
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '689b9c74-0c74-4d73-bad0-0fe21e23ef1d'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'SubmissionID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '689b9c74-0c74-4d73-bad0-0fe21e23ef1d',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100002,
            'SubmissionID',
            'Submission ID',
            'Submission this notification is about',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982',
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
         WHERE ID = 'd0d93929-4ea7-41db-a607-eb763c66123b'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'NotificationType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd0d93929-4ea7-41db-a607-eb763c66123b',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100003,
            'NotificationType',
            'Notification Type',
            'Type of notification (Initial Received, Failed Screening, Passed to Review, Request Resubmission, Accepted, Rejected, Waitlisted, Reminder)',
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
         WHERE ID = '5cb50384-27b7-4263-ae18-b2865e1c3d04'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'SentAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5cb50384-27b7-4263-ae18-b2865e1c3d04',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100004,
            'SentAt',
            'Sent At',
            'Timestamp when notification was sent',
            'datetime',
            8,
            23,
            3,
            0,
            'getdate()',
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
         WHERE ID = '6f8c0b3d-4cc5-4392-ad32-fe755ce542d9'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'RecipientEmail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f8c0b3d-4cc5-4392-ad32-fe755ce542d9',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100005,
            'RecipientEmail',
            'Recipient Email',
            'Email address of recipient',
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
         WHERE ID = '7ff4454f-d5da-4f78-8f55-c2deac5e8b4c'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'Subject')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7ff4454f-d5da-4f78-8f55-c2deac5e8b4c',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100006,
            'Subject',
            'Subject',
            'Email subject line',
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
         WHERE ID = 'cb926455-9cf3-468a-8d05-f8a2843a7d05'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'MessageBody')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cb926455-9cf3-468a-8d05-f8a2843a7d05',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100007,
            'MessageBody',
            'Message Body',
            'Full email message body',
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
         WHERE ID = '66107e71-e6b3-4f57-829b-bbbf755ca5f2'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'DeliveryStatus')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '66107e71-e6b3-4f57-829b-bbbf755ca5f2',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100008,
            'DeliveryStatus',
            'Delivery Status',
            'Delivery status from email system (Pending, Sent, Delivered, Bounced, Failed)',
            'nvarchar',
            100,
            0,
            0,
            1,
            'Pending',
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
         WHERE ID = '31802bb8-4a0c-472f-bb68-f1f910173d6e'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = 'ClickedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '31802bb8-4a0c-472f-bb68-f1f910173d6e',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100009,
            'ClickedAt',
            'Clicked At',
            'Timestamp when recipient clicked a link in the email (for engagement tracking)',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = '3a59470a-ebd8-458b-b19f-5ab570e64120'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3a59470a-ebd8-458b-b19f-5ab570e64120',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100010,
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
         WHERE ID = 'ee095e22-15f0-424d-9e49-6cbdf7440c92'  OR 
               (EntityID = '78188C48-2E2C-4674-AB78-D6639350C388' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ee095e22-15f0-424d-9e49-6cbdf7440c92',
            '78188C48-2E2C-4674-AB78-D6639350C388', -- Entity: Submission Notifications
            100011,
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
         WHERE ID = '8a0e3c23-d11f-4023-8597-87470a99796f'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8a0e3c23-d11f-4023-8597-87470a99796f',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100001,
            'ID',
            'ID',
            'Unique identifier for the submission',
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
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2afaf9c2-3647-4289-8f45-0e7a67284f29'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'EventID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2afaf9c2-3647-4289-8f45-0e7a67284f29',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100002,
            'EventID',
            'Event ID',
            'Event this submission is for',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'A0183D9A-B171-4E72-826D-7F86248795F9',
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
         WHERE ID = 'f70a51d8-e3e2-471c-87fa-2a047e02b3ad'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'TypeformResponseID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f70a51d8-e3e2-471c-87fa-2a047e02b3ad',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100003,
            'TypeformResponseID',
            'Typeform Response ID',
            'External response ID from Typeform',
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
         WHERE ID = '75d5c630-4e4d-4b9c-aee1-746119ac9fbc'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'SubmittedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '75d5c630-4e4d-4b9c-aee1-746119ac9fbc',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100004,
            'SubmittedAt',
            'Submitted At',
            'Timestamp when submission was received',
            'datetime',
            8,
            23,
            3,
            0,
            'getdate()',
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
         WHERE ID = '4b7056f8-198b-4948-b067-6493fd0e2c9a'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4b7056f8-198b-4948-b067-6493fd0e2c9a',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100005,
            'Status',
            'Status',
            'Current status in workflow (New, Analyzing, Passed Initial, Failed Initial, Under Review, Accepted, Rejected, Waitlisted, Resubmitted)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'New',
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
         WHERE ID = 'ced09efd-14b4-4420-8936-824710e7bde3'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'SubmissionTitle')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ced09efd-14b4-4420-8936-824710e7bde3',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100006,
            'SubmissionTitle',
            'Submission Title',
            'Title of the proposed session or talk',
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
         WHERE ID = '3fff9340-cf96-40c3-b86e-6ade872e281c'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'SubmissionAbstract')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3fff9340-cf96-40c3-b86e-6ade872e281c',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100007,
            'SubmissionAbstract',
            'Submission Abstract',
            'Full abstract or proposal text as submitted',
            'nvarchar',
            -1,
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
         WHERE ID = 'a7042366-fd31-47fb-bd76-c710ca9e2762'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'SubmissionSummary')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a7042366-fd31-47fb-bd76-c710ca9e2762',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100008,
            'SubmissionSummary',
            'Submission Summary',
            'AI-generated concise summary of the abstract',
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
         WHERE ID = '21c7cc22-b18e-48c1-82d5-3f5da9225a13'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'SessionFormat')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '21c7cc22-b18e-48c1-82d5-3f5da9225a13',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100009,
            'SessionFormat',
            'Session Format',
            'Format of the proposed session (Workshop, Keynote, Panel, Lightning Talk, Tutorial, Presentation, Roundtable, Other)',
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
         WHERE ID = 'f4c42a42-45ff-4bf4-a396-eeac5641c7c7'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'Duration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f4c42a42-45ff-4bf4-a396-eeac5641c7c7',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100010,
            'Duration',
            'Duration',
            'Duration in minutes',
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
         WHERE ID = '6e6d67d9-5085-41e5-8bbd-4427ac8133f2'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'TargetAudienceLevel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e6d67d9-5085-41e5-8bbd-4427ac8133f2',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100011,
            'TargetAudienceLevel',
            'Target Audience Level',
            'Target audience expertise level (Beginner, Intermediate, Advanced, All Levels)',
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
         WHERE ID = '9fd9e320-7150-4493-b11f-03a53bb1bf48'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'KeyTopics')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9fd9e320-7150-4493-b11f-03a53bb1bf48',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100012,
            'KeyTopics',
            'Key Topics',
            'JSON array of key topics extracted by AI',
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
         WHERE ID = '42e6e120-cb1c-44b5-bc04-bdf47e33d77f'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'PresentationFileURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '42e6e120-cb1c-44b5-bc04-bdf47e33d77f',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100013,
            'PresentationFileURL',
            'Presentation File URL',
            'URL to presentation file in Box.com',
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
         WHERE ID = 'aaac38c4-ae67-4c10-b7ab-bf5b2e6e175b'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'PresentationFileSummary')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aaac38c4-ae67-4c10-b7ab-bf5b2e6e175b',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100014,
            'PresentationFileSummary',
            'Presentation File Summary',
            'AI-generated summary of presentation slides/materials',
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
         WHERE ID = '6db156f2-1723-47bd-9805-27bb8648b476'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'AdditionalMaterialsURLs')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6db156f2-1723-47bd-9805-27bb8648b476',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100015,
            'AdditionalMaterialsURLs',
            'Additional Materials UR Ls',
            'JSON array of additional material URLs',
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
         WHERE ID = '616309d0-4362-429d-84b6-a1849d24d775'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'SpecialRequirements')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '616309d0-4362-429d-84b6-a1849d24d775',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100016,
            'SpecialRequirements',
            'Special Requirements',
            'Any special requirements (AV equipment, accessibility needs, etc.)',
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
         WHERE ID = '7c811a62-c643-4879-8887-a36cedb4e223'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'AIEvaluationScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c811a62-c643-4879-8887-a36cedb4e223',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100017,
            'AIEvaluationScore',
            'AI Evaluation Score',
            'Overall AI evaluation score (0-100)',
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
         WHERE ID = '319e3407-1bef-4faa-b677-6332c2ca2664'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'AIEvaluationReasoning')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '319e3407-1bef-4faa-b677-6332c2ca2664',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100018,
            'AIEvaluationReasoning',
            'AI Evaluation Reasoning',
            'Detailed AI explanation of evaluation and score',
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
         WHERE ID = '3f819344-a76c-49b1-8095-d80c9fca1a3c'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'AIEvaluationDimensions')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3f819344-a76c-49b1-8095-d80c9fca1a3c',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100019,
            'AIEvaluationDimensions',
            'AI Evaluation Dimensions',
            'JSON object with scores per rubric dimension (relevance, quality, experience, etc.)',
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
         WHERE ID = '33217bdc-100e-4b4a-a915-663573c74acf'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'PassedInitialScreening')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '33217bdc-100e-4b4a-a915-663573c74acf',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100020,
            'PassedInitialScreening',
            'Passed Initial Screening',
            'Whether submission passed baseline screening criteria',
            'bit',
            1,
            1,
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
         WHERE ID = '0631ec1a-e947-49ee-8cdf-199a51bbea9a'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'FailureReasons')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0631ec1a-e947-49ee-8cdf-199a51bbea9a',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100021,
            'FailureReasons',
            'Failure Reasons',
            'JSON array of specific failure reasons if screening failed',
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
         WHERE ID = '619cfc80-bae0-45c4-b92c-16095aed3d2b'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'IsFixable')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '619cfc80-bae0-45c4-b92c-16095aed3d2b',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100022,
            'IsFixable',
            'Is Fixable',
            'Whether identified issues can be fixed via resubmission',
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
         WHERE ID = 'bba0181d-12e2-4bfa-9360-c506f2c834af'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'ResubmissionOfID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bba0181d-12e2-4bfa-9360-c506f2c834af',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100023,
            'ResubmissionOfID',
            'Resubmission Of ID',
            'Reference to original submission if this is a resubmission',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982',
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
         WHERE ID = 'd3da41cb-e706-4033-9f1a-074358863bfe'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'ReviewNotes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd3da41cb-e706-4033-9f1a-074358863bfe',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100024,
            'ReviewNotes',
            'Review Notes',
            'Notes added by human reviewers during evaluation',
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
         WHERE ID = 'af82f328-5c21-4b04-a0c1-c6cf902df093'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'FinalDecision')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'af82f328-5c21-4b04-a0c1-c6cf902df093',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100025,
            'FinalDecision',
            'Final Decision',
            'Final decision on submission (Accepted, Rejected, Waitlisted)',
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
         WHERE ID = 'b18663a0-9b4f-4c89-b434-eef3344f20aa'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'FinalDecisionDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b18663a0-9b4f-4c89-b434-eef3344f20aa',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100026,
            'FinalDecisionDate',
            'Final Decision Date',
            'Date when final decision was made',
            'datetime',
            8,
            23,
            3,
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
         WHERE ID = 'c4ee0cc4-011f-47d5-bbc0-a5e97aa20d12'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'FinalDecisionReasoning')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c4ee0cc4-011f-47d5-bbc0-a5e97aa20d12',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100027,
            'FinalDecisionReasoning',
            'Final Decision Reasoning',
            'Explanation for final decision',
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
         WHERE ID = '74ec1434-a45f-4d94-a435-80c2e1789e71'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '74ec1434-a45f-4d94-a435-80c2e1789e71',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100028,
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
         WHERE ID = '366dc01e-6830-4ff7-99b4-94ef9657e509'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '366dc01e-6830-4ff7-99b4-94ef9657e509',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100029,
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
         WHERE ID = '1172fc2b-1143-487e-8118-82b95fc6d226'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1172fc2b-1143-487e-8118-82b95fc6d226',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '69962068-87aa-4092-b45d-60fda2783f7a'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'InvoiceID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '69962068-87aa-4092-b45d-60fda2783f7a',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100002,
            'InvoiceID',
            'Invoice ID',
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
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367',
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
         WHERE ID = '9009702f-cebe-4815-9017-becafae8df7d'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'ProductID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9009702f-cebe-4815-9017-becafae8df7d',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100003,
            'ProductID',
            'Product ID',
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
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626',
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
         WHERE ID = '90eaeafa-d489-48f6-9417-414ec235f616'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '90eaeafa-d489-48f6-9417-414ec235f616',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100004,
            'Description',
            'Description',
            'Description of the product or service being invoiced',
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
         WHERE ID = '64a8feae-6e3c-47f9-8fe7-070dc888b50f'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'Quantity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64a8feae-6e3c-47f9-8fe7-070dc888b50f',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100005,
            'Quantity',
            'Quantity',
            'Number of units being invoiced',
            'decimal',
            9,
            18,
            4,
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
         WHERE ID = 'ea2436d7-39fe-4b09-bcd1-2e70dd991921'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'UnitPrice')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ea2436d7-39fe-4b09-bcd1-2e70dd991921',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100006,
            'UnitPrice',
            'Unit Price',
            'Price per unit for this line item',
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
         WHERE ID = '5736b89e-0eb9-440e-9251-e820257de734'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'Discount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5736b89e-0eb9-440e-9251-e820257de734',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100007,
            'Discount',
            'Discount',
            'Discount percentage applied to this line item (0-100)',
            'decimal',
            5,
            5,
            2,
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
         WHERE ID = 'd4d7557e-22b3-4069-a34f-4344fde0a5e3'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'TotalPrice')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd4d7557e-22b3-4069-a34f-4344fde0a5e3',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100008,
            'TotalPrice',
            'Total Price',
            'Calculated field: Quantity × UnitPrice × (1 - Discount percentage)',
            'numeric',
            17,
            38,
            6,
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
         WHERE ID = '6cf31a6b-e947-46f4-8310-a82b1134835f'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6cf31a6b-e947-46f4-8310-a82b1134835f',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
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
         WHERE ID = '7e4bd8b0-e4b1-4343-aebd-9af810377a82'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7e4bd8b0-e4b1-4343-aebd-9af810377a82',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
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
         WHERE ID = 'a5f065af-a724-4a05-be9d-b6d0ed43a66d'  OR 
               (EntityID = 'C030C99D-0995-4C08-9F67-EB8F8D3DC48F' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a5f065af-a724-4a05-be9d-b6d0ed43a66d',
            'C030C99D-0995-4C08-9F67-EB8F8D3DC48F', -- Entity: Account Types
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1edfb710-0ede-4850-a5e1-a160815276d5'  OR 
               (EntityID = 'C030C99D-0995-4C08-9F67-EB8F8D3DC48F' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1edfb710-0ede-4850-a5e1-a160815276d5',
            'C030C99D-0995-4C08-9F67-EB8F8D3DC48F', -- Entity: Account Types
            100002,
            'Name',
            'Name',
            'Name of the account type',
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
         WHERE ID = '7602cb1c-feae-4807-8dda-639aaf9de3fb'  OR 
               (EntityID = 'C030C99D-0995-4C08-9F67-EB8F8D3DC48F' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7602cb1c-feae-4807-8dda-639aaf9de3fb',
            'C030C99D-0995-4C08-9F67-EB8F8D3DC48F', -- Entity: Account Types
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
         WHERE ID = 'af65cd98-680c-428b-b5b2-0fce237afc94'  OR 
               (EntityID = 'C030C99D-0995-4C08-9F67-EB8F8D3DC48F' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'af65cd98-680c-428b-b5b2-0fce237afc94',
            'C030C99D-0995-4C08-9F67-EB8F8D3DC48F', -- Entity: Account Types
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
         WHERE ID = 'be7dd106-fec3-47e0-9441-e3ec95e930c6'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'be7dd106-fec3-47e0-9441-e3ec95e930c6',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            'null',
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '293e5dc7-d2c5-4d7c-8ed2-7d2f7ece34e0'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'ProductCode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '293e5dc7-d2c5-4d7c-8ed2-7d2f7ece34e0',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100002,
            'ProductCode',
            'Product Code',
            'Unique identifier code for the product, used in external systems and reports',
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
         WHERE ID = '57f9dea9-81d3-4a5c-b297-d815e5f757a9'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '57f9dea9-81d3-4a5c-b297-d815e5f757a9',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100003,
            'Name',
            'Name',
            'Display name of the product or service',
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
         WHERE ID = 'f9785def-8dab-49d9-9e22-591441c38dfa'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f9785def-8dab-49d9-9e22-591441c38dfa',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100004,
            'Category',
            'Category',
            'Product category for grouping and analysis (e.g., Advertising, Sponsorship, Events, Publications)',
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
         WHERE ID = '10f27a50-078d-4543-8564-1cc40ef14e33'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '10f27a50-078d-4543-8564-1cc40ef14e33',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100005,
            'Description',
            'Description',
            'Detailed description of the product features and benefits',
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
         WHERE ID = '26488d75-c8d5-4c6a-b924-44eb772e91ce'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'UnitPrice')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '26488d75-c8d5-4c6a-b924-44eb772e91ce',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100006,
            'UnitPrice',
            'Unit Price',
            'Standard selling price per unit in local currency',
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
         WHERE ID = 'b1cbceed-a15a-4916-9afb-5df79738e5c0'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'Cost')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b1cbceed-a15a-4916-9afb-5df79738e5c0',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100007,
            'Cost',
            'Cost',
            'Internal cost per unit for margin calculations',
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
         WHERE ID = 'e6e019dc-366f-469c-a2c7-510a8bcef5f2'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e6e019dc-366f-469c-a2c7-510a8bcef5f2',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100008,
            'IsActive',
            'Is Active',
            'Indicates if the product is currently available for sale',
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
         WHERE ID = '5924a72a-6fd4-457f-b5cd-775489458b90'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'SKU')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5924a72a-6fd4-457f-b5cd-775489458b90',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100009,
            'SKU',
            'SKU',
            'Stock Keeping Unit identifier for inventory tracking',
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
         WHERE ID = '34780fa9-5882-4660-8af4-2587d91cc19e'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'UnitOfMeasure')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '34780fa9-5882-4660-8af4-2587d91cc19e',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100010,
            'UnitOfMeasure',
            'Unit Of Measure',
            'How the product is measured and sold (Each, Hour, License, Subscription, User, GB, Unit)',
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
         WHERE ID = 'e592b4f9-108e-4357-a0b4-1dee9f969ab5'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = 'RecurringBillingPeriod')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e592b4f9-108e-4357-a0b4-1dee9f969ab5',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
            100011,
            'RecurringBillingPeriod',
            'Recurring Billing Period',
            'Billing frequency for subscription products (NULL for one-time, Monthly, Quarterly, Annual, Biannual)',
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
         WHERE ID = 'a88d508c-0837-492f-86c3-48b20657cbe7'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a88d508c-0837-492f-86c3-48b20657cbe7',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
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
         WHERE ID = 'a5bc2ef9-c360-491a-989f-c033e58e9e11'  OR 
               (EntityID = 'C32FA2FA-D2E4-4685-9AFD-F640630E8626' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a5bc2ef9-c360-491a-989f-c033e58e9e11',
            'C32FA2FA-D2E4-4685-9AFD-F640630E8626', -- Entity: Products
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

/* SQL text to insert entity field value with ID 2003b1d5-36fa-4b5f-a6bd-3bb5eef43cdd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2003b1d5-36fa-4b5f-a6bd-3bb5eef43cdd', '1EDFB710-0EDE-4850-A5E1-A160815276D5', 1, 'Competitor', 'Competitor')

/* SQL text to insert entity field value with ID 2e54da4e-b931-489a-8d5f-69578a4e55db */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2e54da4e-b931-489a-8d5f-69578a4e55db', '1EDFB710-0EDE-4850-A5E1-A160815276D5', 2, 'Customer', 'Customer')

/* SQL text to insert entity field value with ID ba7d487f-e622-4a8c-be3e-3bef51171999 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ba7d487f-e622-4a8c-be3e-3bef51171999', '1EDFB710-0EDE-4850-A5E1-A160815276D5', 3, 'Other', 'Other')

/* SQL text to insert entity field value with ID a6ab6ffd-1bc0-43a8-bd25-6639e2cca4d8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a6ab6ffd-1bc0-43a8-bd25-6639e2cca4d8', '1EDFB710-0EDE-4850-A5E1-A160815276D5', 4, 'Partner', 'Partner')

/* SQL text to insert entity field value with ID c6c5da9c-8cfb-4b44-9b67-59b7b1f795fb */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c6c5da9c-8cfb-4b44-9b67-59b7b1f795fb', '1EDFB710-0EDE-4850-A5E1-A160815276D5', 5, 'Prospect', 'Prospect')

/* SQL text to insert entity field value with ID 916ee684-5ab5-46f2-ac1a-0e0db04e4a4b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('916ee684-5ab5-46f2-ac1a-0e0db04e4a4b', '1EDFB710-0EDE-4850-A5E1-A160815276D5', 6, 'Vendor', 'Vendor')

/* SQL text to update ValueListType for entity field ID 1EDFB710-0EDE-4850-A5E1-A160815276D5 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1EDFB710-0EDE-4850-A5E1-A160815276D5'

/* SQL text to insert entity field value with ID 98d7531e-1f60-4089-9f30-0250bb65190b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('98d7531e-1f60-4089-9f30-0250bb65190b', 'C2051022-986F-489A-85FE-E98384F88491', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 9e0af37e-efbb-4ec4-a13a-354ab542d1c7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9e0af37e-efbb-4ec4-a13a-354ab542d1c7', 'C2051022-986F-489A-85FE-E98384F88491', 2, 'Closed', 'Closed')

/* SQL text to insert entity field value with ID c6ca45a2-8e3b-40e6-ad7b-6be48e402bad */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c6ca45a2-8e3b-40e6-ad7b-6be48e402bad', 'C2051022-986F-489A-85FE-E98384F88491', 3, 'Inactive', 'Inactive')

/* SQL text to insert entity field value with ID 2300bcf7-1987-4078-b11f-82e5ff5628cc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2300bcf7-1987-4078-b11f-82e5ff5628cc', 'C2051022-986F-489A-85FE-E98384F88491', 4, 'On Hold', 'On Hold')

/* SQL text to update ValueListType for entity field ID C2051022-986F-489A-85FE-E98384F88491 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C2051022-986F-489A-85FE-E98384F88491'

/* SQL text to insert entity field value with ID 3b039de7-4170-4c1a-bcda-16c07b04724e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3b039de7-4170-4c1a-bcda-16c07b04724e', 'C9ECB4A9-6361-4B34-B559-B15337603954', 1, 'Call', 'Call')

/* SQL text to insert entity field value with ID 712380ed-2744-4f0d-b3d2-70cfdc709df4 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('712380ed-2744-4f0d-b3d2-70cfdc709df4', 'C9ECB4A9-6361-4B34-B559-B15337603954', 2, 'Demo', 'Demo')

/* SQL text to insert entity field value with ID 8bd21d63-d53f-475a-bcf4-da69e3e308e9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8bd21d63-d53f-475a-bcf4-da69e3e308e9', 'C9ECB4A9-6361-4B34-B559-B15337603954', 3, 'Email', 'Email')

/* SQL text to insert entity field value with ID 218b1a7f-4a66-41a4-8f5d-9858f8dd4d9f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('218b1a7f-4a66-41a4-8f5d-9858f8dd4d9f', 'C9ECB4A9-6361-4B34-B559-B15337603954', 4, 'Meeting', 'Meeting')

/* SQL text to insert entity field value with ID 0eade95c-71dd-45c0-812e-8ec17fb5aab0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0eade95c-71dd-45c0-812e-8ec17fb5aab0', 'C9ECB4A9-6361-4B34-B559-B15337603954', 5, 'Note', 'Note')

/* SQL text to insert entity field value with ID 77527889-fbca-4561-8095-6c2a4f23ddec */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('77527889-fbca-4561-8095-6c2a4f23ddec', 'C9ECB4A9-6361-4B34-B559-B15337603954', 6, 'Other', 'Other')

/* SQL text to insert entity field value with ID 5f2880bb-7f8d-4f08-ba9c-f4203977ce25 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5f2880bb-7f8d-4f08-ba9c-f4203977ce25', 'C9ECB4A9-6361-4B34-B559-B15337603954', 7, 'Site Visit', 'Site Visit')

/* SQL text to insert entity field value with ID 2f846ca2-7704-4a23-ae43-c9af1c1b0195 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2f846ca2-7704-4a23-ae43-c9af1c1b0195', 'C9ECB4A9-6361-4B34-B559-B15337603954', 8, 'Task', 'Task')

/* SQL text to update ValueListType for entity field ID C9ECB4A9-6361-4B34-B559-B15337603954 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C9ECB4A9-6361-4B34-B559-B15337603954'

/* SQL text to insert entity field value with ID e00788fc-5ae8-44b4-9387-bbc4b711b3c8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e00788fc-5ae8-44b4-9387-bbc4b711b3c8', '34780FA9-5882-4660-8AF4-2587D91CC19E', 1, 'Each', 'Each')

/* SQL text to insert entity field value with ID 5875e8e9-a345-4c7f-8d87-ccc04e018c45 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5875e8e9-a345-4c7f-8d87-ccc04e018c45', '34780FA9-5882-4660-8AF4-2587D91CC19E', 2, 'GB', 'GB')

/* SQL text to insert entity field value with ID 318e1e48-8a66-4880-91c2-0832aec1c4e2 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('318e1e48-8a66-4880-91c2-0832aec1c4e2', '34780FA9-5882-4660-8AF4-2587D91CC19E', 3, 'Hour', 'Hour')

/* SQL text to insert entity field value with ID d30e312f-e298-49f6-b850-f3b1bf6336a1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d30e312f-e298-49f6-b850-f3b1bf6336a1', '34780FA9-5882-4660-8AF4-2587D91CC19E', 4, 'License', 'License')

/* SQL text to insert entity field value with ID c5efb316-842a-4dc8-b470-b60d86da098f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c5efb316-842a-4dc8-b470-b60d86da098f', '34780FA9-5882-4660-8AF4-2587D91CC19E', 5, 'Subscription', 'Subscription')

/* SQL text to insert entity field value with ID 1dd9ae7f-0e97-4d20-a12b-6d3798a02872 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1dd9ae7f-0e97-4d20-a12b-6d3798a02872', '34780FA9-5882-4660-8AF4-2587D91CC19E', 6, 'Unit', 'Unit')

/* SQL text to insert entity field value with ID 78a456df-5589-4bb6-8409-9d0e3c0ea4b7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('78a456df-5589-4bb6-8409-9d0e3c0ea4b7', '34780FA9-5882-4660-8AF4-2587D91CC19E', 7, 'User', 'User')

/* SQL text to update ValueListType for entity field ID 34780FA9-5882-4660-8AF4-2587D91CC19E */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='34780FA9-5882-4660-8AF4-2587D91CC19E'

/* SQL text to insert entity field value with ID c598500e-bc00-452f-9b1e-f766f443db56 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c598500e-bc00-452f-9b1e-f766f443db56', '5228D5A6-91E6-45D2-B002-5EE2B76C5C0B', 1, 'Closed Lost', 'Closed Lost')

/* SQL text to insert entity field value with ID 0bb433ef-ed6a-4c54-85c9-98d25cbac469 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0bb433ef-ed6a-4c54-85c9-98d25cbac469', '5228D5A6-91E6-45D2-B002-5EE2B76C5C0B', 2, 'Closed Won', 'Closed Won')

/* SQL text to insert entity field value with ID 88e4c059-76b0-475b-ac9e-366dfded5760 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('88e4c059-76b0-475b-ac9e-366dfded5760', '5228D5A6-91E6-45D2-B002-5EE2B76C5C0B', 3, 'Negotiation', 'Negotiation')

/* SQL text to insert entity field value with ID 831519be-76b7-40c0-8084-2f6b3a7b39fb */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('831519be-76b7-40c0-8084-2f6b3a7b39fb', '5228D5A6-91E6-45D2-B002-5EE2B76C5C0B', 4, 'Proposal', 'Proposal')

/* SQL text to insert entity field value with ID bfb13023-f06c-49e9-a931-91b011984fb0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bfb13023-f06c-49e9-a931-91b011984fb0', '5228D5A6-91E6-45D2-B002-5EE2B76C5C0B', 5, 'Prospecting', 'Prospecting')

/* SQL text to insert entity field value with ID 37b486ca-808b-4c6e-bcbb-4844265248aa */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('37b486ca-808b-4c6e-bcbb-4844265248aa', '5228D5A6-91E6-45D2-B002-5EE2B76C5C0B', 6, 'Qualification', 'Qualification')

/* SQL text to update ValueListType for entity field ID 5228D5A6-91E6-45D2-B002-5EE2B76C5C0B */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5228D5A6-91E6-45D2-B002-5EE2B76C5C0B'

/* SQL text to insert entity field value with ID 1cda51cb-4fc1-4794-8978-8c74c1ca0db5 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1cda51cb-4fc1-4794-8978-8c74c1ca0db5', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 1, 'Cold Call', 'Cold Call')

/* SQL text to insert entity field value with ID e9290c94-971e-4f19-81cc-3e553a48bf77 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e9290c94-971e-4f19-81cc-3e553a48bf77', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 2, 'Direct', 'Direct')

/* SQL text to insert entity field value with ID 5e5e4f0d-04eb-4b92-9163-4fff47869586 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5e5e4f0d-04eb-4b92-9163-4fff47869586', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 3, 'Marketing Campaign', 'Marketing Campaign')

/* SQL text to insert entity field value with ID e338d4ab-fff7-4f8e-901b-5f34da3a3128 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e338d4ab-fff7-4f8e-901b-5f34da3a3128', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 4, 'Other', 'Other')

/* SQL text to insert entity field value with ID 4e8a8303-c0de-40b8-89e8-124bf38cc728 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4e8a8303-c0de-40b8-89e8-124bf38cc728', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 5, 'Partner', 'Partner')

/* SQL text to insert entity field value with ID ea57f17f-9b63-466f-8cfa-7fcd4afee7e6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ea57f17f-9b63-466f-8cfa-7fcd4afee7e6', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 6, 'Referral', 'Referral')

/* SQL text to insert entity field value with ID 0585d4c6-5c8f-4c6d-a25e-9713ec644b56 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0585d4c6-5c8f-4c6d-a25e-9713ec644b56', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 7, 'Trade Show', 'Trade Show')

/* SQL text to insert entity field value with ID f9452c1b-4891-4393-a948-0db6e9758172 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f9452c1b-4891-4393-a948-0db6e9758172', 'CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72', 8, 'Web', 'Web')

/* SQL text to update ValueListType for entity field ID CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='CA0F9F9D-671E-4ADE-BBD2-4C01FA2FBE72'

/* SQL text to insert entity field value with ID e2e336a0-c6f7-458c-aacd-2ab55fd1d3bd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e2e336a0-c6f7-458c-aacd-2ab55fd1d3bd', '006CA7D1-D4B9-4212-A964-4C5298004B06', 1, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field value with ID 79468f51-5907-4d3f-a655-29681850c88d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('79468f51-5907-4d3f-a655-29681850c88d', '006CA7D1-D4B9-4212-A964-4C5298004B06', 2, 'Draft', 'Draft')

/* SQL text to insert entity field value with ID c951df2e-dafc-4380-8359-dd19a8b4fdec */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c951df2e-dafc-4380-8359-dd19a8b4fdec', '006CA7D1-D4B9-4212-A964-4C5298004B06', 3, 'Overdue', 'Overdue')

/* SQL text to insert entity field value with ID a8e23637-cd51-46b9-aef5-f644aa0d11cc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a8e23637-cd51-46b9-aef5-f644aa0d11cc', '006CA7D1-D4B9-4212-A964-4C5298004B06', 4, 'Paid', 'Paid')

/* SQL text to insert entity field value with ID 27c1d750-66a8-43f3-988d-e92baf0a7236 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('27c1d750-66a8-43f3-988d-e92baf0a7236', '006CA7D1-D4B9-4212-A964-4C5298004B06', 5, 'Partial', 'Partial')

/* SQL text to insert entity field value with ID 98718935-89aa-4ae6-8451-d93b74ffbb4d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('98718935-89aa-4ae6-8451-d93b74ffbb4d', '006CA7D1-D4B9-4212-A964-4C5298004B06', 6, 'Sent', 'Sent')

/* SQL text to update ValueListType for entity field ID 006CA7D1-D4B9-4212-A964-4C5298004B06 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='006CA7D1-D4B9-4212-A964-4C5298004B06'

/* SQL text to insert entity field value with ID d30e4efc-f074-4299-91bb-676883d23b6a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d30e4efc-f074-4299-91bb-676883d23b6a', '4A745C62-FE2D-458E-A246-5577408C9908', 1, 'ACH', 'ACH')

/* SQL text to insert entity field value with ID 8e41462f-a18e-4250-9e2b-61749cd9be20 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8e41462f-a18e-4250-9e2b-61749cd9be20', '4A745C62-FE2D-458E-A246-5577408C9908', 2, 'Cash', 'Cash')

/* SQL text to insert entity field value with ID 77a0f3ac-1a80-411c-bf70-12de44b1d366 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('77a0f3ac-1a80-411c-bf70-12de44b1d366', '4A745C62-FE2D-458E-A246-5577408C9908', 3, 'Check', 'Check')

/* SQL text to insert entity field value with ID d022f652-52b6-4dcd-88d1-8c03550b89e3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d022f652-52b6-4dcd-88d1-8c03550b89e3', '4A745C62-FE2D-458E-A246-5577408C9908', 4, 'Credit Card', 'Credit Card')

/* SQL text to insert entity field value with ID 3d3317b2-de57-4ca1-b234-43e13bbf9075 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3d3317b2-de57-4ca1-b234-43e13bbf9075', '4A745C62-FE2D-458E-A246-5577408C9908', 5, 'Other', 'Other')

/* SQL text to insert entity field value with ID e38abff0-f247-44f6-a8bc-7b434460350e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e38abff0-f247-44f6-a8bc-7b434460350e', '4A745C62-FE2D-458E-A246-5577408C9908', 6, 'Wire Transfer', 'Wire Transfer')

/* SQL text to update ValueListType for entity field ID 4A745C62-FE2D-458E-A246-5577408C9908 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='4A745C62-FE2D-458E-A246-5577408C9908'

/* SQL text to insert entity field value with ID 4f4695aa-9bdb-4757-a7dd-11a124141d92 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4f4695aa-9bdb-4757-a7dd-11a124141d92', 'A73DC4F3-BBE1-41B2-86F1-38A215F23776', 1, 'Canceled', 'Canceled')

/* SQL text to insert entity field value with ID 51287250-199e-48b7-9baf-4b8d94075f79 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('51287250-199e-48b7-9baf-4b8d94075f79', 'A73DC4F3-BBE1-41B2-86F1-38A215F23776', 2, 'Closed', 'Closed')

/* SQL text to insert entity field value with ID 60cee124-59bf-478b-9d0f-984cfe1b711f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('60cee124-59bf-478b-9d0f-984cfe1b711f', 'A73DC4F3-BBE1-41B2-86F1-38A215F23776', 3, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID 9e298635-4792-4bcc-a111-a9ae4b007304 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9e298635-4792-4bcc-a111-a9ae4b007304', 'A73DC4F3-BBE1-41B2-86F1-38A215F23776', 4, 'Open for Submissions', 'Open for Submissions')

/* SQL text to insert entity field value with ID 776a940c-7610-4bb5-b10b-1628e58be8f9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('776a940c-7610-4bb5-b10b-1628e58be8f9', 'A73DC4F3-BBE1-41B2-86F1-38A215F23776', 5, 'Planning', 'Planning')

/* SQL text to insert entity field value with ID 1dfbfdc4-fe8f-4f1e-867f-c08e9ce7f245 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1dfbfdc4-fe8f-4f1e-867f-c08e9ce7f245', 'A73DC4F3-BBE1-41B2-86F1-38A215F23776', 6, 'Review', 'Review')

/* SQL text to update ValueListType for entity field ID A73DC4F3-BBE1-41B2-86F1-38A215F23776 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A73DC4F3-BBE1-41B2-86F1-38A215F23776'

/* SQL text to insert entity field value with ID 1ddc7235-f5a2-474f-9b25-f4f3df93593a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1ddc7235-f5a2-474f-9b25-f4f3df93593a', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 1, 'Accepted', 'Accepted')

/* SQL text to insert entity field value with ID f76b5118-e269-47d1-b48e-c035f2ce6c1a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f76b5118-e269-47d1-b48e-c035f2ce6c1a', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 2, 'Analyzing', 'Analyzing')

/* SQL text to insert entity field value with ID 1c6ee612-485c-4219-9f24-dea5d2fb4498 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1c6ee612-485c-4219-9f24-dea5d2fb4498', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 3, 'Failed Initial', 'Failed Initial')

/* SQL text to insert entity field value with ID 0512280a-e22a-4648-94f6-b598ed5e8d4e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0512280a-e22a-4648-94f6-b598ed5e8d4e', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 4, 'New', 'New')

/* SQL text to insert entity field value with ID c412ef0e-37e5-4445-b403-344a169c6f52 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c412ef0e-37e5-4445-b403-344a169c6f52', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 5, 'Passed Initial', 'Passed Initial')

/* SQL text to insert entity field value with ID c20f004a-38f6-4454-b27d-e65a04b95f74 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c20f004a-38f6-4454-b27d-e65a04b95f74', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 6, 'Rejected', 'Rejected')

/* SQL text to insert entity field value with ID 5928337f-5cb0-4066-b123-9953610f10ff */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5928337f-5cb0-4066-b123-9953610f10ff', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 7, 'Resubmitted', 'Resubmitted')

/* SQL text to insert entity field value with ID c4ba1891-1efd-4e99-adf9-57a686ed6323 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c4ba1891-1efd-4e99-adf9-57a686ed6323', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 8, 'Under Review', 'Under Review')

/* SQL text to insert entity field value with ID f396d0b3-242b-4c40-8439-f33d17c40b1f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f396d0b3-242b-4c40-8439-f33d17c40b1f', '4B7056F8-198B-4948-B067-6493FD0E2C9A', 9, 'Waitlisted', 'Waitlisted')

/* SQL text to update ValueListType for entity field ID 4B7056F8-198B-4948-B067-6493FD0E2C9A */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='4B7056F8-198B-4948-B067-6493FD0E2C9A'

/* SQL text to insert entity field value with ID c5c2ede7-e220-4181-a3f2-48fbd419ec59 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c5c2ede7-e220-4181-a3f2-48fbd419ec59', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 1, 'Keynote', 'Keynote')

/* SQL text to insert entity field value with ID 7bf2ad22-4d7e-4835-829b-aa0a1c6e6ec6 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7bf2ad22-4d7e-4835-829b-aa0a1c6e6ec6', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 2, 'Lightning Talk', 'Lightning Talk')

/* SQL text to insert entity field value with ID 66b11965-0c99-42b1-82cf-ceaf8db90720 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('66b11965-0c99-42b1-82cf-ceaf8db90720', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 3, 'Other', 'Other')

/* SQL text to insert entity field value with ID 05d8a388-7da3-4c0f-a38d-274ffe503ca7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('05d8a388-7da3-4c0f-a38d-274ffe503ca7', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 4, 'Panel', 'Panel')

/* SQL text to insert entity field value with ID 62cf3b42-6113-43e6-acec-d3b48e53543c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('62cf3b42-6113-43e6-acec-d3b48e53543c', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 5, 'Presentation', 'Presentation')

/* SQL text to insert entity field value with ID a385c87f-e95e-4c26-b2ba-09d1a7f36773 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a385c87f-e95e-4c26-b2ba-09d1a7f36773', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 6, 'Roundtable', 'Roundtable')

/* SQL text to insert entity field value with ID 8408ef71-e3e2-4efd-bb68-94ea17f3fec8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8408ef71-e3e2-4efd-bb68-94ea17f3fec8', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 7, 'Tutorial', 'Tutorial')

/* SQL text to insert entity field value with ID 48a03c3a-f099-4c89-9eb9-3c1538c223dd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('48a03c3a-f099-4c89-9eb9-3c1538c223dd', '21C7CC22-B18E-48C1-82D5-3F5DA9225A13', 8, 'Workshop', 'Workshop')

/* SQL text to update ValueListType for entity field ID 21C7CC22-B18E-48C1-82D5-3F5DA9225A13 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='21C7CC22-B18E-48C1-82D5-3F5DA9225A13'

/* SQL text to insert entity field value with ID 2ecf3909-090f-4aa1-98e4-d4ab25c16aed */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2ecf3909-090f-4aa1-98e4-d4ab25c16aed', '6E6D67D9-5085-41E5-8BBD-4427AC8133F2', 1, 'Advanced', 'Advanced')

/* SQL text to insert entity field value with ID 4c195768-5d9b-4fb3-81cc-05233a3a6707 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4c195768-5d9b-4fb3-81cc-05233a3a6707', '6E6D67D9-5085-41E5-8BBD-4427AC8133F2', 2, 'All Levels', 'All Levels')

/* SQL text to insert entity field value with ID c2849d79-885c-4224-bfd1-0916ee89e265 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c2849d79-885c-4224-bfd1-0916ee89e265', '6E6D67D9-5085-41E5-8BBD-4427AC8133F2', 3, 'Beginner', 'Beginner')

/* SQL text to insert entity field value with ID bc8bd3ec-9a6c-4b8f-be8a-8428eb1977f4 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bc8bd3ec-9a6c-4b8f-be8a-8428eb1977f4', '6E6D67D9-5085-41E5-8BBD-4427AC8133F2', 4, 'Intermediate', 'Intermediate')

/* SQL text to update ValueListType for entity field ID 6E6D67D9-5085-41E5-8BBD-4427AC8133F2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='6E6D67D9-5085-41E5-8BBD-4427AC8133F2'

/* SQL text to insert entity field value with ID 28db5b7b-9aef-4541-a2fa-90306f81603b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('28db5b7b-9aef-4541-a2fa-90306f81603b', '99D6B34E-CB14-4EC7-8422-DC625062EF75', 1, 'Co-Presenter', 'Co-Presenter')

/* SQL text to insert entity field value with ID e691c81e-a5ab-4704-b895-03d5f1bf6c44 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e691c81e-a5ab-4704-b895-03d5f1bf6c44', '99D6B34E-CB14-4EC7-8422-DC625062EF75', 2, 'Moderator', 'Moderator')

/* SQL text to insert entity field value with ID 8b25dcde-0005-40a1-8d0a-ff9407b3b778 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8b25dcde-0005-40a1-8d0a-ff9407b3b778', '99D6B34E-CB14-4EC7-8422-DC625062EF75', 3, 'Panelist', 'Panelist')

/* SQL text to insert entity field value with ID 2b731c71-83d8-48a1-af31-6127646a531a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2b731c71-83d8-48a1-af31-6127646a531a', '99D6B34E-CB14-4EC7-8422-DC625062EF75', 4, 'Presenter', 'Presenter')

/* SQL text to update ValueListType for entity field ID 99D6B34E-CB14-4EC7-8422-DC625062EF75 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='99D6B34E-CB14-4EC7-8422-DC625062EF75'

/* SQL text to insert entity field value with ID 894b1b8d-1643-46bc-ac0b-405a06e5c285 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('894b1b8d-1643-46bc-ac0b-405a06e5c285', '57D4943F-69AA-4CD5-B684-7AE026A63529', 1, 'Competitor', 'Competitor')

/* SQL text to insert entity field value with ID 96652c53-b92c-4241-abac-f5306d20d4a0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('96652c53-b92c-4241-abac-f5306d20d4a0', '57D4943F-69AA-4CD5-B684-7AE026A63529', 2, 'Customer', 'Customer')

/* SQL text to insert entity field value with ID a85ccd13-6727-4dbd-a221-c120102fb2b3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a85ccd13-6727-4dbd-a221-c120102fb2b3', '57D4943F-69AA-4CD5-B684-7AE026A63529', 3, 'Other', 'Other')

/* SQL text to insert entity field value with ID b9cc1834-e441-49c1-b8e3-7b43b43a5ff2 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b9cc1834-e441-49c1-b8e3-7b43b43a5ff2', '57D4943F-69AA-4CD5-B684-7AE026A63529', 4, 'Partner', 'Partner')

/* SQL text to insert entity field value with ID 5c0f9d40-154b-49ca-a7c7-3d5d008896ae */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5c0f9d40-154b-49ca-a7c7-3d5d008896ae', '57D4943F-69AA-4CD5-B684-7AE026A63529', 5, 'Prospect', 'Prospect')

/* SQL text to insert entity field value with ID bc94ca9f-9a6c-48ff-8df7-f5dbd8e3db20 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bc94ca9f-9a6c-48ff-8df7-f5dbd8e3db20', '57D4943F-69AA-4CD5-B684-7AE026A63529', 6, 'Vendor', 'Vendor')

/* SQL text to update ValueListType for entity field ID 57D4943F-69AA-4CD5-B684-7AE026A63529 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='57D4943F-69AA-4CD5-B684-7AE026A63529'

/* SQL text to insert entity field value with ID 2b019e89-a3d2-462c-9a89-6c21609a40ca */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2b019e89-a3d2-462c-9a89-6c21609a40ca', 'F8FE6BE7-7EE6-4C7F-9F83-7E09955A62E9', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 662eac41-9023-46ea-8f41-78a2267baddd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('662eac41-9023-46ea-8f41-78a2267baddd', 'F8FE6BE7-7EE6-4C7F-9F83-7E09955A62E9', 2, 'Closed', 'Closed')

/* SQL text to insert entity field value with ID d52f5e08-12a6-4d85-9c81-93c80519fcc9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d52f5e08-12a6-4d85-9c81-93c80519fcc9', 'F8FE6BE7-7EE6-4C7F-9F83-7E09955A62E9', 3, 'Inactive', 'Inactive')

/* SQL text to insert entity field value with ID a3505379-43a0-4da7-b72e-5152f141dc0f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a3505379-43a0-4da7-b72e-5152f141dc0f', 'F8FE6BE7-7EE6-4C7F-9F83-7E09955A62E9', 4, 'On Hold', 'On Hold')

/* SQL text to update ValueListType for entity field ID F8FE6BE7-7EE6-4C7F-9F83-7E09955A62E9 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F8FE6BE7-7EE6-4C7F-9F83-7E09955A62E9'

/* SQL text to insert entity field value with ID 8da23ab2-abde-4683-a8b6-31edb71b76aa */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8da23ab2-abde-4683-a8b6-31edb71b76aa', '78C43520-498F-4AF4-B980-690CE0EBCFE8', 1, 'Accept', 'Accept')

/* SQL text to insert entity field value with ID 9d18524b-6d86-4c58-9e56-38442a5053dc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9d18524b-6d86-4c58-9e56-38442a5053dc', '78C43520-498F-4AF4-B980-690CE0EBCFE8', 2, 'Needs Discussion', 'Needs Discussion')

/* SQL text to insert entity field value with ID ac159f2d-bbbc-4f14-bc92-c5fc6cc36c41 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ac159f2d-bbbc-4f14-bc92-c5fc6cc36c41', '78C43520-498F-4AF4-B980-690CE0EBCFE8', 3, 'Reject', 'Reject')

/* SQL text to insert entity field value with ID f7b12616-735a-42fc-af21-65c74c868b63 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f7b12616-735a-42fc-af21-65c74c868b63', '78C43520-498F-4AF4-B980-690CE0EBCFE8', 4, 'Waitlist', 'Waitlist')

/* SQL text to update ValueListType for entity field ID 78C43520-498F-4AF4-B980-690CE0EBCFE8 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='78C43520-498F-4AF4-B980-690CE0EBCFE8'

/* SQL text to insert entity field value with ID 389b2905-c57b-4f68-a983-cb7cda309d7e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('389b2905-c57b-4f68-a983-cb7cda309d7e', '9283C808-2F35-4CDA-AF90-36114FDEE48F', 1, 'Email', 'Email')

/* SQL text to insert entity field value with ID 12a06977-5d9f-4a36-a300-ed91c42c43cd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('12a06977-5d9f-4a36-a300-ed91c42c43cd', '9283C808-2F35-4CDA-AF90-36114FDEE48F', 2, 'Mail', 'Mail')

/* SQL text to insert entity field value with ID dc172d30-5cad-4665-b1b1-2d8af311c155 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('dc172d30-5cad-4665-b1b1-2d8af311c155', '9283C808-2F35-4CDA-AF90-36114FDEE48F', 3, 'Mobile', 'Mobile')

/* SQL text to insert entity field value with ID 48953a85-510c-4233-8afe-f92b8474734d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('48953a85-510c-4233-8afe-f92b8474734d', '9283C808-2F35-4CDA-AF90-36114FDEE48F', 4, 'None', 'None')

/* SQL text to insert entity field value with ID 7b9f1654-6d5d-47da-adda-bb5d8f58ac00 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7b9f1654-6d5d-47da-adda-bb5d8f58ac00', '9283C808-2F35-4CDA-AF90-36114FDEE48F', 5, 'Phone', 'Phone')

/* SQL text to update ValueListType for entity field ID 9283C808-2F35-4CDA-AF90-36114FDEE48F */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9283C808-2F35-4CDA-AF90-36114FDEE48F'

/* SQL text to insert entity field value with ID cee1689a-44e6-4013-ba88-c3cbae02bbc2 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cee1689a-44e6-4013-ba88-c3cbae02bbc2', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 1, 'Accepted', 'Accepted')

/* SQL text to insert entity field value with ID cd2bdf34-fc55-44ab-858a-c4ff817121e5 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cd2bdf34-fc55-44ab-858a-c4ff817121e5', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 2, 'Failed Screening', 'Failed Screening')

/* SQL text to insert entity field value with ID 569d5e79-8057-4041-a205-15763a2bbd5b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('569d5e79-8057-4041-a205-15763a2bbd5b', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 3, 'Initial Received', 'Initial Received')

/* SQL text to insert entity field value with ID e46952bd-6549-4533-acf4-32129ffd3375 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e46952bd-6549-4533-acf4-32129ffd3375', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 4, 'Passed to Review', 'Passed to Review')

/* SQL text to insert entity field value with ID 1cc44cd1-48e0-4fea-b8b8-ff957d2a8673 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1cc44cd1-48e0-4fea-b8b8-ff957d2a8673', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 5, 'Rejected', 'Rejected')

/* SQL text to insert entity field value with ID cfeb993e-999a-4150-a14a-22406a0f029e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cfeb993e-999a-4150-a14a-22406a0f029e', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 6, 'Reminder', 'Reminder')

/* SQL text to insert entity field value with ID 263b6b46-298d-4c80-9c97-ae4df624bb3b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('263b6b46-298d-4c80-9c97-ae4df624bb3b', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 7, 'Request Resubmission', 'Request Resubmission')

/* SQL text to insert entity field value with ID b027e9d0-79d6-48f5-9967-5d57463c7b98 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b027e9d0-79d6-48f5-9967-5d57463c7b98', 'D0D93929-4EA7-41DB-A607-EB763C66123B', 8, 'Waitlisted', 'Waitlisted')

/* SQL text to update ValueListType for entity field ID D0D93929-4EA7-41DB-A607-EB763C66123B */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D0D93929-4EA7-41DB-A607-EB763C66123B'

/* SQL text to insert entity field value with ID 7d828621-74b2-45ee-86ec-9e1ca4954038 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7d828621-74b2-45ee-86ec-9e1ca4954038', '66107E71-E6B3-4F57-829B-BBBF755CA5F2', 1, 'Bounced', 'Bounced')

/* SQL text to insert entity field value with ID 462d8b86-702a-482c-b302-711fb1874884 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('462d8b86-702a-482c-b302-711fb1874884', '66107E71-E6B3-4F57-829B-BBBF755CA5F2', 2, 'Delivered', 'Delivered')

/* SQL text to insert entity field value with ID bc54129c-05af-433f-aabc-0c2fe927c78a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bc54129c-05af-433f-aabc-0c2fe927c78a', '66107E71-E6B3-4F57-829B-BBBF755CA5F2', 3, 'Failed', 'Failed')

/* SQL text to insert entity field value with ID 15916f38-518d-46c0-ace6-62eb804bb692 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('15916f38-518d-46c0-ace6-62eb804bb692', '66107E71-E6B3-4F57-829B-BBBF755CA5F2', 4, 'Pending', 'Pending')

/* SQL text to insert entity field value with ID 4c9b4e2b-a2de-4978-a042-63364837a9fd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4c9b4e2b-a2de-4978-a042-63364837a9fd', '66107E71-E6B3-4F57-829B-BBBF755CA5F2', 5, 'Sent', 'Sent')

/* SQL text to update ValueListType for entity field ID 66107E71-E6B3-4F57-829B-BBBF755CA5F2 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='66107E71-E6B3-4F57-829B-BBBF755CA5F2'

/* SQL text to insert entity field value with ID ddffde7b-2e8e-4662-978d-34d14f32935f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ddffde7b-2e8e-4662-978d-34d14f32935f', '9230C94B-09CE-402F-B8AD-AEAABED00646', 1, 'Call', 'Call')

/* SQL text to insert entity field value with ID 8e41feb6-0f98-44fb-8e1f-42c76ba72529 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8e41feb6-0f98-44fb-8e1f-42c76ba72529', '9230C94B-09CE-402F-B8AD-AEAABED00646', 2, 'Demo', 'Demo')

/* SQL text to insert entity field value with ID 316bfa66-400a-4d43-9fa5-ca74fbe8bedf */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('316bfa66-400a-4d43-9fa5-ca74fbe8bedf', '9230C94B-09CE-402F-B8AD-AEAABED00646', 3, 'Email', 'Email')

/* SQL text to insert entity field value with ID 9fcb66bf-df57-448c-aea0-03d130195090 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9fcb66bf-df57-448c-aea0-03d130195090', '9230C94B-09CE-402F-B8AD-AEAABED00646', 4, 'Meeting', 'Meeting')

/* SQL text to insert entity field value with ID 4ff56dc0-9f4c-4114-ba51-3e3ad03c0b0c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4ff56dc0-9f4c-4114-ba51-3e3ad03c0b0c', '9230C94B-09CE-402F-B8AD-AEAABED00646', 5, 'Note', 'Note')

/* SQL text to insert entity field value with ID d7137e24-1e66-4ade-835e-98b8cdcd6c08 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d7137e24-1e66-4ade-835e-98b8cdcd6c08', '9230C94B-09CE-402F-B8AD-AEAABED00646', 6, 'Other', 'Other')

/* SQL text to insert entity field value with ID 32e94e8a-9c04-4bc3-afb2-d1859bfb97fc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('32e94e8a-9c04-4bc3-afb2-d1859bfb97fc', '9230C94B-09CE-402F-B8AD-AEAABED00646', 7, 'Site Visit', 'Site Visit')

/* SQL text to insert entity field value with ID e4957d7f-bc31-4a83-ad8d-69c69d46f030 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e4957d7f-bc31-4a83-ad8d-69c69d46f030', '9230C94B-09CE-402F-B8AD-AEAABED00646', 8, 'Task', 'Task')

/* SQL text to update ValueListType for entity field ID 9230C94B-09CE-402F-B8AD-AEAABED00646 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9230C94B-09CE-402F-B8AD-AEAABED00646'

/* SQL text to insert entity field value with ID 5e512b1b-e631-417a-ab09-6e2b0f0470cb */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5e512b1b-e631-417a-ab09-6e2b0f0470cb', '2F9740F5-2C6C-4952-9F70-F4CC0AA8E0EB', 1, 'Canceled', 'Canceled')

/* SQL text to insert entity field value with ID 77a9c73d-efbf-4f6b-af54-5296410e240a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('77a9c73d-efbf-4f6b-af54-5296410e240a', '2F9740F5-2C6C-4952-9F70-F4CC0AA8E0EB', 2, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID 8c86ca5a-7c8f-4865-8f47-dd623339e9e1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8c86ca5a-7c8f-4865-8f47-dd623339e9e1', '2F9740F5-2C6C-4952-9F70-F4CC0AA8E0EB', 3, 'Deferred', 'Deferred')

/* SQL text to insert entity field value with ID ece50cb3-4572-438b-91d6-f51cec63e7aa */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ece50cb3-4572-438b-91d6-f51cec63e7aa', '2F9740F5-2C6C-4952-9F70-F4CC0AA8E0EB', 4, 'In Progress', 'In Progress')

/* SQL text to insert entity field value with ID 33474ba9-d3e5-4fe6-b851-95223df05606 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('33474ba9-d3e5-4fe6-b851-95223df05606', '2F9740F5-2C6C-4952-9F70-F4CC0AA8E0EB', 5, 'Planned', 'Planned')

/* SQL text to update ValueListType for entity field ID 2F9740F5-2C6C-4952-9F70-F4CC0AA8E0EB */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='2F9740F5-2C6C-4952-9F70-F4CC0AA8E0EB'

/* SQL text to insert entity field value with ID c5cd1388-c057-4877-854e-3fcdf715ba38 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c5cd1388-c057-4877-854e-3fcdf715ba38', '11CC9CD8-12A1-4463-A715-976CB1E5FFAE', 1, 'High', 'High')

/* SQL text to insert entity field value with ID 1fa3edcc-75ee-4478-95cb-cd5bf996ec6b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1fa3edcc-75ee-4478-95cb-cd5bf996ec6b', '11CC9CD8-12A1-4463-A715-976CB1E5FFAE', 2, 'Low', 'Low')

/* SQL text to insert entity field value with ID f23a860a-b24a-4627-adb8-27e745b8e0e9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f23a860a-b24a-4627-adb8-27e745b8e0e9', '11CC9CD8-12A1-4463-A715-976CB1E5FFAE', 3, 'Medium', 'Medium')

/* SQL text to update ValueListType for entity field ID 11CC9CD8-12A1-4463-A715-976CB1E5FFAE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='11CC9CD8-12A1-4463-A715-976CB1E5FFAE'

/* SQL text to insert entity field value with ID 2a861a9c-dfaa-484e-9ef9-2fa0fade8100 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2a861a9c-dfaa-484e-9ef9-2fa0fade8100', '85BE8206-93DA-4CE6-ACA8-36A0F59FC570', 1, 'Inbound', 'Inbound')

/* SQL text to insert entity field value with ID e75f0e02-8cb9-4fbe-b920-b3d69b4640b3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e75f0e02-8cb9-4fbe-b920-b3d69b4640b3', '85BE8206-93DA-4CE6-ACA8-36A0F59FC570', 2, 'Internal', 'Internal')

/* SQL text to insert entity field value with ID 618433a2-834a-4d63-8fe4-79a4444dce7a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('618433a2-834a-4d63-8fe4-79a4444dce7a', '85BE8206-93DA-4CE6-ACA8-36A0F59FC570', 3, 'Outbound', 'Outbound')

/* SQL text to update ValueListType for entity field ID 85BE8206-93DA-4CE6-ACA8-36A0F59FC570 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='85BE8206-93DA-4CE6-ACA8-36A0F59FC570'

/* SQL text to insert entity field value with ID 63cb4127-a148-4089-983e-5ab5a3321f8d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('63cb4127-a148-4089-983e-5ab5a3321f8d', '08085AD8-ACBB-4DF5-A3D7-6A3FA7FAE5ED', 1, 'Canceled', 'Canceled')

/* SQL text to insert entity field value with ID d1d35f62-e7f1-47f3-83ae-97116c0c74ee */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d1d35f62-e7f1-47f3-83ae-97116c0c74ee', '08085AD8-ACBB-4DF5-A3D7-6A3FA7FAE5ED', 2, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID c40bf2db-4d38-4d2a-b6ab-23a93b1913fc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c40bf2db-4d38-4d2a-b6ab-23a93b1913fc', '08085AD8-ACBB-4DF5-A3D7-6A3FA7FAE5ED', 3, 'In Progress', 'In Progress')

/* SQL text to insert entity field value with ID efed7e73-b3e9-429c-9788-7322e0243771 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('efed7e73-b3e9-429c-9788-7322e0243771', '08085AD8-ACBB-4DF5-A3D7-6A3FA7FAE5ED', 4, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID 08085AD8-ACBB-4DF5-A3D7-6A3FA7FAE5ED */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='08085AD8-ACBB-4DF5-A3D7-6A3FA7FAE5ED'

/* SQL text to insert entity field value with ID 82fd2ac6-7ffc-4284-9b6b-073a0fd0d317 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('82fd2ac6-7ffc-4284-9b6b-073a0fd0d317', 'D2CECD05-99F5-49CF-B460-375B20008921', 1, 'High', 'High')

/* SQL text to insert entity field value with ID 5df4a5f3-9539-4a97-8c9a-d1efb3b52da0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5df4a5f3-9539-4a97-8c9a-d1efb3b52da0', 'D2CECD05-99F5-49CF-B460-375B20008921', 2, 'Low', 'Low')

/* SQL text to insert entity field value with ID 9dc7a0a0-537d-4907-86cf-76b268f40e22 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9dc7a0a0-537d-4907-86cf-76b268f40e22', 'D2CECD05-99F5-49CF-B460-375B20008921', 3, 'Normal', 'Normal')

/* SQL text to update ValueListType for entity field ID D2CECD05-99F5-49CF-B460-375B20008921 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D2CECD05-99F5-49CF-B460-375B20008921'

/* SQL text to insert entity field value with ID e8b1d704-c59f-415a-a22b-58d357d6b034 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e8b1d704-c59f-415a-a22b-58d357d6b034', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 1, 'Earnings Call', 'Earnings Call')

/* SQL text to insert entity field value with ID dfbcb91c-d50c-4424-81cc-deee02276d35 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('dfbcb91c-d50c-4424-81cc-deee02276d35', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 2, 'Financial Report', 'Financial Report')

/* SQL text to insert entity field value with ID 2920c78f-8a04-4241-87de-9428b14a464e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2920c78f-8a04-4241-87de-9428b14a464e', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 3, 'Leadership Change', 'Leadership Change')

/* SQL text to insert entity field value with ID cb995c1b-700b-49d7-b52d-5f493b7d48cb */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cb995c1b-700b-49d7-b52d-5f493b7d48cb', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 4, 'Manual', 'Manual')

/* SQL text to insert entity field value with ID 27ddee8c-3f6f-44d5-8aca-4ecceba47e84 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('27ddee8c-3f6f-44d5-8aca-4ecceba47e84', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 5, 'Market Analysis', 'Market Analysis')

/* SQL text to insert entity field value with ID b6558fa0-c2c6-4da4-9b27-bac2c5bef787 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b6558fa0-c2c6-4da4-9b27-bac2c5bef787', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 6, 'News Article', 'News Article')

/* SQL text to insert entity field value with ID f42ca4c5-025f-4ce3-b77f-fe588f84134f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f42ca4c5-025f-4ce3-b77f-fe588f84134f', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 7, 'Patent Filing', 'Patent Filing')

/* SQL text to insert entity field value with ID 6761a347-2eea-4264-a383-5819f70d1380 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6761a347-2eea-4264-a383-5819f70d1380', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 8, 'Press Release', 'Press Release')

/* SQL text to insert entity field value with ID 60abd3cc-238f-4edf-b95e-106762a6017d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('60abd3cc-238f-4edf-b95e-106762a6017d', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 9, 'SEC Filing', 'SEC Filing')

/* SQL text to insert entity field value with ID 0adfd27d-64bb-44fb-9e58-71a9158a4a03 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0adfd27d-64bb-44fb-9e58-71a9158a4a03', '9C5F8910-A19B-4A52-9CDA-51629C40038C', 10, 'Social Media', 'Social Media')

/* SQL text to update ValueListType for entity field ID 9C5F8910-A19B-4A52-9CDA-51629C40038C */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9C5F8910-A19B-4A52-9CDA-51629C40038C'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '72e11e16-6f92-4fc8-8762-6524afa6d833'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('72e11e16-6f92-4fc8-8762-6524afa6d833', '150A943C-7323-4B22-B609-3F852DB5F784', '87F25037-7FE9-468D-851E-94F7FD187E8C', 'RelatedContactID', 'One To Many', 1, 1, 'Contact Relationships', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5d23672f-1b4c-493c-b3e7-815a4ef5657a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5d23672f-1b4c-493c-b3e7-815a4ef5657a', '150A943C-7323-4B22-B609-3F852DB5F784', '87F25037-7FE9-468D-851E-94F7FD187E8C', 'PrimaryContactID', 'One To Many', 1, 1, 'Contact Relationships', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9e506461-c9a1-4cfe-8eb6-d11d69f07583'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9e506461-c9a1-4cfe-8eb6-d11d69f07583', '150A943C-7323-4B22-B609-3F852DB5F784', '1AF94BAE-5A2D-4756-BE56-988D263F070E', 'ContactID', 'One To Many', 1, 1, 'Activities', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'efd36139-c5fe-476f-b9e4-fe31eb097e69'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('efd36139-c5fe-476f-b9e4-fe31eb097e69', '150A943C-7323-4B22-B609-3F852DB5F784', '0ADAFF68-56F9-41DA-9572-7E165C682EA7', 'ContactID', 'One To Many', 1, 1, 'Speakers', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd233df4b-e799-4df8-afb9-a4bcf2d5c98f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d233df4b-e799-4df8-afb9-a4bcf2d5c98f', '150A943C-7323-4B22-B609-3F852DB5F784', 'A6A148B1-9084-41F8-B300-72A304341E40', 'CreatedByContactID', 'One To Many', 1, 1, 'Account Insights', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0311c491-1e9a-4dbb-8df1-3809aba5ab21'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0311c491-1e9a-4dbb-8df1-3809aba5ab21', '150A943C-7323-4B22-B609-3F852DB5F784', '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', 'OwnerID', 'One To Many', 1, 1, 'Deals', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ebdcef7f-cd57-4c62-bbcc-90be4f5588bc'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ebdcef7f-cd57-4c62-bbcc-90be4f5588bc', '150A943C-7323-4B22-B609-3F852DB5F784', '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', 'ContactID', 'One To Many', 1, 1, 'Deals', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'fd2c3f3b-282c-427c-a3a0-08fb67be1d02'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('fd2c3f3b-282c-427c-a3a0-08fb67be1d02', '150A943C-7323-4B22-B609-3F852DB5F784', '85B84E83-35A2-4874-B2DE-57195316F966', 'AssignedToContactID', 'One To Many', 1, 1, 'Event Review Tasks', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '3be2a1c8-6360-4373-b616-b89b99d2f3f7'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('3be2a1c8-6360-4373-b616-b89b99d2f3f7', '150A943C-7323-4B22-B609-3F852DB5F784', '150A943C-7323-4B22-B609-3F852DB5F784', 'ReportsToID', 'One To Many', 1, 1, 'Contacts', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4371c981-68ae-4a70-88b2-d85afcb3ba0d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4371c981-68ae-4a70-88b2-d85afcb3ba0d', '150A943C-7323-4B22-B609-3F852DB5F784', 'CF6C33BE-3726-4CB3-8562-1E768E7EA249', 'ReviewerContactID', 'One To Many', 1, 1, 'Submission Reviews', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8e05a290-619f-48de-a98d-9c8f1043d958'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8e05a290-619f-48de-a98d-9c8f1043d958', '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', 'C5EB9416-0F8A-465C-ABB0-70FBB05393AF', 'InvoiceID', 'One To Many', 1, 1, 'Payments', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '43fd0089-e738-4cdc-8ad5-a4be46bc12f8'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('43fd0089-e738-4cdc-8ad5-a4be46bc12f8', '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', '805A851B-17DC-47BD-9097-E68E4061537B', 'InvoiceID', 'One To Many', 1, 1, 'Invoice Line Items', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b00e15a3-7856-41f1-8ae0-45d4c1cb1463'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b00e15a3-7856-41f1-8ae0-45d4c1cb1463', '0ADAFF68-56F9-41DA-9572-7E165C682EA7', 'D15B9246-2192-4CA9-8057-708E997AF565', 'SpeakerID', 'One To Many', 1, 1, 'Submission Speakers', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '88b5e9fa-759a-4689-914d-6bc3af100f9b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('88b5e9fa-759a-4689-914d-6bc3af100f9b', 'A0183D9A-B171-4E72-826D-7F86248795F9', 'A0183D9A-B171-4E72-826D-7F86248795F9', 'ParentID', 'One To Many', 1, 1, 'Events', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '45678303-5503-4c16-b206-8e309a022929'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('45678303-5503-4c16-b206-8e309a022929', 'A0183D9A-B171-4E72-826D-7F86248795F9', 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', 'EventID', 'One To Many', 1, 1, 'Submissions', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '409ab517-77a7-45c4-9662-bf46ed480899'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('409ab517-77a7-45c4-9662-bf46ed480899', 'A0183D9A-B171-4E72-826D-7F86248795F9', '85B84E83-35A2-4874-B2DE-57195316F966', 'EventID', 'One To Many', 1, 1, 'Event Review Tasks', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6d914521-e254-4fe8-8df7-90498f654592'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6d914521-e254-4fe8-8df7-90498f654592', '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', '150A943C-7323-4B22-B609-3F852DB5F784', 'AccountID', 'One To Many', 1, 1, 'Contacts', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '172e1988-7e77-4776-8896-303d6a73ab3c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('172e1988-7e77-4776-8896-303d6a73ab3c', '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', 'AccountID', 'One To Many', 1, 1, 'Deals', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4c4a9e4a-c941-4c26-ad3d-6d2966259d13'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4c4a9e4a-c941-4c26-ad3d-6d2966259d13', '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', 'A6A148B1-9084-41F8-B300-72A304341E40', 'AccountID', 'One To Many', 1, 1, 'Account Insights', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '49d4fadc-b973-4ad0-8e9c-2f7f2f1b4df6'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('49d4fadc-b973-4ad0-8e9c-2f7f2f1b4df6', '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', '1AF94BAE-5A2D-4756-BE56-988D263F070E', 'AccountID', 'One To Many', 1, 1, 'Activities', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd5c9e64d-a3c4-4400-880a-949c66195040'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d5c9e64d-a3c4-4400-880a-949c66195040', '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', 'AccountID', 'One To Many', 1, 1, 'Invoices', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'aaa5f4bf-3ca3-4ab4-991d-ceee1d589203'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('aaa5f4bf-3ca3-4ab4-991d-ceee1d589203', '4785F9CD-21A7-4250-BE9A-91B3F6E55DFF', 'A0183D9A-B171-4E72-826D-7F86248795F9', 'AccountID', 'One To Many', 1, 1, 'Events', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ef470109-1091-483a-8c64-5ef7804fd7c2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ef470109-1091-483a-8c64-5ef7804fd7c2', '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', 'DealID', 'One To Many', 1, 1, 'Invoices', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5ee4e4bb-6a21-44f9-bfd6-c558d5c949f6'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5ee4e4bb-6a21-44f9-bfd6-c558d5c949f6', '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', 'DealID', 'One To Many', 1, 1, 'Deal Products', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1d4f7df2-4a88-49a0-bd2f-952395cc5f9f'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1d4f7df2-4a88-49a0-bd2f-952395cc5f9f', '8CC17F62-138B-48E4-8167-D2681D5F65AC', '8CC17F62-138B-48E4-8167-D2681D5F65AC', 'InverseRelationshipID', 'One To Many', 1, 1, 'Relationship Types', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '37ab1175-4249-4e3a-a503-7161573585b1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('37ab1175-4249-4e3a-a503-7161573585b1', '8CC17F62-138B-48E4-8167-D2681D5F65AC', '87F25037-7FE9-468D-851E-94F7FD187E8C', 'RelationshipTypeID', 'One To Many', 1, 1, 'Contact Relationships', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '946905fd-fb68-43de-9620-76ef5b3cacf1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('946905fd-fb68-43de-9620-76ef5b3cacf1', 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', 'D15B9246-2192-4CA9-8057-708E997AF565', 'SubmissionID', 'One To Many', 1, 1, 'Submission Speakers', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '89743ae2-a42a-418d-b923-a0b9a176351d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('89743ae2-a42a-418d-b923-a0b9a176351d', 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', '78188C48-2E2C-4674-AB78-D6639350C388', 'SubmissionID', 'One To Many', 1, 1, 'Submission Notifications', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd4722973-80fb-4ae6-afe6-5555d049e36d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d4722973-80fb-4ae6-afe6-5555d049e36d', 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', 'ResubmissionOfID', 'One To Many', 1, 1, 'Submissions', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c1e416a6-b6c1-44e8-b1b7-07e96f649c72'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c1e416a6-b6c1-44e8-b1b7-07e96f649c72', 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', '85B84E83-35A2-4874-B2DE-57195316F966', 'SubmissionID', 'One To Many', 1, 1, 'Event Review Tasks', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ff548f63-6c9b-4356-88cf-4600a35e0514'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ff548f63-6c9b-4356-88cf-4600a35e0514', 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', 'CF6C33BE-3726-4CB3-8562-1E768E7EA249', 'SubmissionID', 'One To Many', 1, 1, 'Submission Reviews', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '782822ec-650e-4a47-8ad6-03f8bbd8b42c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('782822ec-650e-4a47-8ad6-03f8bbd8b42c', 'C32FA2FA-D2E4-4685-9AFD-F640630E8626', 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', 'ProductID', 'One To Many', 1, 1, 'Deal Products', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4f0255f9-ee50-4786-9d82-9c9f33de4301'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4f0255f9-ee50-4786-9d82-9c9f33de4301', 'C32FA2FA-D2E4-4685-9AFD-F640630E8626', '805A851B-17DC-47BD-9097-E68E4061537B', 'ProductID', 'One To Many', 1, 1, 'Invoice Line Items', 2);
   END
                              

/* Index for Foreign Keys for AccountInsight */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Insights
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AccountID in table AccountInsight
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AccountInsight_AccountID' 
    AND object_id = OBJECT_ID('[CRM].[AccountInsight]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AccountInsight_AccountID ON [CRM].[AccountInsight] ([AccountID]);

-- Index for foreign key CreatedByContactID in table AccountInsight
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AccountInsight_CreatedByContactID' 
    AND object_id = OBJECT_ID('[CRM].[AccountInsight]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AccountInsight_CreatedByContactID ON [CRM].[AccountInsight] ([CreatedByContactID]);

/* SQL text to update entity field related entity name field map for entity field ID 24850CBD-BC15-47A0-96C3-8166DD9FA225 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='24850CBD-BC15-47A0-96C3-8166DD9FA225',
         @RelatedEntityNameFieldMap='Account'

/* Index for Foreign Keys for AccountStatus */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Status
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for AccountType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Account */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Account Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Status
-- Item: vwAccountStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Account Status
-----               SCHEMA:      CRM
-----               BASE TABLE:  AccountStatus
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwAccountStatus]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwAccountStatus];
GO

CREATE VIEW [CRM].[vwAccountStatus]
AS
SELECT
    a.*
FROM
    [CRM].[AccountStatus] AS a
GO
GRANT SELECT ON [CRM].[vwAccountStatus] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Account Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Status
-- Item: Permissions for vwAccountStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwAccountStatus] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Account Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Status
-- Item: spCreateAccountStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AccountStatus
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateAccountStatus]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateAccountStatus];
GO

CREATE PROCEDURE [CRM].[spCreateAccountStatus]
    @Name nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[AccountStatus]
        (
            [Name]
        )
    VALUES
        (
            @Name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwAccountStatus] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateAccountStatus] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Account Status */

GRANT EXECUTE ON [CRM].[spCreateAccountStatus] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Account Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Status
-- Item: spUpdateAccountStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AccountStatus
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateAccountStatus]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateAccountStatus];
GO

CREATE PROCEDURE [CRM].[spUpdateAccountStatus]
    @ID int,
    @Name nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[AccountStatus]
    SET
        [Name] = @Name
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwAccountStatus] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwAccountStatus]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateAccountStatus] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AccountStatus table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateAccountStatus]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateAccountStatus];
GO
CREATE TRIGGER [CRM].trgUpdateAccountStatus
ON [CRM].[AccountStatus]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[AccountStatus]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[AccountStatus] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Account Status */

GRANT EXECUTE ON [CRM].[spUpdateAccountStatus] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Account Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Status
-- Item: spDeleteAccountStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AccountStatus
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteAccountStatus]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteAccountStatus];
GO

CREATE PROCEDURE [CRM].[spDeleteAccountStatus]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[AccountStatus]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteAccountStatus] TO [cdp_Integration]
    

/* spDelete Permissions for Account Status */

GRANT EXECUTE ON [CRM].[spDeleteAccountStatus] TO [cdp_Integration]



/* Base View SQL for Account Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Types
-- Item: vwAccountTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Account Types
-----               SCHEMA:      CRM
-----               BASE TABLE:  AccountType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwAccountTypes]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwAccountTypes];
GO

CREATE VIEW [CRM].[vwAccountTypes]
AS
SELECT
    a.*
FROM
    [CRM].[AccountType] AS a
GO
GRANT SELECT ON [CRM].[vwAccountTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Account Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Types
-- Item: Permissions for vwAccountTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwAccountTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Account Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Types
-- Item: spCreateAccountType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AccountType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateAccountType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateAccountType];
GO

CREATE PROCEDURE [CRM].[spCreateAccountType]
    @Name nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[AccountType]
        (
            [Name]
        )
    VALUES
        (
            @Name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwAccountTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateAccountType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Account Types */

GRANT EXECUTE ON [CRM].[spCreateAccountType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Account Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Types
-- Item: spUpdateAccountType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AccountType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateAccountType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateAccountType];
GO

CREATE PROCEDURE [CRM].[spUpdateAccountType]
    @ID int,
    @Name nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[AccountType]
    SET
        [Name] = @Name
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwAccountTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwAccountTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateAccountType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AccountType table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateAccountType]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateAccountType];
GO
CREATE TRIGGER [CRM].trgUpdateAccountType
ON [CRM].[AccountType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[AccountType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[AccountType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Account Types */

GRANT EXECUTE ON [CRM].[spUpdateAccountType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Account Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Types
-- Item: spDeleteAccountType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AccountType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteAccountType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteAccountType];
GO

CREATE PROCEDURE [CRM].[spDeleteAccountType]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[AccountType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteAccountType] TO [cdp_Integration]
    

/* spDelete Permissions for Account Types */

GRANT EXECUTE ON [CRM].[spDeleteAccountType] TO [cdp_Integration]



/* Base View SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: vwAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Accounts
-----               SCHEMA:      CRM
-----               BASE TABLE:  Account
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwAccounts]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwAccounts];
GO

CREATE VIEW [CRM].[vwAccounts]
AS
SELECT
    a.*
FROM
    [CRM].[Account] AS a
GO
GRANT SELECT ON [CRM].[vwAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: Permissions for vwAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: spCreateAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Account
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateAccount];
GO

CREATE PROCEDURE [CRM].[spCreateAccount]
    @Name nvarchar(100),
    @Industry nvarchar(50),
    @AnnualRevenue decimal(18, 2),
    @TickerSymbol nvarchar(10),
    @Exchange nvarchar(20),
    @EmployeeCount int,
    @Founded int,
    @Website nvarchar(255),
    @Phone nvarchar(20),
    @Fax nvarchar(20),
    @BillingStreet nvarchar(100),
    @BillingCity nvarchar(50),
    @BillingState nvarchar(50),
    @BillingPostalCode nvarchar(20),
    @BillingCountry nvarchar(50),
    @ShippingStreet nvarchar(100),
    @ShippingCity nvarchar(50),
    @ShippingState nvarchar(50),
    @ShippingPostalCode nvarchar(20),
    @ShippingCountry nvarchar(50),
    @AccountType nvarchar(50),
    @AccountStatus nvarchar(20),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Account]
        (
            [Name],
                [Industry],
                [AnnualRevenue],
                [TickerSymbol],
                [Exchange],
                [EmployeeCount],
                [Founded],
                [Website],
                [Phone],
                [Fax],
                [BillingStreet],
                [BillingCity],
                [BillingState],
                [BillingPostalCode],
                [BillingCountry],
                [ShippingStreet],
                [ShippingCity],
                [ShippingState],
                [ShippingPostalCode],
                [ShippingCountry],
                [AccountType],
                [AccountStatus],
                [IsActive]
        )
    VALUES
        (
            @Name,
                @Industry,
                @AnnualRevenue,
                @TickerSymbol,
                @Exchange,
                @EmployeeCount,
                @Founded,
                @Website,
                @Phone,
                @Fax,
                @BillingStreet,
                @BillingCity,
                @BillingState,
                @BillingPostalCode,
                @BillingCountry,
                @ShippingStreet,
                @ShippingCity,
                @ShippingState,
                @ShippingPostalCode,
                @ShippingCountry,
                @AccountType,
                @AccountStatus,
                @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwAccounts] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateAccount] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Accounts */

GRANT EXECUTE ON [CRM].[spCreateAccount] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: spUpdateAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Account
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateAccount];
GO

CREATE PROCEDURE [CRM].[spUpdateAccount]
    @ID int,
    @Name nvarchar(100),
    @Industry nvarchar(50),
    @AnnualRevenue decimal(18, 2),
    @TickerSymbol nvarchar(10),
    @Exchange nvarchar(20),
    @EmployeeCount int,
    @Founded int,
    @Website nvarchar(255),
    @Phone nvarchar(20),
    @Fax nvarchar(20),
    @BillingStreet nvarchar(100),
    @BillingCity nvarchar(50),
    @BillingState nvarchar(50),
    @BillingPostalCode nvarchar(20),
    @BillingCountry nvarchar(50),
    @ShippingStreet nvarchar(100),
    @ShippingCity nvarchar(50),
    @ShippingState nvarchar(50),
    @ShippingPostalCode nvarchar(20),
    @ShippingCountry nvarchar(50),
    @AccountType nvarchar(50),
    @AccountStatus nvarchar(20),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Account]
    SET
        [Name] = @Name,
        [Industry] = @Industry,
        [AnnualRevenue] = @AnnualRevenue,
        [TickerSymbol] = @TickerSymbol,
        [Exchange] = @Exchange,
        [EmployeeCount] = @EmployeeCount,
        [Founded] = @Founded,
        [Website] = @Website,
        [Phone] = @Phone,
        [Fax] = @Fax,
        [BillingStreet] = @BillingStreet,
        [BillingCity] = @BillingCity,
        [BillingState] = @BillingState,
        [BillingPostalCode] = @BillingPostalCode,
        [BillingCountry] = @BillingCountry,
        [ShippingStreet] = @ShippingStreet,
        [ShippingCity] = @ShippingCity,
        [ShippingState] = @ShippingState,
        [ShippingPostalCode] = @ShippingPostalCode,
        [ShippingCountry] = @ShippingCountry,
        [AccountType] = @AccountType,
        [AccountStatus] = @AccountStatus,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwAccounts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwAccounts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateAccount] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Account table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateAccount]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateAccount];
GO
CREATE TRIGGER [CRM].trgUpdateAccount
ON [CRM].[Account]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Account]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Account] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Accounts */

GRANT EXECUTE ON [CRM].[spUpdateAccount] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Accounts
-- Item: spDeleteAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Account
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteAccount];
GO

CREATE PROCEDURE [CRM].[spDeleteAccount]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Account]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteAccount] TO [cdp_Integration]
    

/* spDelete Permissions for Accounts */

GRANT EXECUTE ON [CRM].[spDeleteAccount] TO [cdp_Integration]



/* Base View SQL for Account Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Insights
-- Item: vwAccountInsights
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Account Insights
-----               SCHEMA:      CRM
-----               BASE TABLE:  AccountInsight
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwAccountInsights]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwAccountInsights];
GO

CREATE VIEW [CRM].[vwAccountInsights]
AS
SELECT
    a.*,
    Account_AccountID.[Name] AS [Account]
FROM
    [CRM].[AccountInsight] AS a
INNER JOIN
    [CRM].[Account] AS Account_AccountID
  ON
    [a].[AccountID] = Account_AccountID.[ID]
GO
GRANT SELECT ON [CRM].[vwAccountInsights] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Account Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Insights
-- Item: Permissions for vwAccountInsights
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwAccountInsights] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Account Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Insights
-- Item: spCreateAccountInsight
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AccountInsight
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateAccountInsight]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateAccountInsight];
GO

CREATE PROCEDURE [CRM].[spCreateAccountInsight]
    @AccountID int,
    @InsightType nvarchar(50),
    @Title nvarchar(500),
    @Content nvarchar(MAX),
    @SourceURL nvarchar(500),
    @PublishedDate datetime,
    @CreatedAt datetime = NULL,
    @CreatedByContactID int,
    @Sentiment nvarchar(20),
    @Priority nvarchar(20),
    @Tags nvarchar(MAX),
    @Summary nvarchar(2000),
    @IsArchived bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[AccountInsight]
        (
            [AccountID],
                [InsightType],
                [Title],
                [Content],
                [SourceURL],
                [PublishedDate],
                [CreatedAt],
                [CreatedByContactID],
                [Sentiment],
                [Priority],
                [Tags],
                [Summary],
                [IsArchived]
        )
    VALUES
        (
            @AccountID,
                @InsightType,
                @Title,
                @Content,
                @SourceURL,
                @PublishedDate,
                ISNULL(@CreatedAt, getdate()),
                @CreatedByContactID,
                @Sentiment,
                @Priority,
                @Tags,
                @Summary,
                @IsArchived
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwAccountInsights] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateAccountInsight] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Account Insights */

GRANT EXECUTE ON [CRM].[spCreateAccountInsight] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Account Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Insights
-- Item: spUpdateAccountInsight
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AccountInsight
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateAccountInsight]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateAccountInsight];
GO

CREATE PROCEDURE [CRM].[spUpdateAccountInsight]
    @ID int,
    @AccountID int,
    @InsightType nvarchar(50),
    @Title nvarchar(500),
    @Content nvarchar(MAX),
    @SourceURL nvarchar(500),
    @PublishedDate datetime,
    @CreatedAt datetime,
    @CreatedByContactID int,
    @Sentiment nvarchar(20),
    @Priority nvarchar(20),
    @Tags nvarchar(MAX),
    @Summary nvarchar(2000),
    @IsArchived bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[AccountInsight]
    SET
        [AccountID] = @AccountID,
        [InsightType] = @InsightType,
        [Title] = @Title,
        [Content] = @Content,
        [SourceURL] = @SourceURL,
        [PublishedDate] = @PublishedDate,
        [CreatedAt] = @CreatedAt,
        [CreatedByContactID] = @CreatedByContactID,
        [Sentiment] = @Sentiment,
        [Priority] = @Priority,
        [Tags] = @Tags,
        [Summary] = @Summary,
        [IsArchived] = @IsArchived
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwAccountInsights] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwAccountInsights]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateAccountInsight] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AccountInsight table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateAccountInsight]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateAccountInsight];
GO
CREATE TRIGGER [CRM].trgUpdateAccountInsight
ON [CRM].[AccountInsight]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[AccountInsight]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[AccountInsight] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Account Insights */

GRANT EXECUTE ON [CRM].[spUpdateAccountInsight] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Account Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Insights
-- Item: spDeleteAccountInsight
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AccountInsight
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteAccountInsight]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteAccountInsight];
GO

CREATE PROCEDURE [CRM].[spDeleteAccountInsight]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[AccountInsight]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteAccountInsight] TO [cdp_Integration]
    

/* spDelete Permissions for Account Insights */

GRANT EXECUTE ON [CRM].[spDeleteAccountInsight] TO [cdp_Integration]



/* Index for Foreign Keys for Activity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AccountID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity_AccountID' 
    AND object_id = OBJECT_ID('[CRM].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity_AccountID ON [CRM].[Activity] ([AccountID]);

-- Index for foreign key ContactID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity_ContactID' 
    AND object_id = OBJECT_ID('[CRM].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity_ContactID ON [CRM].[Activity] ([ContactID]);

/* SQL text to update entity field related entity name field map for entity field ID 307F2132-9384-4CA4-A1A5-D0C628BE4739 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='307F2132-9384-4CA4-A1A5-D0C628BE4739',
         @RelatedEntityNameFieldMap='Account'

/* Base View SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities
-----               SCHEMA:      CRM
-----               BASE TABLE:  Activity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwActivities]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwActivities];
GO

CREATE VIEW [CRM].[vwActivities]
AS
SELECT
    a.*,
    Account_AccountID.[Name] AS [Account]
FROM
    [CRM].[Activity] AS a
LEFT OUTER JOIN
    [CRM].[Account] AS Account_AccountID
  ON
    [a].[AccountID] = Account_AccountID.[ID]
GO
GRANT SELECT ON [CRM].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Permissions for vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spCreateActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateActivity];
GO

CREATE PROCEDURE [CRM].[spCreateActivity]
    @AccountID int,
    @ContactID int,
    @ActivityType nvarchar(50),
    @Subject nvarchar(200),
    @Description nvarchar(MAX),
    @StartDate datetime,
    @EndDate datetime,
    @Status nvarchar(20),
    @Priority nvarchar(10),
    @Direction nvarchar(10),
    @Location nvarchar(100),
    @Result nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Activity]
        (
            [AccountID],
                [ContactID],
                [ActivityType],
                [Subject],
                [Description],
                [StartDate],
                [EndDate],
                [Status],
                [Priority],
                [Direction],
                [Location],
                [Result]
        )
    VALUES
        (
            @AccountID,
                @ContactID,
                @ActivityType,
                @Subject,
                @Description,
                @StartDate,
                @EndDate,
                @Status,
                @Priority,
                @Direction,
                @Location,
                @Result
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwActivities] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateActivity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activities */

GRANT EXECUTE ON [CRM].[spCreateActivity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spUpdateActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateActivity];
GO

CREATE PROCEDURE [CRM].[spUpdateActivity]
    @ID int,
    @AccountID int,
    @ContactID int,
    @ActivityType nvarchar(50),
    @Subject nvarchar(200),
    @Description nvarchar(MAX),
    @StartDate datetime,
    @EndDate datetime,
    @Status nvarchar(20),
    @Priority nvarchar(10),
    @Direction nvarchar(10),
    @Location nvarchar(100),
    @Result nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Activity]
    SET
        [AccountID] = @AccountID,
        [ContactID] = @ContactID,
        [ActivityType] = @ActivityType,
        [Subject] = @Subject,
        [Description] = @Description,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Status] = @Status,
        [Priority] = @Priority,
        [Direction] = @Direction,
        [Location] = @Location,
        [Result] = @Result
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwActivities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwActivities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Activity table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateActivity]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateActivity];
GO
CREATE TRIGGER [CRM].trgUpdateActivity
ON [CRM].[Activity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Activity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Activity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activities */

GRANT EXECUTE ON [CRM].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spDeleteActivity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteActivity];
GO

CREATE PROCEDURE [CRM].[spDeleteActivity]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Activity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteActivity] TO [cdp_Integration]
    

/* spDelete Permissions for Activities */

GRANT EXECUTE ON [CRM].[spDeleteActivity] TO [cdp_Integration]



/* Index for Foreign Keys for ActivityType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Activity Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: vwActivityTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activity Types
-----               SCHEMA:      CRM
-----               BASE TABLE:  ActivityType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwActivityTypes]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwActivityTypes];
GO

CREATE VIEW [CRM].[vwActivityTypes]
AS
SELECT
    a.*
FROM
    [CRM].[ActivityType] AS a
GO
GRANT SELECT ON [CRM].[vwActivityTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: Permissions for vwActivityTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwActivityTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activity Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: spCreateActivityType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActivityType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateActivityType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateActivityType];
GO

CREATE PROCEDURE [CRM].[spCreateActivityType]
    @Name nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[ActivityType]
        (
            [Name]
        )
    VALUES
        (
            @Name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwActivityTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateActivityType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Types */

GRANT EXECUTE ON [CRM].[spCreateActivityType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activity Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: spUpdateActivityType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActivityType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateActivityType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateActivityType];
GO

CREATE PROCEDURE [CRM].[spUpdateActivityType]
    @ID int,
    @Name nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[ActivityType]
    SET
        [Name] = @Name
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwActivityTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwActivityTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateActivityType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivityType table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateActivityType]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateActivityType];
GO
CREATE TRIGGER [CRM].trgUpdateActivityType
ON [CRM].[ActivityType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[ActivityType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[ActivityType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Types */

GRANT EXECUTE ON [CRM].[spUpdateActivityType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activity Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: spDeleteActivityType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActivityType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteActivityType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteActivityType];
GO

CREATE PROCEDURE [CRM].[spDeleteActivityType]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[ActivityType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteActivityType] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Types */

GRANT EXECUTE ON [CRM].[spDeleteActivityType] TO [cdp_Integration]



/* Index for Foreign Keys for ContactRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PrimaryContactID in table ContactRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContactRelationship_PrimaryContactID' 
    AND object_id = OBJECT_ID('[CRM].[ContactRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContactRelationship_PrimaryContactID ON [CRM].[ContactRelationship] ([PrimaryContactID]);

-- Index for foreign key RelatedContactID in table ContactRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContactRelationship_RelatedContactID' 
    AND object_id = OBJECT_ID('[CRM].[ContactRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContactRelationship_RelatedContactID ON [CRM].[ContactRelationship] ([RelatedContactID]);

-- Index for foreign key RelationshipTypeID in table ContactRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContactRelationship_RelationshipTypeID' 
    AND object_id = OBJECT_ID('[CRM].[ContactRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContactRelationship_RelationshipTypeID ON [CRM].[ContactRelationship] ([RelationshipTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID B36537E6-F3FB-4744-BE99-7CF4B790807E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B36537E6-F3FB-4744-BE99-7CF4B790807E',
         @RelatedEntityNameFieldMap='RelationshipType'

/* Base View SQL for Contact Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Relationships
-- Item: vwContactRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Relationships
-----               SCHEMA:      CRM
-----               BASE TABLE:  ContactRelationship
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwContactRelationships]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwContactRelationships];
GO

CREATE VIEW [CRM].[vwContactRelationships]
AS
SELECT
    c.*,
    RelationshipType_RelationshipTypeID.[Name] AS [RelationshipType]
FROM
    [CRM].[ContactRelationship] AS c
INNER JOIN
    [CRM].[RelationshipType] AS RelationshipType_RelationshipTypeID
  ON
    [c].[RelationshipTypeID] = RelationshipType_RelationshipTypeID.[ID]
GO
GRANT SELECT ON [CRM].[vwContactRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contact Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Relationships
-- Item: Permissions for vwContactRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwContactRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contact Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Relationships
-- Item: spCreateContactRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContactRelationship
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateContactRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateContactRelationship];
GO

CREATE PROCEDURE [CRM].[spCreateContactRelationship]
    @PrimaryContactID int,
    @RelatedContactID int,
    @RelationshipTypeID int,
    @StartDate date,
    @EndDate date,
    @Notes nvarchar(500),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[ContactRelationship]
        (
            [PrimaryContactID],
                [RelatedContactID],
                [RelationshipTypeID],
                [StartDate],
                [EndDate],
                [Notes],
                [IsActive]
        )
    VALUES
        (
            @PrimaryContactID,
                @RelatedContactID,
                @RelationshipTypeID,
                @StartDate,
                @EndDate,
                @Notes,
                @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwContactRelationships] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateContactRelationship] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contact Relationships */

GRANT EXECUTE ON [CRM].[spCreateContactRelationship] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contact Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Relationships
-- Item: spUpdateContactRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContactRelationship
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateContactRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateContactRelationship];
GO

CREATE PROCEDURE [CRM].[spUpdateContactRelationship]
    @ID int,
    @PrimaryContactID int,
    @RelatedContactID int,
    @RelationshipTypeID int,
    @StartDate date,
    @EndDate date,
    @Notes nvarchar(500),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[ContactRelationship]
    SET
        [PrimaryContactID] = @PrimaryContactID,
        [RelatedContactID] = @RelatedContactID,
        [RelationshipTypeID] = @RelationshipTypeID,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Notes] = @Notes,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwContactRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwContactRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateContactRelationship] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContactRelationship table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateContactRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateContactRelationship];
GO
CREATE TRIGGER [CRM].trgUpdateContactRelationship
ON [CRM].[ContactRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[ContactRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[ContactRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Contact Relationships */

GRANT EXECUTE ON [CRM].[spUpdateContactRelationship] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Contact Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Relationships
-- Item: spDeleteContactRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContactRelationship
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteContactRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteContactRelationship];
GO

CREATE PROCEDURE [CRM].[spDeleteContactRelationship]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[ContactRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteContactRelationship] TO [cdp_Integration]
    

/* spDelete Permissions for Contact Relationships */

GRANT EXECUTE ON [CRM].[spDeleteContactRelationship] TO [cdp_Integration]



/* Index for Foreign Keys for Contact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AccountID in table Contact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Contact_AccountID' 
    AND object_id = OBJECT_ID('[CRM].[Contact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Contact_AccountID ON [CRM].[Contact] ([AccountID]);

-- Index for foreign key ReportsToID in table Contact
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Contact_ReportsToID' 
    AND object_id = OBJECT_ID('[CRM].[Contact]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Contact_ReportsToID ON [CRM].[Contact] ([ReportsToID]);

/* Root ID Function SQL for Contacts.ReportsToID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: fnContactReportsToID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Contact].[ReportsToID]
------------------------------------------------------------
IF OBJECT_ID('[CRM].[fnContactReportsToID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [CRM].[fnContactReportsToID_GetRootID];
GO

CREATE FUNCTION [CRM].[fnContactReportsToID_GetRootID]
(
    @RecordID int,
    @ParentID int
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ReportsToID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [CRM].[Contact]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ReportsToID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ReportsToID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [CRM].[Contact] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ReportsToID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ReportsToID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID BF9299BB-5CAC-4E59-87A1-0EE42618862F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BF9299BB-5CAC-4E59-87A1-0EE42618862F',
         @RelatedEntityNameFieldMap='Account'

/* SQL text to update entity field related entity name field map for entity field ID 0C96443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0C96443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 1296443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1296443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 0096443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0096443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* Base View SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts
-----               SCHEMA:      CRM
-----               BASE TABLE:  Contact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwContacts]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwContacts];
GO

CREATE VIEW [CRM].[vwContacts]
AS
SELECT
    c.*,
    Account_AccountID.[Name] AS [Account],
    root_ReportsToID.RootID AS [RootReportsToID]
FROM
    [CRM].[Contact] AS c
LEFT OUTER JOIN
    [CRM].[Account] AS Account_AccountID
  ON
    [c].[AccountID] = Account_AccountID.[ID]
OUTER APPLY
    [CRM].[fnContactReportsToID_GetRootID]([c].[ID], [c].[ReportsToID]) AS root_ReportsToID
GO
GRANT SELECT ON [CRM].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Permissions for vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spCreateContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateContact];
GO

CREATE PROCEDURE [CRM].[spCreateContact]
    @AccountID int,
    @Salutation nvarchar(10),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(100),
    @Department nvarchar(100),
    @Email nvarchar(100),
    @Phone nvarchar(20),
    @Mobile nvarchar(20),
    @ReportsToID int,
    @MailingStreet nvarchar(100),
    @MailingCity nvarchar(50),
    @MailingState nvarchar(50),
    @MailingPostalCode nvarchar(20),
    @MailingCountry nvarchar(50),
    @BirthDate date,
    @PreferredContactMethod nvarchar(20),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Contact]
        (
            [AccountID],
                [Salutation],
                [FirstName],
                [LastName],
                [Title],
                [Department],
                [Email],
                [Phone],
                [Mobile],
                [ReportsToID],
                [MailingStreet],
                [MailingCity],
                [MailingState],
                [MailingPostalCode],
                [MailingCountry],
                [BirthDate],
                [PreferredContactMethod],
                [IsActive]
        )
    VALUES
        (
            @AccountID,
                @Salutation,
                @FirstName,
                @LastName,
                @Title,
                @Department,
                @Email,
                @Phone,
                @Mobile,
                @ReportsToID,
                @MailingStreet,
                @MailingCity,
                @MailingState,
                @MailingPostalCode,
                @MailingCountry,
                @BirthDate,
                @PreferredContactMethod,
                @IsActive
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwContacts] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateContact] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contacts */

GRANT EXECUTE ON [CRM].[spCreateContact] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spUpdateContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateContact];
GO

CREATE PROCEDURE [CRM].[spUpdateContact]
    @ID int,
    @AccountID int,
    @Salutation nvarchar(10),
    @FirstName nvarchar(50),
    @LastName nvarchar(50),
    @Title nvarchar(100),
    @Department nvarchar(100),
    @Email nvarchar(100),
    @Phone nvarchar(20),
    @Mobile nvarchar(20),
    @ReportsToID int,
    @MailingStreet nvarchar(100),
    @MailingCity nvarchar(50),
    @MailingState nvarchar(50),
    @MailingPostalCode nvarchar(20),
    @MailingCountry nvarchar(50),
    @BirthDate date,
    @PreferredContactMethod nvarchar(20),
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Contact]
    SET
        [AccountID] = @AccountID,
        [Salutation] = @Salutation,
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Title] = @Title,
        [Department] = @Department,
        [Email] = @Email,
        [Phone] = @Phone,
        [Mobile] = @Mobile,
        [ReportsToID] = @ReportsToID,
        [MailingStreet] = @MailingStreet,
        [MailingCity] = @MailingCity,
        [MailingState] = @MailingState,
        [MailingPostalCode] = @MailingPostalCode,
        [MailingCountry] = @MailingCountry,
        [BirthDate] = @BirthDate,
        [PreferredContactMethod] = @PreferredContactMethod,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwContacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwContacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateContact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Contact table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateContact]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateContact];
GO
CREATE TRIGGER [CRM].trgUpdateContact
ON [CRM].[Contact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Contact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Contact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Contacts */

GRANT EXECUTE ON [CRM].[spUpdateContact] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spDeleteContact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteContact]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteContact];
GO

CREATE PROCEDURE [CRM].[spDeleteContact]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Contact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteContact] TO [cdp_Integration]
    

/* spDelete Permissions for Contacts */

GRANT EXECUTE ON [CRM].[spDeleteContact] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 0396443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0396443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 0496443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0496443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 0596443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0596443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID C995443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C995443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID D995443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D995443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID D295443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D295443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID D395443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D395443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID D495443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D495443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID EE95443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EE95443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* Index for Foreign Keys for DealProduct */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deal Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DealID in table DealProduct
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DealProduct_DealID' 
    AND object_id = OBJECT_ID('[CRM].[DealProduct]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DealProduct_DealID ON [CRM].[DealProduct] ([DealID]);

-- Index for foreign key ProductID in table DealProduct
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DealProduct_ProductID' 
    AND object_id = OBJECT_ID('[CRM].[DealProduct]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DealProduct_ProductID ON [CRM].[DealProduct] ([ProductID]);

/* SQL text to update entity field related entity name field map for entity field ID 9A487D68-4F28-4786-9509-4F79A2F33169 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9A487D68-4F28-4786-9509-4F79A2F33169',
         @RelatedEntityNameFieldMap='Deal'

/* Index for Foreign Keys for Deal */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AccountID in table Deal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Deal_AccountID' 
    AND object_id = OBJECT_ID('[CRM].[Deal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Deal_AccountID ON [CRM].[Deal] ([AccountID]);

-- Index for foreign key ContactID in table Deal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Deal_ContactID' 
    AND object_id = OBJECT_ID('[CRM].[Deal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Deal_ContactID ON [CRM].[Deal] ([ContactID]);

-- Index for foreign key OwnerID in table Deal
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Deal_OwnerID' 
    AND object_id = OBJECT_ID('[CRM].[Deal]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Deal_OwnerID ON [CRM].[Deal] ([OwnerID]);

/* SQL text to update entity field related entity name field map for entity field ID BB63DB93-6F43-4AE5-BA4F-16419ECA4479 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BB63DB93-6F43-4AE5-BA4F-16419ECA4479',
         @RelatedEntityNameFieldMap='Account'

/* Base View SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: vwDeals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Deals
-----               SCHEMA:      CRM
-----               BASE TABLE:  Deal
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwDeals]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwDeals];
GO

CREATE VIEW [CRM].[vwDeals]
AS
SELECT
    d.*,
    Account_AccountID.[Name] AS [Account]
FROM
    [CRM].[Deal] AS d
INNER JOIN
    [CRM].[Account] AS Account_AccountID
  ON
    [d].[AccountID] = Account_AccountID.[ID]
GO
GRANT SELECT ON [CRM].[vwDeals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: Permissions for vwDeals
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwDeals] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: spCreateDeal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Deal
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateDeal]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateDeal];
GO

CREATE PROCEDURE [CRM].[spCreateDeal]
    @Name nvarchar(200),
    @AccountID int,
    @ContactID int,
    @Stage nvarchar(50),
    @Amount decimal(18, 2),
    @Probability int,
    @CloseDate date,
    @ActualCloseDate date,
    @DealSource nvarchar(50),
    @Competitor nvarchar(100),
    @LossReason nvarchar(200),
    @NextStep nvarchar(500),
    @Description nvarchar(MAX),
    @OwnerID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Deal]
        (
            [Name],
                [AccountID],
                [ContactID],
                [Stage],
                [Amount],
                [Probability],
                [CloseDate],
                [ActualCloseDate],
                [DealSource],
                [Competitor],
                [LossReason],
                [NextStep],
                [Description],
                [OwnerID]
        )
    VALUES
        (
            @Name,
                @AccountID,
                @ContactID,
                @Stage,
                @Amount,
                @Probability,
                @CloseDate,
                @ActualCloseDate,
                @DealSource,
                @Competitor,
                @LossReason,
                @NextStep,
                @Description,
                @OwnerID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwDeals] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateDeal] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Deals */

GRANT EXECUTE ON [CRM].[spCreateDeal] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: spUpdateDeal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Deal
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateDeal]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateDeal];
GO

CREATE PROCEDURE [CRM].[spUpdateDeal]
    @ID int,
    @Name nvarchar(200),
    @AccountID int,
    @ContactID int,
    @Stage nvarchar(50),
    @Amount decimal(18, 2),
    @Probability int,
    @CloseDate date,
    @ActualCloseDate date,
    @DealSource nvarchar(50),
    @Competitor nvarchar(100),
    @LossReason nvarchar(200),
    @NextStep nvarchar(500),
    @Description nvarchar(MAX),
    @OwnerID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Deal]
    SET
        [Name] = @Name,
        [AccountID] = @AccountID,
        [ContactID] = @ContactID,
        [Stage] = @Stage,
        [Amount] = @Amount,
        [Probability] = @Probability,
        [CloseDate] = @CloseDate,
        [ActualCloseDate] = @ActualCloseDate,
        [DealSource] = @DealSource,
        [Competitor] = @Competitor,
        [LossReason] = @LossReason,
        [NextStep] = @NextStep,
        [Description] = @Description,
        [OwnerID] = @OwnerID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwDeals] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwDeals]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateDeal] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Deal table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateDeal]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateDeal];
GO
CREATE TRIGGER [CRM].trgUpdateDeal
ON [CRM].[Deal]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Deal]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Deal] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Deals */

GRANT EXECUTE ON [CRM].[spUpdateDeal] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Deals */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deals
-- Item: spDeleteDeal
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Deal
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteDeal]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteDeal];
GO

CREATE PROCEDURE [CRM].[spDeleteDeal]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Deal]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteDeal] TO [cdp_Integration]
    

/* spDelete Permissions for Deals */

GRANT EXECUTE ON [CRM].[spDeleteDeal] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 6D84D10E-CFE4-4391-B886-313865616220 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6D84D10E-CFE4-4391-B886-313865616220',
         @RelatedEntityNameFieldMap='Product'

/* Base View SQL for Deal Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deal Products
-- Item: vwDealProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Deal Products
-----               SCHEMA:      CRM
-----               BASE TABLE:  DealProduct
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwDealProducts]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwDealProducts];
GO

CREATE VIEW [CRM].[vwDealProducts]
AS
SELECT
    d.*,
    Deal_DealID.[Name] AS [Deal],
    Product_ProductID.[Name] AS [Product]
FROM
    [CRM].[DealProduct] AS d
INNER JOIN
    [CRM].[Deal] AS Deal_DealID
  ON
    [d].[DealID] = Deal_DealID.[ID]
INNER JOIN
    [CRM].[Product] AS Product_ProductID
  ON
    [d].[ProductID] = Product_ProductID.[ID]
GO
GRANT SELECT ON [CRM].[vwDealProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Deal Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deal Products
-- Item: Permissions for vwDealProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwDealProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Deal Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deal Products
-- Item: spCreateDealProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DealProduct
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateDealProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateDealProduct];
GO

CREATE PROCEDURE [CRM].[spCreateDealProduct]
    @DealID int,
    @ProductID int,
    @Quantity decimal(18, 4),
    @UnitPrice decimal(18, 2),
    @Discount decimal(5, 2),
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[DealProduct]
        (
            [DealID],
                [ProductID],
                [Quantity],
                [UnitPrice],
                [Discount],
                [Notes]
        )
    VALUES
        (
            @DealID,
                @ProductID,
                @Quantity,
                @UnitPrice,
                @Discount,
                @Notes
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwDealProducts] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateDealProduct] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Deal Products */

GRANT EXECUTE ON [CRM].[spCreateDealProduct] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Deal Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deal Products
-- Item: spUpdateDealProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DealProduct
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateDealProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateDealProduct];
GO

CREATE PROCEDURE [CRM].[spUpdateDealProduct]
    @ID int,
    @DealID int,
    @ProductID int,
    @Quantity decimal(18, 4),
    @UnitPrice decimal(18, 2),
    @Discount decimal(5, 2),
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[DealProduct]
    SET
        [DealID] = @DealID,
        [ProductID] = @ProductID,
        [Quantity] = @Quantity,
        [UnitPrice] = @UnitPrice,
        [Discount] = @Discount,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwDealProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwDealProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateDealProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DealProduct table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateDealProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateDealProduct];
GO
CREATE TRIGGER [CRM].trgUpdateDealProduct
ON [CRM].[DealProduct]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[DealProduct]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[DealProduct] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Deal Products */

GRANT EXECUTE ON [CRM].[spUpdateDealProduct] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Deal Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Deal Products
-- Item: spDeleteDealProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DealProduct
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteDealProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteDealProduct];
GO

CREATE PROCEDURE [CRM].[spDeleteDealProduct]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[DealProduct]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteDealProduct] TO [cdp_Integration]
    

/* spDelete Permissions for Deal Products */

GRANT EXECUTE ON [CRM].[spDeleteDealProduct] TO [cdp_Integration]



/* Index for Foreign Keys for EventReviewTask */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Review Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventID in table EventReviewTask
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventReviewTask_EventID' 
    AND object_id = OBJECT_ID('[Events].[EventReviewTask]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventReviewTask_EventID ON [Events].[EventReviewTask] ([EventID]);

-- Index for foreign key SubmissionID in table EventReviewTask
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventReviewTask_SubmissionID' 
    AND object_id = OBJECT_ID('[Events].[EventReviewTask]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventReviewTask_SubmissionID ON [Events].[EventReviewTask] ([SubmissionID]);

-- Index for foreign key AssignedToContactID in table EventReviewTask
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventReviewTask_AssignedToContactID' 
    AND object_id = OBJECT_ID('[Events].[EventReviewTask]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventReviewTask_AssignedToContactID ON [Events].[EventReviewTask] ([AssignedToContactID]);

/* SQL text to update entity field related entity name field map for entity field ID C916E60E-9805-47F1-90D0-9AD00963B599 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C916E60E-9805-47F1-90D0-9AD00963B599',
         @RelatedEntityNameFieldMap='Event'

/* Index for Foreign Keys for Event */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Event
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Event_ParentID' 
    AND object_id = OBJECT_ID('[Events].[Event]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Event_ParentID ON [Events].[Event] ([ParentID]);

-- Index for foreign key AccountID in table Event
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Event_AccountID' 
    AND object_id = OBJECT_ID('[Events].[Event]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Event_AccountID ON [Events].[Event] ([AccountID]);

/* Root ID Function SQL for Events.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: fnEventParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Event].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[Events].[fnEventParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [Events].[fnEventParentID_GetRootID];
GO

CREATE FUNCTION [Events].[fnEventParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [Events].[Event]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [Events].[Event] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 258DA168-1798-4789-94E4-708B26A88C4F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='258DA168-1798-4789-94E4-708B26A88C4F',
         @RelatedEntityNameFieldMap='Parent'

/* SQL text to update entity field related entity name field map for entity field ID CB9E5522-3FDF-4A58-B54A-319B0D12484E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CB9E5522-3FDF-4A58-B54A-319B0D12484E',
         @RelatedEntityNameFieldMap='Account'

/* Base View SQL for Event Review Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Review Tasks
-- Item: vwEventReviewTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Review Tasks
-----               SCHEMA:      Events
-----               BASE TABLE:  EventReviewTask
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Events].[vwEventReviewTasks]', 'V') IS NOT NULL
    DROP VIEW [Events].[vwEventReviewTasks];
GO

CREATE VIEW [Events].[vwEventReviewTasks]
AS
SELECT
    e.*,
    Event_EventID.[Name] AS [Event]
FROM
    [Events].[EventReviewTask] AS e
INNER JOIN
    [Events].[Event] AS Event_EventID
  ON
    [e].[EventID] = Event_EventID.[ID]
GO
GRANT SELECT ON [Events].[vwEventReviewTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Event Review Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Review Tasks
-- Item: Permissions for vwEventReviewTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Events].[vwEventReviewTasks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Event Review Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Review Tasks
-- Item: spCreateEventReviewTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventReviewTask
------------------------------------------------------------
IF OBJECT_ID('[Events].[spCreateEventReviewTask]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spCreateEventReviewTask];
GO

CREATE PROCEDURE [Events].[spCreateEventReviewTask]
    @ID uniqueidentifier = NULL,
    @EventID uniqueidentifier,
    @SubmissionID uniqueidentifier,
    @AssignedToContactID int,
    @Status nvarchar(50) = NULL,
    @Priority nvarchar(20),
    @DueDate datetime,
    @CompletedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Events].[EventReviewTask]
            (
                [ID],
                [EventID],
                [SubmissionID],
                [AssignedToContactID],
                [Status],
                [Priority],
                [DueDate],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EventID,
                @SubmissionID,
                @AssignedToContactID,
                ISNULL(@Status, 'Pending'),
                @Priority,
                @DueDate,
                @CompletedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Events].[EventReviewTask]
            (
                [EventID],
                [SubmissionID],
                [AssignedToContactID],
                [Status],
                [Priority],
                [DueDate],
                [CompletedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EventID,
                @SubmissionID,
                @AssignedToContactID,
                ISNULL(@Status, 'Pending'),
                @Priority,
                @DueDate,
                @CompletedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Events].[vwEventReviewTasks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Events].[spCreateEventReviewTask] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Event Review Tasks */

GRANT EXECUTE ON [Events].[spCreateEventReviewTask] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Event Review Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Review Tasks
-- Item: spUpdateEventReviewTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventReviewTask
------------------------------------------------------------
IF OBJECT_ID('[Events].[spUpdateEventReviewTask]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spUpdateEventReviewTask];
GO

CREATE PROCEDURE [Events].[spUpdateEventReviewTask]
    @ID uniqueidentifier,
    @EventID uniqueidentifier,
    @SubmissionID uniqueidentifier,
    @AssignedToContactID int,
    @Status nvarchar(50),
    @Priority nvarchar(20),
    @DueDate datetime,
    @CompletedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[EventReviewTask]
    SET
        [EventID] = @EventID,
        [SubmissionID] = @SubmissionID,
        [AssignedToContactID] = @AssignedToContactID,
        [Status] = @Status,
        [Priority] = @Priority,
        [DueDate] = @DueDate,
        [CompletedAt] = @CompletedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Events].[vwEventReviewTasks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Events].[vwEventReviewTasks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Events].[spUpdateEventReviewTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventReviewTask table
------------------------------------------------------------
IF OBJECT_ID('[Events].[trgUpdateEventReviewTask]', 'TR') IS NOT NULL
    DROP TRIGGER [Events].[trgUpdateEventReviewTask];
GO
CREATE TRIGGER [Events].trgUpdateEventReviewTask
ON [Events].[EventReviewTask]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[EventReviewTask]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Events].[EventReviewTask] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Event Review Tasks */

GRANT EXECUTE ON [Events].[spUpdateEventReviewTask] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Event Review Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Review Tasks
-- Item: spDeleteEventReviewTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventReviewTask
------------------------------------------------------------
IF OBJECT_ID('[Events].[spDeleteEventReviewTask]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spDeleteEventReviewTask];
GO

CREATE PROCEDURE [Events].[spDeleteEventReviewTask]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Events].[EventReviewTask]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Events].[spDeleteEventReviewTask] TO [cdp_Integration]
    

/* spDelete Permissions for Event Review Tasks */

GRANT EXECUTE ON [Events].[spDeleteEventReviewTask] TO [cdp_Integration]



/* Base View SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Events
-----               SCHEMA:      Events
-----               BASE TABLE:  Event
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Events].[vwEvents]', 'V') IS NOT NULL
    DROP VIEW [Events].[vwEvents];
GO

CREATE VIEW [Events].[vwEvents]
AS
SELECT
    e.*,
    Event_ParentID.[Name] AS [Parent],
    Account_AccountID.[Name] AS [Account],
    root_ParentID.RootID AS [RootParentID]
FROM
    [Events].[Event] AS e
LEFT OUTER JOIN
    [Events].[Event] AS Event_ParentID
  ON
    [e].[ParentID] = Event_ParentID.[ID]
LEFT OUTER JOIN
    [CRM].[Account] AS Account_AccountID
  ON
    [e].[AccountID] = Account_AccountID.[ID]
OUTER APPLY
    [Events].[fnEventParentID_GetRootID]([e].[ID], [e].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [Events].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Permissions for vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Events].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spCreateEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[Events].[spCreateEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spCreateEvent];
GO

CREATE PROCEDURE [Events].[spCreateEvent]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ConferenceTheme nvarchar(500),
    @TargetAudience nvarchar(500),
    @StartDate datetime,
    @EndDate datetime,
    @Location nvarchar(200),
    @Status nvarchar(50),
    @SubmissionDeadline datetime,
    @NotificationDate datetime,
    @EvaluationRubric nvarchar(MAX),
    @BaselinePassingScore decimal(5, 2),
    @ReviewCommitteeEmails nvarchar(MAX),
    @TypeformID nvarchar(100),
    @TypeformMonitorEnabled bit,
    @TypeformCheckFrequencyMinutes int,
    @BoxFolderID nvarchar(100),
    @SessionFormats nvarchar(MAX),
    @AccountID int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Events].[Event]
            (
                [ID],
                [ParentID],
                [Name],
                [Description],
                [ConferenceTheme],
                [TargetAudience],
                [StartDate],
                [EndDate],
                [Location],
                [Status],
                [SubmissionDeadline],
                [NotificationDate],
                [EvaluationRubric],
                [BaselinePassingScore],
                [ReviewCommitteeEmails],
                [TypeformID],
                [TypeformMonitorEnabled],
                [TypeformCheckFrequencyMinutes],
                [BoxFolderID],
                [SessionFormats],
                [AccountID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @Description,
                @ConferenceTheme,
                @TargetAudience,
                @StartDate,
                @EndDate,
                @Location,
                @Status,
                @SubmissionDeadline,
                @NotificationDate,
                @EvaluationRubric,
                @BaselinePassingScore,
                @ReviewCommitteeEmails,
                @TypeformID,
                @TypeformMonitorEnabled,
                @TypeformCheckFrequencyMinutes,
                @BoxFolderID,
                @SessionFormats,
                @AccountID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Events].[Event]
            (
                [ParentID],
                [Name],
                [Description],
                [ConferenceTheme],
                [TargetAudience],
                [StartDate],
                [EndDate],
                [Location],
                [Status],
                [SubmissionDeadline],
                [NotificationDate],
                [EvaluationRubric],
                [BaselinePassingScore],
                [ReviewCommitteeEmails],
                [TypeformID],
                [TypeformMonitorEnabled],
                [TypeformCheckFrequencyMinutes],
                [BoxFolderID],
                [SessionFormats],
                [AccountID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @Description,
                @ConferenceTheme,
                @TargetAudience,
                @StartDate,
                @EndDate,
                @Location,
                @Status,
                @SubmissionDeadline,
                @NotificationDate,
                @EvaluationRubric,
                @BaselinePassingScore,
                @ReviewCommitteeEmails,
                @TypeformID,
                @TypeformMonitorEnabled,
                @TypeformCheckFrequencyMinutes,
                @BoxFolderID,
                @SessionFormats,
                @AccountID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Events].[vwEvents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Events].[spCreateEvent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Events */

GRANT EXECUTE ON [Events].[spCreateEvent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spUpdateEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[Events].[spUpdateEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spUpdateEvent];
GO

CREATE PROCEDURE [Events].[spUpdateEvent]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ConferenceTheme nvarchar(500),
    @TargetAudience nvarchar(500),
    @StartDate datetime,
    @EndDate datetime,
    @Location nvarchar(200),
    @Status nvarchar(50),
    @SubmissionDeadline datetime,
    @NotificationDate datetime,
    @EvaluationRubric nvarchar(MAX),
    @BaselinePassingScore decimal(5, 2),
    @ReviewCommitteeEmails nvarchar(MAX),
    @TypeformID nvarchar(100),
    @TypeformMonitorEnabled bit,
    @TypeformCheckFrequencyMinutes int,
    @BoxFolderID nvarchar(100),
    @SessionFormats nvarchar(MAX),
    @AccountID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[Event]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [Description] = @Description,
        [ConferenceTheme] = @ConferenceTheme,
        [TargetAudience] = @TargetAudience,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Location] = @Location,
        [Status] = @Status,
        [SubmissionDeadline] = @SubmissionDeadline,
        [NotificationDate] = @NotificationDate,
        [EvaluationRubric] = @EvaluationRubric,
        [BaselinePassingScore] = @BaselinePassingScore,
        [ReviewCommitteeEmails] = @ReviewCommitteeEmails,
        [TypeformID] = @TypeformID,
        [TypeformMonitorEnabled] = @TypeformMonitorEnabled,
        [TypeformCheckFrequencyMinutes] = @TypeformCheckFrequencyMinutes,
        [BoxFolderID] = @BoxFolderID,
        [SessionFormats] = @SessionFormats,
        [AccountID] = @AccountID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Events].[vwEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Events].[vwEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Events].[spUpdateEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Event table
------------------------------------------------------------
IF OBJECT_ID('[Events].[trgUpdateEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [Events].[trgUpdateEvent];
GO
CREATE TRIGGER [Events].trgUpdateEvent
ON [Events].[Event]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[Event]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Events].[Event] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Events */

GRANT EXECUTE ON [Events].[spUpdateEvent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spDeleteEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Event
------------------------------------------------------------
IF OBJECT_ID('[Events].[spDeleteEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spDeleteEvent];
GO

CREATE PROCEDURE [Events].[spDeleteEvent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Events].[Event]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Events].[spDeleteEvent] TO [cdp_Integration]
    

/* spDelete Permissions for Events */

GRANT EXECUTE ON [Events].[spDeleteEvent] TO [cdp_Integration]



/* Index for Foreign Keys for Industry */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Industries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Industries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Industries
-- Item: vwIndustries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Industries
-----               SCHEMA:      CRM
-----               BASE TABLE:  Industry
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwIndustries]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwIndustries];
GO

CREATE VIEW [CRM].[vwIndustries]
AS
SELECT
    i.*
FROM
    [CRM].[Industry] AS i
GO
GRANT SELECT ON [CRM].[vwIndustries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Industries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Industries
-- Item: Permissions for vwIndustries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwIndustries] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Industries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Industries
-- Item: spCreateIndustry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Industry
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateIndustry]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateIndustry];
GO

CREATE PROCEDURE [CRM].[spCreateIndustry]
    @Name nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Industry]
        (
            [Name]
        )
    VALUES
        (
            @Name
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwIndustries] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateIndustry] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Industries */

GRANT EXECUTE ON [CRM].[spCreateIndustry] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Industries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Industries
-- Item: spUpdateIndustry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Industry
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateIndustry]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateIndustry];
GO

CREATE PROCEDURE [CRM].[spUpdateIndustry]
    @ID int,
    @Name nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Industry]
    SET
        [Name] = @Name
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwIndustries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwIndustries]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateIndustry] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Industry table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateIndustry]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateIndustry];
GO
CREATE TRIGGER [CRM].trgUpdateIndustry
ON [CRM].[Industry]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Industry]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Industry] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Industries */

GRANT EXECUTE ON [CRM].[spUpdateIndustry] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Industries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Industries
-- Item: spDeleteIndustry
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Industry
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteIndustry]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteIndustry];
GO

CREATE PROCEDURE [CRM].[spDeleteIndustry]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Industry]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteIndustry] TO [cdp_Integration]
    

/* spDelete Permissions for Industries */

GRANT EXECUTE ON [CRM].[spDeleteIndustry] TO [cdp_Integration]



/* Index for Foreign Keys for InvoiceLineItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Line Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InvoiceID in table InvoiceLineItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InvoiceLineItem_InvoiceID' 
    AND object_id = OBJECT_ID('[CRM].[InvoiceLineItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InvoiceLineItem_InvoiceID ON [CRM].[InvoiceLineItem] ([InvoiceID]);

-- Index for foreign key ProductID in table InvoiceLineItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InvoiceLineItem_ProductID' 
    AND object_id = OBJECT_ID('[CRM].[InvoiceLineItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InvoiceLineItem_ProductID ON [CRM].[InvoiceLineItem] ([ProductID]);

/* SQL text to update entity field related entity name field map for entity field ID 9009702F-CEBE-4815-9017-BECAFAE8DF7D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9009702F-CEBE-4815-9017-BECAFAE8DF7D',
         @RelatedEntityNameFieldMap='Product'

/* Index for Foreign Keys for Invoice */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AccountID in table Invoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Invoice_AccountID' 
    AND object_id = OBJECT_ID('[CRM].[Invoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Invoice_AccountID ON [CRM].[Invoice] ([AccountID]);

-- Index for foreign key DealID in table Invoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Invoice_DealID' 
    AND object_id = OBJECT_ID('[CRM].[Invoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Invoice_DealID ON [CRM].[Invoice] ([DealID]);

/* SQL text to update entity field related entity name field map for entity field ID 417567C6-6258-41E5-8A18-44DFF22FCAE8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='417567C6-6258-41E5-8A18-44DFF22FCAE8',
         @RelatedEntityNameFieldMap='Account'

/* SQL text to update entity field related entity name field map for entity field ID 6A6EA1E2-719E-4038-9D82-CDF3605A9157 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6A6EA1E2-719E-4038-9D82-CDF3605A9157',
         @RelatedEntityNameFieldMap='Deal'

/* Base View SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: vwInvoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Invoices
-----               SCHEMA:      CRM
-----               BASE TABLE:  Invoice
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwInvoices]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwInvoices];
GO

CREATE VIEW [CRM].[vwInvoices]
AS
SELECT
    i.*,
    Account_AccountID.[Name] AS [Account],
    Deal_DealID.[Name] AS [Deal]
FROM
    [CRM].[Invoice] AS i
INNER JOIN
    [CRM].[Account] AS Account_AccountID
  ON
    [i].[AccountID] = Account_AccountID.[ID]
LEFT OUTER JOIN
    [CRM].[Deal] AS Deal_DealID
  ON
    [i].[DealID] = Deal_DealID.[ID]
GO
GRANT SELECT ON [CRM].[vwInvoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: Permissions for vwInvoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwInvoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: spCreateInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Invoice
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateInvoice];
GO

CREATE PROCEDURE [CRM].[spCreateInvoice]
    @InvoiceNumber nvarchar(50),
    @AccountID int,
    @DealID int,
    @InvoiceDate date,
    @DueDate date,
    @Status nvarchar(20),
    @SubTotal decimal(18, 2),
    @TaxRate decimal(5, 2),
    @AmountPaid decimal(18, 2),
    @Terms nvarchar(100),
    @Notes nvarchar(MAX),
    @BillingStreet nvarchar(100),
    @BillingCity nvarchar(50),
    @BillingState nvarchar(50),
    @BillingPostalCode nvarchar(20),
    @BillingCountry nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Invoice]
        (
            [InvoiceNumber],
                [AccountID],
                [DealID],
                [InvoiceDate],
                [DueDate],
                [Status],
                [SubTotal],
                [TaxRate],
                [AmountPaid],
                [Terms],
                [Notes],
                [BillingStreet],
                [BillingCity],
                [BillingState],
                [BillingPostalCode],
                [BillingCountry]
        )
    VALUES
        (
            @InvoiceNumber,
                @AccountID,
                @DealID,
                @InvoiceDate,
                @DueDate,
                @Status,
                @SubTotal,
                @TaxRate,
                @AmountPaid,
                @Terms,
                @Notes,
                @BillingStreet,
                @BillingCity,
                @BillingState,
                @BillingPostalCode,
                @BillingCountry
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwInvoices] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateInvoice] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Invoices */

GRANT EXECUTE ON [CRM].[spCreateInvoice] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: spUpdateInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Invoice
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateInvoice];
GO

CREATE PROCEDURE [CRM].[spUpdateInvoice]
    @ID int,
    @InvoiceNumber nvarchar(50),
    @AccountID int,
    @DealID int,
    @InvoiceDate date,
    @DueDate date,
    @Status nvarchar(20),
    @SubTotal decimal(18, 2),
    @TaxRate decimal(5, 2),
    @AmountPaid decimal(18, 2),
    @Terms nvarchar(100),
    @Notes nvarchar(MAX),
    @BillingStreet nvarchar(100),
    @BillingCity nvarchar(50),
    @BillingState nvarchar(50),
    @BillingPostalCode nvarchar(20),
    @BillingCountry nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Invoice]
    SET
        [InvoiceNumber] = @InvoiceNumber,
        [AccountID] = @AccountID,
        [DealID] = @DealID,
        [InvoiceDate] = @InvoiceDate,
        [DueDate] = @DueDate,
        [Status] = @Status,
        [SubTotal] = @SubTotal,
        [TaxRate] = @TaxRate,
        [AmountPaid] = @AmountPaid,
        [Terms] = @Terms,
        [Notes] = @Notes,
        [BillingStreet] = @BillingStreet,
        [BillingCity] = @BillingCity,
        [BillingState] = @BillingState,
        [BillingPostalCode] = @BillingPostalCode,
        [BillingCountry] = @BillingCountry
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwInvoices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwInvoices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateInvoice] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Invoice table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateInvoice]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateInvoice];
GO
CREATE TRIGGER [CRM].trgUpdateInvoice
ON [CRM].[Invoice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Invoice]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Invoice] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Invoices */

GRANT EXECUTE ON [CRM].[spUpdateInvoice] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Invoices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoices
-- Item: spDeleteInvoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Invoice
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteInvoice]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteInvoice];
GO

CREATE PROCEDURE [CRM].[spDeleteInvoice]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Invoice]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteInvoice] TO [cdp_Integration]
    

/* spDelete Permissions for Invoices */

GRANT EXECUTE ON [CRM].[spDeleteInvoice] TO [cdp_Integration]



/* Base View SQL for Invoice Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Line Items
-- Item: vwInvoiceLineItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Invoice Line Items
-----               SCHEMA:      CRM
-----               BASE TABLE:  InvoiceLineItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwInvoiceLineItems]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwInvoiceLineItems];
GO

CREATE VIEW [CRM].[vwInvoiceLineItems]
AS
SELECT
    i.*,
    Product_ProductID.[Name] AS [Product]
FROM
    [CRM].[InvoiceLineItem] AS i
LEFT OUTER JOIN
    [CRM].[Product] AS Product_ProductID
  ON
    [i].[ProductID] = Product_ProductID.[ID]
GO
GRANT SELECT ON [CRM].[vwInvoiceLineItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Invoice Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Line Items
-- Item: Permissions for vwInvoiceLineItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwInvoiceLineItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Invoice Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Line Items
-- Item: spCreateInvoiceLineItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InvoiceLineItem
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateInvoiceLineItem]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateInvoiceLineItem];
GO

CREATE PROCEDURE [CRM].[spCreateInvoiceLineItem]
    @InvoiceID int,
    @ProductID int,
    @Description nvarchar(500),
    @Quantity decimal(18, 4),
    @UnitPrice decimal(18, 2),
    @Discount decimal(5, 2)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[InvoiceLineItem]
        (
            [InvoiceID],
                [ProductID],
                [Description],
                [Quantity],
                [UnitPrice],
                [Discount]
        )
    VALUES
        (
            @InvoiceID,
                @ProductID,
                @Description,
                @Quantity,
                @UnitPrice,
                @Discount
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwInvoiceLineItems] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateInvoiceLineItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Invoice Line Items */

GRANT EXECUTE ON [CRM].[spCreateInvoiceLineItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Invoice Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Line Items
-- Item: spUpdateInvoiceLineItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InvoiceLineItem
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateInvoiceLineItem]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateInvoiceLineItem];
GO

CREATE PROCEDURE [CRM].[spUpdateInvoiceLineItem]
    @ID int,
    @InvoiceID int,
    @ProductID int,
    @Description nvarchar(500),
    @Quantity decimal(18, 4),
    @UnitPrice decimal(18, 2),
    @Discount decimal(5, 2)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[InvoiceLineItem]
    SET
        [InvoiceID] = @InvoiceID,
        [ProductID] = @ProductID,
        [Description] = @Description,
        [Quantity] = @Quantity,
        [UnitPrice] = @UnitPrice,
        [Discount] = @Discount
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwInvoiceLineItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwInvoiceLineItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateInvoiceLineItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InvoiceLineItem table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateInvoiceLineItem]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateInvoiceLineItem];
GO
CREATE TRIGGER [CRM].trgUpdateInvoiceLineItem
ON [CRM].[InvoiceLineItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[InvoiceLineItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[InvoiceLineItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Invoice Line Items */

GRANT EXECUTE ON [CRM].[spUpdateInvoiceLineItem] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Invoice Line Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Invoice Line Items
-- Item: spDeleteInvoiceLineItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InvoiceLineItem
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteInvoiceLineItem]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteInvoiceLineItem];
GO

CREATE PROCEDURE [CRM].[spDeleteInvoiceLineItem]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[InvoiceLineItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteInvoiceLineItem] TO [cdp_Integration]
    

/* spDelete Permissions for Invoice Line Items */

GRANT EXECUTE ON [CRM].[spDeleteInvoiceLineItem] TO [cdp_Integration]



/* Index for Foreign Keys for Payment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InvoiceID in table Payment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Payment_InvoiceID' 
    AND object_id = OBJECT_ID('[CRM].[Payment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Payment_InvoiceID ON [CRM].[Payment] ([InvoiceID]);

/* Base View SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: vwPayments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Payments
-----               SCHEMA:      CRM
-----               BASE TABLE:  Payment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwPayments]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwPayments];
GO

CREATE VIEW [CRM].[vwPayments]
AS
SELECT
    p.*
FROM
    [CRM].[Payment] AS p
GO
GRANT SELECT ON [CRM].[vwPayments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: Permissions for vwPayments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwPayments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: spCreatePayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Payment
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreatePayment]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreatePayment];
GO

CREATE PROCEDURE [CRM].[spCreatePayment]
    @InvoiceID int,
    @PaymentDate date,
    @Amount decimal(18, 2),
    @PaymentMethod nvarchar(50),
    @ReferenceNumber nvarchar(100),
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Payment]
        (
            [InvoiceID],
                [PaymentDate],
                [Amount],
                [PaymentMethod],
                [ReferenceNumber],
                [Notes]
        )
    VALUES
        (
            @InvoiceID,
                @PaymentDate,
                @Amount,
                @PaymentMethod,
                @ReferenceNumber,
                @Notes
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwPayments] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreatePayment] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Payments */

GRANT EXECUTE ON [CRM].[spCreatePayment] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: spUpdatePayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Payment
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdatePayment]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdatePayment];
GO

CREATE PROCEDURE [CRM].[spUpdatePayment]
    @ID int,
    @InvoiceID int,
    @PaymentDate date,
    @Amount decimal(18, 2),
    @PaymentMethod nvarchar(50),
    @ReferenceNumber nvarchar(100),
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Payment]
    SET
        [InvoiceID] = @InvoiceID,
        [PaymentDate] = @PaymentDate,
        [Amount] = @Amount,
        [PaymentMethod] = @PaymentMethod,
        [ReferenceNumber] = @ReferenceNumber,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwPayments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwPayments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdatePayment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Payment table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdatePayment]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdatePayment];
GO
CREATE TRIGGER [CRM].trgUpdatePayment
ON [CRM].[Payment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Payment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Payment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Payments */

GRANT EXECUTE ON [CRM].[spUpdatePayment] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Payments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Payments
-- Item: spDeletePayment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Payment
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeletePayment]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeletePayment];
GO

CREATE PROCEDURE [CRM].[spDeletePayment]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Payment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeletePayment] TO [cdp_Integration]
    

/* spDelete Permissions for Payments */

GRANT EXECUTE ON [CRM].[spDeletePayment] TO [cdp_Integration]



/* Index for Foreign Keys for Product */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


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
-----               SCHEMA:      CRM
-----               BASE TABLE:  Product
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwProducts];
GO

CREATE VIEW [CRM].[vwProducts]
AS
SELECT
    p.*
FROM
    [CRM].[Product] AS p
GO
GRANT SELECT ON [CRM].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
IF OBJECT_ID('[CRM].[spCreateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateProduct];
GO

CREATE PROCEDURE [CRM].[spCreateProduct]
    @ProductCode nvarchar(50),
    @Name nvarchar(200),
    @Category nvarchar(100),
    @Description nvarchar(MAX),
    @UnitPrice decimal(18, 2),
    @Cost decimal(18, 2),
    @IsActive bit,
    @SKU nvarchar(50),
    @UnitOfMeasure nvarchar(20),
    @RecurringBillingPeriod nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[Product]
        (
            [ProductCode],
                [Name],
                [Category],
                [Description],
                [UnitPrice],
                [Cost],
                [IsActive],
                [SKU],
                [UnitOfMeasure],
                [RecurringBillingPeriod]
        )
    VALUES
        (
            @ProductCode,
                @Name,
                @Category,
                @Description,
                @UnitPrice,
                @Cost,
                @IsActive,
                @SKU,
                @UnitOfMeasure,
                @RecurringBillingPeriod
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwProducts] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateProduct] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Products */

GRANT EXECUTE ON [CRM].[spCreateProduct] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[CRM].[spUpdateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateProduct];
GO

CREATE PROCEDURE [CRM].[spUpdateProduct]
    @ID int,
    @ProductCode nvarchar(50),
    @Name nvarchar(200),
    @Category nvarchar(100),
    @Description nvarchar(MAX),
    @UnitPrice decimal(18, 2),
    @Cost decimal(18, 2),
    @IsActive bit,
    @SKU nvarchar(50),
    @UnitOfMeasure nvarchar(20),
    @RecurringBillingPeriod nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Product]
    SET
        [ProductCode] = @ProductCode,
        [Name] = @Name,
        [Category] = @Category,
        [Description] = @Description,
        [UnitPrice] = @UnitPrice,
        [Cost] = @Cost,
        [IsActive] = @IsActive,
        [SKU] = @SKU,
        [UnitOfMeasure] = @UnitOfMeasure,
        [RecurringBillingPeriod] = @RecurringBillingPeriod
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateProduct];
GO
CREATE TRIGGER [CRM].trgUpdateProduct
ON [CRM].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Product]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[Product] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Products */

GRANT EXECUTE ON [CRM].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[CRM].[spDeleteProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteProduct];
GO

CREATE PROCEDURE [CRM].[spDeleteProduct]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[Product]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteProduct] TO [cdp_Integration]
    

/* spDelete Permissions for Products */

GRANT EXECUTE ON [CRM].[spDeleteProduct] TO [cdp_Integration]



/* Index for Foreign Keys for RelationshipType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key InverseRelationshipID in table RelationshipType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RelationshipType_InverseRelationshipID' 
    AND object_id = OBJECT_ID('[CRM].[RelationshipType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RelationshipType_InverseRelationshipID ON [CRM].[RelationshipType] ([InverseRelationshipID]);

/* Root ID Function SQL for Relationship Types.InverseRelationshipID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: fnRelationshipTypeInverseRelationshipID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [RelationshipType].[InverseRelationshipID]
------------------------------------------------------------
IF OBJECT_ID('[CRM].[fnRelationshipTypeInverseRelationshipID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [CRM].[fnRelationshipTypeInverseRelationshipID_GetRootID];
GO

CREATE FUNCTION [CRM].[fnRelationshipTypeInverseRelationshipID_GetRootID]
(
    @RecordID int,
    @ParentID int
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [InverseRelationshipID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [CRM].[RelationshipType]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until InverseRelationshipID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[InverseRelationshipID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [CRM].[RelationshipType] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[InverseRelationshipID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [InverseRelationshipID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID BC399C8B-A7FC-4475-9875-88F6CD560320 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BC399C8B-A7FC-4475-9875-88F6CD560320',
         @RelatedEntityNameFieldMap='InverseRelationship'

/* Base View SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: vwRelationshipTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Relationship Types
-----               SCHEMA:      CRM
-----               BASE TABLE:  RelationshipType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwRelationshipTypes]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwRelationshipTypes];
GO

CREATE VIEW [CRM].[vwRelationshipTypes]
AS
SELECT
    r.*,
    RelationshipType_InverseRelationshipID.[Name] AS [InverseRelationship],
    root_InverseRelationshipID.RootID AS [RootInverseRelationshipID]
FROM
    [CRM].[RelationshipType] AS r
LEFT OUTER JOIN
    [CRM].[RelationshipType] AS RelationshipType_InverseRelationshipID
  ON
    [r].[InverseRelationshipID] = RelationshipType_InverseRelationshipID.[ID]
OUTER APPLY
    [CRM].[fnRelationshipTypeInverseRelationshipID_GetRootID]([r].[ID], [r].[InverseRelationshipID]) AS root_InverseRelationshipID
GO
GRANT SELECT ON [CRM].[vwRelationshipTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: Permissions for vwRelationshipTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwRelationshipTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: spCreateRelationshipType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RelationshipType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateRelationshipType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateRelationshipType];
GO

CREATE PROCEDURE [CRM].[spCreateRelationshipType]
    @Name nvarchar(50),
    @IsBidirectional bit = NULL,
    @InverseRelationshipID int
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [CRM].[RelationshipType]
        (
            [Name],
                [IsBidirectional],
                [InverseRelationshipID]
        )
    VALUES
        (
            @Name,
                ISNULL(@IsBidirectional, 0),
                @InverseRelationshipID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwRelationshipTypes] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [CRM].[spCreateRelationshipType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Relationship Types */

GRANT EXECUTE ON [CRM].[spCreateRelationshipType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: spUpdateRelationshipType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RelationshipType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateRelationshipType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateRelationshipType];
GO

CREATE PROCEDURE [CRM].[spUpdateRelationshipType]
    @ID int,
    @Name nvarchar(50),
    @IsBidirectional bit,
    @InverseRelationshipID int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[RelationshipType]
    SET
        [Name] = @Name,
        [IsBidirectional] = @IsBidirectional,
        [InverseRelationshipID] = @InverseRelationshipID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwRelationshipTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwRelationshipTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateRelationshipType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RelationshipType table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateRelationshipType]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateRelationshipType];
GO
CREATE TRIGGER [CRM].trgUpdateRelationshipType
ON [CRM].[RelationshipType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[RelationshipType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [CRM].[RelationshipType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Relationship Types */

GRANT EXECUTE ON [CRM].[spUpdateRelationshipType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Relationship Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Relationship Types
-- Item: spDeleteRelationshipType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RelationshipType
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteRelationshipType]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteRelationshipType];
GO

CREATE PROCEDURE [CRM].[spDeleteRelationshipType]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [CRM].[RelationshipType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [CRM].[spDeleteRelationshipType] TO [cdp_Integration]
    

/* spDelete Permissions for Relationship Types */

GRANT EXECUTE ON [CRM].[spDeleteRelationshipType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 9796443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9796443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 3196443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3196443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 3996443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3996443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 3B96443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3B96443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 9996443E-F36B-1410-8DCD-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9996443E-F36B-1410-8DCD-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* Index for Foreign Keys for Speaker */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Speakers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContactID in table Speaker
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Speaker_ContactID' 
    AND object_id = OBJECT_ID('[Events].[Speaker]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Speaker_ContactID ON [Events].[Speaker] ([ContactID]);

/* Index for Foreign Keys for SubmissionNotification */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Notifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SubmissionID in table SubmissionNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubmissionNotification_SubmissionID' 
    AND object_id = OBJECT_ID('[Events].[SubmissionNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubmissionNotification_SubmissionID ON [Events].[SubmissionNotification] ([SubmissionID]);

/* Index for Foreign Keys for SubmissionReview */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Reviews
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SubmissionID in table SubmissionReview
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubmissionReview_SubmissionID' 
    AND object_id = OBJECT_ID('[Events].[SubmissionReview]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubmissionReview_SubmissionID ON [Events].[SubmissionReview] ([SubmissionID]);

-- Index for foreign key ReviewerContactID in table SubmissionReview
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubmissionReview_ReviewerContactID' 
    AND object_id = OBJECT_ID('[Events].[SubmissionReview]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubmissionReview_ReviewerContactID ON [Events].[SubmissionReview] ([ReviewerContactID]);

/* Index for Foreign Keys for SubmissionSpeaker */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Speakers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SubmissionID in table SubmissionSpeaker
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubmissionSpeaker_SubmissionID' 
    AND object_id = OBJECT_ID('[Events].[SubmissionSpeaker]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubmissionSpeaker_SubmissionID ON [Events].[SubmissionSpeaker] ([SubmissionID]);

-- Index for foreign key SpeakerID in table SubmissionSpeaker
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubmissionSpeaker_SpeakerID' 
    AND object_id = OBJECT_ID('[Events].[SubmissionSpeaker]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubmissionSpeaker_SpeakerID ON [Events].[SubmissionSpeaker] ([SpeakerID]);

/* Index for Foreign Keys for Submission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EventID in table Submission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Submission_EventID' 
    AND object_id = OBJECT_ID('[Events].[Submission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Submission_EventID ON [Events].[Submission] ([EventID]);

-- Index for foreign key ResubmissionOfID in table Submission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Submission_ResubmissionOfID' 
    AND object_id = OBJECT_ID('[Events].[Submission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Submission_ResubmissionOfID ON [Events].[Submission] ([ResubmissionOfID]);

/* Root ID Function SQL for Submissions.ResubmissionOfID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submissions
-- Item: fnSubmissionResubmissionOfID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Submission].[ResubmissionOfID]
------------------------------------------------------------
IF OBJECT_ID('[Events].[fnSubmissionResubmissionOfID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [Events].[fnSubmissionResubmissionOfID_GetRootID];
GO

CREATE FUNCTION [Events].[fnSubmissionResubmissionOfID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ResubmissionOfID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [Events].[Submission]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ResubmissionOfID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ResubmissionOfID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [Events].[Submission] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ResubmissionOfID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ResubmissionOfID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 2AFAF9C2-3647-4289-8F45-0E7A67284F29 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2AFAF9C2-3647-4289-8F45-0E7A67284F29',
         @RelatedEntityNameFieldMap='Event'

/* Base View SQL for Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Speakers
-- Item: vwSpeakers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Speakers
-----               SCHEMA:      Events
-----               BASE TABLE:  Speaker
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Events].[vwSpeakers]', 'V') IS NOT NULL
    DROP VIEW [Events].[vwSpeakers];
GO

CREATE VIEW [Events].[vwSpeakers]
AS
SELECT
    s.*
FROM
    [Events].[Speaker] AS s
GO
GRANT SELECT ON [Events].[vwSpeakers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Speakers
-- Item: Permissions for vwSpeakers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Events].[vwSpeakers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Speakers
-- Item: spCreateSpeaker
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Speaker
------------------------------------------------------------
IF OBJECT_ID('[Events].[spCreateSpeaker]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spCreateSpeaker];
GO

CREATE PROCEDURE [Events].[spCreateSpeaker]
    @ID uniqueidentifier = NULL,
    @ContactID int,
    @FullName nvarchar(200),
    @Email nvarchar(100),
    @PhoneNumber nvarchar(20),
    @Title nvarchar(100),
    @Organization nvarchar(200),
    @Bio nvarchar(MAX),
    @LinkedInURL nvarchar(255),
    @TwitterHandle nvarchar(50),
    @WebsiteURL nvarchar(255),
    @PhotoURL nvarchar(255),
    @SpeakingExperience nvarchar(MAX),
    @DossierResearchedAt datetime,
    @DossierJSON nvarchar(MAX),
    @DossierSummary nvarchar(MAX),
    @CredibilityScore decimal(5, 2),
    @SpeakingHistory nvarchar(MAX),
    @Expertise nvarchar(MAX),
    @PublicationsCount int,
    @SocialMediaReach int,
    @RedFlags nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Events].[Speaker]
            (
                [ID],
                [ContactID],
                [FullName],
                [Email],
                [PhoneNumber],
                [Title],
                [Organization],
                [Bio],
                [LinkedInURL],
                [TwitterHandle],
                [WebsiteURL],
                [PhotoURL],
                [SpeakingExperience],
                [DossierResearchedAt],
                [DossierJSON],
                [DossierSummary],
                [CredibilityScore],
                [SpeakingHistory],
                [Expertise],
                [PublicationsCount],
                [SocialMediaReach],
                [RedFlags]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContactID,
                @FullName,
                @Email,
                @PhoneNumber,
                @Title,
                @Organization,
                @Bio,
                @LinkedInURL,
                @TwitterHandle,
                @WebsiteURL,
                @PhotoURL,
                @SpeakingExperience,
                @DossierResearchedAt,
                @DossierJSON,
                @DossierSummary,
                @CredibilityScore,
                @SpeakingHistory,
                @Expertise,
                @PublicationsCount,
                @SocialMediaReach,
                @RedFlags
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Events].[Speaker]
            (
                [ContactID],
                [FullName],
                [Email],
                [PhoneNumber],
                [Title],
                [Organization],
                [Bio],
                [LinkedInURL],
                [TwitterHandle],
                [WebsiteURL],
                [PhotoURL],
                [SpeakingExperience],
                [DossierResearchedAt],
                [DossierJSON],
                [DossierSummary],
                [CredibilityScore],
                [SpeakingHistory],
                [Expertise],
                [PublicationsCount],
                [SocialMediaReach],
                [RedFlags]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContactID,
                @FullName,
                @Email,
                @PhoneNumber,
                @Title,
                @Organization,
                @Bio,
                @LinkedInURL,
                @TwitterHandle,
                @WebsiteURL,
                @PhotoURL,
                @SpeakingExperience,
                @DossierResearchedAt,
                @DossierJSON,
                @DossierSummary,
                @CredibilityScore,
                @SpeakingHistory,
                @Expertise,
                @PublicationsCount,
                @SocialMediaReach,
                @RedFlags
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Events].[vwSpeakers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Events].[spCreateSpeaker] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Speakers */

GRANT EXECUTE ON [Events].[spCreateSpeaker] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Speakers
-- Item: spUpdateSpeaker
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Speaker
------------------------------------------------------------
IF OBJECT_ID('[Events].[spUpdateSpeaker]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spUpdateSpeaker];
GO

CREATE PROCEDURE [Events].[spUpdateSpeaker]
    @ID uniqueidentifier,
    @ContactID int,
    @FullName nvarchar(200),
    @Email nvarchar(100),
    @PhoneNumber nvarchar(20),
    @Title nvarchar(100),
    @Organization nvarchar(200),
    @Bio nvarchar(MAX),
    @LinkedInURL nvarchar(255),
    @TwitterHandle nvarchar(50),
    @WebsiteURL nvarchar(255),
    @PhotoURL nvarchar(255),
    @SpeakingExperience nvarchar(MAX),
    @DossierResearchedAt datetime,
    @DossierJSON nvarchar(MAX),
    @DossierSummary nvarchar(MAX),
    @CredibilityScore decimal(5, 2),
    @SpeakingHistory nvarchar(MAX),
    @Expertise nvarchar(MAX),
    @PublicationsCount int,
    @SocialMediaReach int,
    @RedFlags nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[Speaker]
    SET
        [ContactID] = @ContactID,
        [FullName] = @FullName,
        [Email] = @Email,
        [PhoneNumber] = @PhoneNumber,
        [Title] = @Title,
        [Organization] = @Organization,
        [Bio] = @Bio,
        [LinkedInURL] = @LinkedInURL,
        [TwitterHandle] = @TwitterHandle,
        [WebsiteURL] = @WebsiteURL,
        [PhotoURL] = @PhotoURL,
        [SpeakingExperience] = @SpeakingExperience,
        [DossierResearchedAt] = @DossierResearchedAt,
        [DossierJSON] = @DossierJSON,
        [DossierSummary] = @DossierSummary,
        [CredibilityScore] = @CredibilityScore,
        [SpeakingHistory] = @SpeakingHistory,
        [Expertise] = @Expertise,
        [PublicationsCount] = @PublicationsCount,
        [SocialMediaReach] = @SocialMediaReach,
        [RedFlags] = @RedFlags
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Events].[vwSpeakers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Events].[vwSpeakers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Events].[spUpdateSpeaker] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Speaker table
------------------------------------------------------------
IF OBJECT_ID('[Events].[trgUpdateSpeaker]', 'TR') IS NOT NULL
    DROP TRIGGER [Events].[trgUpdateSpeaker];
GO
CREATE TRIGGER [Events].trgUpdateSpeaker
ON [Events].[Speaker]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[Speaker]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Events].[Speaker] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Speakers */

GRANT EXECUTE ON [Events].[spUpdateSpeaker] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Speakers
-- Item: spDeleteSpeaker
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Speaker
------------------------------------------------------------
IF OBJECT_ID('[Events].[spDeleteSpeaker]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spDeleteSpeaker];
GO

CREATE PROCEDURE [Events].[spDeleteSpeaker]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Events].[Speaker]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Events].[spDeleteSpeaker] TO [cdp_Integration]
    

/* spDelete Permissions for Speakers */

GRANT EXECUTE ON [Events].[spDeleteSpeaker] TO [cdp_Integration]



/* Base View SQL for Submission Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Notifications
-- Item: vwSubmissionNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Submission Notifications
-----               SCHEMA:      Events
-----               BASE TABLE:  SubmissionNotification
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Events].[vwSubmissionNotifications]', 'V') IS NOT NULL
    DROP VIEW [Events].[vwSubmissionNotifications];
GO

CREATE VIEW [Events].[vwSubmissionNotifications]
AS
SELECT
    s.*
FROM
    [Events].[SubmissionNotification] AS s
GO
GRANT SELECT ON [Events].[vwSubmissionNotifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Submission Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Notifications
-- Item: Permissions for vwSubmissionNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Events].[vwSubmissionNotifications] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Submission Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Notifications
-- Item: spCreateSubmissionNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubmissionNotification
------------------------------------------------------------
IF OBJECT_ID('[Events].[spCreateSubmissionNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spCreateSubmissionNotification];
GO

CREATE PROCEDURE [Events].[spCreateSubmissionNotification]
    @ID uniqueidentifier = NULL,
    @SubmissionID uniqueidentifier,
    @NotificationType nvarchar(50),
    @SentAt datetime = NULL,
    @RecipientEmail nvarchar(100),
    @Subject nvarchar(500),
    @MessageBody nvarchar(MAX),
    @DeliveryStatus nvarchar(50),
    @ClickedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Events].[SubmissionNotification]
            (
                [ID],
                [SubmissionID],
                [NotificationType],
                [SentAt],
                [RecipientEmail],
                [Subject],
                [MessageBody],
                [DeliveryStatus],
                [ClickedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SubmissionID,
                @NotificationType,
                ISNULL(@SentAt, getdate()),
                @RecipientEmail,
                @Subject,
                @MessageBody,
                @DeliveryStatus,
                @ClickedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Events].[SubmissionNotification]
            (
                [SubmissionID],
                [NotificationType],
                [SentAt],
                [RecipientEmail],
                [Subject],
                [MessageBody],
                [DeliveryStatus],
                [ClickedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SubmissionID,
                @NotificationType,
                ISNULL(@SentAt, getdate()),
                @RecipientEmail,
                @Subject,
                @MessageBody,
                @DeliveryStatus,
                @ClickedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Events].[vwSubmissionNotifications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Events].[spCreateSubmissionNotification] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Submission Notifications */

GRANT EXECUTE ON [Events].[spCreateSubmissionNotification] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Submission Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Notifications
-- Item: spUpdateSubmissionNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubmissionNotification
------------------------------------------------------------
IF OBJECT_ID('[Events].[spUpdateSubmissionNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spUpdateSubmissionNotification];
GO

CREATE PROCEDURE [Events].[spUpdateSubmissionNotification]
    @ID uniqueidentifier,
    @SubmissionID uniqueidentifier,
    @NotificationType nvarchar(50),
    @SentAt datetime,
    @RecipientEmail nvarchar(100),
    @Subject nvarchar(500),
    @MessageBody nvarchar(MAX),
    @DeliveryStatus nvarchar(50),
    @ClickedAt datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[SubmissionNotification]
    SET
        [SubmissionID] = @SubmissionID,
        [NotificationType] = @NotificationType,
        [SentAt] = @SentAt,
        [RecipientEmail] = @RecipientEmail,
        [Subject] = @Subject,
        [MessageBody] = @MessageBody,
        [DeliveryStatus] = @DeliveryStatus,
        [ClickedAt] = @ClickedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Events].[vwSubmissionNotifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Events].[vwSubmissionNotifications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Events].[spUpdateSubmissionNotification] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubmissionNotification table
------------------------------------------------------------
IF OBJECT_ID('[Events].[trgUpdateSubmissionNotification]', 'TR') IS NOT NULL
    DROP TRIGGER [Events].[trgUpdateSubmissionNotification];
GO
CREATE TRIGGER [Events].trgUpdateSubmissionNotification
ON [Events].[SubmissionNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[SubmissionNotification]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Events].[SubmissionNotification] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Submission Notifications */

GRANT EXECUTE ON [Events].[spUpdateSubmissionNotification] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Submission Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Notifications
-- Item: spDeleteSubmissionNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubmissionNotification
------------------------------------------------------------
IF OBJECT_ID('[Events].[spDeleteSubmissionNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spDeleteSubmissionNotification];
GO

CREATE PROCEDURE [Events].[spDeleteSubmissionNotification]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Events].[SubmissionNotification]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Events].[spDeleteSubmissionNotification] TO [cdp_Integration]
    

/* spDelete Permissions for Submission Notifications */

GRANT EXECUTE ON [Events].[spDeleteSubmissionNotification] TO [cdp_Integration]



/* Base View SQL for Submission Reviews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Reviews
-- Item: vwSubmissionReviews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Submission Reviews
-----               SCHEMA:      Events
-----               BASE TABLE:  SubmissionReview
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Events].[vwSubmissionReviews]', 'V') IS NOT NULL
    DROP VIEW [Events].[vwSubmissionReviews];
GO

CREATE VIEW [Events].[vwSubmissionReviews]
AS
SELECT
    s.*
FROM
    [Events].[SubmissionReview] AS s
GO
GRANT SELECT ON [Events].[vwSubmissionReviews] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Submission Reviews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Reviews
-- Item: Permissions for vwSubmissionReviews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Events].[vwSubmissionReviews] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Submission Reviews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Reviews
-- Item: spCreateSubmissionReview
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubmissionReview
------------------------------------------------------------
IF OBJECT_ID('[Events].[spCreateSubmissionReview]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spCreateSubmissionReview];
GO

CREATE PROCEDURE [Events].[spCreateSubmissionReview]
    @ID uniqueidentifier = NULL,
    @SubmissionID uniqueidentifier,
    @ReviewerContactID int,
    @ReviewedAt datetime = NULL,
    @OverallScore decimal(3, 1),
    @RelevanceScore decimal(3, 1),
    @QualityScore decimal(3, 1),
    @SpeakerExperienceScore decimal(3, 1),
    @Comments nvarchar(MAX),
    @Recommendation nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Events].[SubmissionReview]
            (
                [ID],
                [SubmissionID],
                [ReviewerContactID],
                [ReviewedAt],
                [OverallScore],
                [RelevanceScore],
                [QualityScore],
                [SpeakerExperienceScore],
                [Comments],
                [Recommendation]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SubmissionID,
                @ReviewerContactID,
                ISNULL(@ReviewedAt, getdate()),
                @OverallScore,
                @RelevanceScore,
                @QualityScore,
                @SpeakerExperienceScore,
                @Comments,
                @Recommendation
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Events].[SubmissionReview]
            (
                [SubmissionID],
                [ReviewerContactID],
                [ReviewedAt],
                [OverallScore],
                [RelevanceScore],
                [QualityScore],
                [SpeakerExperienceScore],
                [Comments],
                [Recommendation]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SubmissionID,
                @ReviewerContactID,
                ISNULL(@ReviewedAt, getdate()),
                @OverallScore,
                @RelevanceScore,
                @QualityScore,
                @SpeakerExperienceScore,
                @Comments,
                @Recommendation
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Events].[vwSubmissionReviews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Events].[spCreateSubmissionReview] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Submission Reviews */

GRANT EXECUTE ON [Events].[spCreateSubmissionReview] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Submission Reviews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Reviews
-- Item: spUpdateSubmissionReview
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubmissionReview
------------------------------------------------------------
IF OBJECT_ID('[Events].[spUpdateSubmissionReview]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spUpdateSubmissionReview];
GO

CREATE PROCEDURE [Events].[spUpdateSubmissionReview]
    @ID uniqueidentifier,
    @SubmissionID uniqueidentifier,
    @ReviewerContactID int,
    @ReviewedAt datetime,
    @OverallScore decimal(3, 1),
    @RelevanceScore decimal(3, 1),
    @QualityScore decimal(3, 1),
    @SpeakerExperienceScore decimal(3, 1),
    @Comments nvarchar(MAX),
    @Recommendation nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[SubmissionReview]
    SET
        [SubmissionID] = @SubmissionID,
        [ReviewerContactID] = @ReviewerContactID,
        [ReviewedAt] = @ReviewedAt,
        [OverallScore] = @OverallScore,
        [RelevanceScore] = @RelevanceScore,
        [QualityScore] = @QualityScore,
        [SpeakerExperienceScore] = @SpeakerExperienceScore,
        [Comments] = @Comments,
        [Recommendation] = @Recommendation
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Events].[vwSubmissionReviews] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Events].[vwSubmissionReviews]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Events].[spUpdateSubmissionReview] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubmissionReview table
------------------------------------------------------------
IF OBJECT_ID('[Events].[trgUpdateSubmissionReview]', 'TR') IS NOT NULL
    DROP TRIGGER [Events].[trgUpdateSubmissionReview];
GO
CREATE TRIGGER [Events].trgUpdateSubmissionReview
ON [Events].[SubmissionReview]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[SubmissionReview]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Events].[SubmissionReview] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Submission Reviews */

GRANT EXECUTE ON [Events].[spUpdateSubmissionReview] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Submission Reviews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Reviews
-- Item: spDeleteSubmissionReview
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubmissionReview
------------------------------------------------------------
IF OBJECT_ID('[Events].[spDeleteSubmissionReview]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spDeleteSubmissionReview];
GO

CREATE PROCEDURE [Events].[spDeleteSubmissionReview]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Events].[SubmissionReview]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Events].[spDeleteSubmissionReview] TO [cdp_Integration]
    

/* spDelete Permissions for Submission Reviews */

GRANT EXECUTE ON [Events].[spDeleteSubmissionReview] TO [cdp_Integration]



/* Base View SQL for Submission Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Speakers
-- Item: vwSubmissionSpeakers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Submission Speakers
-----               SCHEMA:      Events
-----               BASE TABLE:  SubmissionSpeaker
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Events].[vwSubmissionSpeakers]', 'V') IS NOT NULL
    DROP VIEW [Events].[vwSubmissionSpeakers];
GO

CREATE VIEW [Events].[vwSubmissionSpeakers]
AS
SELECT
    s.*
FROM
    [Events].[SubmissionSpeaker] AS s
GO
GRANT SELECT ON [Events].[vwSubmissionSpeakers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Submission Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Speakers
-- Item: Permissions for vwSubmissionSpeakers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Events].[vwSubmissionSpeakers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Submission Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Speakers
-- Item: spCreateSubmissionSpeaker
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubmissionSpeaker
------------------------------------------------------------
IF OBJECT_ID('[Events].[spCreateSubmissionSpeaker]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spCreateSubmissionSpeaker];
GO

CREATE PROCEDURE [Events].[spCreateSubmissionSpeaker]
    @ID uniqueidentifier = NULL,
    @SubmissionID uniqueidentifier,
    @SpeakerID uniqueidentifier,
    @IsPrimaryContact bit,
    @Role nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Events].[SubmissionSpeaker]
            (
                [ID],
                [SubmissionID],
                [SpeakerID],
                [IsPrimaryContact],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SubmissionID,
                @SpeakerID,
                @IsPrimaryContact,
                @Role
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Events].[SubmissionSpeaker]
            (
                [SubmissionID],
                [SpeakerID],
                [IsPrimaryContact],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SubmissionID,
                @SpeakerID,
                @IsPrimaryContact,
                @Role
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Events].[vwSubmissionSpeakers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Events].[spCreateSubmissionSpeaker] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Submission Speakers */

GRANT EXECUTE ON [Events].[spCreateSubmissionSpeaker] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Submission Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Speakers
-- Item: spUpdateSubmissionSpeaker
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubmissionSpeaker
------------------------------------------------------------
IF OBJECT_ID('[Events].[spUpdateSubmissionSpeaker]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spUpdateSubmissionSpeaker];
GO

CREATE PROCEDURE [Events].[spUpdateSubmissionSpeaker]
    @ID uniqueidentifier,
    @SubmissionID uniqueidentifier,
    @SpeakerID uniqueidentifier,
    @IsPrimaryContact bit,
    @Role nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[SubmissionSpeaker]
    SET
        [SubmissionID] = @SubmissionID,
        [SpeakerID] = @SpeakerID,
        [IsPrimaryContact] = @IsPrimaryContact,
        [Role] = @Role
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Events].[vwSubmissionSpeakers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Events].[vwSubmissionSpeakers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Events].[spUpdateSubmissionSpeaker] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubmissionSpeaker table
------------------------------------------------------------
IF OBJECT_ID('[Events].[trgUpdateSubmissionSpeaker]', 'TR') IS NOT NULL
    DROP TRIGGER [Events].[trgUpdateSubmissionSpeaker];
GO
CREATE TRIGGER [Events].trgUpdateSubmissionSpeaker
ON [Events].[SubmissionSpeaker]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[SubmissionSpeaker]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Events].[SubmissionSpeaker] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Submission Speakers */

GRANT EXECUTE ON [Events].[spUpdateSubmissionSpeaker] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Submission Speakers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submission Speakers
-- Item: spDeleteSubmissionSpeaker
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubmissionSpeaker
------------------------------------------------------------
IF OBJECT_ID('[Events].[spDeleteSubmissionSpeaker]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spDeleteSubmissionSpeaker];
GO

CREATE PROCEDURE [Events].[spDeleteSubmissionSpeaker]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Events].[SubmissionSpeaker]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Events].[spDeleteSubmissionSpeaker] TO [cdp_Integration]
    

/* spDelete Permissions for Submission Speakers */

GRANT EXECUTE ON [Events].[spDeleteSubmissionSpeaker] TO [cdp_Integration]



/* Base View SQL for Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submissions
-- Item: vwSubmissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Submissions
-----               SCHEMA:      Events
-----               BASE TABLE:  Submission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Events].[vwSubmissions]', 'V') IS NOT NULL
    DROP VIEW [Events].[vwSubmissions];
GO

CREATE VIEW [Events].[vwSubmissions]
AS
SELECT
    s.*,
    Event_EventID.[Name] AS [Event],
    root_ResubmissionOfID.RootID AS [RootResubmissionOfID]
FROM
    [Events].[Submission] AS s
INNER JOIN
    [Events].[Event] AS Event_EventID
  ON
    [s].[EventID] = Event_EventID.[ID]
OUTER APPLY
    [Events].[fnSubmissionResubmissionOfID_GetRootID]([s].[ID], [s].[ResubmissionOfID]) AS root_ResubmissionOfID
GO
GRANT SELECT ON [Events].[vwSubmissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submissions
-- Item: Permissions for vwSubmissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Events].[vwSubmissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submissions
-- Item: spCreateSubmission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Submission
------------------------------------------------------------
IF OBJECT_ID('[Events].[spCreateSubmission]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spCreateSubmission];
GO

CREATE PROCEDURE [Events].[spCreateSubmission]
    @ID uniqueidentifier = NULL,
    @EventID uniqueidentifier,
    @TypeformResponseID nvarchar(100),
    @SubmittedAt datetime = NULL,
    @Status nvarchar(50) = NULL,
    @SubmissionTitle nvarchar(500),
    @SubmissionAbstract nvarchar(MAX),
    @SubmissionSummary nvarchar(MAX),
    @SessionFormat nvarchar(50),
    @Duration int,
    @TargetAudienceLevel nvarchar(50),
    @KeyTopics nvarchar(MAX),
    @PresentationFileURL nvarchar(500),
    @PresentationFileSummary nvarchar(MAX),
    @AdditionalMaterialsURLs nvarchar(MAX),
    @SpecialRequirements nvarchar(MAX),
    @AIEvaluationScore decimal(5, 2),
    @AIEvaluationReasoning nvarchar(MAX),
    @AIEvaluationDimensions nvarchar(MAX),
    @PassedInitialScreening bit,
    @FailureReasons nvarchar(MAX),
    @IsFixable bit,
    @ResubmissionOfID uniqueidentifier,
    @ReviewNotes nvarchar(MAX),
    @FinalDecision nvarchar(50),
    @FinalDecisionDate datetime,
    @FinalDecisionReasoning nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Events].[Submission]
            (
                [ID],
                [EventID],
                [TypeformResponseID],
                [SubmittedAt],
                [Status],
                [SubmissionTitle],
                [SubmissionAbstract],
                [SubmissionSummary],
                [SessionFormat],
                [Duration],
                [TargetAudienceLevel],
                [KeyTopics],
                [PresentationFileURL],
                [PresentationFileSummary],
                [AdditionalMaterialsURLs],
                [SpecialRequirements],
                [AIEvaluationScore],
                [AIEvaluationReasoning],
                [AIEvaluationDimensions],
                [PassedInitialScreening],
                [FailureReasons],
                [IsFixable],
                [ResubmissionOfID],
                [ReviewNotes],
                [FinalDecision],
                [FinalDecisionDate],
                [FinalDecisionReasoning]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EventID,
                @TypeformResponseID,
                ISNULL(@SubmittedAt, getdate()),
                ISNULL(@Status, 'New'),
                @SubmissionTitle,
                @SubmissionAbstract,
                @SubmissionSummary,
                @SessionFormat,
                @Duration,
                @TargetAudienceLevel,
                @KeyTopics,
                @PresentationFileURL,
                @PresentationFileSummary,
                @AdditionalMaterialsURLs,
                @SpecialRequirements,
                @AIEvaluationScore,
                @AIEvaluationReasoning,
                @AIEvaluationDimensions,
                @PassedInitialScreening,
                @FailureReasons,
                @IsFixable,
                @ResubmissionOfID,
                @ReviewNotes,
                @FinalDecision,
                @FinalDecisionDate,
                @FinalDecisionReasoning
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Events].[Submission]
            (
                [EventID],
                [TypeformResponseID],
                [SubmittedAt],
                [Status],
                [SubmissionTitle],
                [SubmissionAbstract],
                [SubmissionSummary],
                [SessionFormat],
                [Duration],
                [TargetAudienceLevel],
                [KeyTopics],
                [PresentationFileURL],
                [PresentationFileSummary],
                [AdditionalMaterialsURLs],
                [SpecialRequirements],
                [AIEvaluationScore],
                [AIEvaluationReasoning],
                [AIEvaluationDimensions],
                [PassedInitialScreening],
                [FailureReasons],
                [IsFixable],
                [ResubmissionOfID],
                [ReviewNotes],
                [FinalDecision],
                [FinalDecisionDate],
                [FinalDecisionReasoning]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EventID,
                @TypeformResponseID,
                ISNULL(@SubmittedAt, getdate()),
                ISNULL(@Status, 'New'),
                @SubmissionTitle,
                @SubmissionAbstract,
                @SubmissionSummary,
                @SessionFormat,
                @Duration,
                @TargetAudienceLevel,
                @KeyTopics,
                @PresentationFileURL,
                @PresentationFileSummary,
                @AdditionalMaterialsURLs,
                @SpecialRequirements,
                @AIEvaluationScore,
                @AIEvaluationReasoning,
                @AIEvaluationDimensions,
                @PassedInitialScreening,
                @FailureReasons,
                @IsFixable,
                @ResubmissionOfID,
                @ReviewNotes,
                @FinalDecision,
                @FinalDecisionDate,
                @FinalDecisionReasoning
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Events].[vwSubmissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Events].[spCreateSubmission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Submissions */

GRANT EXECUTE ON [Events].[spCreateSubmission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submissions
-- Item: spUpdateSubmission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Submission
------------------------------------------------------------
IF OBJECT_ID('[Events].[spUpdateSubmission]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spUpdateSubmission];
GO

CREATE PROCEDURE [Events].[spUpdateSubmission]
    @ID uniqueidentifier,
    @EventID uniqueidentifier,
    @TypeformResponseID nvarchar(100),
    @SubmittedAt datetime,
    @Status nvarchar(50),
    @SubmissionTitle nvarchar(500),
    @SubmissionAbstract nvarchar(MAX),
    @SubmissionSummary nvarchar(MAX),
    @SessionFormat nvarchar(50),
    @Duration int,
    @TargetAudienceLevel nvarchar(50),
    @KeyTopics nvarchar(MAX),
    @PresentationFileURL nvarchar(500),
    @PresentationFileSummary nvarchar(MAX),
    @AdditionalMaterialsURLs nvarchar(MAX),
    @SpecialRequirements nvarchar(MAX),
    @AIEvaluationScore decimal(5, 2),
    @AIEvaluationReasoning nvarchar(MAX),
    @AIEvaluationDimensions nvarchar(MAX),
    @PassedInitialScreening bit,
    @FailureReasons nvarchar(MAX),
    @IsFixable bit,
    @ResubmissionOfID uniqueidentifier,
    @ReviewNotes nvarchar(MAX),
    @FinalDecision nvarchar(50),
    @FinalDecisionDate datetime,
    @FinalDecisionReasoning nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[Submission]
    SET
        [EventID] = @EventID,
        [TypeformResponseID] = @TypeformResponseID,
        [SubmittedAt] = @SubmittedAt,
        [Status] = @Status,
        [SubmissionTitle] = @SubmissionTitle,
        [SubmissionAbstract] = @SubmissionAbstract,
        [SubmissionSummary] = @SubmissionSummary,
        [SessionFormat] = @SessionFormat,
        [Duration] = @Duration,
        [TargetAudienceLevel] = @TargetAudienceLevel,
        [KeyTopics] = @KeyTopics,
        [PresentationFileURL] = @PresentationFileURL,
        [PresentationFileSummary] = @PresentationFileSummary,
        [AdditionalMaterialsURLs] = @AdditionalMaterialsURLs,
        [SpecialRequirements] = @SpecialRequirements,
        [AIEvaluationScore] = @AIEvaluationScore,
        [AIEvaluationReasoning] = @AIEvaluationReasoning,
        [AIEvaluationDimensions] = @AIEvaluationDimensions,
        [PassedInitialScreening] = @PassedInitialScreening,
        [FailureReasons] = @FailureReasons,
        [IsFixable] = @IsFixable,
        [ResubmissionOfID] = @ResubmissionOfID,
        [ReviewNotes] = @ReviewNotes,
        [FinalDecision] = @FinalDecision,
        [FinalDecisionDate] = @FinalDecisionDate,
        [FinalDecisionReasoning] = @FinalDecisionReasoning
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Events].[vwSubmissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Events].[vwSubmissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Events].[spUpdateSubmission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Submission table
------------------------------------------------------------
IF OBJECT_ID('[Events].[trgUpdateSubmission]', 'TR') IS NOT NULL
    DROP TRIGGER [Events].[trgUpdateSubmission];
GO
CREATE TRIGGER [Events].trgUpdateSubmission
ON [Events].[Submission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Events].[Submission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Events].[Submission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Submissions */

GRANT EXECUTE ON [Events].[spUpdateSubmission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Submissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Submissions
-- Item: spDeleteSubmission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Submission
------------------------------------------------------------
IF OBJECT_ID('[Events].[spDeleteSubmission]', 'P') IS NOT NULL
    DROP PROCEDURE [Events].[spDeleteSubmission];
GO

CREATE PROCEDURE [Events].[spDeleteSubmission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Events].[Submission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Events].[spDeleteSubmission] TO [cdp_Integration]
    

/* spDelete Permissions for Submissions */

GRANT EXECUTE ON [Events].[spDeleteSubmission] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c102ffee-513e-4bf4-a96a-e3832c949166'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'Account')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c102ffee-513e-4bf4-a96a-e3832c949166',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100045,
            'Account',
            'Account',
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
         WHERE ID = '3b6514e2-b651-4495-9022-552a4cb15521'  OR 
               (EntityID = '150A943C-7323-4B22-B609-3F852DB5F784' AND Name = 'RootReportsToID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3b6514e2-b651-4495-9022-552a4cb15521',
            '150A943C-7323-4B22-B609-3F852DB5F784', -- Entity: Contacts
            100046,
            'RootReportsToID',
            'Root Reports To ID',
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
         WHERE ID = 'c9cea815-5c80-4069-9602-2bfa65f0f3b6'  OR 
               (EntityID = '85B84E83-35A2-4874-B2DE-57195316F966' AND Name = 'Event')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c9cea815-5c80-4069-9602-2bfa65f0f3b6',
            '85B84E83-35A2-4874-B2DE-57195316F966', -- Entity: Event Review Tasks
            100021,
            'Event',
            'Event',
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
         WHERE ID = '237e1713-6893-40df-b310-3966cccbe5ec'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'Deal')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '237e1713-6893-40df-b310-3966cccbe5ec',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100021,
            'Deal',
            'Deal',
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
         WHERE ID = '62131221-b2f7-41e0-ac83-0fef18872355'  OR 
               (EntityID = 'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9' AND Name = 'Product')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '62131221-b2f7-41e0-ac83-0fef18872355',
            'F2BD75B7-187A-4F2A-8DA7-6331C774CAF9', -- Entity: Deal Products
            100022,
            'Product',
            'Product',
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
         WHERE ID = '9968f96b-a3f2-467d-82cb-1d5fe010ccc8'  OR 
               (EntityID = 'A6A148B1-9084-41F8-B300-72A304341E40' AND Name = 'Account')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9968f96b-a3f2-467d-82cb-1d5fe010ccc8',
            'A6A148B1-9084-41F8-B300-72A304341E40', -- Entity: Account Insights
            100033,
            'Account',
            'Account',
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
         WHERE ID = '7de788b4-aa0b-446a-b3eb-9d64ba636ca4'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'Account')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7de788b4-aa0b-446a-b3eb-9d64ba636ca4',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100045,
            'Account',
            'Account',
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
         WHERE ID = '6cef17ab-566b-423f-9809-60d401f2fecf'  OR 
               (EntityID = '8F49F6CB-F89B-4B58-90FD-78CF64CEA367' AND Name = 'Deal')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6cef17ab-566b-423f-9809-60d401f2fecf',
            '8F49F6CB-F89B-4B58-90FD-78CF64CEA367', -- Entity: Invoices
            100046,
            'Deal',
            'Deal',
            NULL,
            'nvarchar',
            400,
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
         WHERE ID = 'c9616856-2424-469d-9df1-dcc9dc5e174c'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'Parent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c9616856-2424-469d-9df1-dcc9dc5e174c',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100047,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            400,
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
         WHERE ID = 'dc4f0ca5-56d1-4956-b39a-c7687fe2855b'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'Account')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dc4f0ca5-56d1-4956-b39a-c7687fe2855b',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
            100048,
            'Account',
            'Account',
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
         WHERE ID = '48e7fa84-64e5-4d79-9a0a-8896006d9281'  OR 
               (EntityID = 'A0183D9A-B171-4E72-826D-7F86248795F9' AND Name = 'RootParentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '48e7fa84-64e5-4d79-9a0a-8896006d9281',
            'A0183D9A-B171-4E72-826D-7F86248795F9', -- Entity: Events
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
         WHERE ID = '2d698406-3300-478f-8f1a-be4f18b5247a'  OR 
               (EntityID = '87F25037-7FE9-468D-851E-94F7FD187E8C' AND Name = 'RelationshipType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2d698406-3300-478f-8f1a-be4f18b5247a',
            '87F25037-7FE9-468D-851E-94F7FD187E8C', -- Entity: Contact Relationships
            100021,
            'RelationshipType',
            'Relationship Type',
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
         WHERE ID = 'fcc08ac1-3c95-4095-93c6-7db662559eca'  OR 
               (EntityID = '1AF94BAE-5A2D-4756-BE56-988D263F070E' AND Name = 'Account')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fcc08ac1-3c95-4095-93c6-7db662559eca',
            '1AF94BAE-5A2D-4756-BE56-988D263F070E', -- Entity: Activities
            100031,
            'Account',
            'Account',
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
         WHERE ID = 'abd738b7-9084-4ada-952f-4cf9f37f09fb'  OR 
               (EntityID = '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B' AND Name = 'Account')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'abd738b7-9084-4ada-952f-4cf9f37f09fb',
            '9C3E5E87-FEA1-4F4C-96F1-B1D2F0E6911B', -- Entity: Deals
            100037,
            'Account',
            'Account',
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
         WHERE ID = '770fcf8f-4526-4798-a559-ed131b442ad4'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = 'InverseRelationship')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '770fcf8f-4526-4798-a559-ed131b442ad4',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
            100013,
            'InverseRelationship',
            'Inverse Relationship',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '74de6b7b-c6de-4e26-8d68-886b4cfe8816'  OR 
               (EntityID = '8CC17F62-138B-48E4-8167-D2681D5F65AC' AND Name = 'RootInverseRelationshipID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '74de6b7b-c6de-4e26-8d68-886b4cfe8816',
            '8CC17F62-138B-48E4-8167-D2681D5F65AC', -- Entity: Relationship Types
            100014,
            'RootInverseRelationshipID',
            'Root Inverse Relationship ID',
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
         WHERE ID = 'c43f042c-4c8f-494d-87e5-5b59d7d381bb'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'Event')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c43f042c-4c8f-494d-87e5-5b59d7d381bb',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100059,
            'Event',
            'Event',
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
         WHERE ID = '67912eed-5a1e-4d7a-b4cf-a9c2a4805dac'  OR 
               (EntityID = 'BC59E925-CC3F-41CE-BEFA-DF3B879DD982' AND Name = 'RootResubmissionOfID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '67912eed-5a1e-4d7a-b4cf-a9c2a4805dac',
            'BC59E925-CC3F-41CE-BEFA-DF3B879DD982', -- Entity: Submissions
            100060,
            'RootResubmissionOfID',
            'Root Resubmission Of ID',
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
         WHERE ID = 'a497a7bb-cf82-4279-a4b0-ecfd98b4b30e'  OR 
               (EntityID = '805A851B-17DC-47BD-9097-E68E4061537B' AND Name = 'Product')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a497a7bb-cf82-4279-a4b0-ecfd98b4b30e',
            '805A851B-17DC-47BD-9097-E68E4061537B', -- Entity: Invoice Line Items
            100021,
            'Product',
            'Product',
            NULL,
            'nvarchar',
            400,
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

/* Generated Validation Functions for Account Insights */
-- CHECK constraint for Account Insights: Field: Priority was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Priority]=''Low'' OR [Priority]=''Medium'' OR [Priority]=''High'' OR [Priority]=NULL)', 'public ValidatePriorityAgainstAllowedValues(result: ValidationResult) {
	if (this.Priority != null && this.Priority !== "Low" && this.Priority !== "Medium" && this.Priority !== "High") {
		result.Errors.push(new ValidationErrorInfo("Priority", "Priority must be ''Low'', ''Medium'', or ''High'' if specified.", this.Priority, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a priority is provided, it must be either ''Low'', ''Medium'', or ''High''. It also allows the priority to be left blank.', 'ValidatePriorityAgainstAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F4FC97AA-83AF-4ED9-BCAE-EBBAE6C3EC0D');
  
            -- CHECK constraint for Account Insights: Field: Sentiment was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Sentiment]=''Mixed'' OR [Sentiment]=''Neutral'' OR [Sentiment]=''Negative'' OR [Sentiment]=''Positive'' OR [Sentiment]=NULL)', 'public ValidateSentimentAgainstAllowedSet(result: ValidationResult) {
	if (this.Sentiment != null 
		&& this.Sentiment !== "Mixed" 
		&& this.Sentiment !== "Neutral" 
		&& this.Sentiment !== "Negative" 
		&& this.Sentiment !== "Positive") {
		result.Errors.push(new ValidationErrorInfo("Sentiment", "Sentiment must be one of: ''Mixed'', ''Neutral'', ''Negative'', or ''Positive''.", this.Sentiment, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a sentiment is provided, it must be one of the following values: Mixed, Neutral, Negative, or Positive. The sentiment field can also be left blank.', 'ValidateSentimentAgainstAllowedSet', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1A0EB917-EB5E-4626-98EA-1FBCFA9DBDDD');
  
            

/* Generated Validation Functions for Accounts */
-- CHECK constraint for Accounts: Field: Exchange was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Exchange]=''Other'' OR [Exchange]=''SSE'' OR [Exchange]=''HKEX'' OR [Exchange]=''TSE'' OR [Exchange]=''LSE'' OR [Exchange]=''AMEX'' OR [Exchange]=''NASDAQ'' OR [Exchange]=''NYSE'' OR [Exchange]=NULL)', 'public ValidateExchangeAgainstAllowedValues(result: ValidationResult) {
	const allowedExchanges = [
		"Other",
		"SSE",
		"HKEX",
		"TSE",
		"LSE",
		"AMEX",
		"NASDAQ",
		"NYSE"
	];
	if (this.Exchange != null && allowedExchanges.indexOf(this.Exchange) === -1) {
		result.Errors.push(new ValidationErrorInfo("Exchange", "Exchange must be one of: Other, SSE, HKEX, TSE, LSE, AMEX, NASDAQ, NYSE, or left blank.", this.Exchange, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the Exchange field, if provided, must be either ''Other'', ''SSE'', ''HKEX'', ''TSE'', ''LSE'', ''AMEX'', ''NASDAQ'', ''NYSE'', or left blank (null).', 'ValidateExchangeAgainstAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '58799F4B-019B-4020-BBBF-E42F16FE7074');
  
            

/* Generated Validation Functions for Contact Relationships */
-- CHECK constraint for Contact Relationships @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([EndDate] IS NULL OR [EndDate]>=[StartDate])', 'public ValidateEndDateNotBeforeStartDate(result: ValidationResult) {
	if (this.EndDate != null && this.StartDate != null && this.EndDate < this.StartDate) {
		result.Errors.push(new ValidationErrorInfo("EndDate", "The end date cannot be before the start date.", this.EndDate, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if an end date is provided, it must be on or after the start date. If the end date is not provided, then any value is allowed.', 'ValidateEndDateNotBeforeStartDate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '87F25037-7FE9-468D-851E-94F7FD187E8C');
  
            -- CHECK constraint for Contact Relationships @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([PrimaryContactID]<>[RelatedContactID])', 'public ValidatePrimaryContactIDDifferentFromRelatedContactID(result: ValidationResult) {
	if (this.PrimaryContactID === this.RelatedContactID) {
		result.Errors.push(new ValidationErrorInfo("PrimaryContactID", "The primary contact cannot be the same as the related contact.", this.PrimaryContactID, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the primary contact and the related contact cannot be the same person. They must have different IDs.', 'ValidatePrimaryContactIDDifferentFromRelatedContactID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '87F25037-7FE9-468D-851E-94F7FD187E8C');
  
            

/* Generated Validation Functions for Deal Products */
-- CHECK constraint for Deal Products: Field: Discount was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Discount]>=(0) AND [Discount]<=(100))', 'public ValidateDiscountBetweenZeroAndHundred(result: ValidationResult) {
	if (this.Discount != null && (this.Discount < 0 || this.Discount > 100)) {
		result.Errors.push(new ValidationErrorInfo("Discount", "Discount must be between 0 and 100 (inclusive) if specified.", this.Discount, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a discount is specified, its value must be between 0 and 100, inclusive.', 'ValidateDiscountBetweenZeroAndHundred', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1BA0F4C2-6E05-479F-B584-C58308C6F171');
  
            -- CHECK constraint for Deal Products: Field: Quantity was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Quantity]>(0))', 'public ValidateQuantityGreaterThanZero(result: ValidationResult) {
	if (this.Quantity <= 0) {
		result.Errors.push(new ValidationErrorInfo("Quantity", "The quantity must be greater than zero.", this.Quantity, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the quantity for this item must be greater than zero. You cannot have a quantity that is zero or negative.', 'ValidateQuantityGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '1AA21D79-116B-4CE3-A89B-BA384BDDFD05');
  
            

/* Generated Validation Functions for Deals */
-- CHECK constraint for Deals: Field: Probability was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Probability]>=(0) AND [Probability]<=(100))', 'public ValidateProbabilityWithinPercentageRange(result: ValidationResult) {
	if (this.Probability != null && (this.Probability < 0 || this.Probability > 100)) {
		result.Errors.push(new ValidationErrorInfo("Probability", "Probability must be between 0 and 100, inclusive.", this.Probability, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the probability is provided, it cannot be lower than 0 or higher than 100.', 'ValidateProbabilityWithinPercentageRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '99431DBA-93F4-4095-9C63-18627C092C0C');
  
            

/* Generated Validation Functions for Events */
-- CHECK constraint for Events: Field: BaselinePassingScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([BaselinePassingScore]>=(0) AND [BaselinePassingScore]<=(100))', 'public ValidateBaselinePassingScoreWithinRange(result: ValidationResult) {
	if (this.BaselinePassingScore != null && (this.BaselinePassingScore < 0 || this.BaselinePassingScore > 100)) {
		result.Errors.push(new ValidationErrorInfo("BaselinePassingScore", "Baseline passing score must be between 0 and 100.", this.BaselinePassingScore, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a baseline passing score is provided, it must be a number between 0 and 100 (inclusive).', 'ValidateBaselinePassingScoreWithinRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5B77B77A-3935-4AF0-A351-8EA6BA2C4277');
  
            

/* Generated Validation Functions for Invoice Line Items */
-- CHECK constraint for Invoice Line Items: Field: Discount was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Discount]>=(0) AND [Discount]<=(100))', 'public ValidateDiscountWithinZeroToHundred(result: ValidationResult) {
	if (this.Discount != null && (this.Discount < 0 || this.Discount > 100)) {
		result.Errors.push(new ValidationErrorInfo("Discount", "Discount must be between 0 and 100.", this.Discount, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a discount is provided, it must be between 0 and 100, inclusive.', 'ValidateDiscountWithinZeroToHundred', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5736B89E-0EB9-440E-9251-E820257DE734');
  
            -- CHECK constraint for Invoice Line Items: Field: Quantity was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Quantity]>(0))', 'public ValidateQuantityGreaterThanZero(result: ValidationResult) {
	if (this.Quantity <= 0) {
		result.Errors.push(new ValidationErrorInfo("Quantity", "Quantity must be greater than zero.", this.Quantity, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the quantity for an invoice line item must be greater than zero.', 'ValidateQuantityGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '64A8FEAE-6E3C-47F9-8FE7-070DC888B50F');
  
            

/* Generated Validation Functions for Invoices */
-- CHECK constraint for Invoices: Field: TaxRate was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([TaxRate]>=(0) AND [TaxRate]<=(100))', 'public ValidateTaxRateBetween0And100(result: ValidationResult) {
	if (this.TaxRate != null && (this.TaxRate < 0 || this.TaxRate > 100)) {
		result.Errors.push(new ValidationErrorInfo("TaxRate", "The tax rate must be between 0 and 100 percent.", this.TaxRate, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a tax rate is provided, it must be between 0 and 100 percent (inclusive). If no tax rate is specified, this rule does not apply.', 'ValidateTaxRateBetween0And100', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '248410F3-DA07-4577-A510-A03A6955726C');
  
            -- CHECK constraint for Invoices @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([DueDate]>=[InvoiceDate])', 'public ValidateDueDateNotBeforeInvoiceDate(result: ValidationResult) {
	if (this.DueDate < this.InvoiceDate) {
		result.Errors.push(new ValidationErrorInfo("DueDate", "The due date cannot be before the invoice date.", this.DueDate, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the due date of the invoice cannot be before the invoice date.', 'ValidateDueDateNotBeforeInvoiceDate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '8F49F6CB-F89B-4B58-90FD-78CF64CEA367');
  
            

/* Generated Validation Functions for Payments */
-- CHECK constraint for Payments: Field: Amount was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Amount]>(0))', 'public ValidateAmountGreaterThanZero(result: ValidationResult) {
	if (this.Amount <= 0) {
		result.Errors.push(new ValidationErrorInfo("Amount", "The payment amount must be greater than zero.", this.Amount, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the payment amount must be greater than zero.', 'ValidateAmountGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B41EDC81-4685-4B48-9C8F-411FAE58475F');
  
            

/* Generated Validation Functions for Products */
-- CHECK constraint for Products: Field: RecurringBillingPeriod was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([RecurringBillingPeriod]=''Biannual'' OR [RecurringBillingPeriod]=''Annual'' OR [RecurringBillingPeriod]=''Quarterly'' OR [RecurringBillingPeriod]=''Monthly'' OR [RecurringBillingPeriod]=NULL)', 'public ValidateRecurringBillingPeriodAllowedValues(result: ValidationResult) {
	if (
		this.RecurringBillingPeriod != null &&
		this.RecurringBillingPeriod !== "Biannual" &&
		this.RecurringBillingPeriod !== "Annual" &&
		this.RecurringBillingPeriod !== "Quarterly" &&
		this.RecurringBillingPeriod !== "Monthly"
	) {
		result.Errors.push(new ValidationErrorInfo(
			"RecurringBillingPeriod",
			"RecurringBillingPeriod, if specified, must be one of: ''Biannual'', ''Annual'', ''Quarterly'', or ''Monthly''.",
			this.RecurringBillingPeriod,
			ValidationErrorType.Failure
		));
	}
}', 'This rule ensures that if a billing period is specified for a product, it must be either ''Biannual'', ''Annual'', ''Quarterly'', or ''Monthly''. If the billing period is not specified, it can be left blank.', 'ValidateRecurringBillingPeriodAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'E592B4F9-108E-4357-A0B4-1DEE9F969AB5');
  
            

/* Generated Validation Functions for Speakers */
-- CHECK constraint for Speakers: Field: CredibilityScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CredibilityScore]>=(0) AND [CredibilityScore]<=(100))', 'public ValidateCredibilityScoreWithin0to100(result: ValidationResult) {
	if (this.CredibilityScore != null && (this.CredibilityScore < 0 || this.CredibilityScore > 100)) {
		result.Errors.push(new ValidationErrorInfo("CredibilityScore", "Credibility score must be between 0 and 100.", this.CredibilityScore, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the credibility score, if provided, must be a number between 0 and 100, inclusive.', 'ValidateCredibilityScoreWithin0to100', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CA040C07-2E01-4BFA-B23E-0D57EFB6EBF6');
  
            

/* Generated Validation Functions for Submission Reviews */
-- CHECK constraint for Submission Reviews: Field: OverallScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([OverallScore]>=(0) AND [OverallScore]<=(10))', 'public ValidateOverallScoreBetweenZeroAndTen(result: ValidationResult) {
	if (this.OverallScore != null && (this.OverallScore < 0 || this.OverallScore > 10)) {
		result.Errors.push(new ValidationErrorInfo("OverallScore", "If specified, the overall score must be between 0 and 10.", this.OverallScore, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if an overall score is provided, it must be between 0 and 10 (inclusive).', 'ValidateOverallScoreBetweenZeroAndTen', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '60F02B09-997A-43C5-A767-651FA974EB2B');
  
            -- CHECK constraint for Submission Reviews: Field: QualityScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([QualityScore]>=(0) AND [QualityScore]<=(10))', 'public ValidateQualityScoreBetweenZeroAndTen(result: ValidationResult) {
	if (this.QualityScore != null && (this.QualityScore < 0 || this.QualityScore > 10)) {
		result.Errors.push(new ValidationErrorInfo("QualityScore", "Quality score must be between 0 and 10 when specified.", this.QualityScore, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a quality score is provided, it must be between 0 and 10, inclusive.', 'ValidateQualityScoreBetweenZeroAndTen', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '584A8F25-C408-46F5-BA3D-39F7E5C0C3DC');
  
            -- CHECK constraint for Submission Reviews: Field: RelevanceScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([RelevanceScore]>=(0) AND [RelevanceScore]<=(10))', 'public ValidateRelevanceScoreWithinRange(result: ValidationResult) {
	if (this.RelevanceScore != null && (this.RelevanceScore < 0 || this.RelevanceScore > 10)) {
		result.Errors.push(new ValidationErrorInfo("RelevanceScore", "Relevance score must be between 0 and 10.", this.RelevanceScore, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the relevance score, if provided, must be between 0 and 10.', 'ValidateRelevanceScoreWithinRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CB0DD3D9-52BA-4D3F-8E2D-68013ECC5962');
  
            -- CHECK constraint for Submission Reviews: Field: SpeakerExperienceScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([SpeakerExperienceScore]>=(0) AND [SpeakerExperienceScore]<=(10))', 'public ValidateSpeakerExperienceScoreBetween0And10(result: ValidationResult) {
	if (this.SpeakerExperienceScore != null && (this.SpeakerExperienceScore < 0 || this.SpeakerExperienceScore > 10)) {
		result.Errors.push(new ValidationErrorInfo("SpeakerExperienceScore", "Speaker experience score must be between 0 and 10.", this.SpeakerExperienceScore, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a speaker experience score is provided, it must be a number between 0 and 10, inclusive.', 'ValidateSpeakerExperienceScoreBetween0And10', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0066924E-566B-4386-A087-977A8863E99A');
  
            

/* Generated Validation Functions for Submissions */
-- CHECK constraint for Submissions: Field: AIEvaluationScore was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([AIEvaluationScore]>=(0) AND [AIEvaluationScore]<=(100))', 'public ValidateAIEvaluationScoreWithinRange(result: ValidationResult) {
	if (this.AIEvaluationScore != null && (this.AIEvaluationScore < 0 || this.AIEvaluationScore > 100)) {
		result.Errors.push(new ValidationErrorInfo("AIEvaluationScore", "AI evaluation score must be between 0 and 100.", this.AIEvaluationScore, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if an AI evaluation score is provided, it must be a number between 0 and 100, inclusive.', 'ValidateAIEvaluationScoreWithinRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '7C811A62-C643-4879-8887-A36CEDB4E223');
  
            -- CHECK constraint for Submissions: Field: FinalDecision was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([FinalDecision]=''Waitlisted'' OR [FinalDecision]=''Rejected'' OR [FinalDecision]=''Accepted'' OR [FinalDecision]=NULL)', 'public ValidateFinalDecisionIsAllowedValue(result: ValidationResult) {
	if (this.FinalDecision != null && this.FinalDecision !== "Waitlisted" && this.FinalDecision !== "Rejected" && this.FinalDecision !== "Accepted") {
		result.Errors.push(new ValidationErrorInfo("FinalDecision", "FinalDecision must be either ''Waitlisted'', ''Rejected'', or ''Accepted'' if provided.", this.FinalDecision, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the final decision for a submission, if provided, must be either ''Waitlisted'', ''Rejected'', or ''Accepted''. If no decision has been made, the field can be left blank.', 'ValidateFinalDecisionIsAllowedValue', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'AF82F328-5C21-4B04-A0C1-C6CF902DF093');
  
            

