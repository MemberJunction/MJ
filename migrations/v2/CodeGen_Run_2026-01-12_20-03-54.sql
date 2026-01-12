/* SQL generated to create new entity Members__Foodie */

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
         'e6676cb1-55ae-4597-ba15-da4a3ddf8849',
         'Members__Foodie',
         NULL,
         NULL,
         '__Foodie',
         'Member',
         'vwMembers__Foodie',
         'Foodie',
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
   

/* SQL generated to add new entity Members__Foodie to application ID: '48ea4407-579f-4f12-9211-a0825faffab9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48ea4407-579f-4f12-9211-a0825faffab9', 'e6676cb1-55ae-4597-ba15-da4a3ddf8849', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48ea4407-579f-4f12-9211-a0825faffab9'))

/* SQL generated to add new permission for entity Members__Foodie for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e6676cb1-55ae-4597-ba15-da4a3ddf8849', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Members__Foodie for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e6676cb1-55ae-4597-ba15-da4a3ddf8849', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Members__Foodie for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e6676cb1-55ae-4597-ba15-da4a3ddf8849', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Restaurant Visits */

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
         '9a80839c-de94-4f55-ac0e-2cfd9265984b',
         'Restaurant Visits',
         NULL,
         NULL,
         NULL,
         'RestaurantVisit',
         'vwRestaurantVisits',
         'Foodie',
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
   

/* SQL generated to add new entity Restaurant Visits to application ID: '48EA4407-579F-4F12-9211-A0825FAFFAB9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48EA4407-579F-4F12-9211-A0825FAFFAB9', '9a80839c-de94-4f55-ac0e-2cfd9265984b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48EA4407-579F-4F12-9211-A0825FAFFAB9'))

/* SQL generated to add new permission for entity Restaurant Visits for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9a80839c-de94-4f55-ac0e-2cfd9265984b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Restaurant Visits for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9a80839c-de94-4f55-ac0e-2cfd9265984b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Restaurant Visits for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9a80839c-de94-4f55-ac0e-2cfd9265984b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Restaurant Tags */

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
         '58eefdb7-dedf-4641-b050-5ff356abe791',
         'Restaurant Tags',
         NULL,
         NULL,
         NULL,
         'RestaurantTag',
         'vwRestaurantTags',
         'Foodie',
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
   

/* SQL generated to add new entity Restaurant Tags to application ID: '48EA4407-579F-4F12-9211-A0825FAFFAB9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48EA4407-579F-4F12-9211-A0825FAFFAB9', '58eefdb7-dedf-4641-b050-5ff356abe791', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48EA4407-579F-4F12-9211-A0825FAFFAB9'))

/* SQL generated to add new permission for entity Restaurant Tags for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('58eefdb7-dedf-4641-b050-5ff356abe791', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Restaurant Tags for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('58eefdb7-dedf-4641-b050-5ff356abe791', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Restaurant Tags for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('58eefdb7-dedf-4641-b050-5ff356abe791', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Wish Lists */

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
         '9bde7a5f-4e97-4d6a-a936-921915e58d0a',
         'Wish Lists',
         NULL,
         NULL,
         NULL,
         'WishList',
         'vwWishLists',
         'Foodie',
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
   

/* SQL generated to add new entity Wish Lists to application ID: '48EA4407-579F-4F12-9211-A0825FAFFAB9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48EA4407-579F-4F12-9211-A0825FAFFAB9', '9bde7a5f-4e97-4d6a-a936-921915e58d0a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48EA4407-579F-4F12-9211-A0825FAFFAB9'))

/* SQL generated to add new permission for entity Wish Lists for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9bde7a5f-4e97-4d6a-a936-921915e58d0a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Wish Lists for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9bde7a5f-4e97-4d6a-a936-921915e58d0a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Wish Lists for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('9bde7a5f-4e97-4d6a-a936-921915e58d0a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Group Visits */

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
         'e4ce0c4b-fe98-4e6e-b4c9-c423c53a9a89',
         'Group Visits',
         NULL,
         NULL,
         NULL,
         'GroupVisit',
         'vwGroupVisits',
         'Foodie',
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
   

/* SQL generated to add new entity Group Visits to application ID: '48EA4407-579F-4F12-9211-A0825FAFFAB9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48EA4407-579F-4F12-9211-A0825FAFFAB9', 'e4ce0c4b-fe98-4e6e-b4c9-c423c53a9a89', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48EA4407-579F-4F12-9211-A0825FAFFAB9'))

/* SQL generated to add new permission for entity Group Visits for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e4ce0c4b-fe98-4e6e-b4c9-c423c53a9a89', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Group Visits for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e4ce0c4b-fe98-4e6e-b4c9-c423c53a9a89', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Group Visits for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e4ce0c4b-fe98-4e6e-b4c9-c423c53a9a89', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Group Visit Members */

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
         '45c7a728-8ff5-428d-a514-268c9b94c9e9',
         'Group Visit Members',
         NULL,
         NULL,
         NULL,
         'GroupVisitMember',
         'vwGroupVisitMembers',
         'Foodie',
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
   

/* SQL generated to add new entity Group Visit Members to application ID: '48EA4407-579F-4F12-9211-A0825FAFFAB9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48EA4407-579F-4F12-9211-A0825FAFFAB9', '45c7a728-8ff5-428d-a514-268c9b94c9e9', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48EA4407-579F-4F12-9211-A0825FAFFAB9'))

/* SQL generated to add new permission for entity Group Visit Members for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('45c7a728-8ff5-428d-a514-268c9b94c9e9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Group Visit Members for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('45c7a728-8ff5-428d-a514-268c9b94c9e9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Group Visit Members for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('45c7a728-8ff5-428d-a514-268c9b94c9e9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Cuisine Types */

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
         '585dee13-35bc-42c3-b63c-0744dcfb323b',
         'Cuisine Types',
         NULL,
         NULL,
         NULL,
         'CuisineType',
         'vwCuisineTypes',
         'Foodie',
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
   

/* SQL generated to add new entity Cuisine Types to application ID: '48EA4407-579F-4F12-9211-A0825FAFFAB9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48EA4407-579F-4F12-9211-A0825FAFFAB9', '585dee13-35bc-42c3-b63c-0744dcfb323b', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48EA4407-579F-4F12-9211-A0825FAFFAB9'))

/* SQL generated to add new permission for entity Cuisine Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('585dee13-35bc-42c3-b63c-0744dcfb323b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Cuisine Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('585dee13-35bc-42c3-b63c-0744dcfb323b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Cuisine Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('585dee13-35bc-42c3-b63c-0744dcfb323b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Restaurants */

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
         '18899cf5-2b81-4a29-aabf-614e5270dc09',
         'Restaurants',
         NULL,
         NULL,
         NULL,
         'Restaurant',
         'vwRestaurants',
         'Foodie',
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
   

/* SQL generated to add new entity Restaurants to application ID: '48EA4407-579F-4F12-9211-A0825FAFFAB9' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('48EA4407-579F-4F12-9211-A0825FAFFAB9', '18899cf5-2b81-4a29-aabf-614e5270dc09', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '48EA4407-579F-4F12-9211-A0825FAFFAB9'))

/* SQL generated to add new permission for entity Restaurants for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('18899cf5-2b81-4a29-aabf-614e5270dc09', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Restaurants for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('18899cf5-2b81-4a29-aabf-614e5270dc09', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Restaurants for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('18899cf5-2b81-4a29-aabf-614e5270dc09', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.CuisineType */
ALTER TABLE [Foodie].[CuisineType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.CuisineType */
ALTER TABLE [Foodie].[CuisineType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.GroupVisitMember */
ALTER TABLE [Foodie].[GroupVisitMember] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.GroupVisitMember */
ALTER TABLE [Foodie].[GroupVisitMember] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.RestaurantVisit */
ALTER TABLE [Foodie].[RestaurantVisit] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.RestaurantVisit */
ALTER TABLE [Foodie].[RestaurantVisit] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.RestaurantTag */
ALTER TABLE [Foodie].[RestaurantTag] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.RestaurantTag */
ALTER TABLE [Foodie].[RestaurantTag] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.Restaurant */
ALTER TABLE [Foodie].[Restaurant] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.Restaurant */
ALTER TABLE [Foodie].[Restaurant] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.WishList */
ALTER TABLE [Foodie].[WishList] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.WishList */
ALTER TABLE [Foodie].[WishList] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.GroupVisit */
ALTER TABLE [Foodie].[GroupVisit] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.GroupVisit */
ALTER TABLE [Foodie].[GroupVisit] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Foodie.Member */
ALTER TABLE [Foodie].[Member] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Foodie.Member */
ALTER TABLE [Foodie].[Member] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7e296c3a-1a5b-4b24-bae0-f538135adf86'  OR 
               (EntityID = '585DEE13-35BC-42C3-B63C-0744DCFB323B' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7e296c3a-1a5b-4b24-bae0-f538135adf86',
            '585DEE13-35BC-42C3-B63C-0744DCFB323B', -- Entity: Cuisine Types
            100001,
            'ID',
            'ID',
            'Unique identifier for the cuisine type',
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
         WHERE ID = 'e4829f78-49cd-4909-814f-00436ea7559f'  OR 
               (EntityID = '585DEE13-35BC-42C3-B63C-0744DCFB323B' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4829f78-49cd-4909-814f-00436ea7559f',
            '585DEE13-35BC-42C3-B63C-0744DCFB323B', -- Entity: Cuisine Types
            100002,
            'Name',
            'Name',
            'Name of the cuisine type',
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
         WHERE ID = '3ecf4d5e-1960-4e2d-b7dc-e4b94479c11f'  OR 
               (EntityID = '585DEE13-35BC-42C3-B63C-0744DCFB323B' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3ecf4d5e-1960-4e2d-b7dc-e4b94479c11f',
            '585DEE13-35BC-42C3-B63C-0744DCFB323B', -- Entity: Cuisine Types
            100003,
            'Description',
            'Description',
            'Description of the cuisine type',
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
         WHERE ID = 'c078f569-f20c-4c21-ba35-ca483f804e79'  OR 
               (EntityID = '585DEE13-35BC-42C3-B63C-0744DCFB323B' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c078f569-f20c-4c21-ba35-ca483f804e79',
            '585DEE13-35BC-42C3-B63C-0744DCFB323B', -- Entity: Cuisine Types
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
         WHERE ID = 'cf76b23b-f369-479a-88bb-552fdea808e6'  OR 
               (EntityID = '585DEE13-35BC-42C3-B63C-0744DCFB323B' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cf76b23b-f369-479a-88bb-552fdea808e6',
            '585DEE13-35BC-42C3-B63C-0744DCFB323B', -- Entity: Cuisine Types
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
         WHERE ID = '472b3de6-7180-48cb-8c29-d5bee0ecf800'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '472b3de6-7180-48cb-8c29-d5bee0ecf800',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
            100001,
            'ID',
            'ID',
            'Unique identifier for the group visit member record',
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
         WHERE ID = '8bf4f8d0-136b-48c7-bb1d-e82f37974b28'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = 'GroupVisitID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8bf4f8d0-136b-48c7-bb1d-e82f37974b28',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
            100002,
            'GroupVisitID',
            'Group Visit ID',
            'Foreign key to the GroupVisit table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89',
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
         WHERE ID = 'e8925f78-c633-4d9f-880b-d1687f78248a'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = 'MemberID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e8925f78-c633-4d9f-880b-d1687f78248a',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
            100003,
            'MemberID',
            'Member ID',
            'Foreign key to the Member table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849',
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
         WHERE ID = 'ffc438fb-af3d-4ff5-bc4c-8822e4b1c807'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = 'AmountPaid')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ffc438fb-af3d-4ff5-bc4c-8822e4b1c807',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
            100004,
            'AmountPaid',
            'Amount Paid',
            'Amount paid by this member for the group visit',
            'decimal',
            9,
            10,
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
         WHERE ID = 'd2d16a71-23ee-435d-8291-c671e7bc1af8'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd2d16a71-23ee-435d-8291-c671e7bc1af8',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
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
         WHERE ID = '0b529181-7f46-4e65-ba59-033bcbe589a8'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0b529181-7f46-4e65-ba59-033bcbe589a8',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
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
         WHERE ID = '13e4eb4e-1ccb-411d-aee2-fe207fe45056'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '13e4eb4e-1ccb-411d-aee2-fe207fe45056',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100001,
            'ID',
            'ID',
            'Unique identifier for the visit record',
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
         WHERE ID = 'fc6233f9-bba1-42c3-8df9-2431aed45d26'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'RestaurantID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fc6233f9-bba1-42c3-8df9-2431aed45d26',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100002,
            'RestaurantID',
            'Restaurant ID',
            'Foreign key to the Restaurant table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '18899CF5-2B81-4A29-AABF-614E5270DC09',
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
         WHERE ID = '0d276da7-17de-431b-95f1-e1d14ea5d4e0'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'MemberID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d276da7-17de-431b-95f1-e1d14ea5d4e0',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100003,
            'MemberID',
            'Member ID',
            'Foreign key to the Member table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849',
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
         WHERE ID = '7c34054e-025f-4028-ac07-ee5f7b20549a'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'VisitDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c34054e-025f-4028-ac07-ee5f7b20549a',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100004,
            'VisitDate',
            'Visit Date',
            'Date and time of the restaurant visit',
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
         WHERE ID = '64138797-83cf-4deb-a276-ceca02e57680'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'Rating')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64138797-83cf-4deb-a276-ceca02e57680',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100005,
            'Rating',
            'Rating',
            'Rating from 1 to 5 stars',
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
         WHERE ID = '7198e474-253a-4809-a991-e9a2172cdd66'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'Comments')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7198e474-253a-4809-a991-e9a2172cdd66',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100006,
            'Comments',
            'Comments',
            'Member comments and review of the visit',
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
         WHERE ID = '41a26f0a-4f16-4d6c-bac3-03dd4797750b'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'DishesOrdered')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '41a26f0a-4f16-4d6c-bac3-03dd4797750b',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100007,
            'DishesOrdered',
            'Dishes Ordered',
            'Description of dishes ordered during the visit',
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
         WHERE ID = '557e97bd-f360-4d1c-822f-5141d2424201'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'WouldReturn')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '557e97bd-f360-4d1c-822f-5141d2424201',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100008,
            'WouldReturn',
            'Would Return',
            'Indicates whether the member would return to this restaurant',
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
         WHERE ID = 'a190779e-4a96-4405-b7f4-78450ecd4e41'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'PhotoURLs')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a190779e-4a96-4405-b7f4-78450ecd4e41',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100009,
            'PhotoURLs',
            'Photo UR Ls',
            'Comma-separated URLs to photos from the visit',
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
         WHERE ID = 'cfa712cd-14b1-481d-a8ef-1df64733445a'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cfa712cd-14b1-481d-a8ef-1df64733445a',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
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
         WHERE ID = '884db08a-826e-47ab-b60c-048ed7bbe5ae'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '884db08a-826e-47ab-b60c-048ed7bbe5ae',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
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
         WHERE ID = 'bed698f1-3f66-40a6-aba4-30689da8e4be'  OR 
               (EntityID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bed698f1-3f66-40a6-aba4-30689da8e4be',
            '58EEFDB7-DEDF-4641-B050-5FF356ABE791', -- Entity: Restaurant Tags
            100001,
            'ID',
            'ID',
            'Unique identifier for the tag record',
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
         WHERE ID = '20476153-d439-4fbc-b809-508243c84a1f'  OR 
               (EntityID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791' AND Name = 'RestaurantID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '20476153-d439-4fbc-b809-508243c84a1f',
            '58EEFDB7-DEDF-4641-B050-5FF356ABE791', -- Entity: Restaurant Tags
            100002,
            'RestaurantID',
            'Restaurant ID',
            'Foreign key to the Restaurant table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '18899CF5-2B81-4A29-AABF-614E5270DC09',
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
         WHERE ID = '924d0ccb-3f48-4e8c-9528-d572716b5928'  OR 
               (EntityID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791' AND Name = 'TagName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '924d0ccb-3f48-4e8c-9528-d572716b5928',
            '58EEFDB7-DEDF-4641-B050-5FF356ABE791', -- Entity: Restaurant Tags
            100003,
            'TagName',
            'Tag Name',
            'Name of the tag (e.g., Casual Dining, Outdoor Seating, Good for Groups)',
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
         WHERE ID = 'ddc13cfb-3a8a-4885-9764-6ea3e1076111'  OR 
               (EntityID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ddc13cfb-3a8a-4885-9764-6ea3e1076111',
            '58EEFDB7-DEDF-4641-B050-5FF356ABE791', -- Entity: Restaurant Tags
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
         WHERE ID = 'd730dead-88b8-4a22-b0f2-70167f9323c2'  OR 
               (EntityID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd730dead-88b8-4a22-b0f2-70167f9323c2',
            '58EEFDB7-DEDF-4641-B050-5FF356ABE791', -- Entity: Restaurant Tags
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
         WHERE ID = '4c8e1c36-f94f-405d-a7da-6a8dae1c6cab'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c8e1c36-f94f-405d-a7da-6a8dae1c6cab',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100001,
            'ID',
            'ID',
            'Unique identifier for the restaurant',
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
         WHERE ID = '57a3b1df-d539-4e45-9a58-bc9eda726ba1'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '57a3b1df-d539-4e45-9a58-bc9eda726ba1',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100002,
            'Name',
            'Name',
            'Name of the restaurant',
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
         WHERE ID = '83f51807-e5e1-4340-a077-a79bc6687b94'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'StreetAddress')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '83f51807-e5e1-4340-a077-a79bc6687b94',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100003,
            'StreetAddress',
            'Street Address',
            'Street address of the restaurant',
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
         WHERE ID = 'ac330c4c-a7e7-4c26-b06f-dc1d15fef29b'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'City')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ac330c4c-a7e7-4c26-b06f-dc1d15fef29b',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100004,
            'City',
            'City',
            'City where the restaurant is located',
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
         WHERE ID = '42074686-be50-46fb-bf25-8232a8868d44'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'State')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '42074686-be50-46fb-bf25-8232a8868d44',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100005,
            'State',
            'State',
            'State where the restaurant is located',
            'nvarchar',
            4,
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
         WHERE ID = '4b1a9fbc-5b34-4afc-a14d-0d77149e2a9c'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'ZipCode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4b1a9fbc-5b34-4afc-a14d-0d77149e2a9c',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100006,
            'ZipCode',
            'Zip Code',
            'Zip code of the restaurant location',
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
         WHERE ID = '51ddd2f8-ae71-4372-a5e1-2596c89cb2d3'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'Phone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '51ddd2f8-ae71-4372-a5e1-2596c89cb2d3',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100007,
            'Phone',
            'Phone',
            'Phone number of the restaurant',
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
         WHERE ID = 'ba24a7c3-5d39-4e3a-9edc-cebc42642b2b'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'Website')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ba24a7c3-5d39-4e3a-9edc-cebc42642b2b',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100008,
            'Website',
            'Website',
            'Website URL of the restaurant',
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
         WHERE ID = '52b24be7-25f5-4085-91f2-5f32c6e7ba3c'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'CuisineTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '52b24be7-25f5-4085-91f2-5f32c6e7ba3c',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100009,
            'CuisineTypeID',
            'Cuisine Type ID',
            'Foreign key to the CuisineType table',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '585DEE13-35BC-42C3-B63C-0744DCFB323B',
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
         WHERE ID = 'f64f9057-059a-4574-bbd7-2b36bbfdcd43'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'PriceRange')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f64f9057-059a-4574-bbd7-2b36bbfdcd43',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100010,
            'PriceRange',
            'Price Range',
            'Price range indicator ($ to $$$$)',
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
         WHERE ID = '37d365e5-1cda-4ff0-b476-d5b9fe3dcfdf'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'Latitude')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '37d365e5-1cda-4ff0-b476-d5b9fe3dcfdf',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100011,
            'Latitude',
            'Latitude',
            'Latitude coordinate for mapping',
            'decimal',
            9,
            10,
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
         WHERE ID = 'fd69fac2-cb4b-4f46-9e45-1c265f00ea5d'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'Longitude')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fd69fac2-cb4b-4f46-9e45-1c265f00ea5d',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100012,
            'Longitude',
            'Longitude',
            'Longitude coordinate for mapping',
            'decimal',
            9,
            10,
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
         WHERE ID = '4a58d7f7-c6c0-4882-8ae4-d1e0affb4ce2'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'HoursOfOperation')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4a58d7f7-c6c0-4882-8ae4-d1e0affb4ce2',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100013,
            'HoursOfOperation',
            'Hours Of Operation',
            'Hours of operation text (e.g., Mon-Fri 11am-10pm)',
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
         WHERE ID = '36d73fa4-571f-4a60-9776-e0b50ab2e177'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '36d73fa4-571f-4a60-9776-e0b50ab2e177',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
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
         WHERE ID = '428c4110-392d-4d1c-b79b-75b10cd65cef'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '428c4110-392d-4d1c-b79b-75b10cd65cef',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
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
         WHERE ID = '444539e9-025a-4493-bced-8f4b50a5562b'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '444539e9-025a-4493-bced-8f4b50a5562b',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100001,
            'ID',
            'ID',
            'Unique identifier for the wishlist entry',
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
         WHERE ID = '77f14c37-83fb-4929-977c-f069a6b70ddc'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'RestaurantID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '77f14c37-83fb-4929-977c-f069a6b70ddc',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100002,
            'RestaurantID',
            'Restaurant ID',
            'Foreign key to the Restaurant table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '18899CF5-2B81-4A29-AABF-614E5270DC09',
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
         WHERE ID = 'be802647-f3ad-4589-95b9-c7cdbfd04390'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'MemberID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'be802647-f3ad-4589-95b9-c7cdbfd04390',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100003,
            'MemberID',
            'Member ID',
            'Foreign key to the Member table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849',
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
         WHERE ID = '48880851-6284-4dfe-8799-2495684df904'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '48880851-6284-4dfe-8799-2495684df904',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100004,
            'Priority',
            'Priority',
            'Priority level for trying this restaurant (Low, Medium, High)',
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
         WHERE ID = 'f17c4e2c-5379-4867-bbf1-69700a4c50c0'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'SuggestedBy')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f17c4e2c-5379-4867-bbf1-69700a4c50c0',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100005,
            'SuggestedBy',
            'Suggested By',
            'Name of the person who suggested this restaurant',
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
         WHERE ID = 'c5975796-c9c4-4936-8381-7c01d59ff038'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c5975796-c9c4-4936-8381-7c01d59ff038',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100006,
            'Notes',
            'Notes',
            'Additional notes about why this restaurant is on the wishlist',
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
         WHERE ID = '0e6e40d4-06e7-428d-ae37-b8f7392f3e6c'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'AddedDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0e6e40d4-06e7-428d-ae37-b8f7392f3e6c',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100007,
            'AddedDate',
            'Added Date',
            'Date when the restaurant was added to the wishlist',
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
         WHERE ID = '9fa46a94-8ef8-4248-a03a-123ad5e4e8d8'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9fa46a94-8ef8-4248-a03a-123ad5e4e8d8',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
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
         WHERE ID = '1b116731-27b9-48fd-bd62-ec4cd0f22663'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1b116731-27b9-48fd-bd62-ec4cd0f22663',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
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
         WHERE ID = 'f7b86f93-ea41-4611-94a8-e4f6be720de0'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f7b86f93-ea41-4611-94a8-e4f6be720de0',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100001,
            'ID',
            'ID',
            'Unique identifier for the group visit',
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
         WHERE ID = '22f91f0a-4a4a-4af2-ae8d-860d34916d82'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '22f91f0a-4a4a-4af2-ae8d-860d34916d82',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100002,
            'Name',
            'Name',
            'Name or description of the group visit event',
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
         WHERE ID = 'ddb08f76-f39b-4d26-bae5-bafc5d35d2a9'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'RestaurantID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ddb08f76-f39b-4d26-bae5-bafc5d35d2a9',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100003,
            'RestaurantID',
            'Restaurant ID',
            'Foreign key to the Restaurant table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '18899CF5-2B81-4A29-AABF-614E5270DC09',
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
         WHERE ID = '5a120503-0387-42c4-8446-fd9c97badfb4'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'VisitDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5a120503-0387-42c4-8446-fd9c97badfb4',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100004,
            'VisitDate',
            'Visit Date',
            'Date and time of the group visit',
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
         WHERE ID = 'fcac9f99-a1e2-412d-a5d3-944e3eb8670c'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'TotalCost')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fcac9f99-a1e2-412d-a5d3-944e3eb8670c',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100005,
            'TotalCost',
            'Total Cost',
            'Total cost of the group visit',
            'decimal',
            9,
            10,
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
         WHERE ID = 'bd77447e-1927-4d65-945e-6312ab5fe903'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'GroupRating')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bd77447e-1927-4d65-945e-6312ab5fe903',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100006,
            'GroupRating',
            'Group Rating',
            'Overall group consensus rating from 1 to 5 stars',
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
         WHERE ID = 'd1f73d5d-9e64-43f8-9b81-fb4081a25ff9'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd1f73d5d-9e64-43f8-9b81-fb4081a25ff9',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100007,
            'Notes',
            'Notes',
            'Notes about the group visit',
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
         WHERE ID = '4ea7f58c-9b66-4e0a-b642-40433eded9be'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4ea7f58c-9b66-4e0a-b642-40433eded9be',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
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
         WHERE ID = '12da95cf-b190-491b-87fe-de37538cad61'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '12da95cf-b190-491b-87fe-de37538cad61',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
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
         WHERE ID = 'bac527b5-d1f1-4c86-bc7b-2f760fd92878'  OR 
               (EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bac527b5-d1f1-4c86-bc7b-2f760fd92878',
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', -- Entity: Members__Foodie
            100001,
            'ID',
            'ID',
            'Unique identifier for the member',
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
         WHERE ID = 'b7f1539b-0583-4c38-a15b-3c84b953c3c2'  OR 
               (EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b7f1539b-0583-4c38-a15b-3c84b953c3c2',
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', -- Entity: Members__Foodie
            100002,
            'Name',
            'Name',
            'Name of the member',
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
         WHERE ID = 'fe34be62-a253-47f6-8e58-c0f2bef4be7e'  OR 
               (EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849' AND Name = 'Email')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fe34be62-a253-47f6-8e58-c0f2bef4be7e',
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', -- Entity: Members__Foodie
            100003,
            'Email',
            'Email',
            'Email address of the member',
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
         WHERE ID = '23274e96-8c1a-4bfe-961b-f62a2fda346b'  OR 
               (EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849' AND Name = 'JoinDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '23274e96-8c1a-4bfe-961b-f62a2fda346b',
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', -- Entity: Members__Foodie
            100004,
            'JoinDate',
            'Join Date',
            'Date when the member joined the tracking system',
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
         WHERE ID = 'aea4586b-6a65-4b2b-84e9-e48780f45b0d'  OR 
               (EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849' AND Name = 'DietaryRestrictions')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aea4586b-6a65-4b2b-84e9-e48780f45b0d',
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', -- Entity: Members__Foodie
            100005,
            'DietaryRestrictions',
            'Dietary Restrictions',
            'Dietary restrictions or preferences (vegetarian, vegan, gluten-free, etc.)',
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
         WHERE ID = '1a407307-86b4-4539-ab28-27f68839eea7'  OR 
               (EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1a407307-86b4-4539-ab28-27f68839eea7',
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', -- Entity: Members__Foodie
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
         WHERE ID = '6e7e404f-205a-4f4c-a72a-f9e08c27307e'  OR 
               (EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e7e404f-205a-4f4c-a72a-f9e08c27307e',
            'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', -- Entity: Members__Foodie
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

/* SQL text to insert entity field value with ID c408358e-f536-4508-9c55-fc4c2f4f56d8 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c408358e-f536-4508-9c55-fc4c2f4f56d8', '48880851-6284-4DFE-8799-2495684DF904', 1, 'High', 'High')

/* SQL text to insert entity field value with ID ab7064ca-27d4-4215-8253-4ff391fd6b2e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ab7064ca-27d4-4215-8253-4ff391fd6b2e', '48880851-6284-4DFE-8799-2495684DF904', 2, 'Low', 'Low')

/* SQL text to insert entity field value with ID ea97b178-4e7e-4931-8357-da03d8702b2e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ea97b178-4e7e-4931-8357-da03d8702b2e', '48880851-6284-4DFE-8799-2495684DF904', 3, 'Medium', 'Medium')

/* SQL text to update ValueListType for entity field ID 48880851-6284-4DFE-8799-2495684DF904 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='48880851-6284-4DFE-8799-2495684DF904'

/* SQL text to insert entity field value with ID d9ae428d-fbd7-49fe-84af-7f405e7a4025 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d9ae428d-fbd7-49fe-84af-7f405e7a4025', 'F64F9057-059A-4574-BBD7-2B36BBFDCD43', 1, '$', '$')

/* SQL text to insert entity field value with ID e80b494c-5839-430d-bbc2-50d9f7b6b123 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e80b494c-5839-430d-bbc2-50d9f7b6b123', 'F64F9057-059A-4574-BBD7-2B36BBFDCD43', 2, '$$', '$$')

/* SQL text to insert entity field value with ID 1c46c5c3-27de-422c-994a-3025a9313900 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1c46c5c3-27de-422c-994a-3025a9313900', 'F64F9057-059A-4574-BBD7-2B36BBFDCD43', 3, '$$$', '$$$')

/* SQL text to insert entity field value with ID 68921d35-1d6f-440f-9683-2c01f163bb92 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('68921d35-1d6f-440f-9683-2c01f163bb92', 'F64F9057-059A-4574-BBD7-2B36BBFDCD43', 4, '$$$$', '$$$$')

/* SQL text to update ValueListType for entity field ID F64F9057-059A-4574-BBD7-2B36BBFDCD43 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F64F9057-059A-4574-BBD7-2B36BBFDCD43'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f6c6b5ba-d20e-4d19-8aad-b5594cd6d2fb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f6c6b5ba-d20e-4d19-8aad-b5594cd6d2fb', '585DEE13-35BC-42C3-B63C-0744DCFB323B', '18899CF5-2B81-4A29-AABF-614E5270DC09', 'CuisineTypeID', 'One To Many', 1, 1, 'Restaurants', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c2b7bcbd-e5cd-43ee-b5e7-645291ef0459'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c2b7bcbd-e5cd-43ee-b5e7-645291ef0459', '18899CF5-2B81-4A29-AABF-614E5270DC09', '9A80839C-DE94-4F55-AC0E-2CFD9265984B', 'RestaurantID', 'One To Many', 1, 1, 'Restaurant Visits', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4c6f1686-4970-4411-ace3-bbeea65d5808'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4c6f1686-4970-4411-ace3-bbeea65d5808', '18899CF5-2B81-4A29-AABF-614E5270DC09', '58EEFDB7-DEDF-4641-B050-5FF356ABE791', 'RestaurantID', 'One To Many', 1, 1, 'Restaurant Tags', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '58346bde-bbfb-4100-8ada-e2604af1ef26'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('58346bde-bbfb-4100-8ada-e2604af1ef26', '18899CF5-2B81-4A29-AABF-614E5270DC09', 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', 'RestaurantID', 'One To Many', 1, 1, 'Group Visits', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'b1adf130-1096-4dd8-912d-1825428c6664'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b1adf130-1096-4dd8-912d-1825428c6664', '18899CF5-2B81-4A29-AABF-614E5270DC09', '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', 'RestaurantID', 'One To Many', 1, 1, 'Wish Lists', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9d13d163-1d47-486f-829f-d244baffc520'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9d13d163-1d47-486f-829f-d244baffc520', 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', '45C7A728-8FF5-428D-A514-268C9B94C9E9', 'GroupVisitID', 'One To Many', 1, 1, 'Group Visit Members', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '89e18abe-e58f-4ab8-9aca-214a645aa8c3'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('89e18abe-e58f-4ab8-9aca-214a645aa8c3', 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', 'MemberID', 'One To Many', 1, 1, 'Wish Lists', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '75193f22-79b1-4de1-b16a-ec383cd57ad3'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('75193f22-79b1-4de1-b16a-ec383cd57ad3', 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', '45C7A728-8FF5-428D-A514-268C9B94C9E9', 'MemberID', 'One To Many', 1, 1, 'Group Visit Members', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '271d1a52-2ddf-481a-9cc2-76a9c641427a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('271d1a52-2ddf-481a-9cc2-76a9c641427a', 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', '9A80839C-DE94-4F55-AC0E-2CFD9265984B', 'MemberID', 'One To Many', 1, 1, 'Restaurant Visits', 2);
   END
                              

/* Index for Foreign Keys for CuisineType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Cuisine Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Cuisine Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Cuisine Types
-- Item: vwCuisineTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Cuisine Types
-----               SCHEMA:      Foodie
-----               BASE TABLE:  CuisineType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwCuisineTypes]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwCuisineTypes];
GO

CREATE VIEW [Foodie].[vwCuisineTypes]
AS
SELECT
    c.*
FROM
    [Foodie].[CuisineType] AS c
GO
GRANT SELECT ON [Foodie].[vwCuisineTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Cuisine Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Cuisine Types
-- Item: Permissions for vwCuisineTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwCuisineTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Cuisine Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Cuisine Types
-- Item: spCreateCuisineType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CuisineType
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateCuisineType]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateCuisineType];
GO

CREATE PROCEDURE [Foodie].[spCreateCuisineType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[CuisineType]
            (
                [ID],
                [Name],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[CuisineType]
            (
                [Name],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwCuisineTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateCuisineType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Cuisine Types */

GRANT EXECUTE ON [Foodie].[spCreateCuisineType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Cuisine Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Cuisine Types
-- Item: spUpdateCuisineType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CuisineType
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateCuisineType]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateCuisineType];
GO

CREATE PROCEDURE [Foodie].[spUpdateCuisineType]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[CuisineType]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwCuisineTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwCuisineTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateCuisineType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CuisineType table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateCuisineType]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateCuisineType];
GO
CREATE TRIGGER [Foodie].trgUpdateCuisineType
ON [Foodie].[CuisineType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[CuisineType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[CuisineType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Cuisine Types */

GRANT EXECUTE ON [Foodie].[spUpdateCuisineType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Cuisine Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Cuisine Types
-- Item: spDeleteCuisineType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CuisineType
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteCuisineType]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteCuisineType];
GO

CREATE PROCEDURE [Foodie].[spDeleteCuisineType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[CuisineType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteCuisineType] TO [cdp_Integration]
    

/* spDelete Permissions for Cuisine Types */

GRANT EXECUTE ON [Foodie].[spDeleteCuisineType] TO [cdp_Integration]



/* Index for Foreign Keys for GroupVisitMember */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visit Members
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GroupVisitID in table GroupVisitMember
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GroupVisitMember_GroupVisitID' 
    AND object_id = OBJECT_ID('[Foodie].[GroupVisitMember]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GroupVisitMember_GroupVisitID ON [Foodie].[GroupVisitMember] ([GroupVisitID]);

-- Index for foreign key MemberID in table GroupVisitMember
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GroupVisitMember_MemberID' 
    AND object_id = OBJECT_ID('[Foodie].[GroupVisitMember]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GroupVisitMember_MemberID ON [Foodie].[GroupVisitMember] ([MemberID]);

/* SQL text to update entity field related entity name field map for entity field ID 8BF4F8D0-136B-48C7-BB1D-E82F37974B28 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8BF4F8D0-136B-48C7-BB1D-E82F37974B28',
         @RelatedEntityNameFieldMap='GroupVisit'

/* Index for Foreign Keys for GroupVisit */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visits
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RestaurantID in table GroupVisit
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GroupVisit_RestaurantID' 
    AND object_id = OBJECT_ID('[Foodie].[GroupVisit]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GroupVisit_RestaurantID ON [Foodie].[GroupVisit] ([RestaurantID]);

/* SQL text to update entity field related entity name field map for entity field ID DDB08F76-F39B-4D26-BAE5-BAFC5D35D2A9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DDB08F76-F39B-4D26-BAE5-BAFC5D35D2A9',
         @RelatedEntityNameFieldMap='Restaurant'

/* Base View SQL for Group Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visits
-- Item: vwGroupVisits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Group Visits
-----               SCHEMA:      Foodie
-----               BASE TABLE:  GroupVisit
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwGroupVisits]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwGroupVisits];
GO

CREATE VIEW [Foodie].[vwGroupVisits]
AS
SELECT
    g.*,
    Restaurant_RestaurantID.[Name] AS [Restaurant]
FROM
    [Foodie].[GroupVisit] AS g
INNER JOIN
    [Foodie].[Restaurant] AS Restaurant_RestaurantID
  ON
    [g].[RestaurantID] = Restaurant_RestaurantID.[ID]
GO
GRANT SELECT ON [Foodie].[vwGroupVisits] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Group Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visits
-- Item: Permissions for vwGroupVisits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwGroupVisits] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Group Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visits
-- Item: spCreateGroupVisit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GroupVisit
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateGroupVisit]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateGroupVisit];
GO

CREATE PROCEDURE [Foodie].[spCreateGroupVisit]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @RestaurantID uniqueidentifier,
    @VisitDate datetime,
    @TotalCost decimal(10, 2),
    @GroupRating int,
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[GroupVisit]
            (
                [ID],
                [Name],
                [RestaurantID],
                [VisitDate],
                [TotalCost],
                [GroupRating],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @RestaurantID,
                @VisitDate,
                @TotalCost,
                @GroupRating,
                @Notes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[GroupVisit]
            (
                [Name],
                [RestaurantID],
                [VisitDate],
                [TotalCost],
                [GroupRating],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @RestaurantID,
                @VisitDate,
                @TotalCost,
                @GroupRating,
                @Notes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwGroupVisits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateGroupVisit] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Group Visits */

GRANT EXECUTE ON [Foodie].[spCreateGroupVisit] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Group Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visits
-- Item: spUpdateGroupVisit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GroupVisit
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateGroupVisit]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateGroupVisit];
GO

CREATE PROCEDURE [Foodie].[spUpdateGroupVisit]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @RestaurantID uniqueidentifier,
    @VisitDate datetime,
    @TotalCost decimal(10, 2),
    @GroupRating int,
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[GroupVisit]
    SET
        [Name] = @Name,
        [RestaurantID] = @RestaurantID,
        [VisitDate] = @VisitDate,
        [TotalCost] = @TotalCost,
        [GroupRating] = @GroupRating,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwGroupVisits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwGroupVisits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateGroupVisit] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GroupVisit table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateGroupVisit]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateGroupVisit];
GO
CREATE TRIGGER [Foodie].trgUpdateGroupVisit
ON [Foodie].[GroupVisit]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[GroupVisit]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[GroupVisit] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Group Visits */

GRANT EXECUTE ON [Foodie].[spUpdateGroupVisit] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Group Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visits
-- Item: spDeleteGroupVisit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GroupVisit
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteGroupVisit]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteGroupVisit];
GO

CREATE PROCEDURE [Foodie].[spDeleteGroupVisit]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[GroupVisit]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteGroupVisit] TO [cdp_Integration]
    

/* spDelete Permissions for Group Visits */

GRANT EXECUTE ON [Foodie].[spDeleteGroupVisit] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID E8925F78-C633-4D9F-880B-D1687F78248A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E8925F78-C633-4D9F-880B-D1687F78248A',
         @RelatedEntityNameFieldMap='Member'

/* Base View SQL for Group Visit Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visit Members
-- Item: vwGroupVisitMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Group Visit Members
-----               SCHEMA:      Foodie
-----               BASE TABLE:  GroupVisitMember
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwGroupVisitMembers]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwGroupVisitMembers];
GO

CREATE VIEW [Foodie].[vwGroupVisitMembers]
AS
SELECT
    g.*,
    GroupVisit_GroupVisitID.[Name] AS [GroupVisit],
    Member__Foodie_MemberID.[Name] AS [Member]
FROM
    [Foodie].[GroupVisitMember] AS g
INNER JOIN
    [Foodie].[GroupVisit] AS GroupVisit_GroupVisitID
  ON
    [g].[GroupVisitID] = GroupVisit_GroupVisitID.[ID]
INNER JOIN
    [Foodie].[Member] AS Member__Foodie_MemberID
  ON
    [g].[MemberID] = Member__Foodie_MemberID.[ID]
GO
GRANT SELECT ON [Foodie].[vwGroupVisitMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Group Visit Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visit Members
-- Item: Permissions for vwGroupVisitMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwGroupVisitMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Group Visit Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visit Members
-- Item: spCreateGroupVisitMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GroupVisitMember
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateGroupVisitMember]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateGroupVisitMember];
GO

CREATE PROCEDURE [Foodie].[spCreateGroupVisitMember]
    @ID uniqueidentifier = NULL,
    @GroupVisitID uniqueidentifier,
    @MemberID uniqueidentifier,
    @AmountPaid decimal(10, 2)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[GroupVisitMember]
            (
                [ID],
                [GroupVisitID],
                [MemberID],
                [AmountPaid]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @GroupVisitID,
                @MemberID,
                @AmountPaid
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[GroupVisitMember]
            (
                [GroupVisitID],
                [MemberID],
                [AmountPaid]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @GroupVisitID,
                @MemberID,
                @AmountPaid
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwGroupVisitMembers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateGroupVisitMember] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Group Visit Members */

GRANT EXECUTE ON [Foodie].[spCreateGroupVisitMember] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Group Visit Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visit Members
-- Item: spUpdateGroupVisitMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GroupVisitMember
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateGroupVisitMember]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateGroupVisitMember];
GO

CREATE PROCEDURE [Foodie].[spUpdateGroupVisitMember]
    @ID uniqueidentifier,
    @GroupVisitID uniqueidentifier,
    @MemberID uniqueidentifier,
    @AmountPaid decimal(10, 2)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[GroupVisitMember]
    SET
        [GroupVisitID] = @GroupVisitID,
        [MemberID] = @MemberID,
        [AmountPaid] = @AmountPaid
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwGroupVisitMembers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwGroupVisitMembers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateGroupVisitMember] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GroupVisitMember table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateGroupVisitMember]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateGroupVisitMember];
GO
CREATE TRIGGER [Foodie].trgUpdateGroupVisitMember
ON [Foodie].[GroupVisitMember]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[GroupVisitMember]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[GroupVisitMember] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Group Visit Members */

GRANT EXECUTE ON [Foodie].[spUpdateGroupVisitMember] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Group Visit Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Visit Members
-- Item: spDeleteGroupVisitMember
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GroupVisitMember
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteGroupVisitMember]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteGroupVisitMember];
GO

CREATE PROCEDURE [Foodie].[spDeleteGroupVisitMember]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[GroupVisitMember]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteGroupVisitMember] TO [cdp_Integration]
    

/* spDelete Permissions for Group Visit Members */

GRANT EXECUTE ON [Foodie].[spDeleteGroupVisitMember] TO [cdp_Integration]



/* Index for Foreign Keys for Member */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members__Foodie
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Members__Foodie */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members__Foodie
-- Item: vwMembers__Foodie
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Members__Foodie
-----               SCHEMA:      Foodie
-----               BASE TABLE:  Member
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwMembers__Foodie]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwMembers__Foodie];
GO

CREATE VIEW [Foodie].[vwMembers__Foodie]
AS
SELECT
    m.*
FROM
    [Foodie].[Member] AS m
GO
GRANT SELECT ON [Foodie].[vwMembers__Foodie] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Members__Foodie */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members__Foodie
-- Item: Permissions for vwMembers__Foodie
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwMembers__Foodie] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Members__Foodie */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members__Foodie
-- Item: spCreateMember__Foodie
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateMember__Foodie]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateMember__Foodie];
GO

CREATE PROCEDURE [Foodie].[spCreateMember__Foodie]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Email nvarchar(255),
    @JoinDate datetime = NULL,
    @DietaryRestrictions nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[Member]
            (
                [ID],
                [Name],
                [Email],
                [JoinDate],
                [DietaryRestrictions]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Email,
                ISNULL(@JoinDate, getdate()),
                @DietaryRestrictions
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[Member]
            (
                [Name],
                [Email],
                [JoinDate],
                [DietaryRestrictions]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Email,
                ISNULL(@JoinDate, getdate()),
                @DietaryRestrictions
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwMembers__Foodie] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateMember__Foodie] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Members__Foodie */

GRANT EXECUTE ON [Foodie].[spCreateMember__Foodie] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Members__Foodie */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members__Foodie
-- Item: spUpdateMember__Foodie
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateMember__Foodie]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateMember__Foodie];
GO

CREATE PROCEDURE [Foodie].[spUpdateMember__Foodie]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Email nvarchar(255),
    @JoinDate datetime,
    @DietaryRestrictions nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[Member]
    SET
        [Name] = @Name,
        [Email] = @Email,
        [JoinDate] = @JoinDate,
        [DietaryRestrictions] = @DietaryRestrictions
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwMembers__Foodie] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwMembers__Foodie]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateMember__Foodie] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Member table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateMember__Foodie]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateMember__Foodie];
GO
CREATE TRIGGER [Foodie].trgUpdateMember__Foodie
ON [Foodie].[Member]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[Member]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[Member] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Members__Foodie */

GRANT EXECUTE ON [Foodie].[spUpdateMember__Foodie] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Members__Foodie */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members__Foodie
-- Item: spDeleteMember__Foodie
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Member
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteMember__Foodie]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteMember__Foodie];
GO

CREATE PROCEDURE [Foodie].[spDeleteMember__Foodie]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[Member]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteMember__Foodie] TO [cdp_Integration]
    

/* spDelete Permissions for Members__Foodie */

GRANT EXECUTE ON [Foodie].[spDeleteMember__Foodie] TO [cdp_Integration]



/* Index for Foreign Keys for RestaurantTag */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RestaurantID in table RestaurantTag
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RestaurantTag_RestaurantID' 
    AND object_id = OBJECT_ID('[Foodie].[RestaurantTag]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RestaurantTag_RestaurantID ON [Foodie].[RestaurantTag] ([RestaurantID]);

/* SQL text to update entity field related entity name field map for entity field ID 20476153-D439-4FBC-B809-508243C84A1F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='20476153-D439-4FBC-B809-508243C84A1F',
         @RelatedEntityNameFieldMap='Restaurant'

/* Index for Foreign Keys for RestaurantVisit */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Visits
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RestaurantID in table RestaurantVisit
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RestaurantVisit_RestaurantID' 
    AND object_id = OBJECT_ID('[Foodie].[RestaurantVisit]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RestaurantVisit_RestaurantID ON [Foodie].[RestaurantVisit] ([RestaurantID]);

-- Index for foreign key MemberID in table RestaurantVisit
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RestaurantVisit_MemberID' 
    AND object_id = OBJECT_ID('[Foodie].[RestaurantVisit]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RestaurantVisit_MemberID ON [Foodie].[RestaurantVisit] ([MemberID]);

/* SQL text to update entity field related entity name field map for entity field ID FC6233F9-BBA1-42C3-8DF9-2431AED45D26 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FC6233F9-BBA1-42C3-8DF9-2431AED45D26',
         @RelatedEntityNameFieldMap='Restaurant'

/* Index for Foreign Keys for Restaurant */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurants
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CuisineTypeID in table Restaurant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Restaurant_CuisineTypeID' 
    AND object_id = OBJECT_ID('[Foodie].[Restaurant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Restaurant_CuisineTypeID ON [Foodie].[Restaurant] ([CuisineTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 52B24BE7-25F5-4085-91F2-5F32C6E7BA3C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='52B24BE7-25F5-4085-91F2-5F32C6E7BA3C',
         @RelatedEntityNameFieldMap='CuisineType'

/* SQL text to update entity field related entity name field map for entity field ID 0D276DA7-17DE-431B-95F1-E1D14EA5D4E0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0D276DA7-17DE-431B-95F1-E1D14EA5D4E0',
         @RelatedEntityNameFieldMap='Member'

/* Base View SQL for Restaurant Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Tags
-- Item: vwRestaurantTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Restaurant Tags
-----               SCHEMA:      Foodie
-----               BASE TABLE:  RestaurantTag
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwRestaurantTags]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwRestaurantTags];
GO

CREATE VIEW [Foodie].[vwRestaurantTags]
AS
SELECT
    r.*,
    Restaurant_RestaurantID.[Name] AS [Restaurant]
FROM
    [Foodie].[RestaurantTag] AS r
INNER JOIN
    [Foodie].[Restaurant] AS Restaurant_RestaurantID
  ON
    [r].[RestaurantID] = Restaurant_RestaurantID.[ID]
GO
GRANT SELECT ON [Foodie].[vwRestaurantTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Restaurant Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Tags
-- Item: Permissions for vwRestaurantTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwRestaurantTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Restaurant Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Tags
-- Item: spCreateRestaurantTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RestaurantTag
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateRestaurantTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateRestaurantTag];
GO

CREATE PROCEDURE [Foodie].[spCreateRestaurantTag]
    @ID uniqueidentifier = NULL,
    @RestaurantID uniqueidentifier,
    @TagName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[RestaurantTag]
            (
                [ID],
                [RestaurantID],
                [TagName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RestaurantID,
                @TagName
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[RestaurantTag]
            (
                [RestaurantID],
                [TagName]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RestaurantID,
                @TagName
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwRestaurantTags] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateRestaurantTag] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Restaurant Tags */

GRANT EXECUTE ON [Foodie].[spCreateRestaurantTag] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Restaurant Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Tags
-- Item: spUpdateRestaurantTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RestaurantTag
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateRestaurantTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateRestaurantTag];
GO

CREATE PROCEDURE [Foodie].[spUpdateRestaurantTag]
    @ID uniqueidentifier,
    @RestaurantID uniqueidentifier,
    @TagName nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[RestaurantTag]
    SET
        [RestaurantID] = @RestaurantID,
        [TagName] = @TagName
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwRestaurantTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwRestaurantTags]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateRestaurantTag] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RestaurantTag table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateRestaurantTag]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateRestaurantTag];
GO
CREATE TRIGGER [Foodie].trgUpdateRestaurantTag
ON [Foodie].[RestaurantTag]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[RestaurantTag]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[RestaurantTag] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Restaurant Tags */

GRANT EXECUTE ON [Foodie].[spUpdateRestaurantTag] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Restaurant Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Tags
-- Item: spDeleteRestaurantTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RestaurantTag
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteRestaurantTag]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteRestaurantTag];
GO

CREATE PROCEDURE [Foodie].[spDeleteRestaurantTag]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[RestaurantTag]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteRestaurantTag] TO [cdp_Integration]
    

/* spDelete Permissions for Restaurant Tags */

GRANT EXECUTE ON [Foodie].[spDeleteRestaurantTag] TO [cdp_Integration]



/* Base View SQL for Restaurants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurants
-- Item: vwRestaurants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Restaurants
-----               SCHEMA:      Foodie
-----               BASE TABLE:  Restaurant
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwRestaurants]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwRestaurants];
GO

CREATE VIEW [Foodie].[vwRestaurants]
AS
SELECT
    r.*,
    CuisineType_CuisineTypeID.[Name] AS [CuisineType]
FROM
    [Foodie].[Restaurant] AS r
LEFT OUTER JOIN
    [Foodie].[CuisineType] AS CuisineType_CuisineTypeID
  ON
    [r].[CuisineTypeID] = CuisineType_CuisineTypeID.[ID]
GO
GRANT SELECT ON [Foodie].[vwRestaurants] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Restaurants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurants
-- Item: Permissions for vwRestaurants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwRestaurants] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Restaurants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurants
-- Item: spCreateRestaurant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Restaurant
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateRestaurant]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateRestaurant];
GO

CREATE PROCEDURE [Foodie].[spCreateRestaurant]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @StreetAddress nvarchar(200),
    @City nvarchar(100),
    @State nvarchar(2),
    @ZipCode nvarchar(10),
    @Phone nvarchar(20),
    @Website nvarchar(255),
    @CuisineTypeID uniqueidentifier,
    @PriceRange nvarchar(10),
    @Latitude decimal(10, 7),
    @Longitude decimal(10, 7),
    @HoursOfOperation nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[Restaurant]
            (
                [ID],
                [Name],
                [StreetAddress],
                [City],
                [State],
                [ZipCode],
                [Phone],
                [Website],
                [CuisineTypeID],
                [PriceRange],
                [Latitude],
                [Longitude],
                [HoursOfOperation]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @StreetAddress,
                @City,
                @State,
                @ZipCode,
                @Phone,
                @Website,
                @CuisineTypeID,
                @PriceRange,
                @Latitude,
                @Longitude,
                @HoursOfOperation
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[Restaurant]
            (
                [Name],
                [StreetAddress],
                [City],
                [State],
                [ZipCode],
                [Phone],
                [Website],
                [CuisineTypeID],
                [PriceRange],
                [Latitude],
                [Longitude],
                [HoursOfOperation]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @StreetAddress,
                @City,
                @State,
                @ZipCode,
                @Phone,
                @Website,
                @CuisineTypeID,
                @PriceRange,
                @Latitude,
                @Longitude,
                @HoursOfOperation
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwRestaurants] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateRestaurant] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Restaurants */

GRANT EXECUTE ON [Foodie].[spCreateRestaurant] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Restaurants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurants
-- Item: spUpdateRestaurant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Restaurant
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateRestaurant]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateRestaurant];
GO

CREATE PROCEDURE [Foodie].[spUpdateRestaurant]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @StreetAddress nvarchar(200),
    @City nvarchar(100),
    @State nvarchar(2),
    @ZipCode nvarchar(10),
    @Phone nvarchar(20),
    @Website nvarchar(255),
    @CuisineTypeID uniqueidentifier,
    @PriceRange nvarchar(10),
    @Latitude decimal(10, 7),
    @Longitude decimal(10, 7),
    @HoursOfOperation nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[Restaurant]
    SET
        [Name] = @Name,
        [StreetAddress] = @StreetAddress,
        [City] = @City,
        [State] = @State,
        [ZipCode] = @ZipCode,
        [Phone] = @Phone,
        [Website] = @Website,
        [CuisineTypeID] = @CuisineTypeID,
        [PriceRange] = @PriceRange,
        [Latitude] = @Latitude,
        [Longitude] = @Longitude,
        [HoursOfOperation] = @HoursOfOperation
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwRestaurants] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwRestaurants]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateRestaurant] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Restaurant table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateRestaurant]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateRestaurant];
GO
CREATE TRIGGER [Foodie].trgUpdateRestaurant
ON [Foodie].[Restaurant]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[Restaurant]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[Restaurant] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Restaurants */

GRANT EXECUTE ON [Foodie].[spUpdateRestaurant] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Restaurants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurants
-- Item: spDeleteRestaurant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Restaurant
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteRestaurant]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteRestaurant];
GO

CREATE PROCEDURE [Foodie].[spDeleteRestaurant]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[Restaurant]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteRestaurant] TO [cdp_Integration]
    

/* spDelete Permissions for Restaurants */

GRANT EXECUTE ON [Foodie].[spDeleteRestaurant] TO [cdp_Integration]



/* Base View SQL for Restaurant Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Visits
-- Item: vwRestaurantVisits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Restaurant Visits
-----               SCHEMA:      Foodie
-----               BASE TABLE:  RestaurantVisit
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwRestaurantVisits]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwRestaurantVisits];
GO

CREATE VIEW [Foodie].[vwRestaurantVisits]
AS
SELECT
    r.*,
    Restaurant_RestaurantID.[Name] AS [Restaurant],
    Member__Foodie_MemberID.[Name] AS [Member]
FROM
    [Foodie].[RestaurantVisit] AS r
INNER JOIN
    [Foodie].[Restaurant] AS Restaurant_RestaurantID
  ON
    [r].[RestaurantID] = Restaurant_RestaurantID.[ID]
INNER JOIN
    [Foodie].[Member] AS Member__Foodie_MemberID
  ON
    [r].[MemberID] = Member__Foodie_MemberID.[ID]
GO
GRANT SELECT ON [Foodie].[vwRestaurantVisits] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Restaurant Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Visits
-- Item: Permissions for vwRestaurantVisits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwRestaurantVisits] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Restaurant Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Visits
-- Item: spCreateRestaurantVisit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RestaurantVisit
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateRestaurantVisit]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateRestaurantVisit];
GO

CREATE PROCEDURE [Foodie].[spCreateRestaurantVisit]
    @ID uniqueidentifier = NULL,
    @RestaurantID uniqueidentifier,
    @MemberID uniqueidentifier,
    @VisitDate datetime,
    @Rating int,
    @Comments nvarchar(MAX),
    @DishesOrdered nvarchar(MAX),
    @WouldReturn bit,
    @PhotoURLs nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[RestaurantVisit]
            (
                [ID],
                [RestaurantID],
                [MemberID],
                [VisitDate],
                [Rating],
                [Comments],
                [DishesOrdered],
                [WouldReturn],
                [PhotoURLs]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RestaurantID,
                @MemberID,
                @VisitDate,
                @Rating,
                @Comments,
                @DishesOrdered,
                @WouldReturn,
                @PhotoURLs
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[RestaurantVisit]
            (
                [RestaurantID],
                [MemberID],
                [VisitDate],
                [Rating],
                [Comments],
                [DishesOrdered],
                [WouldReturn],
                [PhotoURLs]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RestaurantID,
                @MemberID,
                @VisitDate,
                @Rating,
                @Comments,
                @DishesOrdered,
                @WouldReturn,
                @PhotoURLs
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwRestaurantVisits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateRestaurantVisit] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Restaurant Visits */

GRANT EXECUTE ON [Foodie].[spCreateRestaurantVisit] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Restaurant Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Visits
-- Item: spUpdateRestaurantVisit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RestaurantVisit
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateRestaurantVisit]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateRestaurantVisit];
GO

CREATE PROCEDURE [Foodie].[spUpdateRestaurantVisit]
    @ID uniqueidentifier,
    @RestaurantID uniqueidentifier,
    @MemberID uniqueidentifier,
    @VisitDate datetime,
    @Rating int,
    @Comments nvarchar(MAX),
    @DishesOrdered nvarchar(MAX),
    @WouldReturn bit,
    @PhotoURLs nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[RestaurantVisit]
    SET
        [RestaurantID] = @RestaurantID,
        [MemberID] = @MemberID,
        [VisitDate] = @VisitDate,
        [Rating] = @Rating,
        [Comments] = @Comments,
        [DishesOrdered] = @DishesOrdered,
        [WouldReturn] = @WouldReturn,
        [PhotoURLs] = @PhotoURLs
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwRestaurantVisits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwRestaurantVisits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateRestaurantVisit] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RestaurantVisit table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateRestaurantVisit]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateRestaurantVisit];
GO
CREATE TRIGGER [Foodie].trgUpdateRestaurantVisit
ON [Foodie].[RestaurantVisit]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[RestaurantVisit]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[RestaurantVisit] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Restaurant Visits */

GRANT EXECUTE ON [Foodie].[spUpdateRestaurantVisit] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Restaurant Visits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Restaurant Visits
-- Item: spDeleteRestaurantVisit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RestaurantVisit
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteRestaurantVisit]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteRestaurantVisit];
GO

CREATE PROCEDURE [Foodie].[spDeleteRestaurantVisit]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[RestaurantVisit]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteRestaurantVisit] TO [cdp_Integration]
    

/* spDelete Permissions for Restaurant Visits */

GRANT EXECUTE ON [Foodie].[spDeleteRestaurantVisit] TO [cdp_Integration]



/* Index for Foreign Keys for WishList */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Wish Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RestaurantID in table WishList
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WishList_RestaurantID' 
    AND object_id = OBJECT_ID('[Foodie].[WishList]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WishList_RestaurantID ON [Foodie].[WishList] ([RestaurantID]);

-- Index for foreign key MemberID in table WishList
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WishList_MemberID' 
    AND object_id = OBJECT_ID('[Foodie].[WishList]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WishList_MemberID ON [Foodie].[WishList] ([MemberID]);

/* SQL text to update entity field related entity name field map for entity field ID 77F14C37-83FB-4929-977C-F069A6B70DDC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='77F14C37-83FB-4929-977C-F069A6B70DDC',
         @RelatedEntityNameFieldMap='Restaurant'

/* SQL text to update entity field related entity name field map for entity field ID BE802647-F3AD-4589-95B9-C7CDBFD04390 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BE802647-F3AD-4589-95B9-C7CDBFD04390',
         @RelatedEntityNameFieldMap='Member'

/* Base View SQL for Wish Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Wish Lists
-- Item: vwWishLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Wish Lists
-----               SCHEMA:      Foodie
-----               BASE TABLE:  WishList
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[vwWishLists]', 'V') IS NOT NULL
    DROP VIEW [Foodie].[vwWishLists];
GO

CREATE VIEW [Foodie].[vwWishLists]
AS
SELECT
    w.*,
    Restaurant_RestaurantID.[Name] AS [Restaurant],
    Member__Foodie_MemberID.[Name] AS [Member]
FROM
    [Foodie].[WishList] AS w
INNER JOIN
    [Foodie].[Restaurant] AS Restaurant_RestaurantID
  ON
    [w].[RestaurantID] = Restaurant_RestaurantID.[ID]
INNER JOIN
    [Foodie].[Member] AS Member__Foodie_MemberID
  ON
    [w].[MemberID] = Member__Foodie_MemberID.[ID]
GO
GRANT SELECT ON [Foodie].[vwWishLists] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Wish Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Wish Lists
-- Item: Permissions for vwWishLists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Foodie].[vwWishLists] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Wish Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Wish Lists
-- Item: spCreateWishList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WishList
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spCreateWishList]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spCreateWishList];
GO

CREATE PROCEDURE [Foodie].[spCreateWishList]
    @ID uniqueidentifier = NULL,
    @RestaurantID uniqueidentifier,
    @MemberID uniqueidentifier,
    @Priority nvarchar(20),
    @SuggestedBy nvarchar(100),
    @Notes nvarchar(500),
    @AddedDate datetime = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Foodie].[WishList]
            (
                [ID],
                [RestaurantID],
                [MemberID],
                [Priority],
                [SuggestedBy],
                [Notes],
                [AddedDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RestaurantID,
                @MemberID,
                @Priority,
                @SuggestedBy,
                @Notes,
                ISNULL(@AddedDate, getdate())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Foodie].[WishList]
            (
                [RestaurantID],
                [MemberID],
                [Priority],
                [SuggestedBy],
                [Notes],
                [AddedDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RestaurantID,
                @MemberID,
                @Priority,
                @SuggestedBy,
                @Notes,
                ISNULL(@AddedDate, getdate())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Foodie].[vwWishLists] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Foodie].[spCreateWishList] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Wish Lists */

GRANT EXECUTE ON [Foodie].[spCreateWishList] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Wish Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Wish Lists
-- Item: spUpdateWishList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WishList
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spUpdateWishList]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spUpdateWishList];
GO

CREATE PROCEDURE [Foodie].[spUpdateWishList]
    @ID uniqueidentifier,
    @RestaurantID uniqueidentifier,
    @MemberID uniqueidentifier,
    @Priority nvarchar(20),
    @SuggestedBy nvarchar(100),
    @Notes nvarchar(500),
    @AddedDate datetime
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[WishList]
    SET
        [RestaurantID] = @RestaurantID,
        [MemberID] = @MemberID,
        [Priority] = @Priority,
        [SuggestedBy] = @SuggestedBy,
        [Notes] = @Notes,
        [AddedDate] = @AddedDate
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Foodie].[vwWishLists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Foodie].[vwWishLists]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Foodie].[spUpdateWishList] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WishList table
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[trgUpdateWishList]', 'TR') IS NOT NULL
    DROP TRIGGER [Foodie].[trgUpdateWishList];
GO
CREATE TRIGGER [Foodie].trgUpdateWishList
ON [Foodie].[WishList]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Foodie].[WishList]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Foodie].[WishList] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Wish Lists */

GRANT EXECUTE ON [Foodie].[spUpdateWishList] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Wish Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Wish Lists
-- Item: spDeleteWishList
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WishList
------------------------------------------------------------
IF OBJECT_ID('[Foodie].[spDeleteWishList]', 'P') IS NOT NULL
    DROP PROCEDURE [Foodie].[spDeleteWishList];
GO

CREATE PROCEDURE [Foodie].[spDeleteWishList]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Foodie].[WishList]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Foodie].[spDeleteWishList] TO [cdp_Integration]
    

/* spDelete Permissions for Wish Lists */

GRANT EXECUTE ON [Foodie].[spDeleteWishList] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'df6843c7-0b4e-4082-b1c0-cb8bb9001d94'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = 'GroupVisit')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'df6843c7-0b4e-4082-b1c0-cb8bb9001d94',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
            100013,
            'GroupVisit',
            'Group Visit',
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
         WHERE ID = 'b7981665-4e9b-4e9f-b88f-025381163e7b'  OR 
               (EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9' AND Name = 'Member')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b7981665-4e9b-4e9f-b88f-025381163e7b',
            '45C7A728-8FF5-428D-A514-268C9B94C9E9', -- Entity: Group Visit Members
            100014,
            'Member',
            'Member',
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
         WHERE ID = 'a343fab9-3919-4825-abce-6e9c3d72d915'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'Restaurant')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a343fab9-3919-4825-abce-6e9c3d72d915',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100023,
            'Restaurant',
            'Restaurant',
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
         WHERE ID = '9009ba5a-9f0e-4646-8571-f335645a72c6'  OR 
               (EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B' AND Name = 'Member')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9009ba5a-9f0e-4646-8571-f335645a72c6',
            '9A80839C-DE94-4F55-AC0E-2CFD9265984B', -- Entity: Restaurant Visits
            100024,
            'Member',
            'Member',
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
         WHERE ID = '70aa8deb-78aa-4049-9d53-ff6a5281ba62'  OR 
               (EntityID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791' AND Name = 'Restaurant')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '70aa8deb-78aa-4049-9d53-ff6a5281ba62',
            '58EEFDB7-DEDF-4641-B050-5FF356ABE791', -- Entity: Restaurant Tags
            100011,
            'Restaurant',
            'Restaurant',
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
         WHERE ID = 'c1098fbf-e746-4e04-91c5-2bc4d5eaab53'  OR 
               (EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09' AND Name = 'CuisineType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c1098fbf-e746-4e04-91c5-2bc4d5eaab53',
            '18899CF5-2B81-4A29-AABF-614E5270DC09', -- Entity: Restaurants
            100031,
            'CuisineType',
            'Cuisine Type',
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
         WHERE ID = 'a72ffa2f-19f6-4e46-aabb-9187914c7837'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'Restaurant')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a72ffa2f-19f6-4e46-aabb-9187914c7837',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100019,
            'Restaurant',
            'Restaurant',
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
         WHERE ID = '28d09491-3dc7-4780-9342-dc9537ad46bd'  OR 
               (EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A' AND Name = 'Member')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '28d09491-3dc7-4780-9342-dc9537ad46bd',
            '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', -- Entity: Wish Lists
            100020,
            'Member',
            'Member',
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
         WHERE ID = 'e2814d78-ca6c-4da0-b4fb-c081c12dc9e9'  OR 
               (EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89' AND Name = 'Restaurant')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e2814d78-ca6c-4da0-b4fb-c081c12dc9e9',
            'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', -- Entity: Group Visits
            100019,
            'Restaurant',
            'Restaurant',
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
            WHERE ID = 'B7F1539B-0583-4C38-A15B-3C84B953C3C2'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B7F1539B-0583-4C38-A15B-3C84B953C3C2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FE34BE62-A253-47F6-8E58-C0F2BEF4BE7E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '23274E96-8C1A-4BFE-961B-F62A2FDA346B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B7F1539B-0583-4C38-A15B-3C84B953C3C2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE34BE62-A253-47F6-8E58-C0F2BEF4BE7E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AEA4586B-6A65-4B2B-84E9-E48780F45B0D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E4829F78-49CD-4909-814F-00436EA7559F'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E4829F78-49CD-4909-814F-00436EA7559F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3ECF4D5E-1960-4E2D-B7DC-E4B94479C11F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E4829F78-49CD-4909-814F-00436EA7559F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3ECF4D5E-1960-4E2D-B7DC-E4B94479C11F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '924D0CCB-3F48-4E8C-9528-D572716B5928'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '924D0CCB-3F48-4E8C-9528-D572716B5928'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '70AA8DEB-78AA-4049-9D53-FF6A5281BA62'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '924D0CCB-3F48-4E8C-9528-D572716B5928'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '70AA8DEB-78AA-4049-9D53-FF6A5281BA62'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B7981665-4E9B-4E9F-B88F-025381163E7B'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FFC438FB-AF3D-4FF5-BC4C-8822E4B1C807'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DF6843C7-0B4E-4082-B1C0-CB8BB9001D94'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B7981665-4E9B-4E9F-B88F-025381163E7B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DF6843C7-0B4E-4082-B1C0-CB8BB9001D94'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B7981665-4E9B-4E9F-B88F-025381163E7B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '22F91F0A-4A4A-4AF2-AE8D-860D34916D82'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '22F91F0A-4A4A-4AF2-AE8D-860D34916D82'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5A120503-0387-42C4-8446-FD9C97BADFB4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FCAC9F99-A1E2-412D-A5D3-944E3EB8670C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BD77447E-1927-4D65-945E-6312AB5FE903'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E2814D78-CA6C-4DA0-B4FB-C081C12DC9E9'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '22F91F0A-4A4A-4AF2-AE8D-860D34916D82'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E2814D78-CA6C-4DA0-B4FB-C081C12DC9E9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Member Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7F1539B-0583-4C38-A15B-3C84B953C3C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Member Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email',
       ExtendedType = 'Email',
       CodeType = NULL
   WHERE ID = 'FE34BE62-A253-47F6-8E58-C0F2BEF4BE7E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Member Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'Join Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23274E96-8C1A-4BFE-961B-F62A2FDA346B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Member Profile',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dietary Restrictions',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AEA4586B-6A65-4B2B-84E9-E48780F45B0D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BAC527B5-D1F1-4C86-BC7B-2F760FD92878'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1A407307-86B4-4539-AB28-27F68839EEA7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E7E404F-205A-4F4C-A72A-F9E08C27307E'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-users */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-users',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('da93853a-33ea-4cf9-b0ce-974435d68fcf', 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', 'FieldCategoryInfo', '{"Member Profile":{"icon":"fa fa-user","description":"Core member information including name, contact, join date, and dietary preferences."},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking record creation and updates."}}', GETUTCDATE(), GETUTCDATE())
            

/* Set categories for 5 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7E296C3A-1A5B-4B24-BAE0-F538135ADF86'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Cuisine Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E4829F78-49CD-4909-814F-00436EA7559F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Cuisine Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3ECF4D5E-1960-4E2D-B7DC-E4B94479C11F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C078F569-F20C-4C21-BA35-CA483F804E79'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF76B23B-F369-479A-88BB-552FDEA808E6'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-utensils */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-utensils',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '585DEE13-35BC-42C3-B63C-0744DCFB323B'
               

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('03e0c708-fd92-4981-8e0a-62fe20800cde', 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849', 'FieldCategoryIcons', '{"Member Profile":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'E6676CB1-55AE-4597-BA15-DA4A3DDF8849'
         

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7ae67b86-94d1-412d-bda3-bc1c78ed1a6d', '585DEE13-35BC-42C3-B63C-0744DCFB323B', 'FieldCategoryInfo', '{"Cuisine Details":{"icon":"fa fa-utensils","description":"Core information about each cuisine type, including name and description"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('36ae320d-da37-475a-8a6b-76d9daa37733', '585DEE13-35BC-42C3-B63C-0744DCFB323B', 'FieldCategoryIcons', '{"Cuisine Details":"fa fa-utensils","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '585DEE13-35BC-42C3-B63C-0744DCFB323B'
         

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F7B86F93-EA41-4611-94A8-E4F6BE720DE0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Visit Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '22F91F0A-4A4A-4AF2-AE8D-860D34916D82'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDB08F76-F39B-4D26-BAE5-BAFC5D35D2A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Visit Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A120503-0387-42C4-8446-FD9C97BADFB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Total Cost',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FCAC9F99-A1E2-412D-A5D3-944E3EB8670C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Group Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BD77447E-1927-4D65-945E-6312AB5FE903'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D1F73D5D-9E64-43F8-9B81-FB4081A25FF9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4EA7F58C-9B66-4E0A-B642-40433EDED9BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12DA95CF-B190-491B-87FE-DE37538CAD61'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E2814D78-CA6C-4DA0-B4FB-C081C12DC9E9'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-users */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-users',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7656559e-221e-479a-92f4-ef50e8fa2e42', 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', 'FieldCategoryInfo', '{"Visit Details":{"icon":"fa fa-utensils","description":"Core information about the group visit, including name, date, restaurant, cost, rating, and notes."},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking record creation and modification."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('264a479b-729e-4559-8a51-f64b9873adc3', 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89', 'FieldCategoryIcons', '{"Visit Details":"fa fa-utensils","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'E4CE0C4B-FE98-4E6E-B4C9-C423C53A9A89'
         

/* Set categories for 6 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BED698F1-3F66-40A6-ABA4-30689DA8E4BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDC13CFB-3A8A-4885-9764-6EA3E1076111'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D730DEAD-88B8-4A22-B0F2-70167F9323C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Tag Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '924D0CCB-3F48-4E8C-9528-D572716B5928'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20476153-D439-4FBC-B809-508243C84A1F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Tag Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '70AA8DEB-78AA-4049-9D53-FF6A5281BA62'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tag */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tag',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('51d0f655-bfdb-4e72-aa36-be9e798a0b1d', '58EEFDB7-DEDF-4641-B050-5FF356ABE791', 'FieldCategoryInfo', '{"Tag Information":{"icon":"fa fa-tag","description":"Core tag data linking a restaurant to its descriptive label"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields and record identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('0634875f-7ad8-492e-97ff-07b94d00410a', '58EEFDB7-DEDF-4641-B050-5FF356ABE791', 'FieldCategoryIcons', '{"Tag Information":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '58EEFDB7-DEDF-4641-B050-5FF356ABE791'
         

/* Set categories for 8 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '472B3DE6-7180-48CB-8C29-D5BEE0ECF800'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Group Visit',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8BF4F8D0-136B-48C7-BB1D-E82F37974B28'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E8925F78-C633-4D9F-880B-D1687F78248A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payment Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Amount Paid',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFC438FB-AF3D-4FF5-BC4C-8822E4B1C807'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D2D16A71-23EE-435D-8291-C671E7BC1AF8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0B529181-7F46-4E65-BA59-033BCBE589A8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Group Visit Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF6843C7-0B4E-4082-B1C0-CB8BB9001D94'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Participant Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7981665-4E9B-4E9F-B88F-025381163E7B'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-users */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-users',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '45C7A728-8FF5-428D-A514-268C9B94C9E9'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('15c37d45-4423-43d6-a607-51a697ec0b47', '45C7A728-8FF5-428D-A514-268C9B94C9E9', 'FieldCategoryInfo', '{"Participant Details":{"icon":"fa fa-user-friends","description":"Identifiers and display names for the group visit and its participating members"},"Payment Information":{"icon":"fa fa-dollar-sign","description":"Financial contribution made by a member for a specific group visit"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields including primary key and timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ab7cbe49-7feb-4d81-90d6-137a564c85c0', '45C7A728-8FF5-428D-A514-268C9B94C9E9', 'FieldCategoryIcons', '{"Participant Details":"fa fa-user-friends","Payment Information":"fa fa-dollar-sign","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: junction, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '45C7A728-8FF5-428D-A514-268C9B94C9E9'
         

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '57A3B1DF-D539-4E45-9A58-BC9EDA726BA1'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '57A3B1DF-D539-4E45-9A58-BC9EDA726BA1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AC330C4C-A7E7-4C26-B06F-DC1D15FEF29B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '42074686-BE50-46FB-BF25-8232A8868D44'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '51DDD2F8-AE71-4372-A5E1-2596C89CB2D3'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F64F9057-059A-4574-BBD7-2B36BBFDCD43'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C1098FBF-E746-4E04-91C5-2BC4D5EAAB53'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '57A3B1DF-D539-4E45-9A58-BC9EDA726BA1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AC330C4C-A7E7-4C26-B06F-DC1D15FEF29B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '42074686-BE50-46FB-BF25-8232A8868D44'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4B1A9FBC-5B34-4AFC-A14D-0D77149E2A9C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '51DDD2F8-AE71-4372-A5E1-2596C89CB2D3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F64F9057-059A-4574-BBD7-2B36BBFDCD43'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C1098FBF-E746-4E04-91C5-2BC4D5EAAB53'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'A72FFA2F-19F6-4E46-AABB-9187914C7837'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '48880851-6284-4DFE-8799-2495684DF904'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F17C4E2C-5379-4867-BBF1-69700A4C50C0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0E6E40D4-06E7-428D-AE37-B8F7392F3E6C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A72FFA2F-19F6-4E46-AABB-9187914C7837'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '28D09491-3DC7-4780-9342-DC9537AD46BD'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '48880851-6284-4DFE-8799-2495684DF904'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F17C4E2C-5379-4867-BBF1-69700A4C50C0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A72FFA2F-19F6-4E46-AABB-9187914C7837'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '28D09491-3DC7-4780-9342-DC9537AD46BD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'A343FAB9-3919-4825-ABCE-6E9C3D72D915'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7C34054E-025F-4028-AC07-EE5F7B20549A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '64138797-83CF-4DEB-A276-CECA02E57680'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '557E97BD-F360-4D1C-822F-5141D2424201'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A343FAB9-3919-4825-ABCE-6E9C3D72D915'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9009BA5A-9F0E-4646-8571-F335645A72C6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A343FAB9-3919-4825-ABCE-6E9C3D72D915'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9009BA5A-9F0E-4646-8571-F335645A72C6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '444539E9-025A-4493-BCED-8F4B50A5562B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9FA46A94-8EF8-4248-A03A-123AD5E4E8D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B116731-27B9-48FD-BD62-EC4CD0F22663'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '77F14C37-83FB-4929-977C-F069A6B70DDC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A72FFA2F-19F6-4E46-AABB-9187914C7837'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BE802647-F3AD-4589-95B9-C7CDBFD04390'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Associations',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '28D09491-3DC7-4780-9342-DC9537AD46BD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Wishlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48880851-6284-4DFE-8799-2495684DF904'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Wishlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Suggested By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F17C4E2C-5379-4867-BBF1-69700A4C50C0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Wishlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5975796-C9C4-4936-8381-7C01D59FF038'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Wishlist Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Added Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0E6E40D4-06E7-428D-AE37-B8F7392F3E6C'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-heart */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-heart',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('872b1271-8968-47d2-b993-36b64ad43187', '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', 'FieldCategoryInfo', '{"Wishlist Details":{"icon":"fa fa-list-alt","description":"Core wishlist information such as priority, suggestion source, notes, and date added"},"Associations":{"icon":"fa fa-link","description":"Links each wishlist entry to its restaurant and the member who added it"},"System Metadata":{"icon":"fa fa-cog","description":"Audit timestamps and record identifier for system tracking"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('423aaeae-a562-4254-ad14-80c9a6e1b480', '9BDE7A5F-4E97-4D6A-A936-921915E58D0A', 'FieldCategoryIcons', '{"Wishlist Details":"fa fa-list-alt","Associations":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '9BDE7A5F-4E97-4D6A-A936-921915E58D0A'
         

/* Set categories for 16 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C8E1C36-F94F-405D-A7DA-6A8DAE1C6CAB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restaurant Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '57A3B1DF-D539-4E45-9A58-BC9EDA726BA1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restaurant Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cuisine Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52B24BE7-25F5-4085-91F2-5F32C6E7BA3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restaurant Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Cuisine',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C1098FBF-E746-4E04-91C5-2BC4D5EAAB53'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restaurant Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Price Range',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64F9057-059A-4574-BBD7-2B36BBFDCD43'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restaurant Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Hours of Operation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4A58D7F7-C6C0-4882-8AE4-D1E0AFFB4CE2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restaurant Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Phone',
       ExtendedType = 'Tel',
       CodeType = NULL
   WHERE ID = '51DDD2F8-AE71-4372-A5E1-2596C89CB2D3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Restaurant Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Website',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = 'BA24A7C3-5D39-4E3A-9EDC-CEBC42642B2B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Street Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '83F51807-E5E1-4340-A077-A79BC6687B94'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'City',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AC330C4C-A7E7-4C26-B06F-DC1D15FEF29B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'State',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '42074686-BE50-46FB-BF25-8232A8868D44'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'ZIP Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B1A9FBC-5B34-4AFC-A14D-0D77149E2A9C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Latitude',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37D365E5-1CDA-4FF0-B476-D5B9FE3DCFDF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Location Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Longitude',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD69FAC2-CB4B-4F46-9E45-1C265F00EA5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '36D73FA4-571F-4A60-9776-E0B50AB2E177'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '428C4110-392D-4D1C-B79B-75B10CD65CEF'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-utensils */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-utensils',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '18899CF5-2B81-4A29-AABF-614E5270DC09'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d89c62f7-4fc7-4c44-b9e6-68c74ab19858', '18899CF5-2B81-4A29-AABF-614E5270DC09', 'FieldCategoryInfo', '{"Restaurant Overview":{"icon":"fa fa-utensils","description":"Key identifying and descriptive information about the restaurant, including name, cuisine, price, hours, and contact links."},"Location Details":{"icon":"fa fa-map-marker-alt","description":"Physical address and geolocation data used for mapping and navigation."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields that track record creation and updates."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1781c189-1082-43f0-b447-58b3c6e0e60d', '18899CF5-2B81-4A29-AABF-614E5270DC09', 'FieldCategoryIcons', '{"Restaurant Overview":"fa fa-utensils","Location Details":"fa fa-map-marker-alt","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '18899CF5-2B81-4A29-AABF-614E5270DC09'
         

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Visit ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13E4EB4E-1CCB-411D-AEE2-FE207FE45056'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC6233F9-BBA1-42C3-8DF9-2431AED45D26'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D276DA7-17DE-431B-95F1-E1D14EA5D4E0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Visit Date',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C34054E-025F-4028-AC07-EE5F7B20549A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review & Feedback',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rating',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64138797-83CF-4DEB-A276-CECA02E57680'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review & Feedback',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7198E474-253A-4809-A991-E9A2172CDD66'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review & Feedback',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dishes Ordered',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '41A26F0A-4F16-4D6C-BAC3-03DD4797750B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review & Feedback',
       GeneratedFormSection = 'Category',
       DisplayName = 'Would Return',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '557E97BD-F360-4D1C-822F-5141D2424201'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Review & Feedback',
       GeneratedFormSection = 'Category',
       DisplayName = 'Photo URLs',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = 'A190779E-4A96-4405-B7F4-78450ECD4E41'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CFA712CD-14B1-481D-A8EF-1DF64733445A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '884DB08A-826E-47AB-B60C-048ED7BBE5AE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Restaurant Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A343FAB9-3919-4825-ABCE-6E9C3D72D915'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Visit Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Member Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9009BA5A-9F0E-4646-8571-F335645A72C6'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-utensils */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-utensils',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('197119c2-04a3-40fb-8c59-05860699fc69', '9A80839C-DE94-4F55-AC0E-2CFD9265984B', 'FieldCategoryInfo', '{"Visit Information":{"icon":"fa fa-calendar","description":"Core details of the restaurant visit including date, restaurant, and member"},"Review & Feedback":{"icon":"fa fa-comment","description":"Ratings, comments, dishes ordered, return intention, and photos provided by the member"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking record creation and modification"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3859e9d4-c4ac-4338-9951-6a667d7a0036', '9A80839C-DE94-4F55-AC0E-2CFD9265984B', 'FieldCategoryIcons', '{"Visit Information":"fa fa-calendar","Review & Feedback":"fa fa-comment","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '9A80839C-DE94-4F55-AC0E-2CFD9265984B'
         

/* Generated Validation Functions for Group Visits */
-- CHECK constraint for Group Visits: Field: GroupRating was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([GroupRating]>=(1) AND [GroupRating]<=(5))', 'public ValidateGroupRatingRange(result: ValidationResult) {
	if (this.GroupRating != null && (this.GroupRating < 1 || this.GroupRating > 5)) {
		result.Errors.push(new ValidationErrorInfo(
			"GroupRating",
			"Group rating must be a whole number between 1 and 5.",
			this.GroupRating,
			ValidationErrorType.Failure
		));
	}
}', 'If a group rating is entered, it must be a whole number between 1 and 5, ensuring ratings stay within the allowed scale.', 'ValidateGroupRatingRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'BD77447E-1927-4D65-945E-6312AB5FE903');
  
            

/* Generated Validation Functions for Restaurant Visits */
-- CHECK constraint for Restaurant Visits: Field: Rating was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([Rating]>=(1) AND [Rating]<=(5))', 'public ValidateRatingRange(result: ValidationResult) {
	// If a rating is provided, it must be between 1 and 5 inclusive
	if (this.Rating != null && (this.Rating < 1 || this.Rating > 5)) {
		result.Errors.push(new ValidationErrorInfo(
			"Rating",
			"Rating must be between 1 and 5.",
			this.Rating,
			ValidationErrorType.Failure
		));
	}
}', 'Rating must be a value from 1 to 5 if a rating is provided. This ensures that every recorded rating stays within the allowed 1‑to‑5 scale.', 'ValidateRatingRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '64138797-83CF-4DEB-A276-CECA02E57680');
  
            

