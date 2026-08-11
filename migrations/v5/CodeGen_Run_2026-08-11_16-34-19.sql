/* SQL generated to create new entity Shelters */

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
         '7e53957b-4697-4b59-8ec3-348fde76fe3b',
         'Shelters',
         NULL,
         'A physical shelter location that houses dogs. Root entity of the DogShelter demo schema - staff and dogs both belong to exactly one shelter.',
         NULL,
         'Shelter',
         'vwShelters',
         'DogShelter',
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

/* SQL generated to create new application DogShelter */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[Application] WHERE [ID] = 'bb6bdff2-618b-4f17-a533-b814508e295c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath, DefaultForNewUser)
                       VALUES ('bb6bdff2-618b-4f17-a533-b814508e295c', 'DogShelter', 'Generated for schema', 'DogShelter', 'dogshelter', 1, 0)
   END;

/* Adding role UI to application DogShelter */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = 'bb6bdff2-618b-4f17-a533-b814508e295c' AND [RoleID] = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('bb6bdff2-618b-4f17-a533-b814508e295c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0)
   END;

/* Adding role Developer to application DogShelter */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = 'bb6bdff2-618b-4f17-a533-b814508e295c' AND [RoleID] = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('bb6bdff2-618b-4f17-a533-b814508e295c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1)
   END;

/* Adding role Integration to application DogShelter */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = 'bb6bdff2-618b-4f17-a533-b814508e295c' AND [RoleID] = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('bb6bdff2-618b-4f17-a533-b814508e295c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0)
   END;

/* SQL generated to add new entity Shelters to application ID: 'bb6bdff2-618b-4f17-a533-b814508e295c' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('bb6bdff2-618b-4f17-a533-b814508e295c', '7e53957b-4697-4b59-8ec3-348fde76fe3b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'bb6bdff2-618b-4f17-a533-b814508e295c'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Shelters for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7e53957b-4697-4b59-8ec3-348fde76fe3b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Shelters for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7e53957b-4697-4b59-8ec3-348fde76fe3b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Shelters for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('7e53957b-4697-4b59-8ec3-348fde76fe3b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Breeds */

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
         '922eb6bc-2a84-41e0-9f3b-db7107eaff55',
         'Breeds',
         NULL,
         'Reference list of dog breeds with typical size, energy, and grooming characteristics. Referenced twice by Dog - once as primary breed and once as secondary breed for mixes.',
         NULL,
         'Breed',
         'vwBreeds',
         'DogShelter',
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

/* SQL generated to add new entity Breeds to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', '922eb6bc-2a84-41e0-9f3b-db7107eaff55', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Breeds for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('922eb6bc-2a84-41e0-9f3b-db7107eaff55', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Breeds for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('922eb6bc-2a84-41e0-9f3b-db7107eaff55', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Breeds for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('922eb6bc-2a84-41e0-9f3b-db7107eaff55', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Staffs */

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
         'f476381c-dfda-4e8b-b1b5-6250297de5af',
         'Staffs',
         NULL,
         'Shelter employees and volunteers. Self-referencing through SupervisorID to form a reporting hierarchy.',
         NULL,
         'Staff',
         'vwStaffs',
         'DogShelter',
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

/* SQL generated to add new entity Staffs to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', 'f476381c-dfda-4e8b-b1b5-6250297de5af', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Staffs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f476381c-dfda-4e8b-b1b5-6250297de5af', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Staffs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f476381c-dfda-4e8b-b1b5-6250297de5af', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Staffs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f476381c-dfda-4e8b-b1b5-6250297de5af', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Adopters */

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
         'd086ba6a-7162-4bde-a4e3-e9af8f3e1b7b',
         'Adopters',
         NULL,
         'People who adopt or foster dogs. The same person can appear on adoption applications and on foster placements, which is why Dog and Adopter have two distinct relationships to each other.',
         NULL,
         'Adopter',
         'vwAdopters',
         'DogShelter',
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

/* SQL generated to add new entity Adopters to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', 'd086ba6a-7162-4bde-a4e3-e9af8f3e1b7b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Adopters for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d086ba6a-7162-4bde-a4e3-e9af8f3e1b7b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Adopters for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d086ba6a-7162-4bde-a4e3-e9af8f3e1b7b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Adopters for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d086ba6a-7162-4bde-a4e3-e9af8f3e1b7b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Traits */

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
         '6e47b7b2-7a99-499e-ba4a-83af20b1aa2c',
         'Traits',
         NULL,
         'Controlled vocabulary of behavioral and care tags that can be applied to dogs through the DogTrait junction table.',
         NULL,
         'Trait',
         'vwTraits',
         'DogShelter',
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

/* SQL generated to add new entity Traits to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', '6e47b7b2-7a99-499e-ba4a-83af20b1aa2c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Traits for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6e47b7b2-7a99-499e-ba4a-83af20b1aa2c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Traits for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6e47b7b2-7a99-499e-ba4a-83af20b1aa2c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Traits for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6e47b7b2-7a99-499e-ba4a-83af20b1aa2c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Dogs */

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
         'fcd6413f-411a-4b50-9d31-82c271aea652',
         'Dogs',
         NULL,
         'The central entity of the shelter. One row per dog in the care of the organization, past or present. A dog stays in this table after adoption - Status and OutcomeDate record what happened rather than the row being deleted.',
         NULL,
         'Dog',
         'vwDogs',
         'DogShelter',
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

/* SQL generated to add new entity Dogs to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', 'fcd6413f-411a-4b50-9d31-82c271aea652', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Dogs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fcd6413f-411a-4b50-9d31-82c271aea652', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Dogs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fcd6413f-411a-4b50-9d31-82c271aea652', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Dogs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('fcd6413f-411a-4b50-9d31-82c271aea652', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Adoption Applications */

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
         'd2aa9349-07e7-4c1d-b03c-2dfa4a00fdb7',
         'Adoption Applications',
         NULL,
         'An application by one adopter to adopt one dog, with the review workflow attached. This is the FIRST of two many-to-many relationships between Dog and Adopter; the other is FosterPlacement.',
         NULL,
         'AdoptionApplication',
         'vwAdoptionApplications',
         'DogShelter',
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

/* SQL generated to add new entity Adoption Applications to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', 'd2aa9349-07e7-4c1d-b03c-2dfa4a00fdb7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Adoption Applications for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d2aa9349-07e7-4c1d-b03c-2dfa4a00fdb7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Adoption Applications for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d2aa9349-07e7-4c1d-b03c-2dfa4a00fdb7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Adoption Applications for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d2aa9349-07e7-4c1d-b03c-2dfa4a00fdb7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Foster Placements */

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
         '55903600-d02d-4e83-8614-3d989df836a8',
         'Foster Placements',
         NULL,
         'A temporary placement of a dog in a foster home. This is the SECOND many-to-many relationship between Dog and Adopter, which is why each of those entities ends up with two related-record tabs pointing at the other.',
         NULL,
         'FosterPlacement',
         'vwFosterPlacements',
         'DogShelter',
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

/* SQL generated to add new entity Foster Placements to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', '55903600-d02d-4e83-8614-3d989df836a8', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Foster Placements for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('55903600-d02d-4e83-8614-3d989df836a8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Foster Placements for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('55903600-d02d-4e83-8614-3d989df836a8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Foster Placements for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('55903600-d02d-4e83-8614-3d989df836a8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Medical Records */

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
         'bb0dba63-9e3e-4327-84df-a0f33a8cb8b7',
         'Medical Records',
         NULL,
         'One entry in the medical history of a dog. Many rows per dog, forming a timeline from intake exam through vaccinations and any surgery.',
         NULL,
         'MedicalRecord',
         'vwMedicalRecords',
         'DogShelter',
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

/* SQL generated to add new entity Medical Records to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', 'bb0dba63-9e3e-4327-84df-a0f33a8cb8b7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Medical Records for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bb0dba63-9e3e-4327-84df-a0f33a8cb8b7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Medical Records for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bb0dba63-9e3e-4327-84df-a0f33a8cb8b7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Medical Records for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bb0dba63-9e3e-4327-84df-a0f33a8cb8b7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Dog Traits */

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
         '8ba0cca7-35c1-4482-adfd-2285d3cebde8',
         'Dog Traits',
         NULL,
         'PURE JUNCTION TABLE joining Dog and Trait. Each row means one dog has been tagged with one trait. The unique constraint on DogID plus TraitID prevents the same tag being applied twice.',
         NULL,
         'DogTrait',
         'vwDogTraits',
         'DogShelter',
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

/* SQL generated to add new entity Dog Traits to application ID: 'BB6BDFF2-618B-4F17-A533-B814508E295C' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BB6BDFF2-618B-4F17-A533-B814508E295C', '8ba0cca7-35c1-4482-adfd-2285d3cebde8', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BB6BDFF2-618B-4F17-A533-B814508E295C'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Dog Traits for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8ba0cca7-35c1-4482-adfd-2285d3cebde8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Dog Traits for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8ba0cca7-35c1-4482-adfd-2285d3cebde8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Dog Traits for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8ba0cca7-35c1-4482-adfd-2285d3cebde8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.DogTrait */
ALTER TABLE [DogShelter].[DogTrait] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.DogTrait */
UPDATE [DogShelter].[DogTrait] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.DogTrait */
ALTER TABLE [DogShelter].[DogTrait] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.DogTrait */
ALTER TABLE [DogShelter].[DogTrait] ADD CONSTRAINT [DF_DogShelter_DogTrait___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.DogTrait */
ALTER TABLE [DogShelter].[DogTrait] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.DogTrait */
UPDATE [DogShelter].[DogTrait] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.DogTrait */
ALTER TABLE [DogShelter].[DogTrait] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.DogTrait */
ALTER TABLE [DogShelter].[DogTrait] ADD CONSTRAINT [DF_DogShelter_DogTrait___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.AdoptionApplication */
ALTER TABLE [DogShelter].[AdoptionApplication] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.AdoptionApplication */
UPDATE [DogShelter].[AdoptionApplication] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.AdoptionApplication */
ALTER TABLE [DogShelter].[AdoptionApplication] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.AdoptionApplication */
ALTER TABLE [DogShelter].[AdoptionApplication] ADD CONSTRAINT [DF_DogShelter_AdoptionApplication___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.AdoptionApplication */
ALTER TABLE [DogShelter].[AdoptionApplication] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.AdoptionApplication */
UPDATE [DogShelter].[AdoptionApplication] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.AdoptionApplication */
ALTER TABLE [DogShelter].[AdoptionApplication] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.AdoptionApplication */
ALTER TABLE [DogShelter].[AdoptionApplication] ADD CONSTRAINT [DF_DogShelter_AdoptionApplication___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Shelter */
ALTER TABLE [DogShelter].[Shelter] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Shelter */
UPDATE [DogShelter].[Shelter] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Shelter */
ALTER TABLE [DogShelter].[Shelter] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Shelter */
ALTER TABLE [DogShelter].[Shelter] ADD CONSTRAINT [DF_DogShelter_Shelter___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Shelter */
ALTER TABLE [DogShelter].[Shelter] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Shelter */
UPDATE [DogShelter].[Shelter] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Shelter */
ALTER TABLE [DogShelter].[Shelter] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Shelter */
ALTER TABLE [DogShelter].[Shelter] ADD CONSTRAINT [DF_DogShelter_Shelter___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.FosterPlacement */
ALTER TABLE [DogShelter].[FosterPlacement] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.FosterPlacement */
UPDATE [DogShelter].[FosterPlacement] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.FosterPlacement */
ALTER TABLE [DogShelter].[FosterPlacement] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.FosterPlacement */
ALTER TABLE [DogShelter].[FosterPlacement] ADD CONSTRAINT [DF_DogShelter_FosterPlacement___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.FosterPlacement */
ALTER TABLE [DogShelter].[FosterPlacement] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.FosterPlacement */
UPDATE [DogShelter].[FosterPlacement] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.FosterPlacement */
ALTER TABLE [DogShelter].[FosterPlacement] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.FosterPlacement */
ALTER TABLE [DogShelter].[FosterPlacement] ADD CONSTRAINT [DF_DogShelter_FosterPlacement___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Staff */
ALTER TABLE [DogShelter].[Staff] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Staff */
UPDATE [DogShelter].[Staff] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Staff */
ALTER TABLE [DogShelter].[Staff] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Staff */
ALTER TABLE [DogShelter].[Staff] ADD CONSTRAINT [DF_DogShelter_Staff___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Staff */
ALTER TABLE [DogShelter].[Staff] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Staff */
UPDATE [DogShelter].[Staff] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Staff */
ALTER TABLE [DogShelter].[Staff] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Staff */
ALTER TABLE [DogShelter].[Staff] ADD CONSTRAINT [DF_DogShelter_Staff___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Dog */
ALTER TABLE [DogShelter].[Dog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Dog */
UPDATE [DogShelter].[Dog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Dog */
ALTER TABLE [DogShelter].[Dog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Dog */
ALTER TABLE [DogShelter].[Dog] ADD CONSTRAINT [DF_DogShelter_Dog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Dog */
ALTER TABLE [DogShelter].[Dog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Dog */
UPDATE [DogShelter].[Dog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Dog */
ALTER TABLE [DogShelter].[Dog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Dog */
ALTER TABLE [DogShelter].[Dog] ADD CONSTRAINT [DF_DogShelter_Dog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Trait */
ALTER TABLE [DogShelter].[Trait] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Trait */
UPDATE [DogShelter].[Trait] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Trait */
ALTER TABLE [DogShelter].[Trait] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Trait */
ALTER TABLE [DogShelter].[Trait] ADD CONSTRAINT [DF_DogShelter_Trait___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Trait */
ALTER TABLE [DogShelter].[Trait] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Trait */
UPDATE [DogShelter].[Trait] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Trait */
ALTER TABLE [DogShelter].[Trait] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Trait */
ALTER TABLE [DogShelter].[Trait] ADD CONSTRAINT [DF_DogShelter_Trait___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.MedicalRecord */
ALTER TABLE [DogShelter].[MedicalRecord] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.MedicalRecord */
UPDATE [DogShelter].[MedicalRecord] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.MedicalRecord */
ALTER TABLE [DogShelter].[MedicalRecord] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.MedicalRecord */
ALTER TABLE [DogShelter].[MedicalRecord] ADD CONSTRAINT [DF_DogShelter_MedicalRecord___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.MedicalRecord */
ALTER TABLE [DogShelter].[MedicalRecord] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.MedicalRecord */
UPDATE [DogShelter].[MedicalRecord] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.MedicalRecord */
ALTER TABLE [DogShelter].[MedicalRecord] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.MedicalRecord */
ALTER TABLE [DogShelter].[MedicalRecord] ADD CONSTRAINT [DF_DogShelter_MedicalRecord___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Breed */
ALTER TABLE [DogShelter].[Breed] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Breed */
UPDATE [DogShelter].[Breed] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Breed */
ALTER TABLE [DogShelter].[Breed] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Breed */
ALTER TABLE [DogShelter].[Breed] ADD CONSTRAINT [DF_DogShelter_Breed___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Breed */
ALTER TABLE [DogShelter].[Breed] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Breed */
UPDATE [DogShelter].[Breed] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Breed */
ALTER TABLE [DogShelter].[Breed] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Breed */
ALTER TABLE [DogShelter].[Breed] ADD CONSTRAINT [DF_DogShelter_Breed___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Adopter */
ALTER TABLE [DogShelter].[Adopter] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Adopter */
UPDATE [DogShelter].[Adopter] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Adopter */
ALTER TABLE [DogShelter].[Adopter] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity DogShelter.Adopter */
ALTER TABLE [DogShelter].[Adopter] ADD CONSTRAINT [DF_DogShelter_Adopter___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Adopter */
ALTER TABLE [DogShelter].[Adopter] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Adopter */
UPDATE [DogShelter].[Adopter] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Adopter */
ALTER TABLE [DogShelter].[Adopter] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity DogShelter.Adopter */
ALTER TABLE [DogShelter].[Adopter] ADD CONSTRAINT [DF_DogShelter_Adopter___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 132 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '47e8b615-4e74-4868-99f6-cee9f0c8394b' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'ID')) BEGIN
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
            '47e8b615-4e74-4868-99f6-cee9f0c8394b',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 1,
            'ID',
            'ID',
            'Unique identifier for the dog-trait assignment.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1607eeaa-f6d8-4e2c-8d50-bb6e214a33b0' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'DogID')) BEGIN
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
            '1607eeaa-f6d8-4e2c-8d50-bb6e214a33b0',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 2,
            'DogID',
            'Dog ID',
            'The dog being tagged.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'FCD6413F-411A-4B50-9D31-82C271AEA652',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a3ec8fd-6627-4e1c-8fcc-c0475644e7d0' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'TraitID')) BEGIN
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
            '8a3ec8fd-6627-4e1c-8fcc-c0475644e7d0',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 3,
            'TraitID',
            'Trait ID',
            'The trait being applied.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '034525f7-8550-4842-ba83-936eea410415' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'AssignedByStaffID')) BEGIN
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
            '034525f7-8550-4842-ba83-936eea410415',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 4,
            'AssignedByStaffID',
            'Assigned By Staff ID',
            'The staff member who observed and recorded the trait.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21cfe73b-5382-4166-9ad0-bfbc15103a23' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'AssignedAt')) BEGIN
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
            '21cfe73b-5382-4166-9ad0-bfbc15103a23',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 5,
            'AssignedAt',
            'Assigned At',
            'When the trait was assigned.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee0708de-3424-4a51-b3b5-022ca423a0fc' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'Notes')) BEGIN
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
            'ee0708de-3424-4a51-b3b5-022ca423a0fc',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 6,
            'Notes',
            'Notes',
            'Context for the tag, for example the specific situation where the behavior was observed.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34d274fa-9d5d-49e0-b895-e8df8f398f23' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = '__mj_CreatedAt')) BEGIN
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
            '34d274fa-9d5d-49e0-b895-e8df8f398f23',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b549aef-4878-418b-9bcd-e7cdad3e5999' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '8b549aef-4878-418b-9bcd-e7cdad3e5999',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 8,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ad9f802-e347-469f-8463-32e91edf513b' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'ID')) BEGIN
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
            '4ad9f802-e347-469f-8463-32e91edf513b',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 1,
            'ID',
            'ID',
            'Unique identifier for the application.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93c2b8c4-734b-4e55-a3a2-fbf6fb2b52d5' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'DogID')) BEGIN
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
            '93c2b8c4-734b-4e55-a3a2-fbf6fb2b52d5',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 2,
            'DogID',
            'Dog ID',
            'The dog being applied for. A dog can receive several competing applications.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'FCD6413F-411A-4B50-9D31-82C271AEA652',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e800a2ec-0941-4242-9226-78072855a718' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'AdopterID')) BEGIN
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
            'e800a2ec-0941-4242-9226-78072855a718',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 3,
            'AdopterID',
            'Adopter ID',
            'The person applying.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7863a449-ed62-4ec5-bfa0-8ba562b7f59c' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'SubmittedAt')) BEGIN
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
            '7863a449-ed62-4ec5-bfa0-8ba562b7f59c',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 4,
            'SubmittedAt',
            'Submitted At',
            'When the application was submitted.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc6188bf-960a-41e9-9c0f-68ac876b3ed9' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'Status')) BEGIN
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
            'cc6188bf-960a-41e9-9c0f-68ac876b3ed9',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 5,
            'Status',
            'Status',
            'Workflow state. One of: Submitted, Under Review, Approved, Denied, Withdrawn, Completed. Completed means the adoption actually happened and AdoptionDate is set.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'Submitted',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bef2939-5e24-4cfb-aa8f-a08a59197451' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'ReviewedByStaffID')) BEGIN
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
            '7bef2939-5e24-4cfb-aa8f-a08a59197451',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 6,
            'ReviewedByStaffID',
            'Reviewed By Staff ID',
            'The staff member who reviewed the application, normally an Adoption Counselor. NULL while the application is still unreviewed.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a1977d6-f366-420d-983a-252b5007f184' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'ReviewedAt')) BEGIN
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
            '2a1977d6-f366-420d-983a-252b5007f184',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 7,
            'ReviewedAt',
            'Reviewed At',
            'When the review decision was recorded.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '55654386-d8df-49ac-b392-de031ad1e2ab' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'HomeVisitDate')) BEGIN
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
            '55654386-d8df-49ac-b392-de031ad1e2ab',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 8,
            'HomeVisitDate',
            'Home Visit Date',
            'Date of the in-home visit, where the process requires one.',
            'date',
            3,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0b68c3c6-3d52-40cc-af41-b59cb98b648a' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'DecisionNotes')) BEGIN
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
            '0b68c3c6-3d52-40cc-af41-b59cb98b648a',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 9,
            'DecisionNotes',
            'Decision Notes',
            'Staff rationale for the approval or denial.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '207f6cdc-3c84-4657-9edc-cee485541ea4' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'AdoptionDate')) BEGIN
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
            '207f6cdc-3c84-4657-9edc-cee485541ea4',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 10,
            'AdoptionDate',
            'Adoption Date',
            'Date the adoption was finalized. Set only on Completed applications and matches the OutcomeDate on the dog.',
            'date',
            3,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2097ea3f-2791-44bd-a783-97dc5f23b836' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'FeePaid')) BEGIN
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
            '2097ea3f-2791-44bd-a783-97dc5f23b836',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 11,
            'FeePaid',
            'Fee Paid',
            'Adoption fee actually collected, which may differ from the listed fee after a waiver or promotion.',
            'decimal',
            9,
            10,
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4769ea7f-a6f0-430e-bc65-740a3e47c782' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4769ea7f-a6f0-430e-bc65-740a3e47c782',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 12,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1bf9c770-ad75-45b1-bb68-38b7474d1f29' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '1bf9c770-ad75-45b1-bb68-38b7474d1f29',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 13,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a03179d6-c522-46be-8c25-c2124502c2e9' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'ID')) BEGIN
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
            'a03179d6-c522-46be-8c25-c2124502c2e9',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 1,
            'ID',
            'ID',
            'Unique identifier for the shelter location.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b963be29-f669-488d-90b5-086734e7199a' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'Name')) BEGIN
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
            'b963be29-f669-488d-90b5-086734e7199a',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 2,
            'Name',
            'Name',
            'Public-facing name of the shelter. Unique across all locations.',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '675f10b1-46c6-4096-b8f7-c5c02cd03e7d' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'AddressLine1')) BEGIN
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
            '675f10b1-46c6-4096-b8f7-c5c02cd03e7d',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 3,
            'AddressLine1',
            'Address Line 1',
            'Street address of the shelter.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a778da8d-fc3b-4a2a-9de9-9652733f507f' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'City')) BEGIN
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
            'a778da8d-fc3b-4a2a-9de9-9652733f507f',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 4,
            'City',
            'City',
            'City where the shelter is located.',
            'nvarchar',
            200,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44b660cd-ad0f-47bc-af51-2801c3cc5027' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'State')) BEGIN
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
            '44b660cd-ad0f-47bc-af51-2801c3cc5027',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 5,
            'State',
            'State',
            'State or province where the shelter is located.',
            'nvarchar',
            100,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '877aeecf-53e7-4a64-8c49-4ae6295e9606' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'PostalCode')) BEGIN
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
            '877aeecf-53e7-4a64-8c49-4ae6295e9606',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 6,
            'PostalCode',
            'Postal Code',
            'Postal or ZIP code of the shelter address.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63a906ae-49b2-4007-8e56-3d1a9306d927' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'Phone')) BEGIN
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
            '63a906ae-49b2-4007-8e56-3d1a9306d927',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 7,
            'Phone',
            'Phone',
            'Main public phone number for adoption inquiries.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e4cfa6d8-b5cc-4660-9f60-30db91935df0' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'Email')) BEGIN
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
            'e4cfa6d8-b5cc-4660-9f60-30db91935df0',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 8,
            'Email',
            'Email',
            'General contact email address for the shelter.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48cda013-b588-481d-a3b1-636d17cdc40e' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'KennelCapacity')) BEGIN
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
            '48cda013-b588-481d-a3b1-636d17cdc40e',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 9,
            'KennelCapacity',
            'Kennel Capacity',
            'Maximum number of dogs the shelter can physically house at one time. Used as the denominator when calculating occupancy.',
            'int',
            4,
            10,
            0,
            0,
            '(40)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e027e6c-fe05-495c-b6d6-2a0fe0fdd948' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'OpenedDate')) BEGIN
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
            '2e027e6c-fe05-495c-b6d6-2a0fe0fdd948',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 10,
            'OpenedDate',
            'Opened Date',
            'Date this shelter location opened.',
            'date',
            3,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4873579a-cbcd-494c-941c-ddc45c4fb68a' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = 'IsAcceptingIntakes')) BEGIN
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
            '4873579a-cbcd-494c-941c-ddc45c4fb68a',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 11,
            'IsAcceptingIntakes',
            'Is Accepting Intakes',
            'When 0, the shelter is at or over capacity and is temporarily refusing new intakes.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5398760-f593-4332-9ee6-5f7630c3f9e3' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e5398760-f593-4332-9ee6-5f7630c3f9e3',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 12,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5656926-3298-4bee-8ded-d4e55e525b7c' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'a5656926-3298-4bee-8ded-d4e55e525b7c',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 13,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b712ea9-18f3-4a46-87dd-b024c868292b' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'ID')) BEGIN
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
            '2b712ea9-18f3-4a46-87dd-b024c868292b',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 1,
            'ID',
            'ID',
            'Unique identifier for the foster placement.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc9cc857-fbef-42fb-af2a-d61e7ba8fa52' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'DogID')) BEGIN
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
            'cc9cc857-fbef-42fb-af2a-d61e7ba8fa52',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 2,
            'DogID',
            'Dog ID',
            'The dog placed in foster care.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'FCD6413F-411A-4B50-9D31-82C271AEA652',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b9fbbaa0-1dfe-4441-bd20-05da44483395' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'FosterAdopterID')) BEGIN
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
            'b9fbbaa0-1dfe-4441-bd20-05da44483395',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 3,
            'FosterAdopterID',
            'Foster Adopter ID',
            'The foster caregiver. Points at Adopter, and that person normally has IsFosterApproved = 1.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6a589bd-65e6-4c22-98e8-6f8346a6b682' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'StartDate')) BEGIN
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
            'f6a589bd-65e6-4c22-98e8-6f8346a6b682',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 4,
            'StartDate',
            'Start Date',
            'Date the dog went into the foster home.',
            'date',
            3,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51763c24-b9e6-4fe2-a694-60c2203d6aa5' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'EndDate')) BEGIN
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
            '51763c24-b9e6-4fe2-a694-60c2203d6aa5',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 5,
            'EndDate',
            'End Date',
            'Date the placement ended. NULL while the placement is still Active. Never earlier than StartDate.',
            'date',
            3,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56102c23-f258-4d60-a58f-d1d2dce99fbb' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'Status')) BEGIN
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
            '56102c23-f258-4d60-a58f-d1d2dce99fbb',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 6,
            'Status',
            'Status',
            'State of the placement. One of: Active, Completed, Ended Early. Ended Early means the placement was cut short, usually for a behavioral or medical reason.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c04c57f-0317-4685-b8da-f541f184cba8' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'Reason')) BEGIN
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
            '0c04c57f-0317-4685-b8da-f541f184cba8',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 7,
            'Reason',
            'Reason',
            'Why the dog was placed in foster care, for example post-surgery recovery or kennel stress.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8aa9dece-8685-4166-8e86-818afa86b670' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'Notes')) BEGIN
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
            '8aa9dece-8685-4166-8e86-818afa86b670',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 8,
            'Notes',
            'Notes',
            'Notes from the foster caregiver about how the dog behaves in a home.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc90a9d3-8eab-4219-a2e0-f4d35631b8fa' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = '__mj_CreatedAt')) BEGIN
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
            'dc90a9d3-8eab-4219-a2e0-f4d35631b8fa',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 9,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e0c8a34-e425-43a6-a7f0-edc59bb2f2ec' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3e0c8a34-e425-43a6-a7f0-edc59bb2f2ec',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c57b3cac-c91b-4537-811e-f16287ca4f32' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'ID')) BEGIN
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
            'c57b3cac-c91b-4537-811e-f16287ca4f32',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 1,
            'ID',
            'ID',
            'Unique identifier for the staff member.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '630b7d99-3f7e-415a-a9e4-6da651ef25ab' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'ShelterID')) BEGIN
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
            '630b7d99-3f7e-415a-a9e4-6da651ef25ab',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 2,
            'ShelterID',
            'Shelter ID',
            'The shelter location this person works at.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7efa1dd-769c-45c0-b5dc-3eef1201fe11' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'FirstName')) BEGIN
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
            'd7efa1dd-769c-45c0-b5dc-3eef1201fe11',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 3,
            'FirstName',
            'First Name',
            'Given name of the staff member.',
            'nvarchar',
            200,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b34388a0-ef51-4e2b-982c-cb52114f5d27' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'LastName')) BEGIN
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
            'b34388a0-ef51-4e2b-982c-cb52114f5d27',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 4,
            'LastName',
            'Last Name',
            'Family name of the staff member.',
            'nvarchar',
            200,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '486275ca-9e7f-44fa-b685-73b5526fa624' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'FullName')) BEGIN
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
            '486275ca-9e7f-44fa-b685-73b5526fa624',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 5,
            'FullName',
            'Full Name',
            'PERSISTED computed column: FirstName plus a space plus LastName. Read-only. Serves as the human-readable display value wherever a staff member is referenced.',
            'nvarchar',
            402,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15d0cc3a-d50b-44ad-a195-6c366b106ca0' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'Email')) BEGIN
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
            '15d0cc3a-d50b-44ad-a195-6c366b106ca0',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 6,
            'Email',
            'Email',
            'Work email address. Unique across all staff.',
            'nvarchar',
            510,
            0,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c23e0297-d40a-49a1-aaf5-5a6168fdf94b' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'Phone')) BEGIN
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
            'c23e0297-d40a-49a1-aaf5-5a6168fdf94b',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 7,
            'Phone',
            'Phone',
            'Contact phone number for the staff member.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ba3a69e-7935-4b85-9653-b2b41512a0d5' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'Role')) BEGIN
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
            '6ba3a69e-7935-4b85-9653-b2b41512a0d5',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 8,
            'Role',
            'Role',
            'Job function. One of: Shelter Manager, Adoption Counselor, Veterinarian, Vet Tech, Kennel Attendant, Volunteer Coordinator, Volunteer. Only Veterinarian and Vet Tech records appear as the vet on a medical record.',
            'nvarchar',
            100,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a52d968-929f-4f42-a846-c5dcf946beee' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'HireDate')) BEGIN
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
            '5a52d968-929f-4f42-a846-c5dcf946beee',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 9,
            'HireDate',
            'Hire Date',
            'Date the person started working or volunteering at the shelter.',
            'date',
            3,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb738ff1-80c1-43e6-80ae-ea07c2cffc9b' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'IsActive')) BEGIN
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
            'bb738ff1-80c1-43e6-80ae-ea07c2cffc9b',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 10,
            'IsActive',
            'Is Active',
            'When 0, the person no longer works at the shelter. Historical records still reference them, so rows are deactivated rather than deleted.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d0c8800-26aa-4591-b597-de850d60ebf8' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'SupervisorID')) BEGIN
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
            '0d0c8800-26aa-4591-b597-de850d60ebf8',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 11,
            'SupervisorID',
            'Supervisor ID',
            'SELF-REFERENCING foreign key to the staff member this person reports to. NULL for the shelter manager at the top of each location hierarchy.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb4871d4-bdd5-4932-aef8-c240a3b8dca9' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = '__mj_CreatedAt')) BEGIN
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
            'bb4871d4-bdd5-4932-aef8-c240a3b8dca9',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 12,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a62f8f4-4a61-4772-baaa-74d66201b26c' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '8a62f8f4-4a61-4772-baaa-74d66201b26c',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 13,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64c2d6de-eed1-4ea5-975b-d1512f663bf4' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'ID')) BEGIN
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
            '64c2d6de-eed1-4ea5-975b-d1512f663bf4',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 1,
            'ID',
            'ID',
            'Unique identifier for the dog.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '196170cc-4dd8-4e1b-87de-3f35987ca21c' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'Name')) BEGIN
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
            '196170cc-4dd8-4e1b-87de-3f35987ca21c',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 2,
            'Name',
            'Name',
            'Name the shelter uses for the dog. Assigned by staff on intake for strays.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '28ba460f-3b98-4f98-957e-1fffc5f56f3e' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'ShelterID')) BEGIN
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
            '28ba460f-3b98-4f98-957e-1fffc5f56f3e',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 3,
            'ShelterID',
            'Shelter ID',
            'The shelter location currently responsible for this dog.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b5adaf6-be94-4a18-8597-12e3ca7bfcd6' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'PrimaryBreedID')) BEGIN
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
            '5b5adaf6-be94-4a18-8597-12e3ca7bfcd6',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 4,
            'PrimaryBreedID',
            'Primary Breed ID',
            'Best-guess primary breed. One of TWO foreign keys from this table to Breed - see also SecondaryBreedID.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66e1d3ab-b606-47fd-a8c6-80d51433aabc' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'SecondaryBreedID')) BEGIN
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
            '66e1d3ab-b606-47fd-a8c6-80d51433aabc',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 5,
            'SecondaryBreedID',
            'Secondary Breed ID',
            'Second breed for a mixed-breed dog, or NULL if the dog appears purebred or the mix is unknown. The SECOND foreign key from this table to Breed. Always different from PrimaryBreedID.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8eee0752-e10a-4fd5-bcab-0521d55942c0' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'MotherID')) BEGIN
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
            '8eee0752-e10a-4fd5-bcab-0521d55942c0',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 6,
            'MotherID',
            'Mother ID',
            'SELF-REFERENCING foreign key to the mother of this dog, populated only for puppies born in shelter care. NULL for every dog that arrived from outside.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'FCD6413F-411A-4B50-9D31-82C271AEA652',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be57bf23-47dd-4267-b5e8-dc12d6cd0ad0' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'Sex')) BEGIN
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
            'be57bf23-47dd-4267-b5e8-dc12d6cd0ad0',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 7,
            'Sex',
            'Sex',
            'Sex of the dog. One of: Male, Female.',
            'nvarchar',
            20,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c29885d-78bf-4599-b6bc-ab36cf9158a8' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'EstimatedBirthDate')) BEGIN
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
            '8c29885d-78bf-4599-b6bc-ab36cf9158a8',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 8,
            'EstimatedBirthDate',
            'Estimated Birth Date',
            'Estimated date of birth. For strays this is a veterinary estimate from dentition, not a known date.',
            'date',
            3,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c7161142-6947-464c-94d4-ba8be8b2d329' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'EstimatedAgeMonths')) BEGIN
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
            'c7161142-6947-464c-94d4-ba8be8b2d329',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 9,
            'EstimatedAgeMonths',
            'Estimated Age Months',
            'COMPUTED, NOT PERSISTED: whole months between EstimatedBirthDate and today. Read-only and recalculated on every read, so it cannot be indexed.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            0,
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dd31e77-e935-4422-9512-f5570d7b62a9' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'WeightLbs')) BEGIN
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
            '1dd31e77-e935-4422-9512-f5570d7b62a9',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 10,
            'WeightLbs',
            'Weight Lbs',
            'Most recent recorded weight in pounds.',
            'decimal',
            5,
            6,
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e10ceb2d-ddb2-4440-90f4-f7f46ae679f2' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'Color')) BEGIN
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
            'e10ceb2d-ddb2-4440-90f4-f7f46ae679f2',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 11,
            'Color',
            'Color',
            'Coat color and pattern as described by staff, for example Black and White or Brindle.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6082dda7-049c-44b2-976a-b64cfe8f03ff' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'MicrochipNumber')) BEGIN
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
            '6082dda7-049c-44b2-976a-b64cfe8f03ff',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 12,
            'MicrochipNumber',
            'Microchip Number',
            'Implanted microchip number. Unique when present, NULL for dogs not yet chipped.',
            'nvarchar',
            100,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8294cbd1-08bf-4c06-b92b-bcbb310093a3' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'IntakeDate')) BEGIN
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
            '8294cbd1-08bf-4c06-b92b-bcbb310093a3',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 13,
            'IntakeDate',
            'Intake Date',
            'Date the dog entered the care of the shelter. The clock that length-of-stay is measured from.',
            'date',
            3,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73e1be99-42e2-4007-bdca-bdb82c015c6b' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'IntakeType')) BEGIN
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
            '73e1be99-42e2-4007-bdca-bdb82c015c6b',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 14,
            'IntakeType',
            'Intake Type',
            'How the dog arrived. One of: Stray, Owner Surrender, Transfer, Born In Care, Return. Return means a previously adopted dog came back.',
            'nvarchar',
            60,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09efdb84-80ae-448f-8104-b08bdc858534' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'Status')) BEGIN
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
            '09efdb84-80ae-448f-8104-b08bdc858534',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 15,
            'Status',
            'Status',
            'Current disposition. One of: Intake, Available, Pending, Fostered, Medical Hold, Adopted, Transferred. Only Available dogs are shown to the public; Pending means an approved application is in progress. Adopted and Transferred are terminal and always have an OutcomeDate.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'Intake',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea348354-f180-44a6-b0a8-f83ecdfb083b' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'OutcomeDate')) BEGIN
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
            'ea348354-f180-44a6-b0a8-f83ecdfb083b',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 16,
            'OutcomeDate',
            'Outcome Date',
            'Date the dog left the care of the shelter through adoption or transfer. NULL while the dog is still in care. Never earlier than IntakeDate.',
            'date',
            3,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eeea657b-026e-4d50-a437-45eb2ecf163d' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'DaysInCare')) BEGIN
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
            'eeea657b-026e-4d50-a437-45eb2ecf163d',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 17,
            'DaysInCare',
            'Days In Care',
            'COMPUTED, NOT PERSISTED: days between IntakeDate and OutcomeDate, or between IntakeDate and today for a dog still in care. This is the length-of-stay metric the shelter manages against.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            0,
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bde53442-d47e-4aa0-927f-c1a1917dd5b6' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'IsSpayedNeutered')) BEGIN
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
            'bde53442-d47e-4aa0-927f-c1a1917dd5b6',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 18,
            'IsSpayedNeutered',
            'Is Spayed Neutered',
            'Whether the dog has been spayed or neutered. Must be 1 before an adoption can be finalized.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bb274cca-8ae9-4600-b72a-8f9e85c280ff' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'IsHouseTrained')) BEGIN
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
            'bb274cca-8ae9-4600-b72a-8f9e85c280ff',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 19,
            'IsHouseTrained',
            'Is House Trained',
            'Whether the dog is reliably house trained.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce1cbf1e-29b9-42f4-acac-5a2ae62d519c' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'GoodWithDogs')) BEGIN
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
            'ce1cbf1e-29b9-42f4-acac-5a2ae62d519c',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 20,
            'GoodWithDogs',
            'Good With Dogs',
            'TRI-STATE: 1 = tested and does well with other dogs, 0 = tested and does not, NULL = not yet assessed. NULL is meaningfully different from 0 and must not be treated as a no.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbc30ed9-40a5-4587-b8b5-3e3869659013' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'GoodWithCats')) BEGIN
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
            'cbc30ed9-40a5-4587-b8b5-3e3869659013',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 21,
            'GoodWithCats',
            'Good With Cats',
            'TRI-STATE: 1 = tested and does well with cats, 0 = tested and does not, NULL = not yet assessed.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d8df69a-59e7-4444-9ee0-ba1a546f6316' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'GoodWithKids')) BEGIN
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
            '8d8df69a-59e7-4444-9ee0-ba1a546f6316',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 22,
            'GoodWithKids',
            'Good With Kids',
            'TRI-STATE: 1 = tested and does well with children, 0 = tested and does not, NULL = not yet assessed.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '813f71ca-3872-4762-8785-2c29bed7c4b2' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'AdoptionFee')) BEGIN
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
            '813f71ca-3872-4762-8785-2c29bed7c4b2',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 23,
            'AdoptionFee',
            'Adoption Fee',
            'Adoption fee in dollars. Typically lower for large, senior, or long-stay dogs to encourage placement.',
            'decimal',
            9,
            10,
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d2bdf98-c188-4b0c-9285-6da2659f4720' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'Bio')) BEGIN
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
            '7d2bdf98-c188-4b0c-9285-6da2659f4720',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 24,
            'Bio',
            'Bio',
            'Public-facing narrative used on the adoption listing.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '796dcbc7-51c4-4c49-9381-77a2f922f3f9' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'PhotoURL')) BEGIN
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
            '796dcbc7-51c4-4c49-9381-77a2f922f3f9',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 25,
            'PhotoURL',
            'Photo URL',
            'URL of the primary adoption listing photo.',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e574b628-8dcf-4ef5-9108-c0933e639bc0' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e574b628-8dcf-4ef5-9108-c0933e639bc0',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 26,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '503e2ff3-9933-4428-b27f-1e1be02a3b85' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '503e2ff3-9933-4428-b27f-1e1be02a3b85',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 27,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1411053-61ba-4c5b-a808-6400f767049d' OR (EntityID = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C' AND Name = 'ID')) BEGIN
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
            'c1411053-61ba-4c5b-a808-6400f767049d',
            '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', -- Entity: Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C') + 1,
            'ID',
            'ID',
            'Unique identifier for the trait.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d920d44-d2a1-473d-ad0e-2d2c0caac10d' OR (EntityID = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C' AND Name = 'Name')) BEGIN
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
            '5d920d44-d2a1-473d-ad0e-2d2c0caac10d',
            '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', -- Entity: Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C') + 2,
            'Name',
            'Name',
            'Short label shown as a tag on the dog record, for example Loves Car Rides.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f893e29-caa4-4b60-befa-70e9982321fd' OR (EntityID = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C' AND Name = 'Category')) BEGIN
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
            '2f893e29-caa4-4b60-befa-70e9982321fd',
            '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', -- Entity: Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C') + 3,
            'Category',
            'Category',
            'Grouping for the trait. One of: Temperament, Training, Special Needs, Activity.',
            'nvarchar',
            60,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e92aaa2-e75d-4e6f-908a-b748d4fb5931' OR (EntityID = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C' AND Name = 'Description')) BEGIN
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
            '2e92aaa2-e75d-4e6f-908a-b748d4fb5931',
            '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', -- Entity: Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C') + 4,
            'Description',
            'Description',
            'Explanation of what the trait means and how staff should apply it.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a1e86b8a-8e2c-4da3-9380-00a006707435' OR (EntityID = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C' AND Name = '__mj_CreatedAt')) BEGIN
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
            'a1e86b8a-8e2c-4da3-9380-00a006707435',
            '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', -- Entity: Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C') + 5,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad3e6e87-cc44-4017-975f-2243ef8f4a2f' OR (EntityID = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'ad3e6e87-cc44-4017-975f-2243ef8f4a2f',
            '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', -- Entity: Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C') + 6,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f31ae351-f826-4577-bbf2-0e330577531e' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'ID')) BEGIN
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
            'f31ae351-f826-4577-bbf2-0e330577531e',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 1,
            'ID',
            'ID',
            'Unique identifier for the medical record entry.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '672904df-ffee-4c3e-bc5f-bfb873a6df6a' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'DogID')) BEGIN
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
            '672904df-ffee-4c3e-bc5f-bfb873a6df6a',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 2,
            'DogID',
            'Dog ID',
            'The dog this record belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'FCD6413F-411A-4B50-9D31-82C271AEA652',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34f764a7-e8e5-4765-8c82-5f7bfb3ade47' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'RecordDate')) BEGIN
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
            '34f764a7-e8e5-4765-8c82-5f7bfb3ade47',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 3,
            'RecordDate',
            'Record Date',
            'Date the procedure or observation took place.',
            'date',
            3,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98870ae1-4af1-4974-8fb2-1a1c2dc43be1' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'RecordType')) BEGIN
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
            '98870ae1-4af1-4974-8fb2-1a1c2dc43be1',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 4,
            'RecordType',
            'Record Type',
            'Kind of medical event. One of: Vaccination, Exam, Surgery, Treatment, Test, Dental.',
            'nvarchar',
            60,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a55093f1-b990-4587-b3b7-992f91ea719a' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'Description')) BEGIN
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
            'a55093f1-b990-4587-b3b7-992f91ea719a',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 5,
            'Description',
            'Description',
            'Short description of what was done, for example DHPP booster or dental cleaning with two extractions.',
            'nvarchar',
            1000,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4abb5bf0-564b-4e35-8de9-1fa47bebaf03' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'VeterinarianStaffID')) BEGIN
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
            '4abb5bf0-564b-4e35-8de9-1fa47bebaf03',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 6,
            'VeterinarianStaffID',
            'Veterinarian Staff ID',
            'The Veterinarian or Vet Tech who performed the work. NULL for records entered from an outside clinic.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0401e99b-ef30-4602-9fab-627a52bc5830' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'Cost')) BEGIN
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
            '0401e99b-ef30-4602-9fab-627a52bc5830',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 7,
            'Cost',
            'Cost',
            'Cost of the procedure in dollars. Summed per dog to understand the true cost of care.',
            'decimal',
            9,
            10,
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c833434-d395-427c-8533-84554c6301e1' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'FollowUpDate')) BEGIN
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
            '1c833434-d395-427c-8533-84554c6301e1',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 8,
            'FollowUpDate',
            'Follow Up Date',
            'Date a follow-up is due, for example the next booster. NULL when no follow-up is needed.',
            'date',
            3,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ecb2cd5-4122-4e42-9d81-a5bfa13dd017' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'Notes')) BEGIN
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
            '3ecb2cd5-4122-4e42-9d81-a5bfa13dd017',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 9,
            'Notes',
            'Notes',
            'Additional clinical notes.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fcfdbaa8-44eb-452f-bebb-f81e20a1841d' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = '__mj_CreatedAt')) BEGIN
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
            'fcfdbaa8-44eb-452f-bebb-f81e20a1841d',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4bbe4762-336f-4cc9-af3b-08bccccdb1ae' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4bbe4762-336f-4cc9-af3b-08bccccdb1ae',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 11,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d90101b-ad69-4847-850b-0b58034acf06' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'ID')) BEGIN
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
            '8d90101b-ad69-4847-850b-0b58034acf06',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 1,
            'ID',
            'ID',
            'Unique identifier for the breed.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f2e660e-2f27-4cf4-9892-76931fda20f1' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'Name')) BEGIN
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
            '5f2e660e-2f27-4cf4-9892-76931fda20f1',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 2,
            'Name',
            'Name',
            'Common name of the breed, for example Labrador Retriever. Includes a Mixed Breed entry for dogs of unknown ancestry.',
            'nvarchar',
            300,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d976443-fade-42a1-8b79-2409ee702df4' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'SizeCategory')) BEGIN
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
            '1d976443-fade-42a1-8b79-2409ee702df4',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 3,
            'SizeCategory',
            'Size Category',
            'Size class of the breed. One of: Toy, Small, Medium, Large, Giant.',
            'nvarchar',
            40,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39b9b3b3-b724-4126-9ff9-067f5b35f1e1' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'TypicalWeightLbsLow')) BEGIN
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
            '39b9b3b3-b724-4126-9ff9-067f5b35f1e1',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 4,
            'TypicalWeightLbsLow',
            'Typical Weight Lbs Low',
            'Low end of the typical healthy adult weight range, in pounds.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '175ed62e-95d4-4571-a89a-011a1dceb093' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'TypicalWeightLbsHigh')) BEGIN
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
            '175ed62e-95d4-4571-a89a-011a1dceb093',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 5,
            'TypicalWeightLbsHigh',
            'Typical Weight Lbs High',
            'High end of the typical healthy adult weight range, in pounds. Always greater than or equal to TypicalWeightLbsLow.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf37004f-878a-4e35-91e4-7e4a97d8f329' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'EnergyLevel')) BEGIN
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
            'bf37004f-878a-4e35-91e4-7e4a97d8f329',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 6,
            'EnergyLevel',
            'Energy Level',
            'How much daily exercise the breed typically needs. One of: Low, Moderate, High, Very High. Adoption counselors use this to match dogs to households.',
            'nvarchar',
            40,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38387aba-abd1-46cf-8ee0-f95ea10645d1' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'GroomingNeeds')) BEGIN
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
            '38387aba-abd1-46cf-8ee0-f95ea10645d1',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 7,
            'GroomingNeeds',
            'Grooming Needs',
            'Typical grooming burden for the breed. One of: Minimal, Moderate, High.',
            'nvarchar',
            40,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cde81ab3-5420-4ec9-932f-460c0bd13e74' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'TypicalLifespanYears')) BEGIN
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
            'cde81ab3-5420-4ec9-932f-460c0bd13e74',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 8,
            'TypicalLifespanYears',
            'Typical Lifespan Years',
            'Typical lifespan of the breed in years.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa851aa1-6a6f-4630-9c63-2b1135ff0096' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = 'Description')) BEGIN
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
            'aa851aa1-6a6f-4630-9c63-2b1135ff0096',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 9,
            'Description',
            'Description',
            'Narrative description of the breed temperament and typical care needs.',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e227fe2c-af1f-43ed-b544-34dadbbb4032' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e227fe2c-af1f-43ed-b544-34dadbbb4032',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e9b596d-def0-4b56-b004-314654696992' OR (EntityID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '9e9b596d-def0-4b56-b004-314654696992',
            '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', -- Entity: Breeds
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55') + 11,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '04ba65ab-0674-44ea-8690-52c1e8cbcc56' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'ID')) BEGIN
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
            '04ba65ab-0674-44ea-8690-52c1e8cbcc56',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 1,
            'ID',
            'ID',
            'Unique identifier for the adopter.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cabab653-4426-44f0-b9e8-1949cb08d4cf' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'FirstName')) BEGIN
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
            'cabab653-4426-44f0-b9e8-1949cb08d4cf',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 2,
            'FirstName',
            'First Name',
            'Given name of the adopter.',
            'nvarchar',
            200,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6387016-8405-46c4-950c-c906835917d4' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'LastName')) BEGIN
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
            'a6387016-8405-46c4-950c-c906835917d4',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 3,
            'LastName',
            'Last Name',
            'Family name of the adopter.',
            'nvarchar',
            200,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa366156-82b3-4e66-84ec-173ef1d9f35b' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'FullName')) BEGIN
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
            'fa366156-82b3-4e66-84ec-173ef1d9f35b',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 4,
            'FullName',
            'Full Name',
            'PERSISTED computed column: FirstName plus a space plus LastName. Read-only display value.',
            'nvarchar',
            402,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcab5492-7f44-46ab-81be-10dd9d73655f' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'Email')) BEGIN
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
            'bcab5492-7f44-46ab-81be-10dd9d73655f',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 5,
            'Email',
            'Email',
            'Primary email address. Unique - the shelter uses it to detect repeat applicants.',
            'nvarchar',
            510,
            0,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40f34029-ba8e-4ba9-bd5d-e531a9ca09da' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'Phone')) BEGIN
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
            '40f34029-ba8e-4ba9-bd5d-e531a9ca09da',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 6,
            'Phone',
            'Phone',
            'Contact phone number for the adopter.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be163a74-daa3-4f03-94aa-8ef439a5da2c' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'AddressLine1')) BEGIN
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
            'be163a74-daa3-4f03-94aa-8ef439a5da2c',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 7,
            'AddressLine1',
            'Address Line 1',
            'Home street address, used for home visits.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d0d2257-78c8-4562-999b-9ba5580549d2' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'City')) BEGIN
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
            '1d0d2257-78c8-4562-999b-9ba5580549d2',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 8,
            'City',
            'City',
            'City of the adopter home address.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66890c0b-320e-40cd-9f16-451b54dd7b39' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'State')) BEGIN
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
            '66890c0b-320e-40cd-9f16-451b54dd7b39',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 9,
            'State',
            'State',
            'State or province of the adopter home address.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bcd14e2c-0728-4147-80c0-8fdf9ec09be7' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'PostalCode')) BEGIN
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
            'bcd14e2c-0728-4147-80c0-8fdf9ec09be7',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 10,
            'PostalCode',
            'Postal Code',
            'Postal or ZIP code of the adopter home address.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ce508b1-1a15-46ea-a36c-4825e817f8a9' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'HousingType')) BEGIN
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
            '6ce508b1-1a15-46ea-a36c-4825e817f8a9',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 11,
            'HousingType',
            'Housing Type',
            'Type of home. One of: House, Apartment, Condo, Townhouse, Farm. Combined with HasFencedYard when matching high-energy dogs.',
            'nvarchar',
            40,
            0,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9692af52-cc1f-4eb3-b8dd-d092bb8dbb15' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'HasFencedYard')) BEGIN
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
            '9692af52-cc1f-4eb3-b8dd-d092bb8dbb15',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 12,
            'HasFencedYard',
            'Has Fenced Yard',
            'Whether the property has a securely fenced yard. Required for some dogs.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc82b3b7-e84d-4544-96e8-ec8cee57d12d' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'HasOtherPets')) BEGIN
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
            'bc82b3b7-e84d-4544-96e8-ec8cee57d12d',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 13,
            'HasOtherPets',
            'Has Other Pets',
            'Whether the household already has other pets. Relevant to dogs flagged GoodWithDogs or GoodWithCats = 0.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e0bf7327-1c66-4f20-aed2-add90bbf74e8' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'HouseholdAdults')) BEGIN
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
            'e0bf7327-1c66-4f20-aed2-add90bbf74e8',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 14,
            'HouseholdAdults',
            'Household Adults',
            'Number of adults living in the household.',
            'int',
            4,
            10,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e28e4ec2-135a-430e-8862-560f5a2f20e9' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'HouseholdChildren')) BEGIN
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
            'e28e4ec2-135a-430e-8862-560f5a2f20e9',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 15,
            'HouseholdChildren',
            'Household Children',
            'Number of children living in the household. Relevant to dogs flagged GoodWithKids = 0.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bca9149-6e3c-42a4-9f4f-3312a0fc6e08' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'IsFosterApproved')) BEGIN
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
            '3bca9149-6e3c-42a4-9f4f-3312a0fc6e08',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 16,
            'IsFosterApproved',
            'Is Foster Approved',
            'Whether this person has completed foster training and may take foster placements.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dccf9116-a899-48eb-b319-fafde1506425' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'DateRegistered')) BEGIN
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
            'dccf9116-a899-48eb-b319-fafde1506425',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 17,
            'DateRegistered',
            'Date Registered',
            'Date the person first registered with the shelter.',
            'date',
            3,
            10,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '39cc3cef-afd6-4168-ae6a-428a19840b09' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = 'Notes')) BEGIN
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
            '39cc3cef-afd6-4168-ae6a-428a19840b09',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 18,
            'Notes',
            'Notes',
            'Free-form staff notes about the adopter.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51f1b4c7-db78-4ef1-bcb3-e1faaab3421b' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '51f1b4c7-db78-4ef1-bcb3-e1faaab3421b',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '635e5a8c-5472-4356-a972-b92460b1ce8a' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '635e5a8c-5472-4356-a972-b92460b1ce8a',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 20,
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

/* SQL text to insert entity field value with ID 999dce5c-dad6-4581-9fb1-26ef35c79d66 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('999dce5c-dad6-4581-9fb1-26ef35c79d66', '1D976443-FADE-42A1-8B79-2409EE702DF4', 1, 'Giant', 'Giant', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 549b48c3-406a-4dbf-bf2f-b38d821b3b27 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('549b48c3-406a-4dbf-bf2f-b38d821b3b27', '1D976443-FADE-42A1-8B79-2409EE702DF4', 2, 'Large', 'Large', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dbbe7184-4c84-4fff-b1c8-7d85b4466ef5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dbbe7184-4c84-4fff-b1c8-7d85b4466ef5', '1D976443-FADE-42A1-8B79-2409EE702DF4', 3, 'Medium', 'Medium', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 580ccef7-3c00-4e24-ad6b-70667b3a6144 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('580ccef7-3c00-4e24-ad6b-70667b3a6144', '1D976443-FADE-42A1-8B79-2409EE702DF4', 4, 'Small', 'Small', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 73c4ced3-ab7f-42d2-9855-cb262bfe691c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('73c4ced3-ab7f-42d2-9855-cb262bfe691c', '1D976443-FADE-42A1-8B79-2409EE702DF4', 5, 'Toy', 'Toy', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1D976443-FADE-42A1-8B79-2409EE702DF4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1D976443-FADE-42A1-8B79-2409EE702DF4';

/* SQL text to insert entity field value with ID 38d241b6-ee27-490a-ac5f-658ab3948c12 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('38d241b6-ee27-490a-ac5f-658ab3948c12', 'BF37004F-878A-4E35-91E4-7E4A97D8F329', 1, 'High', 'High', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58e26090-bc03-416d-9556-2018bdf58568 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58e26090-bc03-416d-9556-2018bdf58568', 'BF37004F-878A-4E35-91E4-7E4A97D8F329', 2, 'Low', 'Low', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 52c7f6db-c20c-492c-8a52-0261a3a810f4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('52c7f6db-c20c-492c-8a52-0261a3a810f4', 'BF37004F-878A-4E35-91E4-7E4A97D8F329', 3, 'Moderate', 'Moderate', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ffc5d8f7-8a11-4a47-a84a-ab139bf0dc83 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ffc5d8f7-8a11-4a47-a84a-ab139bf0dc83', 'BF37004F-878A-4E35-91E4-7E4A97D8F329', 4, 'Very High', 'Very High', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BF37004F-878A-4E35-91E4-7E4A97D8F329 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BF37004F-878A-4E35-91E4-7E4A97D8F329';

/* SQL text to insert entity field value with ID 5728ddc2-42ff-4307-a62f-b87caa6de254 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5728ddc2-42ff-4307-a62f-b87caa6de254', '38387ABA-ABD1-46CF-8EE0-F95EA10645D1', 1, 'High', 'High', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 95e491a5-484a-4335-abc9-854fa547e136 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('95e491a5-484a-4335-abc9-854fa547e136', '38387ABA-ABD1-46CF-8EE0-F95EA10645D1', 2, 'Minimal', 'Minimal', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ded6fa74-aa33-4ec5-9c33-f0fee91a06b3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ded6fa74-aa33-4ec5-9c33-f0fee91a06b3', '38387ABA-ABD1-46CF-8EE0-F95EA10645D1', 3, 'Moderate', 'Moderate', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 38387ABA-ABD1-46CF-8EE0-F95EA10645D1 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='38387ABA-ABD1-46CF-8EE0-F95EA10645D1';

/* SQL text to insert entity field value with ID 117a3db3-3948-4ffa-af06-bf991d5a25f7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('117a3db3-3948-4ffa-af06-bf991d5a25f7', '6BA3A69E-7935-4B85-9653-B2B41512A0D5', 1, 'Adoption Counselor', 'Adoption Counselor', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a2ebc401-383a-417a-a142-1cf945e4f8d1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a2ebc401-383a-417a-a142-1cf945e4f8d1', '6BA3A69E-7935-4B85-9653-B2B41512A0D5', 2, 'Kennel Attendant', 'Kennel Attendant', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 916f8330-2569-4c10-8638-29a0d7b447f6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('916f8330-2569-4c10-8638-29a0d7b447f6', '6BA3A69E-7935-4B85-9653-B2B41512A0D5', 3, 'Shelter Manager', 'Shelter Manager', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f75ef38f-fa90-4287-acef-350ec24aeea2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f75ef38f-fa90-4287-acef-350ec24aeea2', '6BA3A69E-7935-4B85-9653-B2B41512A0D5', 4, 'Vet Tech', 'Vet Tech', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 168aafdc-c2fc-4311-a551-3b81b95661cc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('168aafdc-c2fc-4311-a551-3b81b95661cc', '6BA3A69E-7935-4B85-9653-B2B41512A0D5', 5, 'Veterinarian', 'Veterinarian', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0772cd90-229a-480d-85e0-a44e8b9a782d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0772cd90-229a-480d-85e0-a44e8b9a782d', '6BA3A69E-7935-4B85-9653-B2B41512A0D5', 6, 'Volunteer', 'Volunteer', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c40fc398-c77c-4098-b21c-d330eb6cc671 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c40fc398-c77c-4098-b21c-d330eb6cc671', '6BA3A69E-7935-4B85-9653-B2B41512A0D5', 7, 'Volunteer Coordinator', 'Volunteer Coordinator', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6BA3A69E-7935-4B85-9653-B2B41512A0D5 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6BA3A69E-7935-4B85-9653-B2B41512A0D5';

/* SQL text to insert entity field value with ID a7009dcd-6648-4686-b7b1-f7d574bbf4e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a7009dcd-6648-4686-b7b1-f7d574bbf4e0', '6CE508B1-1A15-46EA-A36C-4825E817F8A9', 1, 'Apartment', 'Apartment', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 73b1c019-e99e-4a1d-bc7d-22a712e80a26 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('73b1c019-e99e-4a1d-bc7d-22a712e80a26', '6CE508B1-1A15-46EA-A36C-4825E817F8A9', 2, 'Condo', 'Condo', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b566c4c7-dd52-44cc-9056-d4776ab63bda */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b566c4c7-dd52-44cc-9056-d4776ab63bda', '6CE508B1-1A15-46EA-A36C-4825E817F8A9', 3, 'Farm', 'Farm', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 44a29bef-8ea1-4317-b775-603db245b746 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('44a29bef-8ea1-4317-b775-603db245b746', '6CE508B1-1A15-46EA-A36C-4825E817F8A9', 4, 'House', 'House', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6da45584-26d2-47c8-8bab-6468c5f88eb0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6da45584-26d2-47c8-8bab-6468c5f88eb0', '6CE508B1-1A15-46EA-A36C-4825E817F8A9', 5, 'Townhouse', 'Townhouse', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 6CE508B1-1A15-46EA-A36C-4825E817F8A9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='6CE508B1-1A15-46EA-A36C-4825E817F8A9';

/* SQL text to insert entity field value with ID 120be2d6-fe8e-48bb-a80f-74dfa083fad9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('120be2d6-fe8e-48bb-a80f-74dfa083fad9', '2F893E29-CAA4-4B60-BEFA-70E9982321FD', 1, 'Activity', 'Activity', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 19797cbf-5714-4298-8250-b8b0dcf61286 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('19797cbf-5714-4298-8250-b8b0dcf61286', '2F893E29-CAA4-4B60-BEFA-70E9982321FD', 2, 'Special Needs', 'Special Needs', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3efc252a-a2f9-497f-abc9-96c9705d1dac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3efc252a-a2f9-497f-abc9-96c9705d1dac', '2F893E29-CAA4-4B60-BEFA-70E9982321FD', 3, 'Temperament', 'Temperament', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2e396d8e-0f65-4137-a196-3b72a019e2c7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2e396d8e-0f65-4137-a196-3b72a019e2c7', '2F893E29-CAA4-4B60-BEFA-70E9982321FD', 4, 'Training', 'Training', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2F893E29-CAA4-4B60-BEFA-70E9982321FD */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2F893E29-CAA4-4B60-BEFA-70E9982321FD';

/* SQL text to insert entity field value with ID b5f63513-7883-47af-8edc-d5145d7d2dfb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b5f63513-7883-47af-8edc-d5145d7d2dfb', 'BE57BF23-47DD-4267-B5E8-DC12D6CD0AD0', 1, 'Female', 'Female', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 13bd7343-04d9-4bec-a906-00d0c67d52a7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13bd7343-04d9-4bec-a906-00d0c67d52a7', 'BE57BF23-47DD-4267-B5E8-DC12D6CD0AD0', 2, 'Male', 'Male', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BE57BF23-47DD-4267-B5E8-DC12D6CD0AD0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BE57BF23-47DD-4267-B5E8-DC12D6CD0AD0';

/* SQL text to insert entity field value with ID b62c1fb9-6024-4f6d-ae56-a196914e7e31 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b62c1fb9-6024-4f6d-ae56-a196914e7e31', '73E1BE99-42E2-4007-BDCA-BDB82C015C6B', 1, 'Born In Care', 'Born In Care', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 94e1fe51-1f24-488d-8824-45e2c29d10de */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('94e1fe51-1f24-488d-8824-45e2c29d10de', '73E1BE99-42E2-4007-BDCA-BDB82C015C6B', 2, 'Owner Surrender', 'Owner Surrender', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6f7f5f5d-f64b-4f30-a474-d9241759547f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6f7f5f5d-f64b-4f30-a474-d9241759547f', '73E1BE99-42E2-4007-BDCA-BDB82C015C6B', 3, 'Return', 'Return', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b6a60038-b034-4b88-ba76-dec98154b5d1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b6a60038-b034-4b88-ba76-dec98154b5d1', '73E1BE99-42E2-4007-BDCA-BDB82C015C6B', 4, 'Stray', 'Stray', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cb5942dd-ad6b-4613-9507-a2e7888dd371 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cb5942dd-ad6b-4613-9507-a2e7888dd371', '73E1BE99-42E2-4007-BDCA-BDB82C015C6B', 5, 'Transfer', 'Transfer', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 73E1BE99-42E2-4007-BDCA-BDB82C015C6B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='73E1BE99-42E2-4007-BDCA-BDB82C015C6B';

/* SQL text to insert entity field value with ID b4ef7191-fc7a-46fb-b124-e82a97423de4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b4ef7191-fc7a-46fb-b124-e82a97423de4', '09EFDB84-80AE-448F-8104-B08BDC858534', 1, 'Adopted', 'Adopted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f378ddd6-5b69-4280-9a24-ecab85b655cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f378ddd6-5b69-4280-9a24-ecab85b655cb', '09EFDB84-80AE-448F-8104-B08BDC858534', 2, 'Available', 'Available', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a9bfcb3d-2547-44e9-a7d8-c00adcc276b3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a9bfcb3d-2547-44e9-a7d8-c00adcc276b3', '09EFDB84-80AE-448F-8104-B08BDC858534', 3, 'Fostered', 'Fostered', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 301d51e2-2e75-411a-b538-09130726f922 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('301d51e2-2e75-411a-b538-09130726f922', '09EFDB84-80AE-448F-8104-B08BDC858534', 4, 'Intake', 'Intake', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2d6fe775-9ba2-4d6c-aaf6-90e72bf5f33c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2d6fe775-9ba2-4d6c-aaf6-90e72bf5f33c', '09EFDB84-80AE-448F-8104-B08BDC858534', 5, 'Medical Hold', 'Medical Hold', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0bd09cdf-b5e8-4916-92f3-4d27792976f9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0bd09cdf-b5e8-4916-92f3-4d27792976f9', '09EFDB84-80AE-448F-8104-B08BDC858534', 6, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7582d61a-ce0f-458f-b9d2-3e8a4458741b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7582d61a-ce0f-458f-b9d2-3e8a4458741b', '09EFDB84-80AE-448F-8104-B08BDC858534', 7, 'Transferred', 'Transferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 09EFDB84-80AE-448F-8104-B08BDC858534 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='09EFDB84-80AE-448F-8104-B08BDC858534';

/* SQL text to insert entity field value with ID f44d35e4-97a3-491b-aabd-8c2699734801 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f44d35e4-97a3-491b-aabd-8c2699734801', 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 75794c1f-466c-4402-900a-8c7a3b4215cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('75794c1f-466c-4402-900a-8c7a3b4215cb', 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9', 2, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 504ed284-b625-45ea-8743-0899ea980648 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('504ed284-b625-45ea-8743-0899ea980648', 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9', 3, 'Denied', 'Denied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ff164bc2-5455-4ed4-9f19-b428d4989de3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff164bc2-5455-4ed4-9f19-b428d4989de3', 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9', 4, 'Submitted', 'Submitted', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bebf0163-2445-4c83-a9e7-6ab07579a5d1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bebf0163-2445-4c83-a9e7-6ab07579a5d1', 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9', 5, 'Under Review', 'Under Review', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 07ba9111-3c9d-46ce-a289-707db0b18a96 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('07ba9111-3c9d-46ce-a289-707db0b18a96', 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9', 6, 'Withdrawn', 'Withdrawn', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CC6188BF-960A-41E9-9C0F-68AC876B3ED9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CC6188BF-960A-41E9-9C0F-68AC876B3ED9';

/* SQL text to insert entity field value with ID 3aa7f0ef-d2fa-45f3-9dab-c6d961b8b60b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3aa7f0ef-d2fa-45f3-9dab-c6d961b8b60b', '56102C23-F258-4D60-A58F-D1D2DCE99FBB', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f03b8199-4f36-4e9b-8cf7-7df1dd152ca0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f03b8199-4f36-4e9b-8cf7-7df1dd152ca0', '56102C23-F258-4D60-A58F-D1D2DCE99FBB', 2, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e349919e-135c-4f0c-915e-26168fb284cd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e349919e-135c-4f0c-915e-26168fb284cd', '56102C23-F258-4D60-A58F-D1D2DCE99FBB', 3, 'Ended Early', 'Ended Early', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 56102C23-F258-4D60-A58F-D1D2DCE99FBB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='56102C23-F258-4D60-A58F-D1D2DCE99FBB';

/* SQL text to insert entity field value with ID f27e5759-8855-4f7f-b7fd-91e8d7db654a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f27e5759-8855-4f7f-b7fd-91e8d7db654a', '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1', 1, 'Dental', 'Dental', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cf22e0f1-12ce-47e2-b1bb-e3f47dfabafc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cf22e0f1-12ce-47e2-b1bb-e3f47dfabafc', '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1', 2, 'Exam', 'Exam', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0bce2e5a-bc3b-4bf1-8f49-9b99d3dd3901 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0bce2e5a-bc3b-4bf1-8f49-9b99d3dd3901', '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1', 3, 'Surgery', 'Surgery', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6d49a134-ea57-475a-b925-7e3e904dc209 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6d49a134-ea57-475a-b925-7e3e904dc209', '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1', 4, 'Test', 'Test', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4c866c66-6376-4bcc-8785-11c9af567ca8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4c866c66-6376-4bcc-8785-11c9af567ca8', '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1', 5, 'Treatment', 'Treatment', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3a85d4a0-2144-4c08-9993-3d9c45a8017c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3a85d4a0-2144-4c08-9993-3d9c45a8017c', '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1', 6, 'Vaccination', 'Vaccination', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1';


/* Create Entity Relationship: Shelters -> Dogs (One To Many via ShelterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1a7d0496-02f3-4971-a238-014c3588d8ba'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1a7d0496-02f3-4971-a238-014c3588d8ba', '7E53957B-4697-4B59-8EC3-348FDE76FE3B', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'ShelterID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Shelters -> Staffs (One To Many via ShelterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e97f9068-f79a-4c9c-afa7-180ae3c1cdc5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e97f9068-f79a-4c9c-afa7-180ae3c1cdc5', '7E53957B-4697-4B59-8EC3-348FDE76FE3B', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', 'ShelterID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Staffs -> Staffs (One To Many via SupervisorID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '811c1cf8-d3a5-4ada-8760-8581b749cd0d'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('811c1cf8-d3a5-4ada-8760-8581b749cd0d', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', 'SupervisorID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Staffs -> Dog Traits (One To Many via AssignedByStaffID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fd600690-f34a-47ef-8205-e09d0f5bc6fd'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fd600690-f34a-47ef-8205-e09d0f5bc6fd', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', 'AssignedByStaffID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Staffs -> Adoption Applications (One To Many via ReviewedByStaffID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '115d7a77-3115-42a4-9887-26981dafbb33'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('115d7a77-3115-42a4-9887-26981dafbb33', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', 'ReviewedByStaffID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Staffs -> Medical Records (One To Many via VeterinarianStaffID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '08f58fce-4090-442c-b86b-efdea060b70a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('08f58fce-4090-442c-b86b-efdea060b70a', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', 'VeterinarianStaffID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Dogs -> Dog Traits (One To Many via DogID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4219090a-24bd-4159-8d13-8fb6eb689617'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4219090a-24bd-4159-8d13-8fb6eb689617', 'FCD6413F-411A-4B50-9D31-82C271AEA652', '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', 'DogID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Dogs -> Adoption Applications (One To Many via DogID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c9cc585f-752a-4f90-842d-e190665a2832'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c9cc585f-752a-4f90-842d-e190665a2832', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', 'DogID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Dogs -> Foster Placements (One To Many via DogID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2336054e-8ecc-42fd-b90f-913898a35c5e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2336054e-8ecc-42fd-b90f-913898a35c5e', 'FCD6413F-411A-4B50-9D31-82C271AEA652', '55903600-D02D-4E83-8614-3D989DF836A8', 'DogID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Dogs -> Dogs (One To Many via MotherID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '48a1374b-8d6a-45bc-952e-7633eb59e510'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('48a1374b-8d6a-45bc-952e-7633eb59e510', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'MotherID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Dogs -> Medical Records (One To Many via DogID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ee7157a9-a2e4-4312-9315-7b70affae80b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ee7157a9-a2e4-4312-9315-7b70affae80b', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', 'DogID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Traits -> Dog Traits (One To Many via TraitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8cadb1fc-a10d-4deb-bdc3-50fe2ad97c02'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8cadb1fc-a10d-4deb-bdc3-50fe2ad97c02', '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', 'TraitID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Breeds -> Dogs (One To Many via SecondaryBreedID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd58676c5-53c8-400e-863f-82dd149d671a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d58676c5-53c8-400e-863f-82dd149d671a', '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'SecondaryBreedID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Breeds -> Dogs (One To Many via PrimaryBreedID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '84ebcbc4-04ea-4eec-8209-7537c4d5fab2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('84ebcbc4-04ea-4eec-8209-7537c4d5fab2', '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'PrimaryBreedID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Adopters -> Foster Placements (One To Many via FosterAdopterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8e21834c-3392-4499-b951-5bea78ae372b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8e21834c-3392-4499-b951-5bea78ae372b', 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', '55903600-D02D-4E83-8614-3D989DF836A8', 'FosterAdopterID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: Adopters -> Adoption Applications (One To Many via AdopterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '299b51ab-a982-41d3-8f07-d5dd7f64c02f'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('299b51ab-a982-41d3-8f07-d5dd7f64c02f', 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', 'AdopterID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for Adopter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for AdoptionApplication */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adoption Applications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DogID in table AdoptionApplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AdoptionApplication_DogID' 
    AND object_id = OBJECT_ID('[DogShelter].[AdoptionApplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AdoptionApplication_DogID ON [DogShelter].[AdoptionApplication] ([DogID]);

-- Index for foreign key AdopterID in table AdoptionApplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AdoptionApplication_AdopterID' 
    AND object_id = OBJECT_ID('[DogShelter].[AdoptionApplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AdoptionApplication_AdopterID ON [DogShelter].[AdoptionApplication] ([AdopterID]);

-- Index for foreign key ReviewedByStaffID in table AdoptionApplication
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AdoptionApplication_ReviewedByStaffID' 
    AND object_id = OBJECT_ID('[DogShelter].[AdoptionApplication]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AdoptionApplication_ReviewedByStaffID ON [DogShelter].[AdoptionApplication] ([ReviewedByStaffID]);

/* SQL text to update entity field related entity name field map for entity field ID 93C2B8C4-734B-4E55-A3A2-FBF6FB2B52D5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='93C2B8C4-734B-4E55-A3A2-FBF6FB2B52D5', @RelatedEntityNameFieldMap='Dog';

/* Index for Foreign Keys for Breed */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Breeds
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for DogTrait */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dog Traits
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DogID in table DogTrait
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DogTrait_DogID' 
    AND object_id = OBJECT_ID('[DogShelter].[DogTrait]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DogTrait_DogID ON [DogShelter].[DogTrait] ([DogID]);

-- Index for foreign key TraitID in table DogTrait
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DogTrait_TraitID' 
    AND object_id = OBJECT_ID('[DogShelter].[DogTrait]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DogTrait_TraitID ON [DogShelter].[DogTrait] ([TraitID]);

-- Index for foreign key AssignedByStaffID in table DogTrait
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DogTrait_AssignedByStaffID' 
    AND object_id = OBJECT_ID('[DogShelter].[DogTrait]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DogTrait_AssignedByStaffID ON [DogShelter].[DogTrait] ([AssignedByStaffID]);

/* SQL text to update entity field related entity name field map for entity field ID 1607EEAA-F6D8-4E2C-8D50-BB6E214A33B0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1607EEAA-F6D8-4E2C-8D50-BB6E214A33B0', @RelatedEntityNameFieldMap='Dog';

/* Base View SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: vwAdopters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Adopters
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Adopter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwAdopters]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwAdopters];
GO

CREATE VIEW [DogShelter].[vwAdopters]
AS
SELECT
    a.*
FROM
    [DogShelter].[Adopter] AS a
GO
GRANT SELECT ON [DogShelter].[vwAdopters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: Permissions for vwAdopters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwAdopters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: spCreateAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateAdopter];
GO

CREATE PROCEDURE [DogShelter].[spCreateAdopter]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @State_Clear bit = 0,
    @State nvarchar(50) = NULL,
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @HousingType nvarchar(20),
    @HasFencedYard bit = NULL,
    @HasOtherPets bit = NULL,
    @HouseholdAdults int = NULL,
    @HouseholdChildren int = NULL,
    @IsFosterApproved bit = NULL,
    @DateRegistered date,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Adopter]
            (
                [ID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [HousingType],
                [HasFencedYard],
                [HasOtherPets],
                [HouseholdAdults],
                [HouseholdChildren],
                [IsFosterApproved],
                [DateRegistered],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @State_Clear = 1 THEN NULL ELSE ISNULL(@State, NULL) END,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                @HousingType,
                ISNULL(@HasFencedYard, 0),
                ISNULL(@HasOtherPets, 0),
                ISNULL(@HouseholdAdults, 1),
                ISNULL(@HouseholdChildren, 0),
                ISNULL(@IsFosterApproved, 0),
                @DateRegistered,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Adopter]
            (
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [HousingType],
                [HasFencedYard],
                [HasOtherPets],
                [HouseholdAdults],
                [HouseholdChildren],
                [IsFosterApproved],
                [DateRegistered],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @State_Clear = 1 THEN NULL ELSE ISNULL(@State, NULL) END,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                @HousingType,
                ISNULL(@HasFencedYard, 0),
                ISNULL(@HasOtherPets, 0),
                ISNULL(@HouseholdAdults, 1),
                ISNULL(@HouseholdChildren, 0),
                ISNULL(@IsFosterApproved, 0),
                @DateRegistered,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwAdopters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Adopters */

GRANT EXECUTE ON [DogShelter].[spCreateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: spUpdateAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateAdopter];
GO

CREATE PROCEDURE [DogShelter].[spUpdateAdopter]
    @ID uniqueidentifier,
    @FirstName nvarchar(100) = NULL,
    @LastName nvarchar(100) = NULL,
    @Email nvarchar(255) = NULL,
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @State_Clear bit = 0,
    @State nvarchar(50) = NULL,
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @HousingType nvarchar(20) = NULL,
    @HasFencedYard bit = NULL,
    @HasOtherPets bit = NULL,
    @HouseholdAdults int = NULL,
    @HouseholdChildren int = NULL,
    @IsFosterApproved bit = NULL,
    @DateRegistered date = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Adopter]
    SET
        [FirstName] = ISNULL(@FirstName, [FirstName]),
        [LastName] = ISNULL(@LastName, [LastName]),
        [Email] = ISNULL(@Email, [Email]),
        [Phone] = CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, [Phone]) END,
        [AddressLine1] = CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, [AddressLine1]) END,
        [City] = CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, [City]) END,
        [State] = CASE WHEN @State_Clear = 1 THEN NULL ELSE ISNULL(@State, [State]) END,
        [PostalCode] = CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, [PostalCode]) END,
        [HousingType] = ISNULL(@HousingType, [HousingType]),
        [HasFencedYard] = ISNULL(@HasFencedYard, [HasFencedYard]),
        [HasOtherPets] = ISNULL(@HasOtherPets, [HasOtherPets]),
        [HouseholdAdults] = ISNULL(@HouseholdAdults, [HouseholdAdults]),
        [HouseholdChildren] = ISNULL(@HouseholdChildren, [HouseholdChildren]),
        [IsFosterApproved] = ISNULL(@IsFosterApproved, [IsFosterApproved]),
        [DateRegistered] = ISNULL(@DateRegistered, [DateRegistered]),
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwAdopters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwAdopters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateAdopter] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Adopter table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateAdopter]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateAdopter];
GO
CREATE TRIGGER [DogShelter].trgUpdateAdopter
ON [DogShelter].[Adopter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Adopter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Adopter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Adopters */

GRANT EXECUTE ON [DogShelter].[spUpdateAdopter] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Breeds
-- Item: vwBreeds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Breeds
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Breed
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwBreeds]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwBreeds];
GO

CREATE VIEW [DogShelter].[vwBreeds]
AS
SELECT
    b.*
FROM
    [DogShelter].[Breed] AS b
GO
GRANT SELECT ON [DogShelter].[vwBreeds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Breeds
-- Item: Permissions for vwBreeds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwBreeds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Breeds
-- Item: spCreateBreed
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Breed
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateBreed]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateBreed];
GO

CREATE PROCEDURE [DogShelter].[spCreateBreed]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(150),
    @SizeCategory nvarchar(20),
    @TypicalWeightLbsLow_Clear bit = 0,
    @TypicalWeightLbsLow int = NULL,
    @TypicalWeightLbsHigh_Clear bit = 0,
    @TypicalWeightLbsHigh int = NULL,
    @EnergyLevel nvarchar(20),
    @GroomingNeeds nvarchar(20),
    @TypicalLifespanYears_Clear bit = 0,
    @TypicalLifespanYears int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Breed]
            (
                [ID],
                [Name],
                [SizeCategory],
                [TypicalWeightLbsLow],
                [TypicalWeightLbsHigh],
                [EnergyLevel],
                [GroomingNeeds],
                [TypicalLifespanYears],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @SizeCategory,
                CASE WHEN @TypicalWeightLbsLow_Clear = 1 THEN NULL ELSE ISNULL(@TypicalWeightLbsLow, NULL) END,
                CASE WHEN @TypicalWeightLbsHigh_Clear = 1 THEN NULL ELSE ISNULL(@TypicalWeightLbsHigh, NULL) END,
                @EnergyLevel,
                @GroomingNeeds,
                CASE WHEN @TypicalLifespanYears_Clear = 1 THEN NULL ELSE ISNULL(@TypicalLifespanYears, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Breed]
            (
                [Name],
                [SizeCategory],
                [TypicalWeightLbsLow],
                [TypicalWeightLbsHigh],
                [EnergyLevel],
                [GroomingNeeds],
                [TypicalLifespanYears],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @SizeCategory,
                CASE WHEN @TypicalWeightLbsLow_Clear = 1 THEN NULL ELSE ISNULL(@TypicalWeightLbsLow, NULL) END,
                CASE WHEN @TypicalWeightLbsHigh_Clear = 1 THEN NULL ELSE ISNULL(@TypicalWeightLbsHigh, NULL) END,
                @EnergyLevel,
                @GroomingNeeds,
                CASE WHEN @TypicalLifespanYears_Clear = 1 THEN NULL ELSE ISNULL(@TypicalLifespanYears, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwBreeds] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateBreed] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Breeds */

GRANT EXECUTE ON [DogShelter].[spCreateBreed] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Breeds
-- Item: spUpdateBreed
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Breed
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateBreed]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateBreed];
GO

CREATE PROCEDURE [DogShelter].[spUpdateBreed]
    @ID uniqueidentifier,
    @Name nvarchar(150) = NULL,
    @SizeCategory nvarchar(20) = NULL,
    @TypicalWeightLbsLow_Clear bit = 0,
    @TypicalWeightLbsLow int = NULL,
    @TypicalWeightLbsHigh_Clear bit = 0,
    @TypicalWeightLbsHigh int = NULL,
    @EnergyLevel nvarchar(20) = NULL,
    @GroomingNeeds nvarchar(20) = NULL,
    @TypicalLifespanYears_Clear bit = 0,
    @TypicalLifespanYears int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Breed]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [SizeCategory] = ISNULL(@SizeCategory, [SizeCategory]),
        [TypicalWeightLbsLow] = CASE WHEN @TypicalWeightLbsLow_Clear = 1 THEN NULL ELSE ISNULL(@TypicalWeightLbsLow, [TypicalWeightLbsLow]) END,
        [TypicalWeightLbsHigh] = CASE WHEN @TypicalWeightLbsHigh_Clear = 1 THEN NULL ELSE ISNULL(@TypicalWeightLbsHigh, [TypicalWeightLbsHigh]) END,
        [EnergyLevel] = ISNULL(@EnergyLevel, [EnergyLevel]),
        [GroomingNeeds] = ISNULL(@GroomingNeeds, [GroomingNeeds]),
        [TypicalLifespanYears] = CASE WHEN @TypicalLifespanYears_Clear = 1 THEN NULL ELSE ISNULL(@TypicalLifespanYears, [TypicalLifespanYears]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwBreeds] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwBreeds]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateBreed] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Breed table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateBreed]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateBreed];
GO
CREATE TRIGGER [DogShelter].trgUpdateBreed
ON [DogShelter].[Breed]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Breed]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Breed] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Breeds */

GRANT EXECUTE ON [DogShelter].[spUpdateBreed] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: spDeleteAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteAdopter];
GO

CREATE PROCEDURE [DogShelter].[spDeleteAdopter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Adopter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteAdopter] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Adopters */

GRANT EXECUTE ON [DogShelter].[spDeleteAdopter] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Breeds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Breeds
-- Item: spDeleteBreed
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Breed
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteBreed]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteBreed];
GO

CREATE PROCEDURE [DogShelter].[spDeleteBreed]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Breed]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteBreed] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Breeds */

GRANT EXECUTE ON [DogShelter].[spDeleteBreed] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Adoption Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adoption Applications
-- Item: vwAdoptionApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Adoption Applications
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  AdoptionApplication
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwAdoptionApplications]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwAdoptionApplications];
GO

CREATE VIEW [DogShelter].[vwAdoptionApplications]
AS
SELECT
    a.*,
    DogShelterDog_DogID.[Name] AS [Dog]
FROM
    [DogShelter].[AdoptionApplication] AS a
INNER JOIN
    [DogShelter].[Dog] AS DogShelterDog_DogID
  ON
    [a].[DogID] = DogShelterDog_DogID.[ID]
GO
GRANT SELECT ON [DogShelter].[vwAdoptionApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Adoption Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adoption Applications
-- Item: Permissions for vwAdoptionApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwAdoptionApplications] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Adoption Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adoption Applications
-- Item: spCreateAdoptionApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AdoptionApplication
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateAdoptionApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateAdoptionApplication];
GO

CREATE PROCEDURE [DogShelter].[spCreateAdoptionApplication]
    @ID uniqueidentifier = NULL,
    @DogID uniqueidentifier,
    @AdopterID uniqueidentifier,
    @SubmittedAt datetimeoffset,
    @Status nvarchar(30) = NULL,
    @ReviewedByStaffID_Clear bit = 0,
    @ReviewedByStaffID uniqueidentifier = NULL,
    @ReviewedAt_Clear bit = 0,
    @ReviewedAt datetimeoffset = NULL,
    @HomeVisitDate_Clear bit = 0,
    @HomeVisitDate date = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL,
    @AdoptionDate_Clear bit = 0,
    @AdoptionDate date = NULL,
    @FeePaid_Clear bit = 0,
    @FeePaid decimal(10, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[AdoptionApplication]
            (
                [ID],
                [DogID],
                [AdopterID],
                [SubmittedAt],
                [Status],
                [ReviewedByStaffID],
                [ReviewedAt],
                [HomeVisitDate],
                [DecisionNotes],
                [AdoptionDate],
                [FeePaid]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DogID,
                @AdopterID,
                @SubmittedAt,
                ISNULL(@Status, 'Submitted'),
                CASE WHEN @ReviewedByStaffID_Clear = 1 THEN NULL ELSE ISNULL(@ReviewedByStaffID, NULL) END,
                CASE WHEN @ReviewedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReviewedAt, NULL) END,
                CASE WHEN @HomeVisitDate_Clear = 1 THEN NULL ELSE ISNULL(@HomeVisitDate, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @AdoptionDate_Clear = 1 THEN NULL ELSE ISNULL(@AdoptionDate, NULL) END,
                CASE WHEN @FeePaid_Clear = 1 THEN NULL ELSE ISNULL(@FeePaid, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[AdoptionApplication]
            (
                [DogID],
                [AdopterID],
                [SubmittedAt],
                [Status],
                [ReviewedByStaffID],
                [ReviewedAt],
                [HomeVisitDate],
                [DecisionNotes],
                [AdoptionDate],
                [FeePaid]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DogID,
                @AdopterID,
                @SubmittedAt,
                ISNULL(@Status, 'Submitted'),
                CASE WHEN @ReviewedByStaffID_Clear = 1 THEN NULL ELSE ISNULL(@ReviewedByStaffID, NULL) END,
                CASE WHEN @ReviewedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReviewedAt, NULL) END,
                CASE WHEN @HomeVisitDate_Clear = 1 THEN NULL ELSE ISNULL(@HomeVisitDate, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @AdoptionDate_Clear = 1 THEN NULL ELSE ISNULL(@AdoptionDate, NULL) END,
                CASE WHEN @FeePaid_Clear = 1 THEN NULL ELSE ISNULL(@FeePaid, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwAdoptionApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateAdoptionApplication] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Adoption Applications */

GRANT EXECUTE ON [DogShelter].[spCreateAdoptionApplication] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Adoption Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adoption Applications
-- Item: spUpdateAdoptionApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AdoptionApplication
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateAdoptionApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateAdoptionApplication];
GO

CREATE PROCEDURE [DogShelter].[spUpdateAdoptionApplication]
    @ID uniqueidentifier,
    @DogID uniqueidentifier = NULL,
    @AdopterID uniqueidentifier = NULL,
    @SubmittedAt datetimeoffset = NULL,
    @Status nvarchar(30) = NULL,
    @ReviewedByStaffID_Clear bit = 0,
    @ReviewedByStaffID uniqueidentifier = NULL,
    @ReviewedAt_Clear bit = 0,
    @ReviewedAt datetimeoffset = NULL,
    @HomeVisitDate_Clear bit = 0,
    @HomeVisitDate date = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL,
    @AdoptionDate_Clear bit = 0,
    @AdoptionDate date = NULL,
    @FeePaid_Clear bit = 0,
    @FeePaid decimal(10, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[AdoptionApplication]
    SET
        [DogID] = ISNULL(@DogID, [DogID]),
        [AdopterID] = ISNULL(@AdopterID, [AdopterID]),
        [SubmittedAt] = ISNULL(@SubmittedAt, [SubmittedAt]),
        [Status] = ISNULL(@Status, [Status]),
        [ReviewedByStaffID] = CASE WHEN @ReviewedByStaffID_Clear = 1 THEN NULL ELSE ISNULL(@ReviewedByStaffID, [ReviewedByStaffID]) END,
        [ReviewedAt] = CASE WHEN @ReviewedAt_Clear = 1 THEN NULL ELSE ISNULL(@ReviewedAt, [ReviewedAt]) END,
        [HomeVisitDate] = CASE WHEN @HomeVisitDate_Clear = 1 THEN NULL ELSE ISNULL(@HomeVisitDate, [HomeVisitDate]) END,
        [DecisionNotes] = CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, [DecisionNotes]) END,
        [AdoptionDate] = CASE WHEN @AdoptionDate_Clear = 1 THEN NULL ELSE ISNULL(@AdoptionDate, [AdoptionDate]) END,
        [FeePaid] = CASE WHEN @FeePaid_Clear = 1 THEN NULL ELSE ISNULL(@FeePaid, [FeePaid]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwAdoptionApplications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwAdoptionApplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateAdoptionApplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AdoptionApplication table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateAdoptionApplication]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateAdoptionApplication];
GO
CREATE TRIGGER [DogShelter].trgUpdateAdoptionApplication
ON [DogShelter].[AdoptionApplication]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[AdoptionApplication]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[AdoptionApplication] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Adoption Applications */

GRANT EXECUTE ON [DogShelter].[spUpdateAdoptionApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Adoption Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adoption Applications
-- Item: spDeleteAdoptionApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AdoptionApplication
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteAdoptionApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteAdoptionApplication];
GO

CREATE PROCEDURE [DogShelter].[spDeleteAdoptionApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[AdoptionApplication]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteAdoptionApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Adoption Applications */

GRANT EXECUTE ON [DogShelter].[spDeleteAdoptionApplication] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 8A3EC8FD-6627-4E1C-8FCC-C0475644E7D0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8A3EC8FD-6627-4E1C-8FCC-C0475644E7D0', @RelatedEntityNameFieldMap='Trait';

/* Base View SQL for Dog Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dog Traits
-- Item: vwDogTraits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dog Traits
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  DogTrait
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwDogTraits]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwDogTraits];
GO

CREATE VIEW [DogShelter].[vwDogTraits]
AS
SELECT
    d.*,
    DogShelterDog_DogID.[Name] AS [Dog],
    DogShelterTrait_TraitID.[Name] AS [Trait]
FROM
    [DogShelter].[DogTrait] AS d
INNER JOIN
    [DogShelter].[Dog] AS DogShelterDog_DogID
  ON
    [d].[DogID] = DogShelterDog_DogID.[ID]
INNER JOIN
    [DogShelter].[Trait] AS DogShelterTrait_TraitID
  ON
    [d].[TraitID] = DogShelterTrait_TraitID.[ID]
GO
GRANT SELECT ON [DogShelter].[vwDogTraits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Dog Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dog Traits
-- Item: Permissions for vwDogTraits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwDogTraits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Dog Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dog Traits
-- Item: spCreateDogTrait
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DogTrait
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateDogTrait]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateDogTrait];
GO

CREATE PROCEDURE [DogShelter].[spCreateDogTrait]
    @ID uniqueidentifier = NULL,
    @DogID uniqueidentifier,
    @TraitID uniqueidentifier,
    @AssignedByStaffID_Clear bit = 0,
    @AssignedByStaffID uniqueidentifier = NULL,
    @AssignedAt datetimeoffset = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[DogTrait]
            (
                [ID],
                [DogID],
                [TraitID],
                [AssignedByStaffID],
                [AssignedAt],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DogID,
                @TraitID,
                CASE WHEN @AssignedByStaffID_Clear = 1 THEN NULL ELSE ISNULL(@AssignedByStaffID, NULL) END,
                ISNULL(@AssignedAt, sysdatetimeoffset()),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[DogTrait]
            (
                [DogID],
                [TraitID],
                [AssignedByStaffID],
                [AssignedAt],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DogID,
                @TraitID,
                CASE WHEN @AssignedByStaffID_Clear = 1 THEN NULL ELSE ISNULL(@AssignedByStaffID, NULL) END,
                ISNULL(@AssignedAt, sysdatetimeoffset()),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwDogTraits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateDogTrait] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Dog Traits */

GRANT EXECUTE ON [DogShelter].[spCreateDogTrait] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Dog Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dog Traits
-- Item: spUpdateDogTrait
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DogTrait
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateDogTrait]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateDogTrait];
GO

CREATE PROCEDURE [DogShelter].[spUpdateDogTrait]
    @ID uniqueidentifier,
    @DogID uniqueidentifier = NULL,
    @TraitID uniqueidentifier = NULL,
    @AssignedByStaffID_Clear bit = 0,
    @AssignedByStaffID uniqueidentifier = NULL,
    @AssignedAt datetimeoffset = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[DogTrait]
    SET
        [DogID] = ISNULL(@DogID, [DogID]),
        [TraitID] = ISNULL(@TraitID, [TraitID]),
        [AssignedByStaffID] = CASE WHEN @AssignedByStaffID_Clear = 1 THEN NULL ELSE ISNULL(@AssignedByStaffID, [AssignedByStaffID]) END,
        [AssignedAt] = ISNULL(@AssignedAt, [AssignedAt]),
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwDogTraits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwDogTraits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateDogTrait] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DogTrait table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateDogTrait]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateDogTrait];
GO
CREATE TRIGGER [DogShelter].trgUpdateDogTrait
ON [DogShelter].[DogTrait]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[DogTrait]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[DogTrait] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Dog Traits */

GRANT EXECUTE ON [DogShelter].[spUpdateDogTrait] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Dog Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dog Traits
-- Item: spDeleteDogTrait
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DogTrait
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteDogTrait]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteDogTrait];
GO

CREATE PROCEDURE [DogShelter].[spDeleteDogTrait]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[DogTrait]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteDogTrait] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Dog Traits */

GRANT EXECUTE ON [DogShelter].[spDeleteDogTrait] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Dog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dogs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ShelterID in table Dog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dog_ShelterID' 
    AND object_id = OBJECT_ID('[DogShelter].[Dog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dog_ShelterID ON [DogShelter].[Dog] ([ShelterID]);

-- Index for foreign key PrimaryBreedID in table Dog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dog_PrimaryBreedID' 
    AND object_id = OBJECT_ID('[DogShelter].[Dog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dog_PrimaryBreedID ON [DogShelter].[Dog] ([PrimaryBreedID]);

-- Index for foreign key SecondaryBreedID in table Dog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dog_SecondaryBreedID' 
    AND object_id = OBJECT_ID('[DogShelter].[Dog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dog_SecondaryBreedID ON [DogShelter].[Dog] ([SecondaryBreedID]);

-- Index for foreign key MotherID in table Dog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dog_MotherID' 
    AND object_id = OBJECT_ID('[DogShelter].[Dog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dog_MotherID ON [DogShelter].[Dog] ([MotherID]);

/* SQL text to update entity field related entity name field map for entity field ID 28BA460F-3B98-4F98-957E-1FFFC5F56F3E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='28BA460F-3B98-4F98-957E-1FFFC5F56F3E', @RelatedEntityNameFieldMap='Shelter';

/* Index for Foreign Keys for FosterPlacement */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Foster Placements
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DogID in table FosterPlacement
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FosterPlacement_DogID' 
    AND object_id = OBJECT_ID('[DogShelter].[FosterPlacement]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FosterPlacement_DogID ON [DogShelter].[FosterPlacement] ([DogID]);

-- Index for foreign key FosterAdopterID in table FosterPlacement
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FosterPlacement_FosterAdopterID' 
    AND object_id = OBJECT_ID('[DogShelter].[FosterPlacement]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FosterPlacement_FosterAdopterID ON [DogShelter].[FosterPlacement] ([FosterAdopterID]);

/* SQL text to update entity field related entity name field map for entity field ID CC9CC857-FBEF-42FB-AF2A-D61E7BA8FA52 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CC9CC857-FBEF-42FB-AF2A-D61E7BA8FA52', @RelatedEntityNameFieldMap='Dog';

/* Index for Foreign Keys for MedicalRecord */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Medical Records
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DogID in table MedicalRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MedicalRecord_DogID' 
    AND object_id = OBJECT_ID('[DogShelter].[MedicalRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MedicalRecord_DogID ON [DogShelter].[MedicalRecord] ([DogID]);

-- Index for foreign key VeterinarianStaffID in table MedicalRecord
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MedicalRecord_VeterinarianStaffID' 
    AND object_id = OBJECT_ID('[DogShelter].[MedicalRecord]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MedicalRecord_VeterinarianStaffID ON [DogShelter].[MedicalRecord] ([VeterinarianStaffID]);

/* SQL text to update entity field related entity name field map for entity field ID 672904DF-FFEE-4C3E-BC5F-BFB873A6DF6A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='672904DF-FFEE-4C3E-BC5F-BFB873A6DF6A', @RelatedEntityNameFieldMap='Dog';

/* SQL text to update entity field related entity name field map for entity field ID 5B5ADAF6-BE94-4A18-8597-12E3CA7BFCD6 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5B5ADAF6-BE94-4A18-8597-12E3CA7BFCD6', @RelatedEntityNameFieldMap='PrimaryBreed';

/* Base View SQL for Medical Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Medical Records
-- Item: vwMedicalRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Medical Records
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  MedicalRecord
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwMedicalRecords]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwMedicalRecords];
GO

CREATE VIEW [DogShelter].[vwMedicalRecords]
AS
SELECT
    m.*,
    DogShelterDog_DogID.[Name] AS [Dog]
FROM
    [DogShelter].[MedicalRecord] AS m
INNER JOIN
    [DogShelter].[Dog] AS DogShelterDog_DogID
  ON
    [m].[DogID] = DogShelterDog_DogID.[ID]
GO
GRANT SELECT ON [DogShelter].[vwMedicalRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Medical Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Medical Records
-- Item: Permissions for vwMedicalRecords
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwMedicalRecords] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Medical Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Medical Records
-- Item: spCreateMedicalRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MedicalRecord
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateMedicalRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateMedicalRecord];
GO

CREATE PROCEDURE [DogShelter].[spCreateMedicalRecord]
    @ID uniqueidentifier = NULL,
    @DogID uniqueidentifier,
    @RecordDate date,
    @RecordType nvarchar(30),
    @Description nvarchar(500),
    @VeterinarianStaffID_Clear bit = 0,
    @VeterinarianStaffID uniqueidentifier = NULL,
    @Cost decimal(10, 2) = NULL,
    @FollowUpDate_Clear bit = 0,
    @FollowUpDate date = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[MedicalRecord]
            (
                [ID],
                [DogID],
                [RecordDate],
                [RecordType],
                [Description],
                [VeterinarianStaffID],
                [Cost],
                [FollowUpDate],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DogID,
                @RecordDate,
                @RecordType,
                @Description,
                CASE WHEN @VeterinarianStaffID_Clear = 1 THEN NULL ELSE ISNULL(@VeterinarianStaffID, NULL) END,
                ISNULL(@Cost, 0),
                CASE WHEN @FollowUpDate_Clear = 1 THEN NULL ELSE ISNULL(@FollowUpDate, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[MedicalRecord]
            (
                [DogID],
                [RecordDate],
                [RecordType],
                [Description],
                [VeterinarianStaffID],
                [Cost],
                [FollowUpDate],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DogID,
                @RecordDate,
                @RecordType,
                @Description,
                CASE WHEN @VeterinarianStaffID_Clear = 1 THEN NULL ELSE ISNULL(@VeterinarianStaffID, NULL) END,
                ISNULL(@Cost, 0),
                CASE WHEN @FollowUpDate_Clear = 1 THEN NULL ELSE ISNULL(@FollowUpDate, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwMedicalRecords] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateMedicalRecord] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Medical Records */

GRANT EXECUTE ON [DogShelter].[spCreateMedicalRecord] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Medical Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Medical Records
-- Item: spUpdateMedicalRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MedicalRecord
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateMedicalRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateMedicalRecord];
GO

CREATE PROCEDURE [DogShelter].[spUpdateMedicalRecord]
    @ID uniqueidentifier,
    @DogID uniqueidentifier = NULL,
    @RecordDate date = NULL,
    @RecordType nvarchar(30) = NULL,
    @Description nvarchar(500) = NULL,
    @VeterinarianStaffID_Clear bit = 0,
    @VeterinarianStaffID uniqueidentifier = NULL,
    @Cost decimal(10, 2) = NULL,
    @FollowUpDate_Clear bit = 0,
    @FollowUpDate date = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[MedicalRecord]
    SET
        [DogID] = ISNULL(@DogID, [DogID]),
        [RecordDate] = ISNULL(@RecordDate, [RecordDate]),
        [RecordType] = ISNULL(@RecordType, [RecordType]),
        [Description] = ISNULL(@Description, [Description]),
        [VeterinarianStaffID] = CASE WHEN @VeterinarianStaffID_Clear = 1 THEN NULL ELSE ISNULL(@VeterinarianStaffID, [VeterinarianStaffID]) END,
        [Cost] = ISNULL(@Cost, [Cost]),
        [FollowUpDate] = CASE WHEN @FollowUpDate_Clear = 1 THEN NULL ELSE ISNULL(@FollowUpDate, [FollowUpDate]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwMedicalRecords] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwMedicalRecords]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateMedicalRecord] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MedicalRecord table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateMedicalRecord]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateMedicalRecord];
GO
CREATE TRIGGER [DogShelter].trgUpdateMedicalRecord
ON [DogShelter].[MedicalRecord]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[MedicalRecord]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[MedicalRecord] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Medical Records */

GRANT EXECUTE ON [DogShelter].[spUpdateMedicalRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Medical Records */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Medical Records
-- Item: spDeleteMedicalRecord
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MedicalRecord
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteMedicalRecord]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteMedicalRecord];
GO

CREATE PROCEDURE [DogShelter].[spDeleteMedicalRecord]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[MedicalRecord]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteMedicalRecord] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Medical Records */

GRANT EXECUTE ON [DogShelter].[spDeleteMedicalRecord] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Foster Placements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Foster Placements
-- Item: vwFosterPlacements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Foster Placements
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  FosterPlacement
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwFosterPlacements]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwFosterPlacements];
GO

CREATE VIEW [DogShelter].[vwFosterPlacements]
AS
SELECT
    f.*,
    DogShelterDog_DogID.[Name] AS [Dog]
FROM
    [DogShelter].[FosterPlacement] AS f
INNER JOIN
    [DogShelter].[Dog] AS DogShelterDog_DogID
  ON
    [f].[DogID] = DogShelterDog_DogID.[ID]
GO
GRANT SELECT ON [DogShelter].[vwFosterPlacements] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Foster Placements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Foster Placements
-- Item: Permissions for vwFosterPlacements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwFosterPlacements] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Foster Placements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Foster Placements
-- Item: spCreateFosterPlacement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FosterPlacement
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateFosterPlacement]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateFosterPlacement];
GO

CREATE PROCEDURE [DogShelter].[spCreateFosterPlacement]
    @ID uniqueidentifier = NULL,
    @DogID uniqueidentifier,
    @FosterAdopterID uniqueidentifier,
    @StartDate date,
    @EndDate_Clear bit = 0,
    @EndDate date = NULL,
    @Status nvarchar(20) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(200) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[FosterPlacement]
            (
                [ID],
                [DogID],
                [FosterAdopterID],
                [StartDate],
                [EndDate],
                [Status],
                [Reason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DogID,
                @FosterAdopterID,
                @StartDate,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[FosterPlacement]
            (
                [DogID],
                [FosterAdopterID],
                [StartDate],
                [EndDate],
                [Status],
                [Reason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DogID,
                @FosterAdopterID,
                @StartDate,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwFosterPlacements] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateFosterPlacement] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Foster Placements */

GRANT EXECUTE ON [DogShelter].[spCreateFosterPlacement] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Foster Placements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Foster Placements
-- Item: spUpdateFosterPlacement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FosterPlacement
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateFosterPlacement]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateFosterPlacement];
GO

CREATE PROCEDURE [DogShelter].[spUpdateFosterPlacement]
    @ID uniqueidentifier,
    @DogID uniqueidentifier = NULL,
    @FosterAdopterID uniqueidentifier = NULL,
    @StartDate date = NULL,
    @EndDate_Clear bit = 0,
    @EndDate date = NULL,
    @Status nvarchar(20) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(200) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[FosterPlacement]
    SET
        [DogID] = ISNULL(@DogID, [DogID]),
        [FosterAdopterID] = ISNULL(@FosterAdopterID, [FosterAdopterID]),
        [StartDate] = ISNULL(@StartDate, [StartDate]),
        [EndDate] = CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, [EndDate]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwFosterPlacements] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwFosterPlacements]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateFosterPlacement] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FosterPlacement table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateFosterPlacement]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateFosterPlacement];
GO
CREATE TRIGGER [DogShelter].trgUpdateFosterPlacement
ON [DogShelter].[FosterPlacement]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[FosterPlacement]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[FosterPlacement] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Foster Placements */

GRANT EXECUTE ON [DogShelter].[spUpdateFosterPlacement] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Foster Placements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Foster Placements
-- Item: spDeleteFosterPlacement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FosterPlacement
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteFosterPlacement]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteFosterPlacement];
GO

CREATE PROCEDURE [DogShelter].[spDeleteFosterPlacement]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[FosterPlacement]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteFosterPlacement] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Foster Placements */

GRANT EXECUTE ON [DogShelter].[spDeleteFosterPlacement] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 66E1D3AB-B606-47FD-A8C6-80D51433AABC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='66E1D3AB-B606-47FD-A8C6-80D51433AABC', @RelatedEntityNameFieldMap='SecondaryBreed';

/* SQL text to update entity field related entity name field map for entity field ID 8EEE0752-E10A-4FD5-BCAB-0521D55942C0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8EEE0752-E10A-4FD5-BCAB-0521D55942C0', @RelatedEntityNameFieldMap='Mother';

/* Root ID Function SQL for Dogs.MotherID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dogs
-- Item: fnDogMotherID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Dog].[MotherID]
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[fnDogMotherID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [DogShelter].[fnDogMotherID_GetRootID];
GO

CREATE FUNCTION [DogShelter].[fnDogMotherID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [MotherID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [DogShelter].[Dog]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[MotherID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [DogShelter].[Dog] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[MotherID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [MotherID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dogs
-- Item: vwDogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dogs
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Dog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwDogs]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwDogs];
GO

CREATE VIEW [DogShelter].[vwDogs]
AS
SELECT
    d.*,
    DogShelterShelter_ShelterID.[Name] AS [Shelter],
    DogShelterBreed_PrimaryBreedID.[Name] AS [PrimaryBreed],
    DogShelterBreed_SecondaryBreedID.[Name] AS [SecondaryBreed],
    DogShelterDog_MotherID.[Name] AS [Mother],
    root_MotherID.RootID AS [RootMotherID]
FROM
    [DogShelter].[Dog] AS d
INNER JOIN
    [DogShelter].[Shelter] AS DogShelterShelter_ShelterID
  ON
    [d].[ShelterID] = DogShelterShelter_ShelterID.[ID]
INNER JOIN
    [DogShelter].[Breed] AS DogShelterBreed_PrimaryBreedID
  ON
    [d].[PrimaryBreedID] = DogShelterBreed_PrimaryBreedID.[ID]
LEFT OUTER JOIN
    [DogShelter].[Breed] AS DogShelterBreed_SecondaryBreedID
  ON
    [d].[SecondaryBreedID] = DogShelterBreed_SecondaryBreedID.[ID]
LEFT OUTER JOIN
    [DogShelter].[Dog] AS DogShelterDog_MotherID
  ON
    [d].[MotherID] = DogShelterDog_MotherID.[ID]
OUTER APPLY
    [DogShelter].[fnDogMotherID_GetRootID]([d].[ID], [d].[MotherID]) AS root_MotherID
GO
GRANT SELECT ON [DogShelter].[vwDogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dogs
-- Item: Permissions for vwDogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwDogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dogs
-- Item: spCreateDog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Dog
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateDog]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateDog];
GO

CREATE PROCEDURE [DogShelter].[spCreateDog]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @ShelterID uniqueidentifier,
    @PrimaryBreedID uniqueidentifier,
    @SecondaryBreedID_Clear bit = 0,
    @SecondaryBreedID uniqueidentifier = NULL,
    @MotherID_Clear bit = 0,
    @MotherID uniqueidentifier = NULL,
    @Sex nvarchar(10),
    @EstimatedBirthDate_Clear bit = 0,
    @EstimatedBirthDate date = NULL,
    @WeightLbs_Clear bit = 0,
    @WeightLbs decimal(6, 2) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(100) = NULL,
    @MicrochipNumber_Clear bit = 0,
    @MicrochipNumber nvarchar(50) = NULL,
    @IntakeDate date,
    @IntakeType nvarchar(30),
    @Status nvarchar(30) = NULL,
    @OutcomeDate_Clear bit = 0,
    @OutcomeDate date = NULL,
    @IsSpayedNeutered bit = NULL,
    @IsHouseTrained bit = NULL,
    @GoodWithDogs_Clear bit = 0,
    @GoodWithDogs bit = NULL,
    @GoodWithCats_Clear bit = 0,
    @GoodWithCats bit = NULL,
    @GoodWithKids_Clear bit = 0,
    @GoodWithKids bit = NULL,
    @AdoptionFee decimal(10, 2) = NULL,
    @Bio_Clear bit = 0,
    @Bio nvarchar(MAX) = NULL,
    @PhotoURL_Clear bit = 0,
    @PhotoURL nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Dog]
            (
                [ID],
                [Name],
                [ShelterID],
                [PrimaryBreedID],
                [SecondaryBreedID],
                [MotherID],
                [Sex],
                [EstimatedBirthDate],
                [WeightLbs],
                [Color],
                [MicrochipNumber],
                [IntakeDate],
                [IntakeType],
                [Status],
                [OutcomeDate],
                [IsSpayedNeutered],
                [IsHouseTrained],
                [GoodWithDogs],
                [GoodWithCats],
                [GoodWithKids],
                [AdoptionFee],
                [Bio],
                [PhotoURL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @ShelterID,
                @PrimaryBreedID,
                CASE WHEN @SecondaryBreedID_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryBreedID, NULL) END,
                CASE WHEN @MotherID_Clear = 1 THEN NULL ELSE ISNULL(@MotherID, NULL) END,
                @Sex,
                CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, NULL) END,
                CASE WHEN @WeightLbs_Clear = 1 THEN NULL ELSE ISNULL(@WeightLbs, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, NULL) END,
                @IntakeDate,
                @IntakeType,
                ISNULL(@Status, 'Intake'),
                CASE WHEN @OutcomeDate_Clear = 1 THEN NULL ELSE ISNULL(@OutcomeDate, NULL) END,
                ISNULL(@IsSpayedNeutered, 0),
                ISNULL(@IsHouseTrained, 0),
                CASE WHEN @GoodWithDogs_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithDogs, NULL) END,
                CASE WHEN @GoodWithCats_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithCats, NULL) END,
                CASE WHEN @GoodWithKids_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithKids, NULL) END,
                ISNULL(@AdoptionFee, 0),
                CASE WHEN @Bio_Clear = 1 THEN NULL ELSE ISNULL(@Bio, NULL) END,
                CASE WHEN @PhotoURL_Clear = 1 THEN NULL ELSE ISNULL(@PhotoURL, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Dog]
            (
                [Name],
                [ShelterID],
                [PrimaryBreedID],
                [SecondaryBreedID],
                [MotherID],
                [Sex],
                [EstimatedBirthDate],
                [WeightLbs],
                [Color],
                [MicrochipNumber],
                [IntakeDate],
                [IntakeType],
                [Status],
                [OutcomeDate],
                [IsSpayedNeutered],
                [IsHouseTrained],
                [GoodWithDogs],
                [GoodWithCats],
                [GoodWithKids],
                [AdoptionFee],
                [Bio],
                [PhotoURL]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @ShelterID,
                @PrimaryBreedID,
                CASE WHEN @SecondaryBreedID_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryBreedID, NULL) END,
                CASE WHEN @MotherID_Clear = 1 THEN NULL ELSE ISNULL(@MotherID, NULL) END,
                @Sex,
                CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, NULL) END,
                CASE WHEN @WeightLbs_Clear = 1 THEN NULL ELSE ISNULL(@WeightLbs, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, NULL) END,
                @IntakeDate,
                @IntakeType,
                ISNULL(@Status, 'Intake'),
                CASE WHEN @OutcomeDate_Clear = 1 THEN NULL ELSE ISNULL(@OutcomeDate, NULL) END,
                ISNULL(@IsSpayedNeutered, 0),
                ISNULL(@IsHouseTrained, 0),
                CASE WHEN @GoodWithDogs_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithDogs, NULL) END,
                CASE WHEN @GoodWithCats_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithCats, NULL) END,
                CASE WHEN @GoodWithKids_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithKids, NULL) END,
                ISNULL(@AdoptionFee, 0),
                CASE WHEN @Bio_Clear = 1 THEN NULL ELSE ISNULL(@Bio, NULL) END,
                CASE WHEN @PhotoURL_Clear = 1 THEN NULL ELSE ISNULL(@PhotoURL, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwDogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateDog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Dogs */

GRANT EXECUTE ON [DogShelter].[spCreateDog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dogs
-- Item: spUpdateDog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Dog
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateDog]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateDog];
GO

CREATE PROCEDURE [DogShelter].[spUpdateDog]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @ShelterID uniqueidentifier = NULL,
    @PrimaryBreedID uniqueidentifier = NULL,
    @SecondaryBreedID_Clear bit = 0,
    @SecondaryBreedID uniqueidentifier = NULL,
    @MotherID_Clear bit = 0,
    @MotherID uniqueidentifier = NULL,
    @Sex nvarchar(10) = NULL,
    @EstimatedBirthDate_Clear bit = 0,
    @EstimatedBirthDate date = NULL,
    @WeightLbs_Clear bit = 0,
    @WeightLbs decimal(6, 2) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(100) = NULL,
    @MicrochipNumber_Clear bit = 0,
    @MicrochipNumber nvarchar(50) = NULL,
    @IntakeDate date = NULL,
    @IntakeType nvarchar(30) = NULL,
    @Status nvarchar(30) = NULL,
    @OutcomeDate_Clear bit = 0,
    @OutcomeDate date = NULL,
    @IsSpayedNeutered bit = NULL,
    @IsHouseTrained bit = NULL,
    @GoodWithDogs_Clear bit = 0,
    @GoodWithDogs bit = NULL,
    @GoodWithCats_Clear bit = 0,
    @GoodWithCats bit = NULL,
    @GoodWithKids_Clear bit = 0,
    @GoodWithKids bit = NULL,
    @AdoptionFee decimal(10, 2) = NULL,
    @Bio_Clear bit = 0,
    @Bio nvarchar(MAX) = NULL,
    @PhotoURL_Clear bit = 0,
    @PhotoURL nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Dog]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [ShelterID] = ISNULL(@ShelterID, [ShelterID]),
        [PrimaryBreedID] = ISNULL(@PrimaryBreedID, [PrimaryBreedID]),
        [SecondaryBreedID] = CASE WHEN @SecondaryBreedID_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryBreedID, [SecondaryBreedID]) END,
        [MotherID] = CASE WHEN @MotherID_Clear = 1 THEN NULL ELSE ISNULL(@MotherID, [MotherID]) END,
        [Sex] = ISNULL(@Sex, [Sex]),
        [EstimatedBirthDate] = CASE WHEN @EstimatedBirthDate_Clear = 1 THEN NULL ELSE ISNULL(@EstimatedBirthDate, [EstimatedBirthDate]) END,
        [WeightLbs] = CASE WHEN @WeightLbs_Clear = 1 THEN NULL ELSE ISNULL(@WeightLbs, [WeightLbs]) END,
        [Color] = CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, [Color]) END,
        [MicrochipNumber] = CASE WHEN @MicrochipNumber_Clear = 1 THEN NULL ELSE ISNULL(@MicrochipNumber, [MicrochipNumber]) END,
        [IntakeDate] = ISNULL(@IntakeDate, [IntakeDate]),
        [IntakeType] = ISNULL(@IntakeType, [IntakeType]),
        [Status] = ISNULL(@Status, [Status]),
        [OutcomeDate] = CASE WHEN @OutcomeDate_Clear = 1 THEN NULL ELSE ISNULL(@OutcomeDate, [OutcomeDate]) END,
        [IsSpayedNeutered] = ISNULL(@IsSpayedNeutered, [IsSpayedNeutered]),
        [IsHouseTrained] = ISNULL(@IsHouseTrained, [IsHouseTrained]),
        [GoodWithDogs] = CASE WHEN @GoodWithDogs_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithDogs, [GoodWithDogs]) END,
        [GoodWithCats] = CASE WHEN @GoodWithCats_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithCats, [GoodWithCats]) END,
        [GoodWithKids] = CASE WHEN @GoodWithKids_Clear = 1 THEN NULL ELSE ISNULL(@GoodWithKids, [GoodWithKids]) END,
        [AdoptionFee] = ISNULL(@AdoptionFee, [AdoptionFee]),
        [Bio] = CASE WHEN @Bio_Clear = 1 THEN NULL ELSE ISNULL(@Bio, [Bio]) END,
        [PhotoURL] = CASE WHEN @PhotoURL_Clear = 1 THEN NULL ELSE ISNULL(@PhotoURL, [PhotoURL]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwDogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwDogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateDog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Dog table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateDog]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateDog];
GO
CREATE TRIGGER [DogShelter].trgUpdateDog
ON [DogShelter].[Dog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Dog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Dog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Dogs */

GRANT EXECUTE ON [DogShelter].[spUpdateDog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Dogs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dogs
-- Item: spDeleteDog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dog
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteDog]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteDog];
GO

CREATE PROCEDURE [DogShelter].[spDeleteDog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Dog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteDog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Dogs */

GRANT EXECUTE ON [DogShelter].[spDeleteDog] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Shelter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Staff */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Staffs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ShelterID in table Staff
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Staff_ShelterID' 
    AND object_id = OBJECT_ID('[DogShelter].[Staff]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Staff_ShelterID ON [DogShelter].[Staff] ([ShelterID]);

-- Index for foreign key SupervisorID in table Staff
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Staff_SupervisorID' 
    AND object_id = OBJECT_ID('[DogShelter].[Staff]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Staff_SupervisorID ON [DogShelter].[Staff] ([SupervisorID]);

/* SQL text to update entity field related entity name field map for entity field ID 630B7D99-3F7E-415A-A9E4-6DA651EF25AB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='630B7D99-3F7E-415A-A9E4-6DA651EF25AB', @RelatedEntityNameFieldMap='Shelter';

/* Base View SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: vwShelters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Shelters
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Shelter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwShelters]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwShelters];
GO

CREATE VIEW [DogShelter].[vwShelters]
AS
SELECT
    s.*
FROM
    [DogShelter].[Shelter] AS s
GO
GRANT SELECT ON [DogShelter].[vwShelters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: Permissions for vwShelters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwShelters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: spCreateShelter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Shelter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateShelter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateShelter];
GO

CREATE PROCEDURE [DogShelter].[spCreateShelter]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City nvarchar(100),
    @State nvarchar(50),
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @KennelCapacity int = NULL,
    @OpenedDate_Clear bit = 0,
    @OpenedDate date = NULL,
    @IsAcceptingIntakes bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Shelter]
            (
                [ID],
                [Name],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [Phone],
                [Email],
                [KennelCapacity],
                [OpenedDate],
                [IsAcceptingIntakes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                @City,
                @State,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@KennelCapacity, 40),
                CASE WHEN @OpenedDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenedDate, NULL) END,
                ISNULL(@IsAcceptingIntakes, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Shelter]
            (
                [Name],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [Phone],
                [Email],
                [KennelCapacity],
                [OpenedDate],
                [IsAcceptingIntakes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                @City,
                @State,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@KennelCapacity, 40),
                CASE WHEN @OpenedDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenedDate, NULL) END,
                ISNULL(@IsAcceptingIntakes, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwShelters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateShelter] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Shelters */

GRANT EXECUTE ON [DogShelter].[spCreateShelter] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: spUpdateShelter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Shelter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateShelter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateShelter];
GO

CREATE PROCEDURE [DogShelter].[spUpdateShelter]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City nvarchar(100) = NULL,
    @State nvarchar(50) = NULL,
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @KennelCapacity int = NULL,
    @OpenedDate_Clear bit = 0,
    @OpenedDate date = NULL,
    @IsAcceptingIntakes bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Shelter]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [AddressLine1] = CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, [AddressLine1]) END,
        [City] = ISNULL(@City, [City]),
        [State] = ISNULL(@State, [State]),
        [PostalCode] = CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, [PostalCode]) END,
        [Phone] = CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, [Phone]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [KennelCapacity] = ISNULL(@KennelCapacity, [KennelCapacity]),
        [OpenedDate] = CASE WHEN @OpenedDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenedDate, [OpenedDate]) END,
        [IsAcceptingIntakes] = ISNULL(@IsAcceptingIntakes, [IsAcceptingIntakes])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwShelters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwShelters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateShelter] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Shelter table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateShelter]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateShelter];
GO
CREATE TRIGGER [DogShelter].trgUpdateShelter
ON [DogShelter].[Shelter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Shelter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Shelter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Shelters */

GRANT EXECUTE ON [DogShelter].[spUpdateShelter] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: spDeleteShelter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Shelter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteShelter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteShelter];
GO

CREATE PROCEDURE [DogShelter].[spDeleteShelter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Shelter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteShelter] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Shelters */

GRANT EXECUTE ON [DogShelter].[spDeleteShelter] TO [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for Staffs.SupervisorID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Staffs
-- Item: fnStaffSupervisorID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Staff].[SupervisorID]
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[fnStaffSupervisorID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [DogShelter].[fnStaffSupervisorID_GetRootID];
GO

CREATE FUNCTION [DogShelter].[fnStaffSupervisorID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [SupervisorID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [DogShelter].[Staff]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[SupervisorID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [DogShelter].[Staff] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[SupervisorID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [SupervisorID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for Staffs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Staffs
-- Item: vwStaffs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Staffs
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Staff
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwStaffs]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwStaffs];
GO

CREATE VIEW [DogShelter].[vwStaffs]
AS
SELECT
    s.*,
    DogShelterShelter_ShelterID.[Name] AS [Shelter],
    root_SupervisorID.RootID AS [RootSupervisorID]
FROM
    [DogShelter].[Staff] AS s
INNER JOIN
    [DogShelter].[Shelter] AS DogShelterShelter_ShelterID
  ON
    [s].[ShelterID] = DogShelterShelter_ShelterID.[ID]
OUTER APPLY
    [DogShelter].[fnStaffSupervisorID_GetRootID]([s].[ID], [s].[SupervisorID]) AS root_SupervisorID
GO
GRANT SELECT ON [DogShelter].[vwStaffs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Staffs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Staffs
-- Item: Permissions for vwStaffs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwStaffs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Staffs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Staffs
-- Item: spCreateStaff
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Staff
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateStaff]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateStaff];
GO

CREATE PROCEDURE [DogShelter].[spCreateStaff]
    @ID uniqueidentifier = NULL,
    @ShelterID uniqueidentifier,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @Role nvarchar(50),
    @HireDate date,
    @IsActive bit = NULL,
    @SupervisorID_Clear bit = 0,
    @SupervisorID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Staff]
            (
                [ID],
                [ShelterID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Role],
                [HireDate],
                [IsActive],
                [SupervisorID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ShelterID,
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                @Role,
                @HireDate,
                ISNULL(@IsActive, 1),
                CASE WHEN @SupervisorID_Clear = 1 THEN NULL ELSE ISNULL(@SupervisorID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Staff]
            (
                [ShelterID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [Role],
                [HireDate],
                [IsActive],
                [SupervisorID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ShelterID,
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                @Role,
                @HireDate,
                ISNULL(@IsActive, 1),
                CASE WHEN @SupervisorID_Clear = 1 THEN NULL ELSE ISNULL(@SupervisorID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwStaffs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateStaff] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Staffs */

GRANT EXECUTE ON [DogShelter].[spCreateStaff] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Staffs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Staffs
-- Item: spUpdateStaff
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Staff
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateStaff]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateStaff];
GO

CREATE PROCEDURE [DogShelter].[spUpdateStaff]
    @ID uniqueidentifier,
    @ShelterID uniqueidentifier = NULL,
    @FirstName nvarchar(100) = NULL,
    @LastName nvarchar(100) = NULL,
    @Email nvarchar(255) = NULL,
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @Role nvarchar(50) = NULL,
    @HireDate date = NULL,
    @IsActive bit = NULL,
    @SupervisorID_Clear bit = 0,
    @SupervisorID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Staff]
    SET
        [ShelterID] = ISNULL(@ShelterID, [ShelterID]),
        [FirstName] = ISNULL(@FirstName, [FirstName]),
        [LastName] = ISNULL(@LastName, [LastName]),
        [Email] = ISNULL(@Email, [Email]),
        [Phone] = CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, [Phone]) END,
        [Role] = ISNULL(@Role, [Role]),
        [HireDate] = ISNULL(@HireDate, [HireDate]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [SupervisorID] = CASE WHEN @SupervisorID_Clear = 1 THEN NULL ELSE ISNULL(@SupervisorID, [SupervisorID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwStaffs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwStaffs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateStaff] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Staff table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateStaff]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateStaff];
GO
CREATE TRIGGER [DogShelter].trgUpdateStaff
ON [DogShelter].[Staff]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Staff]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Staff] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Staffs */

GRANT EXECUTE ON [DogShelter].[spUpdateStaff] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Staffs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Staffs
-- Item: spDeleteStaff
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Staff
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteStaff]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteStaff];
GO

CREATE PROCEDURE [DogShelter].[spDeleteStaff]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Staff]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteStaff] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Staffs */

GRANT EXECUTE ON [DogShelter].[spDeleteStaff] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Trait */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Traits
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Traits
-- Item: vwTraits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Traits
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Trait
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwTraits]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwTraits];
GO

CREATE VIEW [DogShelter].[vwTraits]
AS
SELECT
    t.*
FROM
    [DogShelter].[Trait] AS t
GO
GRANT SELECT ON [DogShelter].[vwTraits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Traits
-- Item: Permissions for vwTraits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwTraits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Traits
-- Item: spCreateTrait
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Trait
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateTrait]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateTrait];
GO

CREATE PROCEDURE [DogShelter].[spCreateTrait]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Category nvarchar(30),
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Trait]
            (
                [ID],
                [Name],
                [Category],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Category,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Trait]
            (
                [Name],
                [Category],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Category,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwTraits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateTrait] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Traits */

GRANT EXECUTE ON [DogShelter].[spCreateTrait] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Traits
-- Item: spUpdateTrait
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Trait
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateTrait]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateTrait];
GO

CREATE PROCEDURE [DogShelter].[spUpdateTrait]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Category nvarchar(30) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Trait]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Category] = ISNULL(@Category, [Category]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwTraits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwTraits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateTrait] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Trait table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateTrait]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateTrait];
GO
CREATE TRIGGER [DogShelter].trgUpdateTrait
ON [DogShelter].[Trait]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Trait]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Trait] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Traits */

GRANT EXECUTE ON [DogShelter].[spUpdateTrait] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Traits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Traits
-- Item: spDeleteTrait
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Trait
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteTrait]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteTrait];
GO

CREATE PROCEDURE [DogShelter].[spDeleteTrait]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Trait]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteTrait] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Traits */

GRANT EXECUTE ON [DogShelter].[spDeleteTrait] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf0250eb-e235-4e4d-afde-a59223c0d29a' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'Dog')) BEGIN
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
            'cf0250eb-e235-4e4d-afde-a59223c0d29a',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 9,
            'Dog',
            'Dog',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '21b2baca-0369-4f35-b3d7-9bd27c0213db' OR (EntityID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8' AND Name = 'Trait')) BEGIN
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
            '21b2baca-0369-4f35-b3d7-9bd27c0213db',
            '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', -- Entity: Dog Traits
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8') + 10,
            'Trait',
            'Trait',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7581fc66-4e27-44ef-8532-da6ae7216c51' OR (EntityID = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7' AND Name = 'Dog')) BEGIN
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
            '7581fc66-4e27-44ef-8532-da6ae7216c51',
            'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', -- Entity: Adoption Applications
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7') + 14,
            'Dog',
            'Dog',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9cec96f5-42df-4ad7-a9ec-8013b8f82519' OR (EntityID = '55903600-D02D-4E83-8614-3D989DF836A8' AND Name = 'Dog')) BEGIN
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
            '9cec96f5-42df-4ad7-a9ec-8013b8f82519',
            '55903600-D02D-4E83-8614-3D989DF836A8', -- Entity: Foster Placements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8') + 11,
            'Dog',
            'Dog',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9141526b-6df2-41a6-80c8-bd5f1a38e737' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'Shelter')) BEGIN
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
            '9141526b-6df2-41a6-80c8-bd5f1a38e737',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 14,
            'Shelter',
            'Shelter',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e6e1577-fb81-43a9-bcbf-55da0c4370f6' OR (EntityID = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF' AND Name = 'RootSupervisorID')) BEGIN
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
            '8e6e1577-fb81-43a9-bcbf-55da0c4370f6',
            'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', -- Entity: Staffs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF') + 15,
            'RootSupervisorID',
            'Root Supervisor ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f0da76d-bef6-427e-bddf-5d3de7e125df' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'Shelter')) BEGIN
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
            '5f0da76d-bef6-427e-bddf-5d3de7e125df',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 28,
            'Shelter',
            'Shelter',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20a6b06e-a101-40cc-8ac1-81c3ebc9618f' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'PrimaryBreed')) BEGIN
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
            '20a6b06e-a101-40cc-8ac1-81c3ebc9618f',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 29,
            'PrimaryBreed',
            'Primary Breed',
            NULL,
            'nvarchar',
            300,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1497456e-edfd-469b-9ed7-0f08447cdaa1' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'SecondaryBreed')) BEGIN
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
            '1497456e-edfd-469b-9ed7-0f08447cdaa1',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 30,
            'SecondaryBreed',
            'Secondary Breed',
            NULL,
            'nvarchar',
            300,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b067ce1a-edb9-4d27-9304-cff33080309e' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'Mother')) BEGIN
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
            'b067ce1a-edb9-4d27-9304-cff33080309e',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 31,
            'Mother',
            'Mother',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58d88020-4eaa-4d39-915d-697bc2bd8c0d' OR (EntityID = 'FCD6413F-411A-4B50-9D31-82C271AEA652' AND Name = 'RootMotherID')) BEGIN
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
            '58d88020-4eaa-4d39-915d-697bc2bd8c0d',
            'FCD6413F-411A-4B50-9D31-82C271AEA652', -- Entity: Dogs
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652') + 32,
            'RootMotherID',
            'Root Mother ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae2e2381-8bb7-4235-993a-8fe6444f590f' OR (EntityID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7' AND Name = 'Dog')) BEGIN
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
            'ae2e2381-8bb7-4235-993a-8fe6444f590f',
            'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', -- Entity: Medical Records
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7') + 12,
            'Dog',
            'Dog',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '21CFE73B-5382-4166-9AD0-BFBC15103A23'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CF0250EB-E235-4E4D-AFDE-A59223C0D29A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '21B2BACA-0369-4F35-B3D7-9BD27C0213DB'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1D976443-FADE-42A1-8B79-2409EE702DF4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BF37004F-878A-4E35-91E4-7E4A97D8F329'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '38387ABA-ABD1-46CF-8EE0-F95EA10645D1'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2F893E29-CAA4-4B60-BEFA-70E9982321FD'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A778DA8D-FC3B-4A2A-9DE9-9652733F507F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '44B660CD-AD0F-47BC-AF51-2801C3CC5027'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '63A906AE-49B2-4007-8E56-3D1A9306D927'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4873579A-CBCD-494C-941C-DDC45C4FB68A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B963BE29-F669-488D-90B5-086734E7199A'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F6A589BD-65E6-4C22-98E8-6F8346A6B682'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '51763C24-B9E6-4FE2-A694-60C2203D6AA5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '56102C23-F258-4D60-A58F-D1D2DCE99FBB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9CEC96F5-42DF-4AD7-A9EC-8013B8F82519'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9CEC96F5-42DF-4AD7-A9EC-8013B8F82519'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '9CEC96F5-42DF-4AD7-A9EC-8013B8F82519'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7863A449-ED62-4EC5-BFA0-8BA562B7F59C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '207F6CDC-3C84-4657-9EDC-CEE485541EA4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7581FC66-4E27-44EF-8532-DA6AE7216C51'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7581FC66-4E27-44EF-8532-DA6AE7216C51'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '7581FC66-4E27-44EF-8532-DA6AE7216C51'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '34F764A7-E8E5-4765-8C82-5F7BFB3ADE47'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A55093F1-B990-4587-B3B7-992F91EA719A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0401E99B-EF30-4602-9FAB-627A52BC5830'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'CABAB653-4426-44F0-B9E8-1949CB08D4CF'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CABAB653-4426-44F0-B9E8-1949CB08D4CF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A6387016-8405-46C4-950C-C906835917D4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BCAB5492-7F44-46AB-81BE-10DD9D73655F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '40F34029-BA8E-4BA9-BD5D-E531A9CA09DA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1D0D2257-78C8-4562-999B-9BA5580549D2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3BCA9149-6E3C-42A4-9F4F-3312A0FC6E08'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CABAB653-4426-44F0-B9E8-1949CB08D4CF'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A6387016-8405-46C4-950C-C906835917D4'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BCAB5492-7F44-46AB-81BE-10DD9D73655F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CABAB653-4426-44F0-B9E8-1949CB08D4CF'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A6387016-8405-46C4-950C-C906835917D4'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'BCAB5492-7F44-46AB-81BE-10DD9D73655F'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'D7EFA1DD-769C-45C0-B5DC-3EEF1201FE11'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '486275CA-9E7F-44FA-B685-73B5526FA624'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '15D0CC3A-D50B-44AD-A195-6C366B106CA0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C23E0297-D40A-49A1-AAF5-5A6168FDF94B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6BA3A69E-7935-4B85-9653-B2B41512A0D5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BB738FF1-80C1-43E6-80AE-EA07C2CFFC9B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D7EFA1DD-769C-45C0-B5DC-3EEF1201FE11'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B34388A0-EF51-4E2B-982C-CB52114F5D27'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '15D0CC3A-D50B-44AD-A195-6C366B106CA0'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D7EFA1DD-769C-45C0-B5DC-3EEF1201FE11'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'B34388A0-EF51-4E2B-982C-CB52114F5D27'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '15D0CC3A-D50B-44AD-A195-6C366B106CA0'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BE57BF23-47DD-4267-B5E8-DC12D6CD0AD0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1DD31E77-E935-4422-9512-F5570D7B62A9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '8294CBD1-08BF-4C06-B92B-BCBB310093A3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '09EFDB84-80AE-448F-8104-B08BDC858534'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '20A6B06E-A101-40CC-8AC1-81C3EBC9618F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6082DDA7-049C-44B2-976A-B64CFE8F03FF'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '196170CC-4DD8-4E1B-87DE-3F35987CA21C'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '6082DDA7-049C-44B2-976A-B64CFE8F03FF'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info Traits.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C1411053-61BA-4C5B-A808-6400F767049D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Traits.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Trait Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D920D44-D2A1-473D-AD0E-2D2C0CAAC10D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Traits.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Trait Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F893E29-CAA4-4B60-BEFA-70E9982321FD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Traits.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Trait Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E92AAA2-E75D-4E6F-908A-B748D4FB5931' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Traits.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1E86B8A-8E2C-4DA3-9380-00A006707435' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Traits.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AD3E6E87-CC44-4017-975F-2243EF8F4A2F' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-tags */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-tags', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('41e7fa90-15ef-4a8d-8d21-539a5233320c', '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', 'FieldCategoryInfo', '{"Trait Details":{"icon":"fa fa-tag","description":"Core descriptive information for the behavioral or care trait"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('778d9b24-495a-49f3-bfff-e5168daf5aad', '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C', 'FieldCategoryIcons', '{"Trait Details":"fa fa-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '6E47B7B2-7A99-499E-BA4A-83AF20B1AA2C';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info Dog Traits.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '47E8B615-4E74-4868-99F6-CEE9F0C8394B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1607EEAA-F6D8-4E2C-8D50-BB6E214A33B0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.TraitID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Trait',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A3EC8FD-6627-4E1C-8FCC-C0475644E7D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF0250EB-E235-4E4D-AFDE-A59223C0D29A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.Trait 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Trait Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21B2BACA-0369-4F35-B3D7-9BD27C0213DB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.AssignedByStaffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Assigned By Staff',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '034525F7-8550-4842-BA83-936EEA410415' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.AssignedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21CFE73B-5382-4166-9AD0-BFBC15103A23' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Assignment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE0708DE-3424-4A51-B3B5-022CA423A0FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34D274FA-9D5D-49E0-B895-E8DF8F398F23' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dog Traits.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B549AEF-4878-418B-9BCD-E7CDAD3E5999' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-dog */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-dog', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('38bc5ddc-bba6-4299-b90a-25da6d4151d1', '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', 'FieldCategoryInfo', '{"Relationships":{"icon":"fa fa-link","description":"Foreign key references and associated names linking dogs to their traits"},"Assignment Details":{"icon":"fa fa-clipboard-check","description":"Details regarding who assigned the trait, when, and additional context"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info Breeds.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D90101B-AD69-4847-850B-0B58034ACF06' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Breed Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F2E660E-2F27-4CF4-9892-76931FDA20F1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Breed Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA851AA1-6A6F-4630-9C63-2B1135FF0096' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.SizeCategory 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D976443-FADE-42A1-8B79-2409EE702DF4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.TypicalWeightLbsLow 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Typical Weight (Low)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39B9B3B3-B724-4126-9FF9-067F5B35F1E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.TypicalWeightLbsHigh 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Typical Weight (High)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '175ED62E-95D4-4571-A89A-011A1DCEB093' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.TypicalLifespanYears 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Typical Lifespan (Years)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CDE81AB3-5420-4EC9-932F-460C0BD13E74' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.EnergyLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Care Requirements',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BF37004F-878A-4E35-91E4-7E4A97D8F329' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.GroomingNeeds 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Care Requirements',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38387ABA-ABD1-46CF-8EE0-F95EA10645D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E227FE2C-AF1F-43ED-B544-34DADBBB4032' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Breeds.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E9B596D-DEF0-4B56-B004-314654696992' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('08c2625d-1cb8-4bdb-a7fc-2092a6e4b904', '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8', 'FieldCategoryIcons', '{"Relationships":"fa fa-link","Assignment Details":"fa fa-clipboard-check","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '8BA0CCA7-35C1-4482-ADFD-2285D3CEBDE8';

/* Set entity icon to fa fa-dog */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-dog', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5e3e04f9-22a2-42b1-8ad4-4943db60f86e', '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', 'FieldCategoryInfo', '{"Breed Information":{"icon":"fa fa-info-circle","description":"General identification and descriptive information about the dog breed."},"Physical Characteristics":{"icon":"fa fa-weight","description":"Physical traits including size, weight ranges, and lifespan."},"Care Requirements":{"icon":"fa fa-heartbeat","description":"Daily care and maintenance needs used for adoption counseling."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3705d73b-edae-40b3-b12d-cb37e3724c56', '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55', 'FieldCategoryIcons', '{"Breed Information":"fa fa-info-circle","Physical Characteristics":"fa fa-weight","Care Requirements":"fa fa-heartbeat","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info Shelters.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A03179D6-C522-46BE-8C25-C2124502C2E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B963BE29-F669-488D-90B5-086734E7199A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.AddressLine1 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Location Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = '675F10B1-46C6-4096-B8F7-C5C02CD03E7D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.City 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Location Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoCity',
   CodeType = NULL
WHERE 
   ID = 'A778DA8D-FC3B-4A2A-9DE9-9652733F507F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.State 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Location Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoStateProvince',
   CodeType = NULL
WHERE 
   ID = '44B660CD-AD0F-47BC-AF51-2801C3CC5027' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.PostalCode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Location Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoPostalCode',
   CodeType = NULL
WHERE 
   ID = '877AEECF-53E7-4A64-8C49-4AE6295E9606' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.Phone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Tel',
   CodeType = NULL
WHERE 
   ID = '63A906AE-49B2-4007-8E56-3D1A9306D927' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = 'E4CFA6D8-B5CC-4660-9F60-30DB91935DF0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.KennelCapacity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '48CDA013-B588-481D-A3B1-636D17CDC40E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.OpenedDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E027E6C-FE05-495C-B6D6-2A0FE0FDD948' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.IsAcceptingIntakes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Accepting Intakes',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4873579A-CBCD-494C-941C-DDC45C4FB68A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E5398760-F593-4332-9EE6-5F7630C3F9E3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Shelters.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A5656926-3298-4BEE-8DED-D4E55E525B7C' AND AutoUpdateCategory = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info Foster Placements.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B712EA9-18F3-4A46-87DD-B024C868292B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC9CC857-FBEF-42FB-AF2A-D61E7BA8FA52' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CEC96F5-42DF-4AD7-A9EC-8013B8F82519' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.FosterAdopterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Foster Caregiver',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9FBBAA0-1DFE-4441-BD20-05DA44483395' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.StartDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F6A589BD-65E6-4C22-98E8-6F8346A6B682' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.EndDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51763C24-B9E6-4FE2-A694-60C2203D6AA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '56102C23-F258-4D60-A58F-D1D2DCE99FBB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Reason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Placement Reason',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C04C57F-0317-4685-B8DA-F541F184CBA8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Placement Context',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AA9DECE-8685-4166-8E86-818AFA86B670' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC90A9D3-8EAB-4219-A2E0-F4D35631B8FA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Foster Placements.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E0C8A34-E425-43A6-A7F0-EDC59BB2F2EC' AND AutoUpdateCategory = 1;

/* Set SupportsGeoCoding = true for Shelters */

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET [SupportsGeoCoding] = 1
            WHERE [ID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND [AutoUpdateSupportsGeoCoding] = 1;

/* Set entity icon to fa fa-home */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-home', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '55903600-D02D-4E83-8614-3D989DF836A8';

/* Set entity icon to fa fa-home */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-home', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('191d3788-5e86-43ec-b95c-78ce1d2c8a48', '55903600-D02D-4E83-8614-3D989DF836A8', 'FieldCategoryInfo', '{"Placement Details":{"icon":"fa fa-dog","description":"Core information identifying the dog and the foster caregiver"},"Placement Timeline":{"icon":"fa fa-calendar-alt","description":"Dates and status tracking for the foster duration"},"Placement Context":{"icon":"fa fa-align-left","description":"Reasoning for the placement and caregiver observations"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2632e16b-e662-4750-b3b4-bc6a1bd1dde2', '7E53957B-4697-4B59-8EC3-348FDE76FE3B', 'FieldCategoryInfo', '{"Shelter Information":{"icon":"fa fa-info-circle","description":"Core descriptive details and operational status of the shelter"},"Location Details":{"icon":"fa fa-map-marker-alt","description":"Physical address and geographic location information"},"Contact Information":{"icon":"fa fa-envelope","description":"Public contact details for adoption and general inquiries"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2b0e02e1-43c0-4865-bff5-2bbec72a8b04', '55903600-D02D-4E83-8614-3D989DF836A8', 'FieldCategoryIcons', '{"Placement Details":"fa fa-dog","Placement Timeline":"fa fa-calendar-alt","Placement Context":"fa fa-align-left","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a48a22c3-fa6f-464f-8001-3f5aa3c42119', '7E53957B-4697-4B59-8EC3-348FDE76FE3B', 'FieldCategoryIcons', '{"Shelter Information":"fa fa-info-circle","Location Details":"fa fa-map-marker-alt","Contact Information":"fa fa-envelope","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '55903600-D02D-4E83-8614-3D989DF836A8';

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info Medical Records.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F31AE351-F826-4577-BBF2-0E330577531E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Medical Event Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '672904DF-FFEE-4C3E-BC5F-BFB873A6DF6A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Medical Event Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AE2E2381-8BB7-4235-993A-8FE6444F590F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.RecordDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Medical Event Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '34F764A7-E8E5-4765-8C82-5F7BFB3ADE47' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.RecordType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Medical Event Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98870AE1-4AF1-4974-8FB2-1A1C2DC43BE1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Medical Event Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A55093F1-B990-4587-B3B7-992F91EA719A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.VeterinarianStaffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Staff and Follow-up',
   GeneratedFormSection = 'Category',
   DisplayName = 'Veterinarian or Staff',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4ABB5BF0-564B-4E35-8DE9-1FA47BEBAF03' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.FollowUpDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Staff and Follow-up',
   GeneratedFormSection = 'Category',
   DisplayName = 'Follow-up Date',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C833434-D395-427C-8533-84554C6301E1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Clinical Staff and Follow-up',
   GeneratedFormSection = 'Category',
   DisplayName = 'Clinical Notes',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3ECB2CD5-4122-4E42-9D81-A5BFA13DD017' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.Cost 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Financial Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0401E99B-EF30-4602-9FAB-627A52BC5830' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCFDBAA8-44EB-452F-BEBB-F81E20A1841D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Medical Records.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BBE4762-336F-4CC9-AF3B-08BCCCCDB1AE' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-notes-medical */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-notes-medical', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1ac19587-6380-4694-9e8a-9f1a734b37ae', 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', 'FieldCategoryInfo', '{"Medical Event Details":{"icon":"fa fa-stethoscope","description":"Core details regarding the medical procedure or observation"},"Clinical Staff and Follow-up":{"icon":"fa fa-user-md","description":"Information regarding the provider and future care requirements"},"Financial Information":{"icon":"fa fa-dollar-sign","description":"Costs associated with the medical care provided"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2e2e307c-d7dc-479a-a642-e345a11975d8', 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7', 'FieldCategoryIcons', '{"Medical Event Details":"fa fa-stethoscope","Clinical Staff and Follow-up":"fa fa-user-md","Financial Information":"fa fa-dollar-sign","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'BB0DBA63-9E3E-4327-84DF-A0F33A8CB8B7';

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info Adoption Applications.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4AD9F802-E347-469F-8463-32E91EDF513B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.DogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Application Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93C2B8C4-734B-4E55-A3A2-FBF6FB2B52D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.AdopterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Application Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Adopter',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E800A2EC-0941-4242-9226-78072855A718' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.Dog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Application Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dog Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7581FC66-4E27-44EF-8532-DA6AE7216C51' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.SubmittedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Application Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7863A449-ED62-4EC5-BFA0-8BA562B7F59C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow and Review',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC6188BF-960A-41E9-9C0F-68AC876B3ED9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.ReviewedByStaffID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow and Review',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reviewed By Staff',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BEF2939-5E24-4CFB-AA8F-A08A59197451' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.ReviewedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow and Review',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2A1977D6-F366-420D-983A-252B5007F184' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.DecisionNotes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Workflow and Review',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0B68C3C6-3D52-40CC-AF41-B59CB98B648A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.HomeVisitDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Application Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55654386-D8DF-49AC-B392-DE031AD1E2AB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.AdoptionDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Application Timeline',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '207F6CDC-3C84-4657-9EDC-CEE485541EA4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.FeePaid 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Financials',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2097EA3F-2791-44BD-A783-97DC5F23B836' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4769EA7F-A6F0-430E-BC65-740A3E47C782' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adoption Applications.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BF9C770-AD75-45B1-BB68-38B7474D1F29' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-file-signature */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-file-signature', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('94a71045-9186-4c25-8086-faea2cb38bfe', 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', 'FieldCategoryInfo', '{"Application Context":{"icon":"fa fa-info-circle","description":"Core information linking the adopter and the dog being applied for."},"Application Timeline":{"icon":"fa fa-calendar-alt","description":"Key dates related to the application, home visit, and final adoption."},"Workflow and Review":{"icon":"fa fa-clipboard-check","description":"Information regarding the status, staff review, and decision notes."},"Financials":{"icon":"fa fa-dollar-sign","description":"Financial details including collected adoption fees."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields."}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b24f5b82-2e8e-4532-a778-198864bba0e4', 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7', 'FieldCategoryIcons', '{"Application Context":"fa fa-info-circle","Application Timeline":"fa fa-calendar-alt","Workflow and Review":"fa fa-clipboard-check","Financials":"fa fa-dollar-sign","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D2AA9349-07E7-4C1D-B03C-2DFA4A00FDB7';

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info Staffs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C57B3CAC-C91B-4537-811E-F16287CA4F32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.ShelterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Employment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Shelter',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '630B7D99-3F7E-415A-A9E4-6DA651EF25AB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.FirstName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D7EFA1DD-769C-45C0-B5DC-3EEF1201FE11' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.LastName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B34388A0-EF51-4E2B-982C-CB52114F5D27' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.FullName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '486275CA-9E7F-44FA-B685-73B5526FA624' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = '15D0CC3A-D50B-44AD-A195-6C366B106CA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Phone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Tel',
   CodeType = NULL
WHERE 
   ID = 'C23E0297-D40A-49A1-AAF5-5A6168FDF94B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Employment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6BA3A69E-7935-4B85-9653-B2B41512A0D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.HireDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Employment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A52D968-929F-4F42-A846-C5DCF946BEEE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Employment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB738FF1-80C1-43E6-80AE-EA07C2CFFC9B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.SupervisorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Organizational Hierarchy',
   GeneratedFormSection = 'Category',
   DisplayName = 'Supervisor',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D0C8800-26AA-4591-B597-DE850D60EBF8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.RootSupervisorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Organizational Hierarchy',
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Supervisor',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E6E1577-FB81-43A9-BCBF-55DA0C4370F6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.Shelter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Employment Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Shelter Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9141526B-6DF2-41A6-80C8-BD5F1A38E737' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB4871D4-BDD5-4932-AEF8-C240A3B8DCA9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Staffs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A62F8F4-4A61-4772-BAAA-74D66201B26C' AND AutoUpdateCategory = 1;

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info Adopters.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04BA65AB-0674-44EA-8690-52C1E8CBCC56' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.FirstName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CABAB653-4426-44F0-B9E8-1949CB08D4CF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.LastName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6387016-8405-46C4-950C-C906835917D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.FullName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA366156-82B3-4E66-84EC-173EF1D9F35B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = 'BCAB5492-7F44-46AB-81BE-10DD9D73655F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.Phone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Tel',
   CodeType = NULL
WHERE 
   ID = '40F34029-BA8E-4BA9-BD5D-E531A9CA09DA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.AddressLine1 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'BE163A74-DAA3-4F03-94AA-8EF439A5DA2C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.City 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoCity',
   CodeType = NULL
WHERE 
   ID = '1D0D2257-78C8-4562-999B-9BA5580549D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.State 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoStateProvince',
   CodeType = NULL
WHERE 
   ID = '66890C0B-320E-40CD-9F16-451B54DD7B39' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.PostalCode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoPostalCode',
   CodeType = NULL
WHERE 
   ID = 'BCD14E2C-0728-4147-80C0-8FDF9EC09BE7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.HousingType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Household Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6CE508B1-1A15-46EA-A36C-4825E817F8A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.HasFencedYard 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Household Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9692AF52-CC1F-4EB3-B8DD-D092BB8DBB15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.HasOtherPets 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Household Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC82B3B7-E84D-4544-96E8-EC8CEE57D12D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.HouseholdAdults 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Household Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E0BF7327-1C66-4F20-AED2-ADD90BBF74E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.HouseholdChildren 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Household Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E28E4EC2-135A-430E-8862-560F5A2F20E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.IsFosterApproved 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Program Participation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3BCA9149-6E3C-42A4-9F4F-3312A0FC6E08' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.DateRegistered 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Program Participation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCCF9116-A899-48EB-B319-FAFDE1506425' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Program Participation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39CC3CEF-AFD6-4168-AE6A-428A19840B09' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51F1B4C7-DB78-4EF1-BCB3-E1FAAAB3421B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Adopters.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '635E5A8C-5472-4356-A972-B92460B1CE8A' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-users */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-users', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1b24db44-1ecb-4a2b-86ab-307241821894', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-user","description":"Basic identification details for the staff member"},"Contact Information":{"icon":"fa fa-address-card","description":"Communication details including email and phone"},"Employment Details":{"icon":"fa fa-briefcase","description":"Job role, hiring information, and shelter assignment"},"Organizational Hierarchy":{"icon":"fa fa-sitemap","description":"Reporting lines and supervision structure"},"System Metadata":{"icon":"fa fa-cog","description":"Audit and system-level tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4aa9c9ca-d1cb-4664-874e-9df62ec2c206', 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF', 'FieldCategoryIcons', '{"Personal Information":"fa fa-user","Contact Information":"fa fa-address-card","Employment Details":"fa fa-briefcase","Organizational Hierarchy":"fa fa-sitemap","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set SupportsGeoCoding = true for Adopters */

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET [SupportsGeoCoding] = 1
            WHERE [ID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND [AutoUpdateSupportsGeoCoding] = 1;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'F476381C-DFDA-4E8B-B1B5-6250297DE5AF';

/* Set entity icon to fa fa-user-friends */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-user-friends', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('99ab417b-0f8a-4152-94df-a17727a6c638', 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-user","description":"Basic identification details for the adopter"},"Contact Information":{"icon":"fa fa-address-card","description":"Communication details and home location information"},"Household Details":{"icon":"fa fa-home","description":"Information about the adopter''s home environment and family composition"},"Program Participation":{"icon":"fa fa-clipboard-check","description":"Shelter-specific program status, registration dates, and staff notes"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('96b3a0d2-b8a7-4788-9084-c0339b240369', 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', 'FieldCategoryIcons', '{"Personal Information":"fa fa-user","Contact Information":"fa fa-address-card","Household Details":"fa fa-home","Program Participation":"fa fa-clipboard-check","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B';

/* Set categories for 32 fields */

-- UPDATE Entity Field Category Info Dogs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64C2D6DE-EED1-4EA5-975B-D1512F663BF4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '196170CC-4DD8-4E1B-87DE-3F35987CA21C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.ShelterID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Shelter',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '28BA460F-3B98-4F98-957E-1FFFC5F56F3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.PrimaryBreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Breed',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B5ADAF6-BE94-4A18-8597-12E3CA7BFCD6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.SecondaryBreedID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Secondary Breed',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '66E1D3AB-B606-47FD-A8C6-80D51433AABC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.MotherID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Mother',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8EEE0752-E10A-4FD5-BCAB-0521D55942C0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.Sex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BE57BF23-47DD-4267-B5E8-DC12D6CD0AD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.EstimatedBirthDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8C29885D-78BF-4599-B6BC-AB36CF9158A8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.EstimatedAgeMonths 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Estimated Age (Months)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7161142-6947-464C-94D4-BA8BE8B2D329' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.WeightLbs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Weight (Lbs)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1DD31E77-E935-4422-9512-F5570D7B62A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.Color 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E10CEB2D-DDB2-4440-90F4-F7F46AE679F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.MicrochipNumber 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Physical Characteristics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6082DDA7-049C-44B2-976A-B64CFE8F03FF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.IntakeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8294CBD1-08BF-4C06-B92B-BCBB310093A3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.IntakeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '73E1BE99-42E2-4007-BDCA-BDB82C015C6B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09EFDB84-80AE-448F-8104-B08BDC858534' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.OutcomeDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EA348354-F180-44A6-B0A8-F83ECDFB083B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.DaysInCare 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shelter History',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EEEA657B-026E-4D50-A437-45EB2ECF163D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.IsSpayedNeutered 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Health',
   GeneratedFormSection = 'Category',
   DisplayName = 'Spayed/Neutered',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BDE53442-D47E-4AA0-927F-C1A1917DD5B6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.IsHouseTrained 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Health',
   GeneratedFormSection = 'Category',
   DisplayName = 'House Trained',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB274CCA-8AE9-4600-B72A-8F9E85C280FF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.GoodWithDogs 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Health',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE1CBF1E-29B9-42F4-ACAC-5A2AE62D519C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.GoodWithCats 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Health',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBC30ED9-40A5-4587-B8B5-3E3869659013' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.GoodWithKids 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Health',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D8DF69A-59E7-4444-9EE0-BA1A546F6316' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.AdoptionFee 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '813F71CA-3872-4762-8785-2C29BED7C4B2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.Bio 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7D2BDF98-C188-4B0C-9285-6DA2659F4720' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.PhotoURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Adoption Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '796DCBC7-51C4-4C49-9381-77A2F922F3F9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E574B628-8DCF-4EF5-9108-C0933E639BC0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '503E2FF3-9933-4428-B27F-1E1BE02A3B85' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.Shelter 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Shelter Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F0DA76D-BEF6-427E-BDDF-5D3DE7E125DF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.PrimaryBreed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Primary Breed Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20A6B06E-A101-40CC-8AC1-81C3EBC9618F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.SecondaryBreed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Secondary Breed Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1497456E-EDFD-469B-9ED7-0F08447CDAA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.Mother 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Dog Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Mother Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B067CE1A-EDB9-4D27-9304-CFF33080309E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Dogs.RootMotherID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58D88020-4EAA-4D39-915D-697BC2BD8C0D' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-dog */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-dog', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('81947ba2-ee4f-4a88-834e-dc9b27e0ee44', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'FieldCategoryInfo', '{"Dog Information":{"icon":"fa fa-info-circle","description":"Core descriptive details and relationships for the dog"},"Physical Characteristics":{"icon":"fa fa-paw","description":"Biological and physical attributes of the dog"},"Shelter History":{"icon":"fa fa-history","description":"Timeline and status of the dog''s stay in the shelter"},"Behavior and Health":{"icon":"fa fa-heartbeat","description":"Medical, training, and socialization assessment data"},"Adoption Details":{"icon":"fa fa-home","description":"Public-facing listing information and financial details"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking records"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8256224d-76e4-45e3-953e-f385675e14a3', 'FCD6413F-411A-4B50-9D31-82C271AEA652', 'FieldCategoryIcons', '{"Dog Information":"fa fa-info-circle","Physical Characteristics":"fa fa-paw","Shelter History":"fa fa-history","Behavior and Health":"fa fa-heartbeat","Adoption Details":"fa fa-home","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'FCD6413F-411A-4B50-9D31-82C271AEA652';

/* Index for Foreign Keys for Shelter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: vwShelters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Shelters
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Shelter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwShelters]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwShelters];
GO

CREATE VIEW [DogShelter].[vwShelters]
AS
SELECT
    s.*,    ${flyway:defaultSchema}_rgc.[Latitude] AS [${flyway:defaultSchema}_Latitude],
    ${flyway:defaultSchema}_rgc.[Longitude] AS [${flyway:defaultSchema}_Longitude]
FROM
    [DogShelter].[Shelter] AS s
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwRecordGeoCodes] AS ${flyway:defaultSchema}_rgc
  ON
    ${flyway:defaultSchema}_rgc.[EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B'
    AND ${flyway:defaultSchema}_rgc.[RecordID] = CAST([s].[ID] AS NVARCHAR(450))
    AND ${flyway:defaultSchema}_rgc.[LocationType] = 'Primary'
GO
GRANT SELECT ON [DogShelter].[vwShelters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: Permissions for vwShelters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwShelters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: spCreateShelter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Shelter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateShelter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateShelter];
GO

CREATE PROCEDURE [DogShelter].[spCreateShelter]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City nvarchar(100),
    @State nvarchar(50),
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @KennelCapacity int = NULL,
    @OpenedDate_Clear bit = 0,
    @OpenedDate date = NULL,
    @IsAcceptingIntakes bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Shelter]
            (
                [ID],
                [Name],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [Phone],
                [Email],
                [KennelCapacity],
                [OpenedDate],
                [IsAcceptingIntakes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                @City,
                @State,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@KennelCapacity, 40),
                CASE WHEN @OpenedDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenedDate, NULL) END,
                ISNULL(@IsAcceptingIntakes, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Shelter]
            (
                [Name],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [Phone],
                [Email],
                [KennelCapacity],
                [OpenedDate],
                [IsAcceptingIntakes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                @City,
                @State,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                ISNULL(@KennelCapacity, 40),
                CASE WHEN @OpenedDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenedDate, NULL) END,
                ISNULL(@IsAcceptingIntakes, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwShelters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateShelter] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Shelters */

GRANT EXECUTE ON [DogShelter].[spCreateShelter] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: spUpdateShelter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Shelter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateShelter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateShelter];
GO

CREATE PROCEDURE [DogShelter].[spUpdateShelter]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City nvarchar(100) = NULL,
    @State nvarchar(50) = NULL,
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @KennelCapacity int = NULL,
    @OpenedDate_Clear bit = 0,
    @OpenedDate date = NULL,
    @IsAcceptingIntakes bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Shelter]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [AddressLine1] = CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, [AddressLine1]) END,
        [City] = ISNULL(@City, [City]),
        [State] = ISNULL(@State, [State]),
        [PostalCode] = CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, [PostalCode]) END,
        [Phone] = CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, [Phone]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [KennelCapacity] = ISNULL(@KennelCapacity, [KennelCapacity]),
        [OpenedDate] = CASE WHEN @OpenedDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenedDate, [OpenedDate]) END,
        [IsAcceptingIntakes] = ISNULL(@IsAcceptingIntakes, [IsAcceptingIntakes])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwShelters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwShelters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateShelter] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Shelter table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateShelter]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateShelter];
GO
CREATE TRIGGER [DogShelter].trgUpdateShelter
ON [DogShelter].[Shelter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Shelter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Shelter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Shelters */

GRANT EXECUTE ON [DogShelter].[spUpdateShelter] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Shelters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Shelters
-- Item: spDeleteShelter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Shelter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteShelter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteShelter];
GO

CREATE PROCEDURE [DogShelter].[spDeleteShelter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Shelter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteShelter] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Shelters */

GRANT EXECUTE ON [DogShelter].[spDeleteShelter] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Adopter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: vwAdopters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Adopters
-----               SCHEMA:      DogShelter
-----               BASE TABLE:  Adopter
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[vwAdopters]', 'V') IS NOT NULL
    DROP VIEW [DogShelter].[vwAdopters];
GO

CREATE VIEW [DogShelter].[vwAdopters]
AS
SELECT
    a.*,    ${flyway:defaultSchema}_rgc.[Latitude] AS [${flyway:defaultSchema}_Latitude],
    ${flyway:defaultSchema}_rgc.[Longitude] AS [${flyway:defaultSchema}_Longitude]
FROM
    [DogShelter].[Adopter] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwRecordGeoCodes] AS ${flyway:defaultSchema}_rgc
  ON
    ${flyway:defaultSchema}_rgc.[EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B'
    AND ${flyway:defaultSchema}_rgc.[RecordID] = CAST([a].[ID] AS NVARCHAR(450))
    AND ${flyway:defaultSchema}_rgc.[LocationType] = 'Primary'
GO
GRANT SELECT ON [DogShelter].[vwAdopters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: Permissions for vwAdopters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [DogShelter].[vwAdopters] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: spCreateAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spCreateAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spCreateAdopter];
GO

CREATE PROCEDURE [DogShelter].[spCreateAdopter]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Email nvarchar(255),
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @State_Clear bit = 0,
    @State nvarchar(50) = NULL,
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @HousingType nvarchar(20),
    @HasFencedYard bit = NULL,
    @HasOtherPets bit = NULL,
    @HouseholdAdults int = NULL,
    @HouseholdChildren int = NULL,
    @IsFosterApproved bit = NULL,
    @DateRegistered date,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [DogShelter].[Adopter]
            (
                [ID],
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [HousingType],
                [HasFencedYard],
                [HasOtherPets],
                [HouseholdAdults],
                [HouseholdChildren],
                [IsFosterApproved],
                [DateRegistered],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @State_Clear = 1 THEN NULL ELSE ISNULL(@State, NULL) END,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                @HousingType,
                ISNULL(@HasFencedYard, 0),
                ISNULL(@HasOtherPets, 0),
                ISNULL(@HouseholdAdults, 1),
                ISNULL(@HouseholdChildren, 0),
                ISNULL(@IsFosterApproved, 0),
                @DateRegistered,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [DogShelter].[Adopter]
            (
                [FirstName],
                [LastName],
                [Email],
                [Phone],
                [AddressLine1],
                [City],
                [State],
                [PostalCode],
                [HousingType],
                [HasFencedYard],
                [HasOtherPets],
                [HouseholdAdults],
                [HouseholdChildren],
                [IsFosterApproved],
                [DateRegistered],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                @Email,
                CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, NULL) END,
                CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, NULL) END,
                CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, NULL) END,
                CASE WHEN @State_Clear = 1 THEN NULL ELSE ISNULL(@State, NULL) END,
                CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, NULL) END,
                @HousingType,
                ISNULL(@HasFencedYard, 0),
                ISNULL(@HasOtherPets, 0),
                ISNULL(@HouseholdAdults, 1),
                ISNULL(@HouseholdChildren, 0),
                ISNULL(@IsFosterApproved, 0),
                @DateRegistered,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [DogShelter].[vwAdopters] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [DogShelter].[spCreateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Adopters */

GRANT EXECUTE ON [DogShelter].[spCreateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: spUpdateAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spUpdateAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spUpdateAdopter];
GO

CREATE PROCEDURE [DogShelter].[spUpdateAdopter]
    @ID uniqueidentifier,
    @FirstName nvarchar(100) = NULL,
    @LastName nvarchar(100) = NULL,
    @Email nvarchar(255) = NULL,
    @Phone_Clear bit = 0,
    @Phone nvarchar(50) = NULL,
    @AddressLine1_Clear bit = 0,
    @AddressLine1 nvarchar(200) = NULL,
    @City_Clear bit = 0,
    @City nvarchar(100) = NULL,
    @State_Clear bit = 0,
    @State nvarchar(50) = NULL,
    @PostalCode_Clear bit = 0,
    @PostalCode nvarchar(20) = NULL,
    @HousingType nvarchar(20) = NULL,
    @HasFencedYard bit = NULL,
    @HasOtherPets bit = NULL,
    @HouseholdAdults int = NULL,
    @HouseholdChildren int = NULL,
    @IsFosterApproved bit = NULL,
    @DateRegistered date = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Adopter]
    SET
        [FirstName] = ISNULL(@FirstName, [FirstName]),
        [LastName] = ISNULL(@LastName, [LastName]),
        [Email] = ISNULL(@Email, [Email]),
        [Phone] = CASE WHEN @Phone_Clear = 1 THEN NULL ELSE ISNULL(@Phone, [Phone]) END,
        [AddressLine1] = CASE WHEN @AddressLine1_Clear = 1 THEN NULL ELSE ISNULL(@AddressLine1, [AddressLine1]) END,
        [City] = CASE WHEN @City_Clear = 1 THEN NULL ELSE ISNULL(@City, [City]) END,
        [State] = CASE WHEN @State_Clear = 1 THEN NULL ELSE ISNULL(@State, [State]) END,
        [PostalCode] = CASE WHEN @PostalCode_Clear = 1 THEN NULL ELSE ISNULL(@PostalCode, [PostalCode]) END,
        [HousingType] = ISNULL(@HousingType, [HousingType]),
        [HasFencedYard] = ISNULL(@HasFencedYard, [HasFencedYard]),
        [HasOtherPets] = ISNULL(@HasOtherPets, [HasOtherPets]),
        [HouseholdAdults] = ISNULL(@HouseholdAdults, [HouseholdAdults]),
        [HouseholdChildren] = ISNULL(@HouseholdChildren, [HouseholdChildren]),
        [IsFosterApproved] = ISNULL(@IsFosterApproved, [IsFosterApproved]),
        [DateRegistered] = ISNULL(@DateRegistered, [DateRegistered]),
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [DogShelter].[vwAdopters] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [DogShelter].[vwAdopters]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [DogShelter].[spUpdateAdopter] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Adopter table
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[trgUpdateAdopter]', 'TR') IS NOT NULL
    DROP TRIGGER [DogShelter].[trgUpdateAdopter];
GO
CREATE TRIGGER [DogShelter].trgUpdateAdopter
ON [DogShelter].[Adopter]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [DogShelter].[Adopter]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [DogShelter].[Adopter] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Adopters */

GRANT EXECUTE ON [DogShelter].[spUpdateAdopter] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Adopters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Adopters
-- Item: spDeleteAdopter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Adopter
------------------------------------------------------------
IF OBJECT_ID('[DogShelter].[spDeleteAdopter]', 'P') IS NOT NULL
    DROP PROCEDURE [DogShelter].[spDeleteAdopter];
GO

CREATE PROCEDURE [DogShelter].[spDeleteAdopter]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [DogShelter].[Adopter]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [DogShelter].[spDeleteAdopter] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Adopters */

GRANT EXECUTE ON [DogShelter].[spDeleteAdopter] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca4beb00-4c8d-4782-a739-11b496a3c49a' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = '${flyway:defaultSchema}_Latitude')) BEGIN
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
            'ca4beb00-4c8d-4782-a739-11b496a3c49a',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 14,
            '${flyway:defaultSchema}_Latitude',
            'Mj Latitude',
            NULL,
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd56a0a7-9073-47e5-8699-d97262a804d6' OR (EntityID = '7E53957B-4697-4B59-8EC3-348FDE76FE3B' AND Name = '${flyway:defaultSchema}_Longitude')) BEGIN
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
            'dd56a0a7-9073-47e5-8699-d97262a804d6',
            '7E53957B-4697-4B59-8EC3-348FDE76FE3B', -- Entity: Shelters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7E53957B-4697-4B59-8EC3-348FDE76FE3B') + 15,
            '${flyway:defaultSchema}_Longitude',
            'Mj Longitude',
            NULL,
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5afab4a-673e-4fd0-847f-07a252985af9' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = '${flyway:defaultSchema}_Latitude')) BEGIN
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
            'e5afab4a-673e-4fd0-847f-07a252985af9',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 21,
            '${flyway:defaultSchema}_Latitude',
            'Mj Latitude',
            NULL,
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
            0,
            0,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00b338a6-fda2-4171-81c0-c19995fe99d7' OR (EntityID = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B' AND Name = '${flyway:defaultSchema}_Longitude')) BEGIN
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
            '00b338a6-fda2-4171-81c0-c19995fe99d7',
            'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B', -- Entity: Adopters
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B') + 22,
            '${flyway:defaultSchema}_Longitude',
            'Mj Longitude',
            NULL,
            'decimal',
            9,
            10,
            6,
            1,
            NULL,
            0,
            0,
            1,
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

/* Set ExtendedType=GeoLatitude on virtual geo fields */
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLatitude' WHERE [Name] = '${flyway:defaultSchema}_Latitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('7E53957B-4697-4B59-8EC3-348FDE76FE3B','D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B');

/* Set ExtendedType=GeoLongitude on virtual geo fields */
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLongitude' WHERE [Name] = '${flyway:defaultSchema}_Longitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('7E53957B-4697-4B59-8EC3-348FDE76FE3B','D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B');

/* Generated Validation Functions for Adopters */
-- CHECK constraint for Adopters @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([HouseholdAdults]>=(1) AND [HouseholdChildren]>=(0))', 'public ValidateHouseholdAdultsAndChildren(result: ValidationResult) {
	if (this.HouseholdAdults !== undefined && this.HouseholdAdults !== null && this.HouseholdAdults < 1) {
		result.Errors.push(new ValidationErrorInfo(
			"HouseholdAdults",
			"There must be at least one adult in the household.",
			this.HouseholdAdults,
			ValidationErrorType.Failure
		));
	}
	if (this.HouseholdChildren !== undefined && this.HouseholdChildren !== null && this.HouseholdChildren < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"HouseholdChildren",
			"The number of children cannot be less than zero.",
			this.HouseholdChildren,
			ValidationErrorType.Failure
		));
	}
}', 'A household must contain at least one adult and cannot have a negative number of children.', 'ValidateHouseholdAdultsAndChildren', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D086BA6A-7162-4BDE-A4E3-E9AF8F3E1B7B');

/* Generated Validation Functions for Adoption Applications */
-- CHECK constraint for Adoption Applications: Field: FeePaid was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([FeePaid] IS NULL OR [FeePaid]>=(0))', 'public ValidateFeePaidIsNotNegative(result: ValidationResult) {
	if (this.FeePaid != null && this.FeePaid < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"FeePaid",
			"The fee paid cannot be a negative value. Please enter zero or a positive amount.",
			this.FeePaid,
			ValidationErrorType.Failure
		));
	}
}', 'The fee paid for the adoption cannot be negative. If a fee is recorded, it must be zero or a positive amount.', 'ValidateFeePaidIsNotNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '2097EA3F-2791-44BD-A783-97DC5F23B836');

/* Generated Validation Functions for Breeds */
-- CHECK constraint for Breeds @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([TypicalWeightLbsHigh] IS NULL OR [TypicalWeightLbsLow] IS NULL OR [TypicalWeightLbsHigh]>=[TypicalWeightLbsLow])', 'public ValidateTypicalWeightRange(result: ValidationResult) {
	if (this.TypicalWeightLbsHigh != null && this.TypicalWeightLbsLow != null) {
		if (this.TypicalWeightLbsHigh < this.TypicalWeightLbsLow) {
			result.Errors.push(new ValidationErrorInfo(
				"TypicalWeightLbsHigh",
				"The high typical weight (" + this.TypicalWeightLbsHigh + " lbs) must be greater than or equal to the low typical weight (" + this.TypicalWeightLbsLow + " lbs).",
				this.TypicalWeightLbsHigh,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The high end of the typical weight range must be greater than or equal to the low end of the typical weight range.', 'ValidateTypicalWeightRange', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '922EB6BC-2A84-41E0-9F3B-DB7107EAFF55');

/* Generated Validation Functions for Dogs */
-- CHECK constraint for Dogs: Field: AdoptionFee was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([AdoptionFee]>=(0))', 'public ValidateAdoptionFeeIsNonNegative(result: ValidationResult) {
	if (this.AdoptionFee != null && this.AdoptionFee < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"AdoptionFee",
			"The adoption fee must be greater than or equal to zero.",
			this.AdoptionFee,
			ValidationErrorType.Failure
		));
	}
}', 'The adoption fee must be greater than or equal to zero. Negative adoption fees are not allowed.', 'ValidateAdoptionFeeIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '813F71CA-3872-4762-8785-2C29BED7C4B2');

            -- CHECK constraint for Dogs @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([OutcomeDate] IS NULL OR [OutcomeDate]>=[IntakeDate])', 'public ValidateOutcomeDateAfterOrEqualIntakeDate(result: ValidationResult) {
	if (this.OutcomeDate != null && this.IntakeDate != null) {
		const outcome = new Date(this.OutcomeDate);
		const intake = new Date(this.IntakeDate);
		if (outcome < intake) {
			result.Errors.push(new ValidationErrorInfo(
				"OutcomeDate",
				"The outcome date cannot be earlier than the intake date.",
				this.OutcomeDate,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The outcome date must be on or after the intake date. This ensures that an animal''s departure is not recorded as occurring before its arrival.', 'ValidateOutcomeDateAfterOrEqualIntakeDate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FCD6413F-411A-4B50-9D31-82C271AEA652');

            -- CHECK constraint for Dogs @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([SecondaryBreedID] IS NULL OR [SecondaryBreedID]<>[PrimaryBreedID])', 'public ValidateSecondaryBreedIDNotEqualToPrimaryBreedID(result: ValidationResult) {
	if (this.SecondaryBreedID != null && this.SecondaryBreedID === this.PrimaryBreedID) {
		result.Errors.push(new ValidationErrorInfo(
			"SecondaryBreedID",
			"The secondary breed cannot be the same as the primary breed.",
			this.SecondaryBreedID,
			ValidationErrorType.Failure
		));
	}
}', 'The secondary breed of an animal cannot be the same as its primary breed to prevent redundant breed classification.', 'ValidateSecondaryBreedIDNotEqualToPrimaryBreedID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'FCD6413F-411A-4B50-9D31-82C271AEA652');

/* Generated Validation Functions for Foster Placements */
-- CHECK constraint for Foster Placements @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([EndDate] IS NULL OR [EndDate]>=[StartDate])', 'public ValidateEndDateAfterOrEqualStartDate(result: ValidationResult) {
	if (this.EndDate != null && this.StartDate != null) {
		const startDate = new Date(this.StartDate);
		const endDate = new Date(this.EndDate);
		if (endDate < startDate) {
			result.Errors.push(new ValidationErrorInfo(
				"EndDate",
				"The end date must be on or after the start date.",
				this.EndDate,
				ValidationErrorType.Failure
			));
		}
	}
}', 'The end date must be on or after the start date.', 'ValidateEndDateAfterOrEqualStartDate', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '55903600-D02D-4E83-8614-3D989DF836A8');

/* Generated Validation Functions for Medical Records */
-- CHECK constraint for Medical Records: Field: Cost was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Cost]>=(0))', 'public ValidateCostIsNonNegative(result: ValidationResult) {
	if (this.Cost != null && this.Cost < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Cost",
			"Cost must be greater than or equal to 0.",
			this.Cost,
			ValidationErrorType.Failure
		));
	}
}', 'The cost of the record must be zero or a positive value. Negative costs are not permitted.', 'ValidateCostIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0401E99B-EF30-4602-9FAB-627A52BC5830');

/* Generated Validation Functions for Shelters */
-- CHECK constraint for Shelters: Field: KennelCapacity was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([KennelCapacity]>(0))', 'public ValidateKennelCapacityGreaterThanZero(result: ValidationResult) {
	if (this.KennelCapacity <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"KennelCapacity",
			"Kennel capacity must be greater than zero.",
			this.KennelCapacity,
			ValidationErrorType.Failure
		));
	}
}', 'Kennel capacity must be greater than zero to ensure the facility has space to accommodate animals.', 'ValidateKennelCapacityGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '48CDA013-B588-481D-A3B1-636D17CDC40E');

