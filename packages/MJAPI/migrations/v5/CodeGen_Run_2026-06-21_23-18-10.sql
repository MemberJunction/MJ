/* SQL generated to create new entity Contact Tags */

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
         '82616d42-a86c-4b9a-9867-46db647ca049',
         'Contact Tags',
         NULL,
         'PheedLoop Contact Tags (org-scoped). Extracted from Postman collection v3.3.0 folder "Contact Tags".',
         NULL,
         'ContactTags',
         'vwContactTags',
         'pheedloop',
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

/* SQL generated to create new application pheedloop */
INSERT INTO [${flyway:defaultSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('ffe08864-54a4-4a87-8e8e-42a63c28a9c1', 'pheedloop', 'Generated for schema', 'pheedloop', 'pheedloop', 1);

/* Adding role UI to application pheedloop */
INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('ffe08864-54a4-4a87-8e8e-42a63c28a9c1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* Adding role Developer to application pheedloop */
INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('ffe08864-54a4-4a87-8e8e-42a63c28a9c1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1);

/* Adding role Integration to application pheedloop */
INSERT INTO [${flyway:defaultSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('ffe08864-54a4-4a87-8e8e-42a63c28a9c1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* SQL generated to add new entity Contact Tags to application ID: 'ffe08864-54a4-4a87-8e8e-42a63c28a9c1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('ffe08864-54a4-4a87-8e8e-42a63c28a9c1', '82616d42-a86c-4b9a-9867-46db647ca049', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'ffe08864-54a4-4a87-8e8e-42a63c28a9c1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Contact Tags for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('82616d42-a86c-4b9a-9867-46db647ca049', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Contact Tags for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('82616d42-a86c-4b9a-9867-46db647ca049', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Contact Tags for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('82616d42-a86c-4b9a-9867-46db647ca049', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Events */

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
         '36413f26-8a74-487c-b689-a53b0a2c35bd',
         'Events',
         NULL,
         'PheedLoop Events (event-scoped). Extracted from Postman collection v3.3.0 folder "Events".',
         NULL,
         'Events',
         'vwEvents',
         'pheedloop',
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

/* SQL generated to add new entity Events to application ID: 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FFE08864-54A4-4A87-8E8E-42A63C28A9C1', '36413f26-8a74-487c-b689-a53b0a2c35bd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Events for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('36413f26-8a74-487c-b689-a53b0a2c35bd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Events for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('36413f26-8a74-487c-b689-a53b0a2c35bd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Events for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('36413f26-8a74-487c-b689-a53b0a2c35bd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Member Organizations */

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
         '0a4924a0-2323-4e43-a68a-9e4a58f21b84',
         'Member Organizations',
         NULL,
         'PheedLoop Member Organization (org-scoped). Extracted from Postman collection v3.3.0 folder "Member Organization".',
         NULL,
         'MemberOrganization',
         'vwMemberOrganizations',
         'pheedloop',
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

/* SQL generated to add new entity Member Organizations to application ID: 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FFE08864-54A4-4A87-8E8E-42A63C28A9C1', '0a4924a0-2323-4e43-a68a-9e4a58f21b84', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Member Organizations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0a4924a0-2323-4e43-a68a-9e4a58f21b84', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Member Organizations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0a4924a0-2323-4e43-a68a-9e4a58f21b84', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Member Organizations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('0a4924a0-2323-4e43-a68a-9e4a58f21b84', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Members */

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
         '4e6f3a97-ae48-4043-85d3-d41703df465a',
         'Members',
         NULL,
         'PheedLoop Members (org-scoped). Extracted from Postman collection v3.3.0 folder "Members".',
         NULL,
         'Members',
         'vwMembers',
         'pheedloop',
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

/* SQL generated to add new entity Members to application ID: 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FFE08864-54A4-4A87-8E8E-42A63C28A9C1', '4e6f3a97-ae48-4043-85d3-d41703df465a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Members for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4e6f3a97-ae48-4043-85d3-d41703df465a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Members for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4e6f3a97-ae48-4043-85d3-d41703df465a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Members for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4e6f3a97-ae48-4043-85d3-d41703df465a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Memberships */

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
         '3a56ff55-2571-41f7-98e3-96669c58fdc0',
         'Memberships',
         NULL,
         'PheedLoop Memberships (org-scoped). Extracted from Postman collection v3.3.0 folder "Memberships".',
         NULL,
         'Memberships',
         'vwMemberships',
         'pheedloop',
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

/* SQL generated to add new entity Memberships to application ID: 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FFE08864-54A4-4A87-8E8E-42A63C28A9C1', '3a56ff55-2571-41f7-98e3-96669c58fdc0', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Memberships for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3a56ff55-2571-41f7-98e3-96669c58fdc0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Memberships for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3a56ff55-2571-41f7-98e3-96669c58fdc0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Memberships for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('3a56ff55-2571-41f7-98e3-96669c58fdc0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Org Announcements */

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
         '1695d65b-5ae8-4b7a-9cd5-2fddc5e9b16b',
         'Org Announcements',
         NULL,
         'PheedLoop Org Announcements (org-scoped). Extracted from Postman collection v3.3.0 folder "Announcements".',
         NULL,
         'OrgAnnouncements',
         'vwOrgAnnouncements',
         'pheedloop',
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

/* SQL generated to add new entity Org Announcements to application ID: 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FFE08864-54A4-4A87-8E8E-42A63C28A9C1', '1695d65b-5ae8-4b7a-9cd5-2fddc5e9b16b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Org Announcements for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1695d65b-5ae8-4b7a-9cd5-2fddc5e9b16b', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Org Announcements for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1695d65b-5ae8-4b7a-9cd5-2fddc5e9b16b', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Org Announcements for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1695d65b-5ae8-4b7a-9cd5-2fddc5e9b16b', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Tickets */

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
         'd3d79b16-12e9-4c7b-868b-5fe3103280d9',
         'Tickets',
         NULL,
         'PheedLoop Tickets (org-scoped). Extracted from Postman collection v3.3.0 folder "Tickets".',
         NULL,
         'Tickets',
         'vwTickets',
         'pheedloop',
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

/* SQL generated to add new entity Tickets to application ID: 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FFE08864-54A4-4A87-8E8E-42A63C28A9C1', 'd3d79b16-12e9-4c7b-868b-5fe3103280d9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Tickets for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d3d79b16-12e9-4c7b-868b-5fe3103280d9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Tickets for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d3d79b16-12e9-4c7b-868b-5fe3103280d9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Tickets for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d3d79b16-12e9-4c7b-868b-5fe3103280d9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity Tags */

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
         '36d2140d-2a2c-4f9a-a934-f514d80e380d',
         'Tags',
         NULL,
         'PheedLoop Tags (event-scoped). Extracted from Postman collection v3.3.0 folder "Tags".',
         NULL,
         'Tags',
         'vwTags',
         'pheedloop',
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

/* SQL generated to add new entity Tags to application ID: 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FFE08864-54A4-4A87-8E8E-42A63C28A9C1', '36d2140d-2a2c-4f9a-a934-f514d80e380d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FFE08864-54A4-4A87-8E8E-42A63C28A9C1'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Tags for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('36d2140d-2a2c-4f9a-a934-f514d80e380d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Tags for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('36d2140d-2a2c-4f9a-a934-f514d80e380d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity Tags for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('36d2140d-2a2c-4f9a-a934-f514d80e380d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: RSU Audit Logs */

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
         'ca500b26-4237-4c39-8d34-9c169bd41c73',
         'MJ: RSU Audit Logs',
         'RSU Audit Logs',
         NULL,
         NULL,
         'RSUAuditLog',
         'vwRSUAuditLogs',
         '${flyway:defaultSchema}',
         1,
         1,
         1
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

/* SQL generated to add new entity MJ: RSU Audit Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ca500b26-4237-4c39-8d34-9c169bd41c73', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ca500b26-4237-4c39-8d34-9c169bd41c73', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ca500b26-4237-4c39-8d34-9c169bd41c73', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('ca500b26-4237-4c39-8d34-9c169bd41c73', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.OrgAnnouncements */
ALTER TABLE [pheedloop].[OrgAnnouncements] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.OrgAnnouncements */
UPDATE [pheedloop].[OrgAnnouncements] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.OrgAnnouncements */
ALTER TABLE [pheedloop].[OrgAnnouncements] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.OrgAnnouncements */
ALTER TABLE [pheedloop].[OrgAnnouncements] ADD CONSTRAINT [DF_pheedloop_OrgAnnouncements___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.OrgAnnouncements */
ALTER TABLE [pheedloop].[OrgAnnouncements] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.OrgAnnouncements */
UPDATE [pheedloop].[OrgAnnouncements] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.OrgAnnouncements */
ALTER TABLE [pheedloop].[OrgAnnouncements] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.OrgAnnouncements */
ALTER TABLE [pheedloop].[OrgAnnouncements] ADD CONSTRAINT [DF_pheedloop_OrgAnnouncements___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.ContactTags */
ALTER TABLE [pheedloop].[ContactTags] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.ContactTags */
UPDATE [pheedloop].[ContactTags] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.ContactTags */
ALTER TABLE [pheedloop].[ContactTags] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.ContactTags */
ALTER TABLE [pheedloop].[ContactTags] ADD CONSTRAINT [DF_pheedloop_ContactTags___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.ContactTags */
ALTER TABLE [pheedloop].[ContactTags] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.ContactTags */
UPDATE [pheedloop].[ContactTags] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.ContactTags */
ALTER TABLE [pheedloop].[ContactTags] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.ContactTags */
ALTER TABLE [pheedloop].[ContactTags] ADD CONSTRAINT [DF_pheedloop_ContactTags___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tickets */
ALTER TABLE [pheedloop].[Tickets] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tickets */
UPDATE [pheedloop].[Tickets] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tickets */
ALTER TABLE [pheedloop].[Tickets] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tickets */
ALTER TABLE [pheedloop].[Tickets] ADD CONSTRAINT [DF_pheedloop_Tickets___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tickets */
ALTER TABLE [pheedloop].[Tickets] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tickets */
UPDATE [pheedloop].[Tickets] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tickets */
ALTER TABLE [pheedloop].[Tickets] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tickets */
ALTER TABLE [pheedloop].[Tickets] ADD CONSTRAINT [DF_pheedloop_Tickets___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Memberships */
ALTER TABLE [pheedloop].[Memberships] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Memberships */
UPDATE [pheedloop].[Memberships] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Memberships */
ALTER TABLE [pheedloop].[Memberships] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Memberships */
ALTER TABLE [pheedloop].[Memberships] ADD CONSTRAINT [DF_pheedloop_Memberships___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Memberships */
ALTER TABLE [pheedloop].[Memberships] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Memberships */
UPDATE [pheedloop].[Memberships] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Memberships */
ALTER TABLE [pheedloop].[Memberships] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Memberships */
ALTER TABLE [pheedloop].[Memberships] ADD CONSTRAINT [DF_pheedloop_Memberships___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
UPDATE [${flyway:defaultSchema}].[RSUAuditLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD CONSTRAINT [DF___mj_RSUAuditLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
UPDATE [${flyway:defaultSchema}].[RSUAuditLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUAuditLog */
ALTER TABLE [${flyway:defaultSchema}].[RSUAuditLog] ADD CONSTRAINT [DF___mj_RSUAuditLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.MemberOrganization */
ALTER TABLE [pheedloop].[MemberOrganization] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.MemberOrganization */
UPDATE [pheedloop].[MemberOrganization] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.MemberOrganization */
ALTER TABLE [pheedloop].[MemberOrganization] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.MemberOrganization */
ALTER TABLE [pheedloop].[MemberOrganization] ADD CONSTRAINT [DF_pheedloop_MemberOrganization___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.MemberOrganization */
ALTER TABLE [pheedloop].[MemberOrganization] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.MemberOrganization */
UPDATE [pheedloop].[MemberOrganization] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.MemberOrganization */
ALTER TABLE [pheedloop].[MemberOrganization] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.MemberOrganization */
ALTER TABLE [pheedloop].[MemberOrganization] ADD CONSTRAINT [DF_pheedloop_MemberOrganization___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Events */
ALTER TABLE [pheedloop].[Events] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Events */
UPDATE [pheedloop].[Events] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Events */
ALTER TABLE [pheedloop].[Events] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Events */
ALTER TABLE [pheedloop].[Events] ADD CONSTRAINT [DF_pheedloop_Events___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Events */
ALTER TABLE [pheedloop].[Events] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Events */
UPDATE [pheedloop].[Events] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Events */
ALTER TABLE [pheedloop].[Events] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Events */
ALTER TABLE [pheedloop].[Events] ADD CONSTRAINT [DF_pheedloop_Events___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Members */
ALTER TABLE [pheedloop].[Members] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Members */
UPDATE [pheedloop].[Members] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Members */
ALTER TABLE [pheedloop].[Members] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Members */
ALTER TABLE [pheedloop].[Members] ADD CONSTRAINT [DF_pheedloop_Members___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Members */
ALTER TABLE [pheedloop].[Members] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Members */
UPDATE [pheedloop].[Members] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Members */
ALTER TABLE [pheedloop].[Members] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Members */
ALTER TABLE [pheedloop].[Members] ADD CONSTRAINT [DF_pheedloop_Members___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tags */
ALTER TABLE [pheedloop].[Tags] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tags */
UPDATE [pheedloop].[Tags] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tags */
ALTER TABLE [pheedloop].[Tags] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity pheedloop.Tags */
ALTER TABLE [pheedloop].[Tags] ADD CONSTRAINT [DF_pheedloop_Tags___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tags */
ALTER TABLE [pheedloop].[Tags] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tags */
UPDATE [pheedloop].[Tags] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tags */
ALTER TABLE [pheedloop].[Tags] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity pheedloop.Tags */
ALTER TABLE [pheedloop].[Tags] ADD CONSTRAINT [DF_pheedloop_Tags___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a268d15-c759-4176-afde-ec15c96d1a21' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'release_date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1a268d15-c759-4176-afde-ec15c96d1a21',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100001,
            'release_date',
            'Release Date',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '95dea43f-cf39-44ff-869a-8426a472cc6f' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'membership_tiers_targets')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '95dea43f-cf39-44ff-869a-8426a472cc6f',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100002,
            'membership_tiers_targets',
            'Membership Tiers Targets',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0db9f45c-77e5-42eb-8aa0-4dd27829416e' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'title')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0db9f45c-77e5-42eb-8aa0-4dd27829416e',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100003,
            'title',
            'title',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56ebad11-0867-4093-8f33-e47d751454b9' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '56ebad11-0867-4093-8f33-e47d751454b9',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100004,
            'description',
            'description',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd83d9d87-50f6-4cd8-9121-032f2f5d5f1e' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'is_visible_attendee')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd83d9d87-50f6-4cd8-9121-032f2f5d5f1e',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100005,
            'is_visible_attendee',
            'Is Visible Attendee',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4ca05fc-dc7f-42d4-9976-ea7ac7aeaef2' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'is_credentials_included')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c4ca05fc-dc7f-42d4-9976-ea7ac7aeaef2',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100006,
            'is_credentials_included',
            'Is Credentials Included',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0db73685-775f-4290-a3d4-558b9dfa5677' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'is_released')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0db73685-775f-4290-a3d4-558b9dfa5677',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100007,
            'is_released',
            'Is Released',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '335209f9-891f-42e1-b490-831498631fa9' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'cta_link')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '335209f9-891f-42e1-b490-831498631fa9',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100008,
            'cta_link',
            'Cta Link',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c47c5256-cd55-4e1e-ab99-5274fd0fb4f9' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'order_num')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c47c5256-cd55-4e1e-ab99-5274fd0fb4f9',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100009,
            'order_num',
            'Order Num',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f92851c-c4c8-47f7-a066-0ac315ae5bb7' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'release_time')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9f92851c-c4c8-47f7-a066-0ac315ae5bb7',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100010,
            'release_time',
            'Release Time',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '60a93f7c-42e4-4ac3-92a7-743030900613' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'recipients')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '60a93f7c-42e4-4ac3-92a7-743030900613',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100011,
            'recipients',
            'recipients',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f8dcb68-3071-4e83-ad21-e872e6ecdfb9' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3f8dcb68-3071-4e83-ad21-e872e6ecdfb9',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100012,
            'status',
            'status',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad09debf-bbd8-4620-950f-50b10caf55a2' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'organization')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad09debf-bbd8-4620-950f-50b10caf55a2',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100013,
            'organization',
            'organization',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '925ee40a-ef63-4903-96ae-dd8a4da370c8' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '925ee40a-ef63-4903-96ae-dd8a4da370c8',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100014,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b153b4eb-400a-4ea3-a925-4346482295c8' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'publish_date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b153b4eb-400a-4ea3-a925-4346482295c8',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100015,
            'publish_date',
            'Publish Date',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '14f38c7b-9a32-4825-ad3e-8878790cf958' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'is_multiple_send_enabled')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '14f38c7b-9a32-4825-ad3e-8878790cf958',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100016,
            'is_multiple_send_enabled',
            'Is Multiple Send Enabled',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '993c74f3-ebe4-4feb-8990-9914235aa936' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'is_active')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '993c74f3-ebe4-4feb-8990-9914235aa936',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100017,
            'is_active',
            'Is Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ebc678d-beac-46d9-8a0c-eab90c9d499f' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'publish_time')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7ebc678d-beac-46d9-8a0c-eab90c9d499f',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100018,
            'publish_time',
            'Publish Time',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7cd52ba-aeb9-4658-904e-3672e86dc99a' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'exclude_event_targets')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7cd52ba-aeb9-4658-904e-3672e86dc99a',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100019,
            'exclude_event_targets',
            'Exclude Event Targets',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32211a66-4506-432d-b726-ed8b44b2b326' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'cta_text')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '32211a66-4506-432d-b726-ed8b44b2b326',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100020,
            'cta_text',
            'Cta Text',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '154a9150-f3d4-4020-b2ec-762413c0c58f' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '154a9150-f3d4-4020-b2ec-762413c0c58f',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100021,
            'date',
            'date',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c105e3b5-d8b2-413a-9f54-86b5c4b4cc2f' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'is_notification_push')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c105e3b5-d8b2-413a-9f54-86b5c4b4cc2f',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100022,
            'is_notification_push',
            'Is Notification Push',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '334ca0e2-0e7f-4002-a4ea-cbe09d12d959' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'contact_groups')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '334ca0e2-0e7f-4002-a4ea-cbe09d12d959',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100023,
            'contact_groups',
            'Contact Groups',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9644b9e5-3821-4eb8-9cc8-28fb2136a926' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'event_targets')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9644b9e5-3821-4eb8-9cc8-28fb2136a926',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100024,
            'event_targets',
            'Event Targets',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a745127-e45a-4be1-a8e0-1cf2b671e974' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = 'is_notification_mail')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9a745127-e45a-4be1-a8e0-1cf2b671e974',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100025,
            'is_notification_mail',
            'Is Notification Mail',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97294a92-2a16-49a1-a0de-febd69eebfe7' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '97294a92-2a16-49a1-a0de-febd69eebfe7',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100026,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '308813a6-2c05-413c-9b41-1a38c02f79e2' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '308813a6-2c05-413c-9b41-1a38c02f79e2',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100027,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fedbd3cf-f53e-4b89-a0ae-49f90101beb3' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fedbd3cf-f53e-4b89-a0ae-49f90101beb3',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100028,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dac58dc-d3c5-4fe8-8d0e-05de302d5164' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3dac58dc-d3c5-4fe8-8d0e-05de302d5164',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100029,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '187053a2-cb1a-445c-9bc0-c585edb57b36' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '187053a2-cb1a-445c-9bc0-c585edb57b36',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100030,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd41299e-2611-4081-aad1-78b4f8417c9e' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd41299e-2611-4081-aad1-78b4f8417c9e',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100031,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b312a16-d105-4961-9427-31b7e4e8924b' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4b312a16-d105-4961-9427-31b7e4e8924b',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100032,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92a48a5d-87da-4ff3-84b6-1d73bccd4df4' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '92a48a5d-87da-4ff3-84b6-1d73bccd4df4',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100033,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7aa5c2f-fad1-483d-aac5-c0f91b9e2ebd' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7aa5c2f-fad1-483d-aac5-c0f91b9e2ebd',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100034,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b0df82f-7bfc-419b-af8a-3056437f085e' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6b0df82f-7bfc-419b-af8a-3056437f085e',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100035,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e25ea8c-75f3-4f01-958d-639a700c3cf6' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9e25ea8c-75f3-4f01-958d-639a700c3cf6',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100036,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '161c30cf-8b22-43bf-8889-46cd560bf14c' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '161c30cf-8b22-43bf-8889-46cd560bf14c',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100037,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '478f4693-13a3-4d66-8f8b-4f0440fd4a65' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '478f4693-13a3-4d66-8f8b-4f0440fd4a65',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100038,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92e4aac9-a7e0-41fd-9a6d-dcbdfbcfb975' OR (EntityID = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '92e4aac9-a7e0-41fd-9a6d-dcbdfbcfb975',
            '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B', -- Entity: Org Announcements
            100039,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e1704b9-c65f-4a8e-89d2-b3785e4c5bcf' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6e1704b9-c65f-4a8e-89d2-b3785e4c5bcf',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100001,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbdd73ac-d6c3-477d-af3d-abf59776b4e1' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = 'name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cbdd73ac-d6c3-477d-af3d-abf59776b4e1',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100002,
            'name',
            'name',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c1e0abd-0789-44af-96c9-851d0ec08610' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6c1e0abd-0789-44af-96c9-851d0ec08610',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100003,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8e9a48b8-16c7-45ab-bb9f-4b4f1c84eee6' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8e9a48b8-16c7-45ab-bb9f-4b4f1c84eee6',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100004,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6e00e5be-f3d4-4bb2-a337-1385c9d0853e' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6e00e5be-f3d4-4bb2-a337-1385c9d0853e',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100005,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81a7ed8c-0be1-4586-b5f8-434109f26727' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81a7ed8c-0be1-4586-b5f8-434109f26727',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100006,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5423088f-c73d-4181-9b75-dc7fc61fac0c' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5423088f-c73d-4181-9b75-dc7fc61fac0c',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100007,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7a6a8bc-4b2a-4e75-a8f0-6f67c611d2dc' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7a6a8bc-4b2a-4e75-a8f0-6f67c611d2dc',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '911e91a0-b937-4b4d-ae79-9267c59d2d8f' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '911e91a0-b937-4b4d-ae79-9267c59d2d8f',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '93b2496e-8488-4fef-8605-7b30da871006' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '93b2496e-8488-4fef-8605-7b30da871006',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86d3aee3-07bd-4575-8e61-d0d60e94f568' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86d3aee3-07bd-4575-8e61-d0d60e94f568',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e05fd088-0df2-4f31-b579-b92745c8a254' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e05fd088-0df2-4f31-b579-b92745c8a254',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '889026dc-67d0-4261-972f-b54dd66c0897' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '889026dc-67d0-4261-972f-b54dd66c0897',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d6f2b20-ef98-40ba-939c-db80ed67f7a3' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0d6f2b20-ef98-40ba-939c-db80ed67f7a3',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85ecadc1-729d-42d6-bb25-4bcf458eb3e0' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '85ecadc1-729d-42d6-bb25-4bcf458eb3e0',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd00e187c-f3de-494c-b205-6e5423864f20' OR (EntityID = '82616D42-A86C-4B9A-9867-46DB647CA049' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd00e187c-f3de-494c-b205-6e5423864f20',
            '82616D42-A86C-4B9A-9867-46DB647CA049', -- Entity: Contact Tags
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0996d18-34d2-4ca2-9a31-9bd7ae12ddcd' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'start_time')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0996d18-34d2-4ca2-9a31-9bd7ae12ddcd',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100001,
            'start_time',
            'Start Time',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc629f3b-1a75-4b75-820a-e92967eb3e19' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'country_whitelist')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc629f3b-1a75-4b75-820a-e92967eb3e19',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100002,
            'country_whitelist',
            'Country Whitelist',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0c2cd23-97eb-4d55-9706-db2c4865ce49' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'break_3_price')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0c2cd23-97eb-4d55-9706-db2c4865ce49',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100003,
            'break_3_price',
            'Break 3 Price',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e4b82fb-a794-4e39-8a43-ea48bbc0faa1' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_sold_in_app')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1e4b82fb-a794-4e39-8a43-ea48bbc0faa1',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100004,
            'is_sold_in_app',
            'Is Sold In App',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff3a5e67-b6ec-4ad7-8e17-367ef81d41c8' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_visible_unavailable')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ff3a5e67-b6ec-4ad7-8e17-367ef81d41c8',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100005,
            'is_visible_unavailable',
            'Is Visible Unavailable',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c9f9dc1-e17a-4339-a47b-b6a78e27afaf' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'break_1_price')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0c9f9dc1-e17a-4339-a47b-b6a78e27afaf',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100006,
            'break_1_price',
            'Break 1 Price',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5aecbf07-5c2c-4155-b10e-1e4b9a5f37a3' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'minimum_per_attendee')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5aecbf07-5c2c-4155-b10e-1e4b9a5f37a3',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100007,
            'minimum_per_attendee',
            'Minimum Per Attendee',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8756e842-c863-487c-9195-8557fbbd4411' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'contact_tags')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8756e842-c863-487c-9195-8557fbbd4411',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100008,
            'contact_tags',
            'Contact Tags',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92470796-4bf9-4510-a625-cab2629dc2a8' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'quantity_available')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '92470796-4bf9-4510-a625-cab2629dc2a8',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100009,
            'quantity_available',
            'Quantity Available',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '549e3c25-f066-40de-a39b-35778ffb2b62' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'allow_guest_purchases')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '549e3c25-f066-40de-a39b-35778ffb2b62',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100010,
            'allow_guest_purchases',
            'Allow Guest Purchases',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'deec1976-db28-4372-97f1-f7f994e635d7' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'deec1976-db28-4372-97f1-f7f994e635d7',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100011,
            'name',
            'name',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0375da27-6a8f-4e2a-83ba-e84768501029' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'limit_per_order')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0375da27-6a8f-4e2a-83ba-e84768501029',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100012,
            'limit_per_order',
            'Limit Per Order',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81eb1f75-a8ec-4e25-bb91-796188753e2f' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_active')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81eb1f75-a8ec-4e25-bb91-796188753e2f',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100013,
            'is_active',
            'Is Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cddc8f4-cbeb-46c8-b482-a43c3b7de94d' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_text_overflow_hidden')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0cddc8f4-cbeb-46c8-b482-a43c3b7de94d',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100014,
            'is_text_overflow_hidden',
            'Is Text Overflow Hidden',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16829994-2b1e-400a-8aef-97b0ff1abcf2' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_group_details_required')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '16829994-2b1e-400a-8aef-97b0ff1abcf2',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100015,
            'is_group_details_required',
            'Is Group Details Required',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0317cc9f-f242-45f0-8d96-7d6caee46d1d' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_addon')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0317cc9f-f242-45f0-8d96-7d6caee46d1d',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100016,
            'is_addon',
            'Is Addon',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '927be6de-9a51-4481-8348-76e5e82f6763' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'sessions')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '927be6de-9a51-4481-8348-76e5e82f6763',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100017,
            'sessions',
            'sessions',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8a6cccb-8488-46c8-8d6d-f826388951bc' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'event_code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8a6cccb-8488-46c8-8d6d-f826388951bc',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100018,
            'event_code',
            'Event Code',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fca7b793-30cb-475e-97c7-ce397ab63780' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_protected')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fca7b793-30cb-475e-97c7-ce397ab63780',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100019,
            'is_protected',
            'Is Protected',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20bdcadc-d841-4b3d-a09f-e9a1fbfa49ae' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_sold_in_site')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '20bdcadc-d841-4b3d-a09f-e9a1fbfa49ae',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100020,
            'is_sold_in_site',
            'Is Sold In Site',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a6f3224-bda7-4863-a44c-9c60050331d2' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_waitlist_notification_enabled')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a6f3224-bda7-4863-a44c-9c60050331d2',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100021,
            'is_waitlist_notification_enabled',
            'Is Waitlist Notification Enabled',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '72a71f30-4c17-4f3e-ad8e-b371b3c12b05' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'start_date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '72a71f30-4c17-4f3e-ad8e-b371b3c12b05',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100022,
            'start_date',
            'Start Date',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4a646f9-f9b9-4872-9a8b-c16b5ecc557c' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'end_date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f4a646f9-f9b9-4872-9a8b-c16b5ecc557c',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100023,
            'end_date',
            'End Date',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85bb56ae-74d0-4822-984f-494e41be765f' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'contact_tags_exclusions')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '85bb56ae-74d0-4822-984f-494e41be765f',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100024,
            'contact_tags_exclusions',
            'Contact Tags Exclusions',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22a263b6-a65c-4613-91f0-326bc06d2e60' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'limit_per_attendee')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '22a263b6-a65c-4613-91f0-326bc06d2e60',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100025,
            'limit_per_attendee',
            'Limit Per Attendee',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25058236-3459-45b8-a85c-760981691db2' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'minimum_per_order')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '25058236-3459-45b8-a85c-760981691db2',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100026,
            'minimum_per_order',
            'Minimum Per Order',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59a2f280-e2f8-46f9-aeea-c43811186e6f' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'break_2_quantity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '59a2f280-e2f8-46f9-aeea-c43811186e6f',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100027,
            'break_2_quantity',
            'Break 2 Quantity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a75bb03-bba0-419e-8f74-9175e3b6060a' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'break_3_quantity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a75bb03-bba0-419e-8f74-9175e3b6060a',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100028,
            'break_3_quantity',
            'Break 3 Quantity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1adbc5f9-fef2-4e69-8397-0180ad2b7e67' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'categories_sub')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1adbc5f9-fef2-4e69-8397-0180ad2b7e67',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100029,
            'categories_sub',
            'Categories Sub',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'efe0b24f-45dd-4299-8c27-520f9c291762' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'enforce_unique_purchase')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'efe0b24f-45dd-4299-8c27-520f9c291762',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100030,
            'enforce_unique_purchase',
            'Enforce Unique Purchase',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aede159d-39d6-4d09-a2f2-7e6b113af0c9' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'tags')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aede159d-39d6-4d09-a2f2-7e6b113af0c9',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100031,
            'tags',
            'tags',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74d25558-43aa-4394-a883-0c08389298e2' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'country_blacklist')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74d25558-43aa-4394-a883-0c08389298e2',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100032,
            'country_blacklist',
            'Country Blacklist',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f6f550f1-6077-4123-99e5-80ee2506ccd6' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'break_1_quantity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f6f550f1-6077-4123-99e5-80ee2506ccd6',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100033,
            'break_1_quantity',
            'Break 1 Quantity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9613071a-e148-4a2d-adf7-c668185f4674' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9613071a-e148-4a2d-adf7-c668185f4674',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100034,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4906e1f5-367f-44ef-99c4-a59d08dc30a2' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_waitlist_enabled')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4906e1f5-367f-44ef-99c4-a59d08dc30a2',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100035,
            'is_waitlist_enabled',
            'Is Waitlist Enabled',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b25ea8b0-2f75-4b59-a5dd-04872a507184' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'custom_fields')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b25ea8b0-2f75-4b59-a5dd-04872a507184',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100036,
            'custom_fields',
            'Custom Fields',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40f3cb45-c203-486a-a633-8bc128210c9c' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'registration_categories')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '40f3cb45-c203-486a-a633-8bc128210c9c',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100037,
            'registration_categories',
            'Registration Categories',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c51ab5d-b2c8-47bb-a36c-98ffdd19eaa4' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_member_only')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6c51ab5d-b2c8-47bb-a36c-98ffdd19eaa4',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100038,
            'is_member_only',
            'Is Member Only',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20b8ef72-4553-4aac-8a79-fb88420ad68d' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_virtual')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '20b8ef72-4553-4aac-8a79-fb88420ad68d',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100039,
            'is_virtual',
            'Is Virtual',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a4d3fdc-6517-4dc7-bbe4-e88711569b4b' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_disabled_email_confirmation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a4d3fdc-6517-4dc7-bbe4-e88711569b4b',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100040,
            'is_disabled_email_confirmation',
            'Is Disabled Email Confirmation',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c338ca84-988d-4e33-939b-b561ba427753' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'price')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c338ca84-988d-4e33-939b-b561ba427753',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100041,
            'price',
            'price',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3937444c-b280-432d-83c0-2b4f0606232e' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3937444c-b280-432d-83c0-2b4f0606232e',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100042,
            'description',
            'description',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b48cbac9-871c-431a-a170-596106f8cf1e' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'end_time')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b48cbac9-871c-431a-a170-596106f8cf1e',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100043,
            'end_time',
            'End Time',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2888a9ea-144d-4b52-8abd-cd5a23ffbdfc' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'show_as_sold_out')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2888a9ea-144d-4b52-8abd-cd5a23ffbdfc',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100044,
            'show_as_sold_out',
            'Show As Sold Out',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2df33b5d-e53e-482b-9f57-f6e52bd899a0' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'break_2_price')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2df33b5d-e53e-482b-9f57-f6e52bd899a0',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100045,
            'break_2_price',
            'Break 2 Price',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6d40c9b-5d71-4a7c-b51a-393524dfbd5c' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'is_private')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6d40c9b-5d71-4a7c-b51a-393524dfbd5c',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100046,
            'is_private',
            'Is Private',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6bd66a9f-23c0-4a68-8bbb-8b297eb9d14a' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = 'enable_pdf_qr_code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6bd66a9f-23c0-4a68-8bbb-8b297eb9d14a',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100047,
            'enable_pdf_qr_code',
            'Enable Pdf Qr Code',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae2cddbd-987f-4d33-b6ca-d14720ef270b' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae2cddbd-987f-4d33-b6ca-d14720ef270b',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100048,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ecb940fe-c73a-4be1-9a6c-b6df15c4b63a' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ecb940fe-c73a-4be1-9a6c-b6df15c4b63a',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100049,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80a4b36d-dcf0-4dd8-901c-5570c2430e0b' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '80a4b36d-dcf0-4dd8-901c-5570c2430e0b',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100050,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8ffb30f-462d-4f72-b7ab-d93364086571' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8ffb30f-462d-4f72-b7ab-d93364086571',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100051,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '960fe207-b3c8-48cc-8a4e-ff8a9ae847f1' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '960fe207-b3c8-48cc-8a4e-ff8a9ae847f1',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100052,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68dc84db-ded5-464a-9f21-149fa1631ebb' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68dc84db-ded5-464a-9f21-149fa1631ebb',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100053,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b290b9c3-cef0-4202-a761-6783c6d32e61' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b290b9c3-cef0-4202-a761-6783c6d32e61',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100054,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f045cd1-6903-436e-a5e3-1f07b09a4a54' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2f045cd1-6903-436e-a5e3-1f07b09a4a54',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100055,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7a09f5e-a0d2-4aac-b126-d809499029ba' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e7a09f5e-a0d2-4aac-b126-d809499029ba',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100056,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '175ca258-438b-4a08-b95a-213fceade9ac' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '175ca258-438b-4a08-b95a-213fceade9ac',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100057,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a727d42-7993-481a-9164-f6c028c9d882' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a727d42-7993-481a-9164-f6c028c9d882',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100058,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '292cba64-e21a-469a-9dad-e22b6d76332d' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '292cba64-e21a-469a-9dad-e22b6d76332d',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100059,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cea2747e-e417-4189-85fe-7d5f1d2dfba5' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cea2747e-e417-4189-85fe-7d5f1d2dfba5',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100060,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98b25c32-28df-4fb2-a37b-30a716f3c1f9' OR (EntityID = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '98b25c32-28df-4fb2-a37b-30a716f3c1f9',
            'D3D79B16-12E9-4C7B-868B-5FE3103280D9', -- Entity: Tickets
            100061,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7049f16-edd7-4975-b984-2403be964af3' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'email')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b7049f16-edd7-4975-b984-2403be964af3',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100001,
            'email',
            'email',
            'Email of the member being assigned this membership. Source: Postman Create Membership request body.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5769996d-70ac-459b-93a5-00b28e04ae0e' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'send_confirmation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5769996d-70ac-459b-93a5-00b28e04ae0e',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100002,
            'send_confirmation',
            'Send Confirmation',
            'When true, sends a confirmation email on membership creation. Source: Postman Create Membership request body.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5ef50983-61e6-4a8b-90e3-795ddf6fac47' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'title')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5ef50983-61e6-4a8b-90e3-795ddf6fac47',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100003,
            'title',
            'title',
            'Job title of the member being assigned this membership. Source: Postman Create Membership request body.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9225baf0-027f-49d4-a676-401cadf93267' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'last_name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9225baf0-027f-49d4-a676-401cadf93267',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100004,
            'last_name',
            'Last Name',
            'Last name of the member being assigned this membership. Source: Postman Create Membership request body.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34ed107e-1d30-4661-98e1-d95c359e0bac' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'is_active')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '34ed107e-1d30-4661-98e1-d95c359e0bac',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100005,
            'is_active',
            'Is Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e0e9afc-33e0-430f-bea1-32dbe33e2bdd' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'date_expiry')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2e0e9afc-33e0-430f-bea1-32dbe33e2bdd',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100006,
            'date_expiry',
            'Date Expiry',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e20d8f3e-9c30-49ea-ad9c-a3f1fa97e7cc' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'membership_tier')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e20d8f3e-9c30-49ea-ad9c-a3f1fa97e7cc',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100007,
            'membership_tier',
            'Membership Tier',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '644eed1b-4717-4ec6-b82c-0cfb1c54faf0' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'membership_name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '644eed1b-4717-4ec6-b82c-0cfb1c54faf0',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100008,
            'membership_name',
            'Membership Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f12b32e3-4cba-4f65-8ea0-70acb7c2eda0' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'first_name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f12b32e3-4cba-4f65-8ea0-70acb7c2eda0',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100009,
            'first_name',
            'First Name',
            'First name of the member being assigned this membership. Source: Postman Create Membership request body.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c202d413-40be-4970-868e-6336bbabb002' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'membership_order')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c202d413-40be-4970-868e-6336bbabb002',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100010,
            'membership_order',
            'Membership Order',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8974161f-9e03-4d95-a9c1-1ca619deeae9' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'organization')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8974161f-9e03-4d95-a9c1-1ca619deeae9',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100011,
            'organization',
            'organization',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c71d76c6-61c8-4cd3-8257-2fe445fb530d' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'message')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c71d76c6-61c8-4cd3-8257-2fe445fb530d',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100012,
            'message',
            'message',
            'Response-only field.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c96bcde-41d2-43d9-9392-991a74171abd' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'is_approved')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8c96bcde-41d2-43d9-9392-991a74171abd',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100013,
            'is_approved',
            'Is Approved',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4632fc44-1343-48f6-83bf-e9385c118343' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'attendee')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4632fc44-1343-48f6-83bf-e9385c118343',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100014,
            'attendee',
            'attendee',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d74cd3f-b63b-415c-94af-86d57b0dabd7' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'date_start')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7d74cd3f-b63b-415c-94af-86d57b0dabd7',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100015,
            'date_start',
            'Date Start',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '486a9959-2d3c-4e0b-be6a-3b0da88ca652' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'attendee_organization')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '486a9959-2d3c-4e0b-be6a-3b0da88ca652',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100016,
            'attendee_organization',
            'Attendee Organization',
            'Organization code to associate with this membership. Present in Create Membership request body. Source: Postman Create Membership request body.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '562b9352-5a91-48f2-ae8a-169b3d8f3679' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '562b9352-5a91-48f2-ae8a-169b3d8f3679',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100017,
            'notes',
            'notes',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b3d5350-3414-4ec9-9868-1b3007393095' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6b3d5350-3414-4ec9-9868-1b3007393095',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100018,
            'status',
            'status',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ea2afc8-7e55-409f-aa30-1545c252fa5c' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6ea2afc8-7e55-409f-aa30-1545c252fa5c',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100019,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb988e38-e44f-404f-b715-095ac77225d9' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'unassigned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb988e38-e44f-404f-b715-095ac77225d9',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100020,
            'unassigned',
            'unassigned',
            'When true, creates an unassigned membership that can be assigned to a member later. Critical create-time control flag. Source: Postman Create Membership request body + description.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ddddf830-f36b-43d4-884f-22d002b19560' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = 'additional_information')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ddddf830-f36b-43d4-884f-22d002b19560',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100021,
            'additional_information',
            'Additional Information',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86377125-7c9d-4adf-8489-8414f205d332' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86377125-7c9d-4adf-8489-8414f205d332',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100022,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d90c21c-327d-47b0-85ee-4cf77b6fe8fa' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d90c21c-327d-47b0-85ee-4cf77b6fe8fa',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100023,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dbbe1a40-f8e6-4237-a0ef-53ba3eb3896b' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dbbe1a40-f8e6-4237-a0ef-53ba3eb3896b',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100024,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9184272b-94c0-4246-b2a2-8ddbfe468d40' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9184272b-94c0-4246-b2a2-8ddbfe468d40',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100025,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45902da3-7d06-45c3-928b-5509a2c0566a' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '45902da3-7d06-45c3-928b-5509a2c0566a',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100026,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4500a55-1428-4b85-a43f-e406ad722bec' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd4500a55-1428-4b85-a43f-e406ad722bec',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100027,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f28a5493-2351-4c8e-bf21-ca5741d245ff' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f28a5493-2351-4c8e-bf21-ca5741d245ff',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100028,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26f64aa9-84a0-421d-9e8b-c1065391ddf7' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26f64aa9-84a0-421d-9e8b-c1065391ddf7',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100029,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b216a53d-8235-4a6c-be82-c803c7ad8699' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b216a53d-8235-4a6c-be82-c803c7ad8699',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100030,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18bc9835-c175-4522-9040-66d2c25ae171' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '18bc9835-c175-4522-9040-66d2c25ae171',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100031,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81b0e967-d37a-4a61-9da3-b9619ae8d64f' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81b0e967-d37a-4a61-9da3-b9619ae8d64f',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100032,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e85541e-4eca-413e-8094-4f1ef50f2377' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3e85541e-4eca-413e-8094-4f1ef50f2377',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100033,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d1c02e9-e301-405e-8c5b-042157f0ac51' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d1c02e9-e301-405e-8c5b-042157f0ac51',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100034,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b20347c2-1de7-41fd-9629-b5528fbaa163' OR (EntityID = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b20347c2-1de7-41fd-9629-b5528fbaa163',
            '3A56FF55-2571-41F7-98E3-96669C58FDC0', -- Entity: Memberships
            100035,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eecc1d3d-a4bc-4cca-a9b0-05f45e65e268' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eecc1d3d-a4bc-4cca-a9b0-05f45e65e268',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            NULL,
            1,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c70b3bf2-fccc-40b6-8cc9-02f1f5ec7d11' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c70b3bf2-fccc-40b6-8cc9-02f1f5ec7d11',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100002,
            'Description',
            'Description',
            NULL,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '56c5df2f-54b7-4a0a-9b51-d46634f137b4' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'AffectedTables')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '56c5df2f-54b7-4a0a-9b51-d46634f137b4',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100003,
            'AffectedTables',
            'Affected Tables',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbd931d0-32c9-45f5-87a7-9236c14dcfd5' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'Success')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cbd931d0-32c9-45f5-87a7-9236c14dcfd5',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100004,
            'Success',
            'Success',
            NULL,
            'bit',
            1,
            1,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1c16bf4-29ca-494f-9c51-131a21350740' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'APIRestarted')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd1c16bf4-29ca-494f-9c51-131a21350740',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100005,
            'APIRestarted',
            'API Restarted',
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
            0,
            NULL,
            NULL,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06ddc3c0-3f1b-4113-83d6-38d28637805c' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'GitCommitSuccess')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '06ddc3c0-3f1b-4113-83d6-38d28637805c',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100006,
            'GitCommitSuccess',
            'Git Commit Success',
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
            0,
            NULL,
            NULL,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81120d87-e965-4b7d-b560-fc93caebac2b' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'BranchName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81120d87-e965-4b7d-b560-fc93caebac2b',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100007,
            'BranchName',
            'Branch Name',
            NULL,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22bb6d43-9c6f-42d8-9d6a-d522a1656f8a' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'MigrationFilePath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '22bb6d43-9c6f-42d8-9d6a-d522a1656f8a',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100008,
            'MigrationFilePath',
            'Migration File Path',
            NULL,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b96d2d4-3c1e-4a26-b71d-2ea77b526dc7' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6b96d2d4-3c1e-4a26-b71d-2ea77b526dc7',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100009,
            'ErrorMessage',
            'Error Message',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30b363a8-7685-483b-907e-e50159d8fab6' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'ErrorStep')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '30b363a8-7685-483b-907e-e50159d8fab6',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100010,
            'ErrorStep',
            'Error Step',
            NULL,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ea75153-70ac-4bc8-ac5e-06ac8003ce47' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'StepsJSON')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0ea75153-70ac-4bc8-ac5e-06ac8003ce47',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100011,
            'StepsJSON',
            'Steps JSON',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3446d474-640c-444d-b6ba-217fa63ee37d' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'TotalDurationMs')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3446d474-640c-444d-b6ba-217fa63ee37d',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100012,
            'TotalDurationMs',
            'Total Duration Ms',
            NULL,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '719073cf-6aba-4acd-8994-5c41992073a0' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = 'RunAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '719073cf-6aba-4acd-8994-5c41992073a0',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
            100013,
            'RunAt',
            'Run At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d120d20-406b-4e98-a3c6-523cc186cc9a' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9d120d20-406b-4e98-a3c6-523cc186cc9a',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
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
            0,
            NULL,
            NULL,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b7b4c62c-d01f-4089-a125-fdb34ecae400' OR (EntityID = 'CA500B26-4237-4C39-8D34-9C169BD41C73' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b7b4c62c-d01f-4089-a125-fdb34ecae400',
            'CA500B26-4237-4C39-8D34-9C169BD41C73', -- Entity: MJ: RSU Audit Logs
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
            0,
            NULL,
            NULL,
            0,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c5b3ca3-4c34-42c0-9e96-904da88c1077' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'payment_code_prefix')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6c5b3ca3-4c34-42c0-9e96-904da88c1077',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100001,
            'payment_code_prefix',
            'Payment Code Prefix',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '516446c5-8019-43e5-b428-141b7e225ebc' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'address_city')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '516446c5-8019-43e5-b428-141b7e225ebc',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100002,
            'address_city',
            'Address City',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a644dd3a-0b2b-443a-a40d-b87c8af79baa' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'website')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a644dd3a-0b2b-443a-a40d-b87c8af79baa',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100003,
            'website',
            'website',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4b1d2bc-5f5d-457c-9407-6b4a9a0d009e' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'notes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a4b1d2bc-5f5d-457c-9407-6b4a9a0d009e',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100004,
            'notes',
            'notes',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6704c46c-e992-409f-8158-53b07e3eba01' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'managers')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6704c46c-e992-409f-8158-53b07e3eba01',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100005,
            'managers',
            'managers',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '79fc51d9-378d-4c44-af25-dfa71a6ad65d' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'address_line_2')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '79fc51d9-378d-4c44-af25-dfa71a6ad65d',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100006,
            'address_line_2',
            'Address Line 2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5e24988-6f44-44fd-8b5e-11c59892dce2' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'tax')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a5e24988-6f44-44fd-8b5e-11c59892dce2',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100007,
            'tax',
            'tax',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9550d76a-07cc-45dd-970f-df75ea9f47ec' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'address_state')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9550d76a-07cc-45dd-970f-df75ea9f47ec',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100008,
            'address_state',
            'Address State',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '815fafaf-ca6f-4817-acd2-3889d44d4501' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'address_line_1')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '815fafaf-ca6f-4817-acd2-3889d44d4501',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100009,
            'address_line_1',
            'Address Line 1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5ee04946-8c10-4f38-a473-0fca75ef3f94' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'address_zip')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5ee04946-8c10-4f38-a473-0fca75ef3f94',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100010,
            'address_zip',
            'Address Zip',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a46ce6a6-0860-4308-bfc7-6e9efdf6c635' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a46ce6a6-0860-4308-bfc7-6e9efdf6c635',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100011,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '286be228-5988-4a67-a497-9f6e12e761d4' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'internal_code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '286be228-5988-4a67-a497-9f6e12e761d4',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100012,
            'internal_code',
            'Internal Code',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b285ef1-fa33-48dc-a114-32104b6f0d8b' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'extra')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b285ef1-fa33-48dc-a114-32104b6f0d8b',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100013,
            'extra',
            'extra',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be015de1-11ad-443f-a178-1a7acb63b405' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'address_country')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be015de1-11ad-443f-a178-1a7acb63b405',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100014,
            'address_country',
            'Address Country',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18298468-c13b-4444-abcd-8ae7019f52be' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'id')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '18298468-c13b-4444-abcd-8ae7019f52be',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd402ea73-ba3f-47cd-b413-66f5030585ac' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd402ea73-ba3f-47cd-b413-66f5030585ac',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100016,
            'name',
            'name',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e5a7349e-2246-421f-a5b2-b5bdb3fffab7' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = 'address_phone_work')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e5a7349e-2246-421f-a5b2-b5bdb3fffab7',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100017,
            'address_phone_work',
            'Address Phone Work',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '97ab1dac-ed1a-4ed6-b4d2-758c7e7316c0' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '97ab1dac-ed1a-4ed6-b4d2-758c7e7316c0',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb7f852a-7c20-41eb-bf78-91614674ccc0' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb7f852a-7c20-41eb-bf78-91614674ccc0',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100019,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1bd50a4-29c2-4164-b85a-50d44d6ad019' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd1bd50a4-29c2-4164-b85a-50d44d6ad019',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100020,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f045b23-e5fc-44b2-92d9-a12d64ee4c6d' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f045b23-e5fc-44b2-92d9-a12d64ee4c6d',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100021,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '584c3ef4-75d7-45cc-ad94-310dcda6ee7e' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '584c3ef4-75d7-45cc-ad94-310dcda6ee7e',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100022,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e1e672a9-0f82-4f5e-ab96-2f5e09d60a4b' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e1e672a9-0f82-4f5e-ab96-2f5e09d60a4b',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100023,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e59d277-04a4-45b1-9a1e-3010076374ae' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9e59d277-04a4-45b1-9a1e-3010076374ae',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100024,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dda89aa-8f19-42c9-8ee6-2e48e757644f' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1dda89aa-8f19-42c9-8ee6-2e48e757644f',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100025,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad4aa8da-69cc-443b-b81d-622daab0352d' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad4aa8da-69cc-443b-b81d-622daab0352d',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100026,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53f2fe6b-d151-4502-ac11-f468f7e41dcb' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '53f2fe6b-d151-4502-ac11-f468f7e41dcb',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100027,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b73b644c-73cc-4d43-8874-f8264e4e5fcd' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b73b644c-73cc-4d43-8874-f8264e4e5fcd',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100028,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fa9d90ba-c20c-4faa-bfee-4b4fa601518b' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fa9d90ba-c20c-4faa-bfee-4b4fa601518b',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100029,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca4a8c7e-3a50-4468-890b-cb625261e8bd' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca4a8c7e-3a50-4468-890b-cb625261e8bd',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100030,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '31edd5e9-6f22-420f-941e-3e035fae3f08' OR (EntityID = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '31edd5e9-6f22-420f-941e-3e035fae3f08',
            '0A4924A0-2323-4E43-A68A-9E4A58F21B84', -- Entity: Member Organizations
            100031,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '414bab6a-5d45-4116-ac3b-f824a17a4858' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'learning_objectives')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '414bab6a-5d45-4116-ac3b-f824a17a4858',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100001,
            'learning_objectives',
            'Learning Objectives',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f866035c-87f7-4e10-8bd5-3e42e59dbfc5' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'time_end')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f866035c-87f7-4e10-8bd5-3e42e59dbfc5',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100002,
            'time_end',
            'Time End',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b124bc0-dde1-4b83-b380-32999bea9ce5' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'custom_fields')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b124bc0-dde1-4b83-b380-32999bea9ce5',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100003,
            'custom_fields',
            'Custom Fields',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be234392-f1d0-4894-a04a-798b99e6b06f' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'attendee_registration_capacity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be234392-f1d0-4894-a04a-798b99e6b06f',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100004,
            'attendee_registration_capacity',
            'Attendee Registration Capacity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2a59477-bd6d-4537-8a14-fae76a3f7818' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'total_user_credits')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b2a59477-bd6d-4537-8a14-fae76a3f7818',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100005,
            'total_user_credits',
            'Total User Credits',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92b5bd82-c163-4da8-851a-a6aa8bf531e1' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'location')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '92b5bd82-c163-4da8-851a-a6aa8bf531e1',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100006,
            'location',
            'location',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '55f83013-1501-4043-a8cc-c5f9e1eed747' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'topics')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '55f83013-1501-4043-a8cc-c5f9e1eed747',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100007,
            'topics',
            'topics',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f81a67a7-9a3c-463c-b0ae-a295174c88e6' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'id')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f81a67a7-9a3c-463c-b0ae-a295174c88e6',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2d5ec93-24c5-47bc-ba9c-4e0105109a63' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2d5ec93-24c5-47bc-ba9c-4e0105109a63',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100009,
            'date',
            'date',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4da6e0ff-d6a9-4a5b-829e-c5347a9e3622' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'remaining_user_credits')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4da6e0ff-d6a9-4a5b-829e-c5347a9e3622',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100010,
            'remaining_user_credits',
            'Remaining User Credits',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4fcf131-b1c5-4423-9a5b-3f28b43caf68' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'end_date')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a4fcf131-b1c5-4423-9a5b-3f28b43caf68',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100011,
            'end_date',
            'End Date',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4c5b10c-024b-4db4-b2ba-1c78b2b12775' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'time_start')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f4c5b10c-024b-4db4-b2ba-1c78b2b12775',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100012,
            'time_start',
            'Time Start',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81e2ffab-97dc-43d2-b651-1f737b1b71d0' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'virtual_enabled')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81e2ffab-97dc-43d2-b651-1f737b1b71d0',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100013,
            'virtual_enabled',
            'Virtual Enabled',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf576707-51b3-409c-b8cc-b6db7787ef81' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'event_name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf576707-51b3-409c-b8cc-b6db7787ef81',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100014,
            'event_name',
            'Event Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5581bf07-bf05-41fa-abd1-1d1dd2fd799c' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'user')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5581bf07-bf05-41fa-abd1-1d1dd2fd799c',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100015,
            'user',
            'user',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1522d5bb-81f5-4d58-8402-0220ea6dfc5f' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'timezone')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1522d5bb-81f5-4d58-8402-0220ea6dfc5f',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100016,
            'timezone',
            'timezone',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea2649b4-f47b-49b2-b537-d374d933a7f0' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'total_registration_count')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ea2649b4-f47b-49b2-b537-d374d933a7f0',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100017,
            'total_registration_count',
            'Total Registration Count',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4efee55c-6271-4dd6-b58f-6503a68d8947' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4efee55c-6271-4dd6-b58f-6503a68d8947',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100018,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e0b02ca-778b-4c81-877e-747d99e1e5dc' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'credit_value')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3e0b02ca-778b-4c81-877e-747d99e1e5dc',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100019,
            'credit_value',
            'Credit Value',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea925bbb-a290-42ad-962c-21d2c51223c0' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'is_listed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ea925bbb-a290-42ad-962c-21d2c51223c0',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100020,
            'is_listed',
            'Is Listed',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e979a012-1cc5-438a-a7f3-4cad82e9b00a' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e979a012-1cc5-438a-a7f3-4cad82e9b00a',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100021,
            'description',
            'description',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '30a8bc10-8eb7-4702-9e8a-1dda87963b6f' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = 'formats')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '30a8bc10-8eb7-4702-9e8a-1dda87963b6f',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100022,
            'formats',
            'formats',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7a09085-d3bf-43b1-beba-dd96daf92e32' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd7a09085-d3bf-43b1-beba-dd96daf92e32',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100023,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a3de3c3-4992-4b53-a594-7c34a20bd9dd' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9a3de3c3-4992-4b53-a594-7c34a20bd9dd',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100024,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6dd9f58f-cc03-45b8-9e12-507c4bcd41e9' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6dd9f58f-cc03-45b8-9e12-507c4bcd41e9',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100025,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0dc1564d-c559-4d07-aeb5-41abc4375518' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0dc1564d-c559-4d07-aeb5-41abc4375518',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100026,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a3a13d6-d6f5-480b-b703-8922d4ca4958' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2a3a13d6-d6f5-480b-b703-8922d4ca4958',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100027,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd75eea6a-019c-4623-af27-12f153fbe4f3' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd75eea6a-019c-4623-af27-12f153fbe4f3',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100028,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b50645fa-26ae-4e68-813d-d8bc70796c9a' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b50645fa-26ae-4e68-813d-d8bc70796c9a',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100029,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03225188-5865-42a1-8e3e-ac9a258c4dfe' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03225188-5865-42a1-8e3e-ac9a258c4dfe',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100030,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b3e10f6b-087a-455c-853f-8491af540261' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b3e10f6b-087a-455c-853f-8491af540261',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100031,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb4b8afa-0494-40be-b950-3770511c7665' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cb4b8afa-0494-40be-b950-3770511c7665',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100032,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2ce8c2a5-b10d-4086-8cff-3ca26008613f' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2ce8c2a5-b10d-4086-8cff-3ca26008613f',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100033,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e8a40c48-6b5f-4332-a659-d5c7122bf5f9' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e8a40c48-6b5f-4332-a659-d5c7122bf5f9',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100034,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '486f5d13-ff5d-44cc-8f30-f9cf53ebaaf5' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '486f5d13-ff5d-44cc-8f30-f9cf53ebaaf5',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100035,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '59fe5b7b-0a03-42ad-be7c-066c323062f0' OR (EntityID = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '59fe5b7b-0a03-42ad-be7c-066c323062f0',
            '36413F26-8A74-487C-B689-A53B0A2C35BD', -- Entity: Events
            100036,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c42657d-ef3b-474a-8c2f-36916c7ec60d' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'address_line_2')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4c42657d-ef3b-474a-8c2f-36916c7ec60d',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100001,
            'address_line_2',
            'Address Line 2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '519d72c0-1c1a-4e51-892c-bdf828aa0d58' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'contact_groups')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '519d72c0-1c1a-4e51-892c-bdf828aa0d58',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100002,
            'contact_groups',
            'Contact Groups',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77b31818-2323-46d9-9aa4-a181d4b34c35' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'address_phone')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '77b31818-2323-46d9-9aa4-a181d4b34c35',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100003,
            'address_phone',
            'Address Phone',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0640b9a-e510-4401-b702-8aae4a921b38' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'metadata')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0640b9a-e510-4401-b702-8aae4a921b38',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100004,
            'metadata',
            'metadata',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a801ef6a-f428-4ed4-bbf0-d2a068575e44' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'events_attended')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a801ef6a-f428-4ed4-bbf0-d2a068575e44',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100005,
            'events_attended',
            'Events Attended',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd5558b2-71b4-4819-b864-bf66aa763d84' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'designations')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd5558b2-71b4-4819-b864-bf66aa763d84',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100006,
            'designations',
            'designations',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6dc75e4c-0b64-469e-be99-8814bacc534d' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'title')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6dc75e4c-0b64-469e-be99-8814bacc534d',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100007,
            'title',
            'title',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a51ad87-00fe-45f6-9c92-d3a161a3f847' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'linkedin')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a51ad87-00fe-45f6-9c92-d3a161a3f847',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100008,
            'linkedin',
            'linkedin',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '161f5a99-7148-4c97-baa0-ec5431f9e1e2' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'last_name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '161f5a99-7148-4c97-baa0-ec5431f9e1e2',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100009,
            'last_name',
            'Last Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '069f67aa-2970-4110-ade3-77644bac729f' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'address_city')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '069f67aa-2970-4110-ade3-77644bac729f',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100010,
            'address_city',
            'Address City',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fb690e0-d195-4a9b-a911-b3b8ae26559b' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'about')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9fb690e0-d195-4a9b-a911-b3b8ae26559b',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100011,
            'about',
            'about',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b039e7bb-e47d-40e2-9b54-aa90c81a5d7f' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b039e7bb-e47d-40e2-9b54-aa90c81a5d7f',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100012,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '43085f0c-55eb-497f-bfe3-66f56d8015dc' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'organization')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '43085f0c-55eb-497f-bfe3-66f56d8015dc',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100013,
            'organization',
            'organization',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd6334e29-60e7-4a93-acdb-ee89e27be457' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'first_name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd6334e29-60e7-4a93-acdb-ee89e27be457',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100014,
            'first_name',
            'First Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '92ec463d-7467-42d5-9fcd-51a237c674a4' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'membership_tier')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '92ec463d-7467-42d5-9fcd-51a237c674a4',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100015,
            'membership_tier',
            'Membership Tier',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9303dec5-0394-427b-8858-73b7ffc80ecf' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'accessibility_requirements')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9303dec5-0394-427b-8858-73b7ffc80ecf',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100016,
            'accessibility_requirements',
            'Accessibility Requirements',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df5fcee5-bd25-48ef-a371-c5f1b0df044c' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'address_line_1')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'df5fcee5-bd25-48ef-a371-c5f1b0df044c',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100017,
            'address_line_1',
            'Address Line 1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7c44794-6cb6-45f0-8191-3978fa177a3b' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'address_zip')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd7c44794-6cb6-45f0-8191-3978fa177a3b',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100018,
            'address_zip',
            'Address Zip',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0d7def23-ca39-425c-abc4-81f4a9b7fe70' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'dietary_restrictions')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0d7def23-ca39-425c-abc4-81f4a9b7fe70',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100019,
            'dietary_restrictions',
            'Dietary Restrictions',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7f34c96e-2b96-47c5-a95c-208d6a660a6b' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'memberships')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7f34c96e-2b96-47c5-a95c-208d6a660a6b',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100020,
            'memberships',
            'memberships',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58494f95-f2b6-46b9-91b7-c7b48b95bbbc' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'address_country')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '58494f95-f2b6-46b9-91b7-c7b48b95bbbc',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100021,
            'address_country',
            'Address Country',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd9bfd45-a5aa-458e-aa38-bb85360f8e4f' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'code_badge')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd9bfd45-a5aa-458e-aa38-bb85360f8e4f',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100022,
            'code_badge',
            'Code Badge',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96d09781-39a5-4cb5-9152-8f1ea4387c8b' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'email')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '96d09781-39a5-4cb5-9152-8f1ea4387c8b',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100023,
            'email',
            'email',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f577464f-158a-4f45-b3e9-3d011c120323' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'code_internal')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f577464f-158a-4f45-b3e9-3d011c120323',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100024,
            'code_internal',
            'Code Internal',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42ce02a4-f019-4eee-9616-6321b7fb55f8' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'contact_organization')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42ce02a4-f019-4eee-9616-6321b7fb55f8',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100025,
            'contact_organization',
            'Contact Organization',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bcd407f-b96a-487c-b123-6660e2fa9d5a' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'address_state')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7bcd407f-b96a-487c-b123-6660e2fa9d5a',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100026,
            'address_state',
            'Address State',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc468676-e734-40d0-92ad-dc4b89840480' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = 'all_memberships')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cc468676-e734-40d0-92ad-dc4b89840480',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100027,
            'all_memberships',
            'All Memberships',
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aaa6b375-5f76-4b08-a313-6657a93a3130' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aaa6b375-5f76-4b08-a313-6657a93a3130',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100028,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9bb5d791-64be-4ec3-aec2-74a5c3d637d4' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9bb5d791-64be-4ec3-aec2-74a5c3d637d4',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100029,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83b31917-dee7-4fb3-9d7e-961357e2a89b' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '83b31917-dee7-4fb3-9d7e-961357e2a89b',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100030,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e6e261b-90a4-4f63-a3c0-4f56da2e0361' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5e6e261b-90a4-4f63-a3c0-4f56da2e0361',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100031,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b7b08a9-69fb-49f3-986a-edc9094c422d' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b7b08a9-69fb-49f3-986a-edc9094c422d',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100032,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9982dc5d-15dc-46f1-80fa-e4d1aa5d6e2c' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9982dc5d-15dc-46f1-80fa-e4d1aa5d6e2c',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100033,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dabe196c-677e-465e-b837-5dd1dec8c5cc' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dabe196c-677e-465e-b837-5dd1dec8c5cc',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100034,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58b70a2b-a40b-46fd-a5dd-fe3292839958' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '58b70a2b-a40b-46fd-a5dd-fe3292839958',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100035,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6335aaf0-f8f9-4742-ba77-d97171544a43' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6335aaf0-f8f9-4742-ba77-d97171544a43',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100036,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10ff34c8-a4f2-4671-a706-b7e23ffaaf05' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '10ff34c8-a4f2-4671-a706-b7e23ffaaf05',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100037,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '03210fe6-927b-4d12-bece-460ac99c2760' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03210fe6-927b-4d12-bece-460ac99c2760',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100038,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5b9b5de-9c1a-43a4-8630-366cd0069c42' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a5b9b5de-9c1a-43a4-8630-366cd0069c42',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100039,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f191629-ceaa-4ba1-a326-6444256da34f' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8f191629-ceaa-4ba1-a326-6444256da34f',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100040,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ebc154b-4bd5-45ea-97d4-3e96e5b318e9' OR (EntityID = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6ebc154b-4bd5-45ea-97d4-3e96e5b318e9',
            '4E6F3A97-AE48-4043-85D3-D41703DF465A', -- Entity: Members
            100041,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b01a936-5124-4f15-8d3d-cfd531e849b0' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = 'code')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b01a936-5124-4f15-8d3d-cfd531e849b0',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100001,
            'code',
            'code',
            'Primary key — PheedLoop string ''code'' identifier (universal convention).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '84c0c7ac-e2e9-4ec7-a2e4-a845da60e2f1' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = 'event')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '84c0c7ac-e2e9-4ec7-a2e4-a845da60e2f1',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100002,
            'event',
            'event',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3fa1f358-e016-4b93-8d2c-6533539ff3bf' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = 'name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3fa1f358-e016-4b93-8d2c-6533539ff3bf',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100003,
            'name',
            'name',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd142be09-a228-417c-af54-ad449273ab37' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = 'description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd142be09-a228-417c-af54-ad449273ab37',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100004,
            'description',
            'description',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a012dcf8-b6b0-4ee2-b77e-1f77e02a42ec' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = 'id')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a012dcf8-b6b0-4ee2-b77e-1f77e02a42ec',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100005,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23da683a-0fde-40b2-a4a7-15089b2f21ea' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_SyncStatus')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '23da683a-0fde-40b2-a4a7-15089b2f21ea',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100006,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a25700fe-f79b-4782-a464-3b586e2d26f7' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '__mj_integration_LastSyncedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a25700fe-f79b-4782-a464-3b586e2d26f7',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100007,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '176ced65-690d-4072-a8f0-615dd3fc500e' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_LastSyncedSnapshot')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '176ced65-690d-4072-a8f0-615dd3fc500e',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '876f809b-eeef-4f3b-a165-a61f26f7dfc4' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_SyncMessage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '876f809b-eeef-4f3b-a165-a61f26f7dfc4',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2824ede-b136-4c38-84bb-f5d132452bd1' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_ContentHash')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b2824ede-b136-4c38-84bb-f5d132452bd1',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100010,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9026f973-1a43-440b-b17e-c9b00c050bcb' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_CustomOverflow')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9026f973-1a43-440b-b17e-c9b00c050bcb',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100011,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf84804f-d11a-4f49-a408-f961b9241a7a' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_ExternalVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bf84804f-d11a-4f49-a408-f961b9241a7a',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100012,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66dd8841-6c18-4032-9086-aeb0c826df5b' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_LastSeenModifiedValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '66dd8841-6c18-4032-9086-aeb0c826df5b',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100013,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e24c0e8-1e59-4144-b767-a6da75376240' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '__mj_integration_LastReconciledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4e24c0e8-1e59-4144-b767-a6da75376240',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd40215f3-e971-4f2e-b1b3-3eeeb5878dbf' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_LastWriterDirection')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd40215f3-e971-4f2e-b1b3-3eeeb5878dbf',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26496f59-5205-4f19-984d-88edb8df6ab3' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '${flyway:defaultSchema}_integration_IsTombstoned')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26496f59-5205-4f19-984d-88edb8df6ab3',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100016,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fc61685-98de-4c61-9262-267e5fc92c51' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '__mj_integration_DeletedDetectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fc61685-98de-4c61-9262-267e5fc92c51',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100017,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a250b21f-e396-483c-9309-4108184c0651' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a250b21f-e396-483c-9309-4108184c0651',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100018,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6b25ac9-36fe-4e31-8a39-994b9f4ecbbb' OR (EntityID = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a6b25ac9-36fe-4e31-8a39-994b9f4ecbbb',
            '36D2140D-2A2C-4F9A-A934-F514D80E380D', -- Entity: Tags
            100019,
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

/* Set soft PK for pheedloop.ContactTags.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '82616D42-A86C-4B9A-9867-46DB647CA049' AND [Name] = 'code';

/* Set soft PK for pheedloop.Events.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND [Name] = 'code';

/* Set soft PK for pheedloop.MemberOrganization.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND [Name] = 'code';

/* Set soft PK for pheedloop.Members.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND [Name] = 'code';

/* Set soft PK for pheedloop.Memberships.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND [Name] = 'code';

/* Set soft PK for pheedloop.OrgAnnouncements.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND [Name] = 'code';

/* Set soft PK for pheedloop.Tickets.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND [Name] = 'code';

/* Set soft PK for pheedloop.Tags.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND [Name] = 'code';

/* Set soft FK for pheedloop.Tags.event → Events.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '36413F26-8A74-487C-B689-A53B0A2C35BD',
                                    [RelatedEntityFieldName] = 'code',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND [Name] = 'event';


/* Create Entity Relationship: Events -> Tags (One To Many via event) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '89e8cd39-5bb6-42ec-9f6a-33f71cb81ff4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('89e8cd39-5bb6-42ec-9f6a-33f71cb81ff4', '36413F26-8A74-487C-B689-A53B0A2C35BD', '36D2140D-2A2C-4F9A-A934-F514D80E380D', 'event', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ContactTags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for MemberOrganization */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Organizations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

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
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  ContactTags
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwContactTags]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwContactTags];
GO

CREATE VIEW [pheedloop].[vwContactTags]
AS
SELECT
    c.*
FROM
    [pheedloop].[ContactTags] AS c
GO
GRANT SELECT ON [pheedloop].[vwContactTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: Permissions for vwContactTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwContactTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spCreateContactTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContactTags
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateContactTags]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateContactTags];
GO

CREATE PROCEDURE [pheedloop].[spCreateContactTags]
    @code nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
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
    [pheedloop].[ContactTags]
        (
            [name],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwContactTags] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateContactTags] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Tags */

GRANT EXECUTE ON [pheedloop].[spCreateContactTags] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spUpdateContactTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContactTags
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateContactTags]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateContactTags];
GO

CREATE PROCEDURE [pheedloop].[spUpdateContactTags]
    @code nvarchar(255),
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
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
        [pheedloop].[ContactTags]
    SET
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwContactTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwContactTags]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateContactTags] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContactTags table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateContactTags]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateContactTags];
GO
CREATE TRIGGER [pheedloop].trgUpdateContactTags
ON [pheedloop].[ContactTags]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[ContactTags]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[ContactTags] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Contact Tags */

GRANT EXECUTE ON [pheedloop].[spUpdateContactTags] TO [cdp_Developer], [cdp_Integration];

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
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  Events
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwEvents]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwEvents];
GO

CREATE VIEW [pheedloop].[vwEvents]
AS
SELECT
    e.*
FROM
    [pheedloop].[Events] AS e
GO
GRANT SELECT ON [pheedloop].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Permissions for vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spCreateEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Events
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateEvents]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateEvents];
GO

CREATE PROCEDURE [pheedloop].[spCreateEvents]
    @learning_objectives_Clear bit = 0,
    @learning_objectives nvarchar(255) = NULL,
    @time_end_Clear bit = 0,
    @time_end nvarchar(255) = NULL,
    @custom_fields_Clear bit = 0,
    @custom_fields nvarchar(MAX) = NULL,
    @attendee_registration_capacity_Clear bit = 0,
    @attendee_registration_capacity nvarchar(255) = NULL,
    @total_user_credits_Clear bit = 0,
    @total_user_credits nvarchar(255) = NULL,
    @location_Clear bit = 0,
    @location nvarchar(255) = NULL,
    @topics_Clear bit = 0,
    @topics nvarchar(MAX) = NULL,
    @id_Clear bit = 0,
    @id nvarchar(255) = NULL,
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @remaining_user_credits_Clear bit = 0,
    @remaining_user_credits nvarchar(255) = NULL,
    @end_date_Clear bit = 0,
    @end_date nvarchar(255) = NULL,
    @time_start_Clear bit = 0,
    @time_start nvarchar(255) = NULL,
    @virtual_enabled_Clear bit = 0,
    @virtual_enabled nvarchar(255) = NULL,
    @event_name_Clear bit = 0,
    @event_name nvarchar(255) = NULL,
    @user_Clear bit = 0,
    @user nvarchar(255) = NULL,
    @timezone_Clear bit = 0,
    @timezone nvarchar(255) = NULL,
    @total_registration_count_Clear bit = 0,
    @total_registration_count nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @credit_value_Clear bit = 0,
    @credit_value nvarchar(255) = NULL,
    @is_listed_Clear bit = 0,
    @is_listed nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @formats_Clear bit = 0,
    @formats nvarchar(MAX) = NULL,
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
    [pheedloop].[Events]
        (
            [learning_objectives],
                [time_end],
                [custom_fields],
                [attendee_registration_capacity],
                [total_user_credits],
                [location],
                [topics],
                [id],
                [date],
                [remaining_user_credits],
                [end_date],
                [time_start],
                [virtual_enabled],
                [event_name],
                [user],
                [timezone],
                [total_registration_count],
                [credit_value],
                [is_listed],
                [description],
                [formats],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @learning_objectives_Clear = 1 THEN NULL ELSE ISNULL(@learning_objectives, NULL) END,
                CASE WHEN @time_end_Clear = 1 THEN NULL ELSE ISNULL(@time_end, NULL) END,
                CASE WHEN @custom_fields_Clear = 1 THEN NULL ELSE ISNULL(@custom_fields, NULL) END,
                CASE WHEN @attendee_registration_capacity_Clear = 1 THEN NULL ELSE ISNULL(@attendee_registration_capacity, NULL) END,
                CASE WHEN @total_user_credits_Clear = 1 THEN NULL ELSE ISNULL(@total_user_credits, NULL) END,
                CASE WHEN @location_Clear = 1 THEN NULL ELSE ISNULL(@location, NULL) END,
                CASE WHEN @topics_Clear = 1 THEN NULL ELSE ISNULL(@topics, NULL) END,
                CASE WHEN @id_Clear = 1 THEN NULL ELSE ISNULL(@id, NULL) END,
                CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, NULL) END,
                CASE WHEN @remaining_user_credits_Clear = 1 THEN NULL ELSE ISNULL(@remaining_user_credits, NULL) END,
                CASE WHEN @end_date_Clear = 1 THEN NULL ELSE ISNULL(@end_date, NULL) END,
                CASE WHEN @time_start_Clear = 1 THEN NULL ELSE ISNULL(@time_start, NULL) END,
                CASE WHEN @virtual_enabled_Clear = 1 THEN NULL ELSE ISNULL(@virtual_enabled, NULL) END,
                CASE WHEN @event_name_Clear = 1 THEN NULL ELSE ISNULL(@event_name, NULL) END,
                CASE WHEN @user_Clear = 1 THEN NULL ELSE ISNULL(@user, NULL) END,
                CASE WHEN @timezone_Clear = 1 THEN NULL ELSE ISNULL(@timezone, NULL) END,
                CASE WHEN @total_registration_count_Clear = 1 THEN NULL ELSE ISNULL(@total_registration_count, NULL) END,
                CASE WHEN @credit_value_Clear = 1 THEN NULL ELSE ISNULL(@credit_value, NULL) END,
                CASE WHEN @is_listed_Clear = 1 THEN NULL ELSE ISNULL(@is_listed, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @formats_Clear = 1 THEN NULL ELSE ISNULL(@formats, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwEvents] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateEvents] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Events */

GRANT EXECUTE ON [pheedloop].[spCreateEvents] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spUpdateEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Events
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateEvents]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateEvents];
GO

CREATE PROCEDURE [pheedloop].[spUpdateEvents]
    @learning_objectives_Clear bit = 0,
    @learning_objectives nvarchar(255) = NULL,
    @time_end_Clear bit = 0,
    @time_end nvarchar(255) = NULL,
    @custom_fields_Clear bit = 0,
    @custom_fields nvarchar(MAX) = NULL,
    @attendee_registration_capacity_Clear bit = 0,
    @attendee_registration_capacity nvarchar(255) = NULL,
    @total_user_credits_Clear bit = 0,
    @total_user_credits nvarchar(255) = NULL,
    @location_Clear bit = 0,
    @location nvarchar(255) = NULL,
    @topics_Clear bit = 0,
    @topics nvarchar(MAX) = NULL,
    @id_Clear bit = 0,
    @id nvarchar(255) = NULL,
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @remaining_user_credits_Clear bit = 0,
    @remaining_user_credits nvarchar(255) = NULL,
    @end_date_Clear bit = 0,
    @end_date nvarchar(255) = NULL,
    @time_start_Clear bit = 0,
    @time_start nvarchar(255) = NULL,
    @virtual_enabled_Clear bit = 0,
    @virtual_enabled nvarchar(255) = NULL,
    @event_name_Clear bit = 0,
    @event_name nvarchar(255) = NULL,
    @user_Clear bit = 0,
    @user nvarchar(255) = NULL,
    @timezone_Clear bit = 0,
    @timezone nvarchar(255) = NULL,
    @total_registration_count_Clear bit = 0,
    @total_registration_count nvarchar(255) = NULL,
    @code nvarchar(255),
    @credit_value_Clear bit = 0,
    @credit_value nvarchar(255) = NULL,
    @is_listed_Clear bit = 0,
    @is_listed nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @formats_Clear bit = 0,
    @formats nvarchar(MAX) = NULL,
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
        [pheedloop].[Events]
    SET
        [learning_objectives] = CASE WHEN @learning_objectives_Clear = 1 THEN NULL ELSE ISNULL(@learning_objectives, [learning_objectives]) END,
        [time_end] = CASE WHEN @time_end_Clear = 1 THEN NULL ELSE ISNULL(@time_end, [time_end]) END,
        [custom_fields] = CASE WHEN @custom_fields_Clear = 1 THEN NULL ELSE ISNULL(@custom_fields, [custom_fields]) END,
        [attendee_registration_capacity] = CASE WHEN @attendee_registration_capacity_Clear = 1 THEN NULL ELSE ISNULL(@attendee_registration_capacity, [attendee_registration_capacity]) END,
        [total_user_credits] = CASE WHEN @total_user_credits_Clear = 1 THEN NULL ELSE ISNULL(@total_user_credits, [total_user_credits]) END,
        [location] = CASE WHEN @location_Clear = 1 THEN NULL ELSE ISNULL(@location, [location]) END,
        [topics] = CASE WHEN @topics_Clear = 1 THEN NULL ELSE ISNULL(@topics, [topics]) END,
        [id] = CASE WHEN @id_Clear = 1 THEN NULL ELSE ISNULL(@id, [id]) END,
        [date] = CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, [date]) END,
        [remaining_user_credits] = CASE WHEN @remaining_user_credits_Clear = 1 THEN NULL ELSE ISNULL(@remaining_user_credits, [remaining_user_credits]) END,
        [end_date] = CASE WHEN @end_date_Clear = 1 THEN NULL ELSE ISNULL(@end_date, [end_date]) END,
        [time_start] = CASE WHEN @time_start_Clear = 1 THEN NULL ELSE ISNULL(@time_start, [time_start]) END,
        [virtual_enabled] = CASE WHEN @virtual_enabled_Clear = 1 THEN NULL ELSE ISNULL(@virtual_enabled, [virtual_enabled]) END,
        [event_name] = CASE WHEN @event_name_Clear = 1 THEN NULL ELSE ISNULL(@event_name, [event_name]) END,
        [user] = CASE WHEN @user_Clear = 1 THEN NULL ELSE ISNULL(@user, [user]) END,
        [timezone] = CASE WHEN @timezone_Clear = 1 THEN NULL ELSE ISNULL(@timezone, [timezone]) END,
        [total_registration_count] = CASE WHEN @total_registration_count_Clear = 1 THEN NULL ELSE ISNULL(@total_registration_count, [total_registration_count]) END,
        [credit_value] = CASE WHEN @credit_value_Clear = 1 THEN NULL ELSE ISNULL(@credit_value, [credit_value]) END,
        [is_listed] = CASE WHEN @is_listed_Clear = 1 THEN NULL ELSE ISNULL(@is_listed, [is_listed]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [formats] = CASE WHEN @formats_Clear = 1 THEN NULL ELSE ISNULL(@formats, [formats]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwEvents]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateEvents] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Events table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateEvents]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateEvents];
GO
CREATE TRIGGER [pheedloop].trgUpdateEvents
ON [pheedloop].[Events]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[Events]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[Events] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Events */

GRANT EXECUTE ON [pheedloop].[spUpdateEvents] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Member Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Organizations
-- Item: vwMemberOrganizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Member Organizations
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  MemberOrganization
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwMemberOrganizations]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwMemberOrganizations];
GO

CREATE VIEW [pheedloop].[vwMemberOrganizations]
AS
SELECT
    m.*
FROM
    [pheedloop].[MemberOrganization] AS m
GO
GRANT SELECT ON [pheedloop].[vwMemberOrganizations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Member Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Organizations
-- Item: Permissions for vwMemberOrganizations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwMemberOrganizations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Member Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Organizations
-- Item: spCreateMemberOrganization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MemberOrganization
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateMemberOrganization]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateMemberOrganization];
GO

CREATE PROCEDURE [pheedloop].[spCreateMemberOrganization]
    @payment_code_prefix_Clear bit = 0,
    @payment_code_prefix nvarchar(255) = NULL,
    @address_city_Clear bit = 0,
    @address_city nvarchar(255) = NULL,
    @website_Clear bit = 0,
    @website nvarchar(255) = NULL,
    @notes_Clear bit = 0,
    @notes nvarchar(255) = NULL,
    @managers_Clear bit = 0,
    @managers nvarchar(MAX) = NULL,
    @address_line_2_Clear bit = 0,
    @address_line_2 nvarchar(255) = NULL,
    @tax_Clear bit = 0,
    @tax nvarchar(255) = NULL,
    @address_state_Clear bit = 0,
    @address_state nvarchar(255) = NULL,
    @address_line_1_Clear bit = 0,
    @address_line_1 nvarchar(255) = NULL,
    @address_zip_Clear bit = 0,
    @address_zip nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @internal_code_Clear bit = 0,
    @internal_code nvarchar(255) = NULL,
    @extra_Clear bit = 0,
    @extra nvarchar(MAX) = NULL,
    @address_country_Clear bit = 0,
    @address_country nvarchar(255) = NULL,
    @id_Clear bit = 0,
    @id nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @address_phone_work_Clear bit = 0,
    @address_phone_work nvarchar(255) = NULL,
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
    [pheedloop].[MemberOrganization]
        (
            [payment_code_prefix],
                [address_city],
                [website],
                [notes],
                [managers],
                [address_line_2],
                [tax],
                [address_state],
                [address_line_1],
                [address_zip],
                [internal_code],
                [extra],
                [address_country],
                [id],
                [name],
                [address_phone_work],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @payment_code_prefix_Clear = 1 THEN NULL ELSE ISNULL(@payment_code_prefix, NULL) END,
                CASE WHEN @address_city_Clear = 1 THEN NULL ELSE ISNULL(@address_city, NULL) END,
                CASE WHEN @website_Clear = 1 THEN NULL ELSE ISNULL(@website, NULL) END,
                CASE WHEN @notes_Clear = 1 THEN NULL ELSE ISNULL(@notes, NULL) END,
                CASE WHEN @managers_Clear = 1 THEN NULL ELSE ISNULL(@managers, NULL) END,
                CASE WHEN @address_line_2_Clear = 1 THEN NULL ELSE ISNULL(@address_line_2, NULL) END,
                CASE WHEN @tax_Clear = 1 THEN NULL ELSE ISNULL(@tax, NULL) END,
                CASE WHEN @address_state_Clear = 1 THEN NULL ELSE ISNULL(@address_state, NULL) END,
                CASE WHEN @address_line_1_Clear = 1 THEN NULL ELSE ISNULL(@address_line_1, NULL) END,
                CASE WHEN @address_zip_Clear = 1 THEN NULL ELSE ISNULL(@address_zip, NULL) END,
                CASE WHEN @internal_code_Clear = 1 THEN NULL ELSE ISNULL(@internal_code, NULL) END,
                CASE WHEN @extra_Clear = 1 THEN NULL ELSE ISNULL(@extra, NULL) END,
                CASE WHEN @address_country_Clear = 1 THEN NULL ELSE ISNULL(@address_country, NULL) END,
                CASE WHEN @id_Clear = 1 THEN NULL ELSE ISNULL(@id, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @address_phone_work_Clear = 1 THEN NULL ELSE ISNULL(@address_phone_work, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwMemberOrganizations] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateMemberOrganization] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Member Organizations */

GRANT EXECUTE ON [pheedloop].[spCreateMemberOrganization] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Member Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Organizations
-- Item: spUpdateMemberOrganization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MemberOrganization
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateMemberOrganization]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateMemberOrganization];
GO

CREATE PROCEDURE [pheedloop].[spUpdateMemberOrganization]
    @payment_code_prefix_Clear bit = 0,
    @payment_code_prefix nvarchar(255) = NULL,
    @address_city_Clear bit = 0,
    @address_city nvarchar(255) = NULL,
    @website_Clear bit = 0,
    @website nvarchar(255) = NULL,
    @notes_Clear bit = 0,
    @notes nvarchar(255) = NULL,
    @managers_Clear bit = 0,
    @managers nvarchar(MAX) = NULL,
    @address_line_2_Clear bit = 0,
    @address_line_2 nvarchar(255) = NULL,
    @tax_Clear bit = 0,
    @tax nvarchar(255) = NULL,
    @address_state_Clear bit = 0,
    @address_state nvarchar(255) = NULL,
    @address_line_1_Clear bit = 0,
    @address_line_1 nvarchar(255) = NULL,
    @address_zip_Clear bit = 0,
    @address_zip nvarchar(255) = NULL,
    @code nvarchar(255),
    @internal_code_Clear bit = 0,
    @internal_code nvarchar(255) = NULL,
    @extra_Clear bit = 0,
    @extra nvarchar(MAX) = NULL,
    @address_country_Clear bit = 0,
    @address_country nvarchar(255) = NULL,
    @id_Clear bit = 0,
    @id nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @address_phone_work_Clear bit = 0,
    @address_phone_work nvarchar(255) = NULL,
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
        [pheedloop].[MemberOrganization]
    SET
        [payment_code_prefix] = CASE WHEN @payment_code_prefix_Clear = 1 THEN NULL ELSE ISNULL(@payment_code_prefix, [payment_code_prefix]) END,
        [address_city] = CASE WHEN @address_city_Clear = 1 THEN NULL ELSE ISNULL(@address_city, [address_city]) END,
        [website] = CASE WHEN @website_Clear = 1 THEN NULL ELSE ISNULL(@website, [website]) END,
        [notes] = CASE WHEN @notes_Clear = 1 THEN NULL ELSE ISNULL(@notes, [notes]) END,
        [managers] = CASE WHEN @managers_Clear = 1 THEN NULL ELSE ISNULL(@managers, [managers]) END,
        [address_line_2] = CASE WHEN @address_line_2_Clear = 1 THEN NULL ELSE ISNULL(@address_line_2, [address_line_2]) END,
        [tax] = CASE WHEN @tax_Clear = 1 THEN NULL ELSE ISNULL(@tax, [tax]) END,
        [address_state] = CASE WHEN @address_state_Clear = 1 THEN NULL ELSE ISNULL(@address_state, [address_state]) END,
        [address_line_1] = CASE WHEN @address_line_1_Clear = 1 THEN NULL ELSE ISNULL(@address_line_1, [address_line_1]) END,
        [address_zip] = CASE WHEN @address_zip_Clear = 1 THEN NULL ELSE ISNULL(@address_zip, [address_zip]) END,
        [internal_code] = CASE WHEN @internal_code_Clear = 1 THEN NULL ELSE ISNULL(@internal_code, [internal_code]) END,
        [extra] = CASE WHEN @extra_Clear = 1 THEN NULL ELSE ISNULL(@extra, [extra]) END,
        [address_country] = CASE WHEN @address_country_Clear = 1 THEN NULL ELSE ISNULL(@address_country, [address_country]) END,
        [id] = CASE WHEN @id_Clear = 1 THEN NULL ELSE ISNULL(@id, [id]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [address_phone_work] = CASE WHEN @address_phone_work_Clear = 1 THEN NULL ELSE ISNULL(@address_phone_work, [address_phone_work]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwMemberOrganizations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwMemberOrganizations]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateMemberOrganization] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MemberOrganization table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateMemberOrganization]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateMemberOrganization];
GO
CREATE TRIGGER [pheedloop].trgUpdateMemberOrganization
ON [pheedloop].[MemberOrganization]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[MemberOrganization]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[MemberOrganization] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Member Organizations */

GRANT EXECUTE ON [pheedloop].[spUpdateMemberOrganization] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Members
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  Members
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwMembers]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwMembers];
GO

CREATE VIEW [pheedloop].[vwMembers]
AS
SELECT
    m.*
FROM
    [pheedloop].[Members] AS m
GO
GRANT SELECT ON [pheedloop].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: Permissions for vwMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwMembers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spCreateMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Members
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateMembers]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateMembers];
GO

CREATE PROCEDURE [pheedloop].[spCreateMembers]
    @address_line_2_Clear bit = 0,
    @address_line_2 nvarchar(255) = NULL,
    @contact_groups_Clear bit = 0,
    @contact_groups nvarchar(MAX) = NULL,
    @address_phone_Clear bit = 0,
    @address_phone nvarchar(255) = NULL,
    @metadata_Clear bit = 0,
    @metadata nvarchar(MAX) = NULL,
    @events_attended_Clear bit = 0,
    @events_attended nvarchar(MAX) = NULL,
    @designations_Clear bit = 0,
    @designations nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @linkedin_Clear bit = 0,
    @linkedin nvarchar(255) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(255) = NULL,
    @address_city_Clear bit = 0,
    @address_city nvarchar(255) = NULL,
    @about_Clear bit = 0,
    @about nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @organization_Clear bit = 0,
    @organization nvarchar(255) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(255) = NULL,
    @membership_tier_Clear bit = 0,
    @membership_tier nvarchar(MAX) = NULL,
    @accessibility_requirements_Clear bit = 0,
    @accessibility_requirements nvarchar(255) = NULL,
    @address_line_1_Clear bit = 0,
    @address_line_1 nvarchar(255) = NULL,
    @address_zip_Clear bit = 0,
    @address_zip nvarchar(255) = NULL,
    @dietary_restrictions_Clear bit = 0,
    @dietary_restrictions nvarchar(255) = NULL,
    @memberships_Clear bit = 0,
    @memberships nvarchar(MAX) = NULL,
    @address_country_Clear bit = 0,
    @address_country nvarchar(255) = NULL,
    @code_badge_Clear bit = 0,
    @code_badge nvarchar(255) = NULL,
    @email_Clear bit = 0,
    @email nvarchar(255) = NULL,
    @code_internal_Clear bit = 0,
    @code_internal nvarchar(255) = NULL,
    @contact_organization_Clear bit = 0,
    @contact_organization nvarchar(MAX) = NULL,
    @address_state_Clear bit = 0,
    @address_state nvarchar(255) = NULL,
    @all_memberships_Clear bit = 0,
    @all_memberships nvarchar(MAX) = NULL,
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
    [pheedloop].[Members]
        (
            [address_line_2],
                [contact_groups],
                [address_phone],
                [metadata],
                [events_attended],
                [designations],
                [title],
                [linkedin],
                [last_name],
                [address_city],
                [about],
                [organization],
                [first_name],
                [membership_tier],
                [accessibility_requirements],
                [address_line_1],
                [address_zip],
                [dietary_restrictions],
                [memberships],
                [address_country],
                [code_badge],
                [email],
                [code_internal],
                [contact_organization],
                [address_state],
                [all_memberships],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @address_line_2_Clear = 1 THEN NULL ELSE ISNULL(@address_line_2, NULL) END,
                CASE WHEN @contact_groups_Clear = 1 THEN NULL ELSE ISNULL(@contact_groups, NULL) END,
                CASE WHEN @address_phone_Clear = 1 THEN NULL ELSE ISNULL(@address_phone, NULL) END,
                CASE WHEN @metadata_Clear = 1 THEN NULL ELSE ISNULL(@metadata, NULL) END,
                CASE WHEN @events_attended_Clear = 1 THEN NULL ELSE ISNULL(@events_attended, NULL) END,
                CASE WHEN @designations_Clear = 1 THEN NULL ELSE ISNULL(@designations, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @linkedin_Clear = 1 THEN NULL ELSE ISNULL(@linkedin, NULL) END,
                CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, NULL) END,
                CASE WHEN @address_city_Clear = 1 THEN NULL ELSE ISNULL(@address_city, NULL) END,
                CASE WHEN @about_Clear = 1 THEN NULL ELSE ISNULL(@about, NULL) END,
                CASE WHEN @organization_Clear = 1 THEN NULL ELSE ISNULL(@organization, NULL) END,
                CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, NULL) END,
                CASE WHEN @membership_tier_Clear = 1 THEN NULL ELSE ISNULL(@membership_tier, NULL) END,
                CASE WHEN @accessibility_requirements_Clear = 1 THEN NULL ELSE ISNULL(@accessibility_requirements, NULL) END,
                CASE WHEN @address_line_1_Clear = 1 THEN NULL ELSE ISNULL(@address_line_1, NULL) END,
                CASE WHEN @address_zip_Clear = 1 THEN NULL ELSE ISNULL(@address_zip, NULL) END,
                CASE WHEN @dietary_restrictions_Clear = 1 THEN NULL ELSE ISNULL(@dietary_restrictions, NULL) END,
                CASE WHEN @memberships_Clear = 1 THEN NULL ELSE ISNULL(@memberships, NULL) END,
                CASE WHEN @address_country_Clear = 1 THEN NULL ELSE ISNULL(@address_country, NULL) END,
                CASE WHEN @code_badge_Clear = 1 THEN NULL ELSE ISNULL(@code_badge, NULL) END,
                CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, NULL) END,
                CASE WHEN @code_internal_Clear = 1 THEN NULL ELSE ISNULL(@code_internal, NULL) END,
                CASE WHEN @contact_organization_Clear = 1 THEN NULL ELSE ISNULL(@contact_organization, NULL) END,
                CASE WHEN @address_state_Clear = 1 THEN NULL ELSE ISNULL(@address_state, NULL) END,
                CASE WHEN @all_memberships_Clear = 1 THEN NULL ELSE ISNULL(@all_memberships, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwMembers] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateMembers] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Members */

GRANT EXECUTE ON [pheedloop].[spCreateMembers] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spUpdateMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Members
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateMembers]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateMembers];
GO

CREATE PROCEDURE [pheedloop].[spUpdateMembers]
    @address_line_2_Clear bit = 0,
    @address_line_2 nvarchar(255) = NULL,
    @contact_groups_Clear bit = 0,
    @contact_groups nvarchar(MAX) = NULL,
    @address_phone_Clear bit = 0,
    @address_phone nvarchar(255) = NULL,
    @metadata_Clear bit = 0,
    @metadata nvarchar(MAX) = NULL,
    @events_attended_Clear bit = 0,
    @events_attended nvarchar(MAX) = NULL,
    @designations_Clear bit = 0,
    @designations nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @linkedin_Clear bit = 0,
    @linkedin nvarchar(255) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(255) = NULL,
    @address_city_Clear bit = 0,
    @address_city nvarchar(255) = NULL,
    @about_Clear bit = 0,
    @about nvarchar(255) = NULL,
    @code nvarchar(255),
    @organization_Clear bit = 0,
    @organization nvarchar(255) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(255) = NULL,
    @membership_tier_Clear bit = 0,
    @membership_tier nvarchar(MAX) = NULL,
    @accessibility_requirements_Clear bit = 0,
    @accessibility_requirements nvarchar(255) = NULL,
    @address_line_1_Clear bit = 0,
    @address_line_1 nvarchar(255) = NULL,
    @address_zip_Clear bit = 0,
    @address_zip nvarchar(255) = NULL,
    @dietary_restrictions_Clear bit = 0,
    @dietary_restrictions nvarchar(255) = NULL,
    @memberships_Clear bit = 0,
    @memberships nvarchar(MAX) = NULL,
    @address_country_Clear bit = 0,
    @address_country nvarchar(255) = NULL,
    @code_badge_Clear bit = 0,
    @code_badge nvarchar(255) = NULL,
    @email_Clear bit = 0,
    @email nvarchar(255) = NULL,
    @code_internal_Clear bit = 0,
    @code_internal nvarchar(255) = NULL,
    @contact_organization_Clear bit = 0,
    @contact_organization nvarchar(MAX) = NULL,
    @address_state_Clear bit = 0,
    @address_state nvarchar(255) = NULL,
    @all_memberships_Clear bit = 0,
    @all_memberships nvarchar(MAX) = NULL,
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
        [pheedloop].[Members]
    SET
        [address_line_2] = CASE WHEN @address_line_2_Clear = 1 THEN NULL ELSE ISNULL(@address_line_2, [address_line_2]) END,
        [contact_groups] = CASE WHEN @contact_groups_Clear = 1 THEN NULL ELSE ISNULL(@contact_groups, [contact_groups]) END,
        [address_phone] = CASE WHEN @address_phone_Clear = 1 THEN NULL ELSE ISNULL(@address_phone, [address_phone]) END,
        [metadata] = CASE WHEN @metadata_Clear = 1 THEN NULL ELSE ISNULL(@metadata, [metadata]) END,
        [events_attended] = CASE WHEN @events_attended_Clear = 1 THEN NULL ELSE ISNULL(@events_attended, [events_attended]) END,
        [designations] = CASE WHEN @designations_Clear = 1 THEN NULL ELSE ISNULL(@designations, [designations]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [linkedin] = CASE WHEN @linkedin_Clear = 1 THEN NULL ELSE ISNULL(@linkedin, [linkedin]) END,
        [last_name] = CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, [last_name]) END,
        [address_city] = CASE WHEN @address_city_Clear = 1 THEN NULL ELSE ISNULL(@address_city, [address_city]) END,
        [about] = CASE WHEN @about_Clear = 1 THEN NULL ELSE ISNULL(@about, [about]) END,
        [organization] = CASE WHEN @organization_Clear = 1 THEN NULL ELSE ISNULL(@organization, [organization]) END,
        [first_name] = CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, [first_name]) END,
        [membership_tier] = CASE WHEN @membership_tier_Clear = 1 THEN NULL ELSE ISNULL(@membership_tier, [membership_tier]) END,
        [accessibility_requirements] = CASE WHEN @accessibility_requirements_Clear = 1 THEN NULL ELSE ISNULL(@accessibility_requirements, [accessibility_requirements]) END,
        [address_line_1] = CASE WHEN @address_line_1_Clear = 1 THEN NULL ELSE ISNULL(@address_line_1, [address_line_1]) END,
        [address_zip] = CASE WHEN @address_zip_Clear = 1 THEN NULL ELSE ISNULL(@address_zip, [address_zip]) END,
        [dietary_restrictions] = CASE WHEN @dietary_restrictions_Clear = 1 THEN NULL ELSE ISNULL(@dietary_restrictions, [dietary_restrictions]) END,
        [memberships] = CASE WHEN @memberships_Clear = 1 THEN NULL ELSE ISNULL(@memberships, [memberships]) END,
        [address_country] = CASE WHEN @address_country_Clear = 1 THEN NULL ELSE ISNULL(@address_country, [address_country]) END,
        [code_badge] = CASE WHEN @code_badge_Clear = 1 THEN NULL ELSE ISNULL(@code_badge, [code_badge]) END,
        [email] = CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, [email]) END,
        [code_internal] = CASE WHEN @code_internal_Clear = 1 THEN NULL ELSE ISNULL(@code_internal, [code_internal]) END,
        [contact_organization] = CASE WHEN @contact_organization_Clear = 1 THEN NULL ELSE ISNULL(@contact_organization, [contact_organization]) END,
        [address_state] = CASE WHEN @address_state_Clear = 1 THEN NULL ELSE ISNULL(@address_state, [address_state]) END,
        [all_memberships] = CASE WHEN @all_memberships_Clear = 1 THEN NULL ELSE ISNULL(@all_memberships, [all_memberships]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwMembers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwMembers]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateMembers] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Members table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateMembers]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateMembers];
GO
CREATE TRIGGER [pheedloop].trgUpdateMembers
ON [pheedloop].[Members]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[Members]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[Members] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Members */

GRANT EXECUTE ON [pheedloop].[spUpdateMembers] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Memberships
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  Memberships
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwMemberships]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwMemberships];
GO

CREATE VIEW [pheedloop].[vwMemberships]
AS
SELECT
    m.*
FROM
    [pheedloop].[Memberships] AS m
GO
GRANT SELECT ON [pheedloop].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Permissions for vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spCreateMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Memberships
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateMemberships]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateMemberships];
GO

CREATE PROCEDURE [pheedloop].[spCreateMemberships]
    @email_Clear bit = 0,
    @email nvarchar(255) = NULL,
    @send_confirmation_Clear bit = 0,
    @send_confirmation nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(255) = NULL,
    @is_active_Clear bit = 0,
    @is_active nvarchar(255) = NULL,
    @date_expiry_Clear bit = 0,
    @date_expiry nvarchar(255) = NULL,
    @membership_tier_Clear bit = 0,
    @membership_tier nvarchar(255) = NULL,
    @membership_name_Clear bit = 0,
    @membership_name nvarchar(255) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(255) = NULL,
    @membership_order_Clear bit = 0,
    @membership_order nvarchar(255) = NULL,
    @organization_Clear bit = 0,
    @organization nvarchar(255) = NULL,
    @message_Clear bit = 0,
    @message nvarchar(255) = NULL,
    @is_approved_Clear bit = 0,
    @is_approved nvarchar(255) = NULL,
    @attendee_Clear bit = 0,
    @attendee nvarchar(MAX) = NULL,
    @date_start_Clear bit = 0,
    @date_start nvarchar(255) = NULL,
    @attendee_organization_Clear bit = 0,
    @attendee_organization nvarchar(255) = NULL,
    @notes_Clear bit = 0,
    @notes nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @unassigned_Clear bit = 0,
    @unassigned nvarchar(255) = NULL,
    @additional_information_Clear bit = 0,
    @additional_information nvarchar(255) = NULL,
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
    [pheedloop].[Memberships]
        (
            [email],
                [send_confirmation],
                [title],
                [last_name],
                [is_active],
                [date_expiry],
                [membership_tier],
                [membership_name],
                [first_name],
                [membership_order],
                [organization],
                [message],
                [is_approved],
                [attendee],
                [date_start],
                [attendee_organization],
                [notes],
                [status],
                [unassigned],
                [additional_information],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, NULL) END,
                CASE WHEN @send_confirmation_Clear = 1 THEN NULL ELSE ISNULL(@send_confirmation, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, NULL) END,
                CASE WHEN @is_active_Clear = 1 THEN NULL ELSE ISNULL(@is_active, NULL) END,
                CASE WHEN @date_expiry_Clear = 1 THEN NULL ELSE ISNULL(@date_expiry, NULL) END,
                CASE WHEN @membership_tier_Clear = 1 THEN NULL ELSE ISNULL(@membership_tier, NULL) END,
                CASE WHEN @membership_name_Clear = 1 THEN NULL ELSE ISNULL(@membership_name, NULL) END,
                CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, NULL) END,
                CASE WHEN @membership_order_Clear = 1 THEN NULL ELSE ISNULL(@membership_order, NULL) END,
                CASE WHEN @organization_Clear = 1 THEN NULL ELSE ISNULL(@organization, NULL) END,
                CASE WHEN @message_Clear = 1 THEN NULL ELSE ISNULL(@message, NULL) END,
                CASE WHEN @is_approved_Clear = 1 THEN NULL ELSE ISNULL(@is_approved, NULL) END,
                CASE WHEN @attendee_Clear = 1 THEN NULL ELSE ISNULL(@attendee, NULL) END,
                CASE WHEN @date_start_Clear = 1 THEN NULL ELSE ISNULL(@date_start, NULL) END,
                CASE WHEN @attendee_organization_Clear = 1 THEN NULL ELSE ISNULL(@attendee_organization, NULL) END,
                CASE WHEN @notes_Clear = 1 THEN NULL ELSE ISNULL(@notes, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @unassigned_Clear = 1 THEN NULL ELSE ISNULL(@unassigned, NULL) END,
                CASE WHEN @additional_information_Clear = 1 THEN NULL ELSE ISNULL(@additional_information, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwMemberships] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateMemberships] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Memberships */

GRANT EXECUTE ON [pheedloop].[spCreateMemberships] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spUpdateMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Memberships
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateMemberships]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateMemberships];
GO

CREATE PROCEDURE [pheedloop].[spUpdateMemberships]
    @email_Clear bit = 0,
    @email nvarchar(255) = NULL,
    @send_confirmation_Clear bit = 0,
    @send_confirmation nvarchar(255) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(255) = NULL,
    @is_active_Clear bit = 0,
    @is_active nvarchar(255) = NULL,
    @date_expiry_Clear bit = 0,
    @date_expiry nvarchar(255) = NULL,
    @membership_tier_Clear bit = 0,
    @membership_tier nvarchar(255) = NULL,
    @membership_name_Clear bit = 0,
    @membership_name nvarchar(255) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(255) = NULL,
    @membership_order_Clear bit = 0,
    @membership_order nvarchar(255) = NULL,
    @organization_Clear bit = 0,
    @organization nvarchar(255) = NULL,
    @message_Clear bit = 0,
    @message nvarchar(255) = NULL,
    @is_approved_Clear bit = 0,
    @is_approved nvarchar(255) = NULL,
    @attendee_Clear bit = 0,
    @attendee nvarchar(MAX) = NULL,
    @date_start_Clear bit = 0,
    @date_start nvarchar(255) = NULL,
    @attendee_organization_Clear bit = 0,
    @attendee_organization nvarchar(255) = NULL,
    @notes_Clear bit = 0,
    @notes nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @code nvarchar(255),
    @unassigned_Clear bit = 0,
    @unassigned nvarchar(255) = NULL,
    @additional_information_Clear bit = 0,
    @additional_information nvarchar(255) = NULL,
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
        [pheedloop].[Memberships]
    SET
        [email] = CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, [email]) END,
        [send_confirmation] = CASE WHEN @send_confirmation_Clear = 1 THEN NULL ELSE ISNULL(@send_confirmation, [send_confirmation]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [last_name] = CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, [last_name]) END,
        [is_active] = CASE WHEN @is_active_Clear = 1 THEN NULL ELSE ISNULL(@is_active, [is_active]) END,
        [date_expiry] = CASE WHEN @date_expiry_Clear = 1 THEN NULL ELSE ISNULL(@date_expiry, [date_expiry]) END,
        [membership_tier] = CASE WHEN @membership_tier_Clear = 1 THEN NULL ELSE ISNULL(@membership_tier, [membership_tier]) END,
        [membership_name] = CASE WHEN @membership_name_Clear = 1 THEN NULL ELSE ISNULL(@membership_name, [membership_name]) END,
        [first_name] = CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, [first_name]) END,
        [membership_order] = CASE WHEN @membership_order_Clear = 1 THEN NULL ELSE ISNULL(@membership_order, [membership_order]) END,
        [organization] = CASE WHEN @organization_Clear = 1 THEN NULL ELSE ISNULL(@organization, [organization]) END,
        [message] = CASE WHEN @message_Clear = 1 THEN NULL ELSE ISNULL(@message, [message]) END,
        [is_approved] = CASE WHEN @is_approved_Clear = 1 THEN NULL ELSE ISNULL(@is_approved, [is_approved]) END,
        [attendee] = CASE WHEN @attendee_Clear = 1 THEN NULL ELSE ISNULL(@attendee, [attendee]) END,
        [date_start] = CASE WHEN @date_start_Clear = 1 THEN NULL ELSE ISNULL(@date_start, [date_start]) END,
        [attendee_organization] = CASE WHEN @attendee_organization_Clear = 1 THEN NULL ELSE ISNULL(@attendee_organization, [attendee_organization]) END,
        [notes] = CASE WHEN @notes_Clear = 1 THEN NULL ELSE ISNULL(@notes, [notes]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [unassigned] = CASE WHEN @unassigned_Clear = 1 THEN NULL ELSE ISNULL(@unassigned, [unassigned]) END,
        [additional_information] = CASE WHEN @additional_information_Clear = 1 THEN NULL ELSE ISNULL(@additional_information, [additional_information]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwMemberships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwMemberships]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateMemberships] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Memberships table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateMemberships]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateMemberships];
GO
CREATE TRIGGER [pheedloop].trgUpdateMemberships
ON [pheedloop].[Memberships]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[Memberships]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[Memberships] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Memberships */

GRANT EXECUTE ON [pheedloop].[spUpdateMemberships] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spDeleteContactTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContactTags
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteContactTags]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteContactTags];
GO

CREATE PROCEDURE [pheedloop].[spDeleteContactTags]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[ContactTags]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteContactTags] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Tags */

GRANT EXECUTE ON [pheedloop].[spDeleteContactTags] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spDeleteEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Events
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteEvents]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteEvents];
GO

CREATE PROCEDURE [pheedloop].[spDeleteEvents]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[Events]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteEvents] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Events */

GRANT EXECUTE ON [pheedloop].[spDeleteEvents] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Member Organizations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Member Organizations
-- Item: spDeleteMemberOrganization
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MemberOrganization
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteMemberOrganization]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteMemberOrganization];
GO

CREATE PROCEDURE [pheedloop].[spDeleteMemberOrganization]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[MemberOrganization]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteMemberOrganization] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Member Organizations */

GRANT EXECUTE ON [pheedloop].[spDeleteMemberOrganization] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Members */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Members
-- Item: spDeleteMembers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Members
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteMembers]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteMembers];
GO

CREATE PROCEDURE [pheedloop].[spDeleteMembers]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[Members]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteMembers] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Members */

GRANT EXECUTE ON [pheedloop].[spDeleteMembers] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spDeleteMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Memberships
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteMemberships]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteMemberships];
GO

CREATE PROCEDURE [pheedloop].[spDeleteMemberships]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[Memberships]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteMemberships] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Memberships */

GRANT EXECUTE ON [pheedloop].[spDeleteMemberships] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for RSUAuditLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: vwRSUAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: RSU Audit Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RSUAuditLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRSUAuditLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRSUAuditLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRSUAuditLogs]
AS
SELECT
    r.*
FROM
    [${flyway:defaultSchema}].[RSUAuditLog] AS r
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRSUAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: Permissions for vwRSUAuditLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRSUAuditLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: spCreateRSUAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RSUAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRSUAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRSUAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRSUAuditLog]
    @Description nvarchar(500),
    @AffectedTables_Clear bit = 0,
    @AffectedTables nvarchar(MAX) = NULL,
    @Success bit,
    @APIRestarted bit = NULL,
    @GitCommitSuccess bit = NULL,
    @BranchName_Clear bit = 0,
    @BranchName nvarchar(200) = NULL,
    @MigrationFilePath_Clear bit = 0,
    @MigrationFilePath nvarchar(500) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ErrorStep_Clear bit = 0,
    @ErrorStep nvarchar(100) = NULL,
    @StepsJSON_Clear bit = 0,
    @StepsJSON nvarchar(MAX) = NULL,
    @TotalDurationMs_Clear bit = 0,
    @TotalDurationMs int = NULL,
    @RunAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [${flyway:defaultSchema}].[RSUAuditLog]
        (
            [Description],
                [AffectedTables],
                [Success],
                [APIRestarted],
                [GitCommitSuccess],
                [BranchName],
                [MigrationFilePath],
                [ErrorMessage],
                [ErrorStep],
                [StepsJSON],
                [TotalDurationMs],
                [RunAt]
        )
    VALUES
        (
            @Description,
                CASE WHEN @AffectedTables_Clear = 1 THEN NULL ELSE ISNULL(@AffectedTables, NULL) END,
                @Success,
                ISNULL(@APIRestarted, 0),
                ISNULL(@GitCommitSuccess, 0),
                CASE WHEN @BranchName_Clear = 1 THEN NULL ELSE ISNULL(@BranchName, NULL) END,
                CASE WHEN @MigrationFilePath_Clear = 1 THEN NULL ELSE ISNULL(@MigrationFilePath, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ErrorStep_Clear = 1 THEN NULL ELSE ISNULL(@ErrorStep, NULL) END,
                CASE WHEN @StepsJSON_Clear = 1 THEN NULL ELSE ISNULL(@StepsJSON, NULL) END,
                CASE WHEN @TotalDurationMs_Clear = 1 THEN NULL ELSE ISNULL(@TotalDurationMs, NULL) END,
                ISNULL(@RunAt, getutcdate())
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRSUAuditLogs] WHERE [ID] = SCOPE_IDENTITY()
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: RSU Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: spUpdateRSUAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RSUAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRSUAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRSUAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRSUAuditLog]
    @ID int,
    @Description nvarchar(500) = NULL,
    @AffectedTables_Clear bit = 0,
    @AffectedTables nvarchar(MAX) = NULL,
    @Success bit = NULL,
    @APIRestarted bit = NULL,
    @GitCommitSuccess bit = NULL,
    @BranchName_Clear bit = 0,
    @BranchName nvarchar(200) = NULL,
    @MigrationFilePath_Clear bit = 0,
    @MigrationFilePath nvarchar(500) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ErrorStep_Clear bit = 0,
    @ErrorStep nvarchar(100) = NULL,
    @StepsJSON_Clear bit = 0,
    @StepsJSON nvarchar(MAX) = NULL,
    @TotalDurationMs_Clear bit = 0,
    @TotalDurationMs int = NULL,
    @RunAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RSUAuditLog]
    SET
        [Description] = ISNULL(@Description, [Description]),
        [AffectedTables] = CASE WHEN @AffectedTables_Clear = 1 THEN NULL ELSE ISNULL(@AffectedTables, [AffectedTables]) END,
        [Success] = ISNULL(@Success, [Success]),
        [APIRestarted] = ISNULL(@APIRestarted, [APIRestarted]),
        [GitCommitSuccess] = ISNULL(@GitCommitSuccess, [GitCommitSuccess]),
        [BranchName] = CASE WHEN @BranchName_Clear = 1 THEN NULL ELSE ISNULL(@BranchName, [BranchName]) END,
        [MigrationFilePath] = CASE WHEN @MigrationFilePath_Clear = 1 THEN NULL ELSE ISNULL(@MigrationFilePath, [MigrationFilePath]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ErrorStep] = CASE WHEN @ErrorStep_Clear = 1 THEN NULL ELSE ISNULL(@ErrorStep, [ErrorStep]) END,
        [StepsJSON] = CASE WHEN @StepsJSON_Clear = 1 THEN NULL ELSE ISNULL(@StepsJSON, [StepsJSON]) END,
        [TotalDurationMs] = CASE WHEN @TotalDurationMs_Clear = 1 THEN NULL ELSE ISNULL(@TotalDurationMs, [TotalDurationMs]) END,
        [RunAt] = ISNULL(@RunAt, [RunAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRSUAuditLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRSUAuditLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRSUAuditLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RSUAuditLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRSUAuditLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRSUAuditLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRSUAuditLog
ON [${flyway:defaultSchema}].[RSUAuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RSUAuditLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RSUAuditLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: RSU Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: RSU Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Audit Logs
-- Item: spDeleteRSUAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RSUAuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRSUAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRSUAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRSUAuditLog]
    @ID int
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RSUAuditLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: RSU Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRSUAuditLog] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for OrgAnnouncements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Org Announcements
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key event in table Tags
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Tags_event' 
    AND object_id = OBJECT_ID('[pheedloop].[Tags]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Tags_event ON [pheedloop].[Tags] ([event]);

/* Index for Foreign Keys for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Org Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Org Announcements
-- Item: vwOrgAnnouncements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Org Announcements
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  OrgAnnouncements
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwOrgAnnouncements]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwOrgAnnouncements];
GO

CREATE VIEW [pheedloop].[vwOrgAnnouncements]
AS
SELECT
    o.*
FROM
    [pheedloop].[OrgAnnouncements] AS o
GO
GRANT SELECT ON [pheedloop].[vwOrgAnnouncements] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Org Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Org Announcements
-- Item: Permissions for vwOrgAnnouncements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwOrgAnnouncements] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Org Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Org Announcements
-- Item: spCreateOrgAnnouncements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrgAnnouncements
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateOrgAnnouncements]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateOrgAnnouncements];
GO

CREATE PROCEDURE [pheedloop].[spCreateOrgAnnouncements]
    @release_date_Clear bit = 0,
    @release_date nvarchar(255) = NULL,
    @membership_tiers_targets_Clear bit = 0,
    @membership_tiers_targets nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @is_visible_attendee_Clear bit = 0,
    @is_visible_attendee nvarchar(255) = NULL,
    @is_credentials_included_Clear bit = 0,
    @is_credentials_included nvarchar(255) = NULL,
    @is_released_Clear bit = 0,
    @is_released nvarchar(255) = NULL,
    @cta_link_Clear bit = 0,
    @cta_link nvarchar(255) = NULL,
    @order_num_Clear bit = 0,
    @order_num nvarchar(255) = NULL,
    @release_time_Clear bit = 0,
    @release_time nvarchar(255) = NULL,
    @recipients_Clear bit = 0,
    @recipients nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @organization_Clear bit = 0,
    @organization nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @publish_date_Clear bit = 0,
    @publish_date nvarchar(255) = NULL,
    @is_multiple_send_enabled_Clear bit = 0,
    @is_multiple_send_enabled nvarchar(255) = NULL,
    @is_active_Clear bit = 0,
    @is_active nvarchar(255) = NULL,
    @publish_time_Clear bit = 0,
    @publish_time nvarchar(255) = NULL,
    @exclude_event_targets_Clear bit = 0,
    @exclude_event_targets nvarchar(MAX) = NULL,
    @cta_text_Clear bit = 0,
    @cta_text nvarchar(255) = NULL,
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @is_notification_push_Clear bit = 0,
    @is_notification_push nvarchar(255) = NULL,
    @contact_groups_Clear bit = 0,
    @contact_groups nvarchar(MAX) = NULL,
    @event_targets_Clear bit = 0,
    @event_targets nvarchar(MAX) = NULL,
    @is_notification_mail_Clear bit = 0,
    @is_notification_mail nvarchar(255) = NULL,
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
    [pheedloop].[OrgAnnouncements]
        (
            [release_date],
                [membership_tiers_targets],
                [title],
                [description],
                [is_visible_attendee],
                [is_credentials_included],
                [is_released],
                [cta_link],
                [order_num],
                [release_time],
                [recipients],
                [status],
                [organization],
                [publish_date],
                [is_multiple_send_enabled],
                [is_active],
                [publish_time],
                [exclude_event_targets],
                [cta_text],
                [date],
                [is_notification_push],
                [contact_groups],
                [event_targets],
                [is_notification_mail],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @release_date_Clear = 1 THEN NULL ELSE ISNULL(@release_date, NULL) END,
                CASE WHEN @membership_tiers_targets_Clear = 1 THEN NULL ELSE ISNULL(@membership_tiers_targets, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @is_visible_attendee_Clear = 1 THEN NULL ELSE ISNULL(@is_visible_attendee, NULL) END,
                CASE WHEN @is_credentials_included_Clear = 1 THEN NULL ELSE ISNULL(@is_credentials_included, NULL) END,
                CASE WHEN @is_released_Clear = 1 THEN NULL ELSE ISNULL(@is_released, NULL) END,
                CASE WHEN @cta_link_Clear = 1 THEN NULL ELSE ISNULL(@cta_link, NULL) END,
                CASE WHEN @order_num_Clear = 1 THEN NULL ELSE ISNULL(@order_num, NULL) END,
                CASE WHEN @release_time_Clear = 1 THEN NULL ELSE ISNULL(@release_time, NULL) END,
                CASE WHEN @recipients_Clear = 1 THEN NULL ELSE ISNULL(@recipients, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @organization_Clear = 1 THEN NULL ELSE ISNULL(@organization, NULL) END,
                CASE WHEN @publish_date_Clear = 1 THEN NULL ELSE ISNULL(@publish_date, NULL) END,
                CASE WHEN @is_multiple_send_enabled_Clear = 1 THEN NULL ELSE ISNULL(@is_multiple_send_enabled, NULL) END,
                CASE WHEN @is_active_Clear = 1 THEN NULL ELSE ISNULL(@is_active, NULL) END,
                CASE WHEN @publish_time_Clear = 1 THEN NULL ELSE ISNULL(@publish_time, NULL) END,
                CASE WHEN @exclude_event_targets_Clear = 1 THEN NULL ELSE ISNULL(@exclude_event_targets, NULL) END,
                CASE WHEN @cta_text_Clear = 1 THEN NULL ELSE ISNULL(@cta_text, NULL) END,
                CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, NULL) END,
                CASE WHEN @is_notification_push_Clear = 1 THEN NULL ELSE ISNULL(@is_notification_push, NULL) END,
                CASE WHEN @contact_groups_Clear = 1 THEN NULL ELSE ISNULL(@contact_groups, NULL) END,
                CASE WHEN @event_targets_Clear = 1 THEN NULL ELSE ISNULL(@event_targets, NULL) END,
                CASE WHEN @is_notification_mail_Clear = 1 THEN NULL ELSE ISNULL(@is_notification_mail, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwOrgAnnouncements] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateOrgAnnouncements] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Org Announcements */

GRANT EXECUTE ON [pheedloop].[spCreateOrgAnnouncements] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Org Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Org Announcements
-- Item: spUpdateOrgAnnouncements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrgAnnouncements
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateOrgAnnouncements]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateOrgAnnouncements];
GO

CREATE PROCEDURE [pheedloop].[spUpdateOrgAnnouncements]
    @release_date_Clear bit = 0,
    @release_date nvarchar(255) = NULL,
    @membership_tiers_targets_Clear bit = 0,
    @membership_tiers_targets nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @is_visible_attendee_Clear bit = 0,
    @is_visible_attendee nvarchar(255) = NULL,
    @is_credentials_included_Clear bit = 0,
    @is_credentials_included nvarchar(255) = NULL,
    @is_released_Clear bit = 0,
    @is_released nvarchar(255) = NULL,
    @cta_link_Clear bit = 0,
    @cta_link nvarchar(255) = NULL,
    @order_num_Clear bit = 0,
    @order_num nvarchar(255) = NULL,
    @release_time_Clear bit = 0,
    @release_time nvarchar(255) = NULL,
    @recipients_Clear bit = 0,
    @recipients nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @organization_Clear bit = 0,
    @organization nvarchar(255) = NULL,
    @code nvarchar(255),
    @publish_date_Clear bit = 0,
    @publish_date nvarchar(255) = NULL,
    @is_multiple_send_enabled_Clear bit = 0,
    @is_multiple_send_enabled nvarchar(255) = NULL,
    @is_active_Clear bit = 0,
    @is_active nvarchar(255) = NULL,
    @publish_time_Clear bit = 0,
    @publish_time nvarchar(255) = NULL,
    @exclude_event_targets_Clear bit = 0,
    @exclude_event_targets nvarchar(MAX) = NULL,
    @cta_text_Clear bit = 0,
    @cta_text nvarchar(255) = NULL,
    @date_Clear bit = 0,
    @date nvarchar(255) = NULL,
    @is_notification_push_Clear bit = 0,
    @is_notification_push nvarchar(255) = NULL,
    @contact_groups_Clear bit = 0,
    @contact_groups nvarchar(MAX) = NULL,
    @event_targets_Clear bit = 0,
    @event_targets nvarchar(MAX) = NULL,
    @is_notification_mail_Clear bit = 0,
    @is_notification_mail nvarchar(255) = NULL,
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
        [pheedloop].[OrgAnnouncements]
    SET
        [release_date] = CASE WHEN @release_date_Clear = 1 THEN NULL ELSE ISNULL(@release_date, [release_date]) END,
        [membership_tiers_targets] = CASE WHEN @membership_tiers_targets_Clear = 1 THEN NULL ELSE ISNULL(@membership_tiers_targets, [membership_tiers_targets]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [is_visible_attendee] = CASE WHEN @is_visible_attendee_Clear = 1 THEN NULL ELSE ISNULL(@is_visible_attendee, [is_visible_attendee]) END,
        [is_credentials_included] = CASE WHEN @is_credentials_included_Clear = 1 THEN NULL ELSE ISNULL(@is_credentials_included, [is_credentials_included]) END,
        [is_released] = CASE WHEN @is_released_Clear = 1 THEN NULL ELSE ISNULL(@is_released, [is_released]) END,
        [cta_link] = CASE WHEN @cta_link_Clear = 1 THEN NULL ELSE ISNULL(@cta_link, [cta_link]) END,
        [order_num] = CASE WHEN @order_num_Clear = 1 THEN NULL ELSE ISNULL(@order_num, [order_num]) END,
        [release_time] = CASE WHEN @release_time_Clear = 1 THEN NULL ELSE ISNULL(@release_time, [release_time]) END,
        [recipients] = CASE WHEN @recipients_Clear = 1 THEN NULL ELSE ISNULL(@recipients, [recipients]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [organization] = CASE WHEN @organization_Clear = 1 THEN NULL ELSE ISNULL(@organization, [organization]) END,
        [publish_date] = CASE WHEN @publish_date_Clear = 1 THEN NULL ELSE ISNULL(@publish_date, [publish_date]) END,
        [is_multiple_send_enabled] = CASE WHEN @is_multiple_send_enabled_Clear = 1 THEN NULL ELSE ISNULL(@is_multiple_send_enabled, [is_multiple_send_enabled]) END,
        [is_active] = CASE WHEN @is_active_Clear = 1 THEN NULL ELSE ISNULL(@is_active, [is_active]) END,
        [publish_time] = CASE WHEN @publish_time_Clear = 1 THEN NULL ELSE ISNULL(@publish_time, [publish_time]) END,
        [exclude_event_targets] = CASE WHEN @exclude_event_targets_Clear = 1 THEN NULL ELSE ISNULL(@exclude_event_targets, [exclude_event_targets]) END,
        [cta_text] = CASE WHEN @cta_text_Clear = 1 THEN NULL ELSE ISNULL(@cta_text, [cta_text]) END,
        [date] = CASE WHEN @date_Clear = 1 THEN NULL ELSE ISNULL(@date, [date]) END,
        [is_notification_push] = CASE WHEN @is_notification_push_Clear = 1 THEN NULL ELSE ISNULL(@is_notification_push, [is_notification_push]) END,
        [contact_groups] = CASE WHEN @contact_groups_Clear = 1 THEN NULL ELSE ISNULL(@contact_groups, [contact_groups]) END,
        [event_targets] = CASE WHEN @event_targets_Clear = 1 THEN NULL ELSE ISNULL(@event_targets, [event_targets]) END,
        [is_notification_mail] = CASE WHEN @is_notification_mail_Clear = 1 THEN NULL ELSE ISNULL(@is_notification_mail, [is_notification_mail]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwOrgAnnouncements] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwOrgAnnouncements]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateOrgAnnouncements] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrgAnnouncements table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateOrgAnnouncements]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateOrgAnnouncements];
GO
CREATE TRIGGER [pheedloop].trgUpdateOrgAnnouncements
ON [pheedloop].[OrgAnnouncements]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[OrgAnnouncements]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[OrgAnnouncements] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Org Announcements */

GRANT EXECUTE ON [pheedloop].[spUpdateOrgAnnouncements] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tags
-- Item: vwTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Tags
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  Tags
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwTags]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwTags];
GO

CREATE VIEW [pheedloop].[vwTags]
AS
SELECT
    t.*
FROM
    [pheedloop].[Tags] AS t
GO
GRANT SELECT ON [pheedloop].[vwTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tags
-- Item: Permissions for vwTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwTags] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tags
-- Item: spCreateTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tags
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateTags]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateTags];
GO

CREATE PROCEDURE [pheedloop].[spCreateTags]
    @code nvarchar(255) = NULL,
    @event_Clear bit = 0,
    @event nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @id_Clear bit = 0,
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
    [pheedloop].[Tags]
        (
            [event],
                [name],
                [description],
                [id],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @event_Clear = 1 THEN NULL ELSE ISNULL(@event, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @id_Clear = 1 THEN NULL ELSE ISNULL(@id, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwTags] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateTags] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Tags */

GRANT EXECUTE ON [pheedloop].[spCreateTags] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tags
-- Item: spUpdateTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tags
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateTags]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateTags];
GO

CREATE PROCEDURE [pheedloop].[spUpdateTags]
    @code nvarchar(255),
    @event_Clear bit = 0,
    @event nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @id_Clear bit = 0,
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
    UPDATE
        [pheedloop].[Tags]
    SET
        [event] = CASE WHEN @event_Clear = 1 THEN NULL ELSE ISNULL(@event, [event]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [id] = CASE WHEN @id_Clear = 1 THEN NULL ELSE ISNULL(@id, [id]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwTags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwTags]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateTags] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tags table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateTags]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateTags];
GO
CREATE TRIGGER [pheedloop].trgUpdateTags
ON [pheedloop].[Tags]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[Tags]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[Tags] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Tags */

GRANT EXECUTE ON [pheedloop].[spUpdateTags] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: vwTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Tickets
-----               SCHEMA:      pheedloop
-----               BASE TABLE:  Tickets
-----               PRIMARY KEY: code
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[vwTickets]', 'V') IS NOT NULL
    DROP VIEW [pheedloop].[vwTickets];
GO

CREATE VIEW [pheedloop].[vwTickets]
AS
SELECT
    t.*
FROM
    [pheedloop].[Tickets] AS t
GO
GRANT SELECT ON [pheedloop].[vwTickets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: Permissions for vwTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [pheedloop].[vwTickets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: spCreateTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Tickets
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spCreateTickets]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spCreateTickets];
GO

CREATE PROCEDURE [pheedloop].[spCreateTickets]
    @start_time_Clear bit = 0,
    @start_time nvarchar(255) = NULL,
    @country_whitelist_Clear bit = 0,
    @country_whitelist nvarchar(255) = NULL,
    @break_3_price_Clear bit = 0,
    @break_3_price nvarchar(255) = NULL,
    @is_sold_in_app_Clear bit = 0,
    @is_sold_in_app nvarchar(255) = NULL,
    @is_visible_unavailable_Clear bit = 0,
    @is_visible_unavailable nvarchar(255) = NULL,
    @break_1_price_Clear bit = 0,
    @break_1_price nvarchar(255) = NULL,
    @minimum_per_attendee_Clear bit = 0,
    @minimum_per_attendee nvarchar(255) = NULL,
    @contact_tags_Clear bit = 0,
    @contact_tags nvarchar(MAX) = NULL,
    @quantity_available_Clear bit = 0,
    @quantity_available nvarchar(255) = NULL,
    @allow_guest_purchases_Clear bit = 0,
    @allow_guest_purchases nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @limit_per_order_Clear bit = 0,
    @limit_per_order nvarchar(255) = NULL,
    @is_active_Clear bit = 0,
    @is_active nvarchar(255) = NULL,
    @is_text_overflow_hidden_Clear bit = 0,
    @is_text_overflow_hidden nvarchar(255) = NULL,
    @is_group_details_required_Clear bit = 0,
    @is_group_details_required nvarchar(255) = NULL,
    @is_addon_Clear bit = 0,
    @is_addon nvarchar(255) = NULL,
    @sessions_Clear bit = 0,
    @sessions nvarchar(MAX) = NULL,
    @event_code_Clear bit = 0,
    @event_code nvarchar(255) = NULL,
    @is_protected_Clear bit = 0,
    @is_protected nvarchar(255) = NULL,
    @is_sold_in_site_Clear bit = 0,
    @is_sold_in_site nvarchar(255) = NULL,
    @is_waitlist_notification_enabled_Clear bit = 0,
    @is_waitlist_notification_enabled nvarchar(255) = NULL,
    @start_date_Clear bit = 0,
    @start_date nvarchar(255) = NULL,
    @end_date_Clear bit = 0,
    @end_date nvarchar(255) = NULL,
    @contact_tags_exclusions_Clear bit = 0,
    @contact_tags_exclusions nvarchar(MAX) = NULL,
    @limit_per_attendee_Clear bit = 0,
    @limit_per_attendee nvarchar(255) = NULL,
    @minimum_per_order_Clear bit = 0,
    @minimum_per_order nvarchar(255) = NULL,
    @break_2_quantity_Clear bit = 0,
    @break_2_quantity nvarchar(255) = NULL,
    @break_3_quantity_Clear bit = 0,
    @break_3_quantity nvarchar(255) = NULL,
    @categories_sub_Clear bit = 0,
    @categories_sub nvarchar(MAX) = NULL,
    @enforce_unique_purchase_Clear bit = 0,
    @enforce_unique_purchase nvarchar(255) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @country_blacklist_Clear bit = 0,
    @country_blacklist nvarchar(255) = NULL,
    @break_1_quantity_Clear bit = 0,
    @break_1_quantity nvarchar(255) = NULL,
    @code nvarchar(255) = NULL,
    @is_waitlist_enabled_Clear bit = 0,
    @is_waitlist_enabled nvarchar(255) = NULL,
    @custom_fields_Clear bit = 0,
    @custom_fields nvarchar(MAX) = NULL,
    @registration_categories_Clear bit = 0,
    @registration_categories nvarchar(MAX) = NULL,
    @is_member_only_Clear bit = 0,
    @is_member_only nvarchar(255) = NULL,
    @is_virtual_Clear bit = 0,
    @is_virtual nvarchar(255) = NULL,
    @is_disabled_email_confirmation_Clear bit = 0,
    @is_disabled_email_confirmation nvarchar(255) = NULL,
    @price_Clear bit = 0,
    @price nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @end_time_Clear bit = 0,
    @end_time nvarchar(255) = NULL,
    @show_as_sold_out_Clear bit = 0,
    @show_as_sold_out nvarchar(255) = NULL,
    @break_2_price_Clear bit = 0,
    @break_2_price nvarchar(255) = NULL,
    @is_private_Clear bit = 0,
    @is_private nvarchar(255) = NULL,
    @enable_pdf_qr_code_Clear bit = 0,
    @enable_pdf_qr_code nvarchar(255) = NULL,
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
    [pheedloop].[Tickets]
        (
            [start_time],
                [country_whitelist],
                [break_3_price],
                [is_sold_in_app],
                [is_visible_unavailable],
                [break_1_price],
                [minimum_per_attendee],
                [contact_tags],
                [quantity_available],
                [allow_guest_purchases],
                [name],
                [limit_per_order],
                [is_active],
                [is_text_overflow_hidden],
                [is_group_details_required],
                [is_addon],
                [sessions],
                [event_code],
                [is_protected],
                [is_sold_in_site],
                [is_waitlist_notification_enabled],
                [start_date],
                [end_date],
                [contact_tags_exclusions],
                [limit_per_attendee],
                [minimum_per_order],
                [break_2_quantity],
                [break_3_quantity],
                [categories_sub],
                [enforce_unique_purchase],
                [tags],
                [country_blacklist],
                [break_1_quantity],
                [is_waitlist_enabled],
                [custom_fields],
                [registration_categories],
                [is_member_only],
                [is_virtual],
                [is_disabled_email_confirmation],
                [price],
                [description],
                [end_time],
                [show_as_sold_out],
                [break_2_price],
                [is_private],
                [enable_pdf_qr_code],
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
                [code]
        )
    VALUES
        (
            CASE WHEN @start_time_Clear = 1 THEN NULL ELSE ISNULL(@start_time, NULL) END,
                CASE WHEN @country_whitelist_Clear = 1 THEN NULL ELSE ISNULL(@country_whitelist, NULL) END,
                CASE WHEN @break_3_price_Clear = 1 THEN NULL ELSE ISNULL(@break_3_price, NULL) END,
                CASE WHEN @is_sold_in_app_Clear = 1 THEN NULL ELSE ISNULL(@is_sold_in_app, NULL) END,
                CASE WHEN @is_visible_unavailable_Clear = 1 THEN NULL ELSE ISNULL(@is_visible_unavailable, NULL) END,
                CASE WHEN @break_1_price_Clear = 1 THEN NULL ELSE ISNULL(@break_1_price, NULL) END,
                CASE WHEN @minimum_per_attendee_Clear = 1 THEN NULL ELSE ISNULL(@minimum_per_attendee, NULL) END,
                CASE WHEN @contact_tags_Clear = 1 THEN NULL ELSE ISNULL(@contact_tags, NULL) END,
                CASE WHEN @quantity_available_Clear = 1 THEN NULL ELSE ISNULL(@quantity_available, NULL) END,
                CASE WHEN @allow_guest_purchases_Clear = 1 THEN NULL ELSE ISNULL(@allow_guest_purchases, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @limit_per_order_Clear = 1 THEN NULL ELSE ISNULL(@limit_per_order, NULL) END,
                CASE WHEN @is_active_Clear = 1 THEN NULL ELSE ISNULL(@is_active, NULL) END,
                CASE WHEN @is_text_overflow_hidden_Clear = 1 THEN NULL ELSE ISNULL(@is_text_overflow_hidden, NULL) END,
                CASE WHEN @is_group_details_required_Clear = 1 THEN NULL ELSE ISNULL(@is_group_details_required, NULL) END,
                CASE WHEN @is_addon_Clear = 1 THEN NULL ELSE ISNULL(@is_addon, NULL) END,
                CASE WHEN @sessions_Clear = 1 THEN NULL ELSE ISNULL(@sessions, NULL) END,
                CASE WHEN @event_code_Clear = 1 THEN NULL ELSE ISNULL(@event_code, NULL) END,
                CASE WHEN @is_protected_Clear = 1 THEN NULL ELSE ISNULL(@is_protected, NULL) END,
                CASE WHEN @is_sold_in_site_Clear = 1 THEN NULL ELSE ISNULL(@is_sold_in_site, NULL) END,
                CASE WHEN @is_waitlist_notification_enabled_Clear = 1 THEN NULL ELSE ISNULL(@is_waitlist_notification_enabled, NULL) END,
                CASE WHEN @start_date_Clear = 1 THEN NULL ELSE ISNULL(@start_date, NULL) END,
                CASE WHEN @end_date_Clear = 1 THEN NULL ELSE ISNULL(@end_date, NULL) END,
                CASE WHEN @contact_tags_exclusions_Clear = 1 THEN NULL ELSE ISNULL(@contact_tags_exclusions, NULL) END,
                CASE WHEN @limit_per_attendee_Clear = 1 THEN NULL ELSE ISNULL(@limit_per_attendee, NULL) END,
                CASE WHEN @minimum_per_order_Clear = 1 THEN NULL ELSE ISNULL(@minimum_per_order, NULL) END,
                CASE WHEN @break_2_quantity_Clear = 1 THEN NULL ELSE ISNULL(@break_2_quantity, NULL) END,
                CASE WHEN @break_3_quantity_Clear = 1 THEN NULL ELSE ISNULL(@break_3_quantity, NULL) END,
                CASE WHEN @categories_sub_Clear = 1 THEN NULL ELSE ISNULL(@categories_sub, NULL) END,
                CASE WHEN @enforce_unique_purchase_Clear = 1 THEN NULL ELSE ISNULL(@enforce_unique_purchase, NULL) END,
                CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, NULL) END,
                CASE WHEN @country_blacklist_Clear = 1 THEN NULL ELSE ISNULL(@country_blacklist, NULL) END,
                CASE WHEN @break_1_quantity_Clear = 1 THEN NULL ELSE ISNULL(@break_1_quantity, NULL) END,
                CASE WHEN @is_waitlist_enabled_Clear = 1 THEN NULL ELSE ISNULL(@is_waitlist_enabled, NULL) END,
                CASE WHEN @custom_fields_Clear = 1 THEN NULL ELSE ISNULL(@custom_fields, NULL) END,
                CASE WHEN @registration_categories_Clear = 1 THEN NULL ELSE ISNULL(@registration_categories, NULL) END,
                CASE WHEN @is_member_only_Clear = 1 THEN NULL ELSE ISNULL(@is_member_only, NULL) END,
                CASE WHEN @is_virtual_Clear = 1 THEN NULL ELSE ISNULL(@is_virtual, NULL) END,
                CASE WHEN @is_disabled_email_confirmation_Clear = 1 THEN NULL ELSE ISNULL(@is_disabled_email_confirmation, NULL) END,
                CASE WHEN @price_Clear = 1 THEN NULL ELSE ISNULL(@price, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @end_time_Clear = 1 THEN NULL ELSE ISNULL(@end_time, NULL) END,
                CASE WHEN @show_as_sold_out_Clear = 1 THEN NULL ELSE ISNULL(@show_as_sold_out, NULL) END,
                CASE WHEN @break_2_price_Clear = 1 THEN NULL ELSE ISNULL(@break_2_price, NULL) END,
                CASE WHEN @is_private_Clear = 1 THEN NULL ELSE ISNULL(@is_private, NULL) END,
                CASE WHEN @enable_pdf_qr_code_Clear = 1 THEN NULL ELSE ISNULL(@enable_pdf_qr_code, NULL) END,
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
                @code
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [pheedloop].[vwTickets] WHERE [code] = @code
END
GO
GRANT EXECUTE ON [pheedloop].[spCreateTickets] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Tickets */

GRANT EXECUTE ON [pheedloop].[spCreateTickets] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: spUpdateTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Tickets
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spUpdateTickets]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spUpdateTickets];
GO

CREATE PROCEDURE [pheedloop].[spUpdateTickets]
    @start_time_Clear bit = 0,
    @start_time nvarchar(255) = NULL,
    @country_whitelist_Clear bit = 0,
    @country_whitelist nvarchar(255) = NULL,
    @break_3_price_Clear bit = 0,
    @break_3_price nvarchar(255) = NULL,
    @is_sold_in_app_Clear bit = 0,
    @is_sold_in_app nvarchar(255) = NULL,
    @is_visible_unavailable_Clear bit = 0,
    @is_visible_unavailable nvarchar(255) = NULL,
    @break_1_price_Clear bit = 0,
    @break_1_price nvarchar(255) = NULL,
    @minimum_per_attendee_Clear bit = 0,
    @minimum_per_attendee nvarchar(255) = NULL,
    @contact_tags_Clear bit = 0,
    @contact_tags nvarchar(MAX) = NULL,
    @quantity_available_Clear bit = 0,
    @quantity_available nvarchar(255) = NULL,
    @allow_guest_purchases_Clear bit = 0,
    @allow_guest_purchases nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(255) = NULL,
    @limit_per_order_Clear bit = 0,
    @limit_per_order nvarchar(255) = NULL,
    @is_active_Clear bit = 0,
    @is_active nvarchar(255) = NULL,
    @is_text_overflow_hidden_Clear bit = 0,
    @is_text_overflow_hidden nvarchar(255) = NULL,
    @is_group_details_required_Clear bit = 0,
    @is_group_details_required nvarchar(255) = NULL,
    @is_addon_Clear bit = 0,
    @is_addon nvarchar(255) = NULL,
    @sessions_Clear bit = 0,
    @sessions nvarchar(MAX) = NULL,
    @event_code_Clear bit = 0,
    @event_code nvarchar(255) = NULL,
    @is_protected_Clear bit = 0,
    @is_protected nvarchar(255) = NULL,
    @is_sold_in_site_Clear bit = 0,
    @is_sold_in_site nvarchar(255) = NULL,
    @is_waitlist_notification_enabled_Clear bit = 0,
    @is_waitlist_notification_enabled nvarchar(255) = NULL,
    @start_date_Clear bit = 0,
    @start_date nvarchar(255) = NULL,
    @end_date_Clear bit = 0,
    @end_date nvarchar(255) = NULL,
    @contact_tags_exclusions_Clear bit = 0,
    @contact_tags_exclusions nvarchar(MAX) = NULL,
    @limit_per_attendee_Clear bit = 0,
    @limit_per_attendee nvarchar(255) = NULL,
    @minimum_per_order_Clear bit = 0,
    @minimum_per_order nvarchar(255) = NULL,
    @break_2_quantity_Clear bit = 0,
    @break_2_quantity nvarchar(255) = NULL,
    @break_3_quantity_Clear bit = 0,
    @break_3_quantity nvarchar(255) = NULL,
    @categories_sub_Clear bit = 0,
    @categories_sub nvarchar(MAX) = NULL,
    @enforce_unique_purchase_Clear bit = 0,
    @enforce_unique_purchase nvarchar(255) = NULL,
    @tags_Clear bit = 0,
    @tags nvarchar(MAX) = NULL,
    @country_blacklist_Clear bit = 0,
    @country_blacklist nvarchar(255) = NULL,
    @break_1_quantity_Clear bit = 0,
    @break_1_quantity nvarchar(255) = NULL,
    @code nvarchar(255),
    @is_waitlist_enabled_Clear bit = 0,
    @is_waitlist_enabled nvarchar(255) = NULL,
    @custom_fields_Clear bit = 0,
    @custom_fields nvarchar(MAX) = NULL,
    @registration_categories_Clear bit = 0,
    @registration_categories nvarchar(MAX) = NULL,
    @is_member_only_Clear bit = 0,
    @is_member_only nvarchar(255) = NULL,
    @is_virtual_Clear bit = 0,
    @is_virtual nvarchar(255) = NULL,
    @is_disabled_email_confirmation_Clear bit = 0,
    @is_disabled_email_confirmation nvarchar(255) = NULL,
    @price_Clear bit = 0,
    @price nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(255) = NULL,
    @end_time_Clear bit = 0,
    @end_time nvarchar(255) = NULL,
    @show_as_sold_out_Clear bit = 0,
    @show_as_sold_out nvarchar(255) = NULL,
    @break_2_price_Clear bit = 0,
    @break_2_price nvarchar(255) = NULL,
    @is_private_Clear bit = 0,
    @is_private nvarchar(255) = NULL,
    @enable_pdf_qr_code_Clear bit = 0,
    @enable_pdf_qr_code nvarchar(255) = NULL,
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
        [pheedloop].[Tickets]
    SET
        [start_time] = CASE WHEN @start_time_Clear = 1 THEN NULL ELSE ISNULL(@start_time, [start_time]) END,
        [country_whitelist] = CASE WHEN @country_whitelist_Clear = 1 THEN NULL ELSE ISNULL(@country_whitelist, [country_whitelist]) END,
        [break_3_price] = CASE WHEN @break_3_price_Clear = 1 THEN NULL ELSE ISNULL(@break_3_price, [break_3_price]) END,
        [is_sold_in_app] = CASE WHEN @is_sold_in_app_Clear = 1 THEN NULL ELSE ISNULL(@is_sold_in_app, [is_sold_in_app]) END,
        [is_visible_unavailable] = CASE WHEN @is_visible_unavailable_Clear = 1 THEN NULL ELSE ISNULL(@is_visible_unavailable, [is_visible_unavailable]) END,
        [break_1_price] = CASE WHEN @break_1_price_Clear = 1 THEN NULL ELSE ISNULL(@break_1_price, [break_1_price]) END,
        [minimum_per_attendee] = CASE WHEN @minimum_per_attendee_Clear = 1 THEN NULL ELSE ISNULL(@minimum_per_attendee, [minimum_per_attendee]) END,
        [contact_tags] = CASE WHEN @contact_tags_Clear = 1 THEN NULL ELSE ISNULL(@contact_tags, [contact_tags]) END,
        [quantity_available] = CASE WHEN @quantity_available_Clear = 1 THEN NULL ELSE ISNULL(@quantity_available, [quantity_available]) END,
        [allow_guest_purchases] = CASE WHEN @allow_guest_purchases_Clear = 1 THEN NULL ELSE ISNULL(@allow_guest_purchases, [allow_guest_purchases]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [limit_per_order] = CASE WHEN @limit_per_order_Clear = 1 THEN NULL ELSE ISNULL(@limit_per_order, [limit_per_order]) END,
        [is_active] = CASE WHEN @is_active_Clear = 1 THEN NULL ELSE ISNULL(@is_active, [is_active]) END,
        [is_text_overflow_hidden] = CASE WHEN @is_text_overflow_hidden_Clear = 1 THEN NULL ELSE ISNULL(@is_text_overflow_hidden, [is_text_overflow_hidden]) END,
        [is_group_details_required] = CASE WHEN @is_group_details_required_Clear = 1 THEN NULL ELSE ISNULL(@is_group_details_required, [is_group_details_required]) END,
        [is_addon] = CASE WHEN @is_addon_Clear = 1 THEN NULL ELSE ISNULL(@is_addon, [is_addon]) END,
        [sessions] = CASE WHEN @sessions_Clear = 1 THEN NULL ELSE ISNULL(@sessions, [sessions]) END,
        [event_code] = CASE WHEN @event_code_Clear = 1 THEN NULL ELSE ISNULL(@event_code, [event_code]) END,
        [is_protected] = CASE WHEN @is_protected_Clear = 1 THEN NULL ELSE ISNULL(@is_protected, [is_protected]) END,
        [is_sold_in_site] = CASE WHEN @is_sold_in_site_Clear = 1 THEN NULL ELSE ISNULL(@is_sold_in_site, [is_sold_in_site]) END,
        [is_waitlist_notification_enabled] = CASE WHEN @is_waitlist_notification_enabled_Clear = 1 THEN NULL ELSE ISNULL(@is_waitlist_notification_enabled, [is_waitlist_notification_enabled]) END,
        [start_date] = CASE WHEN @start_date_Clear = 1 THEN NULL ELSE ISNULL(@start_date, [start_date]) END,
        [end_date] = CASE WHEN @end_date_Clear = 1 THEN NULL ELSE ISNULL(@end_date, [end_date]) END,
        [contact_tags_exclusions] = CASE WHEN @contact_tags_exclusions_Clear = 1 THEN NULL ELSE ISNULL(@contact_tags_exclusions, [contact_tags_exclusions]) END,
        [limit_per_attendee] = CASE WHEN @limit_per_attendee_Clear = 1 THEN NULL ELSE ISNULL(@limit_per_attendee, [limit_per_attendee]) END,
        [minimum_per_order] = CASE WHEN @minimum_per_order_Clear = 1 THEN NULL ELSE ISNULL(@minimum_per_order, [minimum_per_order]) END,
        [break_2_quantity] = CASE WHEN @break_2_quantity_Clear = 1 THEN NULL ELSE ISNULL(@break_2_quantity, [break_2_quantity]) END,
        [break_3_quantity] = CASE WHEN @break_3_quantity_Clear = 1 THEN NULL ELSE ISNULL(@break_3_quantity, [break_3_quantity]) END,
        [categories_sub] = CASE WHEN @categories_sub_Clear = 1 THEN NULL ELSE ISNULL(@categories_sub, [categories_sub]) END,
        [enforce_unique_purchase] = CASE WHEN @enforce_unique_purchase_Clear = 1 THEN NULL ELSE ISNULL(@enforce_unique_purchase, [enforce_unique_purchase]) END,
        [tags] = CASE WHEN @tags_Clear = 1 THEN NULL ELSE ISNULL(@tags, [tags]) END,
        [country_blacklist] = CASE WHEN @country_blacklist_Clear = 1 THEN NULL ELSE ISNULL(@country_blacklist, [country_blacklist]) END,
        [break_1_quantity] = CASE WHEN @break_1_quantity_Clear = 1 THEN NULL ELSE ISNULL(@break_1_quantity, [break_1_quantity]) END,
        [is_waitlist_enabled] = CASE WHEN @is_waitlist_enabled_Clear = 1 THEN NULL ELSE ISNULL(@is_waitlist_enabled, [is_waitlist_enabled]) END,
        [custom_fields] = CASE WHEN @custom_fields_Clear = 1 THEN NULL ELSE ISNULL(@custom_fields, [custom_fields]) END,
        [registration_categories] = CASE WHEN @registration_categories_Clear = 1 THEN NULL ELSE ISNULL(@registration_categories, [registration_categories]) END,
        [is_member_only] = CASE WHEN @is_member_only_Clear = 1 THEN NULL ELSE ISNULL(@is_member_only, [is_member_only]) END,
        [is_virtual] = CASE WHEN @is_virtual_Clear = 1 THEN NULL ELSE ISNULL(@is_virtual, [is_virtual]) END,
        [is_disabled_email_confirmation] = CASE WHEN @is_disabled_email_confirmation_Clear = 1 THEN NULL ELSE ISNULL(@is_disabled_email_confirmation, [is_disabled_email_confirmation]) END,
        [price] = CASE WHEN @price_Clear = 1 THEN NULL ELSE ISNULL(@price, [price]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [end_time] = CASE WHEN @end_time_Clear = 1 THEN NULL ELSE ISNULL(@end_time, [end_time]) END,
        [show_as_sold_out] = CASE WHEN @show_as_sold_out_Clear = 1 THEN NULL ELSE ISNULL(@show_as_sold_out, [show_as_sold_out]) END,
        [break_2_price] = CASE WHEN @break_2_price_Clear = 1 THEN NULL ELSE ISNULL(@break_2_price, [break_2_price]) END,
        [is_private] = CASE WHEN @is_private_Clear = 1 THEN NULL ELSE ISNULL(@is_private, [is_private]) END,
        [enable_pdf_qr_code] = CASE WHEN @enable_pdf_qr_code_Clear = 1 THEN NULL ELSE ISNULL(@enable_pdf_qr_code, [enable_pdf_qr_code]) END,
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
        [code] = @code

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [pheedloop].[vwTickets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [pheedloop].[vwTickets]
                                    WHERE
                                        [code] = @code
                                    
END
GO

GRANT EXECUTE ON [pheedloop].[spUpdateTickets] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Tickets table
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[trgUpdateTickets]', 'TR') IS NOT NULL
    DROP TRIGGER [pheedloop].[trgUpdateTickets];
GO
CREATE TRIGGER [pheedloop].trgUpdateTickets
ON [pheedloop].[Tickets]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [pheedloop].[Tickets]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [pheedloop].[Tickets] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[code] = I.[code];
END;
GO

/* spUpdate Permissions for Tickets */

GRANT EXECUTE ON [pheedloop].[spUpdateTickets] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Org Announcements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Org Announcements
-- Item: spDeleteOrgAnnouncements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrgAnnouncements
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteOrgAnnouncements]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteOrgAnnouncements];
GO

CREATE PROCEDURE [pheedloop].[spDeleteOrgAnnouncements]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[OrgAnnouncements]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteOrgAnnouncements] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Org Announcements */

GRANT EXECUTE ON [pheedloop].[spDeleteOrgAnnouncements] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tags
-- Item: spDeleteTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tags
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteTags]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteTags];
GO

CREATE PROCEDURE [pheedloop].[spDeleteTags]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[Tags]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteTags] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Tags */

GRANT EXECUTE ON [pheedloop].[spDeleteTags] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Tickets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Tickets
-- Item: spDeleteTickets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Tickets
------------------------------------------------------------
IF OBJECT_ID('[pheedloop].[spDeleteTickets]', 'P') IS NOT NULL
    DROP PROCEDURE [pheedloop].[spDeleteTickets];
GO

CREATE PROCEDURE [pheedloop].[spDeleteTickets]
    @code nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [pheedloop].[Tickets]
    WHERE
        [code] = @code


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [code] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @code AS [code] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [pheedloop].[spDeleteTickets] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Tickets */

GRANT EXECUTE ON [pheedloop].[spDeleteTickets] TO [cdp_Developer], [cdp_Integration];

/* Set soft PK for pheedloop.ContactTags.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '82616D42-A86C-4B9A-9867-46DB647CA049' AND [Name] = 'code';

/* Set soft PK for pheedloop.Events.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '36413F26-8A74-487C-B689-A53B0A2C35BD' AND [Name] = 'code';

/* Set soft PK for pheedloop.MemberOrganization.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0A4924A0-2323-4E43-A68A-9E4A58F21B84' AND [Name] = 'code';

/* Set soft PK for pheedloop.Members.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4E6F3A97-AE48-4043-85D3-D41703DF465A' AND [Name] = 'code';

/* Set soft PK for pheedloop.Memberships.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3A56FF55-2571-41F7-98E3-96669C58FDC0' AND [Name] = 'code';

/* Set soft PK for pheedloop.OrgAnnouncements.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1695D65B-5AE8-4B7A-9CD5-2FDDC5E9B16B' AND [Name] = 'code';

/* Set soft PK for pheedloop.Tickets.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D3D79B16-12E9-4C7B-868B-5FE3103280D9' AND [Name] = 'code';

/* Set soft PK for pheedloop.Tags.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND [Name] = 'code';

/* Set soft FK for pheedloop.Tags.event → Events.code */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '36413F26-8A74-487C-B689-A53B0A2C35BD',
                                    [RelatedEntityFieldName] = 'code',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '36D2140D-2A2C-4F9A-A934-F514D80E380D' AND [Name] = 'event';

