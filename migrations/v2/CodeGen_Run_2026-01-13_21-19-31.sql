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
         'b87610f9-eeba-40df-a840-b13757f18ffd',
         'Contacts',
         NULL,
         NULL,
         NULL,
         'Contact',
         'vwContacts',
         'Contacts',
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
   

/* SQL generated to add new entity Contacts to application ID: '655e14c2-b84b-4fac-94e3-0f384dbd176f' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('655e14c2-b84b-4fac-94e3-0f384dbd176f', 'b87610f9-eeba-40df-a840-b13757f18ffd', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '655e14c2-b84b-4fac-94e3-0f384dbd176f'))

/* SQL generated to add new permission for entity Contacts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b87610f9-eeba-40df-a840-b13757f18ffd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contacts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b87610f9-eeba-40df-a840-b13757f18ffd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contacts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('b87610f9-eeba-40df-a840-b13757f18ffd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '2557d870-ef0e-42ae-89cb-142959f0b221',
         'Activity Types',
         NULL,
         NULL,
         NULL,
         'ActivityType',
         'vwActivityTypes',
         'Contacts',
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
   

/* SQL generated to add new entity Activity Types to application ID: '655E14C2-B84B-4FAC-94E3-0F384DBD176F' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('655E14C2-B84B-4FAC-94E3-0F384DBD176F', '2557d870-ef0e-42ae-89cb-142959f0b221', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '655E14C2-B84B-4FAC-94E3-0F384DBD176F'))

/* SQL generated to add new permission for entity Activity Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2557d870-ef0e-42ae-89cb-142959f0b221', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2557d870-ef0e-42ae-89cb-142959f0b221', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('2557d870-ef0e-42ae-89cb-142959f0b221', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'bf78d71e-6b99-4432-a616-89923e929db6',
         'Activities',
         NULL,
         NULL,
         NULL,
         'Activity',
         'vwActivities',
         'Contacts',
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
   

/* SQL generated to add new entity Activities to application ID: '655E14C2-B84B-4FAC-94E3-0F384DBD176F' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('655E14C2-B84B-4FAC-94E3-0F384DBD176F', 'bf78d71e-6b99-4432-a616-89923e929db6', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '655E14C2-B84B-4FAC-94E3-0F384DBD176F'))

/* SQL generated to add new permission for entity Activities for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bf78d71e-6b99-4432-a616-89923e929db6', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activities for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bf78d71e-6b99-4432-a616-89923e929db6', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activities for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('bf78d71e-6b99-4432-a616-89923e929db6', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activity Tags */

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
         'fb5d0245-73f3-4bf7-8f48-7c95937cbfdd',
         'Activity Tags',
         NULL,
         NULL,
         NULL,
         'ActivityTag',
         'vwActivityTags',
         'Contacts',
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
   

/* SQL generated to add new entity Activity Tags to application ID: '655E14C2-B84B-4FAC-94E3-0F384DBD176F' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('655E14C2-B84B-4FAC-94E3-0F384DBD176F', 'fb5d0245-73f3-4bf7-8f48-7c95937cbfdd', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '655E14C2-B84B-4FAC-94E3-0F384DBD176F'))

/* SQL generated to add new permission for entity Activity Tags for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fb5d0245-73f3-4bf7-8f48-7c95937cbfdd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Tags for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fb5d0245-73f3-4bf7-8f48-7c95937cbfdd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Tags for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('fb5d0245-73f3-4bf7-8f48-7c95937cbfdd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contacts__CRM */

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
         '01bd0852-f84e-48a1-9947-6f8898404bdc',
         'Contacts__CRM',
         NULL,
         NULL,
         '__CRM',
         'Contact',
         'vwContacts__CRM',
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
   

/* SQL generated to add new entity Contacts__CRM to application ID: '720050e9-ef67-4bed-b8c3-69e0fa1e6832' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('720050e9-ef67-4bed-b8c3-69e0fa1e6832', '01bd0852-f84e-48a1-9947-6f8898404bdc', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '720050e9-ef67-4bed-b8c3-69e0fa1e6832'))

/* SQL generated to add new permission for entity Contacts__CRM for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('01bd0852-f84e-48a1-9947-6f8898404bdc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contacts__CRM for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('01bd0852-f84e-48a1-9947-6f8898404bdc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contacts__CRM for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('01bd0852-f84e-48a1-9947-6f8898404bdc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contacts__Demo */

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
         '106701fa-cb3e-4488-8849-66dff03e48bf',
         'Contacts__Demo',
         NULL,
         NULL,
         '__Demo',
         'Contact',
         'vwContacts__Demo',
         'Demo',
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
   

/* SQL generated to add new entity Contacts__Demo to application ID: '0506443d-5d82-4933-a6f9-8a7dd895d4f8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443d-5d82-4933-a6f9-8a7dd895d4f8', '106701fa-cb3e-4488-8849-66dff03e48bf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443d-5d82-4933-a6f9-8a7dd895d4f8'))

/* SQL generated to add new permission for entity Contacts__Demo for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('106701fa-cb3e-4488-8849-66dff03e48bf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contacts__Demo for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('106701fa-cb3e-4488-8849-66dff03e48bf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contacts__Demo for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('106701fa-cb3e-4488-8849-66dff03e48bf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activity Types__Demo */

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
         '3d943481-3c29-4c1b-aacc-7c4d1200a94d',
         'Activity Types__Demo',
         NULL,
         NULL,
         '__Demo',
         'ActivityType',
         'vwActivityTypes__Demo',
         'Demo',
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
   

/* SQL generated to add new entity Activity Types__Demo to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '3d943481-3c29-4c1b-aacc-7c4d1200a94d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Activity Types__Demo for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3d943481-3c29-4c1b-aacc-7c4d1200a94d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Types__Demo for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3d943481-3c29-4c1b-aacc-7c4d1200a94d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Types__Demo for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3d943481-3c29-4c1b-aacc-7c4d1200a94d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activities__Demo */

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
         '86b64641-1aae-49aa-8088-9d137854ce2b',
         'Activities__Demo',
         NULL,
         NULL,
         '__Demo',
         'Activity',
         'vwActivities__Demo',
         'Demo',
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
   

/* SQL generated to add new entity Activities__Demo to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '86b64641-1aae-49aa-8088-9d137854ce2b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Activities__Demo for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('86b64641-1aae-49aa-8088-9d137854ce2b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activities__Demo for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('86b64641-1aae-49aa-8088-9d137854ce2b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activities__Demo for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('86b64641-1aae-49aa-8088-9d137854ce2b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contact Tags */

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
         '4e873a06-046c-43ff-9a59-d50efbc7f148',
         'Contact Tags',
         NULL,
         NULL,
         NULL,
         'ContactTag',
         'vwContactTags',
         'Demo',
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
   

/* SQL generated to add new entity Contact Tags to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '4e873a06-046c-43ff-9a59-d50efbc7f148', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Contact Tags for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4e873a06-046c-43ff-9a59-d50efbc7f148', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contact Tags for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4e873a06-046c-43ff-9a59-d50efbc7f148', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contact Tags for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4e873a06-046c-43ff-9a59-d50efbc7f148', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contact Tag Links */

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
         'c13f60aa-1246-4727-bccd-43153a005d23',
         'Contact Tag Links',
         NULL,
         NULL,
         NULL,
         'ContactTagLink',
         'vwContactTagLinks',
         'Demo',
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
   

/* SQL generated to add new entity Contact Tag Links to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', 'c13f60aa-1246-4727-bccd-43153a005d23', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Contact Tag Links for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c13f60aa-1246-4727-bccd-43153a005d23', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contact Tag Links for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c13f60aa-1246-4727-bccd-43153a005d23', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contact Tag Links for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c13f60aa-1246-4727-bccd-43153a005d23', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activity Sentiments */

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
         '6c06e61d-ead5-47f8-a084-f7f337577e5d',
         'Activity Sentiments',
         NULL,
         NULL,
         NULL,
         'ActivitySentiment',
         'vwActivitySentiments',
         'Demo',
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
   

/* SQL generated to add new entity Activity Sentiments to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '6c06e61d-ead5-47f8-a084-f7f337577e5d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Activity Sentiments for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6c06e61d-ead5-47f8-a084-f7f337577e5d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Sentiments for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6c06e61d-ead5-47f8-a084-f7f337577e5d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Sentiments for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('6c06e61d-ead5-47f8-a084-f7f337577e5d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activity Tags__Demo */

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
         '3b1d517d-88f9-4ae0-b9b6-d28b70598e2e',
         'Activity Tags__Demo',
         NULL,
         NULL,
         '__Demo',
         'ActivityTag',
         'vwActivityTags__Demo',
         'Demo',
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
   

/* SQL generated to add new entity Activity Tags__Demo to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '3b1d517d-88f9-4ae0-b9b6-d28b70598e2e', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Activity Tags__Demo for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3b1d517d-88f9-4ae0-b9b6-d28b70598e2e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Tags__Demo for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3b1d517d-88f9-4ae0-b9b6-d28b70598e2e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Tags__Demo for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3b1d517d-88f9-4ae0-b9b6-d28b70598e2e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activity Tag Links */

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
         '52d19a73-b000-4718-8a80-ef6477a97b34',
         'Activity Tag Links',
         NULL,
         NULL,
         NULL,
         'ActivityTagLink',
         'vwActivityTagLinks',
         'Demo',
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
   

/* SQL generated to add new entity Activity Tag Links to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '52d19a73-b000-4718-8a80-ef6477a97b34', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Activity Tag Links for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('52d19a73-b000-4718-8a80-ef6477a97b34', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Tag Links for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('52d19a73-b000-4718-8a80-ef6477a97b34', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Tag Links for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('52d19a73-b000-4718-8a80-ef6477a97b34', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Topics */

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
         'af2eca3a-6861-401d-920b-abb487cfa2e4',
         'Topics',
         NULL,
         NULL,
         NULL,
         'Topic',
         'vwTopics',
         'Demo',
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
   

/* SQL generated to add new entity Topics to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', 'af2eca3a-6861-401d-920b-abb487cfa2e4', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Topics for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('af2eca3a-6861-401d-920b-abb487cfa2e4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Topics for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('af2eca3a-6861-401d-920b-abb487cfa2e4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Topics for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('af2eca3a-6861-401d-920b-abb487cfa2e4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Activity Topics */

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
         '456fab05-0967-43d4-973f-7bbf45e2b834',
         'Activity Topics',
         NULL,
         NULL,
         NULL,
         'ActivityTopic',
         'vwActivityTopics',
         'Demo',
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
   

/* SQL generated to add new entity Activity Topics to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '456fab05-0967-43d4-973f-7bbf45e2b834', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Activity Topics for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('456fab05-0967-43d4-973f-7bbf45e2b834', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Activity Topics for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('456fab05-0967-43d4-973f-7bbf45e2b834', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Activity Topics for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('456fab05-0967-43d4-973f-7bbf45e2b834', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Contact Insights */

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
         '073d5a17-d62c-4c1d-92f7-3148d5856dfb',
         'Contact Insights',
         NULL,
         NULL,
         NULL,
         'ContactInsight',
         'vwContactInsights',
         'Demo',
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
   

/* SQL generated to add new entity Contact Insights to application ID: '0506443D-5D82-4933-A6F9-8A7DD895D4F8' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('0506443D-5D82-4933-A6F9-8A7DD895D4F8', '073d5a17-d62c-4c1d-92f7-3148d5856dfb', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '0506443D-5D82-4933-A6F9-8A7DD895D4F8'))

/* SQL generated to add new permission for entity Contact Insights for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('073d5a17-d62c-4c1d-92f7-3148d5856dfb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Contact Insights for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('073d5a17-d62c-4c1d-92f7-3148d5856dfb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Contact Insights for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('073d5a17-d62c-4c1d-92f7-3148d5856dfb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity Contacts.ActivityType */
ALTER TABLE [Contacts].[ActivityType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Contacts.ActivityType */
ALTER TABLE [Contacts].[ActivityType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ContactInsight */
ALTER TABLE [Demo].[ContactInsight] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ContactInsight */
ALTER TABLE [Demo].[ContactInsight] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ContactTagLink */
ALTER TABLE [Demo].[ContactTagLink] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ContactTagLink */
ALTER TABLE [Demo].[ContactTagLink] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.Contact */
ALTER TABLE [Demo].[Contact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.Contact */
ALTER TABLE [Demo].[Contact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity CRM.Contact */
ALTER TABLE [CRM].[Contact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity CRM.Contact */
ALTER TABLE [CRM].[Contact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ActivityTopic */
ALTER TABLE [Demo].[ActivityTopic] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ActivityTopic */
ALTER TABLE [Demo].[ActivityTopic] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ActivityType */
ALTER TABLE [Demo].[ActivityType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ActivityType */
ALTER TABLE [Demo].[ActivityType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Contacts.ActivityTag */
ALTER TABLE [Contacts].[ActivityTag] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Contacts.ActivityTag */
ALTER TABLE [Contacts].[ActivityTag] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Contacts.Activity */
ALTER TABLE [Contacts].[Activity] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Contacts.Activity */
ALTER TABLE [Contacts].[Activity] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.Activity */
ALTER TABLE [Demo].[Activity] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.Activity */
ALTER TABLE [Demo].[Activity] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.Topic */
ALTER TABLE [Demo].[Topic] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.Topic */
ALTER TABLE [Demo].[Topic] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Contacts.Contact */
ALTER TABLE [Contacts].[Contact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Contacts.Contact */
ALTER TABLE [Contacts].[Contact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ActivityTag */
ALTER TABLE [Demo].[ActivityTag] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ActivityTag */
ALTER TABLE [Demo].[ActivityTag] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ContactTag */
ALTER TABLE [Demo].[ContactTag] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ContactTag */
ALTER TABLE [Demo].[ContactTag] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ActivityTagLink */
ALTER TABLE [Demo].[ActivityTagLink] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ActivityTagLink */
ALTER TABLE [Demo].[ActivityTagLink] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Demo.ActivitySentiment */
ALTER TABLE [Demo].[ActivitySentiment] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Demo.ActivitySentiment */
ALTER TABLE [Demo].[ActivitySentiment] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8a3f2f8e-e1ef-43f0-ae9b-43035c7fab70'  OR 
               (EntityID = '2557D870-EF0E-42AE-89CB-142959F0B221' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8a3f2f8e-e1ef-43f0-ae9b-43035c7fab70',
            '2557D870-EF0E-42AE-89CB-142959F0B221', -- Entity: Activity Types
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
         WHERE ID = '276ce6b1-9d1b-4cea-8a98-fc1020ad0f7a'  OR 
               (EntityID = '2557D870-EF0E-42AE-89CB-142959F0B221' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '276ce6b1-9d1b-4cea-8a98-fc1020ad0f7a',
            '2557D870-EF0E-42AE-89CB-142959F0B221', -- Entity: Activity Types
            100002,
            'Name',
            'Name',
            'Display name of the activity type',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '06e0589b-6158-40ad-8f23-05a6b08df99a'  OR 
               (EntityID = '2557D870-EF0E-42AE-89CB-142959F0B221' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '06e0589b-6158-40ad-8f23-05a6b08df99a',
            '2557D870-EF0E-42AE-89CB-142959F0B221', -- Entity: Activity Types
            100003,
            'Description',
            'Description',
            'Detailed description of what this activity type represents',
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
         WHERE ID = 'b465b3ce-6de7-4b66-b672-2fb12fce7f71'  OR 
               (EntityID = '2557D870-EF0E-42AE-89CB-142959F0B221' AND Name = 'Icon')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b465b3ce-6de7-4b66-b672-2fb12fce7f71',
            '2557D870-EF0E-42AE-89CB-142959F0B221', -- Entity: Activity Types
            100004,
            'Icon',
            'Icon',
            'Font Awesome or similar icon class for UI display',
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
         WHERE ID = '7daf5e17-eac3-4ad7-958c-a006eff2eecf'  OR 
               (EntityID = '2557D870-EF0E-42AE-89CB-142959F0B221' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7daf5e17-eac3-4ad7-958c-a006eff2eecf',
            '2557D870-EF0E-42AE-89CB-142959F0B221', -- Entity: Activity Types
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
         WHERE ID = '161f9b68-558e-49c2-9f47-2acb94fa2644'  OR 
               (EntityID = '2557D870-EF0E-42AE-89CB-142959F0B221' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '161f9b68-558e-49c2-9f47-2acb94fa2644',
            '2557D870-EF0E-42AE-89CB-142959F0B221', -- Entity: Activity Types
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
         WHERE ID = 'c7479f68-b801-43a5-89cf-7f7604df42ac'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c7479f68-b801-43a5-89cf-7f7604df42ac',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
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
         WHERE ID = 'd5e64d28-19d4-49f4-919a-78f5708e4ca4'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'ContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd5e64d28-19d4-49f4-919a-78f5708e4ca4',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
            100002,
            'ContactID',
            'Contact ID',
            'Reference to the contact these insights are about',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '106701FA-CB3E-4488-8849-66DFF03E48BF',
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
         WHERE ID = '47a2eb37-5c82-4495-beea-a11e91e5bcc6'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'OverallSentimentTrend')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '47a2eb37-5c82-4495-beea-a11e91e5bcc6',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
            100003,
            'OverallSentimentTrend',
            'Overall Sentiment Trend',
            'Trend of sentiment over time (Improving, Stable, Declining)',
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
         WHERE ID = '9efaa960-524a-417f-8487-6ac6163b6d6b'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'AverageSentimentScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9efaa960-524a-417f-8487-6ac6163b6d6b',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
            100004,
            'AverageSentimentScore',
            'Average Sentiment Score',
            'Average sentiment score across all activities (-1.0000 to 1.0000)',
            'decimal',
            5,
            5,
            4,
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
         WHERE ID = '1d178fbe-7e74-4f75-aafd-ea7504c0189b'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'TopTopics')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1d178fbe-7e74-4f75-aafd-ea7504c0189b',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
            100005,
            'TopTopics',
            'Top Topics',
            'JSON array of the most common topics for this contact',
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
         WHERE ID = '5be65152-b90f-41f4-b732-dcd7ac1c248f'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'EngagementLevel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5be65152-b90f-41f4-b732-dcd7ac1c248f',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
            100006,
            'EngagementLevel',
            'Engagement Level',
            'Overall engagement level based on activity frequency (Low, Medium, High)',
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
         WHERE ID = '13e62363-6fed-41b3-912c-5ec6bda25756'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'ChurnRiskScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '13e62363-6fed-41b3-912c-5ec6bda25756',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
            100007,
            'ChurnRiskScore',
            'Churn Risk Score',
            'AI-predicted churn risk score (0.0000 to 1.0000)',
            'decimal',
            5,
            5,
            4,
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
         WHERE ID = '88fc60b5-3ed9-4d77-af9a-c9fd959e425b'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = 'LastAnalyzedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '88fc60b5-3ed9-4d77-af9a-c9fd959e425b',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
            100008,
            'LastAnalyzedAt',
            'Last Analyzed At',
            'Timestamp when insights were last recalculated',
            'datetimeoffset',
            10,
            34,
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
         WHERE ID = '472c0e01-2a81-4ea0-85c8-6e015e69f7e1'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '472c0e01-2a81-4ea0-85c8-6e015e69f7e1',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
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
         WHERE ID = 'da6b79b4-c70f-4325-b029-552aa8f329db'  OR 
               (EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'da6b79b4-c70f-4325-b029-552aa8f329db',
            '073D5A17-D62C-4C1D-92F7-3148D5856DFB', -- Entity: Contact Insights
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
         WHERE ID = '59e1bd11-1e9a-450f-b9e2-511c0ab7a66b'  OR 
               (EntityID = 'C13F60AA-1246-4727-BCCD-43153A005D23' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '59e1bd11-1e9a-450f-b9e2-511c0ab7a66b',
            'C13F60AA-1246-4727-BCCD-43153A005D23', -- Entity: Contact Tag Links
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
         WHERE ID = '9f419cb7-d4f3-462c-a942-7b69f277931b'  OR 
               (EntityID = 'C13F60AA-1246-4727-BCCD-43153A005D23' AND Name = 'ContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9f419cb7-d4f3-462c-a942-7b69f277931b',
            'C13F60AA-1246-4727-BCCD-43153A005D23', -- Entity: Contact Tag Links
            100002,
            'ContactID',
            'Contact ID',
            'Reference to the contact being tagged',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '106701FA-CB3E-4488-8849-66DFF03E48BF',
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
         WHERE ID = '4ee5f22e-ae08-453d-bc59-f5c5d54b8b34'  OR 
               (EntityID = 'C13F60AA-1246-4727-BCCD-43153A005D23' AND Name = 'ContactTagID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4ee5f22e-ae08-453d-bc59-f5c5d54b8b34',
            'C13F60AA-1246-4727-BCCD-43153A005D23', -- Entity: Contact Tag Links
            100003,
            'ContactTagID',
            'Contact Tag ID',
            'Reference to the tag being applied',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '4E873A06-046C-43FF-9A59-D50EFBC7F148',
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
         WHERE ID = '56ba8aac-ce9b-46c5-8fdd-cc8952e9d47c'  OR 
               (EntityID = 'C13F60AA-1246-4727-BCCD-43153A005D23' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '56ba8aac-ce9b-46c5-8fdd-cc8952e9d47c',
            'C13F60AA-1246-4727-BCCD-43153A005D23', -- Entity: Contact Tag Links
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
         WHERE ID = 'f928a325-393f-4904-8d5b-41deb9826a26'  OR 
               (EntityID = 'C13F60AA-1246-4727-BCCD-43153A005D23' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f928a325-393f-4904-8d5b-41deb9826a26',
            'C13F60AA-1246-4727-BCCD-43153A005D23', -- Entity: Contact Tag Links
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
         WHERE ID = 'a03060a1-784d-4ec7-84e3-b917ddd426ce'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a03060a1-784d-4ec7-84e3-b917ddd426ce',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
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
         WHERE ID = '5ffec555-2121-4f3f-a764-f7b4997046b4'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'FirstName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5ffec555-2121-4f3f-a764-f7b4997046b4',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
            100002,
            'FirstName',
            'First Name',
            'First name of the contact',
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
         WHERE ID = '4dbfa56c-b037-4e92-91f7-65801bff4118'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'LastName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4dbfa56c-b037-4e92-91f7-65801bff4118',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
            100003,
            'LastName',
            'Last Name',
            'Last name of the contact',
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
         WHERE ID = '082d4fca-d27e-4185-a2b4-21effd31ea4d'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '082d4fca-d27e-4185-a2b4-21effd31ea4d',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
            100004,
            'Email',
            'Email',
            'Primary email address for the contact',
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
         WHERE ID = '27f819e4-9f5e-4c82-b607-45361c5481a3'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'Phone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27f819e4-9f5e-4c82-b607-45361c5481a3',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
            100005,
            'Phone',
            'Phone',
            'Primary phone number for the contact',
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
         WHERE ID = '14345089-98e1-4fdd-a419-4653eee911e2'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'Company')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '14345089-98e1-4fdd-a419-4653eee911e2',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
            100006,
            'Company',
            'Company',
            'Company or organization the contact is associated with',
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
         WHERE ID = 'd502198f-94a7-4adb-8f8d-51a980429317'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd502198f-94a7-4adb-8f8d-51a980429317',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
            100007,
            'Title',
            'Title',
            'Job title or role of the contact',
            'nvarchar',
            300,
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
         WHERE ID = '7501dc5d-30f7-4c3c-8256-914528c48853'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7501dc5d-30f7-4c3c-8256-914528c48853',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
            100008,
            'Status',
            'Status',
            'Current status of the contact (Active or Inactive)',
            'nvarchar',
            40,
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
         WHERE ID = '60b5847d-2d18-4bed-bb76-812d09588b71'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '60b5847d-2d18-4bed-bb76-812d09588b71',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
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
         WHERE ID = 'd0a3e12e-47cc-40d7-a887-9e68f3210fc9'  OR 
               (EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd0a3e12e-47cc-40d7-a887-9e68f3210fc9',
            '106701FA-CB3E-4488-8849-66DFF03E48BF', -- Entity: Contacts__Demo
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
         WHERE ID = '9ea754bb-d907-4909-a1c2-b45bd152b32b'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9ea754bb-d907-4909-a1c2-b45bd152b32b',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
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
         WHERE ID = '05145531-6804-4de7-8543-727dc7e3ac98'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'FirstName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '05145531-6804-4de7-8543-727dc7e3ac98',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
            100002,
            'FirstName',
            'First Name',
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
         WHERE ID = '6115021d-1ffc-46b4-920e-2d908de39bc1'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'LastName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6115021d-1ffc-46b4-920e-2d908de39bc1',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
            100003,
            'LastName',
            'Last Name',
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
         WHERE ID = 'bc215fc2-d10f-4f64-adf6-21ed9a34eeb4'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bc215fc2-d10f-4f64-adf6-21ed9a34eeb4',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
            100004,
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
         WHERE ID = '8563328e-c399-468e-8bc1-3365d2485762'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'Phone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8563328e-c399-468e-8bc1-3365d2485762',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
            100005,
            'Phone',
            'Phone',
            NULL,
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
         WHERE ID = 'e98332f6-b039-4515-b32d-b4c81bd364ed'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'Company')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e98332f6-b039-4515-b32d-b4c81bd364ed',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
            100006,
            'Company',
            'Company',
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
         WHERE ID = '00aae541-bfc3-48b2-8a45-d87f1fb9b9d5'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '00aae541-bfc3-48b2-8a45-d87f1fb9b9d5',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
            100007,
            'Title',
            'Title',
            NULL,
            'nvarchar',
            300,
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
         WHERE ID = 'c795ce0e-3038-49d0-a8cc-e4f200515400'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c795ce0e-3038-49d0-a8cc-e4f200515400',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
            100008,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
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
         WHERE ID = '9cc605aa-5c1d-466c-ac47-d3f0c0311a4b'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9cc605aa-5c1d-466c-ac47-d3f0c0311a4b',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
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
         WHERE ID = '9134fa91-9cb4-4a7e-8d24-20b8744b6370'  OR 
               (EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9134fa91-9cb4-4a7e-8d24-20b8744b6370',
            '01BD0852-F84E-48A1-9947-6F8898404BDC', -- Entity: Contacts__CRM
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
         WHERE ID = '413e42b3-d8a4-40d9-92b0-01078610333b'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '413e42b3-d8a4-40d9-92b0-01078610333b',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
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
         WHERE ID = '981550c2-26c0-4fcb-8e82-d865130d6d10'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = 'ActivityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '981550c2-26c0-4fcb-8e82-d865130d6d10',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
            100002,
            'ActivityID',
            'Activity ID',
            'Reference to the activity',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '86B64641-1AAE-49AA-8088-9D137854CE2B',
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
         WHERE ID = '196bd48b-0553-495f-8450-77dbd3e1dfcc'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = 'TopicID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '196bd48b-0553-495f-8450-77dbd3e1dfcc',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
            100003,
            'TopicID',
            'Topic ID',
            'Reference to the detected topic',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4',
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
         WHERE ID = '94711f08-e13c-47f1-851a-659c1c33cac5'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = 'ConfidenceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '94711f08-e13c-47f1-851a-659c1c33cac5',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
            100004,
            'ConfidenceScore',
            'Confidence Score',
            'AI confidence score for this topic detection (0.0000 to 1.0000)',
            'decimal',
            5,
            5,
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
         WHERE ID = '661336f6-b57c-4d9d-962b-d96fe2d0c830'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = 'RelevanceRank')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '661336f6-b57c-4d9d-962b-d96fe2d0c830',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
            100005,
            'RelevanceRank',
            'Relevance Rank',
            'Relevance ranking (1 = primary topic, 2 = secondary, etc.)',
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
         WHERE ID = 'e33c8114-20db-437f-b9a9-70eaa5efb9ff'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e33c8114-20db-437f-b9a9-70eaa5efb9ff',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
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
         WHERE ID = '713d1680-9aab-4156-82e6-051021d64b1f'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '713d1680-9aab-4156-82e6-051021d64b1f',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
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
         WHERE ID = '9a33c74c-29c6-46c4-bce6-51947109ec9c'  OR 
               (EntityID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9a33c74c-29c6-46c4-bce6-51947109ec9c',
            '3D943481-3C29-4C1B-AACC-7C4D1200A94D', -- Entity: Activity Types__Demo
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
         WHERE ID = '3bff391e-9046-47b4-9673-7a385eb2b839'  OR 
               (EntityID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3bff391e-9046-47b4-9673-7a385eb2b839',
            '3D943481-3C29-4C1B-AACC-7C4D1200A94D', -- Entity: Activity Types__Demo
            100002,
            'Name',
            'Name',
            'Display name of the activity type',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1e05050f-cac6-4b2d-8960-d76b1c16677d'  OR 
               (EntityID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1e05050f-cac6-4b2d-8960-d76b1c16677d',
            '3D943481-3C29-4C1B-AACC-7C4D1200A94D', -- Entity: Activity Types__Demo
            100003,
            'Description',
            'Description',
            'Detailed description of what this activity type represents',
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
         WHERE ID = '6176cc4c-947c-4410-9deb-d1b0026aeee8'  OR 
               (EntityID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D' AND Name = 'Icon')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6176cc4c-947c-4410-9deb-d1b0026aeee8',
            '3D943481-3C29-4C1B-AACC-7C4D1200A94D', -- Entity: Activity Types__Demo
            100004,
            'Icon',
            'Icon',
            'Font Awesome or similar icon class for UI display',
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
         WHERE ID = '3345a21c-2afa-48ec-9e1b-6a9803edaf5d'  OR 
               (EntityID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3345a21c-2afa-48ec-9e1b-6a9803edaf5d',
            '3D943481-3C29-4C1B-AACC-7C4D1200A94D', -- Entity: Activity Types__Demo
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
         WHERE ID = 'f44f50d4-6693-4883-a13e-20e189cd1289'  OR 
               (EntityID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f44f50d4-6693-4883-a13e-20e189cd1289',
            '3D943481-3C29-4C1B-AACC-7C4D1200A94D', -- Entity: Activity Types__Demo
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
         WHERE ID = '5069ef8f-51d7-4328-80dd-3ab8f3322427'  OR 
               (EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5069ef8f-51d7-4328-80dd-3ab8f3322427',
            'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', -- Entity: Activity Tags
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
         WHERE ID = '8dd4d92c-77b6-4afd-9b14-da5edcd6308f'  OR 
               (EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8dd4d92c-77b6-4afd-9b14-da5edcd6308f',
            'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', -- Entity: Activity Tags
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
         WHERE ID = 'd1e92869-aa3d-4976-9a01-907b1228d8cd'  OR 
               (EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd1e92869-aa3d-4976-9a01-907b1228d8cd',
            'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', -- Entity: Activity Tags
            100003,
            'Description',
            'Description',
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
         WHERE ID = 'dbd71502-2674-4bc3-a129-0c3a0c9b191b'  OR 
               (EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD' AND Name = 'Color')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dbd71502-2674-4bc3-a129-0c3a0c9b191b',
            'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', -- Entity: Activity Tags
            100004,
            'Color',
            'Color',
            NULL,
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
         WHERE ID = '54809f26-d683-436f-9591-873ab1e9566e'  OR 
               (EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD' AND Name = 'IsAutoGenerated')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '54809f26-d683-436f-9591-873ab1e9566e',
            'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', -- Entity: Activity Tags
            100005,
            'IsAutoGenerated',
            'Is Auto Generated',
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
         WHERE ID = 'f2025486-e19b-40e5-8e4d-8ff6b8077594'  OR 
               (EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f2025486-e19b-40e5-8e4d-8ff6b8077594',
            'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', -- Entity: Activity Tags
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
         WHERE ID = '71f6b665-a9d2-42b7-a9c8-68aede3f4d6c'  OR 
               (EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '71f6b665-a9d2-42b7-a9c8-68aede3f4d6c',
            'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', -- Entity: Activity Tags
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
         WHERE ID = '69436774-0e60-4364-ae48-a3b1e1516bc2'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '69436774-0e60-4364-ae48-a3b1e1516bc2',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
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
         WHERE ID = 'e7711926-4aa9-4eba-8417-d6694a640b9f'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'ContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e7711926-4aa9-4eba-8417-d6694a640b9f',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100002,
            'ContactID',
            'Contact ID',
            'Reference to the contact this activity is associated with',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'B87610F9-EEBA-40DF-A840-B13757F18FFD',
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
         WHERE ID = '51acc736-2977-46d8-bffc-9ca95b61aceb'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'ActivityTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '51acc736-2977-46d8-bffc-9ca95b61aceb',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100003,
            'ActivityTypeID',
            'Activity Type ID',
            'Type of activity (Phone Call, Email, Meeting, etc.)',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '2557D870-EF0E-42AE-89CB-142959F0B221',
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
         WHERE ID = '942ec48e-a875-4abf-b274-eef622a5478e'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '942ec48e-a875-4abf-b274-eef622a5478e',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100004,
            'UserID',
            'User ID',
            'MemberJunction user who performed or logged this activity',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '5a6661d4-3276-4172-acc9-9f23fdc9da08'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'Subject')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5a6661d4-3276-4172-acc9-9f23fdc9da08',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100005,
            'Subject',
            'Subject',
            'Brief subject line or title for the activity',
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f372f9ad-8908-48f8-b717-e95d49da5636'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f372f9ad-8908-48f8-b717-e95d49da5636',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
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
         WHERE ID = 'bb0313e6-e58c-481e-8413-1a8bce356aa9'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'RawContent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bb0313e6-e58c-481e-8413-1a8bce356aa9',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100007,
            'RawContent',
            'Raw Content',
            'Full raw content of the activity (email body, call transcript, etc.) used for AI analysis',
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
         WHERE ID = 'ee0337b7-31fa-46c7-a569-26cfb1c21b06'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'ActivityDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ee0337b7-31fa-46c7-a569-26cfb1c21b06',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100008,
            'ActivityDate',
            'Activity Date',
            'Date and time when the activity occurred',
            'datetimeoffset',
            10,
            34,
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
         WHERE ID = 'd1ebd2ad-524f-4329-8e1b-68b394e4b314'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'DurationMinutes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd1ebd2ad-524f-4329-8e1b-68b394e4b314',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100009,
            'DurationMinutes',
            'Duration Minutes',
            'Duration of the activity in minutes (for calls, meetings)',
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
         WHERE ID = '8e51e004-b6fc-4758-adc4-2e2925b8d35d'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8e51e004-b6fc-4758-adc4-2e2925b8d35d',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100010,
            'Status',
            'Status',
            'Current status of the activity (Planned, Completed, Cancelled)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Completed',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2325e483-cc4a-4b4a-9b4c-0aa8546eadfb'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'UrgencyLevel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2325e483-cc4a-4b4a-9b4c-0aa8546eadfb',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100011,
            'UrgencyLevel',
            'Urgency Level',
            'AI-detected urgency level (Low, Medium, High, Critical)',
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
         WHERE ID = 'd3cde7b0-c91d-4db9-8d68-b68fe2931ce5'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'UrgencyScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd3cde7b0-c91d-4db9-8d68-b68fe2931ce5',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100012,
            'UrgencyScore',
            'Urgency Score',
            'Numeric urgency score from AI analysis (0.0000 to 1.0000)',
            'decimal',
            5,
            5,
            4,
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
         WHERE ID = 'f6759afe-fa4c-4282-9e21-0af05412e6f3'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'RequiresFollowUp')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f6759afe-fa4c-4282-9e21-0af05412e6f3',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100013,
            'RequiresFollowUp',
            'Requires Follow Up',
            'Indicates if this activity requires a follow-up action',
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
         WHERE ID = 'a5b9d5b1-89ed-47d4-9666-30b1746d8415'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'FollowUpDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a5b9d5b1-89ed-47d4-9666-30b1746d8415',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100014,
            'FollowUpDate',
            'Follow Up Date',
            'Suggested or scheduled date for follow-up',
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
         WHERE ID = 'af90ecf7-cb01-4b08-b972-675f3736d13c'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'ProcessedByAI')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'af90ecf7-cb01-4b08-b972-675f3736d13c',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100015,
            'ProcessedByAI',
            'Processed By AI',
            'Indicates if this activity has been processed by AI for sentiment/tagging',
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
         WHERE ID = '6fb89d07-07b1-4f47-8e8d-f3982e0062f1'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6fb89d07-07b1-4f47-8e8d-f3982e0062f1',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '50644f78-129f-44ac-98be-5163e82f6433'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '50644f78-129f-44ac-98be-5163e82f6433',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bf8cd1d0-cb91-4991-a5d3-4f156170cab5'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bf8cd1d0-cb91-4991-a5d3-4f156170cab5',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
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
         WHERE ID = '926072dc-c593-4814-8079-cedcf3a83a5c'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'ContactID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '926072dc-c593-4814-8079-cedcf3a83a5c',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100002,
            'ContactID',
            'Contact ID',
            'Reference to the contact this activity is associated with',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '106701FA-CB3E-4488-8849-66DFF03E48BF',
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
         WHERE ID = '1952fb24-247a-4df2-b7f9-e70143e8d121'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'ActivityTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1952fb24-247a-4df2-b7f9-e70143e8d121',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100003,
            'ActivityTypeID',
            'Activity Type ID',
            'Type of activity (Phone Call, Email, Meeting, etc.)',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3D943481-3C29-4C1B-AACC-7C4D1200A94D',
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
         WHERE ID = 'f31793e0-3ab4-44ab-afd4-f3c704e50332'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f31793e0-3ab4-44ab-afd4-f3c704e50332',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100004,
            'UserID',
            'User ID',
            'MemberJunction user who performed or logged this activity',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '17cd3462-3431-48fb-bad0-3214dc8c0da8'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'Subject')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '17cd3462-3431-48fb-bad0-3214dc8c0da8',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100005,
            'Subject',
            'Subject',
            'Brief subject line or title for the activity',
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '116d28f9-7894-4822-9640-698295afce2f'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '116d28f9-7894-4822-9640-698295afce2f',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
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
         WHERE ID = '7e9d80b3-4b74-46a4-9d61-edd5a1bd0d46'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'RawContent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7e9d80b3-4b74-46a4-9d61-edd5a1bd0d46',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100007,
            'RawContent',
            'Raw Content',
            'Full raw content of the activity (email body, call transcript, etc.) used for AI analysis',
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
         WHERE ID = '35f4a00a-d77b-4f6c-87f2-1ba1ed0973b4'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'ActivityDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '35f4a00a-d77b-4f6c-87f2-1ba1ed0973b4',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100008,
            'ActivityDate',
            'Activity Date',
            'Date and time when the activity occurred',
            'datetimeoffset',
            10,
            34,
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
         WHERE ID = 'efc8ba1d-66a2-4ea7-b2d1-6696f48bb067'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'DurationMinutes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'efc8ba1d-66a2-4ea7-b2d1-6696f48bb067',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100009,
            'DurationMinutes',
            'Duration Minutes',
            'Duration of the activity in minutes (for calls, meetings)',
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
         WHERE ID = '0e0c0190-d40d-4bd8-b52d-566222f6113b'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0e0c0190-d40d-4bd8-b52d-566222f6113b',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100010,
            'Status',
            'Status',
            'Current status of the activity (Planned, Completed, Cancelled)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Completed',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7a7d7211-eefb-4335-b430-ab9cd7e3af69'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'UrgencyLevel')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7a7d7211-eefb-4335-b430-ab9cd7e3af69',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100011,
            'UrgencyLevel',
            'Urgency Level',
            'AI-detected urgency level (Low, Medium, High, Critical)',
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
         WHERE ID = '40d3af76-0688-4f54-8f08-71f69e5b42fb'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'UrgencyScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '40d3af76-0688-4f54-8f08-71f69e5b42fb',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100012,
            'UrgencyScore',
            'Urgency Score',
            'Numeric urgency score from AI analysis (0.0000 to 1.0000)',
            'decimal',
            5,
            5,
            4,
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
         WHERE ID = '17ae987d-b893-4a54-9513-508039d47a82'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'RequiresFollowUp')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '17ae987d-b893-4a54-9513-508039d47a82',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100013,
            'RequiresFollowUp',
            'Requires Follow Up',
            'Indicates if this activity requires a follow-up action',
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
         WHERE ID = '0c9b3e0c-4bed-4c95-8453-b0990432d014'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'FollowUpDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0c9b3e0c-4bed-4c95-8453-b0990432d014',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100014,
            'FollowUpDate',
            'Follow Up Date',
            'Suggested or scheduled date for follow-up',
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
         WHERE ID = '1421b00b-bbb9-48dd-bc1f-6ae4a3cc5270'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'ProcessedByAI')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1421b00b-bbb9-48dd-bc1f-6ae4a3cc5270',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100015,
            'ProcessedByAI',
            'Processed By AI',
            'Indicates if this activity has been processed by AI for sentiment/tagging',
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
         WHERE ID = 'b09dd00b-6ed2-4730-ae7f-0115c8498c2f'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b09dd00b-6ed2-4730-ae7f-0115c8498c2f',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '25507147-7f1f-4870-bbe6-7c832ccfc6af'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '25507147-7f1f-4870-bbe6-7c832ccfc6af',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fecea813-0bbd-4a03-bb64-ebfa122714b0'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fecea813-0bbd-4a03-bb64-ebfa122714b0',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
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
         WHERE ID = '974cd8ae-237d-4f7a-9928-0cc2db54d604'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '974cd8ae-237d-4f7a-9928-0cc2db54d604',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
            100002,
            'Name',
            'Name',
            'Display name of the topic',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd47a74b0-7575-4f73-bed5-51d26d71f420'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd47a74b0-7575-4f73-bed5-51d26d71f420',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
            100003,
            'Description',
            'Description',
            'Detailed description of what this topic covers',
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
         WHERE ID = '5bcc9b9e-2234-42fe-b1ce-bf079eaec42e'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = 'ParentTopicID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5bcc9b9e-2234-42fe-b1ce-bf079eaec42e',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
            100004,
            'ParentTopicID',
            'Parent Topic ID',
            'Reference to parent topic for hierarchical organization',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4',
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
         WHERE ID = 'e5c3385c-6fc0-48d7-aa5d-8c82eed52ca2'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e5c3385c-6fc0-48d7-aa5d-8c82eed52ca2',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
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
         WHERE ID = '381bea7b-300f-4dc7-9b94-5ed2996a0099'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '381bea7b-300f-4dc7-9b94-5ed2996a0099',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
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
         WHERE ID = 'a378d297-f55d-42f2-9009-532ecee7297a'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a378d297-f55d-42f2-9009-532ecee7297a',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
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
         WHERE ID = '4d13bdc3-3cd3-4b6a-915c-dec5bfb2e0f5'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'FirstName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4d13bdc3-3cd3-4b6a-915c-dec5bfb2e0f5',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
            100002,
            'FirstName',
            'First Name',
            'First name of the contact',
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
         WHERE ID = 'be6a7fbc-9e88-446d-9701-309bc4b34e81'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'LastName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'be6a7fbc-9e88-446d-9701-309bc4b34e81',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
            100003,
            'LastName',
            'Last Name',
            'Last name of the contact',
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
         WHERE ID = '6e0a3d41-cd4f-408c-b551-74ed7ebf15b5'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e0a3d41-cd4f-408c-b551-74ed7ebf15b5',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
            100004,
            'Email',
            'Email',
            'Primary email address for the contact',
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
         WHERE ID = '64919364-a77a-4443-ae97-d886ed3005c1'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'Phone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64919364-a77a-4443-ae97-d886ed3005c1',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
            100005,
            'Phone',
            'Phone',
            'Primary phone number for the contact',
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
         WHERE ID = '29c1bd23-4a0e-4c80-a9c8-56cfb0d0f3e7'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'Company')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '29c1bd23-4a0e-4c80-a9c8-56cfb0d0f3e7',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
            100006,
            'Company',
            'Company',
            'Company or organization the contact is associated with',
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
         WHERE ID = '7f003668-a36b-432b-b2f8-942ea46a7f1d'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7f003668-a36b-432b-b2f8-942ea46a7f1d',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
            100007,
            'Title',
            'Title',
            'Job title or role of the contact',
            'nvarchar',
            300,
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
         WHERE ID = 'a1be917f-ec28-49c0-a4bc-730830b095e5'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a1be917f-ec28-49c0-a4bc-730830b095e5',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
            100008,
            'Status',
            'Status',
            'Current status of the contact (Active or Inactive)',
            'nvarchar',
            40,
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
         WHERE ID = 'f72a27bf-fa71-4c6f-9492-226f0ce0764d'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f72a27bf-fa71-4c6f-9492-226f0ce0764d',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
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
         WHERE ID = '891aaa84-febe-4be9-8489-ab5cdad3b2f6'  OR 
               (EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '891aaa84-febe-4be9-8489-ab5cdad3b2f6',
            'B87610F9-EEBA-40DF-A840-B13757F18FFD', -- Entity: Contacts
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
         WHERE ID = '45d095eb-02ee-42b8-9c1b-a205795ae2ed'  OR 
               (EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '45d095eb-02ee-42b8-9c1b-a205795ae2ed',
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', -- Entity: Activity Tags__Demo
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
         WHERE ID = 'de31af53-444a-45ad-8555-eae2e3d7dba7'  OR 
               (EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'de31af53-444a-45ad-8555-eae2e3d7dba7',
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', -- Entity: Activity Tags__Demo
            100002,
            'Name',
            'Name',
            'Display name of the activity tag',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1257dbb8-4c3b-4512-85da-0c9a19060797'  OR 
               (EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1257dbb8-4c3b-4512-85da-0c9a19060797',
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', -- Entity: Activity Tags__Demo
            100003,
            'Description',
            'Description',
            'Detailed description of what this tag represents',
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
         WHERE ID = '8aadee6a-61cc-4506-8c9b-86598dc8d0f1'  OR 
               (EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E' AND Name = 'Color')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8aadee6a-61cc-4506-8c9b-86598dc8d0f1',
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', -- Entity: Activity Tags__Demo
            100004,
            'Color',
            'Color',
            'Hex color code or color name for UI display',
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
         WHERE ID = '3cad9e61-84b0-4fa7-bdfc-1389fadaa277'  OR 
               (EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E' AND Name = 'IsAutoGenerated')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3cad9e61-84b0-4fa7-bdfc-1389fadaa277',
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', -- Entity: Activity Tags__Demo
            100005,
            'IsAutoGenerated',
            'Is Auto Generated',
            'Indicates if this tag was created by AI vs manually by a user',
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
         WHERE ID = '373874d7-16e7-4720-a973-66aa0601e24f'  OR 
               (EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '373874d7-16e7-4720-a973-66aa0601e24f',
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', -- Entity: Activity Tags__Demo
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
         WHERE ID = '4878926b-2f17-4478-92cb-e6950f9aef68'  OR 
               (EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4878926b-2f17-4478-92cb-e6950f9aef68',
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', -- Entity: Activity Tags__Demo
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
         WHERE ID = 'bfca4158-9c91-46bf-a6c6-85aa5412b723'  OR 
               (EntityID = '4E873A06-046C-43FF-9A59-D50EFBC7F148' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bfca4158-9c91-46bf-a6c6-85aa5412b723',
            '4E873A06-046C-43FF-9A59-D50EFBC7F148', -- Entity: Contact Tags
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
         WHERE ID = 'ab85c3c3-e753-4b01-8e50-c80c11090a0f'  OR 
               (EntityID = '4E873A06-046C-43FF-9A59-D50EFBC7F148' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ab85c3c3-e753-4b01-8e50-c80c11090a0f',
            '4E873A06-046C-43FF-9A59-D50EFBC7F148', -- Entity: Contact Tags
            100002,
            'Name',
            'Name',
            'Display name of the tag',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b70d2897-6bdd-433d-b851-1f86dc461bef'  OR 
               (EntityID = '4E873A06-046C-43FF-9A59-D50EFBC7F148' AND Name = 'Color')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b70d2897-6bdd-433d-b851-1f86dc461bef',
            '4E873A06-046C-43FF-9A59-D50EFBC7F148', -- Entity: Contact Tags
            100003,
            'Color',
            'Color',
            'Hex color code or color name for UI display',
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
         WHERE ID = '3079b195-0f01-4349-a617-713fd3d45e6f'  OR 
               (EntityID = '4E873A06-046C-43FF-9A59-D50EFBC7F148' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3079b195-0f01-4349-a617-713fd3d45e6f',
            '4E873A06-046C-43FF-9A59-D50EFBC7F148', -- Entity: Contact Tags
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
         WHERE ID = '02ab68c5-8004-4f8e-ba9f-ab9d3ef01b5b'  OR 
               (EntityID = '4E873A06-046C-43FF-9A59-D50EFBC7F148' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '02ab68c5-8004-4f8e-ba9f-ab9d3ef01b5b',
            '4E873A06-046C-43FF-9A59-D50EFBC7F148', -- Entity: Contact Tags
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
         WHERE ID = '1570d265-3fc5-4e7d-bbb6-e6c218bafe22'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1570d265-3fc5-4e7d-bbb6-e6c218bafe22',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
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
         WHERE ID = 'ce4e6c9a-4010-462d-a791-0eaedecd9912'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = 'ActivityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ce4e6c9a-4010-462d-a791-0eaedecd9912',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
            100002,
            'ActivityID',
            'Activity ID',
            'Reference to the activity being tagged',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '86B64641-1AAE-49AA-8088-9D137854CE2B',
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
         WHERE ID = 'ce946303-d310-45f2-b52a-5a52ca7b1aa8'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = 'ActivityTagID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ce946303-d310-45f2-b52a-5a52ca7b1aa8',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
            100003,
            'ActivityTagID',
            'Activity Tag ID',
            'Reference to the tag being applied',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E',
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
         WHERE ID = '429dfd10-e4bc-458e-972e-d875a8060af4'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = 'ConfidenceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '429dfd10-e4bc-458e-972e-d875a8060af4',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
            100004,
            'ConfidenceScore',
            'Confidence Score',
            'AI confidence score for this tag assignment (0.0000 to 1.0000), NULL for manual tags',
            'decimal',
            5,
            5,
            4,
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
         WHERE ID = '6aee9837-5be1-42d5-bd50-038a4959020f'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = 'AppliedByAI')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6aee9837-5be1-42d5-bd50-038a4959020f',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
            100005,
            'AppliedByAI',
            'Applied By AI',
            'Indicates if this tag was applied by AI vs manually by a user',
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
         WHERE ID = '16b6a442-d495-4e6a-a2ad-df5d3e86dcbb'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = 'AppliedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '16b6a442-d495-4e6a-a2ad-df5d3e86dcbb',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
            100006,
            'AppliedAt',
            'Applied At',
            'Timestamp when the tag was applied to the activity',
            'datetimeoffset',
            10,
            34,
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
         WHERE ID = '444e1d41-4b34-4392-aa2f-36bd88c4fd73'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '444e1d41-4b34-4392-aa2f-36bd88c4fd73',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
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
         WHERE ID = 'e30eee6b-2151-458b-88f7-14377c4a4bc1'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e30eee6b-2151-458b-88f7-14377c4a4bc1',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
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
         WHERE ID = 'a4f49698-bf20-4e89-91cb-27e865671112'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a4f49698-bf20-4e89-91cb-27e865671112',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
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
         WHERE ID = '5c0348fd-6cbc-48e3-b089-277c4c40e0b8'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'ActivityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5c0348fd-6cbc-48e3-b089-277c4c40e0b8',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
            100002,
            'ActivityID',
            'Activity ID',
            'Reference to the activity that was analyzed',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '86B64641-1AAE-49AA-8088-9D137854CE2B',
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
         WHERE ID = '03f7bf32-da5e-47b5-967c-a4dac8c3dd30'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'OverallSentiment')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '03f7bf32-da5e-47b5-967c-a4dac8c3dd30',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
            100003,
            'OverallSentiment',
            'Overall Sentiment',
            'Overall sentiment classification (Positive, Neutral, Negative)',
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
         WHERE ID = 'e5b584f1-4230-4d5d-a9c3-aaa6954594f9'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'SentimentScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e5b584f1-4230-4d5d-a9c3-aaa6954594f9',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
            100004,
            'SentimentScore',
            'Sentiment Score',
            'Numeric sentiment score from -1.0000 (negative) to 1.0000 (positive)',
            'decimal',
            5,
            5,
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
         WHERE ID = 'e4dfa6f4-0fbe-485f-846c-8a10fcf50e48'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'EmotionCategory')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4dfa6f4-0fbe-485f-846c-8a10fcf50e48',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
            100005,
            'EmotionCategory',
            'Emotion Category',
            'Detected emotion category (Happy, Frustrated, Confused, Urgent, Grateful, etc.)',
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
         WHERE ID = 'ca147855-c3b1-4b25-a3dd-9b8a60739406'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'ConfidenceScore')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ca147855-c3b1-4b25-a3dd-9b8a60739406',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
            100006,
            'ConfidenceScore',
            'Confidence Score',
            'AI confidence in the analysis (0.0000 to 1.0000)',
            'decimal',
            5,
            5,
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
         WHERE ID = '82c69da0-b590-4fa2-be3d-012f12ef74a7'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'AnalyzedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '82c69da0-b590-4fa2-be3d-012f12ef74a7',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
            100007,
            'AnalyzedAt',
            'Analyzed At',
            'Timestamp when the AI analysis was performed',
            'datetimeoffset',
            10,
            34,
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
         WHERE ID = 'ffe231c1-ac3f-440f-bbbc-3e928092fc67'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = 'AIModelUsed')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ffe231c1-ac3f-440f-bbbc-3e928092fc67',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
            100008,
            'AIModelUsed',
            'AI Model Used',
            'Name or identifier of the AI model used for analysis',
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
         WHERE ID = '5663462b-3ede-4fb9-be3e-e7a8957fdc08'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5663462b-3ede-4fb9-be3e-e7a8957fdc08',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
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
         WHERE ID = 'c9a5679f-51df-4c72-b7b2-1c16e4e4a671'  OR 
               (EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c9a5679f-51df-4c72-b7b2-1c16e4e4a671',
            '6C06E61D-EAD5-47F8-A084-F7F337577E5D', -- Entity: Activity Sentiments
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

/* SQL text to insert entity field value with ID 604f6c97-ecff-4aa1-95f3-e1fc336bf1b3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('604f6c97-ecff-4aa1-95f3-e1fc336bf1b3', '47A2EB37-5C82-4495-BEEA-A11E91E5BCC6', 1, 'Declining', 'Declining')

/* SQL text to insert entity field value with ID 9899dad7-0a10-4a72-bfe3-558bb4990880 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9899dad7-0a10-4a72-bfe3-558bb4990880', '47A2EB37-5C82-4495-BEEA-A11E91E5BCC6', 2, 'Improving', 'Improving')

/* SQL text to insert entity field value with ID 6ebd2097-438a-4757-b64a-a1a6d4a1f399 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6ebd2097-438a-4757-b64a-a1a6d4a1f399', '47A2EB37-5C82-4495-BEEA-A11E91E5BCC6', 3, 'Stable', 'Stable')

/* SQL text to update ValueListType for entity field ID 47A2EB37-5C82-4495-BEEA-A11E91E5BCC6 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='47A2EB37-5C82-4495-BEEA-A11E91E5BCC6'

/* SQL text to insert entity field value with ID b3e4d594-015b-4c21-b628-aba949689dea */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b3e4d594-015b-4c21-b628-aba949689dea', '5BE65152-B90F-41F4-B732-DCD7AC1C248F', 1, 'High', 'High')

/* SQL text to insert entity field value with ID 64bbe1b2-d080-4d2b-8401-1ab0c89e18a5 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('64bbe1b2-d080-4d2b-8401-1ab0c89e18a5', '5BE65152-B90F-41F4-B732-DCD7AC1C248F', 2, 'Low', 'Low')

/* SQL text to insert entity field value with ID 8745bdd7-a790-43ef-85f7-09cd143c2f57 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8745bdd7-a790-43ef-85f7-09cd143c2f57', '5BE65152-B90F-41F4-B732-DCD7AC1C248F', 3, 'Medium', 'Medium')

/* SQL text to update ValueListType for entity field ID 5BE65152-B90F-41F4-B732-DCD7AC1C248F */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5BE65152-B90F-41F4-B732-DCD7AC1C248F'

/* SQL text to insert entity field value with ID cd0ab41f-5679-42d7-8cc8-6eb84f82a1ea */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cd0ab41f-5679-42d7-8cc8-6eb84f82a1ea', 'A1BE917F-EC28-49C0-A4BC-730830B095E5', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID da142e83-6157-40a3-abe9-ce86ca90c685 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('da142e83-6157-40a3-abe9-ce86ca90c685', 'A1BE917F-EC28-49C0-A4BC-730830B095E5', 2, 'Inactive', 'Inactive')

/* SQL text to update ValueListType for entity field ID A1BE917F-EC28-49C0-A4BC-730830B095E5 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A1BE917F-EC28-49C0-A4BC-730830B095E5'

/* SQL text to insert entity field value with ID bc782a55-125d-4cbf-a850-a7dd64fb1f89 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bc782a55-125d-4cbf-a850-a7dd64fb1f89', '7501DC5D-30F7-4C3C-8256-914528C48853', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 687c6c0c-34f7-41b2-9e2f-d357d278be46 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('687c6c0c-34f7-41b2-9e2f-d357d278be46', '7501DC5D-30F7-4C3C-8256-914528C48853', 2, 'Inactive', 'Inactive')

/* SQL text to update ValueListType for entity field ID 7501DC5D-30F7-4C3C-8256-914528C48853 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7501DC5D-30F7-4C3C-8256-914528C48853'

/* SQL text to insert entity field value with ID 41aa8b5e-3933-4a45-b418-084d9456ee3e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('41aa8b5e-3933-4a45-b418-084d9456ee3e', '0E0C0190-D40D-4BD8-B52D-566222F6113B', 1, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field value with ID 63d9c7ef-8b9a-4807-9635-a870671678e0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('63d9c7ef-8b9a-4807-9635-a870671678e0', '0E0C0190-D40D-4BD8-B52D-566222F6113B', 2, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID 3c561916-a18d-47fd-b5bd-5ed0f0bb3341 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3c561916-a18d-47fd-b5bd-5ed0f0bb3341', '0E0C0190-D40D-4BD8-B52D-566222F6113B', 3, 'Planned', 'Planned')

/* SQL text to update ValueListType for entity field ID 0E0C0190-D40D-4BD8-B52D-566222F6113B */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0E0C0190-D40D-4BD8-B52D-566222F6113B'

/* SQL text to insert entity field value with ID 73f6d586-0d58-4ffb-bed1-872bbd8e723d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('73f6d586-0d58-4ffb-bed1-872bbd8e723d', '7A7D7211-EEFB-4335-B430-AB9CD7E3AF69', 1, 'Critical', 'Critical')

/* SQL text to insert entity field value with ID 560b0fce-0011-4954-8d69-fbfe1fcbf09e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('560b0fce-0011-4954-8d69-fbfe1fcbf09e', '7A7D7211-EEFB-4335-B430-AB9CD7E3AF69', 2, 'High', 'High')

/* SQL text to insert entity field value with ID aff227e9-e3d4-4167-9d0b-46ed3d0dfa02 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('aff227e9-e3d4-4167-9d0b-46ed3d0dfa02', '7A7D7211-EEFB-4335-B430-AB9CD7E3AF69', 3, 'Low', 'Low')

/* SQL text to insert entity field value with ID bdf09404-bd9e-4696-bec2-db941d9eefe7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bdf09404-bd9e-4696-bec2-db941d9eefe7', '7A7D7211-EEFB-4335-B430-AB9CD7E3AF69', 4, 'Medium', 'Medium')

/* SQL text to update ValueListType for entity field ID 7A7D7211-EEFB-4335-B430-AB9CD7E3AF69 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='7A7D7211-EEFB-4335-B430-AB9CD7E3AF69'

/* SQL text to insert entity field value with ID a5625012-684e-4f41-afd0-0f408f85098f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a5625012-684e-4f41-afd0-0f408f85098f', '03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30', 1, 'Negative', 'Negative')

/* SQL text to insert entity field value with ID 932067d8-9f7f-4a1e-ad27-4e2249e9b34e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('932067d8-9f7f-4a1e-ad27-4e2249e9b34e', '03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30', 2, 'Neutral', 'Neutral')

/* SQL text to insert entity field value with ID aba26cad-3624-4249-abfb-9b120e387ca9 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('aba26cad-3624-4249-abfb-9b120e387ca9', '03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30', 3, 'Positive', 'Positive')

/* SQL text to update ValueListType for entity field ID 03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c089d339-aed1-497d-ac95-82eb558d03da'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c089d339-aed1-497d-ac95-82eb558d03da', '2557D870-EF0E-42AE-89CB-142959F0B221', 'BF78D71E-6B99-4432-A616-89923E929DB6', 'ActivityTypeID', 'One To Many', 1, 1, 'Activities', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'cd180cc5-2f00-41b0-be37-29dbaa5fbbb0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('cd180cc5-2f00-41b0-be37-29dbaa5fbbb0', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BF78D71E-6B99-4432-A616-89923E929DB6', 'UserID', 'One To Many', 1, 1, 'Activities', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'cd184383-0cbf-4c35-aa88-b4774117f736'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('cd184383-0cbf-4c35-aa88-b4774117f736', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '86B64641-1AAE-49AA-8088-9D137854CE2B', 'UserID', 'One To Many', 1, 1, 'Activities__Demo', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9f566cf1-179f-4d16-82aa-4fce69cd1d74'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9f566cf1-179f-4d16-82aa-4fce69cd1d74', '106701FA-CB3E-4488-8849-66DFF03E48BF', '073D5A17-D62C-4C1D-92F7-3148D5856DFB', 'ContactID', 'One To Many', 1, 1, 'Contact Insights', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c27f112f-132f-49d0-b1b6-f6d3929b8fb4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c27f112f-132f-49d0-b1b6-f6d3929b8fb4', '106701FA-CB3E-4488-8849-66DFF03E48BF', 'C13F60AA-1246-4727-BCCD-43153A005D23', 'ContactID', 'One To Many', 1, 1, 'Contact Tag Links', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0597b030-950f-4c8c-ab66-73ff220a2afa'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0597b030-950f-4c8c-ab66-73ff220a2afa', '106701FA-CB3E-4488-8849-66DFF03E48BF', '86B64641-1AAE-49AA-8088-9D137854CE2B', 'ContactID', 'One To Many', 1, 1, 'Activities__Demo', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '96fa6879-1602-49d7-b1ab-d75a44bb7a0d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('96fa6879-1602-49d7-b1ab-d75a44bb7a0d', '3D943481-3C29-4C1B-AACC-7C4D1200A94D', '86B64641-1AAE-49AA-8088-9D137854CE2B', 'ActivityTypeID', 'One To Many', 1, 1, 'Activities__Demo', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e3459d02-b358-414c-a592-a624740e5322'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e3459d02-b358-414c-a592-a624740e5322', '86B64641-1AAE-49AA-8088-9D137854CE2B', '52D19A73-B000-4718-8A80-EF6477A97B34', 'ActivityID', 'One To Many', 1, 1, 'Activity Tag Links', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ffb02fe3-2fa0-47dc-9b61-aeb1b689be0d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ffb02fe3-2fa0-47dc-9b61-aeb1b689be0d', '86B64641-1AAE-49AA-8088-9D137854CE2B', '6C06E61D-EAD5-47F8-A084-F7F337577E5D', 'ActivityID', 'One To Many', 1, 1, 'Activity Sentiments', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '64556f82-f308-4313-9343-147c04b7bda5'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('64556f82-f308-4313-9343-147c04b7bda5', '86B64641-1AAE-49AA-8088-9D137854CE2B', '456FAB05-0967-43D4-973F-7BBF45E2B834', 'ActivityID', 'One To Many', 1, 1, 'Activity Topics', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '24c3a166-734b-488b-885b-3edc28615a9e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('24c3a166-734b-488b-885b-3edc28615a9e', 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', 'ParentTopicID', 'One To Many', 1, 1, 'Topics', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '39bdae30-5421-4bdb-8b32-90b6784d8802'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('39bdae30-5421-4bdb-8b32-90b6784d8802', 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', '456FAB05-0967-43D4-973F-7BBF45E2B834', 'TopicID', 'One To Many', 1, 1, 'Activity Topics', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a9fec836-3311-4696-99cd-0119ad19f441'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a9fec836-3311-4696-99cd-0119ad19f441', 'B87610F9-EEBA-40DF-A840-B13757F18FFD', 'BF78D71E-6B99-4432-A616-89923E929DB6', 'ContactID', 'One To Many', 1, 1, 'Activities', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b861fefd-c025-4cb3-8616-e61d3d64f2cd'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b861fefd-c025-4cb3-8616-e61d3d64f2cd', '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', '52D19A73-B000-4718-8A80-EF6477A97B34', 'ActivityTagID', 'One To Many', 1, 1, 'Activity Tag Links', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '781e5266-96d4-46a1-9f76-6bfa21ff4825'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('781e5266-96d4-46a1-9f76-6bfa21ff4825', '4E873A06-046C-43FF-9A59-D50EFBC7F148', 'C13F60AA-1246-4727-BCCD-43153A005D23', 'ContactTagID', 'One To Many', 1, 1, 'Contact Tag Links', 2);
   END
                              

/* Index for Foreign Keys for Activity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContactID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity_ContactID' 
    AND object_id = OBJECT_ID('[Contacts].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity_ContactID ON [Contacts].[Activity] ([ContactID]);

-- Index for foreign key ActivityTypeID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity_ActivityTypeID' 
    AND object_id = OBJECT_ID('[Contacts].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity_ActivityTypeID ON [Contacts].[Activity] ([ActivityTypeID]);

-- Index for foreign key UserID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity_UserID' 
    AND object_id = OBJECT_ID('[Contacts].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity_UserID ON [Contacts].[Activity] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID 51ACC736-2977-46D8-BFFC-9CA95B61ACEB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='51ACC736-2977-46D8-BFFC-9CA95B61ACEB',
         @RelatedEntityNameFieldMap='ActivityType'

/* Index for Foreign Keys for Activity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities__Demo
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContactID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity__Demo_ContactID' 
    AND object_id = OBJECT_ID('[Demo].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity__Demo_ContactID ON [Demo].[Activity] ([ContactID]);

-- Index for foreign key ActivityTypeID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity__Demo_ActivityTypeID' 
    AND object_id = OBJECT_ID('[Demo].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity__Demo_ActivityTypeID ON [Demo].[Activity] ([ActivityTypeID]);

-- Index for foreign key UserID in table Activity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Activity__Demo_UserID' 
    AND object_id = OBJECT_ID('[Demo].[Activity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Activity__Demo_UserID ON [Demo].[Activity] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID 1952FB24-247A-4DF2-B7F9-E70143E8D121 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1952FB24-247A-4DF2-B7F9-E70143E8D121',
         @RelatedEntityNameFieldMap='ActivityType'

/* Index for Foreign Keys for ActivitySentiment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Sentiments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActivityID in table ActivitySentiment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActivitySentiment_ActivityID' 
    AND object_id = OBJECT_ID('[Demo].[ActivitySentiment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActivitySentiment_ActivityID ON [Demo].[ActivitySentiment] ([ActivityID]);

/* Index for Foreign Keys for ActivityTagLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tag Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActivityID in table ActivityTagLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActivityTagLink_ActivityID' 
    AND object_id = OBJECT_ID('[Demo].[ActivityTagLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActivityTagLink_ActivityID ON [Demo].[ActivityTagLink] ([ActivityID]);

-- Index for foreign key ActivityTagID in table ActivityTagLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActivityTagLink_ActivityTagID' 
    AND object_id = OBJECT_ID('[Demo].[ActivityTagLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActivityTagLink_ActivityTagID ON [Demo].[ActivityTagLink] ([ActivityTagID]);

/* SQL text to update entity field related entity name field map for entity field ID CE946303-D310-45F2-B52A-5A52CA7B1AA8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CE946303-D310-45F2-B52A-5A52CA7B1AA8',
         @RelatedEntityNameFieldMap='ActivityTag'

/* Index for Foreign Keys for ActivityTag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Activity Sentiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Sentiments
-- Item: vwActivitySentiments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activity Sentiments
-----               SCHEMA:      Demo
-----               BASE TABLE:  ActivitySentiment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwActivitySentiments]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwActivitySentiments];
GO

CREATE VIEW [Demo].[vwActivitySentiments]
AS
SELECT
    a.*
FROM
    [Demo].[ActivitySentiment] AS a
GO
GRANT SELECT ON [Demo].[vwActivitySentiments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Sentiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Sentiments
-- Item: Permissions for vwActivitySentiments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwActivitySentiments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activity Sentiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Sentiments
-- Item: spCreateActivitySentiment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActivitySentiment
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateActivitySentiment]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateActivitySentiment];
GO

CREATE PROCEDURE [Demo].[spCreateActivitySentiment]
    @ID uniqueidentifier = NULL,
    @ActivityID uniqueidentifier,
    @OverallSentiment nvarchar(20),
    @SentimentScore decimal(5, 4),
    @EmotionCategory nvarchar(50),
    @ConfidenceScore decimal(5, 4),
    @AnalyzedAt datetimeoffset = NULL,
    @AIModelUsed nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ActivitySentiment]
            (
                [ID],
                [ActivityID],
                [OverallSentiment],
                [SentimentScore],
                [EmotionCategory],
                [ConfidenceScore],
                [AnalyzedAt],
                [AIModelUsed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActivityID,
                @OverallSentiment,
                @SentimentScore,
                @EmotionCategory,
                @ConfidenceScore,
                ISNULL(@AnalyzedAt, getutcdate()),
                @AIModelUsed
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ActivitySentiment]
            (
                [ActivityID],
                [OverallSentiment],
                [SentimentScore],
                [EmotionCategory],
                [ConfidenceScore],
                [AnalyzedAt],
                [AIModelUsed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActivityID,
                @OverallSentiment,
                @SentimentScore,
                @EmotionCategory,
                @ConfidenceScore,
                ISNULL(@AnalyzedAt, getutcdate()),
                @AIModelUsed
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwActivitySentiments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateActivitySentiment] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Sentiments */

GRANT EXECUTE ON [Demo].[spCreateActivitySentiment] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activity Sentiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Sentiments
-- Item: spUpdateActivitySentiment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActivitySentiment
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateActivitySentiment]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateActivitySentiment];
GO

CREATE PROCEDURE [Demo].[spUpdateActivitySentiment]
    @ID uniqueidentifier,
    @ActivityID uniqueidentifier,
    @OverallSentiment nvarchar(20),
    @SentimentScore decimal(5, 4),
    @EmotionCategory nvarchar(50),
    @ConfidenceScore decimal(5, 4),
    @AnalyzedAt datetimeoffset,
    @AIModelUsed nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivitySentiment]
    SET
        [ActivityID] = @ActivityID,
        [OverallSentiment] = @OverallSentiment,
        [SentimentScore] = @SentimentScore,
        [EmotionCategory] = @EmotionCategory,
        [ConfidenceScore] = @ConfidenceScore,
        [AnalyzedAt] = @AnalyzedAt,
        [AIModelUsed] = @AIModelUsed
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwActivitySentiments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwActivitySentiments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateActivitySentiment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivitySentiment table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateActivitySentiment]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateActivitySentiment];
GO
CREATE TRIGGER [Demo].trgUpdateActivitySentiment
ON [Demo].[ActivitySentiment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivitySentiment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ActivitySentiment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Sentiments */

GRANT EXECUTE ON [Demo].[spUpdateActivitySentiment] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activity Sentiments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Sentiments
-- Item: spDeleteActivitySentiment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActivitySentiment
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteActivitySentiment]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteActivitySentiment];
GO

CREATE PROCEDURE [Demo].[spDeleteActivitySentiment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ActivitySentiment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteActivitySentiment] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Sentiments */

GRANT EXECUTE ON [Demo].[spDeleteActivitySentiment] TO [cdp_Integration]



/* Base View SQL for Activity Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags
-- Item: vwActivityTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activity Tags
-----               SCHEMA:      Contacts
-----               BASE TABLE:  ActivityTag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[vwActivityTags]', 'V') IS NOT NULL
    DROP VIEW [Contacts].[vwActivityTags];
GO

CREATE VIEW [Contacts].[vwActivityTags]
AS
SELECT
    a.*
FROM
    [Contacts].[ActivityTag] AS a
GO
GRANT SELECT ON [Contacts].[vwActivityTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags
-- Item: Permissions for vwActivityTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Contacts].[vwActivityTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activity Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags
-- Item: spCreateActivityTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActivityTag
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[spCreateActivityTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spCreateActivityTag];
GO

CREATE PROCEDURE [Contacts].[spCreateActivityTag]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Color nvarchar(50),
    @IsAutoGenerated bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Contacts].[ActivityTag]
            (
                [ID],
                [Name],
                [Description],
                [Color],
                [IsAutoGenerated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Color,
                ISNULL(@IsAutoGenerated, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Contacts].[ActivityTag]
            (
                [Name],
                [Description],
                [Color],
                [IsAutoGenerated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Color,
                ISNULL(@IsAutoGenerated, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Contacts].[vwActivityTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Contacts].[spCreateActivityTag] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Tags */

GRANT EXECUTE ON [Contacts].[spCreateActivityTag] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activity Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags
-- Item: spUpdateActivityTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActivityTag
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[spUpdateActivityTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spUpdateActivityTag];
GO

CREATE PROCEDURE [Contacts].[spUpdateActivityTag]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Color nvarchar(50),
    @IsAutoGenerated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[ActivityTag]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Color] = @Color,
        [IsAutoGenerated] = @IsAutoGenerated
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Contacts].[vwActivityTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Contacts].[vwActivityTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Contacts].[spUpdateActivityTag] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivityTag table
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[trgUpdateActivityTag]', 'TR') IS NOT NULL
    DROP TRIGGER [Contacts].[trgUpdateActivityTag];
GO
CREATE TRIGGER [Contacts].trgUpdateActivityTag
ON [Contacts].[ActivityTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[ActivityTag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Contacts].[ActivityTag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Tags */

GRANT EXECUTE ON [Contacts].[spUpdateActivityTag] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activity Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags
-- Item: spDeleteActivityTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActivityTag
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[spDeleteActivityTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spDeleteActivityTag];
GO

CREATE PROCEDURE [Contacts].[spDeleteActivityTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Contacts].[ActivityTag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Contacts].[spDeleteActivityTag] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Tags */

GRANT EXECUTE ON [Contacts].[spDeleteActivityTag] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 942EC48E-A875-4ABF-B274-EEF622A5478E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='942EC48E-A875-4ABF-B274-EEF622A5478E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID F31793E0-3AB4-44AB-AFD4-F3C704E50332 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F31793E0-3AB4-44AB-AFD4-F3C704E50332',
         @RelatedEntityNameFieldMap='User'

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
-----               SCHEMA:      Contacts
-----               BASE TABLE:  Activity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[vwActivities]', 'V') IS NOT NULL
    DROP VIEW [Contacts].[vwActivities];
GO

CREATE VIEW [Contacts].[vwActivities]
AS
SELECT
    a.*,
    ActivityType_ActivityTypeID.[Name] AS [ActivityType],
    User_UserID.[Name] AS [User]
FROM
    [Contacts].[Activity] AS a
INNER JOIN
    [Contacts].[ActivityType] AS ActivityType_ActivityTypeID
  ON
    [a].[ActivityTypeID] = ActivityType_ActivityTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [Contacts].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Permissions for vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Contacts].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
IF OBJECT_ID('[Contacts].[spCreateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spCreateActivity];
GO

CREATE PROCEDURE [Contacts].[spCreateActivity]
    @ID uniqueidentifier = NULL,
    @ContactID uniqueidentifier,
    @ActivityTypeID uniqueidentifier,
    @UserID uniqueidentifier,
    @Subject nvarchar(255),
    @Description nvarchar(MAX),
    @RawContent nvarchar(MAX),
    @ActivityDate datetimeoffset = NULL,
    @DurationMinutes int,
    @Status nvarchar(20) = NULL,
    @UrgencyLevel nvarchar(20),
    @UrgencyScore decimal(5, 4),
    @RequiresFollowUp bit = NULL,
    @FollowUpDate date,
    @ProcessedByAI bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Contacts].[Activity]
            (
                [ID],
                [ContactID],
                [ActivityTypeID],
                [UserID],
                [Subject],
                [Description],
                [RawContent],
                [ActivityDate],
                [DurationMinutes],
                [Status],
                [UrgencyLevel],
                [UrgencyScore],
                [RequiresFollowUp],
                [FollowUpDate],
                [ProcessedByAI]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContactID,
                @ActivityTypeID,
                @UserID,
                @Subject,
                @Description,
                @RawContent,
                ISNULL(@ActivityDate, getutcdate()),
                @DurationMinutes,
                ISNULL(@Status, 'Completed'),
                @UrgencyLevel,
                @UrgencyScore,
                ISNULL(@RequiresFollowUp, 0),
                @FollowUpDate,
                ISNULL(@ProcessedByAI, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Contacts].[Activity]
            (
                [ContactID],
                [ActivityTypeID],
                [UserID],
                [Subject],
                [Description],
                [RawContent],
                [ActivityDate],
                [DurationMinutes],
                [Status],
                [UrgencyLevel],
                [UrgencyScore],
                [RequiresFollowUp],
                [FollowUpDate],
                [ProcessedByAI]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContactID,
                @ActivityTypeID,
                @UserID,
                @Subject,
                @Description,
                @RawContent,
                ISNULL(@ActivityDate, getutcdate()),
                @DurationMinutes,
                ISNULL(@Status, 'Completed'),
                @UrgencyLevel,
                @UrgencyScore,
                ISNULL(@RequiresFollowUp, 0),
                @FollowUpDate,
                ISNULL(@ProcessedByAI, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Contacts].[vwActivities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Contacts].[spCreateActivity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activities */

GRANT EXECUTE ON [Contacts].[spCreateActivity] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[Contacts].[spUpdateActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spUpdateActivity];
GO

CREATE PROCEDURE [Contacts].[spUpdateActivity]
    @ID uniqueidentifier,
    @ContactID uniqueidentifier,
    @ActivityTypeID uniqueidentifier,
    @UserID uniqueidentifier,
    @Subject nvarchar(255),
    @Description nvarchar(MAX),
    @RawContent nvarchar(MAX),
    @ActivityDate datetimeoffset,
    @DurationMinutes int,
    @Status nvarchar(20),
    @UrgencyLevel nvarchar(20),
    @UrgencyScore decimal(5, 4),
    @RequiresFollowUp bit,
    @FollowUpDate date,
    @ProcessedByAI bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[Activity]
    SET
        [ContactID] = @ContactID,
        [ActivityTypeID] = @ActivityTypeID,
        [UserID] = @UserID,
        [Subject] = @Subject,
        [Description] = @Description,
        [RawContent] = @RawContent,
        [ActivityDate] = @ActivityDate,
        [DurationMinutes] = @DurationMinutes,
        [Status] = @Status,
        [UrgencyLevel] = @UrgencyLevel,
        [UrgencyScore] = @UrgencyScore,
        [RequiresFollowUp] = @RequiresFollowUp,
        [FollowUpDate] = @FollowUpDate,
        [ProcessedByAI] = @ProcessedByAI
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Contacts].[vwActivities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Contacts].[vwActivities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Contacts].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Activity table
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[trgUpdateActivity]', 'TR') IS NOT NULL
    DROP TRIGGER [Contacts].[trgUpdateActivity];
GO
CREATE TRIGGER [Contacts].trgUpdateActivity
ON [Contacts].[Activity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[Activity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Contacts].[Activity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activities */

GRANT EXECUTE ON [Contacts].[spUpdateActivity] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[Contacts].[spDeleteActivity]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spDeleteActivity];
GO

CREATE PROCEDURE [Contacts].[spDeleteActivity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Contacts].[Activity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Contacts].[spDeleteActivity] TO [cdp_Integration]
    

/* spDelete Permissions for Activities */

GRANT EXECUTE ON [Contacts].[spDeleteActivity] TO [cdp_Integration]



/* Base View SQL for Activity Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tag Links
-- Item: vwActivityTagLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activity Tag Links
-----               SCHEMA:      Demo
-----               BASE TABLE:  ActivityTagLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwActivityTagLinks]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwActivityTagLinks];
GO

CREATE VIEW [Demo].[vwActivityTagLinks]
AS
SELECT
    a.*,
    ActivityTag__Demo_ActivityTagID.[Name] AS [ActivityTag]
FROM
    [Demo].[ActivityTagLink] AS a
INNER JOIN
    [Demo].[ActivityTag] AS ActivityTag__Demo_ActivityTagID
  ON
    [a].[ActivityTagID] = ActivityTag__Demo_ActivityTagID.[ID]
GO
GRANT SELECT ON [Demo].[vwActivityTagLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tag Links
-- Item: Permissions for vwActivityTagLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwActivityTagLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activity Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tag Links
-- Item: spCreateActivityTagLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActivityTagLink
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateActivityTagLink]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateActivityTagLink];
GO

CREATE PROCEDURE [Demo].[spCreateActivityTagLink]
    @ID uniqueidentifier = NULL,
    @ActivityID uniqueidentifier,
    @ActivityTagID uniqueidentifier,
    @ConfidenceScore decimal(5, 4),
    @AppliedByAI bit = NULL,
    @AppliedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ActivityTagLink]
            (
                [ID],
                [ActivityID],
                [ActivityTagID],
                [ConfidenceScore],
                [AppliedByAI],
                [AppliedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActivityID,
                @ActivityTagID,
                @ConfidenceScore,
                ISNULL(@AppliedByAI, 0),
                ISNULL(@AppliedAt, getutcdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ActivityTagLink]
            (
                [ActivityID],
                [ActivityTagID],
                [ConfidenceScore],
                [AppliedByAI],
                [AppliedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActivityID,
                @ActivityTagID,
                @ConfidenceScore,
                ISNULL(@AppliedByAI, 0),
                ISNULL(@AppliedAt, getutcdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwActivityTagLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateActivityTagLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Tag Links */

GRANT EXECUTE ON [Demo].[spCreateActivityTagLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activity Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tag Links
-- Item: spUpdateActivityTagLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActivityTagLink
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateActivityTagLink]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateActivityTagLink];
GO

CREATE PROCEDURE [Demo].[spUpdateActivityTagLink]
    @ID uniqueidentifier,
    @ActivityID uniqueidentifier,
    @ActivityTagID uniqueidentifier,
    @ConfidenceScore decimal(5, 4),
    @AppliedByAI bit,
    @AppliedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityTagLink]
    SET
        [ActivityID] = @ActivityID,
        [ActivityTagID] = @ActivityTagID,
        [ConfidenceScore] = @ConfidenceScore,
        [AppliedByAI] = @AppliedByAI,
        [AppliedAt] = @AppliedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwActivityTagLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwActivityTagLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateActivityTagLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivityTagLink table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateActivityTagLink]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateActivityTagLink];
GO
CREATE TRIGGER [Demo].trgUpdateActivityTagLink
ON [Demo].[ActivityTagLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityTagLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ActivityTagLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Tag Links */

GRANT EXECUTE ON [Demo].[spUpdateActivityTagLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activity Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tag Links
-- Item: spDeleteActivityTagLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActivityTagLink
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteActivityTagLink]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteActivityTagLink];
GO

CREATE PROCEDURE [Demo].[spDeleteActivityTagLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ActivityTagLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteActivityTagLink] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Tag Links */

GRANT EXECUTE ON [Demo].[spDeleteActivityTagLink] TO [cdp_Integration]



/* Base View SQL for Activities__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities__Demo
-- Item: vwActivities__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities__Demo
-----               SCHEMA:      Demo
-----               BASE TABLE:  Activity
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwActivities__Demo]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwActivities__Demo];
GO

CREATE VIEW [Demo].[vwActivities__Demo]
AS
SELECT
    a.*,
    ActivityType__Demo_ActivityTypeID.[Name] AS [ActivityType],
    User_UserID.[Name] AS [User]
FROM
    [Demo].[Activity] AS a
INNER JOIN
    [Demo].[ActivityType] AS ActivityType__Demo_ActivityTypeID
  ON
    [a].[ActivityTypeID] = ActivityType__Demo_ActivityTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [Demo].[vwActivities__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activities__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities__Demo
-- Item: Permissions for vwActivities__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwActivities__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activities__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities__Demo
-- Item: spCreateActivity__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateActivity__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateActivity__Demo];
GO

CREATE PROCEDURE [Demo].[spCreateActivity__Demo]
    @ID uniqueidentifier = NULL,
    @ContactID uniqueidentifier,
    @ActivityTypeID uniqueidentifier,
    @UserID uniqueidentifier,
    @Subject nvarchar(255),
    @Description nvarchar(MAX),
    @RawContent nvarchar(MAX),
    @ActivityDate datetimeoffset = NULL,
    @DurationMinutes int,
    @Status nvarchar(20) = NULL,
    @UrgencyLevel nvarchar(20),
    @UrgencyScore decimal(5, 4),
    @RequiresFollowUp bit = NULL,
    @FollowUpDate date,
    @ProcessedByAI bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[Activity]
            (
                [ID],
                [ContactID],
                [ActivityTypeID],
                [UserID],
                [Subject],
                [Description],
                [RawContent],
                [ActivityDate],
                [DurationMinutes],
                [Status],
                [UrgencyLevel],
                [UrgencyScore],
                [RequiresFollowUp],
                [FollowUpDate],
                [ProcessedByAI]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContactID,
                @ActivityTypeID,
                @UserID,
                @Subject,
                @Description,
                @RawContent,
                ISNULL(@ActivityDate, getutcdate()),
                @DurationMinutes,
                ISNULL(@Status, 'Completed'),
                @UrgencyLevel,
                @UrgencyScore,
                ISNULL(@RequiresFollowUp, 0),
                @FollowUpDate,
                ISNULL(@ProcessedByAI, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[Activity]
            (
                [ContactID],
                [ActivityTypeID],
                [UserID],
                [Subject],
                [Description],
                [RawContent],
                [ActivityDate],
                [DurationMinutes],
                [Status],
                [UrgencyLevel],
                [UrgencyScore],
                [RequiresFollowUp],
                [FollowUpDate],
                [ProcessedByAI]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContactID,
                @ActivityTypeID,
                @UserID,
                @Subject,
                @Description,
                @RawContent,
                ISNULL(@ActivityDate, getutcdate()),
                @DurationMinutes,
                ISNULL(@Status, 'Completed'),
                @UrgencyLevel,
                @UrgencyScore,
                ISNULL(@RequiresFollowUp, 0),
                @FollowUpDate,
                ISNULL(@ProcessedByAI, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwActivities__Demo] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateActivity__Demo] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activities__Demo */

GRANT EXECUTE ON [Demo].[spCreateActivity__Demo] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activities__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities__Demo
-- Item: spUpdateActivity__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateActivity__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateActivity__Demo];
GO

CREATE PROCEDURE [Demo].[spUpdateActivity__Demo]
    @ID uniqueidentifier,
    @ContactID uniqueidentifier,
    @ActivityTypeID uniqueidentifier,
    @UserID uniqueidentifier,
    @Subject nvarchar(255),
    @Description nvarchar(MAX),
    @RawContent nvarchar(MAX),
    @ActivityDate datetimeoffset,
    @DurationMinutes int,
    @Status nvarchar(20),
    @UrgencyLevel nvarchar(20),
    @UrgencyScore decimal(5, 4),
    @RequiresFollowUp bit,
    @FollowUpDate date,
    @ProcessedByAI bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[Activity]
    SET
        [ContactID] = @ContactID,
        [ActivityTypeID] = @ActivityTypeID,
        [UserID] = @UserID,
        [Subject] = @Subject,
        [Description] = @Description,
        [RawContent] = @RawContent,
        [ActivityDate] = @ActivityDate,
        [DurationMinutes] = @DurationMinutes,
        [Status] = @Status,
        [UrgencyLevel] = @UrgencyLevel,
        [UrgencyScore] = @UrgencyScore,
        [RequiresFollowUp] = @RequiresFollowUp,
        [FollowUpDate] = @FollowUpDate,
        [ProcessedByAI] = @ProcessedByAI
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwActivities__Demo] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwActivities__Demo]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateActivity__Demo] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Activity table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateActivity__Demo]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateActivity__Demo];
GO
CREATE TRIGGER [Demo].trgUpdateActivity__Demo
ON [Demo].[Activity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[Activity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[Activity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activities__Demo */

GRANT EXECUTE ON [Demo].[spUpdateActivity__Demo] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activities__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities__Demo
-- Item: spDeleteActivity__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Activity
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteActivity__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteActivity__Demo];
GO

CREATE PROCEDURE [Demo].[spDeleteActivity__Demo]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[Activity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteActivity__Demo] TO [cdp_Integration]
    

/* spDelete Permissions for Activities__Demo */

GRANT EXECUTE ON [Demo].[spDeleteActivity__Demo] TO [cdp_Integration]



/* Index for Foreign Keys for ActivityTag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags__Demo
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ActivityTopic */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Topics
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActivityID in table ActivityTopic
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActivityTopic_ActivityID' 
    AND object_id = OBJECT_ID('[Demo].[ActivityTopic]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActivityTopic_ActivityID ON [Demo].[ActivityTopic] ([ActivityID]);

-- Index for foreign key TopicID in table ActivityTopic
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActivityTopic_TopicID' 
    AND object_id = OBJECT_ID('[Demo].[ActivityTopic]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActivityTopic_TopicID ON [Demo].[ActivityTopic] ([TopicID]);

/* SQL text to update entity field related entity name field map for entity field ID 196BD48B-0553-495F-8450-77DBD3E1DFCC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='196BD48B-0553-495F-8450-77DBD3E1DFCC',
         @RelatedEntityNameFieldMap='Topic'

/* Index for Foreign Keys for ActivityType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ActivityType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types__Demo
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Activity Tags__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags__Demo
-- Item: vwActivityTags__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activity Tags__Demo
-----               SCHEMA:      Demo
-----               BASE TABLE:  ActivityTag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwActivityTags__Demo]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwActivityTags__Demo];
GO

CREATE VIEW [Demo].[vwActivityTags__Demo]
AS
SELECT
    a.*
FROM
    [Demo].[ActivityTag] AS a
GO
GRANT SELECT ON [Demo].[vwActivityTags__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Tags__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags__Demo
-- Item: Permissions for vwActivityTags__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwActivityTags__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activity Tags__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags__Demo
-- Item: spCreateActivityTag__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActivityTag
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateActivityTag__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateActivityTag__Demo];
GO

CREATE PROCEDURE [Demo].[spCreateActivityTag__Demo]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Color nvarchar(50),
    @IsAutoGenerated bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ActivityTag]
            (
                [ID],
                [Name],
                [Description],
                [Color],
                [IsAutoGenerated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Color,
                ISNULL(@IsAutoGenerated, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ActivityTag]
            (
                [Name],
                [Description],
                [Color],
                [IsAutoGenerated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Color,
                ISNULL(@IsAutoGenerated, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwActivityTags__Demo] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateActivityTag__Demo] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Tags__Demo */

GRANT EXECUTE ON [Demo].[spCreateActivityTag__Demo] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activity Tags__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags__Demo
-- Item: spUpdateActivityTag__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActivityTag
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateActivityTag__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateActivityTag__Demo];
GO

CREATE PROCEDURE [Demo].[spUpdateActivityTag__Demo]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Color nvarchar(50),
    @IsAutoGenerated bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityTag]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Color] = @Color,
        [IsAutoGenerated] = @IsAutoGenerated
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwActivityTags__Demo] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwActivityTags__Demo]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateActivityTag__Demo] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivityTag table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateActivityTag__Demo]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateActivityTag__Demo];
GO
CREATE TRIGGER [Demo].trgUpdateActivityTag__Demo
ON [Demo].[ActivityTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityTag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ActivityTag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Tags__Demo */

GRANT EXECUTE ON [Demo].[spUpdateActivityTag__Demo] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activity Tags__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Tags__Demo
-- Item: spDeleteActivityTag__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActivityTag
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteActivityTag__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteActivityTag__Demo];
GO

CREATE PROCEDURE [Demo].[spDeleteActivityTag__Demo]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ActivityTag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteActivityTag__Demo] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Tags__Demo */

GRANT EXECUTE ON [Demo].[spDeleteActivityTag__Demo] TO [cdp_Integration]



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
-----               SCHEMA:      Contacts
-----               BASE TABLE:  ActivityType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[vwActivityTypes]', 'V') IS NOT NULL
    DROP VIEW [Contacts].[vwActivityTypes];
GO

CREATE VIEW [Contacts].[vwActivityTypes]
AS
SELECT
    a.*
FROM
    [Contacts].[ActivityType] AS a
GO
GRANT SELECT ON [Contacts].[vwActivityTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types
-- Item: Permissions for vwActivityTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Contacts].[vwActivityTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
IF OBJECT_ID('[Contacts].[spCreateActivityType]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spCreateActivityType];
GO

CREATE PROCEDURE [Contacts].[spCreateActivityType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Contacts].[ActivityType]
            (
                [ID],
                [Name],
                [Description],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Icon
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Contacts].[ActivityType]
            (
                [Name],
                [Description],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Icon
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Contacts].[vwActivityTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Contacts].[spCreateActivityType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Types */

GRANT EXECUTE ON [Contacts].[spCreateActivityType] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[Contacts].[spUpdateActivityType]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spUpdateActivityType];
GO

CREATE PROCEDURE [Contacts].[spUpdateActivityType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[ActivityType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Contacts].[vwActivityTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Contacts].[vwActivityTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Contacts].[spUpdateActivityType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivityType table
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[trgUpdateActivityType]', 'TR') IS NOT NULL
    DROP TRIGGER [Contacts].[trgUpdateActivityType];
GO
CREATE TRIGGER [Contacts].trgUpdateActivityType
ON [Contacts].[ActivityType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[ActivityType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Contacts].[ActivityType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Types */

GRANT EXECUTE ON [Contacts].[spUpdateActivityType] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[Contacts].[spDeleteActivityType]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spDeleteActivityType];
GO

CREATE PROCEDURE [Contacts].[spDeleteActivityType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Contacts].[ActivityType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Contacts].[spDeleteActivityType] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Types */

GRANT EXECUTE ON [Contacts].[spDeleteActivityType] TO [cdp_Integration]



/* Base View SQL for Activity Types__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types__Demo
-- Item: vwActivityTypes__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activity Types__Demo
-----               SCHEMA:      Demo
-----               BASE TABLE:  ActivityType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwActivityTypes__Demo]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwActivityTypes__Demo];
GO

CREATE VIEW [Demo].[vwActivityTypes__Demo]
AS
SELECT
    a.*
FROM
    [Demo].[ActivityType] AS a
GO
GRANT SELECT ON [Demo].[vwActivityTypes__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Types__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types__Demo
-- Item: Permissions for vwActivityTypes__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwActivityTypes__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activity Types__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types__Demo
-- Item: spCreateActivityType__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActivityType
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateActivityType__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateActivityType__Demo];
GO

CREATE PROCEDURE [Demo].[spCreateActivityType__Demo]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ActivityType]
            (
                [ID],
                [Name],
                [Description],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Icon
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ActivityType]
            (
                [Name],
                [Description],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Icon
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwActivityTypes__Demo] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateActivityType__Demo] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Types__Demo */

GRANT EXECUTE ON [Demo].[spCreateActivityType__Demo] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activity Types__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types__Demo
-- Item: spUpdateActivityType__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActivityType
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateActivityType__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateActivityType__Demo];
GO

CREATE PROCEDURE [Demo].[spUpdateActivityType__Demo]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwActivityTypes__Demo] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwActivityTypes__Demo]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateActivityType__Demo] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivityType table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateActivityType__Demo]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateActivityType__Demo];
GO
CREATE TRIGGER [Demo].trgUpdateActivityType__Demo
ON [Demo].[ActivityType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ActivityType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Types__Demo */

GRANT EXECUTE ON [Demo].[spUpdateActivityType__Demo] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activity Types__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Types__Demo
-- Item: spDeleteActivityType__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActivityType
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteActivityType__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteActivityType__Demo];
GO

CREATE PROCEDURE [Demo].[spDeleteActivityType__Demo]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ActivityType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteActivityType__Demo] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Types__Demo */

GRANT EXECUTE ON [Demo].[spDeleteActivityType__Demo] TO [cdp_Integration]



/* Base View SQL for Activity Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Topics
-- Item: vwActivityTopics
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activity Topics
-----               SCHEMA:      Demo
-----               BASE TABLE:  ActivityTopic
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwActivityTopics]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwActivityTopics];
GO

CREATE VIEW [Demo].[vwActivityTopics]
AS
SELECT
    a.*,
    Topic_TopicID.[Name] AS [Topic]
FROM
    [Demo].[ActivityTopic] AS a
INNER JOIN
    [Demo].[Topic] AS Topic_TopicID
  ON
    [a].[TopicID] = Topic_TopicID.[ID]
GO
GRANT SELECT ON [Demo].[vwActivityTopics] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Activity Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Topics
-- Item: Permissions for vwActivityTopics
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwActivityTopics] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Activity Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Topics
-- Item: spCreateActivityTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActivityTopic
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateActivityTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateActivityTopic];
GO

CREATE PROCEDURE [Demo].[spCreateActivityTopic]
    @ID uniqueidentifier = NULL,
    @ActivityID uniqueidentifier,
    @TopicID uniqueidentifier,
    @ConfidenceScore decimal(5, 4),
    @RelevanceRank int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ActivityTopic]
            (
                [ID],
                [ActivityID],
                [TopicID],
                [ConfidenceScore],
                [RelevanceRank]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActivityID,
                @TopicID,
                @ConfidenceScore,
                ISNULL(@RelevanceRank, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ActivityTopic]
            (
                [ActivityID],
                [TopicID],
                [ConfidenceScore],
                [RelevanceRank]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActivityID,
                @TopicID,
                @ConfidenceScore,
                ISNULL(@RelevanceRank, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwActivityTopics] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateActivityTopic] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Activity Topics */

GRANT EXECUTE ON [Demo].[spCreateActivityTopic] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Activity Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Topics
-- Item: spUpdateActivityTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActivityTopic
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateActivityTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateActivityTopic];
GO

CREATE PROCEDURE [Demo].[spUpdateActivityTopic]
    @ID uniqueidentifier,
    @ActivityID uniqueidentifier,
    @TopicID uniqueidentifier,
    @ConfidenceScore decimal(5, 4),
    @RelevanceRank int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityTopic]
    SET
        [ActivityID] = @ActivityID,
        [TopicID] = @TopicID,
        [ConfidenceScore] = @ConfidenceScore,
        [RelevanceRank] = @RelevanceRank
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwActivityTopics] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwActivityTopics]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateActivityTopic] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActivityTopic table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateActivityTopic]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateActivityTopic];
GO
CREATE TRIGGER [Demo].trgUpdateActivityTopic
ON [Demo].[ActivityTopic]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ActivityTopic]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ActivityTopic] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Activity Topics */

GRANT EXECUTE ON [Demo].[spUpdateActivityTopic] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Activity Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activity Topics
-- Item: spDeleteActivityTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActivityTopic
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteActivityTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteActivityTopic];
GO

CREATE PROCEDURE [Demo].[spDeleteActivityTopic]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ActivityTopic]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteActivityTopic] TO [cdp_Integration]
    

/* spDelete Permissions for Activity Topics */

GRANT EXECUTE ON [Demo].[spDeleteActivityTopic] TO [cdp_Integration]



/* Index for Foreign Keys for ContactInsight */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Insights
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContactID in table ContactInsight
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContactInsight_ContactID' 
    AND object_id = OBJECT_ID('[Demo].[ContactInsight]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContactInsight_ContactID ON [Demo].[ContactInsight] ([ContactID]);

/* Index for Foreign Keys for ContactTagLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tag Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContactID in table ContactTagLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContactTagLink_ContactID' 
    AND object_id = OBJECT_ID('[Demo].[ContactTagLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContactTagLink_ContactID ON [Demo].[ContactTagLink] ([ContactID]);

-- Index for foreign key ContactTagID in table ContactTagLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContactTagLink_ContactTagID' 
    AND object_id = OBJECT_ID('[Demo].[ContactTagLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContactTagLink_ContactTagID ON [Demo].[ContactTagLink] ([ContactTagID]);

/* SQL text to update entity field related entity name field map for entity field ID 4EE5F22E-AE08-453D-BC59-F5C5D54B8B34 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4EE5F22E-AE08-453D-BC59-F5C5D54B8B34',
         @RelatedEntityNameFieldMap='ContactTag'

/* Index for Foreign Keys for ContactTag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Contact Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Insights
-- Item: vwContactInsights
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Insights
-----               SCHEMA:      Demo
-----               BASE TABLE:  ContactInsight
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwContactInsights]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwContactInsights];
GO

CREATE VIEW [Demo].[vwContactInsights]
AS
SELECT
    c.*
FROM
    [Demo].[ContactInsight] AS c
GO
GRANT SELECT ON [Demo].[vwContactInsights] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contact Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Insights
-- Item: Permissions for vwContactInsights
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwContactInsights] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contact Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Insights
-- Item: spCreateContactInsight
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContactInsight
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateContactInsight]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateContactInsight];
GO

CREATE PROCEDURE [Demo].[spCreateContactInsight]
    @ID uniqueidentifier = NULL,
    @ContactID uniqueidentifier,
    @OverallSentimentTrend nvarchar(20),
    @AverageSentimentScore decimal(5, 4),
    @TopTopics nvarchar(MAX),
    @EngagementLevel nvarchar(20),
    @ChurnRiskScore decimal(5, 4),
    @LastAnalyzedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ContactInsight]
            (
                [ID],
                [ContactID],
                [OverallSentimentTrend],
                [AverageSentimentScore],
                [TopTopics],
                [EngagementLevel],
                [ChurnRiskScore],
                [LastAnalyzedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContactID,
                @OverallSentimentTrend,
                @AverageSentimentScore,
                @TopTopics,
                @EngagementLevel,
                @ChurnRiskScore,
                ISNULL(@LastAnalyzedAt, getutcdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ContactInsight]
            (
                [ContactID],
                [OverallSentimentTrend],
                [AverageSentimentScore],
                [TopTopics],
                [EngagementLevel],
                [ChurnRiskScore],
                [LastAnalyzedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContactID,
                @OverallSentimentTrend,
                @AverageSentimentScore,
                @TopTopics,
                @EngagementLevel,
                @ChurnRiskScore,
                ISNULL(@LastAnalyzedAt, getutcdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwContactInsights] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateContactInsight] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contact Insights */

GRANT EXECUTE ON [Demo].[spCreateContactInsight] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contact Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Insights
-- Item: spUpdateContactInsight
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContactInsight
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateContactInsight]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateContactInsight];
GO

CREATE PROCEDURE [Demo].[spUpdateContactInsight]
    @ID uniqueidentifier,
    @ContactID uniqueidentifier,
    @OverallSentimentTrend nvarchar(20),
    @AverageSentimentScore decimal(5, 4),
    @TopTopics nvarchar(MAX),
    @EngagementLevel nvarchar(20),
    @ChurnRiskScore decimal(5, 4),
    @LastAnalyzedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ContactInsight]
    SET
        [ContactID] = @ContactID,
        [OverallSentimentTrend] = @OverallSentimentTrend,
        [AverageSentimentScore] = @AverageSentimentScore,
        [TopTopics] = @TopTopics,
        [EngagementLevel] = @EngagementLevel,
        [ChurnRiskScore] = @ChurnRiskScore,
        [LastAnalyzedAt] = @LastAnalyzedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwContactInsights] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwContactInsights]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateContactInsight] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContactInsight table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateContactInsight]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateContactInsight];
GO
CREATE TRIGGER [Demo].trgUpdateContactInsight
ON [Demo].[ContactInsight]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ContactInsight]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ContactInsight] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Contact Insights */

GRANT EXECUTE ON [Demo].[spUpdateContactInsight] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Contact Insights */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Insights
-- Item: spDeleteContactInsight
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContactInsight
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteContactInsight]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteContactInsight];
GO

CREATE PROCEDURE [Demo].[spDeleteContactInsight]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ContactInsight]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteContactInsight] TO [cdp_Integration]
    

/* spDelete Permissions for Contact Insights */

GRANT EXECUTE ON [Demo].[spDeleteContactInsight] TO [cdp_Integration]



/* Base View SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: vwContactTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Tags
-----               SCHEMA:      Demo
-----               BASE TABLE:  ContactTag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwContactTags]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwContactTags];
GO

CREATE VIEW [Demo].[vwContactTags]
AS
SELECT
    c.*
FROM
    [Demo].[ContactTag] AS c
GO
GRANT SELECT ON [Demo].[vwContactTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: Permissions for vwContactTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwContactTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spCreateContactTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContactTag
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateContactTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateContactTag];
GO

CREATE PROCEDURE [Demo].[spCreateContactTag]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Color nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ContactTag]
            (
                [ID],
                [Name],
                [Color]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Color
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ContactTag]
            (
                [Name],
                [Color]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Color
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwContactTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateContactTag] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contact Tags */

GRANT EXECUTE ON [Demo].[spCreateContactTag] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spUpdateContactTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContactTag
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateContactTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateContactTag];
GO

CREATE PROCEDURE [Demo].[spUpdateContactTag]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Color nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ContactTag]
    SET
        [Name] = @Name,
        [Color] = @Color
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwContactTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwContactTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateContactTag] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContactTag table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateContactTag]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateContactTag];
GO
CREATE TRIGGER [Demo].trgUpdateContactTag
ON [Demo].[ContactTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ContactTag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ContactTag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Contact Tags */

GRANT EXECUTE ON [Demo].[spUpdateContactTag] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spDeleteContactTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContactTag
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteContactTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteContactTag];
GO

CREATE PROCEDURE [Demo].[spDeleteContactTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ContactTag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteContactTag] TO [cdp_Integration]
    

/* spDelete Permissions for Contact Tags */

GRANT EXECUTE ON [Demo].[spDeleteContactTag] TO [cdp_Integration]



/* Base View SQL for Contact Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tag Links
-- Item: vwContactTagLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Tag Links
-----               SCHEMA:      Demo
-----               BASE TABLE:  ContactTagLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwContactTagLinks]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwContactTagLinks];
GO

CREATE VIEW [Demo].[vwContactTagLinks]
AS
SELECT
    c.*,
    ContactTag_ContactTagID.[Name] AS [ContactTag]
FROM
    [Demo].[ContactTagLink] AS c
INNER JOIN
    [Demo].[ContactTag] AS ContactTag_ContactTagID
  ON
    [c].[ContactTagID] = ContactTag_ContactTagID.[ID]
GO
GRANT SELECT ON [Demo].[vwContactTagLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contact Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tag Links
-- Item: Permissions for vwContactTagLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwContactTagLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contact Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tag Links
-- Item: spCreateContactTagLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContactTagLink
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateContactTagLink]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateContactTagLink];
GO

CREATE PROCEDURE [Demo].[spCreateContactTagLink]
    @ID uniqueidentifier = NULL,
    @ContactID uniqueidentifier,
    @ContactTagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[ContactTagLink]
            (
                [ID],
                [ContactID],
                [ContactTagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContactID,
                @ContactTagID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[ContactTagLink]
            (
                [ContactID],
                [ContactTagID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContactID,
                @ContactTagID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwContactTagLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateContactTagLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contact Tag Links */

GRANT EXECUTE ON [Demo].[spCreateContactTagLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contact Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tag Links
-- Item: spUpdateContactTagLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContactTagLink
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateContactTagLink]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateContactTagLink];
GO

CREATE PROCEDURE [Demo].[spUpdateContactTagLink]
    @ID uniqueidentifier,
    @ContactID uniqueidentifier,
    @ContactTagID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ContactTagLink]
    SET
        [ContactID] = @ContactID,
        [ContactTagID] = @ContactTagID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwContactTagLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwContactTagLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateContactTagLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContactTagLink table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateContactTagLink]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateContactTagLink];
GO
CREATE TRIGGER [Demo].trgUpdateContactTagLink
ON [Demo].[ContactTagLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[ContactTagLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[ContactTagLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Contact Tag Links */

GRANT EXECUTE ON [Demo].[spUpdateContactTagLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Contact Tag Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tag Links
-- Item: spDeleteContactTagLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContactTagLink
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteContactTagLink]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteContactTagLink];
GO

CREATE PROCEDURE [Demo].[spDeleteContactTagLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[ContactTagLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteContactTagLink] TO [cdp_Integration]
    

/* spDelete Permissions for Contact Tag Links */

GRANT EXECUTE ON [Demo].[spDeleteContactTagLink] TO [cdp_Integration]



/* Index for Foreign Keys for Contact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Contact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__CRM
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Contact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__Demo
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* SQL text to update entity field related entity name field map for entity field ID C670443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C670443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

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
-----               SCHEMA:      Contacts
-----               BASE TABLE:  Contact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[vwContacts]', 'V') IS NOT NULL
    DROP VIEW [Contacts].[vwContacts];
GO

CREATE VIEW [Contacts].[vwContacts]
AS
SELECT
    c.*
FROM
    [Contacts].[Contact] AS c
GO
GRANT SELECT ON [Contacts].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Permissions for vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Contacts].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

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
IF OBJECT_ID('[Contacts].[spCreateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spCreateContact];
GO

CREATE PROCEDURE [Contacts].[spCreateContact]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(255),
    @Title nvarchar(150),
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Contacts].[Contact]
            (
                [ID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [Title],
                [Status]
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
                @Title,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Contacts].[Contact]
            (
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [Title],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                @Email,
                @Phone,
                @Company,
                @Title,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Contacts].[vwContacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Contacts].[spCreateContact] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contacts */

GRANT EXECUTE ON [Contacts].[spCreateContact] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[Contacts].[spUpdateContact]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spUpdateContact];
GO

CREATE PROCEDURE [Contacts].[spUpdateContact]
    @ID uniqueidentifier,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(255),
    @Title nvarchar(150),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[Contact]
    SET
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Email] = @Email,
        [Phone] = @Phone,
        [Company] = @Company,
        [Title] = @Title,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Contacts].[vwContacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Contacts].[vwContacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Contacts].[spUpdateContact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Contact table
------------------------------------------------------------
IF OBJECT_ID('[Contacts].[trgUpdateContact]', 'TR') IS NOT NULL
    DROP TRIGGER [Contacts].[trgUpdateContact];
GO
CREATE TRIGGER [Contacts].trgUpdateContact
ON [Contacts].[Contact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Contacts].[Contact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Contacts].[Contact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Contacts */

GRANT EXECUTE ON [Contacts].[spUpdateContact] TO [cdp_Developer], [cdp_Integration]



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
IF OBJECT_ID('[Contacts].[spDeleteContact]', 'P') IS NOT NULL
    DROP PROCEDURE [Contacts].[spDeleteContact];
GO

CREATE PROCEDURE [Contacts].[spDeleteContact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Contacts].[Contact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Contacts].[spDeleteContact] TO [cdp_Integration]
    

/* spDelete Permissions for Contacts */

GRANT EXECUTE ON [Contacts].[spDeleteContact] TO [cdp_Integration]



/* Base View SQL for Contacts__CRM */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__CRM
-- Item: vwContacts__CRM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts__CRM
-----               SCHEMA:      CRM
-----               BASE TABLE:  Contact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[CRM].[vwContacts__CRM]', 'V') IS NOT NULL
    DROP VIEW [CRM].[vwContacts__CRM];
GO

CREATE VIEW [CRM].[vwContacts__CRM]
AS
SELECT
    c.*
FROM
    [CRM].[Contact] AS c
GO
GRANT SELECT ON [CRM].[vwContacts__CRM] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contacts__CRM */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__CRM
-- Item: Permissions for vwContacts__CRM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [CRM].[vwContacts__CRM] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contacts__CRM */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__CRM
-- Item: spCreateContact__CRM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spCreateContact__CRM]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spCreateContact__CRM];
GO

CREATE PROCEDURE [CRM].[spCreateContact__CRM]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(255),
    @Title nvarchar(150),
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [CRM].[Contact]
            (
                [ID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [Title],
                [Status]
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
                @Title,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [CRM].[Contact]
            (
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [Title],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                @Email,
                @Phone,
                @Company,
                @Title,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [CRM].[vwContacts__CRM] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [CRM].[spCreateContact__CRM] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contacts__CRM */

GRANT EXECUTE ON [CRM].[spCreateContact__CRM] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contacts__CRM */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__CRM
-- Item: spUpdateContact__CRM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spUpdateContact__CRM]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spUpdateContact__CRM];
GO

CREATE PROCEDURE [CRM].[spUpdateContact__CRM]
    @ID uniqueidentifier,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(255),
    @Title nvarchar(150),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [CRM].[Contact]
    SET
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Email] = @Email,
        [Phone] = @Phone,
        [Company] = @Company,
        [Title] = @Title,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [CRM].[vwContacts__CRM] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [CRM].[vwContacts__CRM]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [CRM].[spUpdateContact__CRM] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Contact table
------------------------------------------------------------
IF OBJECT_ID('[CRM].[trgUpdateContact__CRM]', 'TR') IS NOT NULL
    DROP TRIGGER [CRM].[trgUpdateContact__CRM];
GO
CREATE TRIGGER [CRM].trgUpdateContact__CRM
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
        

/* spUpdate Permissions for Contacts__CRM */

GRANT EXECUTE ON [CRM].[spUpdateContact__CRM] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Contacts__CRM */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__CRM
-- Item: spDeleteContact__CRM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[CRM].[spDeleteContact__CRM]', 'P') IS NOT NULL
    DROP PROCEDURE [CRM].[spDeleteContact__CRM];
GO

CREATE PROCEDURE [CRM].[spDeleteContact__CRM]
    @ID uniqueidentifier
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
GRANT EXECUTE ON [CRM].[spDeleteContact__CRM] TO [cdp_Integration]
    

/* spDelete Permissions for Contacts__CRM */

GRANT EXECUTE ON [CRM].[spDeleteContact__CRM] TO [cdp_Integration]



/* Base View SQL for Contacts__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__Demo
-- Item: vwContacts__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts__Demo
-----               SCHEMA:      Demo
-----               BASE TABLE:  Contact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwContacts__Demo]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwContacts__Demo];
GO

CREATE VIEW [Demo].[vwContacts__Demo]
AS
SELECT
    c.*
FROM
    [Demo].[Contact] AS c
GO
GRANT SELECT ON [Demo].[vwContacts__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Contacts__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__Demo
-- Item: Permissions for vwContacts__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwContacts__Demo] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Contacts__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__Demo
-- Item: spCreateContact__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateContact__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateContact__Demo];
GO

CREATE PROCEDURE [Demo].[spCreateContact__Demo]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(255),
    @Title nvarchar(150),
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[Contact]
            (
                [ID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [Title],
                [Status]
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
                @Title,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[Contact]
            (
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Company],
                [Title],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                @Email,
                @Phone,
                @Company,
                @Title,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwContacts__Demo] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateContact__Demo] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Contacts__Demo */

GRANT EXECUTE ON [Demo].[spCreateContact__Demo] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Contacts__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__Demo
-- Item: spUpdateContact__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateContact__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateContact__Demo];
GO

CREATE PROCEDURE [Demo].[spUpdateContact__Demo]
    @ID uniqueidentifier,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone nvarchar(50),
    @Company nvarchar(255),
    @Title nvarchar(150),
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[Contact]
    SET
        [FirstName] = @FirstName,
        [LastName] = @LastName,
        [Email] = @Email,
        [Phone] = @Phone,
        [Company] = @Company,
        [Title] = @Title,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwContacts__Demo] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwContacts__Demo]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateContact__Demo] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Contact table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateContact__Demo]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateContact__Demo];
GO
CREATE TRIGGER [Demo].trgUpdateContact__Demo
ON [Demo].[Contact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[Contact]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[Contact] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Contacts__Demo */

GRANT EXECUTE ON [Demo].[spUpdateContact__Demo] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Contacts__Demo */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts__Demo
-- Item: spDeleteContact__Demo
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Contact
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteContact__Demo]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteContact__Demo];
GO

CREATE PROCEDURE [Demo].[spDeleteContact__Demo]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[Contact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteContact__Demo] TO [cdp_Integration]
    

/* spDelete Permissions for Contacts__Demo */

GRANT EXECUTE ON [Demo].[spDeleteContact__Demo] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID D870443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D870443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID A270443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A270443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID FD6F443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FD6F443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 2D70443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2D70443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID AB70443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AB70443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID AE70443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AE70443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID B170443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B170443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 1870443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1870443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 6C70443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6C70443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 1B70443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1B70443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 1E70443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1E70443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 4B71443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4B71443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 1571443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1571443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 1D71443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1D71443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 4D71443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4D71443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 1F71443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1F71443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for Topic */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Topics
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentTopicID in table Topic
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Topic_ParentTopicID' 
    AND object_id = OBJECT_ID('[Demo].[Topic]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Topic_ParentTopicID ON [Demo].[Topic] ([ParentTopicID]);

/* Root ID Function SQL for Topics.ParentTopicID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Topics
-- Item: fnTopicParentTopicID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Topic].[ParentTopicID]
------------------------------------------------------------
IF OBJECT_ID('[Demo].[fnTopicParentTopicID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [Demo].[fnTopicParentTopicID_GetRootID];
GO

CREATE FUNCTION [Demo].[fnTopicParentTopicID_GetRootID]
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
            [ParentTopicID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [Demo].[Topic]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentTopicID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentTopicID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [Demo].[Topic] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentTopicID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentTopicID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 5BCC9B9E-2234-42FE-B1CE-BF079EAEC42E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5BCC9B9E-2234-42FE-B1CE-BF079EAEC42E',
         @RelatedEntityNameFieldMap='ParentTopic'

/* Base View SQL for Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Topics
-- Item: vwTopics
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Topics
-----               SCHEMA:      Demo
-----               BASE TABLE:  Topic
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Demo].[vwTopics]', 'V') IS NOT NULL
    DROP VIEW [Demo].[vwTopics];
GO

CREATE VIEW [Demo].[vwTopics]
AS
SELECT
    t.*,
    Topic_ParentTopicID.[Name] AS [ParentTopic],
    root_ParentTopicID.RootID AS [RootParentTopicID]
FROM
    [Demo].[Topic] AS t
LEFT OUTER JOIN
    [Demo].[Topic] AS Topic_ParentTopicID
  ON
    [t].[ParentTopicID] = Topic_ParentTopicID.[ID]
OUTER APPLY
    [Demo].[fnTopicParentTopicID_GetRootID]([t].[ID], [t].[ParentTopicID]) AS root_ParentTopicID
GO
GRANT SELECT ON [Demo].[vwTopics] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Topics
-- Item: Permissions for vwTopics
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Demo].[vwTopics] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Topics
-- Item: spCreateTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Topic
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spCreateTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spCreateTopic];
GO

CREATE PROCEDURE [Demo].[spCreateTopic]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @ParentTopicID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Demo].[Topic]
            (
                [ID],
                [Name],
                [Description],
                [ParentTopicID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ParentTopicID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Demo].[Topic]
            (
                [Name],
                [Description],
                [ParentTopicID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ParentTopicID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Demo].[vwTopics] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Demo].[spCreateTopic] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Topics */

GRANT EXECUTE ON [Demo].[spCreateTopic] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Topics
-- Item: spUpdateTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Topic
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spUpdateTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spUpdateTopic];
GO

CREATE PROCEDURE [Demo].[spUpdateTopic]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @ParentTopicID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[Topic]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ParentTopicID] = @ParentTopicID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Demo].[vwTopics] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Demo].[vwTopics]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Demo].[spUpdateTopic] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Topic table
------------------------------------------------------------
IF OBJECT_ID('[Demo].[trgUpdateTopic]', 'TR') IS NOT NULL
    DROP TRIGGER [Demo].[trgUpdateTopic];
GO
CREATE TRIGGER [Demo].trgUpdateTopic
ON [Demo].[Topic]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Demo].[Topic]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Demo].[Topic] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Topics */

GRANT EXECUTE ON [Demo].[spUpdateTopic] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Topics */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Topics
-- Item: spDeleteTopic
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Topic
------------------------------------------------------------
IF OBJECT_ID('[Demo].[spDeleteTopic]', 'P') IS NOT NULL
    DROP PROCEDURE [Demo].[spDeleteTopic];
GO

CREATE PROCEDURE [Demo].[spDeleteTopic]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Demo].[Topic]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Demo].[spDeleteTopic] TO [cdp_Integration]
    

/* spDelete Permissions for Topics */

GRANT EXECUTE ON [Demo].[spDeleteTopic] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '16a4c6f1-f002-45d6-89d5-b0496b5b59dd'  OR 
               (EntityID = 'C13F60AA-1246-4727-BCCD-43153A005D23' AND Name = 'ContactTag')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '16a4c6f1-f002-45d6-89d5-b0496b5b59dd',
            'C13F60AA-1246-4727-BCCD-43153A005D23', -- Entity: Contact Tag Links
            100011,
            'ContactTag',
            'Contact Tag',
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
         WHERE ID = '24a607e9-9b3a-4c62-b942-1810cc8f179b'  OR 
               (EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834' AND Name = 'Topic')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24a607e9-9b3a-4c62-b942-1810cc8f179b',
            '456FAB05-0967-43D4-973F-7BBF45E2B834', -- Entity: Activity Topics
            100015,
            'Topic',
            'Topic',
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
         WHERE ID = '790c680a-87cf-40c7-a027-f8a046985732'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'ActivityType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '790c680a-87cf-40c7-a027-f8a046985732',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100035,
            'ActivityType',
            'Activity Type',
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
         WHERE ID = '27848231-4c3f-4ec0-b0c3-bb761a55b269'  OR 
               (EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27848231-4c3f-4ec0-b0c3-bb761a55b269',
            'BF78D71E-6B99-4432-A616-89923E929DB6', -- Entity: Activities
            100036,
            'User',
            'User',
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
         WHERE ID = '7b18a382-014f-46be-985c-7f25bb89661c'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'ActivityType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7b18a382-014f-46be-985c-7f25bb89661c',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100035,
            'ActivityType',
            'Activity Type',
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
         WHERE ID = 'b98a35a1-966c-4947-83f7-6a178d7479e1'  OR 
               (EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b98a35a1-966c-4947-83f7-6a178d7479e1',
            '86B64641-1AAE-49AA-8088-9D137854CE2B', -- Entity: Activities__Demo
            100036,
            'User',
            'User',
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
         WHERE ID = '89f50d6c-2cc1-41e6-840d-87b4138f8810'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = 'ParentTopic')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '89f50d6c-2cc1-41e6-840d-87b4138f8810',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
            100013,
            'ParentTopic',
            'Parent Topic',
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
         WHERE ID = '5963519d-0b97-4edb-83ac-f01d70724d85'  OR 
               (EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4' AND Name = 'RootParentTopicID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5963519d-0b97-4edb-83ac-f01d70724d85',
            'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', -- Entity: Topics
            100014,
            'RootParentTopicID',
            'Root Parent Topic ID',
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
         WHERE ID = 'd1e68340-1bb4-4b7d-bcac-19c5208573ff'  OR 
               (EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34' AND Name = 'ActivityTag')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd1e68340-1bb4-4b7d-bcac-19c5208573ff',
            '52D19A73-B000-4718-8A80-EF6477A97B34', -- Entity: Activity Tag Links
            100017,
            'ActivityTag',
            'Activity Tag',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '8DD4D92C-77B6-4AFD-9B14-DA5EDCD6308F'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8DD4D92C-77B6-4AFD-9B14-DA5EDCD6308F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DBD71502-2674-4BC3-A129-0C3A0C9B191B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8DD4D92C-77B6-4AFD-9B14-DA5EDCD6308F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D1E92869-AA3D-4976-9A01-907B1228D8CD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '17CD3462-3431-48FB-BAD0-3214DC8C0DA8'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '17CD3462-3431-48FB-BAD0-3214DC8C0DA8'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '35F4A00A-D77B-4F6C-87F2-1BA1ED0973B4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0E0C0190-D40D-4BD8-B52D-566222F6113B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7B18A382-014F-46BE-985C-7F25BB89661C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B98A35A1-966C-4947-83F7-6A178D7479E1'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '17CD3462-3431-48FB-BAD0-3214DC8C0DA8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0E0C0190-D40D-4BD8-B52D-566222F6113B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7A7D7211-EEFB-4335-B430-AB9CD7E3AF69'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7B18A382-014F-46BE-985C-7F25BB89661C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B98A35A1-966C-4947-83F7-6A178D7479E1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5A6661D4-3276-4172-ACC9-9F23FDC9DA08'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5A6661D4-3276-4172-ACC9-9F23FDC9DA08'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EE0337B7-31FA-46C7-A569-26CFB1C21B06'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8E51E004-B6FC-4758-ADC4-2E2925B8D35D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2325E483-CC4A-4B4A-9B4C-0AA8546EADFB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '790C680A-87CF-40C7-A027-F8A046985732'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '27848231-4C3F-4EC0-B0C3-BB761A55B269'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5A6661D4-3276-4172-ACC9-9F23FDC9DA08'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8E51E004-B6FC-4758-ADC4-2E2925B8D35D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '2325E483-CC4A-4B4A-9B4C-0AA8546EADFB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '790C680A-87CF-40C7-A027-F8A046985732'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '27848231-4C3F-4EC0-B0C3-BB761A55B269'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E5B584F1-4230-4D5D-A9C3-AAA6954594F9'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E4DFA6F4-0FBE-485F-846C-8A10FCF50E48'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CA147855-C3B1-4B25-A3DD-9B8A60739406'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '82C69DA0-B590-4FA2-BE3D-012F12EF74A7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FFE231C1-AC3F-440F-BBBC-3E928092FC67'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E4DFA6F4-0FBE-485F-846C-8A10FCF50E48'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FFE231C1-AC3F-440F-BBBC-3E928092FC67'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'D1E68340-1BB4-4B7D-BCAC-19C5208573FF'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '429DFD10-E4BC-458E-972E-D875A8060AF4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6AEE9837-5BE1-42D5-BD50-038A4959020F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '16B6A442-D495-4E6A-A2AD-DF5D3E86DCBB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D1E68340-1BB4-4B7D-BCAC-19C5208573FF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D1E68340-1BB4-4B7D-BCAC-19C5208573FF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5069EF8F-51D7-4328-80DD-3AB8F3322427'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8DD4D92C-77B6-4AFD-9B14-DA5EDCD6308F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D1E92869-AA3D-4976-9A01-907B1228D8CD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DBD71502-2674-4BC3-A129-0C3A0C9B191B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Generated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '54809F26-D683-436F-9591-873AB1E9566E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2025486-E19B-40E5-8E4D-8FF6B8077594'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '71F6B665-A9D2-42B7-A9C8-68AEDE3F4D6C'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tag */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tag',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('83a1c4d0-34e4-4c12-a955-27fe8f945985', 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', 'FieldCategoryInfo', '{"Tag Definition":{"icon":"fa fa-tag","description":"Core properties of the activity tag, including its name, description, visual color, and auto‑generation flag"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record identifiers and timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5d0de88d-fce5-4782-a262-c43e098bccb1', 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD', 'FieldCategoryIcons', '{"Tag Definition":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'FB5D0245-73F3-4BF7-8F48-7C95937CBFDD'
         

/* Set categories for 19 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '69436774-0E60-4364-AE48-A3B1E1516BC2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants',
       GeneratedFormSection = 'Category',
       DisplayName = 'Contact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7711926-4AA9-4EBA-8417-D6694A640B9F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '942EC48E-A875-4ABF-B274-EEF622A5478E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '27848231-4C3F-4EC0-B0C3-BB761A55B269'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '51ACC736-2977-46D8-BFFC-9CA95B61ACEB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '790C680A-87CF-40C7-A027-F8A046985732'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Subject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A6661D4-3276-4172-ACC9-9F23FDC9DA08'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F372F9AD-8908-48F8-B717-E95D49DA5636'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE0337B7-31FA-46C7-A569-26CFB1C21B06'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (Minutes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D1EBD2AD-524F-4329-8E1B-68B394E4B314'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E51E004-B6FC-4758-ADC4-2E2925B8D35D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requires Follow Up',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F6759AFE-FA4C-4282-9E21-0AF05412E6F3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Follow Up Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A5B9D5B1-89ED-47D4-9666-30B1746D8415'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Insights',
       GeneratedFormSection = 'Category',
       DisplayName = 'Raw Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB0313E6-E58C-481E-8413-1A8BCE356AA9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Insights',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processed By AI',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF90ECF7-CB01-4B08-B972-675F3736D13C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Insights',
       GeneratedFormSection = 'Category',
       DisplayName = 'Urgency Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2325E483-CC4A-4B4A-9B4C-0AA8546EADFB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI Insights',
       GeneratedFormSection = 'Category',
       DisplayName = 'Urgency Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D3CDE7B0-C91D-4DB9-8D68-B68FE2931CE5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6FB89D07-07B1-4F47-8E8D-F3982E0062F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '50644F78-129F-44AC-98BE-5163E82F6433'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-comment */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-comment',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'BF78D71E-6B99-4432-A616-89923E929DB6'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('70e2203d-abd6-48a3-8693-4ce24d833642', 'BF78D71E-6B99-4432-A616-89923E929DB6', 'FieldCategoryInfo', '{"Activity Details":{"icon":"fa fa-clipboard","description":"Core information about the activity such as subject, description, date, duration, status and follow‑up settings"},"Participants":{"icon":"fa fa-users","description":"People involved in the activity – the contact and the user who logged it"},"AI Insights":{"icon":"fa fa-chart-line","description":"AI‑generated data including raw content, urgency assessment and processing flags"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e1c72290-4ebb-4dfe-bde2-a8baeb3787a2', 'BF78D71E-6B99-4432-A616-89923E929DB6', 'FieldCategoryIcons', '{"Activity Details":"fa fa-clipboard","Participants":"fa fa-users","AI Insights":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'BF78D71E-6B99-4432-A616-89923E929DB6'
         

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A4F49698-BF20-4E89-91CB-27E865671112'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5663462B-3EDE-4FB9-BE3E-E7A8957FDC08'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C9A5679F-51DF-4C72-B7B2-1C16E4E4A671'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Analysis Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C0348FD-6CBC-48E3-B089-277C4C40E0B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Analysis Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Analyzed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '82C69DA0-B590-4FA2-BE3D-012F12EF74A7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Analysis Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'AI Model Used',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFE231C1-AC3F-440F-BBBC-3E928092FC67'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sentiment Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Overall Sentiment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '03F7BF32-DA5E-47B5-967C-A4DAC8C3DD30'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sentiment Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sentiment Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E5B584F1-4230-4D5D-A9C3-AAA6954594F9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sentiment Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Emotion Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E4DFA6F4-0FBE-485F-846C-8A10FCF50E48'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Sentiment Results',
       GeneratedFormSection = 'Category',
       DisplayName = 'Confidence Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CA147855-C3B1-4B25-A3DD-9B8A60739406'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-robot */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-robot',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('9f0f5d0d-2050-4d40-99e4-d68505d15156', '6C06E61D-EAD5-47F8-A084-F7F337577E5D', 'FieldCategoryInfo', '{"Analysis Context":{"icon":"fa fa-search","description":"Reference to the analyzed activity, when the analysis ran, and which AI model was used"},"Sentiment Results":{"icon":"fa fa-smile","description":"Core sentiment outputs including overall classification, numeric score, confidence, and detected emotion"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking creation and update timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1c0c95f5-6c64-4d40-8f88-cec8b4ab4677', '6C06E61D-EAD5-47F8-A084-F7F337577E5D', 'FieldCategoryIcons', '{"Analysis Context":"fa fa-search","Sentiment Results":"fa fa-smile","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '6C06E61D-EAD5-47F8-A084-F7F337577E5D'
         

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1570D265-3FC5-4E7D-BBB6-E6C218BAFE22'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE4E6C9A-4010-462D-A791-0EAEDECD9912'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tag',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE946303-D310-45F2-B52A-5A52CA7B1AA8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Confidence Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '429DFD10-E4BC-458E-972E-D875A8060AF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Applied By AI',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6AEE9837-5BE1-42D5-BD50-038A4959020F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Applied At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '16B6A442-D495-4E6A-A2AD-DF5D3E86DCBB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tag Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D1E68340-1BB4-4B7D-BCAC-19C5208573FF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '444E1D41-4B34-4392-AA2F-36BD88C4FD73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E30EEE6B-2151-458B-88F7-14377C4A4BC1'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tag */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tag',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '52D19A73-B000-4718-8A80-EF6477A97B34'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('19113205-1456-4508-9145-dd903abb583a', '52D19A73-B000-4718-8A80-EF6477A97B34', 'FieldCategoryInfo', '{"Tag Assignment":{"icon":"fa fa-tag","description":"Details about the tag applied to an activity, including source, confidence, and timestamp"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('58e67e5a-1f4e-4cc7-aa1c-5bd804c3d749', '52D19A73-B000-4718-8A80-EF6477A97B34', 'FieldCategoryIcons', '{"Tag Assignment":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '52D19A73-B000-4718-8A80-EF6477A97B34'
         

/* Set categories for 19 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Subject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '17CD3462-3431-48FB-BAD0-3214DC8C0DA8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '116D28F9-7894-4822-9640-698295AFCE2F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Raw Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E9D80B3-4B74-46A4-9D61-EDD5A1BD0D46'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '35F4A00A-D77B-4F6C-87F2-1BA1ED0973B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (Minutes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EFC8BA1D-66A2-4EA7-B2D1-6696F48BB067'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E0C0190-D40D-4BD8-B52D-566222F6113B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & Type',
       GeneratedFormSection = 'Category',
       DisplayName = 'Contact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '926072DC-C593-4814-8079-CEDCF3A83A5C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & Type',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1952FB24-247A-4DF2-B7F9-E70143E8D121'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & Type',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B18A382-014F-46BE-985C-7F25BB89661C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & Type',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F31793E0-3AB4-44AB-AFD4-F3C704E50332'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participants & Type',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B98A35A1-966C-4947-83F7-6A178D7479E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Priority',
       GeneratedFormSection = 'Category',
       DisplayName = 'Urgency Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A7D7211-EEFB-4335-B430-AB9CD7E3AF69'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Priority',
       GeneratedFormSection = 'Category',
       DisplayName = 'Urgency Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '40D3AF76-0688-4F54-8F08-71F69E5B42FB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Priority',
       GeneratedFormSection = 'Category',
       DisplayName = 'Processed By AI',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1421B00B-BBB9-48DD-BC1F-6AE4A3CC5270'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Priority',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requires Follow Up',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '17AE987D-B893-4A54-9513-508039D47A82'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'AI & Priority',
       GeneratedFormSection = 'Category',
       DisplayName = 'Follow Up Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0C9B3E0C-4BED-4C95-8453-B0990432D014'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BF8CD1D0-CB91-4991-A5D3-4F156170CAB5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B09DD00B-6ED2-4730-AE7F-0115C8498C2F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '25507147-7F1F-4870-BBE6-7C832CCFC6AF'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-comment */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-comment',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '86B64641-1AAE-49AA-8088-9D137854CE2B'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f7178851-34e3-4db1-92d8-c4b1bf99fb8d', '86B64641-1AAE-49AA-8088-9D137854CE2B', 'FieldCategoryInfo', '{"Activity Information":{"icon":"fa fa-align-left","description":"Core details of the activity such as subject, description, raw content, date, duration, and status"},"Participants & Type":{"icon":"fa fa-users","description":"Links the activity to the related contact, activity type, and user who logged it"},"AI & Priority":{"icon":"fa fa-bolt","description":"AI‑derived urgency, scoring, processing flags and follow‑up settings"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields like identifier and timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('424a0d2e-51b4-409e-87f6-776cf409adee', '86B64641-1AAE-49AA-8088-9D137854CE2B', 'FieldCategoryIcons', '{"Activity Information":"fa fa-align-left","Participants & Type":"fa fa-users","AI & Priority":"fa fa-bolt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '86B64641-1AAE-49AA-8088-9D137854CE2B'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '276CE6B1-9D1B-4CEA-8A98-FC1020AD0F7A'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '276CE6B1-9D1B-4CEA-8A98-FC1020AD0F7A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B465B3CE-6DE7-4B66-B672-2FB12FCE7F71'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '276CE6B1-9D1B-4CEA-8A98-FC1020AD0F7A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3BFF391E-9046-47B4-9673-7A385EB2B839'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3BFF391E-9046-47B4-9673-7A385EB2B839'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6176CC4C-947C-4410-9DEB-D1B0026AEEE8'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3BFF391E-9046-47B4-9673-7A385EB2B839'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'DE31AF53-444A-45AD-8555-EAE2E3D7DBA7'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DE31AF53-444A-45AD-8555-EAE2E3D7DBA7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8AADEE6A-61CC-4506-8C9B-86598DC8D0F1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3CAD9E61-84B0-4FA7-BDFC-1389FADAA277'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DE31AF53-444A-45AD-8555-EAE2E3D7DBA7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1257DBB8-4C3B-4512-85DA-0C9A19060797'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '24A607E9-9B3A-4C62-B942-1810CC8F179B'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '94711F08-E13C-47F1-851A-659C1C33CAC5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '661336F6-B57C-4D9D-962B-D96FE2D0C830'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '24A607E9-9B3A-4C62-B942-1810CC8F179B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '24A607E9-9B3A-4C62-B942-1810CC8F179B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'D5E64D28-19D4-49F4-919A-78F5708E4CA4'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D5E64D28-19D4-49F4-919A-78F5708E4CA4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '47A2EB37-5C82-4495-BEEA-A11E91E5BCC6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9EFAA960-524A-417F-8487-6AC6163B6D6B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5BE65152-B90F-41F4-B732-DCD7AC1C248F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '13E62363-6FED-41B3-912C-5EC6BDA25756'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '88FC60B5-3ED9-4D77-AF9A-C9FD959E425B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '47A2EB37-5C82-4495-BEEA-A11E91E5BCC6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1D178FBE-7E74-4F75-AAFD-EA7504C0189B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5BE65152-B90F-41F4-B732-DCD7AC1C248F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A33C74C-29C6-46C4-BCE6-51947109EC9C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3345A21C-2AFA-48EC-9E1B-6A9803EDAF5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44F50D4-6693-4883-A13E-20E189CD1289'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3BFF391E-9046-47B4-9673-7A385EB2B839'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1E05050F-CAC6-4B2D-8960-D76B1C16677D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6176CC4C-947C-4410-9DEB-D1B0026AEEE8'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tasks */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tasks',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('70b38591-6f54-4eb8-9f3b-f821978f0cfc', '3D943481-3C29-4C1B-AACC-7C4D1200A94D', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier"},"Activity Type Details":{"icon":"fa fa-info-circle","description":"Descriptive fields for each activity type, including name, description, and visual icon"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4cc0e3ec-7828-4478-8e3f-97e077ab970b', '3D943481-3C29-4C1B-AACC-7C4D1200A94D', 'FieldCategoryIcons', '{"System Metadata":"fa fa-cog","Activity Type Details":"fa fa-info-circle"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '3D943481-3C29-4C1B-AACC-7C4D1200A94D'
         

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8A3F2F8E-E1EF-43F0-AE9B-43035C7FAB70'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '276CE6B1-9D1B-4CEA-8A98-FC1020AD0F7A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '06E0589B-6158-40AD-8F23-05A6B08DF99A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Activity Type Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B465B3CE-6DE7-4B66-B672-2FB12FCE7F71'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7DAF5E17-EAC3-4AD7-958C-A006EFF2EECF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '161F9B68-558E-49C2-9F47-2ACB94FA2644'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-calendar */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-calendar',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '2557D870-EF0E-42AE-89CB-142959F0B221'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('aa82e687-fdac-4f27-84d9-891b50b13fc4', '2557D870-EF0E-42AE-89CB-142959F0B221', 'FieldCategoryInfo', '{"Activity Type Details":{"icon":"fa fa-info-circle","description":"Core information defining each activity type, including name, description, and UI icon"},"System Metadata":{"icon":"fa fa-cog","description":"Audit and technical fields managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4fd8105c-b2dc-4583-ae3f-331ada1f4bcf', '2557D870-EF0E-42AE-89CB-142959F0B221', 'FieldCategoryIcons', '{"Activity Type Details":"fa fa-info-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '2557D870-EF0E-42AE-89CB-142959F0B221'
         

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identifiers & Audit',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '413E42B3-D8A4-40D9-92B0-01078610333B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E33C8114-20DB-437F-B9A9-70EAA5EFB9FF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '713D1680-9AAB-4156-82E6-051021D64B1F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Activity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '981550C2-26C0-4FCB-8E82-D865130D6D10'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Topic',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '196BD48B-0553-495F-8450-77DBD3E1DFCC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Topic',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24A607E9-9B3A-4C62-B942-1810CC8F179B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scoring & Ranking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Confidence Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '94711F08-E13C-47F1-851A-659C1C33CAC5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scoring & Ranking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Relevance Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '661336F6-B57C-4D9D-962B-D96FE2D0C830'
   AND AutoUpdateCategory = 1

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '45D095EB-02EE-42B8-9C1B-A205795AE2ED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tag Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DE31AF53-444A-45AD-8555-EAE2E3D7DBA7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1257DBB8-4C3B-4512-85DA-0C9A19060797'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8AADEE6A-61CC-4506-8C9B-86598DC8D0F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Generated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3CAD9E61-84B0-4FA7-BDFC-1389FADAA277'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '373874D7-16E7-4720-A973-66AA0601E24F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4878926B-2F17-4478-92CB-E6950F9AEF68'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-link */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-link',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '456FAB05-0967-43D4-973F-7BBF45E2B834'
               

/* Set entity icon to fa fa-tag */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tag',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b9dcf6dd-9f1a-4037-81ff-2fc3e64197e3', '456FAB05-0967-43D4-973F-7BBF45E2B834', 'FieldCategoryInfo', '{"Identifiers & Audit":{"icon":"fa fa-cog","description":"Primary key and audit timestamps for record tracking"},"Topic Mapping":{"icon":"fa fa-link","description":"Links an activity to its detected topic and stores the topic name"},"Scoring & Ranking":{"icon":"fa fa-chart-line","description":"AI confidence score and relevance ranking for the topic detection"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c082e641-6073-472c-bdf7-149b0c1bda43', '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', 'FieldCategoryInfo', '{"Tag Details":{"icon":"fa fa-tag","description":"Core information describing each activity tag, including name, description, visual color, and generation source"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record identifiers and timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4636bf6d-1279-4dc9-aeb2-baab62896d21', '456FAB05-0967-43D4-973F-7BBF45E2B834', 'FieldCategoryIcons', '{"Identifiers & Audit":"fa fa-cog","Topic Mapping":"fa fa-link","Scoring & Ranking":"fa fa-chart-line"}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('04ab7216-1923-45df-a926-1275fd7ae20d', '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E', 'FieldCategoryIcons', '{"Tag Details":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '456FAB05-0967-43D4-973F-7BBF45E2B834'
         

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '3B1D517D-88F9-4AE0-B9B6-D28B70598E2E'
         

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C7479F68-B801-43A5-89CF-7F7604DF42AC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Contact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5E64D28-19D4-49F4-919A-78F5708E4CA4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Record Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Analyzed At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '88FC60B5-3ED9-4D77-AF9A-C9FD959E425B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Insight Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Overall Sentiment Trend',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '47A2EB37-5C82-4495-BEEA-A11E91E5BCC6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Insight Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Average Sentiment Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9EFAA960-524A-417F-8487-6AC6163B6D6B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Insight Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Top Topics',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1D178FBE-7E74-4F75-AAFD-EA7504C0189B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Insight Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Engagement Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BE65152-B90F-41F4-B732-DCD7AC1C248F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Insight Metrics',
       GeneratedFormSection = 'Category',
       DisplayName = 'Churn Risk Score',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13E62363-6FED-41B3-912C-5EC6BDA25756'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '472C0E01-2A81-4EA0-85C8-6E015E69F7E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA6B79B4-C70F-4325-B029-552AA8F329DB'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-lightbulb */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-lightbulb',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f07f65dd-88af-413b-bd60-2c854673f96e', '073D5A17-D62C-4C1D-92F7-3148D5856DFB', 'FieldCategoryInfo', '{"Record Details":{"icon":"fa fa-info-circle","description":"Core identification fields linking the insight to a contact and indicating the latest analysis time"},"Insight Metrics":{"icon":"fa fa-chart-line","description":"AI‑generated analytical metrics such as sentiment, topics, engagement and churn risk"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit timestamps for creation and last update"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b8bc8f3e-4b2a-407d-b072-d89bcb6e862a', '073D5A17-D62C-4C1D-92F7-3148D5856DFB', 'FieldCategoryIcons', '{"Record Details":"fa fa-info-circle","Insight Metrics":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '073D5A17-D62C-4C1D-92F7-3148D5856DFB'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '16A4C6F1-F002-45D6-89D5-B0496B5B59DD'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '16A4C6F1-F002-45D6-89D5-B0496B5B59DD'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '16A4C6F1-F002-45D6-89D5-B0496B5B59DD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4DBFA56C-B037-4E92-91F7-65801BFF4118'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5FFEC555-2121-4F3F-A764-F7B4997046B4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4DBFA56C-B037-4E92-91F7-65801BFF4118'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '082D4FCA-D27E-4185-A2B4-21EFFD31EA4D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '27F819E4-9F5E-4C82-B607-45361C5481A3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '14345089-98E1-4FDD-A419-4653EEE911E2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D502198F-94A7-4ADB-8F8D-51A980429317'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7501DC5D-30F7-4C3C-8256-914528C48853'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5FFEC555-2121-4F3F-A764-F7B4997046B4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4DBFA56C-B037-4E92-91F7-65801BFF4118'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '082D4FCA-D27E-4185-A2B4-21EFFD31EA4D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '27F819E4-9F5E-4C82-B607-45361C5481A3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '14345089-98E1-4FDD-A419-4653EEE911E2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D502198F-94A7-4ADB-8F8D-51A980429317'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4D13BDC3-3CD3-4B6A-915C-DEC5BFB2E0F5'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4D13BDC3-3CD3-4B6A-915C-DEC5BFB2E0F5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BE6A7FBC-9E88-446D-9701-309BC4B34E81'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6E0A3D41-CD4F-408C-B551-74ED7EBF15B5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64919364-A77A-4443-AE97-D886ED3005C1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '29C1BD23-4A0E-4C80-A9C8-56CFB0D0F3E7'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7F003668-A36B-432B-B2F8-942EA46A7F1D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A1BE917F-EC28-49C0-A4BC-730830B095E5'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4D13BDC3-3CD3-4B6A-915C-DEC5BFB2E0F5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BE6A7FBC-9E88-446D-9701-309BC4B34E81'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6E0A3D41-CD4F-408C-B551-74ED7EBF15B5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '64919364-A77A-4443-AE97-D886ED3005C1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '29C1BD23-4A0E-4C80-A9C8-56CFB0D0F3E7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7F003668-A36B-432B-B2F8-942EA46A7F1D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A1BE917F-EC28-49C0-A4BC-730830B095E5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '6115021D-1FFC-46B4-920E-2D908DE39BC1'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '05145531-6804-4DE7-8543-727DC7E3AC98'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6115021D-1FFC-46B4-920E-2D908DE39BC1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BC215FC2-D10F-4F64-ADF6-21ED9A34EEB4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8563328E-C399-468E-8BC1-3365D2485762'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E98332F6-B039-4515-B32D-B4C81BD364ED'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '00AAE541-BFC3-48B2-8A45-D87F1FB9B9D5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C795CE0E-3038-49D0-A8CC-E4F200515400'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '05145531-6804-4DE7-8543-727DC7E3AC98'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6115021D-1FFC-46B4-920E-2D908DE39BC1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BC215FC2-D10F-4F64-ADF6-21ED9A34EEB4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8563328E-C399-468E-8BC1-3365D2485762'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E98332F6-B039-4515-B32D-B4C81BD364ED'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '00AAE541-BFC3-48B2-8A45-D87F1FB9B9D5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C795CE0E-3038-49D0-A8CC-E4F200515400'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AB85C3C3-E753-4B01-8E50-C80C11090A0F'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AB85C3C3-E753-4B01-8E50-C80C11090A0F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B70D2897-6BDD-433D-B851-1F86DC461BEF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AB85C3C3-E753-4B01-8E50-C80C11090A0F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B70D2897-6BDD-433D-B851-1F86DC461BEF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '59E1BD11-1E9A-450F-B9E2-511C0AB7A66B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Contact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F419CB7-D4F3-462C-A942-7B69F277931B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tag',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4EE5F22E-AE08-453D-BC59-F5C5D54B8B34'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '56BA8AAC-CE9B-46C5-8FDD-CC8952E9D47C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F928A325-393F-4904-8D5B-41DEB9826A26'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Assignment',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tag',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '16A4C6F1-F002-45D6-89D5-B0496B5B59DD'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tags */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tags',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'C13F60AA-1246-4727-BCCD-43153A005D23'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8d08f51f-9019-4b00-ae1e-1873d6da8b60', 'C13F60AA-1246-4727-BCCD-43153A005D23', 'FieldCategoryInfo', '{"Tag Assignment":{"icon":"fa fa-tag","description":"Fields that define which tag is applied to a contact"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed identifiers and audit timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a4bb8b0e-1458-4a52-95ac-e4fd5380b8e0', 'C13F60AA-1246-4727-BCCD-43153A005D23', 'FieldCategoryIcons', '{"Tag Assignment":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: junction, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'C13F60AA-1246-4727-BCCD-43153A005D23'
         

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A03060A1-784D-4EC7-84E3-B917DDD426CE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5FFEC555-2121-4F3F-A764-F7B4997046B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4DBFA56C-B037-4E92-91F7-65801BFF4118'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '082D4FCA-D27E-4185-A2B4-21EFFD31EA4D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Phone',
       ExtendedType = 'Tel',
       CodeType = NULL
   WHERE ID = '27F819E4-9F5E-4C82-B607-45361C5481A3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Professional Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '14345089-98E1-4FDD-A419-4653EEE911E2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Professional Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D502198F-94A7-4ADB-8F8D-51A980429317'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Professional Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7501DC5D-30F7-4C3C-8256-914528C48853'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '60B5847D-2D18-4BED-BB76-812D09588B71'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0A3E12E-47CC-40D7-A887-9E68F3210FC9'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-user */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-user',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '106701FA-CB3E-4488-8849-66DFF03E48BF'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e0d3c2b8-94e8-45a1-82c2-74ac2645c0b4', '106701FA-CB3E-4488-8849-66DFF03E48BF', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-address-card","description":"Basic personal details and primary contact channels for the individual."},"Professional Information":{"icon":"fa fa-briefcase","description":"Employment related data including organization, role, and current status."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields tracking creation and modification timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('27faeded-ce9f-4548-b06a-c005c4d8e0a5', '106701FA-CB3E-4488-8849-66DFF03E48BF', 'FieldCategoryIcons', '{"Personal Information":"fa fa-address-card","Professional Information":"fa fa-briefcase","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '106701FA-CB3E-4488-8849-66DFF03E48BF'
         

/* Set categories for 5 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BFCA4158-9C91-46BF-A6C6-85AA5412B723'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AB85C3C3-E753-4B01-8E50-C80C11090A0F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B70D2897-6BDD-433D-B851-1F86DC461BEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3079B195-0F01-4349-A617-713FD3D45E6F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '02AB68C5-8004-4F8E-BA9F-AB9D3EF01B5B'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tag */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tag',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '4E873A06-046C-43FF-9A59-D50EFBC7F148'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('37c5a14f-0b20-49fc-9569-78c800261069', '4E873A06-046C-43FF-9A59-D50EFBC7F148', 'FieldCategoryInfo', '{"Tag Details":{"icon":"fa fa-tag","description":"Core information describing the tag, including its name and visual color"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8f86992a-3cf6-4b2d-8b2a-936875cf6b1b', '4E873A06-046C-43FF-9A59-D50EFBC7F148', 'FieldCategoryIcons', '{"Tag Details":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '4E873A06-046C-43FF-9A59-D50EFBC7F148'
         

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A378D297-F55D-42F2-9009-532ECEE7297A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D13BDC3-3CD3-4B6A-915C-DEC5BFB2E0F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BE6A7FBC-9E88-446D-9701-309BC4B34E81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = '6E0A3D41-CD4F-408C-B551-74ED7EBF15B5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Phone',
       ExtendedType = 'Tel',
       CodeType = NULL
   WHERE ID = '64919364-A77A-4443-AE97-D886ED3005C1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '29C1BD23-4A0E-4C80-A9C8-56CFB0D0F3E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F003668-A36B-432B-B2F8-942EA46A7F1D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contact Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A1BE917F-EC28-49C0-A4BC-730830B095E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F72A27BF-FA71-4C6F-9492-226F0CE0764D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '891AAA84-FEBE-4BE9-8489-AB5CDAD3B2F6'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-address-book */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-address-book',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8a0b1f03-7255-42f0-9848-04f178375d45', 'B87610F9-EEBA-40DF-A840-B13757F18FFD', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-user","description":"Core identity fields such as name and job title"},"Contact Details":{"icon":"fa fa-address-card","description":"Communication channels and organizational affiliation for the contact"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8469b08d-cf85-45e0-bb0b-a9e2fae3a000', 'B87610F9-EEBA-40DF-A840-B13757F18FFD', 'FieldCategoryIcons', '{"Personal Information":"fa fa-user","Contact Details":"fa fa-address-card","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'B87610F9-EEBA-40DF-A840-B13757F18FFD'
         

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9EA754BB-D907-4909-A1C2-B45BD152B32B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9CC605AA-5C1D-466C-AC47-D3F0C0311A4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9134FA91-9CB4-4A7E-8D24-20B8744B6370'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'First Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '05145531-6804-4DE7-8543-727DC7E3AC98'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6115021D-1FFC-46B4-920E-2D908DE39BC1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '00AAE541-BFC3-48B2-8A45-D87F1FB9B9D5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Personal Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Company',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E98332F6-B039-4515-B32D-B4C81BD364ED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Communication',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'BC215FC2-D10F-4F64-ADF6-21ED9A34EEB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Communication',
       GeneratedFormSection = 'Category',
       DisplayName = 'Phone',
       ExtendedType = 'Tel',
       CodeType = NULL
   WHERE ID = '8563328E-C399-468E-8BC1-3365D2485762'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Communication',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C795CE0E-3038-49D0-A8CC-E4F200515400'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-address-card */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-address-card',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '01BD0852-F84E-48A1-9947-6F8898404BDC'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('48bcfa08-10b1-49ba-b489-5d1ee2af5ab1', '01BD0852-F84E-48A1-9947-6F8898404BDC', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-user","description":"Core personal and employment details of the contact"},"Communication":{"icon":"fa fa-envelope","description":"Ways to reach the contact and their current status"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields for record tracking"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ff4032f4-5155-499d-ae13-cf5c1cff3ba1', '01BD0852-F84E-48A1-9947-6F8898404BDC', 'FieldCategoryIcons', '{"Personal Information":"fa fa-user","Communication":"fa fa-envelope","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '01BD0852-F84E-48A1-9947-6F8898404BDC'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '974CD8AE-237D-4F7A-9928-0CC2DB54D604'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '974CD8AE-237D-4F7A-9928-0CC2DB54D604'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '89F50D6C-2CC1-41E6-840D-87B4138F8810'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '974CD8AE-237D-4F7A-9928-0CC2DB54D604'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D47A74B0-7575-4F73-BED5-51D26D71F420'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '89F50D6C-2CC1-41E6-840D-87B4138F8810'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FECEA813-0BBD-4A03-BB64-EBFA122714B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '974CD8AE-237D-4F7A-9928-0CC2DB54D604'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D47A74B0-7575-4F73-BED5-51D26D71F420'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Topic',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BCC9B9E-2234-42FE-B1CE-BF079EAEC42E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Topic Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '89F50D6C-2CC1-41E6-840D-87B4138F8810'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Topic Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent Topic',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5963519D-0B97-4EDB-83AC-F01D70724D85'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E5C3385C-6FC0-48D7-AA5D-8C82EED52CA2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '381BEA7B-300F-4DC7-9B94-5ED2996A0099'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tags */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tags',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a6023ab3-a0b3-492f-8498-02ed43c4cf23', 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', 'FieldCategoryInfo', '{"Topic Details":{"icon":"fa fa-info-circle","description":"Core information about the topic, including its identifier, name, and description."},"Topic Hierarchy":{"icon":"fa fa-sitemap","description":"Parent and root relationships that define the topic’s position within the hierarchy."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and modification timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('83ec5945-3ce2-4ace-9b7b-a1637a0a9685', 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4', 'FieldCategoryIcons', '{"Topic Details":"fa fa-info-circle","Topic Hierarchy":"fa fa-sitemap","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'AF2ECA3A-6861-401D-920B-ABB487CFA2E4'
         

