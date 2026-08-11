/* SQL generated to create new entity Publishers */

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
         'bcd81161-ae5b-4f77-b2d0-2996bd014b64',
         'Publishers',
         NULL,
         'A company that publishes board games. Parent of Game in a one-to-many relationship.',
         NULL,
         'Publisher',
         'vwPublishers',
         'BoardGameNight',
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

/* SQL generated to create new application BoardGameNight */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[Application] WHERE [ID] = '4c0e9776-bdec-4599-aa96-25365db9fbd7'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('4c0e9776-bdec-4599-aa96-25365db9fbd7', 'BoardGameNight', 'Generated for schema', 'BoardGameNight', 'boardgamenight', 1)
   END;

/* Adding role UI to application BoardGameNight */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = '4c0e9776-bdec-4599-aa96-25365db9fbd7' AND [RoleID] = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('4c0e9776-bdec-4599-aa96-25365db9fbd7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0)
   END;

/* Adding role Developer to application BoardGameNight */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = '4c0e9776-bdec-4599-aa96-25365db9fbd7' AND [RoleID] = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('4c0e9776-bdec-4599-aa96-25365db9fbd7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1)
   END;

/* Adding role Integration to application BoardGameNight */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationRole] WHERE [ApplicationID] = '4c0e9776-bdec-4599-aa96-25365db9fbd7' AND [RoleID] = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('4c0e9776-bdec-4599-aa96-25365db9fbd7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0)
   END;

/* SQL generated to add new entity Publishers to application ID: '4c0e9776-bdec-4599-aa96-25365db9fbd7' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4c0e9776-bdec-4599-aa96-25365db9fbd7', 'bcd81161-ae5b-4f77-b2d0-2996bd014b64', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4c0e9776-bdec-4599-aa96-25365db9fbd7'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Publishers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bcd81161-ae5b-4f77-b2d0-2996bd014b64', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Publishers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bcd81161-ae5b-4f77-b2d0-2996bd014b64', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Publishers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('bcd81161-ae5b-4f77-b2d0-2996bd014b64', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Designers */

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
         'c8cbde22-03b6-4dd0-adc8-84b53732feaf',
         'Designers',
         NULL,
         'A person who designs board games. Linked to Game through the GameDesigner junction table in a many-to-many relationship.',
         NULL,
         'Designer',
         'vwDesigners',
         'BoardGameNight',
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

/* SQL generated to add new entity Designers to application ID: '4C0E9776-BDEC-4599-AA96-25365DB9FBD7' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4C0E9776-BDEC-4599-AA96-25365DB9FBD7', 'c8cbde22-03b6-4dd0-adc8-84b53732feaf', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4C0E9776-BDEC-4599-AA96-25365DB9FBD7'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Designers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c8cbde22-03b6-4dd0-adc8-84b53732feaf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Designers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c8cbde22-03b6-4dd0-adc8-84b53732feaf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Designers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c8cbde22-03b6-4dd0-adc8-84b53732feaf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Games */

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
         '795ef2c9-078e-4fb5-a128-193247f289b5',
         'Games',
         NULL,
         'A board game in the collection, on the wishlist, or previously owned. Belongs to one Publisher, has many Designers through GameDesigner, and is played across many PlaySessions.',
         NULL,
         'Game',
         'vwGames',
         'BoardGameNight',
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

/* SQL generated to add new entity Games to application ID: '4C0E9776-BDEC-4599-AA96-25365DB9FBD7' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4C0E9776-BDEC-4599-AA96-25365DB9FBD7', '795ef2c9-078e-4fb5-a128-193247f289b5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4C0E9776-BDEC-4599-AA96-25365DB9FBD7'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Games for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('795ef2c9-078e-4fb5-a128-193247f289b5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Games for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('795ef2c9-078e-4fb5-a128-193247f289b5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Games for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('795ef2c9-078e-4fb5-a128-193247f289b5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Game Designers */

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
         'facbef80-c894-4a26-90dd-006ef0bf2459',
         'Game Designers',
         NULL,
         'Pure junction table linking Games to Designers in a many-to-many relationship. Carries no data of its own -- contrast with PlaySessionPlayer, which does.',
         NULL,
         'GameDesigner',
         'vwGameDesigners',
         'BoardGameNight',
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

/* SQL generated to add new entity Game Designers to application ID: '4C0E9776-BDEC-4599-AA96-25365DB9FBD7' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4C0E9776-BDEC-4599-AA96-25365DB9FBD7', 'facbef80-c894-4a26-90dd-006ef0bf2459', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4C0E9776-BDEC-4599-AA96-25365DB9FBD7'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Game Designers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('facbef80-c894-4a26-90dd-006ef0bf2459', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Game Designers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('facbef80-c894-4a26-90dd-006ef0bf2459', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Game Designers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('facbef80-c894-4a26-90dd-006ef0bf2459', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Players */

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
         'c5f3994b-6718-4889-98ef-417af0d93ede',
         'Players',
         NULL,
         'A person who attends game night. Linked to PlaySession through PlaySessionPlayer, which also records how they did.',
         NULL,
         'Player',
         'vwPlayers',
         'BoardGameNight',
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

/* SQL generated to add new entity Players to application ID: '4C0E9776-BDEC-4599-AA96-25365DB9FBD7' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4C0E9776-BDEC-4599-AA96-25365DB9FBD7', 'c5f3994b-6718-4889-98ef-417af0d93ede', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4C0E9776-BDEC-4599-AA96-25365DB9FBD7'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Players for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c5f3994b-6718-4889-98ef-417af0d93ede', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Players for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c5f3994b-6718-4889-98ef-417af0d93ede', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Players for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c5f3994b-6718-4889-98ef-417af0d93ede', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Play Sessions */

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
         '83d87a52-57b6-436f-8d7c-870fc00be36b',
         'Play Sessions',
         NULL,
         'One playthrough of one Game on one night. Has many participants through PlaySessionPlayer.',
         NULL,
         'PlaySession',
         'vwPlaySessions',
         'BoardGameNight',
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

/* SQL generated to add new entity Play Sessions to application ID: '4C0E9776-BDEC-4599-AA96-25365DB9FBD7' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4C0E9776-BDEC-4599-AA96-25365DB9FBD7', '83d87a52-57b6-436f-8d7c-870fc00be36b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4C0E9776-BDEC-4599-AA96-25365DB9FBD7'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Play Sessions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('83d87a52-57b6-436f-8d7c-870fc00be36b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Play Sessions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('83d87a52-57b6-436f-8d7c-870fc00be36b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Play Sessions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('83d87a52-57b6-436f-8d7c-870fc00be36b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Play Session Players */

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
         'e577e552-533b-47fe-9898-b14db9e62c9e',
         'Play Session Players',
         NULL,
         'Junction table linking a Player to a PlaySession, carrying that player''s result for that session. Unlike GameDesigner, this junction has a payload -- score, placement, and win flag -- which is why CodeGen generates a data-bearing grid on both parent forms.',
         NULL,
         'PlaySessionPlayer',
         'vwPlaySessionPlayers',
         'BoardGameNight',
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

/* SQL generated to add new entity Play Session Players to application ID: '4C0E9776-BDEC-4599-AA96-25365DB9FBD7' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('4C0E9776-BDEC-4599-AA96-25365DB9FBD7', 'e577e552-533b-47fe-9898-b14db9e62c9e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = '4C0E9776-BDEC-4599-AA96-25365DB9FBD7'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Play Session Players for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e577e552-533b-47fe-9898-b14db9e62c9e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Play Session Players for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e577e552-533b-47fe-9898-b14db9e62c9e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Play Session Players for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e577e552-533b-47fe-9898-b14db9e62c9e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
UPDATE [BoardGameNight].[GameDesigner] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD CONSTRAINT [DF_BoardGameNight_GameDesigner___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
UPDATE [BoardGameNight].[GameDesigner] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.GameDesigner */
ALTER TABLE [BoardGameNight].[GameDesigner] ADD CONSTRAINT [DF_BoardGameNight_GameDesigner___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
UPDATE [BoardGameNight].[Game] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD CONSTRAINT [DF_BoardGameNight_Game___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
UPDATE [BoardGameNight].[Game] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Game */
ALTER TABLE [BoardGameNight].[Game] ADD CONSTRAINT [DF_BoardGameNight_Game___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
UPDATE [BoardGameNight].[Publisher] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD CONSTRAINT [DF_BoardGameNight_Publisher___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
UPDATE [BoardGameNight].[Publisher] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Publisher */
ALTER TABLE [BoardGameNight].[Publisher] ADD CONSTRAINT [DF_BoardGameNight_Publisher___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
UPDATE [BoardGameNight].[Player] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD CONSTRAINT [DF_BoardGameNight_Player___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
UPDATE [BoardGameNight].[Player] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Player */
ALTER TABLE [BoardGameNight].[Player] ADD CONSTRAINT [DF_BoardGameNight_Player___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
UPDATE [BoardGameNight].[Designer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD CONSTRAINT [DF_BoardGameNight_Designer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
UPDATE [BoardGameNight].[Designer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.Designer */
ALTER TABLE [BoardGameNight].[Designer] ADD CONSTRAINT [DF_BoardGameNight_Designer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
UPDATE [BoardGameNight].[PlaySession] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD CONSTRAINT [DF_BoardGameNight_PlaySession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
UPDATE [BoardGameNight].[PlaySession] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySession */
ALTER TABLE [BoardGameNight].[PlaySession] ADD CONSTRAINT [DF_BoardGameNight_PlaySession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
UPDATE [BoardGameNight].[PlaySessionPlayer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD CONSTRAINT [DF_BoardGameNight_PlaySessionPlayer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
UPDATE [BoardGameNight].[PlaySessionPlayer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity BoardGameNight.PlaySessionPlayer */
ALTER TABLE [BoardGameNight].[PlaySessionPlayer] ADD CONSTRAINT [DF_BoardGameNight_PlaySessionPlayer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 64 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a2e309f-b974-4085-bb46-7a22f0320e07' OR (EntityID = 'FACBEF80-C894-4A26-90DD-006EF0BF2459' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7a2e309f-b974-4085-bb46-7a22f0320e07',
            'FACBEF80-C894-4A26-90DD-006EF0BF2459', -- Entity: Game Designers
            100001,
            'ID',
            'ID',
            'Unique identifier for this game-designer link.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eabcf5f5-4f2a-4c4e-8bd0-2f7ec85659f2' OR (EntityID = 'FACBEF80-C894-4A26-90DD-006EF0BF2459' AND Name = 'GameID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eabcf5f5-4f2a-4c4e-8bd0-2f7ec85659f2',
            'FACBEF80-C894-4A26-90DD-006EF0BF2459', -- Entity: Game Designers
            100002,
            'GameID',
            'Game ID',
            'Foreign key to the Game.',
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
            '795EF2C9-078E-4FB5-A128-193247F289B5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f54e16f-01d0-43d1-b9bc-55dc0faf341c' OR (EntityID = 'FACBEF80-C894-4A26-90DD-006EF0BF2459' AND Name = 'DesignerID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6f54e16f-01d0-43d1-b9bc-55dc0faf341c',
            'FACBEF80-C894-4A26-90DD-006EF0BF2459', -- Entity: Game Designers
            100003,
            'DesignerID',
            'Designer ID',
            'Foreign key to the Designer.',
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
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e7803ae-d68e-486f-972c-e445e9cd9ee9' OR (EntityID = 'FACBEF80-C894-4A26-90DD-006EF0BF2459' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e7803ae-d68e-486f-972c-e445e9cd9ee9',
            'FACBEF80-C894-4A26-90DD-006EF0BF2459', -- Entity: Game Designers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0bb952ad-875e-483f-a223-268c20add120' OR (EntityID = 'FACBEF80-C894-4A26-90DD-006EF0BF2459' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0bb952ad-875e-483f-a223-268c20add120',
            'FACBEF80-C894-4A26-90DD-006EF0BF2459', -- Entity: Game Designers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f068dab0-fb3c-4fb4-a959-d96f6187de29' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f068dab0-fb3c-4fb4-a959-d96f6187de29',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100001,
            'ID',
            'ID',
            'Unique identifier for this game.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32124d7a-9f65-444b-a5a3-0094d1cd4a41' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '32124d7a-9f65-444b-a5a3-0094d1cd4a41',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100002,
            'Name',
            'Name',
            'Game title as printed on the box.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2451f9ab-cdec-4d1c-b9ba-99143b3e30ba' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'PublisherID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2451f9ab-cdec-4d1c-b9ba-99143b3e30ba',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100003,
            'PublisherID',
            'Publisher ID',
            'Foreign key to the Publisher that released this edition.',
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
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a106a7c-3a27-4936-9112-37d06d2cf1ae' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'YearPublished')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1a106a7c-3a27-4936-9112-37d06d2cf1ae',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100004,
            'YearPublished',
            'Year Published',
            'Year of first publication.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bac209aa-9200-41e6-929b-9d6b4b949d07' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'MinPlayers')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bac209aa-9200-41e6-929b-9d6b4b949d07',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100005,
            'MinPlayers',
            'Min Players',
            'Minimum number of players supported by the rules.',
            'int',
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '190126b3-609c-4c82-a8e1-4c43e9badf9f' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'MaxPlayers')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '190126b3-609c-4c82-a8e1-4c43e9badf9f',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100006,
            'MaxPlayers',
            'Max Players',
            'Maximum number of players supported by the rules.',
            'int',
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f27da2dc-b465-4644-b77d-2891249914ce' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'MinPlayTimeMinutes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f27da2dc-b465-4644-b77d-2891249914ce',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100007,
            'MinPlayTimeMinutes',
            'Min Play Time Minutes',
            'Publisher-stated minimum play time in minutes.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66bf5b17-f982-4e1d-b604-fd48b0067907' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'MaxPlayTimeMinutes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '66bf5b17-f982-4e1d-b604-fd48b0067907',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100008,
            'MaxPlayTimeMinutes',
            'Max Play Time Minutes',
            'Publisher-stated maximum play time in minutes. Compare against PlaySession.DurationMinutes to see how badly the box lies.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b16b1c2-1fe2-4c20-a272-6ee0683c743a' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'Weight')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b16b1c2-1fe2-4c20-a272-6ee0683c743a',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100009,
            'Weight',
            'Weight',
            'Complexity rating from 1.00 (lightest) to 5.00 (heaviest), BoardGameGeek style. Enforced by a range CHECK, not a value list.',
            'decimal',
            5,
            3,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '227a49d8-5f0a-4b2a-bca8-53f12168a286' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '227a49d8-5f0a-4b2a-bca8-53f12168a286',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100010,
            'Category',
            'Category',
            'Primary game category. Constrained to a fixed list, which CodeGen turns into a dropdown.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30df7e35-dbf7-4398-8697-28e63ab3b507' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'OwnershipStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '30df7e35-dbf7-4398-8697-28e63ab3b507',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100011,
            'OwnershipStatus',
            'Ownership Status',
            'Current ownership state of this title. Constrained to a fixed list, which CodeGen turns into a dropdown.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'Owned',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71c4799c-4d99-4d0c-95a4-8b644457323d' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'AcquiredDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '71c4799c-4d99-4d0c-95a4-8b644457323d',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100012,
            'AcquiredDate',
            'Acquired Date',
            'Date the copy was acquired. Null for wishlist titles.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd09dd528-b489-4d22-a0a0-b93d235e03bd' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'PurchasePrice')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd09dd528-b489-4d22-a0a0-b93d235e03bd',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100013,
            'PurchasePrice',
            'Purchase Price',
            'Purchase price paid, in USD. Null for wishlist titles or gifts.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9aa6f223-ba90-4947-a8a9-4c394ad66165' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9aa6f223-ba90-4947-a8a9-4c394ad66165',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100014,
            'Notes',
            'Notes',
            'Free-form notes about this copy: expansions owned, house rules, condition.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b6667cde-f41b-40eb-a466-d5eeec166c8c' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b6667cde-f41b-40eb-a466-d5eeec166c8c',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bdc40ebf-6f84-47ed-a8ab-ffa1291e5d19' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bdc40ebf-6f84-47ed-a8ab-ffa1291e5d19',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26302f08-3f6b-4e07-a170-9f475d259245' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26302f08-3f6b-4e07-a170-9f475d259245',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
            100001,
            'ID',
            'ID',
            'Unique identifier for this publisher.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc593a88-4088-4076-b107-3bb144ed5c14' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc593a88-4088-4076-b107-3bb144ed5c14',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
            100002,
            'Name',
            'Name',
            'Company name as it appears on the box. Unique across all publishers.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f23b28a6-457e-4869-b1ee-f93aa5a82eff' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = 'FoundedYear')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f23b28a6-457e-4869-b1ee-f93aa5a82eff',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
            100003,
            'FoundedYear',
            'Founded Year',
            'Year the company was founded.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6352fe7c-014c-4b69-ad50-7adda46e01fc' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = 'Country')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6352fe7c-014c-4b69-ad50-7adda46e01fc',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
            100004,
            'Country',
            'Country',
            'Country where the publisher is headquartered.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd9b53fa4-a98b-4eb1-bc82-08e38e69cb23' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = 'Website')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd9b53fa4-a98b-4eb1-bc82-08e38e69cb23',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
            100005,
            'Website',
            'Website',
            'Publisher website URL.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26479aa6-7620-4eab-928c-17074bfe85ac' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26479aa6-7620-4eab-928c-17074bfe85ac',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40aecba3-5970-4a8f-9426-143250d50614' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '40aecba3-5970-4a8f-9426-143250d50614',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a963136a-d078-468e-bef8-62d15eb10717' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a963136a-d078-468e-bef8-62d15eb10717',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100001,
            'ID',
            'ID',
            'Unique identifier for this player.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0bdf8594-66c9-41e6-aa62-e7f0307c0a6c' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'FirstName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0bdf8594-66c9-41e6-aa62-e7f0307c0a6c',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100002,
            'FirstName',
            'First Name',
            'Player given name.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7df52864-a6aa-413d-bc9b-3e141ea8c548' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'LastName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7df52864-a6aa-413d-bc9b-3e141ea8c548',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100003,
            'LastName',
            'Last Name',
            'Player family name.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '734a74bc-4a40-4409-9092-dd994eb05684' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'Nickname')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '734a74bc-4a40-4409-9092-dd994eb05684',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100004,
            'Nickname',
            'Nickname',
            'What everyone actually calls them at the table.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca1dfe73-b687-41ca-8210-5535bd9915c2' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'Email')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca1dfe73-b687-41ca-8210-5535bd9915c2',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100005,
            'Email',
            'Email',
            'Contact email address. Unique across all players.',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98e5e570-b5b6-4c7f-91eb-7964b75b9852' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'JoinedDate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '98e5e570-b5b6-4c7f-91eb-7964b75b9852',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100006,
            'JoinedDate',
            'Joined Date',
            'Date this player first joined the group.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c902321-5d2e-4637-9a34-dfdf92c6a2a3' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'SkillLevel')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2c902321-5d2e-4637-9a34-dfdf92c6a2a3',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100007,
            'SkillLevel',
            'Skill Level',
            'Self-reported experience level. Constrained to a fixed list, which CodeGen turns into a dropdown.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Casual',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2de279c-4e18-4367-948a-1ce908c13de0' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b2de279c-4e18-4367-948a-1ce908c13de0',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
            100008,
            'IsActive',
            'Is Active',
            'Whether this player still attends. Inactive players are retained so historical sessions stay intact.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52ea2e3c-d223-4929-85a5-0ed5545ac7c7' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '52ea2e3c-d223-4929-85a5-0ed5545ac7c7',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e8bc9d5-b129-4a17-a3d3-3435dcfd5c17' OR (EntityID = 'C5F3994B-6718-4889-98EF-417AF0D93EDE' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e8bc9d5-b129-4a17-a3d3-3435dcfd5c17',
            'C5F3994B-6718-4889-98EF-417AF0D93EDE', -- Entity: Players
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6232976-7e16-4cde-9005-99bbee3b79c8' OR (EntityID = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd6232976-7e16-4cde-9005-99bbee3b79c8',
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', -- Entity: Designers
            100001,
            'ID',
            'ID',
            'Unique identifier for this designer.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a61bc74b-23a0-41a5-8373-e6726a77bdd9' OR (EntityID = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF' AND Name = 'FirstName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a61bc74b-23a0-41a5-8373-e6726a77bdd9',
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', -- Entity: Designers
            100002,
            'FirstName',
            'First Name',
            'Designer given name.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07146111-95d7-4010-b80c-bbda74f220e2' OR (EntityID = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF' AND Name = 'LastName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '07146111-95d7-4010-b80c-bbda74f220e2',
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', -- Entity: Designers
            100003,
            'LastName',
            'Last Name',
            'Designer family name.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0096826c-ed4f-4aff-a68e-067550158bee' OR (EntityID = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF' AND Name = 'Bio')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0096826c-ed4f-4aff-a68e-067550158bee',
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', -- Entity: Designers
            100004,
            'Bio',
            'Bio',
            'Short biography or notable design credits.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9b187ed-3d20-4cf6-8571-a78bec2fe488' OR (EntityID = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF' AND Name = 'Website')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f9b187ed-3d20-4cf6-8571-a78bec2fe488',
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', -- Entity: Designers
            100005,
            'Website',
            'Website',
            'Designer personal or studio website URL.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03c8a745-9cb6-4e1f-b2ee-5eba482df6b2' OR (EntityID = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03c8a745-9cb6-4e1f-b2ee-5eba482df6b2',
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', -- Entity: Designers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4459a6b-6421-40b9-a384-126e4f0c6286' OR (EntityID = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd4459a6b-6421-40b9-a384-126e4f0c6286',
            'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', -- Entity: Designers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5bcac245-aff1-4399-a6bd-894da9971b2a' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5bcac245-aff1-4399-a6bd-894da9971b2a',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100001,
            'ID',
            'ID',
            'Unique identifier for this play session.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5dd6863-a9a0-4afd-80f4-aeb4d0430a5f' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'GameID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b5dd6863-a9a0-4afd-80f4-aeb4d0430a5f',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100002,
            'GameID',
            'Game ID',
            'Foreign key to the Game that was played.',
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
            '795EF2C9-078E-4FB5-A128-193247F289B5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a075719-367b-411e-9355-44f863c6905e' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'PlayedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a075719-367b-411e-9355-44f863c6905e',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100003,
            'PlayedAt',
            'Played At',
            'Date and time the session started.',
            'datetime2',
            8,
            27,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff341e22-edaa-4c6d-95a3-3cb480420d28' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'LocationName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ff341e22-edaa-4c6d-95a3-3cb480420d28',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100004,
            'LocationName',
            'Location Name',
            'Where the session took place.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e39b7a99-68f4-49b8-a387-d37f13f2a482' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'DurationMinutes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e39b7a99-68f4-49b8-a387-d37f13f2a482',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100005,
            'DurationMinutes',
            'Duration Minutes',
            'Actual elapsed play time in minutes, including setup and teardown.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dec7549d-a9b7-4b67-8e67-32982cf51db9' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'Outcome')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dec7549d-a9b7-4b67-8e67-32982cf51db9',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100006,
            'Outcome',
            'Outcome',
            'How the session ended. Competitive games use Completed; cooperative games use Co-op Win or Co-op Loss; Abandoned means nobody finished. Constrained to a fixed list, which CodeGen turns into a dropdown.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'Completed',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '628ef04a-977a-4f3e-9554-92ffbce7fe7b' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '628ef04a-977a-4f3e-9554-92ffbce7fe7b',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100007,
            'Notes',
            'Notes',
            'Free-form notes about the session: memorable plays, rules arguments, what went wrong.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0608581c-4749-4028-950e-7ac44c40c3a6' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0608581c-4749-4028-950e-7ac44c40c3a6',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '564bb851-99fa-44db-89a6-5bb2e1ad6e13' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '564bb851-99fa-44db-89a6-5bb2e1ad6e13',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e85a7c5c-8b18-4ceb-8be1-357e9fed7f15' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e85a7c5c-8b18-4ceb-8be1-357e9fed7f15',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100001,
            'ID',
            'ID',
            'Unique identifier for this participation record.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b69da11a-ed1b-411a-b903-bb8112aca46c' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'PlaySessionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b69da11a-ed1b-411a-b903-bb8112aca46c',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100002,
            'PlaySessionID',
            'Play Session ID',
            'Foreign key to the PlaySession.',
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
            '83D87A52-57B6-436F-8D7C-870FC00BE36B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ec298a94-1eff-417f-a110-598e07b91527' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'PlayerID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ec298a94-1eff-417f-a110-598e07b91527',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100003,
            'PlayerID',
            'Player ID',
            'Foreign key to the Player.',
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
            'C5F3994B-6718-4889-98EF-417AF0D93EDE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '52269b47-a8fc-446c-8d2b-8fcf2c8ed61c' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'Score')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '52269b47-a8fc-446c-8d2b-8fcf2c8ed61c',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100004,
            'Score',
            'Score',
            'Final score for this player. Null for cooperative and abandoned sessions, where individual scores do not exist.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51af5002-6d87-408c-ab43-0916997d762a' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'Placement')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51af5002-6d87-408c-ab43-0916997d762a',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100005,
            'Placement',
            'Placement',
            'Finishing position, 1 being first. Null for cooperative and abandoned sessions.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c63c4c3e-07f8-44a5-84c0-3eb279f59f73' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'IsWinner')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c63c4c3e-07f8-44a5-84c0-3eb279f59f73',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100006,
            'IsWinner',
            'Is Winner',
            'Whether this player won. In a cooperative session every participant shares the same value.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fd63e74-e9e2-4339-acd7-6730c574ddc3' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'FactionOrColor')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6fd63e74-e9e2-4339-acd7-6730c574ddc3',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100007,
            'FactionOrColor',
            'Faction Or Color',
            'Which faction, character, spirit, or player color this player used.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c6bbd8a-a9de-4c17-a481-6b162baadc1f' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = 'Notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2c6bbd8a-a9de-4c17-a481-6b162baadc1f',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
            100008,
            'Notes',
            'Notes',
            'Free-form notes about this player''s game.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc120482-d156-4a64-906c-220c0e3de9f3' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc120482-d156-4a64-906c-220c0e3de9f3',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9741d095-6ade-4b96-8b36-58448b69f8be' OR (EntityID = 'E577E552-533B-47FE-9898-B14DB9E62C9E' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9741d095-6ade-4b96-8b36-58448b69f8be',
            'E577E552-533B-47FE-9898-B14DB9E62C9E', -- Entity: Play Session Players
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

/* SQL text to insert entity field value with ID f18ac4a5-a55a-414a-bd63-b2d1ed041fd0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f18ac4a5-a55a-414a-bd63-b2d1ed041fd0', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 1, 'Abstract', 'Abstract', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a7b0cea3-59d2-428d-a466-b90bf865172f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a7b0cea3-59d2-428d-a466-b90bf865172f', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 2, 'Co-op', 'Co-op', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7974d507-3785-43de-b7b5-7c41f60397e2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7974d507-3785-43de-b7b5-7c41f60397e2', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 3, 'Deck Builder', 'Deck Builder', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6cc9a5da-4431-44e0-820b-12e3870528db */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6cc9a5da-4431-44e0-820b-12e3870528db', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 4, 'Dexterity', 'Dexterity', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bfea05fb-cb3f-4a3b-805e-7c5cbc80cd70 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bfea05fb-cb3f-4a3b-805e-7c5cbc80cd70', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 5, 'Family', 'Family', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ccd0cf70-9548-429d-aaa0-16252cc639ef */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ccd0cf70-9548-429d-aaa0-16252cc639ef', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 6, 'Legacy', 'Legacy', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f1f6e88a-4817-451e-8175-4a83088ba1f4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f1f6e88a-4817-451e-8175-4a83088ba1f4', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 7, 'Party', 'Party', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7595a4e5-e2f5-4a24-ad63-ab576d5709a6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7595a4e5-e2f5-4a24-ad63-ab576d5709a6', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 8, 'Strategy', 'Strategy', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0ccbacc3-e330-4aee-855d-935c840f1c38 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0ccbacc3-e330-4aee-855d-935c840f1c38', '227A49D8-5F0A-4B2A-BCA8-53F12168A286', 9, 'Trivia', 'Trivia', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 227A49D8-5F0A-4B2A-BCA8-53F12168A286 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='227A49D8-5F0A-4B2A-BCA8-53F12168A286';

/* SQL text to insert entity field value with ID 635f83ba-2034-4e06-b286-5050d82dedad */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('635f83ba-2034-4e06-b286-5050d82dedad', '30DF7E35-DBF7-4398-8697-28E63AB3B507', 1, 'Loaned Out', 'Loaned Out', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7877600f-6275-4f0c-83d8-29dbbc286bc3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7877600f-6275-4f0c-83d8-29dbbc286bc3', '30DF7E35-DBF7-4398-8697-28E63AB3B507', 2, 'Owned', 'Owned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d31e2ed6-0bc0-4676-a959-3669f1b9893b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d31e2ed6-0bc0-4676-a959-3669f1b9893b', '30DF7E35-DBF7-4398-8697-28E63AB3B507', 3, 'Retired', 'Retired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1c37aedd-9d17-4574-a9c1-e3efae298a4d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1c37aedd-9d17-4574-a9c1-e3efae298a4d', '30DF7E35-DBF7-4398-8697-28E63AB3B507', 4, 'Sold', 'Sold', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 30cb7e83-4581-4012-9b79-17392285cb52 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('30cb7e83-4581-4012-9b79-17392285cb52', '30DF7E35-DBF7-4398-8697-28E63AB3B507', 5, 'Wishlist', 'Wishlist', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 30DF7E35-DBF7-4398-8697-28E63AB3B507 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='30DF7E35-DBF7-4398-8697-28E63AB3B507';

/* SQL text to insert entity field value with ID a2586557-2b5e-41c0-9f81-426c6c58c624 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a2586557-2b5e-41c0-9f81-426c6c58c624', '2C902321-5D2E-4637-9A34-DFDF92C6A2A3', 1, 'Casual', 'Casual', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1152f616-8b81-4230-b921-4a8269d7b919 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1152f616-8b81-4230-b921-4a8269d7b919', '2C902321-5D2E-4637-9A34-DFDF92C6A2A3', 2, 'Novice', 'Novice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5474061e-36dd-4325-9025-2d8ca825199d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5474061e-36dd-4325-9025-2d8ca825199d', '2C902321-5D2E-4637-9A34-DFDF92C6A2A3', 3, 'Regular', 'Regular', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 95cf0bdd-0fb7-4b5b-a875-35c965ac4265 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('95cf0bdd-0fb7-4b5b-a875-35c965ac4265', '2C902321-5D2E-4637-9A34-DFDF92C6A2A3', 4, 'Shark', 'Shark', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2C902321-5D2E-4637-9A34-DFDF92C6A2A3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='2C902321-5D2E-4637-9A34-DFDF92C6A2A3';

/* SQL text to insert entity field value with ID a1184386-a0b3-47b4-8a07-86eea9cfbcb3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a1184386-a0b3-47b4-8a07-86eea9cfbcb3', 'DEC7549D-A9B7-4B67-8E67-32982CF51DB9', 1, 'Abandoned', 'Abandoned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 91d2ad87-ddd7-464b-bb4b-09e554377ab9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('91d2ad87-ddd7-464b-bb4b-09e554377ab9', 'DEC7549D-A9B7-4B67-8E67-32982CF51DB9', 2, 'Co-op Loss', 'Co-op Loss', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 90984734-b230-46d2-b3e0-4a79a15b1cac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('90984734-b230-46d2-b3e0-4a79a15b1cac', 'DEC7549D-A9B7-4B67-8E67-32982CF51DB9', 3, 'Co-op Win', 'Co-op Win', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1a2c350e-6836-4331-852a-97ee442edb09 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1a2c350e-6836-4331-852a-97ee442edb09', 'DEC7549D-A9B7-4B67-8E67-32982CF51DB9', 4, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID DEC7549D-A9B7-4B67-8E67-32982CF51DB9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='DEC7549D-A9B7-4B67-8E67-32982CF51DB9';


/* Create Entity Relationship: Games -> Game Designers (One To Many via GameID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '02103c01-27bf-4622-b2ae-828a240e474e'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('02103c01-27bf-4622-b2ae-828a240e474e', '795EF2C9-078E-4FB5-A128-193247F289B5', 'FACBEF80-C894-4A26-90DD-006EF0BF2459', 'GameID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Games -> Play Sessions (One To Many via GameID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '510c6f56-20bb-422d-be0d-c84f2e9903ae'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('510c6f56-20bb-422d-be0d-c84f2e9903ae', '795EF2C9-078E-4FB5-A128-193247F289B5', '83D87A52-57B6-436F-8D7C-870FC00BE36B', 'GameID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Publishers -> Games (One To Many via PublisherID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2a569caa-21b4-4970-8748-0d36513e6110'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2a569caa-21b4-4970-8748-0d36513e6110', 'BCD81161-AE5B-4F77-B2D0-2996BD014B64', '795EF2C9-078E-4FB5-A128-193247F289B5', 'PublisherID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Players -> Play Session Players (One To Many via PlayerID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6a53405a-6b78-4dd0-b326-e4d462536f8a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6a53405a-6b78-4dd0-b326-e4d462536f8a', 'C5F3994B-6718-4889-98EF-417AF0D93EDE', 'E577E552-533B-47FE-9898-B14DB9E62C9E', 'PlayerID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Designers -> Game Designers (One To Many via DesignerID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'b78451f2-fb86-4b07-b514-97af133c478c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b78451f2-fb86-4b07-b514-97af133c478c', 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', 'FACBEF80-C894-4A26-90DD-006EF0BF2459', 'DesignerID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: Play Sessions -> Play Session Players (One To Many via PlaySessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f2af84be-171e-454e-823f-c738d14fd3e5'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f2af84be-171e-454e-823f-c738d14fd3e5', '83D87A52-57B6-436F-8D7C-870FC00BE36B', 'E577E552-533B-47FE-9898-B14DB9E62C9E', 'PlaySessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for Designer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Designers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for GameDesigner */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Game Designers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GameID in table GameDesigner
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GameDesigner_GameID' 
    AND object_id = OBJECT_ID('[BoardGameNight].[GameDesigner]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GameDesigner_GameID ON [BoardGameNight].[GameDesigner] ([GameID]);

-- Index for foreign key DesignerID in table GameDesigner
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GameDesigner_DesignerID' 
    AND object_id = OBJECT_ID('[BoardGameNight].[GameDesigner]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GameDesigner_DesignerID ON [BoardGameNight].[GameDesigner] ([DesignerID]);

/* SQL text to update entity field related entity name field map for entity field ID EABCF5F5-4F2A-4C4E-8BD0-2F7EC85659F2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='EABCF5F5-4F2A-4C4E-8BD0-2F7EC85659F2', @RelatedEntityNameFieldMap='Game';

/* Index for Foreign Keys for Game */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Games
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PublisherID in table Game
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Game_PublisherID' 
    AND object_id = OBJECT_ID('[BoardGameNight].[Game]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Game_PublisherID ON [BoardGameNight].[Game] ([PublisherID]);

/* SQL text to update entity field related entity name field map for entity field ID 2451F9AB-CDEC-4D1C-B9BA-99143B3E30BA */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2451F9AB-CDEC-4D1C-B9BA-99143B3E30BA', @RelatedEntityNameFieldMap='Publisher';

/* Base View SQL for Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Designers
-- Item: vwDesigners
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Designers
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  Designer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwDesigners]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwDesigners];
GO

CREATE VIEW [BoardGameNight].[vwDesigners]
AS
SELECT
    d.*
FROM
    [BoardGameNight].[Designer] AS d
GO
GRANT SELECT ON [BoardGameNight].[vwDesigners] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Designers
-- Item: Permissions for vwDesigners
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwDesigners] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Designers
-- Item: spCreateDesigner
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Designer
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreateDesigner]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreateDesigner];
GO

CREATE PROCEDURE [BoardGameNight].[spCreateDesigner]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Bio_Clear bit = 0,
    @Bio nvarchar(MAX) = NULL,
    @Website_Clear bit = 0,
    @Website nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[Designer]
            (
                [ID],
                [FirstName],
                [LastName],
                [Bio],
                [Website]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FirstName,
                @LastName,
                CASE WHEN @Bio_Clear = 1 THEN NULL ELSE ISNULL(@Bio, NULL) END,
                CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[Designer]
            (
                [FirstName],
                [LastName],
                [Bio],
                [Website]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                CASE WHEN @Bio_Clear = 1 THEN NULL ELSE ISNULL(@Bio, NULL) END,
                CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwDesigners] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreateDesigner] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Designers */

GRANT EXECUTE ON [BoardGameNight].[spCreateDesigner] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Designers
-- Item: spUpdateDesigner
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Designer
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdateDesigner]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdateDesigner];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdateDesigner]
    @ID uniqueidentifier,
    @FirstName nvarchar(100) = NULL,
    @LastName nvarchar(100) = NULL,
    @Bio_Clear bit = 0,
    @Bio nvarchar(MAX) = NULL,
    @Website_Clear bit = 0,
    @Website nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Designer]
    SET
        [FirstName] = ISNULL(@FirstName, [FirstName]),
        [LastName] = ISNULL(@LastName, [LastName]),
        [Bio] = CASE WHEN @Bio_Clear = 1 THEN NULL ELSE ISNULL(@Bio, [Bio]) END,
        [Website] = CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, [Website]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwDesigners] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwDesigners]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdateDesigner] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Designer table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdateDesigner]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdateDesigner];
GO
CREATE TRIGGER [BoardGameNight].trgUpdateDesigner
ON [BoardGameNight].[Designer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Designer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[Designer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Designers */

GRANT EXECUTE ON [BoardGameNight].[spUpdateDesigner] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Designers
-- Item: spDeleteDesigner
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Designer
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeleteDesigner]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeleteDesigner];
GO

CREATE PROCEDURE [BoardGameNight].[spDeleteDesigner]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[Designer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeleteDesigner] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Designers */

GRANT EXECUTE ON [BoardGameNight].[spDeleteDesigner] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Games */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Games
-- Item: vwGames
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Games
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  Game
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwGames]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwGames];
GO

CREATE VIEW [BoardGameNight].[vwGames]
AS
SELECT
    g.*,
    BoardGameNightPublisher_PublisherID.[Name] AS [Publisher]
FROM
    [BoardGameNight].[Game] AS g
INNER JOIN
    [BoardGameNight].[Publisher] AS BoardGameNightPublisher_PublisherID
  ON
    [g].[PublisherID] = BoardGameNightPublisher_PublisherID.[ID]
GO
GRANT SELECT ON [BoardGameNight].[vwGames] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Games */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Games
-- Item: Permissions for vwGames
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwGames] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Games */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Games
-- Item: spCreateGame
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Game
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreateGame]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreateGame];
GO

CREATE PROCEDURE [BoardGameNight].[spCreateGame]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @PublisherID uniqueidentifier,
    @YearPublished_Clear bit = 0,
    @YearPublished int = NULL,
    @MinPlayers int,
    @MaxPlayers int,
    @MinPlayTimeMinutes_Clear bit = 0,
    @MinPlayTimeMinutes int = NULL,
    @MaxPlayTimeMinutes_Clear bit = 0,
    @MaxPlayTimeMinutes int = NULL,
    @Weight_Clear bit = 0,
    @Weight decimal(3, 2) = NULL,
    @Category nvarchar(50),
    @OwnershipStatus nvarchar(30) = NULL,
    @AcquiredDate_Clear bit = 0,
    @AcquiredDate date = NULL,
    @PurchasePrice_Clear bit = 0,
    @PurchasePrice decimal(10, 2) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[Game]
            (
                [ID],
                [Name],
                [PublisherID],
                [YearPublished],
                [MinPlayers],
                [MaxPlayers],
                [MinPlayTimeMinutes],
                [MaxPlayTimeMinutes],
                [Weight],
                [Category],
                [OwnershipStatus],
                [AcquiredDate],
                [PurchasePrice],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @PublisherID,
                CASE WHEN @YearPublished_Clear = 1 THEN NULL ELSE ISNULL(@YearPublished, NULL) END,
                @MinPlayers,
                @MaxPlayers,
                CASE WHEN @MinPlayTimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MinPlayTimeMinutes, NULL) END,
                CASE WHEN @MaxPlayTimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MaxPlayTimeMinutes, NULL) END,
                CASE WHEN @Weight_Clear = 1 THEN NULL ELSE ISNULL(@Weight, NULL) END,
                @Category,
                ISNULL(@OwnershipStatus, 'Owned'),
                CASE WHEN @AcquiredDate_Clear = 1 THEN NULL ELSE ISNULL(@AcquiredDate, NULL) END,
                CASE WHEN @PurchasePrice_Clear = 1 THEN NULL ELSE ISNULL(@PurchasePrice, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[Game]
            (
                [Name],
                [PublisherID],
                [YearPublished],
                [MinPlayers],
                [MaxPlayers],
                [MinPlayTimeMinutes],
                [MaxPlayTimeMinutes],
                [Weight],
                [Category],
                [OwnershipStatus],
                [AcquiredDate],
                [PurchasePrice],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @PublisherID,
                CASE WHEN @YearPublished_Clear = 1 THEN NULL ELSE ISNULL(@YearPublished, NULL) END,
                @MinPlayers,
                @MaxPlayers,
                CASE WHEN @MinPlayTimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MinPlayTimeMinutes, NULL) END,
                CASE WHEN @MaxPlayTimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MaxPlayTimeMinutes, NULL) END,
                CASE WHEN @Weight_Clear = 1 THEN NULL ELSE ISNULL(@Weight, NULL) END,
                @Category,
                ISNULL(@OwnershipStatus, 'Owned'),
                CASE WHEN @AcquiredDate_Clear = 1 THEN NULL ELSE ISNULL(@AcquiredDate, NULL) END,
                CASE WHEN @PurchasePrice_Clear = 1 THEN NULL ELSE ISNULL(@PurchasePrice, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwGames] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreateGame] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Games */

GRANT EXECUTE ON [BoardGameNight].[spCreateGame] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Games */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Games
-- Item: spUpdateGame
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Game
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdateGame]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdateGame];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdateGame]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @PublisherID uniqueidentifier = NULL,
    @YearPublished_Clear bit = 0,
    @YearPublished int = NULL,
    @MinPlayers int = NULL,
    @MaxPlayers int = NULL,
    @MinPlayTimeMinutes_Clear bit = 0,
    @MinPlayTimeMinutes int = NULL,
    @MaxPlayTimeMinutes_Clear bit = 0,
    @MaxPlayTimeMinutes int = NULL,
    @Weight_Clear bit = 0,
    @Weight decimal(3, 2) = NULL,
    @Category nvarchar(50) = NULL,
    @OwnershipStatus nvarchar(30) = NULL,
    @AcquiredDate_Clear bit = 0,
    @AcquiredDate date = NULL,
    @PurchasePrice_Clear bit = 0,
    @PurchasePrice decimal(10, 2) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Game]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [PublisherID] = ISNULL(@PublisherID, [PublisherID]),
        [YearPublished] = CASE WHEN @YearPublished_Clear = 1 THEN NULL ELSE ISNULL(@YearPublished, [YearPublished]) END,
        [MinPlayers] = ISNULL(@MinPlayers, [MinPlayers]),
        [MaxPlayers] = ISNULL(@MaxPlayers, [MaxPlayers]),
        [MinPlayTimeMinutes] = CASE WHEN @MinPlayTimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MinPlayTimeMinutes, [MinPlayTimeMinutes]) END,
        [MaxPlayTimeMinutes] = CASE WHEN @MaxPlayTimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MaxPlayTimeMinutes, [MaxPlayTimeMinutes]) END,
        [Weight] = CASE WHEN @Weight_Clear = 1 THEN NULL ELSE ISNULL(@Weight, [Weight]) END,
        [Category] = ISNULL(@Category, [Category]),
        [OwnershipStatus] = ISNULL(@OwnershipStatus, [OwnershipStatus]),
        [AcquiredDate] = CASE WHEN @AcquiredDate_Clear = 1 THEN NULL ELSE ISNULL(@AcquiredDate, [AcquiredDate]) END,
        [PurchasePrice] = CASE WHEN @PurchasePrice_Clear = 1 THEN NULL ELSE ISNULL(@PurchasePrice, [PurchasePrice]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwGames] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwGames]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdateGame] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Game table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdateGame]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdateGame];
GO
CREATE TRIGGER [BoardGameNight].trgUpdateGame
ON [BoardGameNight].[Game]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Game]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[Game] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Games */

GRANT EXECUTE ON [BoardGameNight].[spUpdateGame] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Games */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Games
-- Item: spDeleteGame
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Game
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeleteGame]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeleteGame];
GO

CREATE PROCEDURE [BoardGameNight].[spDeleteGame]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[Game]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeleteGame] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Games */

GRANT EXECUTE ON [BoardGameNight].[spDeleteGame] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Game Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Game Designers
-- Item: vwGameDesigners
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Game Designers
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  GameDesigner
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwGameDesigners]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwGameDesigners];
GO

CREATE VIEW [BoardGameNight].[vwGameDesigners]
AS
SELECT
    g.*,
    BoardGameNightGame_GameID.[Name] AS [Game]
FROM
    [BoardGameNight].[GameDesigner] AS g
INNER JOIN
    [BoardGameNight].[Game] AS BoardGameNightGame_GameID
  ON
    [g].[GameID] = BoardGameNightGame_GameID.[ID]
GO
GRANT SELECT ON [BoardGameNight].[vwGameDesigners] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Game Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Game Designers
-- Item: Permissions for vwGameDesigners
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwGameDesigners] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Game Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Game Designers
-- Item: spCreateGameDesigner
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GameDesigner
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreateGameDesigner]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreateGameDesigner];
GO

CREATE PROCEDURE [BoardGameNight].[spCreateGameDesigner]
    @ID uniqueidentifier = NULL,
    @GameID uniqueidentifier,
    @DesignerID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[GameDesigner]
            (
                [ID],
                [GameID],
                [DesignerID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @GameID,
                @DesignerID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[GameDesigner]
            (
                [GameID],
                [DesignerID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @GameID,
                @DesignerID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwGameDesigners] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreateGameDesigner] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Game Designers */

GRANT EXECUTE ON [BoardGameNight].[spCreateGameDesigner] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Game Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Game Designers
-- Item: spUpdateGameDesigner
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GameDesigner
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdateGameDesigner]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdateGameDesigner];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdateGameDesigner]
    @ID uniqueidentifier,
    @GameID uniqueidentifier = NULL,
    @DesignerID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[GameDesigner]
    SET
        [GameID] = ISNULL(@GameID, [GameID]),
        [DesignerID] = ISNULL(@DesignerID, [DesignerID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwGameDesigners] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwGameDesigners]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdateGameDesigner] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GameDesigner table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdateGameDesigner]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdateGameDesigner];
GO
CREATE TRIGGER [BoardGameNight].trgUpdateGameDesigner
ON [BoardGameNight].[GameDesigner]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[GameDesigner]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[GameDesigner] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Game Designers */

GRANT EXECUTE ON [BoardGameNight].[spUpdateGameDesigner] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Game Designers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Game Designers
-- Item: spDeleteGameDesigner
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GameDesigner
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeleteGameDesigner]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeleteGameDesigner];
GO

CREATE PROCEDURE [BoardGameNight].[spDeleteGameDesigner]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[GameDesigner]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeleteGameDesigner] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Game Designers */

GRANT EXECUTE ON [BoardGameNight].[spDeleteGameDesigner] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PlaySessionPlayer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Session Players
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PlaySessionID in table PlaySessionPlayer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PlaySessionPlayer_PlaySessionID' 
    AND object_id = OBJECT_ID('[BoardGameNight].[PlaySessionPlayer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PlaySessionPlayer_PlaySessionID ON [BoardGameNight].[PlaySessionPlayer] ([PlaySessionID]);

-- Index for foreign key PlayerID in table PlaySessionPlayer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PlaySessionPlayer_PlayerID' 
    AND object_id = OBJECT_ID('[BoardGameNight].[PlaySessionPlayer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PlaySessionPlayer_PlayerID ON [BoardGameNight].[PlaySessionPlayer] ([PlayerID]);

/* Index for Foreign Keys for PlaySession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GameID in table PlaySession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PlaySession_GameID' 
    AND object_id = OBJECT_ID('[BoardGameNight].[PlaySession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PlaySession_GameID ON [BoardGameNight].[PlaySession] ([GameID]);

/* SQL text to update entity field related entity name field map for entity field ID B5DD6863-A9A0-4AFD-80F4-AEB4D0430A5F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B5DD6863-A9A0-4AFD-80F4-AEB4D0430A5F', @RelatedEntityNameFieldMap='Game';

/* Index for Foreign Keys for Player */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Players
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Play Session Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Session Players
-- Item: vwPlaySessionPlayers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Play Session Players
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  PlaySessionPlayer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwPlaySessionPlayers]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwPlaySessionPlayers];
GO

CREATE VIEW [BoardGameNight].[vwPlaySessionPlayers]
AS
SELECT
    p.*
FROM
    [BoardGameNight].[PlaySessionPlayer] AS p
GO
GRANT SELECT ON [BoardGameNight].[vwPlaySessionPlayers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Play Session Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Session Players
-- Item: Permissions for vwPlaySessionPlayers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwPlaySessionPlayers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Play Session Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Session Players
-- Item: spCreatePlaySessionPlayer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PlaySessionPlayer
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreatePlaySessionPlayer]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreatePlaySessionPlayer];
GO

CREATE PROCEDURE [BoardGameNight].[spCreatePlaySessionPlayer]
    @ID uniqueidentifier = NULL,
    @PlaySessionID uniqueidentifier,
    @PlayerID uniqueidentifier,
    @Score_Clear bit = 0,
    @Score int = NULL,
    @Placement_Clear bit = 0,
    @Placement int = NULL,
    @IsWinner bit = NULL,
    @FactionOrColor_Clear bit = 0,
    @FactionOrColor nvarchar(100) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[PlaySessionPlayer]
            (
                [ID],
                [PlaySessionID],
                [PlayerID],
                [Score],
                [Placement],
                [IsWinner],
                [FactionOrColor],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PlaySessionID,
                @PlayerID,
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @Placement_Clear = 1 THEN NULL ELSE ISNULL(@Placement, NULL) END,
                ISNULL(@IsWinner, 0),
                CASE WHEN @FactionOrColor_Clear = 1 THEN NULL ELSE ISNULL(@FactionOrColor, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[PlaySessionPlayer]
            (
                [PlaySessionID],
                [PlayerID],
                [Score],
                [Placement],
                [IsWinner],
                [FactionOrColor],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PlaySessionID,
                @PlayerID,
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @Placement_Clear = 1 THEN NULL ELSE ISNULL(@Placement, NULL) END,
                ISNULL(@IsWinner, 0),
                CASE WHEN @FactionOrColor_Clear = 1 THEN NULL ELSE ISNULL(@FactionOrColor, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwPlaySessionPlayers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreatePlaySessionPlayer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Play Session Players */

GRANT EXECUTE ON [BoardGameNight].[spCreatePlaySessionPlayer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Play Session Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Session Players
-- Item: spUpdatePlaySessionPlayer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PlaySessionPlayer
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdatePlaySessionPlayer]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdatePlaySessionPlayer];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdatePlaySessionPlayer]
    @ID uniqueidentifier,
    @PlaySessionID uniqueidentifier = NULL,
    @PlayerID uniqueidentifier = NULL,
    @Score_Clear bit = 0,
    @Score int = NULL,
    @Placement_Clear bit = 0,
    @Placement int = NULL,
    @IsWinner bit = NULL,
    @FactionOrColor_Clear bit = 0,
    @FactionOrColor nvarchar(100) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[PlaySessionPlayer]
    SET
        [PlaySessionID] = ISNULL(@PlaySessionID, [PlaySessionID]),
        [PlayerID] = ISNULL(@PlayerID, [PlayerID]),
        [Score] = CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, [Score]) END,
        [Placement] = CASE WHEN @Placement_Clear = 1 THEN NULL ELSE ISNULL(@Placement, [Placement]) END,
        [IsWinner] = ISNULL(@IsWinner, [IsWinner]),
        [FactionOrColor] = CASE WHEN @FactionOrColor_Clear = 1 THEN NULL ELSE ISNULL(@FactionOrColor, [FactionOrColor]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwPlaySessionPlayers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwPlaySessionPlayers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdatePlaySessionPlayer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PlaySessionPlayer table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdatePlaySessionPlayer]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdatePlaySessionPlayer];
GO
CREATE TRIGGER [BoardGameNight].trgUpdatePlaySessionPlayer
ON [BoardGameNight].[PlaySessionPlayer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[PlaySessionPlayer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[PlaySessionPlayer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Play Session Players */

GRANT EXECUTE ON [BoardGameNight].[spUpdatePlaySessionPlayer] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Players
-- Item: vwPlayers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Players
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  Player
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwPlayers]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwPlayers];
GO

CREATE VIEW [BoardGameNight].[vwPlayers]
AS
SELECT
    p.*
FROM
    [BoardGameNight].[Player] AS p
GO
GRANT SELECT ON [BoardGameNight].[vwPlayers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Players
-- Item: Permissions for vwPlayers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwPlayers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Players
-- Item: spCreatePlayer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Player
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreatePlayer]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreatePlayer];
GO

CREATE PROCEDURE [BoardGameNight].[spCreatePlayer]
    @ID uniqueidentifier = NULL,
    @FirstName nvarchar(100),
    @LastName nvarchar(100),
    @Nickname_Clear bit = 0,
    @Nickname nvarchar(50) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @JoinedDate_Clear bit = 0,
    @JoinedDate date = NULL,
    @SkillLevel nvarchar(20) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[Player]
            (
                [ID],
                [FirstName],
                [LastName],
                [Nickname],
                [Email],
                [JoinedDate],
                [SkillLevel],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FirstName,
                @LastName,
                CASE WHEN @Nickname_Clear = 1 THEN NULL ELSE ISNULL(@Nickname, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @JoinedDate_Clear = 1 THEN NULL ELSE ISNULL(@JoinedDate, NULL) END,
                ISNULL(@SkillLevel, 'Casual'),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[Player]
            (
                [FirstName],
                [LastName],
                [Nickname],
                [Email],
                [JoinedDate],
                [SkillLevel],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FirstName,
                @LastName,
                CASE WHEN @Nickname_Clear = 1 THEN NULL ELSE ISNULL(@Nickname, NULL) END,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @JoinedDate_Clear = 1 THEN NULL ELSE ISNULL(@JoinedDate, NULL) END,
                ISNULL(@SkillLevel, 'Casual'),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwPlayers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreatePlayer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Players */

GRANT EXECUTE ON [BoardGameNight].[spCreatePlayer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Players
-- Item: spUpdatePlayer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Player
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdatePlayer]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdatePlayer];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdatePlayer]
    @ID uniqueidentifier,
    @FirstName nvarchar(100) = NULL,
    @LastName nvarchar(100) = NULL,
    @Nickname_Clear bit = 0,
    @Nickname nvarchar(50) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @JoinedDate_Clear bit = 0,
    @JoinedDate date = NULL,
    @SkillLevel nvarchar(20) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Player]
    SET
        [FirstName] = ISNULL(@FirstName, [FirstName]),
        [LastName] = ISNULL(@LastName, [LastName]),
        [Nickname] = CASE WHEN @Nickname_Clear = 1 THEN NULL ELSE ISNULL(@Nickname, [Nickname]) END,
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [JoinedDate] = CASE WHEN @JoinedDate_Clear = 1 THEN NULL ELSE ISNULL(@JoinedDate, [JoinedDate]) END,
        [SkillLevel] = ISNULL(@SkillLevel, [SkillLevel]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwPlayers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwPlayers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdatePlayer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Player table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdatePlayer]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdatePlayer];
GO
CREATE TRIGGER [BoardGameNight].trgUpdatePlayer
ON [BoardGameNight].[Player]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Player]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[Player] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Players */

GRANT EXECUTE ON [BoardGameNight].[spUpdatePlayer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Play Session Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Session Players
-- Item: spDeletePlaySessionPlayer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PlaySessionPlayer
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeletePlaySessionPlayer]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeletePlaySessionPlayer];
GO

CREATE PROCEDURE [BoardGameNight].[spDeletePlaySessionPlayer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[PlaySessionPlayer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeletePlaySessionPlayer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Play Session Players */

GRANT EXECUTE ON [BoardGameNight].[spDeletePlaySessionPlayer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Players */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Players
-- Item: spDeletePlayer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Player
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeletePlayer]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeletePlayer];
GO

CREATE PROCEDURE [BoardGameNight].[spDeletePlayer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[Player]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeletePlayer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Players */

GRANT EXECUTE ON [BoardGameNight].[spDeletePlayer] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Play Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Sessions
-- Item: vwPlaySessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Play Sessions
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  PlaySession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwPlaySessions]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwPlaySessions];
GO

CREATE VIEW [BoardGameNight].[vwPlaySessions]
AS
SELECT
    p.*,
    BoardGameNightGame_GameID.[Name] AS [Game]
FROM
    [BoardGameNight].[PlaySession] AS p
INNER JOIN
    [BoardGameNight].[Game] AS BoardGameNightGame_GameID
  ON
    [p].[GameID] = BoardGameNightGame_GameID.[ID]
GO
GRANT SELECT ON [BoardGameNight].[vwPlaySessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Play Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Sessions
-- Item: Permissions for vwPlaySessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwPlaySessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Play Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Sessions
-- Item: spCreatePlaySession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PlaySession
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreatePlaySession]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreatePlaySession];
GO

CREATE PROCEDURE [BoardGameNight].[spCreatePlaySession]
    @ID uniqueidentifier = NULL,
    @GameID uniqueidentifier,
    @PlayedAt datetime2,
    @LocationName_Clear bit = 0,
    @LocationName nvarchar(200) = NULL,
    @DurationMinutes_Clear bit = 0,
    @DurationMinutes int = NULL,
    @Outcome nvarchar(30) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[PlaySession]
            (
                [ID],
                [GameID],
                [PlayedAt],
                [LocationName],
                [DurationMinutes],
                [Outcome],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @GameID,
                @PlayedAt,
                CASE WHEN @LocationName_Clear = 1 THEN NULL ELSE ISNULL(@LocationName, NULL) END,
                CASE WHEN @DurationMinutes_Clear = 1 THEN NULL ELSE ISNULL(@DurationMinutes, NULL) END,
                ISNULL(@Outcome, 'Completed'),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[PlaySession]
            (
                [GameID],
                [PlayedAt],
                [LocationName],
                [DurationMinutes],
                [Outcome],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @GameID,
                @PlayedAt,
                CASE WHEN @LocationName_Clear = 1 THEN NULL ELSE ISNULL(@LocationName, NULL) END,
                CASE WHEN @DurationMinutes_Clear = 1 THEN NULL ELSE ISNULL(@DurationMinutes, NULL) END,
                ISNULL(@Outcome, 'Completed'),
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwPlaySessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreatePlaySession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Play Sessions */

GRANT EXECUTE ON [BoardGameNight].[spCreatePlaySession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Play Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Sessions
-- Item: spUpdatePlaySession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PlaySession
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdatePlaySession]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdatePlaySession];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdatePlaySession]
    @ID uniqueidentifier,
    @GameID uniqueidentifier = NULL,
    @PlayedAt datetime2 = NULL,
    @LocationName_Clear bit = 0,
    @LocationName nvarchar(200) = NULL,
    @DurationMinutes_Clear bit = 0,
    @DurationMinutes int = NULL,
    @Outcome nvarchar(30) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[PlaySession]
    SET
        [GameID] = ISNULL(@GameID, [GameID]),
        [PlayedAt] = ISNULL(@PlayedAt, [PlayedAt]),
        [LocationName] = CASE WHEN @LocationName_Clear = 1 THEN NULL ELSE ISNULL(@LocationName, [LocationName]) END,
        [DurationMinutes] = CASE WHEN @DurationMinutes_Clear = 1 THEN NULL ELSE ISNULL(@DurationMinutes, [DurationMinutes]) END,
        [Outcome] = ISNULL(@Outcome, [Outcome]),
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwPlaySessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwPlaySessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdatePlaySession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PlaySession table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdatePlaySession]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdatePlaySession];
GO
CREATE TRIGGER [BoardGameNight].trgUpdatePlaySession
ON [BoardGameNight].[PlaySession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[PlaySession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[PlaySession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Play Sessions */

GRANT EXECUTE ON [BoardGameNight].[spUpdatePlaySession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Play Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Play Sessions
-- Item: spDeletePlaySession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PlaySession
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeletePlaySession]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeletePlaySession];
GO

CREATE PROCEDURE [BoardGameNight].[spDeletePlaySession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[PlaySession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeletePlaySession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Play Sessions */

GRANT EXECUTE ON [BoardGameNight].[spDeletePlaySession] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Publisher */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: vwPublishers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Publishers
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  Publisher
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwPublishers]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwPublishers];
GO

CREATE VIEW [BoardGameNight].[vwPublishers]
AS
SELECT
    p.*
FROM
    [BoardGameNight].[Publisher] AS p
GO
GRANT SELECT ON [BoardGameNight].[vwPublishers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: Permissions for vwPublishers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwPublishers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: spCreatePublisher
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Publisher
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreatePublisher]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreatePublisher];
GO

CREATE PROCEDURE [BoardGameNight].[spCreatePublisher]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @FoundedYear_Clear bit = 0,
    @FoundedYear int = NULL,
    @Country_Clear bit = 0,
    @Country nvarchar(100) = NULL,
    @Website_Clear bit = 0,
    @Website nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[Publisher]
            (
                [ID],
                [Name],
                [FoundedYear],
                [Country],
                [Website]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @FoundedYear_Clear = 1 THEN NULL ELSE ISNULL(@FoundedYear, NULL) END,
                CASE WHEN @Country_Clear = 1 THEN NULL ELSE ISNULL(@Country, NULL) END,
                CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[Publisher]
            (
                [Name],
                [FoundedYear],
                [Country],
                [Website]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @FoundedYear_Clear = 1 THEN NULL ELSE ISNULL(@FoundedYear, NULL) END,
                CASE WHEN @Country_Clear = 1 THEN NULL ELSE ISNULL(@Country, NULL) END,
                CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwPublishers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreatePublisher] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Publishers */

GRANT EXECUTE ON [BoardGameNight].[spCreatePublisher] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: spUpdatePublisher
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Publisher
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdatePublisher]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdatePublisher];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdatePublisher]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @FoundedYear_Clear bit = 0,
    @FoundedYear int = NULL,
    @Country_Clear bit = 0,
    @Country nvarchar(100) = NULL,
    @Website_Clear bit = 0,
    @Website nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Publisher]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [FoundedYear] = CASE WHEN @FoundedYear_Clear = 1 THEN NULL ELSE ISNULL(@FoundedYear, [FoundedYear]) END,
        [Country] = CASE WHEN @Country_Clear = 1 THEN NULL ELSE ISNULL(@Country, [Country]) END,
        [Website] = CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, [Website]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwPublishers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwPublishers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdatePublisher] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Publisher table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdatePublisher]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdatePublisher];
GO
CREATE TRIGGER [BoardGameNight].trgUpdatePublisher
ON [BoardGameNight].[Publisher]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Publisher]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[Publisher] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Publishers */

GRANT EXECUTE ON [BoardGameNight].[spUpdatePublisher] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: spDeletePublisher
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Publisher
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeletePublisher]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeletePublisher];
GO

CREATE PROCEDURE [BoardGameNight].[spDeletePublisher]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[Publisher]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeletePublisher] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Publishers */

GRANT EXECUTE ON [BoardGameNight].[spDeletePublisher] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '943c9dc9-12be-4d9e-b342-32ce45d595b3' OR (EntityID = 'FACBEF80-C894-4A26-90DD-006EF0BF2459' AND Name = 'Game')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '943c9dc9-12be-4d9e-b342-32ce45d595b3',
            'FACBEF80-C894-4A26-90DD-006EF0BF2459', -- Entity: Game Designers
            100011,
            'Game',
            'Game',
            NULL,
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9980f16c-adaa-4350-a38f-a1436a8d7bd0' OR (EntityID = '795EF2C9-078E-4FB5-A128-193247F289B5' AND Name = 'Publisher')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9980f16c-adaa-4350-a38f-a1436a8d7bd0',
            '795EF2C9-078E-4FB5-A128-193247F289B5', -- Entity: Games
            100033,
            'Publisher',
            'Publisher',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cca6b2a1-a6c2-46ba-81ef-785a026cbc7f' OR (EntityID = '83D87A52-57B6-436F-8D7C-870FC00BE36B' AND Name = 'Game')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cca6b2a1-a6c2-46ba-81ef-785a026cbc7f',
            '83D87A52-57B6-436F-8D7C-870FC00BE36B', -- Entity: Play Sessions
            100019,
            'Game',
            'Game',
            NULL,
            'nvarchar',
            510,
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
               WHERE ID = '943C9DC9-12BE-4D9E-B342-32CE45D595B3'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'FACBEF80-C894-4A26-90DD-006EF0BF2459'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F23B28A6-457E-4869-B1EE-F93AA5A82EFF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6352FE7C-014C-4B69-AD50-7ADDA46E01FC'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D9B53FA4-A98B-4EB1-BC82-08E38E69CB23'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'DC593A88-4088-4076-B107-3BB144ED5C14'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1A106A7C-3A27-4936-9112-37D06D2CF1AE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '227A49D8-5F0A-4B2A-BCA8-53F12168A286'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '30DF7E35-DBF7-4398-8697-28E63AB3B507'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '32124D7A-9F65-444B-A5A3-0094D1CD4A41'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4A075719-367B-411E-9355-44F863C6905E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FF341E22-EDAA-4C6D-95A3-3CB480420D28'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E39B7A99-68F4-49B8-A387-D37F13F2A482'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DEC7549D-A9B7-4B67-8E67-32982CF51DB9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CCA6B2A1-A6C2-46BA-81EF-785A026CBC7F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FF341E22-EDAA-4C6D-95A3-3CB480420D28'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CCA6B2A1-A6C2-46BA-81EF-785A026CBC7F'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'CCA6B2A1-A6C2-46BA-81EF-785A026CBC7F'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'FF341E22-EDAA-4C6D-95A3-3CB480420D28'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'A61BC74B-23A0-41A5-8373-E6726A77BDD9'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A61BC74B-23A0-41A5-8373-E6726A77BDD9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '07146111-95D7-4010-B80C-BBDA74F220E2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F9B187ED-3D20-4CF6-8571-A78BEC2FE488'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A61BC74B-23A0-41A5-8373-E6726A77BDD9'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '07146111-95D7-4010-B80C-BBDA74F220E2'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'A61BC74B-23A0-41A5-8373-E6726A77BDD9'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '07146111-95D7-4010-B80C-BBDA74F220E2'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '0BDF8594-66C9-41E6-AA62-E7F0307C0A6C'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0BDF8594-66C9-41E6-AA62-E7F0307C0A6C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '7DF52864-A6AA-413D-BC9B-3E141EA8C548'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '734A74BC-4A40-4409-9092-DD994EB05684'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CA1DFE73-B687-41CA-8210-5535BD9915C2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2C902321-5D2E-4637-9A34-DFDF92C6A2A3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B2DE279C-4E18-4367-948A-1CE908C13DE0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0BDF8594-66C9-41E6-AA62-E7F0307C0A6C'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7DF52864-A6AA-413D-BC9B-3E141EA8C548'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '734A74BC-4A40-4409-9092-DD994EB05684'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CA1DFE73-B687-41CA-8210-5535BD9915C2'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0BDF8594-66C9-41E6-AA62-E7F0307C0A6C'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '7DF52864-A6AA-413D-BC9B-3E141EA8C548'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'CA1DFE73-B687-41CA-8210-5535BD9915C2'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '734A74BC-4A40-4409-9092-DD994EB05684'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EC298A94-1EFF-417F-A110-598E07B91527'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '52269B47-A8FC-446C-8D2B-8FCF2C8ED61C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '51AF5002-6D87-408C-AB43-0916997D762A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C63C4C3E-07F8-44A5-84C0-3EB279F59F73'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6FD63E74-E9E2-4339-ACD7-6730C574DDC3'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'E577E552-533B-47FE-9898-B14DB9E62C9E'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info Game Designers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7A2E309F-B974-4085-BB46-7A22F0320E07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Game Designers.GameID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Game',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EABCF5F5-4F2A-4C4E-8BD0-2F7EC85659F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Game Designers.DesignerID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Designer',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6F54E16F-01D0-43D1-B9BC-55DC0FAF341C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Game Designers.Game 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Game Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '943C9DC9-12BE-4D9E-B342-32CE45D595B3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Game Designers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E7803AE-D68E-486F-972C-E445E9CD9EE9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Game Designers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BB952AD-875E-483F-A223-268C20ADD120' AND AutoUpdateCategory = 1;

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info Publishers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '26302F08-3F6B-4E07-A170-9F475D259245' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Publishers.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC593A88-4088-4076-B107-3BB144ED5C14' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Publishers.FoundedYear 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F23B28A6-457E-4869-B1EE-F93AA5A82EFF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Publishers.Country 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoCountry',
   CodeType = NULL
WHERE 
   ID = '6352FE7C-014C-4B69-AD50-7ADDA46E01FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Publishers.Website 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Publisher Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'D9B53FA4-A98B-4EB1-BC82-08E38E69CB23' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Publishers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '26479AA6-7620-4EAB-928C-17074BFE85AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Publishers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40AECBA3-5970-4A8F-9426-143250D50614' AND AutoUpdateCategory = 1;

/* Set categories for 7 fields */

-- UPDATE Entity Field Category Info Designers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D6232976-7E16-4CDE-9005-99BBEE3B79C8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Designers.FirstName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Designer Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A61BC74B-23A0-41A5-8373-E6726A77BDD9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Designers.LastName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Designer Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07146111-95D7-4010-B80C-BBDA74F220E2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Designers.Bio 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Designer Profile',
   GeneratedFormSection = 'Category',
   DisplayName = 'Biography',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0096826C-ED4F-4AFF-A68E-067550158BEE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Designers.Website 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Designer Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'F9B187ED-3D20-4CF6-8571-A78BEC2FE488' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Designers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03C8A745-9CB6-4E1F-B2EE-5EBA482DF6B2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Designers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4459A6B-6421-40B9-A384-126E4F0C6286' AND AutoUpdateCategory = 1;

/* Set SupportsGeoCoding = true for Publishers */

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET [SupportsGeoCoding] = 1
            WHERE [ID] = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND [AutoUpdateSupportsGeoCoding] = 1;

/* Set entity icon to fa fa-link */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-link', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'FACBEF80-C894-4A26-90DD-006EF0BF2459';

/* Set entity icon to fa fa-building */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-building', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64';

/* Set entity icon to fa fa-user-edit */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-user-edit', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5368ea14-7d70-453f-8db4-4f93c619e637', 'FACBEF80-C894-4A26-90DD-006EF0BF2459', 'FieldCategoryInfo', '{"Relationships":{"icon":"fa fa-link","description":"Foreign key references linking games to designers"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6bb56049-5c77-4fb6-9ade-5537346b7b06', 'BCD81161-AE5B-4F77-B2D0-2996BD014B64', 'FieldCategoryInfo', '{"Publisher Information":{"icon":"fa fa-building","description":"General business details including company name, origin, and contact information"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('dc479a9e-0b7d-4e55-a598-0ab2b9a71881', 'FACBEF80-C894-4A26-90DD-006EF0BF2459', 'FieldCategoryIcons', '{"Relationships":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b47ca53e-22c8-4fe4-b6eb-619cca2a7472', 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', 'FieldCategoryInfo', '{"Designer Profile":{"icon":"fa fa-user","description":"Personal details, biography, and professional links for the game designer"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info Games.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F068DAB0-FB3C-4FB4-A959-D96F6187DE29' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '32124D7A-9F65-444B-A5A3-0094D1CD4A41' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.PublisherID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2451F9AB-CDEC-4D1C-B9BA-99143B3E30BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.Publisher 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9980F16C-ADAA-4350-A38F-A1436A8D7BD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.YearPublished 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A106A7C-3A27-4936-9112-37D06D2CF1AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Profile',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '227A49D8-5F0A-4B2A-BCA8-53F12168A286' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.MinPlayers 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Gameplay Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BAC209AA-9200-41E6-929B-9D6B4B949D07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.MaxPlayers 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Gameplay Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '190126B3-609C-4C82-A8E1-4C43E9BADF9F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.MinPlayTimeMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Gameplay Specifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Min Play Time (Minutes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F27DA2DC-B465-4644-B77D-2891249914CE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.MaxPlayTimeMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Gameplay Specifications',
   GeneratedFormSection = 'Category',
   DisplayName = 'Max Play Time (Minutes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '66BF5B17-F982-4E1D-B604-FD48B0067907' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.Weight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Gameplay Specifications',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B16B1C2-1FE2-4C20-A272-6EE0683C743A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.OwnershipStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Collection Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30DF7E35-DBF7-4398-8697-28E63AB3B507' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.AcquiredDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Collection Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71C4799C-4D99-4D0C-95A4-8B644457323D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.PurchasePrice 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Collection Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D09DD528-B489-4D22-A0A0-B93D235E03BD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Collection Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9AA6F223-BA90-4947-A8A9-4C394AD66165' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B6667CDE-F41B-40EB-A466-D5EEEC166C8C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Games.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BDC40EBF-6F84-47ED-A8AB-FFA1291E5D19' AND AutoUpdateCategory = 1;

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'FACBEF80-C894-4A26-90DD-006EF0BF2459';

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('28757f01-b55d-48ae-91c5-ee5d354a2f0a', 'BCD81161-AE5B-4F77-B2D0-2996BD014B64', 'FieldCategoryIcons', '{"Publisher Information":"fa fa-building","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('9ea3ceb1-8503-405e-9a7b-1f9987669378', 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF', 'FieldCategoryIcons', '{"Designer Profile":"fa fa-user","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64';

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C8CBDE22-03B6-4DD0-ADC8-84B53732FEAF';

/* Set entity icon to fa fa-dice */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-dice', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '795EF2C9-078E-4FB5-A128-193247F289B5';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('aa66783c-ec06-4e39-bc9d-d8a79f586776', '795EF2C9-078E-4FB5-A128-193247F289B5', 'FieldCategoryInfo', '{"Game Profile":{"icon":"fa fa-info-circle","description":"Core identification and publisher information for the game"},"Gameplay Specifications":{"icon":"fa fa-stopwatch","description":"Technical gameplay rules regarding player counts, duration, and complexity"},"Collection Details":{"icon":"fa fa-box-open","description":"Personal collection status, acquisition dates, pricing, and user notes"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5fc71088-ee1f-4f5e-b853-d42fb46f73ea', '795EF2C9-078E-4FB5-A128-193247F289B5', 'FieldCategoryIcons', '{"Game Profile":"fa fa-info-circle","Gameplay Specifications":"fa fa-stopwatch","Collection Details":"fa fa-box-open","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '795EF2C9-078E-4FB5-A128-193247F289B5';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info Play Sessions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BCAC245-AFF1-4399-A6BD-894DA9971B2A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.GameID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Game',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B5DD6863-A9A0-4AFD-80F4-AEB4D0430A5F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.Game 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Game Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCA6B2A1-A6C2-46BA-81EF-785A026CBC7F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.PlayedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Date Played',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A075719-367B-411E-9355-44F863C6905E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.LocationName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Location',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF341E22-EDAA-4C6D-95A3-3CB480420D28' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.DurationMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Performance',
   GeneratedFormSection = 'Category',
   DisplayName = 'Duration (Minutes)',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E39B7A99-68F4-49B8-A387-D37F13F2A482' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.Outcome 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEC7549D-A9B7-4B67-8E67-32982CF51DB9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Performance',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '628EF04A-977A-4F3E-9554-92FFBCE7FE7B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0608581C-4749-4028-950E-7AC44C40C3A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Sessions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '564BB851-99FA-44DB-89A6-5BB2E1AD6E13' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-dice */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-dice', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '83D87A52-57B6-436F-8D7C-870FC00BE36B';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8fddbdbe-8898-4a44-be5e-b6663c09019f', '83D87A52-57B6-436F-8D7C-870FC00BE36B', 'FieldCategoryInfo', '{"Session Details":{"icon":"fa fa-info-circle","description":"Core information about the game, date, and location of the session"},"Session Performance":{"icon":"fa fa-chart-line","description":"Metrics and qualitative notes regarding the session outcome and duration"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info Players.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A963136A-D078-468E-BEF8-62D15EB10717' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.FirstName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BDF8594-66C9-41E6-AA62-E7F0307C0A6C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.LastName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DF52864-A6AA-413D-BC9B-3E141EA8C548' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.Nickname 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Personal Information',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '734A74BC-4A40-4409-9092-DD994EB05684' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.Email 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Contact Information',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = 'CA1DFE73-B687-41CA-8210-5535BD9915C2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.JoinedDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Membership Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98E5E570-B5B6-4C7F-91EB-7964B75B9852' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.SkillLevel 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Membership Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C902321-5D2E-4637-9A34-DFDF92C6A2A3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Membership Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B2DE279C-4E18-4367-948A-1CE908C13DE0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52EA2E3C-D223-4929-85A5-0ED5545AC7C7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Players.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E8BC9D5-B129-4A17-A3D3-3435DCFD5C17' AND AutoUpdateCategory = 1;

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('269a577a-e24b-4520-bd40-b7fc0dc7dcdc', '83D87A52-57B6-436F-8D7C-870FC00BE36B', 'FieldCategoryIcons', '{"Session Details":"fa fa-info-circle","Session Performance":"fa fa-chart-line","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '83D87A52-57B6-436F-8D7C-870FC00BE36B';

/* Set entity icon to fa fa-users */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-users', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C5F3994B-6718-4889-98EF-417AF0D93EDE';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a21d5965-f743-48d5-9fb6-c89c76b45a5c', 'C5F3994B-6718-4889-98EF-417AF0D93EDE', 'FieldCategoryInfo', '{"Personal Information":{"icon":"fa fa-user","description":"Core identity details for the player"},"Contact Information":{"icon":"fa fa-envelope","description":"Information used to contact the player"},"Membership Details":{"icon":"fa fa-id-card","description":"Details regarding the player''s status and history in the group"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('481a153e-d0aa-4716-ae34-8e8fe14cccc1', 'C5F3994B-6718-4889-98EF-417AF0D93EDE', 'FieldCategoryIcons', '{"Personal Information":"fa fa-user","Contact Information":"fa fa-envelope","Membership Details":"fa fa-id-card","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C5F3994B-6718-4889-98EF-417AF0D93EDE';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info Play Session Players.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E85A7C5C-8B18-4CEB-8BE1-357E9FED7F15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.PlaySessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Play Session',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B69DA11A-ED1B-411A-B903-BB8112ACA46C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.PlayerID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Player',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EC298A94-1EFF-417F-A110-598E07B91527' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.Score 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '52269B47-A8FC-446C-8D2B-8FCF2C8ED61C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.Placement 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '51AF5002-6D87-408C-AB43-0916997D762A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.IsWinner 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Game Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C63C4C3E-07F8-44A5-84C0-3EB279F59F73' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.FactionOrColor 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Player Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Faction or Color',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6FD63E74-E9E2-4339-ACD7-6730C574DDC3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.Notes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Player Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C6BBD8A-A9DE-4C17-A481-6B162BAADC1F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC120482-D156-4A64-906C-220C0E3DE9F3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info Play Session Players.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9741D095-6ADE-4B96-8B36-58448B69F8BE' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-users */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-users', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'E577E552-533B-47FE-9898-B14DB9E62C9E';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1201f163-bc12-470e-a02d-6b0e7dd71ccf', 'E577E552-533B-47FE-9898-B14DB9E62C9E', 'FieldCategoryInfo', '{"Relationships":{"icon":"fa fa-link","description":"Foreign key references linking players to their game sessions"},"Game Results":{"icon":"fa fa-trophy","description":"Performance metrics including scores, placement, and win status"},"Player Details":{"icon":"fa fa-user-tag","description":"Specific player configuration and session-related notes"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('e1a59645-2b0a-4a6c-b57c-319ec39c0885', 'E577E552-533B-47FE-9898-B14DB9E62C9E', 'FieldCategoryIcons', '{"Relationships":"fa fa-link","Game Results":"fa fa-trophy","Player Details":"fa fa-user-tag","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'E577E552-533B-47FE-9898-B14DB9E62C9E';

/* Index for Foreign Keys for Publisher */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: vwPublishers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Publishers
-----               SCHEMA:      BoardGameNight
-----               BASE TABLE:  Publisher
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[vwPublishers]', 'V') IS NOT NULL
    DROP VIEW [BoardGameNight].[vwPublishers];
GO

CREATE VIEW [BoardGameNight].[vwPublishers]
AS
SELECT
    p.*,    ${flyway:defaultSchema}_rgc.[Latitude] AS [${flyway:defaultSchema}_Latitude],
    ${flyway:defaultSchema}_rgc.[Longitude] AS [${flyway:defaultSchema}_Longitude]
FROM
    [BoardGameNight].[Publisher] AS p
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwRecordGeoCodes] AS ${flyway:defaultSchema}_rgc
  ON
    ${flyway:defaultSchema}_rgc.[EntityID] = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64'
    AND ${flyway:defaultSchema}_rgc.[RecordID] = CAST([p].[ID] AS NVARCHAR(450))
    AND ${flyway:defaultSchema}_rgc.[LocationType] = 'Primary'
GO
GRANT SELECT ON [BoardGameNight].[vwPublishers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: Permissions for vwPublishers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [BoardGameNight].[vwPublishers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: spCreatePublisher
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Publisher
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spCreatePublisher]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spCreatePublisher];
GO

CREATE PROCEDURE [BoardGameNight].[spCreatePublisher]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @FoundedYear_Clear bit = 0,
    @FoundedYear int = NULL,
    @Country_Clear bit = 0,
    @Country nvarchar(100) = NULL,
    @Website_Clear bit = 0,
    @Website nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [BoardGameNight].[Publisher]
            (
                [ID],
                [Name],
                [FoundedYear],
                [Country],
                [Website]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @FoundedYear_Clear = 1 THEN NULL ELSE ISNULL(@FoundedYear, NULL) END,
                CASE WHEN @Country_Clear = 1 THEN NULL ELSE ISNULL(@Country, NULL) END,
                CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [BoardGameNight].[Publisher]
            (
                [Name],
                [FoundedYear],
                [Country],
                [Website]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @FoundedYear_Clear = 1 THEN NULL ELSE ISNULL(@FoundedYear, NULL) END,
                CASE WHEN @Country_Clear = 1 THEN NULL ELSE ISNULL(@Country, NULL) END,
                CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [BoardGameNight].[vwPublishers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [BoardGameNight].[spCreatePublisher] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Publishers */

GRANT EXECUTE ON [BoardGameNight].[spCreatePublisher] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: spUpdatePublisher
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Publisher
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spUpdatePublisher]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spUpdatePublisher];
GO

CREATE PROCEDURE [BoardGameNight].[spUpdatePublisher]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @FoundedYear_Clear bit = 0,
    @FoundedYear int = NULL,
    @Country_Clear bit = 0,
    @Country nvarchar(100) = NULL,
    @Website_Clear bit = 0,
    @Website nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Publisher]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [FoundedYear] = CASE WHEN @FoundedYear_Clear = 1 THEN NULL ELSE ISNULL(@FoundedYear, [FoundedYear]) END,
        [Country] = CASE WHEN @Country_Clear = 1 THEN NULL ELSE ISNULL(@Country, [Country]) END,
        [Website] = CASE WHEN @Website_Clear = 1 THEN NULL ELSE ISNULL(@Website, [Website]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [BoardGameNight].[vwPublishers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [BoardGameNight].[vwPublishers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [BoardGameNight].[spUpdatePublisher] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Publisher table
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[trgUpdatePublisher]', 'TR') IS NOT NULL
    DROP TRIGGER [BoardGameNight].[trgUpdatePublisher];
GO
CREATE TRIGGER [BoardGameNight].trgUpdatePublisher
ON [BoardGameNight].[Publisher]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [BoardGameNight].[Publisher]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [BoardGameNight].[Publisher] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Publishers */

GRANT EXECUTE ON [BoardGameNight].[spUpdatePublisher] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Publishers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Publishers
-- Item: spDeletePublisher
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Publisher
------------------------------------------------------------
IF OBJECT_ID('[BoardGameNight].[spDeletePublisher]', 'P') IS NOT NULL
    DROP PROCEDURE [BoardGameNight].[spDeletePublisher];
GO

CREATE PROCEDURE [BoardGameNight].[spDeletePublisher]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [BoardGameNight].[Publisher]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [BoardGameNight].[spDeletePublisher] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Publishers */

GRANT EXECUTE ON [BoardGameNight].[spDeletePublisher] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4839e878-136c-4254-add7-626a52344cc3' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = '${flyway:defaultSchema}_Latitude')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4839e878-136c-4254-add7-626a52344cc3',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5947b53c-9b5f-4771-a843-072e4ec17061' OR (EntityID = 'BCD81161-AE5B-4F77-B2D0-2996BD014B64' AND Name = '${flyway:defaultSchema}_Longitude')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5947b53c-9b5f-4771-a843-072e4ec17061',
            'BCD81161-AE5B-4F77-B2D0-2996BD014B64', -- Entity: Publishers
            100016,
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
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLatitude' WHERE [Name] = '${flyway:defaultSchema}_Latitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('BCD81161-AE5B-4F77-B2D0-2996BD014B64');

/* Set ExtendedType=GeoLongitude on virtual geo fields */
UPDATE [${flyway:defaultSchema}].[EntityField] SET [ExtendedType] = 'GeoLongitude' WHERE [Name] = '${flyway:defaultSchema}_Longitude' AND [ExtendedType] IS NULL AND [EntityID] IN ('BCD81161-AE5B-4F77-B2D0-2996BD014B64');

/* Generated Validation Functions for Games */
-- CHECK constraint for Games @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MinPlayTimeMinutes] IS NULL OR [MaxPlayTimeMinutes] IS NULL OR [MaxPlayTimeMinutes]>=[MinPlayTimeMinutes])', 'public ValidateMaxPlayTimeMinutesGreaterThanOrEqualToMinPlayTimeMinutes(result: ValidationResult) {
	if (this.MinPlayTimeMinutes != null && this.MaxPlayTimeMinutes != null && this.MaxPlayTimeMinutes < this.MinPlayTimeMinutes) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxPlayTimeMinutes",
			"Maximum play time minutes must be greater than or equal to minimum play time minutes.",
			this.MaxPlayTimeMinutes,
			ValidationErrorType.Failure
		));
	}
}', 'The maximum play time must be greater than or equal to the minimum play time when both values are specified.', 'ValidateMaxPlayTimeMinutesGreaterThanOrEqualToMinPlayTimeMinutes', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '795EF2C9-078E-4FB5-A128-193247F289B5');

            -- CHECK constraint for Games @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([MinPlayers]>=(1) AND [MaxPlayers]>=[MinPlayers])', 'public ValidatePlayerCountRange(result: ValidationResult) {
	if (this.MinPlayers != null && this.MinPlayers < 1) {
		result.Errors.push(new ValidationErrorInfo(
			"MinPlayers",
			"Minimum players must be at least 1.",
			this.MinPlayers,
			ValidationErrorType.Failure
		));
	}
	if (this.MinPlayers != null && this.MaxPlayers != null && this.MaxPlayers < this.MinPlayers) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxPlayers",
			"Maximum players must be greater than or equal to the minimum players (" + this.MinPlayers + ").",
			this.MaxPlayers,
			ValidationErrorType.Failure
		));
	}
}', 'The minimum number of players must be at least 1, and the maximum number of players must be greater than or equal to the minimum number of players.', 'ValidatePlayerCountRange', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '795EF2C9-078E-4FB5-A128-193247F289B5');

/* Generated Validation Functions for Play Session Players */
-- CHECK constraint for Play Session Players: Field: Placement was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Placement] IS NULL OR [Placement]>=(1))', 'public ValidatePlacementGreaterThanOrEqualToOne(result: ValidationResult) {
	if (this.Placement != null && this.Placement < 1) {
		result.Errors.push(new ValidationErrorInfo(
			"Placement",
			"Placement must be 1 or greater.",
			this.Placement,
			ValidationErrorType.Failure
		));
	}
}', 'If a placement is specified, it must be 1 or greater. This ensures that player rankings are valid positive integers.', 'ValidatePlacementGreaterThanOrEqualToOne', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '51AF5002-6D87-408C-AB43-0916997D762A');

/* Generated Validation Functions for Play Sessions */
-- CHECK constraint for Play Sessions: Field: DurationMinutes was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DurationMinutes] IS NULL OR [DurationMinutes]>(0))', 'public ValidateDurationMinutesGreaterThanZero(result: ValidationResult) {
	if (this.DurationMinutes != null && this.DurationMinutes <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"DurationMinutes",
			"Duration in minutes must be greater than zero.",
			this.DurationMinutes,
			ValidationErrorType.Failure
		));
	}
}', 'The duration of the game in minutes must be greater than zero if it is specified.', 'ValidateDurationMinutesGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'E39B7A99-68F4-49B8-A387-D37F13F2A482');

/* Generated Validation Functions for Publishers */
-- CHECK constraint for Publishers: Field: FoundedYear was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([FoundedYear] IS NULL OR [FoundedYear]>=(1800) AND [FoundedYear]<=(2100))', 'public ValidateFoundedYearRange(result: ValidationResult) {
	if (this.FoundedYear != null && (this.FoundedYear < 1800 || this.FoundedYear > 2100)) {
		result.Errors.push(new ValidationErrorInfo(
			"FoundedYear",
			"Founded year must be between 1800 and 2100.",
			this.FoundedYear,
			ValidationErrorType.Failure
		));
	}
}', 'The year the organization was founded must be between 1800 and 2100, or left blank if unknown.', 'ValidateFoundedYearRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F23B28A6-457E-4869-B1EE-F93AA5A82EFF');

